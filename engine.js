/* ============================================================
   engine.js — GameState, Rules Engine, Match Controller
   ============================================================ */
(function(global){
  const BENCH_MAX = 5;
  const HAND_START = 7;
  const PRIZES = 6;

  /* ---------- Helpers ---------- */
  function uid(){ return 's_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function cardStage(card){
    if(!card) return null;
    const sub=(card.subtypes||[]).find(s=>/^(basic|stage 1|stage 2)$/i.test(s));
    return sub || card.stage || (/^pok.mon$/i.test(card.supertype||'')?'Basic':null);
  }
  function isEnergyLike(card){ return card && (card.supertype==='Energy' || /energy/i.test(card.name||'')); }
  function energyType(card){ return (card.types&&card.types[0]) || (card.name||'').replace(/\s*Energy/i,'') || 'Colorless'; }
  function findSlot(p, u){ if(p.active&&p.active.uid===u) return p.active; return p.bench.find(s=>s.uid===u)||null; }
  function flipCoin(){ return Math.random() < 0.5 ? 'heads' : 'tails'; }

  /** Generic special-condition detector for real attack/ability text. Covers
      the common phrasing patterns across many real cards — NOT a full parser
      for every card's unique wording (that would need a licensed effects
      database), but a faithful implementation of the generic mechanic itself
      once a condition is identified. */
  function detectStatusFromText(text){
    if(!text) return null;
    const t = text.toLowerCase();
    const needsCoinFlip = /flip a coin/.test(t);
    let condition = null;
    if(/asleep/.test(t)) condition = 'Asleep';
    else if(/paralyzed/.test(t)) condition = 'Paralyzed';
    else if(/confused/.test(t)) condition = 'Confused';
    else if(/poisoned/.test(t)) condition = 'Poisoned';
    else if(/burned/.test(t)) condition = 'Burned';
    if(!condition) return null;
    return { condition, needsCoinFlip };
  }

  /* ---------- Rules Engine ---------- */
  const Rules = {
    canPlayBasic(state, side){ const p=state.players[side]; return !p.active || p.bench.length<BENCH_MAX; },
    canAttachEnergy(state, side){ return !state.players[side].energyAttachedThisTurn; },
    canEvolve(slot, card, state){
      if(!slot||slot.turnPlayed===state.turn) return false;
      const meta=Binder._getMeta(slot.cardId);
      return !!(meta && card.evolvesFrom && card.evolvesFrom.toLowerCase()===meta.name.toLowerCase());
    },
    canRetreat(slot){
      if(!slot) return false;
      const meta=Binder._getMeta(slot.cardId);
      const cost=(meta&&meta.retreatCost||[]).length;
      return slot.energy.length>=cost && !slot.statusConditions.includes('Asleep') && !slot.statusConditions.includes('Paralyzed');
    },
    attackCostMet(slot, attack){
      const cost=attack.cost||[]; const pool=[...slot.energy];
      for(const t of cost.filter(c=>c!=='Colorless')){ const i=pool.findIndex(e=>e.toLowerCase()===t.toLowerCase()); if(i===-1) return false; pool.splice(i,1); }
      return pool.length>=(cost.filter(c=>c==='Colorless').length);
    },
    computeDamage(attack, attackerCard, defenderCard){
      let dmg=parseInt(String(attack.damage||'0').replace(/\D/g,''))||0;
      const weak=(defenderCard.weaknesses||[]).find(w=>attackerCard.types&&attackerCard.types.some(t=>t.toLowerCase()===w.type.toLowerCase()));
      const resist=(defenderCard.resistances||[]).find(r=>attackerCard.types&&attackerCard.types.some(t=>t.toLowerCase()===r.type.toLowerCase()));
      if(weak) dmg=Math.floor(dmg*(parseFloat(weak.value)||2));
      if(resist) dmg=Math.max(0,dmg-(parseInt(String(resist.value||'-30').replace(/\D/g,''))||30));
      return dmg;
    },
    isKO(slot, card){ return slot.damage>=(parseInt(card.hp||'0')); },
    prizesForKO(card){
      const name = card.name || '';
      const subtypes = (card.subtypes || []).join(' ');
      if(/vmax/i.test(name) || /vmax/i.test(subtypes)) return 3;
      if(/\bex\b|\bv\b|\bvstar\b|\bgx\b/i.test(name) || /\bex\b|\bv\b|\bvstar\b|\bgx\b/i.test(subtypes)) return 2;
      return 1;
    },
    checkWinner(state){
      for(const side of ['self','opp']){
        const p=state.players[side]; const other=side==='self'?'opp':'self';
        if(p.prizesRemaining<=0) return other;
        if(!p.active&&p.bench.length===0&&state.turn>1) return other;
        if(p.deck.length===0&&p.mustDrawNext) return other;
      }
      return null;
    }
  };

  /* ---------- Match state ---------- */
  let match=null;

  const Engine = {
    Rules,
    getMatch(){ return match; },

    async startMatch(deckId, opts={}){
      const deck=DeckBuilder.getDeck(deckId);
      if(!deck){ UI.toast('Deck not found','error'); return; }
      const v=DeckBuilder.validate(deck);
      if(!v.valid){ UI.toast('Deck is not ready: '+v.errors[0],'warning'); return; }
      const aiDeck=opts.opponentDeck||pickAiDeck(deck);
      match=buildState(deck, aiDeck, opts);
      Events.emit('MatchStarted',{deckId});
      UI.navigate('match',{title:'Match'});
      log(`Turn 1 — ${match.players.self.name} goes first.`);
      render();
      Persistence.saveMatchSnapshot(Auth.currentUser.id, match);
    },

    resume(snapshot){ match=snapshot; UI.navigate('match',{title:'Match (resumed)'}); render(); if(match.players[match.activeSide].isAI&&!match.winner) setTimeout(()=>AI.takeTurn(Engine),600); },

    async playBasic(cardId, toActive){
      await action(()=>{
        const p=match.players[match.activeSide];
        const idx=p.hand.indexOf(cardId); if(idx===-1) return;
        const card=Binder._getMeta(cardId);
        if(cardStage(card)!=='Basic') return;
        const slot={uid:uid(),cardId,damage:0,energy:[],statusConditions:[],tools:[],turnPlayed:match.turn};
        if(toActive&&!p.active) p.active=slot;
        else if(p.bench.length<BENCH_MAX) p.bench.push(slot);
        else{ UI.toast('Bench is full','warning',1800); return; }
        p.hand.splice(idx,1);
        log(`${p.name} played ${card.name}.`);
      });
    },

    async evolve(handCardId, targetSlotUid){
      await action(()=>{
        const p=match.players[match.activeSide];
        const card=Binder._getMeta(handCardId);
        const slot=findSlot(p,targetSlotUid);
        if(!slot||!Rules.canEvolve(slot,card,match)){ UI.toast('Cannot evolve that Pokémon right now.','warning',2000); return; }
        const idx=p.hand.indexOf(handCardId); if(idx===-1) return;
        p.discard.push(slot.cardId);
        p.hand.splice(idx,1);
        slot.cardId=handCardId; slot.turnPlayed=match.turn;
        log(`${p.name} evolved to ${card.name}!`);
      });
    },

    async attachEnergy(cardId, targetSlotUid){
      await action(()=>{
        const p=match.players[match.activeSide];
        if(!Rules.canAttachEnergy(match,match.activeSide)){ UI.toast('Already attached energy this turn.','warning',2000); return; }
        const idx=p.hand.indexOf(cardId); if(idx===-1) return;
        const card=Binder._getMeta(cardId);
        if(!isEnergyLike(card)) return;
        const slot=findSlot(p,targetSlotUid)||p.active;
        if(!slot) return;
        p.hand.splice(idx,1);
        slot.energy.push(energyType(card));
        p.energyAttachedThisTurn=true;
        log(`${p.name} attached ${energyType(card)} Energy.`);
      });
    },

    async retreat(toBenchUid){
      await action(()=>{
        const p=match.players[match.activeSide];
        if(!p.active){ UI.toast('No active Pokémon to retreat.','warning',1800); return; }
        if(!Rules.canRetreat(p.active)){ UI.toast('Cannot retreat — not enough energy or a status condition prevents it.','warning',2200); return; }
        const bench=findSlot(p,toBenchUid);
        if(!bench) return;
        const meta=Binder._getMeta(p.active.cardId);
        const cost=(meta&&meta.retreatCost||[]).length;
        p.active.energy.splice(0,cost);
        p.bench=p.bench.filter(s=>s.uid!==toBenchUid);
        p.bench.push(p.active);
        p.active=bench;
        log(`${p.name} retreated.`);
      });
    },

    async playTrainer(cardId, targetSlotUid){
      await action(()=>{
        const p=match.players[match.activeSide];
        const idx=p.hand.indexOf(cardId); if(idx===-1) return;
        const card=Binder._getMeta(cardId);
        const subtypes=(card.subtypes||[]).join(' ').toLowerCase();

        if(/stadium/.test(subtypes)){
          if(match.stadium) log(`${Binder._getMeta(match.stadium)?.name||'The old Stadium'} was discarded.`);
          match.stadium = cardId;
          p.hand.splice(idx,1);
          log(`${p.name} played the Stadium ${card.name}.`);
          return;
        }
        if(/supporter/.test(subtypes)){
          if(match.turnFlags.supporterPlayed){ UI.toast('Only one Supporter card per turn.','warning',2200); return; }
          match.turnFlags.supporterPlayed = true;
          p.hand.splice(idx,1); p.discard.push(cardId);
          drawCards(p,1);
          log(`${p.name} played Supporter ${card.name} — drew a card.`);
          return;
        }
        if(/pok.mon tool/i.test(card.subtypes&&card.subtypes.join(' ')||'') || /tool/.test(subtypes)){
          const target=findSlot(p,targetSlotUid)||p.active;
          if(!target){ UI.toast('No Pokémon in play to attach a Tool to.','warning',2000); return; }
          if(target.tools.length>=1){ UI.toast('That Pokémon already has a Tool attached (max 1).','warning',2200); return; }
          p.hand.splice(idx,1);
          target.tools.push(cardId);
          log(`${p.name} attached the Tool ${card.name}.`);
          return;
        }
        // Plain Item card — unique per-card effects aren't individually modeled
        // (that would need a full card-effects database), so Items resolve as
        // a generic card-advantage effect rather than pretending to search/
        // shuffle/etc. exactly per their real text.
        p.hand.splice(idx,1); p.discard.push(cardId);
        drawCards(p,1);
        log(`${p.name} played ${card.name} — drew a card.`);
      });
    },

    async attack(attackIndex){
      await action(async()=>{
        const side=match.activeSide, other=side==='self'?'opp':'self';
        const p=match.players[side], o=match.players[other];
        if(!p.active||!o.active) return;
        if(p.active.statusConditions.includes('Asleep')){ UI.toast(`${p.name}'s Pokémon is Asleep and can't attack.`,'warning',2200); return; }
        if(p.active.statusConditions.includes('Paralyzed')){ UI.toast(`${p.name}'s Pokémon is Paralyzed and can't attack.`,'warning',2200); return; }
        const card=Binder._getMeta(p.active.cardId);
        const atk=(card.attacks||[])[attackIndex];
        if(!atk||!Rules.attackCostMet(p.active,atk)){ UI.toast('Not enough energy for that attack.','warning',2000); return; }

        if(p.active.statusConditions.includes('Confused')){
          const flip=flipCoin();
          log(`${card.name} is Confused — coin flip: ${flip}.`);
          if(flip==='tails'){
            p.active.damage+=30;
            log(`${card.name} hurt itself in confusion for 30 damage! The attack failed.`);
            match.turnFlags.attacked=true;
            if(Rules.isKO(p.active,card)){
              log(`${card.name} was knocked out by confusion damage!`);
              await Animations.knockOut(document.getElementById('self-active'));
              p.discard.push(p.active.cardId);
              p.active=p.bench.shift()||null;
            }
            return;
          }
        }

        const defCard=Binder._getMeta(o.active.cardId);
        const dmg=Rules.computeDamage(atk,card,defCard);
        o.active.damage+=dmg;
        log(`${card.name} used ${atk.name}${dmg?' for '+dmg+' damage':''}.`);
        await Animations.shake(document.getElementById('opp-active'));
        render();

        // Generic special-condition application — detects common real-card
        // phrasing (e.g. "flip a coin, if heads the Defending Pokémon is now
        // Asleep") rather than modeling every card's exact unique text.
        const statusHit=detectStatusFromText(atk.text);
        if(statusHit && !Rules.isKO(o.active,defCard)){
          const applies = !statusHit.needsCoinFlip || flipCoin()==='heads';
          if(statusHit.needsCoinFlip) log(`Coin flip for ${statusHit.condition}: ${applies?'heads':'tails'}.`);
          if(applies){
            o.active.statusConditions = o.active.statusConditions.filter(c => !['Asleep','Paralyzed','Confused'].includes(c));
            o.active.statusConditions.push(statusHit.condition);
            if(statusHit.condition==='Paralyzed') o.active.paralyzedUntilTurn = match.turn + 2;
            log(`${defCard.name} is now ${statusHit.condition}!`);
          }
        }

        if(Rules.isKO(o.active,defCard)){
          log(`${defCard.name} was knocked out!`);
          await Animations.knockOut(document.getElementById('opp-active'));
          o.discard.push(o.active.cardId);
          o.active=o.bench.shift()||null;
          const prizes=Rules.prizesForKO(defCard);
          for(let i=0;i<prizes&&p.prizesRemaining>0;i++){
            p.prizesRemaining--;
            const dot=document.querySelector('.prize-pip:not(.taken)');
            if(dot) await Animations.pulse(dot,'fx-prize',400);
          }
          log(`${p.name} took ${prizes} prize card${prizes>1?'s':''}! (${p.prizesRemaining} remaining)`);
          if(o.active) log(`${o.active ? Binder._getMeta(o.active.cardId)?.name||'?' : '?'} is now the active Pokémon.`);
        }
        match.turnFlags.attacked=true;
      });
      await checkEnd();
    },

    async endTurn(){
      if(match.winner) return;
      await action(()=>{ match.turnFlags={attacked:false}; });
      if(await checkEnd()) return;
      await action(async()=>{ await runPokemonCheckup(); });
      if(await checkEnd()) return;
      switchTurn();
    },

    async concede(){
      match.winner=match.activeSide==='self'?'opp':'self';
      log(`${match.players[match.activeSide==='self'?'self':'opp'].name} conceded.`);
      await finishMatch();
    }
  };

  /** Pokémon Checkup: runs between every turn, for BOTH active Pokémon,
      per official rules — resolves Poison/Burn damage, the Asleep wake-up
      coin flip, and clears expired Paralysis. */
  async function runPokemonCheckup(){
    for(const side of ['self','opp']){
      const p = match.players[side];
      const slot = p.active;
      if(!slot || !slot.statusConditions.length) continue;
      const card = Binder._getMeta(slot.cardId);
      if(!card) continue;

      if(slot.statusConditions.includes('Poisoned')){
        slot.damage += 10;
        log(`${card.name} took 10 Poison damage.`);
      }
      if(slot.statusConditions.includes('Burned')){
        const flip = flipCoin();
        log(`${card.name} is Burned — coin flip: ${flip}.`);
        if(flip==='tails'){ slot.damage += 20; log(`${card.name} took 20 Burn damage.`); }
        else log(`${card.name} shook off the Burn damage this time.`);
      }
      if(slot.statusConditions.includes('Asleep')){
        const flip = flipCoin();
        log(`${card.name} is Asleep — coin flip: ${flip}.`);
        if(flip==='heads'){
          slot.statusConditions = slot.statusConditions.filter(c=>c!=='Asleep');
          log(`${card.name} woke up!`);
        }
      }
      if(slot.statusConditions.includes('Paralyzed') && slot.paralyzedUntilTurn && match.turn >= slot.paralyzedUntilTurn){
        slot.statusConditions = slot.statusConditions.filter(c=>c!=='Paralyzed');
        delete slot.paralyzedUntilTurn;
        log(`${card.name} is no longer Paralyzed.`);
      }

      if(Rules.isKO(slot, card)){
        log(`${card.name} was knocked out by a status condition!`);
        p.discard.push(slot.cardId);
        p.active = p.bench.shift() || null;
        const other = match.players[side==='self'?'opp':'self'];
        const prizes = Rules.prizesForKO(card);
        for(let i=0;i<prizes && other.prizesRemaining>0;i++) other.prizesRemaining--;
        log(`${other.name} took ${prizes} prize card${prizes>1?'s':''} from the status knockout.`);
      }
    }
  }

  function log(msg){ match.log.push(msg); Events.emit('MatchLogged',msg); }
  function drawCards(p,n){ for(let i=0;i<n;i++){ if(!p.deck.length){ p.mustDrawNext=true; return; } p.hand.push(p.deck.shift()); } }

  async function action(fn){
    const r=fn(); if(r instanceof Promise) await r;
    render();
    Persistence.saveMatchSnapshot(Auth.currentUser.id,match);
  }

  async function checkEnd(){
    const w=Rules.checkWinner(match);
    if(w){ match.winner=w; render(); await finishMatch(); return true; }
    return false;
  }

  function switchTurn(){
    match.activeSide=match.activeSide==='self'?'opp':'self';
    match.turn++;
    const p=match.players[match.activeSide];
    p.energyAttachedThisTurn=false; p.mustDrawNext=false;
    drawCards(p,1);
    log(`Turn ${match.turn} — ${p.name}'s turn.`);
    render();
    Persistence.saveMatchSnapshot(Auth.currentUser.id,match);
    if(p.isAI&&!match.winner) setTimeout(()=>AI.takeTurn(Engine),600);
  }

  async function finishMatch(){
    Persistence.clearMatchSnapshot(Auth.currentUser.id);
    const won=match.winner==='self';
    const d=Persistence.getUserData(Auth.currentUser.id);
    d.statistics.matchesPlayed=(d.statistics.matchesPlayed||0)+1;
    if(won) d.statistics.matchesWon=(d.statistics.matchesWon||0)+1;
    else d.statistics.matchesLost=(d.statistics.matchesLost||0)+1;
    const deck=d.decks[match.deckId];
    if(deck){ deck.stats.played++; if(won) deck.stats.won++; else deck.stats.lost++; }
    Persistence.saveUserData(Auth.currentUser.id,d);
    Events.emit('MatchFinished',{won,tournamentId:match.tournamentId});
    const title=won?'🏆 Victory!':'Defeat';
    const body=won?`You claimed all your prize cards. ${match.tournamentId?'Advancing in the tournament…':'Well played!'}`:`${match.players.opp.name} won this time. ${match.tournamentId?'You\'ve been eliminated.':'Try again!'}`;
    if(won){
      Economy.grant(20,'Match Reward', match.tournamentId ? 'tournament-round' : 'quick-match', match.tournamentId ? 'Round win bonus' : 'Match win bonus');
      UI.toast('You won! +NZ$20.00 bonus','success');
    }
    render();
    await UI.dialog({ title, body, actions:[{label:match.tournamentId?'Continue Tournament':'Back to Home',variant:'primary',value:true}] });
    if(match.tournamentId) global.Tournament&&Tournament.reportMatchResult(match.tournamentId,match.matchId,won);
    else UI.navigate('home');
  }

  function buildState(deck, aiDeck, opts){
    const selfList=expand(deck), oppList=expand(aiDeck);
    return {
      turn:1, activeSide:'self', winner:null, log:[], turnFlags:{attacked:false},
      deckId:deck.id, tournamentId:opts.tournamentId||null, matchId:opts.matchId||null,
      players:{
        self:makePlayer(Auth.currentUser.nickname||'You',selfList,false),
        opp:makePlayer(opts.opponentName||'AI Trainer',oppList,true)
      }
    };
  }
  function makePlayer(name,list,isAI){
    let shuffled, hand, deck;
    let attempts = 0;
    // User-requested rule: at least 2 Basic Pokémon in the opening hand
    // (stricter than the official minimum of 1) — reshuffle until met.
    do{
      shuffled = shuffle([...list]);
      hand = shuffled.slice(0, HAND_START);
      deck = shuffled.slice(HAND_START);
      attempts++;
    } while(attempts < 12 && hand.filter(id => { const c = Binder._getMeta(id); return c && cardStage(c) === 'Basic'; }).length < 2);
    return { name, isAI, deck, hand, discard:[], active:null, bench:[], prizesRemaining:PRIZES, energyAttachedThisTurn:false, mustDrawNext:false };
  }
  function expand(deck){ const l=[]; Object.entries(deck.cards).forEach(([id,q])=>{ for(let i=0;i<q;i++) l.push(id); }); return l; }
  function pickAiDeck(playerDeck){ return DeckBuilder.getDecks().find(d=>d.isStarter&&d.id!==playerDeck.id)||DeckBuilder.getDecks()[0]||playerDeck; }
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

  /* ---------- Match page rendering ---------- */
  let selectedHandCard=null;

  function render(){
    const container=document.getElementById('page-match');
    if(!container||!container.classList.contains('active')) return;
    if(!match){ container.innerHTML=''; container.appendChild(UI.emptyState({title:'No active match',body:'Start one from Play.',actionLabel:'Go to Play',onAction:()=>UI.navigate('play')})); return; }
    const self=match.players.self, opp=match.players.opp;
    const myTurn=match.activeSide==='self'&&!match.winner;

    container.innerHTML=`
      <div class="match-board">
        <div class="match-hud">
          <span class="turn-indicator">Turn ${match.turn}</span>
          <span style="font-size:11px;color:var(--text-dim);">${match.players[match.activeSide].name}'s turn</span>
          <div class="prize-pips" title="Opponent's prizes remaining">
            ${Array.from({length:PRIZES},(_,i)=>`<span class="prize-pip ${i<(PRIZES-opp.prizesRemaining)?'taken':''}"></span>`).join('')}
          </div>
        </div>

        <div class="opp-hand-strip">
          <div class="opp-hand-fan" id="opp-hand-fan"></div>
          <div class="opp-stat-line">${UI.escapeHtml(opp.name)} — Deck ${opp.deck.length} · Hand ${opp.hand.length} · Prizes ${opp.prizesRemaining}</div>
        </div>

        <div class="battle-row">
          <div class="zone-col outer-col">
            <div class="pile-box" id="opp-draw-pile" title="Opponent Draw Pile"><span class="pile-ic">🂠</span><span class="pile-label">Draw</span><span class="pile-count">${opp.deck.length}</span></div>
            <div class="pile-box discard" id="opp-discard-pile" title="Opponent Discard Pile — tap to view"><span class="pile-ic">🗑</span><span class="pile-label">Discard</span><span class="pile-count">${opp.discard.length}</span></div>
          </div>

          <div class="zone-col bench-col">
            <div class="side-label">Opponent Bench</div>
            <div class="bench-row" id="opp-bench"></div>
          </div>

          <div class="zone-col prize-col">
            <div class="side-label">Your Prizes</div>
            <div class="prize-stack" id="prize-stack"></div>
          </div>

          <div class="zone-col active-col">
            <div class="slot active-slot" id="opp-active"></div>
            <div class="vs-divider">VS</div>
            <div class="slot active-slot" id="self-active"></div>
          </div>

          <div class="zone-col stadium-col">
            <div class="side-label">Stadium</div>
            <div class="stadium-box" id="stadium-box"></div>
          </div>

          <div class="zone-col bench-col">
            <div class="side-label">Your Bench</div>
            <div class="bench-row" id="self-bench"></div>
          </div>

          <div class="zone-col outer-col">
            <div class="pile-box" id="self-draw-pile" title="Your Draw Pile"><span class="pile-ic">🂠</span><span class="pile-label">Draw</span><span class="pile-count">${self.deck.length}</span></div>
            <div class="pile-box discard" id="self-discard-pile" title="Your Discard Pile — tap to view"><span class="pile-ic">🗑</span><span class="pile-label">Discard</span><span class="pile-count">${self.discard.length}</span></div>
          </div>
        </div>

        <div class="match-actions" id="match-actions"></div>
        ${selectedHandCard ? `<div class="match-hint" id="match-hint"></div>` : ''}
        <div class="match-log" id="match-log">${match.log.slice(-5).map(m=>`<div>${UI.escapeHtml(m)}</div>`).join('')}</div>

        ${match.winner ? `<div class="alert-banner ${match.winner==='self'?'success':'error'}" style="text-align:center;font-size:15px;font-weight:700;">${match.winner==='self'?'🏆 You win!':'💀 Opponent wins'}</div>` : ''}

        <div class="hand-strip">
          <div class="hand-row" id="self-hand"></div>
        </div>
      </div>`;

    renderOppHandFan(opp);
    renderSlot('opp-active', opp.active, false);
    renderSlot('self-active', self.active, true);
    renderBench('opp-bench', opp.bench, false);
    renderBench('self-bench', self.bench, true);
    renderPrizeStack(self);
    renderStadiumBox();
    renderHand(self, myTurn);
    renderActions(self, myTurn);
    document.getElementById('opp-discard-pile').onclick = () => showDiscardDialog(opp);
    document.getElementById('self-discard-pile').onclick = () => showDiscardDialog(self);
    const log=container.querySelector('#match-log');
    if(log) log.scrollTop=log.scrollHeight;
  }

  function renderOppHandFan(opp){
    const el = document.getElementById('opp-hand-fan'); if(!el) return;
    el.innerHTML = '';
    const count = Math.min(opp.hand.length, 10);
    for(let i=0;i<count;i++){
      const back = document.createElement('div');
      back.className = 'card-back-mini';
      el.appendChild(back);
    }
  }

  function renderPrizeStack(self){
    const el = document.getElementById('prize-stack'); if(!el) return;
    el.innerHTML = '';
    for(let i=0;i<PRIZES;i++){
      const c = document.createElement('div');
      c.className = 'prize-card-mini' + (i < (PRIZES-self.prizesRemaining) ? ' taken' : '');
      el.appendChild(c);
    }
  }

  function renderStadiumBox(){
    const el = document.getElementById('stadium-box'); if(!el) return;
    if(!match.stadium){ el.className = 'stadium-box empty'; el.innerHTML = '<span class="stadium-ic">⛩</span>'; return; }
    const card = Binder._getMeta(match.stadium);
    el.className = 'stadium-box filled';
    el.innerHTML = card ? `<img src="${UI.escapeHtml(UI.cardImg(card))}" alt="${UI.escapeHtml(card.name)}" onerror="this.style.opacity=0.1" title="${UI.escapeHtml(card.name)}">` : '';
  }

  async function showDiscardDialog(player){
    if(!player.discard.length){ UI.toast('Discard pile is empty.', 'info', 1600); return; }
    const counts = {};
    player.discard.forEach(id => {
      const card = Binder._getMeta(id);
      const name = card ? card.name : id;
      counts[name] = (counts[name]||0) + 1;
    });
    const body = document.createElement('div');
    body.style.cssText = 'max-height:320px; overflow-y:auto; font-size:13px; color:var(--text-dim); line-height:2;';
    body.innerHTML = Object.entries(counts).map(([name,qty]) => `<div>${UI.escapeHtml(name)} <span class="text-faint">×${qty}</span></div>`).join('');
    await UI.dialog({ title:`${player.name}'s Discard Pile (${player.discard.length})`, body, actions:[{label:'Close',variant:'primary',value:true}] });
  }

  function renderSlot(id, slot, mine){
    const el=document.getElementById(id); if(!el) return;
    if(!slot){ el.className='slot active-slot'+(mine?' empty-hint':''); el.innerHTML=''; return; }
    const card=Binder._getMeta(slot.cardId);
    el.className='slot active-slot filled'+(mine&&selectedHandCard?' selectable':'');
    el.innerHTML=`<img src="${UI.escapeHtml(UI.cardImg(card))}" alt="${UI.escapeHtml(card?card.name:'')}" onerror="this.style.opacity=0.1">
      ${slot.damage?`<span class="dmg-counter">${slot.damage}dmg</span>`:''}
      ${slot.energy.length?`<div class="energy-pips">${slot.energy.map(e=>`<span class="energy-pip" style="background:var(--t-${e.toLowerCase()},var(--t-colorless));" title="${e}"></span>`).join('')}</div>`:''}
      ${statusBadges(slot)}
      ${slot.tools.length?`<span class="tool-badge" title="Tool attached">🔧</span>`:''}`;
    if(mine) el.onclick=()=>onActiveClick(slot,mine);
  }

  const STATUS_ICONS = { Asleep:'😴', Paralyzed:'⚡', Confused:'❓', Poisoned:'☠', Burned:'🔥' };
  function statusBadges(slot){
    if(!slot.statusConditions || !slot.statusConditions.length) return '';
    return `<div class="status-badges">${slot.statusConditions.map(c=>`<span class="status-badge" title="${c}">${STATUS_ICONS[c]||'?'}</span>`).join('')}</div>`;
  }

  function renderBench(id, bench, mine){
    const el=document.getElementById(id); if(!el) return; el.innerHTML='';
    for(let i=0;i<BENCH_MAX;i++){
      const slot=bench[i]; const s=document.createElement('div');
      s.className='slot'+(slot?' filled':'')+(mine&&selectedHandCard&&slot?' selectable':'');
      if(slot){
        const card=Binder._getMeta(slot.cardId);
        s.innerHTML=`<img src="${UI.escapeHtml(UI.cardImg(card))}" onerror="this.style.opacity=0.1">
          ${slot.damage?`<span class="dmg-counter">${slot.damage}dmg</span>`:''}
          ${slot.energy.length?`<div class="energy-pips">${slot.energy.map(e=>`<span class="energy-pip" style="background:var(--t-${e.toLowerCase()},var(--t-colorless));"></span>`).join('')}</div>`:''}
          ${statusBadges(slot)}
          ${slot.tools.length?`<span class="tool-badge" title="Tool attached">🔧</span>`:''}`;
        if(mine) s.onclick=()=>onBenchClick(slot);
      }
      el.appendChild(s);
    }
  }

  function renderHand(self, myTurn){
    const row=document.getElementById('self-hand'); if(!row) return; row.innerHTML='';
    self.hand.forEach(cardId=>{
      const card=Binder._getMeta(cardId); if(!card) return;
      const el=document.createElement('div');
      el.className='hand-card'+(selectedHandCard===cardId?' selected':'');
      el.innerHTML=`<img src="${UI.escapeHtml(UI.cardImg(card))}" alt="${UI.escapeHtml(card.name)}" onerror="this.style.opacity=0.1" title="${UI.escapeHtml(card.name)}">`;
      el.onclick=()=>{ if(!myTurn) return; selectedHandCard=selectedHandCard===cardId?null:cardId; render(); };
      row.appendChild(el);
    });
  }

  function renderActions(self, myTurn){
    const bar=document.getElementById('match-actions'); if(!bar) return; bar.innerHTML='';
    const hint=document.getElementById('match-hint');
    if(!myTurn){
      bar.innerHTML=`<span class="text-dim" style="font-size:12.5px;">Waiting for ${UI.escapeHtml(match.players.opp.name)}…</span>`;
      return;
    }
    if(selectedHandCard){
      const card=Binder._getMeta(selectedHandCard);
      if(cardStage(card)==='Basic'&&/^pok.mon$/i.test(card.supertype||'')){
        addBtn(bar,`Play ${card.name} to ${!self.active?'Active':'Bench'}`,()=>{ Engine.playBasic(selectedHandCard,!self.active); selectedHandCard=null; });
      } else if(card.evolvesFrom){
        if(hint) hint.textContent=`Tap a ${card.evolvesFrom} in play to evolve into ${card.name}.`;
      } else if(isEnergyLike(card)){
        if(hint) hint.textContent=`Tap a Pokémon in play to attach ${energyType(card)} Energy.`;
      } else {
        addBtn(bar,`Play ${card.name}`,()=>{ Engine.playTrainer(selectedHandCard); selectedHandCard=null; });
      }
      addBtn(bar,'Cancel',()=>{ selectedHandCard=null; render(); },'btn-ghost');
    } else {
      if(self.active&&!match.turnFlags.attacked){
        const card=Binder._getMeta(self.active.cardId);
        (card.attacks||[]).forEach((atk,i)=>{
          const usable=Rules.attackCostMet(self.active,atk);
          addBtn(bar,`${atk.name} (${atk.damage||0})`,()=>Engine.attack(i),!usable,'btn-primary');
        });
      }
      addBtn(bar,'End Turn',()=>Engine.endTurn(),'',true);
      addBtn(bar,'Concede',()=>UI.confirmDialog('Concede?','This counts as a loss.','Concede',true).then(ok=>ok&&Engine.concede()),'btn-ghost');
    }
  }

  function addBtn(bar, label, onClick, disabled, variant){
    const b=document.createElement('button');
    b.className='btn '+(typeof disabled==='string'?disabled:variant||'btn-secondary')+' btn-sm';
    b.textContent=label;
    b.disabled=disabled===true;
    b.onclick=onClick;
    bar.appendChild(b);
  }

  function onActiveClick(slot, mine){
    if(!mine||!selectedHandCard) return;
    const card=Binder._getMeta(selectedHandCard);
    if(card.evolvesFrom) Engine.evolve(selectedHandCard,slot.uid);
    else if(isEnergyLike(card)) Engine.attachEnergy(selectedHandCard,slot.uid);
    selectedHandCard=null;
  }
  function onBenchClick(slot){
    if(!selectedHandCard){ Engine.retreat(slot.uid); return; }
    const card=Binder._getMeta(selectedHandCard);
    if(card.evolvesFrom) Engine.evolve(selectedHandCard,slot.uid);
    else if(isEnergyLike(card)) Engine.attachEnergy(selectedHandCard,slot.uid);
    selectedHandCard=null;
  }

  UI.registerPage('match', container=>{ render(); });
  global.Engine=Engine;
})(window);
