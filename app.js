/* ============================================================
   app.js — Application bootstrap & Home/Play hub screens
   Startup pipeline: load config -> restore session -> restore
   preferences -> check resumable match/tournament -> show Home.
   ============================================================ */
(function(global){

  // Optional: set a Pokémon TCG API key here (or leave blank —
  // the public API works unauthenticated at a lower rate limit).
  global.APP_CONFIG = { pokemonTcgApiKey: '' };

  let authMode = 'login';

  async function boot(){
    setBoot('Loading configuration…', 10);
    const prefs = Persistence.getPreferences();
    Animations.applySpeedSetting(prefs.animSpeed);
    document.documentElement.classList.toggle('reduced-motion', !!prefs.reducedMotion);

    await sleep(150);
    setBoot('Restoring session…', 35);
    const resumed = Auth.tryResumeSession();

    await sleep(150);
    setBoot('Loading local preferences…', 55);

    await sleep(150);
    setBoot('Preparing card cache…', 75);

    await sleep(150);
    setBoot('Almost there…', 95);
    await sleep(200);

    if(resumed){ enterApp(); }
    else { UI.showScreen('welcome'); }
  }
  function setBoot(msg, pct){
    document.getElementById('boot-status').textContent = msg;
    document.getElementById('boot-bar-fill').style.width = pct + '%';
  }
  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  /* ---------- Welcome / Auth wiring ---------- */
  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if(!action) return;
    if(action === 'show-login') openAuth('login');
    if(action === 'show-create-account') openAuth('register');
    if(action === 'back-to-welcome') UI.showScreen('welcome');
    if(action === 'continue-guest') doGuest();
  });

  function openAuth(mode){
    authMode = mode;
    document.getElementById('auth-title').textContent = mode === 'login' ? 'Login' : 'Create Account';
    document.getElementById('auth-submit').textContent = mode === 'login' ? 'Login' : 'Create Account';
    document.getElementById('auth-nickname-field').hidden = mode === 'login';
    document.getElementById('auth-error').hidden = true;
    const switchEl = document.getElementById('auth-switch');
    switchEl.innerHTML = mode === 'login'
      ? `New here? <button type="button" id="switch-mode">Create an account</button>`
      : `Already have an account? <button type="button" id="switch-mode">Login</button>`;
    switchEl.querySelector('#switch-mode').onclick = () => openAuth(mode === 'login' ? 'register' : 'login');
    document.getElementById('auth-form').reset();
    UI.showScreen('auth');
  }

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    const nickname = document.getElementById('auth-nickname').value;
    const remember = document.getElementById('auth-remember').checked;
    const errEl = document.getElementById('auth-error');
    const btn = document.getElementById('auth-submit');
    errEl.hidden = true;
    UI.setButtonLoading(btn, true);
    try{
      if(authMode === 'login'){
        await Auth.login(username, password, remember);
      } else {
        await Auth.register(username, password, nickname);
        if(remember) Persistence.setSession({ userId: Auth.currentUser.id, username: Auth.currentUser.username });
      }
      afterAuth();
    }catch(err){
      errEl.textContent = err.message;
      errEl.hidden = false;
    }finally{
      UI.setButtonLoading(btn, false);
    }
  });

  function doGuest(){
    Auth.continueAsGuest();
    afterAuth();
  }

  function afterAuth(){
    const decks = DeckBuilder.getDecks();
    if(!decks.length) showStarterSelect();
    else enterApp();
  }

  /* ---------- Starter deck selection ---------- */
  function showStarterSelect(){
    const grid = document.getElementById('starter-grid');
    grid.innerHTML = '';
    Object.entries(DeckBuilder.STARTERS).forEach(([kind, cfg]) => {
      const el = document.createElement('div');
      el.className = 'starter-card';
      el.innerHTML = `
        <span class="tag tag-${cfg.primaryType.toLowerCase()}">${cfg.primaryType}</span>
        <h3>${UI.escapeHtml(cfg.name)}</h3>
        <p class="desc">${UI.escapeHtml(cfg.blurb)}</p>
        <button class="btn btn-primary btn-sm btn-block" data-kind="${kind}">Choose</button>
      `;
      grid.appendChild(el);
    });
    grid.querySelectorAll('[data-kind]').forEach(btn => {
      btn.addEventListener('click', async () => {
        UI.setButtonLoading(btn, true);
        try{
          await DeckBuilder.grantStarterDeck(btn.dataset.kind);
          UI.toast('Starter deck added to your Decks tab!', 'success');
          enterApp();
        }catch(e){ UI.toast('Could not build starter deck: ' + e.message, 'error'); UI.setButtonLoading(btn, false); }
      });
    });
    UI.showScreen('starter');
  }

  /* ---------- Enter main app shell ---------- */
  async function enterApp(){
    UI.hideAllScreens();
    document.getElementById('app-shell').classList.add('active');
    UI.navigate('home');
    Persistence.flushQueue();
    checkResumables();
  }

  async function checkResumables(){
    const snapshot = Persistence.getResumableMatch(Auth.currentUser.id);
    if(snapshot && !snapshot.winner){
      const resume = await UI.dialog({
        title:'Resume your match?', body:'You have an unfinished match from earlier. Resume it or discard and start fresh.',
        actions:[{label:'Discard',variant:'ghost',value:false},{label:'Resume',variant:'primary',value:true}]
      });
      if(resume) Engine.resume(snapshot);
      else Persistence.clearMatchSnapshot(Auth.currentUser.id);
    }
  }

  /* ---------- Home page ---------- */
  function renderHome(container){
    const d = Persistence.getUserData(Auth.currentUser.id);
    const resumableMatch = Persistence.getResumableMatch(Auth.currentUser.id);
    const activeTournament = Tournament.getActive();
    const stats = d.statistics;

    container.innerHTML = `
      <div class="section-head"><h2>Welcome back, ${UI.escapeHtml(d.profile.nickname)}</h2><span class="hint">${d.profile.avatar}</span></div>

      ${resumableMatch && !resumableMatch.winner ? `<div class="resume-banner"><div><b>Unfinished match</b><div class="hint">Pick up where you left off</div></div><button class="btn btn-primary" id="home-resume-match">Resume</button></div>` : ''}
      ${activeTournament ? `<div class="resume-banner"><div><b>Tournament in progress</b><div class="hint">${activeTournament.size}-player bracket · Round ${activeTournament.currentRound+1}</div></div><button class="btn btn-primary" id="home-resume-t">Continue</button></div>` : ''}

      <div class="stat-grid" style="margin:18px 0 24px;">
        <div class="stat-box"><div class="label">Balance</div><div class="value">${Economy.format(Economy.getBalance())}</div></div>
        <div class="stat-box"><div class="label">Matches Won</div><div class="value">${stats.matchesWon}</div></div>
        <div class="stat-box"><div class="label">Tournament Wins</div><div class="value">${stats.tournamentWins}</div></div>
        <div class="stat-box"><div class="label">Cards Owned</div><div class="value">${stats.totalCardsOwned}</div></div>
      </div>

      <div class="section-head"><h2 style="font-size:16px;">Jump in</h2></div>
      <div class="deck-grid">
        <div class="deck-card" id="home-play"><h3>▶ Quick Match</h3><div class="count">Battle an AI opponent</div></div>
        <div class="deck-card" id="home-tourney"><h3>♛ Tournament</h3><div class="count">Enter a single-elimination bracket</div></div>
        <div class="deck-card" id="home-shop"><h3>$ Shop</h3><div class="count">Buy booster packs</div></div>
        <div class="deck-card" id="home-binder"><h3>▤ Binder</h3><div class="count">Browse your collection</div></div>
      </div>
    `;
    if(resumableMatch) container.querySelector('#home-resume-match').onclick = () => Engine.resume(resumableMatch);
    if(activeTournament) container.querySelector('#home-resume-t').onclick = () => UI.navigate('tournament');
    container.querySelector('#home-play').onclick = () => UI.navigate('play');
    container.querySelector('#home-tourney').onclick = () => UI.navigate('tournament');
    container.querySelector('#home-shop').onclick = () => UI.navigate('shop');
    container.querySelector('#home-binder').onclick = () => UI.navigate('binder');
  }

  /* ---------- Play page ---------- */
  function renderPlay(container){
    const decks = DeckBuilder.getDecks();
    const ready = decks.filter(d => DeckBuilder.validate(d).valid);
    container.innerHTML = `<div class="section-head"><h2>Play</h2></div>`;
    if(!ready.length){
      container.appendChild(UI.emptyState({ glyph:'▶', title:'No tournament-ready deck', body:'Build or finish a 20-card deck to start a match.', actionLabel:'Go to Decks', onAction:()=>UI.navigate('decks') }));
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'card-panel';
    wrap.style.maxWidth = '440px';
    wrap.innerHTML = `
      <h3 style="margin-bottom:12px;">Quick Match vs AI</h3>
      <label class="field" style="margin-bottom:16px;"><span>Choose deck</span>
        <select class="select-input" id="play-deck">${ready.map(d=>`<option value="${d.id}">${UI.escapeHtml(d.name)}</option>`).join('')}</select>
      </label>
      <button class="btn btn-primary btn-block" id="play-start">Start Match</button>
    `;
    container.appendChild(wrap);
    container.querySelector('#play-start').onclick = () => Engine.startMatch(container.querySelector('#play-deck').value);
  }

  UI.registerPage('home', renderHome);
  UI.registerPage('play', renderPlay);

  document.addEventListener('DOMContentLoaded', boot);
})(window);
