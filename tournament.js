/* ============================================================
   tournament.js — Tournament Engine + Tournament page
   ============================================================ */
(function(global){
  const SIZES=[4,8,16,32];
  const AI_NAMES=['Rocket Grunt','Gym Leader Bea','Elite Four Will','Rival Silver','Champion Cynthia','Ace Trainer','Bug Catcher','Veteran Trainer','Youngster Joey','Beauty Lorelie','Hiker Bruno','Scientist Oak'];
  const PRIZE_TABLE={4:10,8:25,16:55,32:120};

  function data(){ return Persistence.getUserData(Auth.currentUser.id); }
  function persist(d){ Persistence.saveUserData(Auth.currentUser.id,d); }

  const Tournament={
    SIZES,
    create(size,deckId){
      if(!SIZES.includes(size)) throw new Error('Invalid tournament size.');
      const deck=DeckBuilder.getDeck(deckId);
      if(!deck||!DeckBuilder.validate(deck).valid) throw new Error('Please choose a tournament-ready deck first.');
      const id='t_'+Date.now();
      const participants=buildParticipants(size);
      const bracket=[buildRound(participants,id,0)];
      const t={id,size,deckId,createdAt:Date.now(),status:'active',currentRound:0,participants,bracket,champion:null,rewardsClaimed:false,placement:null};
      const d=data(); d.tournaments[t.id]=t; d.statistics.tournamentsEntered=(d.statistics.tournamentsEntered||0)+1; persist(d);
      Persistence.saveTournamentSnapshot(Auth.currentUser.id,id,t);
      Events.emit('TournamentStarted',{id}); return t;
    },

    get(id){ return data().tournaments[id]||null; },
    getActive(){ return Object.values(data().tournaments).find(t=>t.status==='active')||null; },
    getAll(){ return Object.values(data().tournaments).sort((a,b)=>b.createdAt-a.createdAt); },

    async playNextMatch(id){
      const t=Tournament.get(id);
      const round=t.bracket[t.currentRound];
      const m=round.find(m=>m.status==='pending'&&(m.p1==='YOU'||m.p2==='YOU'));
      if(!m){ await Tournament.autoAdvance(id); return; }
      const oppName=m.p1==='YOU'?m.p2:m.p1;
      await Engine.startMatch(t.deckId,{tournamentId:id,matchId:m.id,opponentName:oppName});
    },

    async reportMatchResult(tId,matchId,humanWon){
      const t=Tournament.get(tId); if(!t) return;
      const round=t.bracket[t.currentRound];
      const m=round.find(m=>m.id===matchId); if(!m) return;
      m.status='complete';
      m.winner=humanWon?(m.p1==='YOU'?'YOU':m.p2):( m.p1==='YOU'?m.p2:m.p1 );
      saveTournament(t);
      if(!humanWon){ await eliminateHuman(t); return; }
      await Tournament.autoAdvance(tId);
    },

    async autoAdvance(tId){
      const t=Tournament.get(tId); if(!t) return;
      const round=t.bracket[t.currentRound];
      round.forEach(m=>{ if(m.status==='pending'&&m.p1!=='YOU'&&m.p2!=='YOU'){ m.status='complete'; m.winner=Math.random()<.5?m.p1:m.p2; } });
      saveTournament(t);
      if(round.every(m=>m.status==='complete')) await advanceRound(t);
      else renderIfActive();
    }
  };

  async function eliminateHuman(t){
    t.status='complete';
    const myMatch=t.bracket[t.currentRound].find(m=>m.p1==='YOU'||m.p2==='YOU');
    t.champion=myMatch?myMatch.winner:null;
    t.placement=calcPlacement(t);
    saveTournament(t);
    await autoFinishRemaining(t);
    await grantParticipation(t);
    renderIfActive();
  }

  async function advanceRound(t){
    const winners=t.bracket[t.currentRound].map(m=>m.winner);
    if(winners.length<=1){
      t.status='complete'; t.champion=winners[0]||null; t.placement=t.champion==='YOU'?1:2;
      saveTournament(t);
      if(t.champion==='YOU') await grantChampion(t);
      else await grantParticipation(t);
      renderIfActive(); return;
    }
    t.currentRound++;
    t.bracket.push(buildRound(winners,t.id,t.currentRound));
    saveTournament(t);
    const nextRound=t.bracket[t.currentRound];
    if(nextRound.some(m=>m.p1==='YOU'||m.p2==='YOU')){
      UI.toast(`Round ${t.currentRound+1} ready — your match is up!`,'info');
      renderIfActive();
    } else {
      await Tournament.autoAdvance(t.id);
    }
  }

  async function autoFinishRemaining(t){
    // resolve any unfinished AI matches for display
    t.bracket.forEach(round=>round.forEach(m=>{ if(m.status==='pending'){ m.status='complete'; m.winner=Math.random()<.5?m.p1:m.p2; } }));
    saveTournament(t);
  }

  function calcPlacement(t){ const r=t.currentRound; const eliminated=t.size/(Math.pow(2,r)); return eliminated+1; }

  async function grantParticipation(t){
    if(t.rewardsClaimed) return; t.rewardsClaimed=true; saveTournament(t);
    const d=data(); d.statistics.tournamentsCompleted=(d.statistics.tournamentsCompleted||0)+1; persist(d);
    global.Shop&&Shop.grantFreePacks(2);
    await UI.dialog({title:'Tournament Complete',body:`You placed #${t.placement||'?'} and earned 2 booster packs for participating!`,actions:[{label:'Collect Rewards',variant:'primary',value:true}]});
  }

  async function grantChampion(t){
    if(t.rewardsClaimed) return; t.rewardsClaimed=true; saveTournament(t);
    const d=data();
    d.statistics.tournamentsCompleted=(d.statistics.tournamentsCompleted||0)+1;
    d.statistics.tournamentWins=(d.statistics.tournamentWins||0)+1;
    const achId='champ_'+t.id;
    d.achievements[achId]={id:achId,name:'Tournament Champion',description:`Won a ${t.size}-player tournament on ${new Date().toLocaleDateString()}`,icon:'🏆',unlocked:true,unlockDate:Date.now()};
    persist(d);
    const prize=PRIZE_TABLE[t.size]||10;
    Economy.grant(prize,'Tournament Win',t.id,`${t.size}-player championship`);
    global.Shop&&Shop.grantFreePacks(2);
    Events.emit('RewardGranted',{type:'tournament-champion',prize});
    await UI.dialog({
      title:'🏆 Champion!',
      body:`You won the ${t.size}-player bracket! Rewards: ${Economy.format(prize)} prize money + 2 booster packs. A trophy has been added to your profile.`,
      actions:[{label:'Celebrate!',variant:'primary',value:true}]
    });
  }

  function saveTournament(t){ const d=data(); d.tournaments[t.id]=t; persist(d); Persistence.saveTournamentSnapshot(Auth.currentUser.id,t.id,t); }
  function renderIfActive(){ const c=document.getElementById('page-tournament'); if(c&&c.classList.contains('active')) render(c); }

  function buildParticipants(size){
    const names=shuffle([...AI_NAMES]);
    const list=['YOU'];
    for(let i=1;i<size;i++) list.push(names[(i-1)%names.length]+(i>AI_NAMES.length?' '+(Math.floor(i/AI_NAMES.length)+1):''));
    return shuffle(list);
  }
  function buildRound(participants,tid,round){
    const r=[];
    for(let i=0;i<participants.length;i+=2){
      const p2=participants[i+1];
      r.push({id:`m_${tid}_r${round}_${i/2}`,p1:participants[i],p2:p2||'BYE',status:p2?'pending':'complete',winner:p2?null:participants[i]});
    }
    return r;
  }
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

  /* ---------- Tournament page ---------- */
  function render(container){
    const active=Tournament.getActive();
    if(!active) renderSetup(container);
    else renderDashboard(container,active);
  }

  function renderSetup(container){
    const decks=DeckBuilder.getDecks().filter(d=>DeckBuilder.validate(d).valid);
    container.innerHTML=`<div class="section-head"><h2>Tournament</h2></div>`;
    if(!decks.length){
      container.appendChild(UI.emptyState({glyph:'♛',title:'No ready deck',body:'Complete a 20-card deck before entering a tournament.',actionLabel:'Go to Decks',onAction:()=>UI.navigate('decks')}));
      return;
    }
    const past=Tournament.getAll().filter(t=>t.status!=='active').slice(0,5);
    const panel=document.createElement('div'); panel.className='card-panel'; panel.style.maxWidth='500px';
    panel.innerHTML=`
      <h3 class="mb-16">Enter a Bracket</h3>
      <label class="field mb-16"><span>Your Deck</span>
        <select class="select-input" id="t-deck">${decks.map(d=>`<option value="${d.id}">${UI.escapeHtml(d.name)}</option>`).join('')}</select>
      </label>
      <label class="field mb-16"><span>Bracket Size</span>
        <select class="select-input" id="t-size">
          ${SIZES.map(s=>`<option value="${s}">${s} players${s===4?' (Quick)':s===8?' (Standard)':s===32?' (Grand)':''}</option>`).join('')}
        </select>
      </label>
      <div class="alert-banner info mb-16">Rewards: 2 booster packs for participating · ${Economy.format(PRIZE_TABLE[4])}–${Economy.format(PRIZE_TABLE[32])} + 2 packs for winning</div>
      <button class="btn btn-primary btn-block" id="t-start">Generate Bracket</button>`;
    container.appendChild(panel);
    panel.querySelector('#t-start').onclick=()=>{
      try{
        const size=parseInt(panel.querySelector('#t-size').value);
        const deckId=panel.querySelector('#t-deck').value;
        Tournament.create(size,deckId); render(container);
      }catch(e){ UI.toast(e.message,'error'); }
    };
    if(past.length){
      const hist=document.createElement('div'); hist.className='mt-24';
      hist.innerHTML=`<div class="section-label">Past Tournaments</div>`;
      past.forEach(t=>{
        const row=document.createElement('div'); row.className='settings-row mt-8';
        row.innerHTML=`<div><div class="lbl">${t.size}-player bracket</div><div class="sub">${new Date(t.createdAt).toLocaleDateString()}</div></div>
          <span class="badge ${t.champion==='YOU'?'badge-success':'badge-accent'}">${t.champion==='YOU'?'🏆 Won':t.placement?'#'+t.placement:'Played'}</span>`;
        hist.appendChild(row);
      });
      container.appendChild(hist);
    }
  }

  function renderDashboard(container,t){
    const round=t.bracket[t.currentRound];
    const humanMatch=t.status==='active'?round.find(m=>(m.p1==='YOU'||m.p2==='YOU')&&m.status==='pending'):null;
    const totalRounds=Math.log2(t.size);
    container.innerHTML=`
      <div class="section-head">
        <h2>${t.size}-Player Tournament</h2>
        <span class="hint">Round ${t.currentRound+1} / ${totalRounds} · ${t.status==='complete'?'Complete':'In Progress'}</span>
      </div>`;
    if(t.status==='active'){
      if(humanMatch){
        const opp=humanMatch.p1==='YOU'?humanMatch.p2:humanMatch.p1;
        const banner=document.createElement('div'); banner.className='resume-banner';
        banner.innerHTML=`<div><b>Your match is ready</b><div class="hint">vs ${UI.escapeHtml(opp)}</div></div>`;
        const btn=document.createElement('button'); btn.className='btn btn-primary'; btn.textContent='⚔ Play Now';
        btn.onclick=()=>Tournament.playNextMatch(t.id); banner.appendChild(btn);
        container.appendChild(banner);
      } else {
        const banner=document.createElement('div'); banner.className='resume-banner';
        banner.innerHTML=`<div><b>Processing other matches…</b><div class="hint">This happens automatically</div></div>`;
        container.appendChild(banner);
        setTimeout(()=>Tournament.autoAdvance(t.id),500);
      }
    } else {
      const banner=document.createElement('div'); banner.className='resume-banner';
      banner.innerHTML=`<div><b>${t.champion==='YOU'?'🏆 You are the Champion!':'Champion: '+UI.escapeHtml(t.champion||'?')}</b><div class="hint">Placement: #${t.placement||'?'}</div></div>`;
      const btn=document.createElement('button'); btn.className='btn btn-secondary btn-sm'; btn.textContent='New Tournament';
      btn.onclick=async()=>{
        const ok=await UI.confirmDialog('Start a new tournament?','Your previous result will be saved in your history.','New Tournament');
        if(ok){ const d=data(); delete d.tournaments[t.id]; persist(d); render(container); }
      };
      banner.appendChild(btn); container.appendChild(banner);
    }
    container.appendChild(renderBracket(t));
  }

  function renderBracket(t){
    const wrap=document.createElement('div');
    wrap.innerHTML=`<div class="section-label mt-16">Bracket</div>`;
    const bracket=document.createElement('div'); bracket.className='bracket';
    t.bracket.forEach((round,ri)=>{
      const col=document.createElement('div'); col.className='bracket-round';
      col.innerHTML=`<div class="round-label">Round ${ri+1}</div>`;
      round.forEach(m=>{
        const box=document.createElement('div'); box.className='bracket-match';
        [m.p1,m.p2].forEach(p=>{
          const slot=document.createElement('div');
          slot.className='bracket-slot'+(m.winner===p?' winner':'')+(m.status==='pending'?' pending':'')+(p==='YOU'?' you':'');
          slot.innerHTML=`<span class="truncate">${UI.escapeHtml(p)}</span>${m.winner===p?'<span class="slot-crown">♛</span>':''}`;
          box.appendChild(slot);
        });
        col.appendChild(box);
      });
      bracket.appendChild(col);
    });
    wrap.appendChild(bracket); return wrap;
  }

  UI.registerPage('tournament',render);
  global.Tournament=Tournament;
})(window);
