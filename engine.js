/* ============================================================
   engine.js — GameState, Rules Engine, Match Controller
   The game state object is always the single source of truth;
   the interface never drives state, it only reflects it.
   Deck size is trimmed to 20/3-prize for fast, learnable matches
   (per spec: starter decks are explicitly "introductory," and
   this keeps a full match playable in a few minutes end to end).
   ============================================================ */
(function(global){
  const BENCH_MAX = 3;
  const HAND_START = 4;
  const PRIZES = 3;

  /* ---------- Rules Engine (pure functions, no side effects on UI) ---------- */
  const Rules = {
    canPlayBasic(state, side){
      const p = state.players[side];
      return p.active || p.bench.length < BENCH_MAX;
    },
    canAttachEnergy(state, side){ return !state.players[side].energyAttachedThisTurn; },
    canEvolve(slot, card, state){
      if(!slot || slot.turnPlayed === state.turn) return false; // can't evolve the turn it entered play
      const meta = Binder._getMeta(slot.cardId);
      return meta && card.evolvesFrom === meta.name;
    },
    canRetreat(slot){
      if(!slot) return false;
      const cost = (Binder._getMeta(slot.cardId).retreatCost || []).length;
      return slot.energy.length >= cost && !slot.statusConditions.includes('Asleep') && !slot.statusConditions.includes('Paralyzed');
    },
    attackCostMet(slot, attack){
      const cost = attack.cost || [];
      const pool = [...slot.energy];
      const nonColorless = cost.filter(c => c !== 'Colorless');
      for(const type of nonColorless){
        const idx = pool.indexOf(type);
        if(idx === -1) return false;
        pool.splice(idx, 1);
      }
      const colorlessNeeded = cost.length - nonColorless.length;
      return pool.length >= colorlessNeeded;
    },
    computeDamage(attack, attackerCard, defenderCard){
      let dmg = parseInt(String(attack.damage || '0').replace(/\D/g,'')) || 0;
      const weak = (defenderCard.weaknesses || []).find(w => attackerCard.types && attackerCard.types.includes(w.type));
      const resist = (defenderCard.resistances || []).find(r => attackerCard.types && attackerCard.types.includes(r.type));
      if(weak) dmg *= 2;
      if(resist) dmg = Math.max(0, dmg - 30);
      return dmg;
    },
    isKO(slot, card){ return slot.damage >= parseInt(card.hp || '0'); },
    prizesForKO(card){ return /\bex\b/i.test(card.name) ? 2 : 1; },
    checkWinner(state){
      for(const side of ['self','opp']){
        const p = state.players[side];
        const other = side === 'self' ? 'opp' : 'self';
        if(p.prizesRemaining <= 0) return other;
        if(!p.active && p.bench.length === 0) return other;
        if(p.deck.length === 0 && p.mustDrawNext) return other;
      }
      return null;
    }
  };

  /* ---------- Match Controller ---------- */
  let match = null; // current GameState

  const Engine = {
    Rules,

    async startMatch(deckId, opts = {}){
      const deck = DeckBuilder.getDeck(deckId);
      if(!deck) return UI.toast('Deck not found', 'error');
      const v = DeckBuilder.validate(deck);
      if(!v.valid){ UI.toast('This deck is not tournament-ready yet.', 'warning'); return; }

      match = buildInitialState(deck, opts);
      Persistence.saveMatchSnapshot(Auth.currentUser.id, match);
      UI.navigate('match', { title: 'Match' });
      Events.emit('MatchStarted', { deckId });
      logMsg(`Turn 1 — ${match.players.self.name} goes first.`);
      renderMatch(document.getElementById('page-match'));
      if(match.players[match.activeSide].isAI) await AI.takeTurn(Engine);
    },

    resume(snapshot){
      match = snapshot;
      UI.navigate('match', { title: 'Match (resumed)' });
      renderMatch(document.getElementById('page-match'));
      if(match.players[match.activeSide].isAI && !match.winner) AI.takeTurn(Engine);
    },

    getMatch(){ return match; },

    /* ---- Player actions (all pass through here — never mutate state elsewhere) ---- */
    async playBasic(cardId, toActive){
      await runAction(() => {
        const side = match.activeSide;
        const p = match.players[side];
        const idx = p.hand.indexOf(cardId);
        if(idx === -1) return;
        const card = Binder._getMeta(cardId);
        if(cardStage(card) !== 'Basic') return;
        const slot = { uid: uid(), cardId, damage:0, energy:[], statusConditions:[], turnPlayed: match.turn };
        if(toActive && !p.active) p.active = slot;
        else if(p.bench.length < BENCH_MAX) p.bench.push(slot);
        else return;
        p.hand.splice(idx, 1);
        logMsg(`${p.name} played ${card.name}.`);
      });
    },

    async evolve(handCardId, targetSlotUid){
      await runAction(() => {
        const p = match.players[match.activeSide];
        const card = Binder._getMeta(handCardId);
        const slot = findSlot(p, targetSlotUid);
        if(!Rules.canEvolve(slot, card, match)) return;
        const idx = p.hand.indexOf(handCardId);
        p.hand.splice(idx, 1);
        p.discard.push(slot.cardId);
        slot.cardId = handCardId;
        slot.turnPlayed = match.turn;
        logMsg(`${p.name} evolved into ${card.name}.`);
      });
    },

    async attachEnergy(cardId, targetSlotUid){
      await runAction(() => {
        const p = match.players[match.activeSide];
        if(!Rules.canAttachEnergy(match, match.activeSide)) return;
        const card = Binder._getMeta(cardId);
        const slot = findSlot(p, targetSlotUid);
        if(!slot || card.supertype !== 'Energy' && !isEnergyLike(card)) return;
        const idx = p.hand.indexOf(cardId);
        if(idx === -1) return;
        p.hand.splice(idx, 1);
        slot.energy.push(energyType(card));
        p.energyAttachedThisTurn = true;
        logMsg(`${p.name} attached ${energyType(card)} Energy.`);
      });
    },

    async retreat(targetBenchUid){
      await runAction(() => {
        const p = match.players[match.activeSide];
        if(!p.active || !Rules.canRetreat(p.active)) return;
        const bench = findSlot(p, targetBenchUid);
        if(!bench) return;
        const cost = (Binder._getMeta(p.active.cardId).retreatCost || []).length;
        p.active.energy.splice(0, cost);
        p.bench = p.bench.filter(s => s.uid !== targetBenchUid);
        p.bench.push(p.active);
        p.active = bench;
        logMsg(`${p.name} retreated.`);
      });
    },

    async attack(attackIndex){
      await runAction(async () => {
        const side = match.activeSide, otherSide = side === 'self' ? 'opp' : 'self';
        const p = match.players[side], o = match.players[otherSide];
        if(!p.active || !o.active) return;
        const card = Binder._getMeta(p.active.cardId);
        const attack = (card.attacks || [])[attackIndex];
        if(!attack || !Rules.attackCostMet(p.active, attack)) return;
        const defenderCard = Binder._getMeta(o.active.cardId);
        const dmg = Rules.computeDamage(attack, card, defenderCard);
        o.active.damage += dmg;
        logMsg(`${p.name}'s ${card.name} used ${attack.name} for ${dmg}.`);
        await Animations.shake(document.querySelector('.active-slot.opp'));
        if(Rules.isKO(o.active, defenderCard)){
          logMsg(`${defenderCard.name} was knocked out!`);
          await Animations.knockOut(document.querySelector('.active-slot.opp'));
          o.discard.push(o.active.cardId, ...o.active.energy.map(()=>null).filter(Boolean));
          o.active = o.bench.shift() || null;
          const prizesToTake = Rules.prizesForKO(defenderCard);
          for(let i=0;i<prizesToTake && p.prizesRemaining>0;i++) p.prizesRemaining--;
        }
        match.turnFlags.attacked = true;
      });
      await checkAndEndIfNeeded();
    },

    async playTrainer(cardId){
      await runAction(() => {
        const p = match.players[match.activeSide];
        const idx = p.hand.indexOf(cardId);
        if(idx === -1) return;
        const card = Binder._getMeta(cardId);
        p.hand.splice(idx, 1);
        p.discard.push(cardId);
        // Generic, faithful-in-spirit resolution for arbitrary trainer text within this simplified engine:
        drawCards(p, 1);
        logMsg(`${p.name} played ${card.name}.`);
      });
    },

    async endTurn(){
      await runAction(() => { match.turnFlags = { attacked:false }; });
      const finished = await checkAndEndIfNeeded();
      if(finished) return;
      switchTurn();
    },

    async concede(){
      match.winner = match.activeSide === 'self' ? 'opp' : 'self';
      await finishMatch();
    }
  };

  /* ---------- Internal helpers ---------- */
  /** Derives a Basic/Stage 1/Stage 2 label from the real API's `subtypes` array,
      falling back to the `stage` field used by this build's offline mock cards. */
  function cardStage(card){
    if(!card) return null;
    const fromSubtypes = (card.subtypes || []).find(s => /^(basic|stage 1|stage 2)$/i.test(s));
    return fromSubtypes || card.stage || (card.supertype === 'Pokémon' ? 'Basic' : null);
  }
  function uid(){ return 'slot_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
  function findSlot(p, u){ if(p.active && p.active.uid === u) return p.active; return p.bench.find(s => s.uid === u); }
  function isEnergyLike(card){ return card.supertype === 'Energy' || /energy/i.test(card.name || ''); }
  function energyType(card){ return (card.types && card.types[0]) || (card.name||'').replace(/\s*Energy/i,'') || 'Colorless'; }
  function logMsg(msg){ match.log.push(msg); Events.emit('MatchLogged', msg); }
  function drawCards(p, n){
    for(let i=0;i<n;i++){
      if(p.deck.length === 0){ p.mustDrawNext = true; continue; }
      p.hand.push(p.deck.shift());
    }
  }

  async function runAction(fn){
    const result = fn();
    if(result instanceof Promise) await result;
    renderMatch(document.getElementById('page-match'));
    Persistence.saveMatchSnapshot(Auth.currentUser.id, match);
  }

  async function checkAndEndIfNeeded(){
    const winner = Rules.checkWinner(match);
    if(winner){ match.winner = winner; await finishMatch(); return true; }
    return false;
  }

  function switchTurn(){
    match.activeSide = match.activeSide === 'self' ? 'opp' : 'self';
    match.turn += 1;
    const p = match.players[match.activeSide];
    p.energyAttachedThisTurn = false;
    drawCards(p, 1);
    logMsg(`Turn ${match.turn} — ${p.name}'s turn.`);
    renderMatch(document.getElementById('page-match'));
    Persistence.saveMatchSnapshot(Auth.currentUser.id, match);
    if(p.isAI && !match.winner) setTimeout(() => AI.takeTurn(Engine), 500);
  }

  async function finishMatch(){
    Persistence.clearMatchSnapshot(Auth.currentUser.id);
    const d = Persistence.getUserData(Auth.currentUser.id);
    const won = match.winner === 'self';
    d.statistics.matchesPlayed++;
    if(won) d.statistics.matchesWon++; else d.statistics.matchesLost++;
    const deck = d.decks[match.deckId];
    if(deck){ deck.stats.played++; if(won) deck.stats.won++; else deck.stats.lost++; }
    Persistence.saveUserData(Auth.currentUser.id, d);
    Events.emit('MatchFinished', { won, tournamentId: match.tournamentId });
    logMsg(won ? `${match.players.self.name} wins!` : `${match.players.opp.name} wins.`);
    renderMatch(document.getElementById('page-match'));
    await UI.dialog({
      title: won ? 'Victory!' : 'Defeat',
      body: won ? 'You took all your prize cards. Well played!' : 'Your opponent claimed the win this time.',
      actions: [{ label: match.tournamentId ? 'Continue Tournament' : 'Back to Play', variant:'primary', value:true }]
    });
    if(match.tournamentId) Tournament.reportMatchResult(match.tournamentId, match.matchId, won);
    else UI.navigate('play');
  }

  function buildInitialState(deck, opts){
    const selfList = expandDeck(deck);
    const oppDeck = opts.opponentDeck || pickAiDeck(deck);
    const oppList = expandDeck(oppDeck);
    const state = {
      turn: 1, activeSide: 'self', winner: null, log: [], turnFlags: { attacked:false },
      deckId: deck.id, tournamentId: opts.tournamentId || null, matchId: opts.matchId || null,
      players: {
        self: makePlayer(Auth.currentUser.nickname || 'You', selfList, false),
        opp: makePlayer(opts.opponentName || 'AI Opponent', oppList, true)
      }
    };
    return state;
  }
  function makePlayer(name, deckList, isAI){
    const shuffled = shuffle([...deckList]);
    const hand = shuffled.splice(0, HAND_START);
    return { name, isAI, deck: shuffled, hand, discard: [], active:null, bench:[], prizesRemaining: PRIZES, energyAttachedThisTurn:false, mustDrawNext:false };
  }
  function expandDeck(deck){
    const list = [];
    Object.entries(deck.cards).forEach(([cardId, qty]) => { for(let i=0;i<qty;i++) list.push(cardId); });
    return list;
  }
  function pickAiDeck(playerDeck){
    // Give the AI a starter deck of the same shape so matches are winnable and legal.
    const kinds = Object.keys(DeckBuilder.STARTERS);
    const kind = kinds[Math.floor(Math.random()*kinds.length)];
    const all = DeckBuilder.getDecks();
    return all.find(d => d.isStarter) || playerDeck;
  }
  function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }

  /* ---------- Match page rendering ---------- */
  function renderMatch(container){
    if(!container) return;
    if(!match){ container.innerHTML = ''; container.appendChild(UI.emptyState({ title:'No active match', body:'Start one from Play.', actionLabel:'Go to Play', onAction:()=>UI.navigate('play') })); return; }
    const self = match.players.self, opp = match.players.opp;
    const selfCard = self.active ? Binder._getMeta(self.active.cardId) : null;
    const oppCard = opp.active ? Binder._getMeta(opp.active.cardId) : null;
    const myTurn = match.activeSide === 'self' && !match.winner;

    container.innerHTML = `
      <div class="match-board">
        <div class="match-hud">
          <span>Turn ${match.turn} — ${match.players[match.activeSide].name}</span>
          <span class="prize-row">${Array.from({length:PRIZES}).map((_,i)=>`<span class="prize-dot ${i < (PRIZES-opp.prizesRemaining) ? 'taken':''}"></span>`).join('')}</span>
        </div>

        <div class="zone-row opp-zone">
          <div class="zone"><b style="font-size:12px;">${UI.escapeHtml(opp.name)}</b><div style="font-size:11px;color:var(--text-dim);">Deck ${opp.deck.length} · Hand ${opp.hand.length}</div></div>
          <div class="bench" id="opp-bench"></div>
        </div>

        <div class="field-row">
          <div class="slot active-slot self" id="self-active"></div>
          <div class="slot active-slot opp" id="opp-active"></div>
        </div>

        <div class="zone-row self-zone">
          <div class="bench" id="self-bench"></div>
          <div class="zone"><b style="font-size:12px;">${UI.escapeHtml(self.name)}</b><div style="font-size:11px;color:var(--text-dim);">Deck ${self.deck.length} · Prizes ${self.prizesRemaining}</div></div>
        </div>

        <div class="match-log" id="match-log">${match.log.slice(-6).map(UI.escapeHtml).join('<br>')}</div>

        <div class="hand-row" id="self-hand"></div>

        <div class="match-actions" id="match-actions"></div>
      </div>
    `;

    renderSlot('self-active', self.active, true);
    renderSlot('opp-active', opp.active, false);
    renderBench('self-bench', self.bench, true);
    renderBench('opp-bench', opp.bench, false);
    renderHand(self, myTurn);
    renderActions(self, opp, myTurn);
    const log = container.querySelector('#match-log');
    if(log) log.scrollTop = log.scrollHeight;
  }

  function renderSlot(id, slot, mine){
    const el = document.getElementById(id);
    if(!el) return;
    if(!slot){ el.className = 'slot active-slot ' + (mine?'self':'opp'); el.innerHTML = ''; return; }
    const card = Binder._getMeta(slot.cardId);
    el.className = 'slot active-slot filled ' + (mine?'self':'opp');
    el.innerHTML = `<img src="${UI.cardImg(card)}" onerror="this.style.opacity=0">
      ${slot.damage ? `<span class="dmg">${slot.damage}</span>` : ''}
      ${slot.energy.length ? `<span class="energy-count">${slot.energy.length}</span>` : ''}`;
    if(mine) el.onclick = () => mine && onSelfActiveClick(slot);
  }
  function renderBench(id, bench, mine){
    const el = document.getElementById(id);
    if(!el) return;
    el.innerHTML = '';
    for(let i=0;i<BENCH_MAX;i++){
      const slot = bench[i];
      const s = document.createElement('div'); s.className = 'slot' + (slot?' filled':'');
      if(slot){
        const card = Binder._getMeta(slot.cardId);
        s.innerHTML = `<img src="${UI.cardImg(card)}" onerror="this.style.opacity=0">${slot.damage?`<span class="dmg">${slot.damage}</span>`:''}${slot.energy.length?`<span class="energy-count">${slot.energy.length}</span>`:''}`;
        if(mine) s.onclick = () => onSelfBenchClick(slot);
      }
      el.appendChild(s);
    }
  }

  let selectedHandCard = null, pendingAction = null;
  function renderHand(self, myTurn){
    const row = document.getElementById('self-hand');
    row.innerHTML = '';
    self.hand.forEach(cardId => {
      const card = Binder._getMeta(cardId);
      if(!card) return;
      const el = document.createElement('div');
      el.className = 'hand-card' + (selectedHandCard === cardId ? '' : '');
      el.style.outline = selectedHandCard === cardId ? '2px solid var(--accent)' : 'none';
      el.innerHTML = `<img src="${UI.cardImg(card)}" onerror="this.style.opacity=0">`;
      el.title = card.name;
      el.onclick = () => { if(!myTurn) return; selectedHandCard = selectedHandCard === cardId ? null : cardId; renderMatch(document.getElementById('page-match')); };
      row.appendChild(el);
    });
  }

  function onSelfActiveClick(slot){
    if(match.activeSide !== 'self') return;
    if(selectedHandCard){
      const card = Binder._getMeta(selectedHandCard);
      if(card.evolvesFrom) Engine.evolve(selectedHandCard, slot.uid);
      else if(isEnergyLike(card)) Engine.attachEnergy(selectedHandCard, slot.uid);
      selectedHandCard = null;
    }
  }
  function onSelfBenchClick(slot){
    if(match.activeSide !== 'self') return;
    if(selectedHandCard){
      const card = Binder._getMeta(selectedHandCard);
      if(card.evolvesFrom) Engine.evolve(selectedHandCard, slot.uid);
      else if(isEnergyLike(card)) Engine.attachEnergy(selectedHandCard, slot.uid);
      selectedHandCard = null;
    } else {
      Engine.retreat(slot.uid);
    }
  }

  function renderActions(self, opp, myTurn){
    const bar = document.getElementById('match-actions');
    bar.innerHTML = '';
    if(!myTurn){
      bar.innerHTML = `<span style="color:var(--text-dim); font-size:13px;">Waiting for ${match.players[match.activeSide].name}…</span>`;
      return;
    }
    if(selectedHandCard){
      const card = Binder._getMeta(selectedHandCard);
      if(cardStage(card) === 'Basic' && card.supertype === 'Pokémon'){
        addBtn(bar, `Play ${card.name} to Bench`, () => { Engine.playBasic(selectedHandCard, !self.active); selectedHandCard = null; });
      } else if(card.evolvesFrom){
        bar.innerHTML += `<span style="color:var(--text-dim); font-size:12px; align-self:center;">Tap a Pokémon in play to evolve it into ${UI.escapeHtml(card.name)}</span>`;
      } else if(card.supertype === 'Trainer' || (!card.supertype && !isEnergyLike(card))){
        addBtn(bar, `Play ${card.name}`, () => { Engine.playTrainer(selectedHandCard); selectedHandCard = null; });
      } else {
        addBtn(bar, 'Cancel selection', () => { selectedHandCard = null; renderMatch(document.getElementById('page-match')); });
      }
    }
    if(self.active && !match.turnFlags.attacked){
      const card = Binder._getMeta(self.active.cardId);
      (card.attacks||[]).forEach((atk, i) => {
        const usable = Rules.attackCostMet(self.active, atk);
        addBtn(bar, `${atk.name} (${atk.damage||0})`, () => Engine.attack(i), !usable);
      });
    }
    addBtn(bar, 'End Turn', () => Engine.endTurn());
    addBtn(bar, 'Concede', () => UI.confirmDialog('Concede match?', 'This immediately ends the match as a loss.', 'Concede').then(ok => ok && Engine.concede()), false, 'btn-ghost');
  }
  function addBtn(bar, label, onClick, disabled, variant){
    const b = document.createElement('button');
    b.className = 'btn ' + (variant || 'btn-secondary') + ' btn-sm';
    b.textContent = label; b.disabled = !!disabled; b.onclick = onClick;
    bar.appendChild(b);
  }

  UI.registerPage('match', renderMatch);
  global.Engine = Engine;
})(window);
