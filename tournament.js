/* ============================================================
   tournament.js — Tournament Engine (Single Elimination, Phase 1)
   Operates independently of match rules; only talks to Engine
   via startMatch(deckId, {tournamentId, matchId, opponentName}).
   Architected so Double Elim / Swiss / Round Robin can be added
   as new bracket-generation strategies without touching lifecycle.
   ============================================================ */
(function(global){
  const SIZES = [4, 8, 16, 32];
  const AI_NAMES = ['Rocket Recruit','Gym Challenger','Elite Trainer','Rival Blue','Champion Hopeful','League Judge','Bug Catcher Sam','Ace Trainer Mia','Veteran Cole','Youngster Ren'];

  function data(){ return Persistence.getUserData(Auth.currentUser.id); }
  function persist(d){ Persistence.saveUserData(Auth.currentUser.id, d); }

  const Tournament = {
    SIZES,

    create(size, deckId){
      if(!SIZES.includes(size)) throw new Error('Unsupported tournament size.');
      const deck = DeckBuilder.getDeck(deckId);
      if(!deck || !DeckBuilder.validate(deck).valid) throw new Error('Choose a tournament-ready deck first.');
      const id = 't_' + Date.now();
      const participants = buildParticipants(size);
      const bracket = generateBracket(participants);
      const t = {
        id, size, deckId, createdAt: Date.now(), status:'active', currentRound: 0,
        participants, bracket, champion: null, rewardsClaimed:false
      };
      const d = data();
      d.tournaments[id] = t;
      d.statistics.tournamentsEntered++;
      persist(d);
      Persistence.saveTournamentSnapshot(Auth.currentUser.id, id, t);
      Events.emit('TournamentStarted', { id });
      return t;
    },

    get(id){ return Persistence.getTournament(Auth.currentUser.id, id) || data().tournaments[id]; },
    getActive(){ const d = data(); return Object.values(d.tournaments).find(t => t.status === 'active') || null; },
    getAll(){ return Object.values(data().tournaments); },

    /** Starts the next unplayed match in the current round that involves the human. */
    async playNextMatch(id){
      const t = Tournament.get(id);
      const round = t.bracket[t.currentRound];
      const match = round.find(m => m.status === 'pending' && (m.p1 === 'YOU' || m.p2 === 'YOU'));
      if(!match){ return Tournament.autoAdvanceAIMatches(id); }
      const humanIsP1 = match.p1 === 'YOU';
      const opponentName = humanIsP1 ? match.p2 : match.p1;
      await Engine.startMatch(t.deckId, { tournamentId: id, matchId: match.id, opponentName });
    },

    async reportMatchResult(tournamentId, matchId, humanWon){
      const t = Tournament.get(tournamentId);
      const round = t.bracket[t.currentRound];
      const match = round.find(m => m.id === matchId);
      if(!match) return;
      match.status = 'complete';
      match.winner = (match.p1 === 'YOU') === humanWon ? match.p1 : match.p2;
      if(!humanWon) match.winner = match.p1 === 'YOU' ? match.p2 : match.p1;
      else match.winner = 'YOU';
      persistTournament(t);
      await Tournament.autoAdvanceAIMatches(tournamentId);
      if(!humanWon) await eliminateHuman(t);
    },

    /** AI-vs-AI matches resolve instantly via a lightweight simulated result. */
    async autoAdvanceAIMatches(tournamentId){
      const t = Tournament.get(tournamentId);
      const round = t.bracket[t.currentRound];
      round.forEach(m => {
        if(m.status === 'pending' && m.p1 !== 'YOU' && m.p2 !== 'YOU'){
          m.status = 'complete';
          m.winner = Math.random() < 0.5 ? m.p1 : m.p2;
        }
      });
      persistTournament(t);
      if(round.every(m => m.status === 'complete')){
        await advanceRound(t);
      } else {
        UI.navigate('tournament');
      }
    },

    async advanceRoundManually(id){ return advanceRound(Tournament.get(id)); },

    async resume(id){
      const t = Tournament.get(id);
      if(!t) return;
      UI.navigate('tournament');
    },

    abandon(id){
      const d = data();
      if(d.tournaments[id]) d.tournaments[id].status = 'abandoned';
      persist(d);
    }
  };

  async function eliminateHuman(t){
    t.status = 'complete';
    t.champion = t.bracket[t.currentRound].find(m => m.p1 === 'YOU' || m.p2 === 'YOU')?.winner || null;
    persistTournament(t);
    await grantParticipationReward(t);
    UI.navigate('tournament');
  }

  async function advanceRound(t){
    const round = t.bracket[t.currentRound];
    const winners = round.map(m => m.winner);
    if(winners.length === 1){
      t.status = 'complete';
      t.champion = winners[0];
      persistTournament(t);
      if(t.champion === 'YOU') await grantChampionReward(t);
      else await grantParticipationReward(t);
      UI.navigate('tournament');
      return;
    }
    t.currentRound++;
    const nextRound = [];
    for(let i=0;i<winners.length;i+=2){
      nextRound.push({ id: 'm_' + t.id + '_' + t.currentRound + '_' + (i/2), p1: winners[i], p2: winners[i+1], status:'pending', winner:null });
    }
    t.bracket.push(nextRound);
    persistTournament(t);
    if(nextRound.some(m => m.p1 === 'YOU' || m.p2 === 'YOU')){
      UI.toast('Round ' + (t.currentRound+1) + ' is ready — your next match is up!', 'info');
      UI.navigate('tournament');
    } else {
      await Tournament.autoAdvanceAIMatches(t.id);
    }
  }

  async function grantParticipationReward(t){
    if(t.rewardsClaimed) return;
    t.rewardsClaimed = true;
    const d = data();
    d.statistics.tournamentsCompleted++;
    persist(d);
    persistTournament(t);
    Economy.grant(0, 'Tournament Reward', t.id, '2 booster packs granted');
    Shop.grantFreePacks(2);
    Events.emit('RewardGranted', { type:'tournament-participation' });
    await UI.dialog({ title:'Tournament Complete', body:`You earned 2 booster packs for completing the tournament.`, actions:[{label:'Nice',variant:'primary',value:true}] });
  }

  async function grantChampionReward(t){
    if(t.rewardsClaimed) return;
    t.rewardsClaimed = true;
    const d = data();
    d.statistics.tournamentsCompleted++;
    d.statistics.tournamentWins++;
    d.achievements['champion_' + t.id] = { unlocked:true, unlockDate: Date.now(), name:'Tournament Champion', description:`Won a ${t.size}-player tournament.` };
    persist(d);
    persistTournament(t);
    const prizeMoney = { 4: 10, 8: 25, 16: 55, 32: 120 }[t.size] || 10;
    Economy.grant(prizeMoney, 'Tournament Reward', t.id, 'Championship prize money');
    Economy.grant(0, 'Tournament Reward', t.id, '2 booster packs granted');
    Shop.grantFreePacks(2);
    await UI.dialog({
      title:'🏆 Champion!', body:`You won the ${t.size}-player tournament! Prize: ${Economy.format(prizeMoney)} plus 2 booster packs. A trophy has been added to your profile.`,
      actions:[{label:'Celebrate',variant:'primary',value:true}]
    });
  }

  function persistTournament(t){
    const d = data(); d.tournaments[t.id] = t; persist(d);
    Persistence.saveTournamentSnapshot(Auth.currentUser.id, t.id, t);
  }

  function buildParticipants(size){
    const names = shuffle([...AI_NAMES]);
    const list = ['YOU'];
    for(let i=1;i<size;i++) list.push(names[i % names.length] + (i > names.length ? ' ' + i : ''));
    return shuffle(list);
  }
  function generateBracket(participants){
    const round = [];
    for(let i=0;i<participants.length;i+=2){
      round.push({ id:'m_r0_' + (i/2), p1:participants[i], p2:participants[i+1] ?? 'BYE', status: participants[i+1] ? 'pending' : 'complete', winner: participants[i+1] ? null : participants[i] });
    }
    return [round];
  }
  function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }

  /* ---------- Tournament page ---------- */
  function render(container){
    const active = Tournament.getActive();
    if(!active){
      renderSetup(container);
      return;
    }
    renderDashboard(container, active);
  }

  function renderSetup(container){
    const decks = DeckBuilder.getDecks().filter(d => DeckBuilder.validate(d).valid);
    container.innerHTML = `<div class="section-head"><h2>Tournament</h2></div>`;
    if(!decks.length){
      container.appendChild(UI.emptyState({ glyph:'♛', title:'No tournament-ready deck', body:'Finish building a 20-card deck before entering a bracket.', actionLabel:'Go to Decks', onAction:()=>UI.navigate('decks') }));
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'card-panel';
    wrap.style.maxWidth = '480px';
    wrap.innerHTML = `
      <h3 style="margin-bottom:12px;">Enter a Bracket</h3>
      <label class="field" style="margin-bottom:14px;"><span>Deck</span>
        <select class="select-input" id="t-deck">${decks.map(d=>`<option value="${d.id}">${UI.escapeHtml(d.name)}</option>`).join('')}</select>
      </label>
      <label class="field" style="margin-bottom:18px;"><span>Bracket size</span>
        <select class="select-input" id="t-size">${SIZES.map(s=>`<option value="${s}">${s} players</option>`).join('')}</select>
      </label>
      <button class="btn btn-primary btn-block" id="t-start">Generate Bracket</button>
    `;
    container.appendChild(wrap);
    container.querySelector('#t-start').onclick = () => {
      try{
        const size = parseInt(container.querySelector('#t-size').value);
        const deckId = container.querySelector('#t-deck').value;
        Tournament.create(size, deckId);
        render(container);
      }catch(e){ UI.toast(e.message, 'error'); }
    };
  }

  function renderDashboard(container, t){
    container.innerHTML = `
      <div class="section-head">
        <h2>${t.size}-Player Bracket</h2>
        <span class="hint">Round ${t.currentRound+1} of ${Math.log2(t.size)} ${t.status==='complete' ? '· Complete' : ''}</span>
      </div>
    `;
    if(t.status === 'active'){
      const round = t.bracket[t.currentRound];
      const humanMatch = round.find(m => (m.p1 === 'YOU' || m.p2 === 'YOU') && m.status === 'pending');
      if(humanMatch){
        const banner = document.createElement('div');
        banner.className = 'resume-banner';
        banner.innerHTML = `<div><b>Your match is ready</b><div class="hint">vs ${UI.escapeHtml(humanMatch.p1 === 'YOU' ? humanMatch.p2 : humanMatch.p1)}</div></div>`;
        const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Play Match';
        btn.onclick = () => Tournament.playNextMatch(t.id);
        banner.appendChild(btn);
        container.appendChild(banner);
      } else {
        const banner = document.createElement('div');
        banner.className = 'resume-banner';
        banner.innerHTML = `<div><b>Waiting on other matches…</b><div class="hint">Advancing automatically</div></div>`;
        container.appendChild(banner);
        Tournament.autoAdvanceAIMatches(t.id);
      }
    } else if(t.status === 'complete'){
      const banner = document.createElement('div');
      banner.className = 'resume-banner';
      banner.innerHTML = `<div><b>${t.champion === 'YOU' ? '🏆 You are the champion!' : 'Champion: ' + UI.escapeHtml(t.champion)}</b></div>`;
      const btn = document.createElement('button'); btn.className = 'btn btn-secondary'; btn.textContent = 'New Tournament';
      btn.onclick = () => { const d = data(); delete d.tournaments[t.id]; persist(d); render(container); };
      banner.appendChild(btn);
      container.appendChild(banner);
    }
    container.appendChild(renderBracketViz(t));
  }

  function renderBracketViz(t){
    const wrap = document.createElement('div');
    wrap.className = 'bracket';
    t.bracket.forEach((round, ri) => {
      const col = document.createElement('div'); col.className = 'bracket-round';
      col.innerHTML = `<div class="round-label">Round ${ri+1}</div>`;
      round.forEach(m => {
        const box = document.createElement('div'); box.className = 'bracket-match';
        box.innerHTML = `
          <div class="bracket-slot ${m.winner===m.p1?'winner':(m.status==='pending'?'pending':'')}">${UI.escapeHtml(m.p1)}</div>
          <div class="bracket-slot ${m.winner===m.p2?'winner':(m.status==='pending'?'pending':'')}">${UI.escapeHtml(m.p2)}</div>
        `;
        col.appendChild(box);
      });
      wrap.appendChild(col);
    });
    return wrap;
  }

  UI.registerPage('tournament', render);
  global.Tournament = Tournament;
})(window);
