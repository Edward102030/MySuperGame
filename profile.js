/* ============================================================
   profile.js — Profile screen & statistics dashboard
   ============================================================ */
(function(global){

  function data(){ return Persistence.getUserData(Auth.currentUser.id); }

  function render(container){
    const d = data();
    const stats = d.statistics;
    const winRate = stats.matchesPlayed ? Math.round((stats.matchesWon/stats.matchesPlayed)*100) : 0;
    const favDeck = Object.values(d.decks).sort((a,b)=>b.stats.played-a.stats.played)[0];
    const trophies = Object.values(d.achievements).filter(a => /champion/i.test(a.name||''));
    const binderStats = Binder.stats();

    container.innerHTML = `
      <div class="section-head"><h2>Profile</h2></div>
      <div class="card-panel" style="display:flex; gap:18px; align-items:center; margin-bottom:22px;">
        <div style="font-size:42px; width:72px; height:72px; border-radius:50%; background:var(--surface-2); display:flex; align-items:center; justify-content:center;">${d.profile.avatar}</div>
        <div style="flex:1;">
          <h3 style="font-size:20px;">${UI.escapeHtml(d.profile.nickname)}</h3>
          <div style="color:var(--text-dim); font-size:12.5px;">@${UI.escapeHtml(d.profile.username)} · Joined ${new Date(d.profile.joinDate).toLocaleDateString()} ${d.profile.isGuest ? '· Guest' : ''}</div>
        </div>
        ${d.profile.isGuest ? '<button class="btn btn-primary btn-sm" id="link-account">Save Progress to Account</button>' : '<button class="btn btn-ghost btn-sm" id="logout-btn">Log Out</button>'}
      </div>

      <div class="section-head"><h2 style="font-size:16px;">Statistics</h2></div>
      <div class="stat-grid" style="margin-bottom:22px;">
        <div class="stat-box"><div class="label">Matches Played</div><div class="value">${stats.matchesPlayed}</div></div>
        <div class="stat-box"><div class="label">Win Rate</div><div class="value">${winRate}%</div></div>
        <div class="stat-box"><div class="label">Tournament Wins</div><div class="value">${stats.tournamentWins}</div></div>
        <div class="stat-box"><div class="label">Packs Opened</div><div class="value">${stats.boosterPacksOpened}</div></div>
        <div class="stat-box"><div class="label">Collection Value</div><div class="value">${Economy.format(binderStats.totalValue)}</div></div>
        <div class="stat-box"><div class="label">Balance</div><div class="value">${Economy.format(Economy.getBalance())}</div></div>
      </div>

      <div class="section-head"><h2 style="font-size:16px;">Trophies</h2></div>
      ${trophies.length ? `<div class="stat-grid" style="margin-bottom:22px;">${trophies.map(t=>`<div class="stat-box"><div class="label">🏆 ${new Date(t.unlockDate).toLocaleDateString()}</div><div class="value" style="font-size:14px;">${UI.escapeHtml(t.description)}</div></div>`).join('')}</div>`
        : `<p style="color:var(--text-dim); font-size:13px; margin-bottom:22px;">No trophies yet — win a tournament to earn one.</p>`}

      <div class="section-head"><h2 style="font-size:16px;">Favorite Deck</h2></div>
      <p style="color:var(--text-dim); font-size:13px;">${favDeck ? UI.escapeHtml(favDeck.name) + ` — ${favDeck.stats.played} matches played` : 'Play a few matches to surface a favorite.'}</p>
    `;

    if(d.profile.isGuest){
      container.querySelector('#link-account').onclick = () => showLinkDialog(container);
    } else {
      container.querySelector('#logout-btn').onclick = async () => {
        const ok = await UI.confirmDialog('Log out?', 'You can log back in anytime with your username and password.', 'Log Out');
        if(ok){ Auth.logout(); location.reload(); }
      };
    }
  }

  async function showLinkDialog(container){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <label class="field" style="margin-bottom:10px;"><span>Username</span><input type="text" id="link-user" class="search-input" style="width:100%; border-radius:6px;"></label>
      <label class="field" style="margin-bottom:10px;"><span>Password</span><input type="password" id="link-pass" class="search-input" style="width:100%; border-radius:6px;"></label>
      <label class="field"><span>Display nickname</span><input type="text" id="link-nick" class="search-input" style="width:100%; border-radius:6px;"></label>
    `;
    const ok = await UI.dialog({ title:'Save Your Progress', body: wrap, actions:[{label:'Cancel',variant:'ghost',value:false},{label:'Create Account',variant:'primary',value:true}] });
    if(!ok) return;
    try{
      await Auth.linkGuestToAccount(wrap.querySelector('#link-user').value, wrap.querySelector('#link-pass').value, wrap.querySelector('#link-nick').value);
      UI.toast('Progress saved to your new account!', 'success');
      render(container);
    }catch(e){ UI.toast(e.message, 'error'); }
  }

  UI.registerPage('profile', render);
  global.Profile = { render };
})(window);
