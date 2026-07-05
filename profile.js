/* ============================================================
   profile.js — Profile screen with tabbed statistics
   ============================================================ */
(function(global){
  function data(){ return Persistence.getUserData(Auth.currentUser.id); }

  function render(container){
    const d=data(), stats=d.statistics, wallet=d.wallet||{};
    const bStats=Binder.stats();
    const winRate=stats.matchesPlayed?Math.round((stats.matchesWon/stats.matchesPlayed)*100):0;
    const topDeck=Object.values(d.decks).sort((a,b)=>(b.stats.played||0)-(a.stats.played||0))[0];
    const achievements=Object.values(d.achievements||{});
    const trophies=achievements.filter(a=>a.unlocked);
    const txHistory=(wallet.transactions||[]).slice(-5).reverse();

    container.innerHTML=`
      <div class="section-head"><h2>Profile</h2></div>
      <div class="card-panel flex gap-16 items-center mb-16">
        <div class="avatar-circle">${d.profile?.avatar||'⭐'}</div>
        <div class="flex-1">
          <div style="font-size:20px;font-weight:700;">${UI.escapeHtml(d.profile?.nickname||'Trainer')}</div>
          <div class="text-dim" style="font-size:12.5px;">@${UI.escapeHtml(Auth.currentUser.username)}${d.profile?.isGuest?' · Guest':''}</div>
          <div class="text-dim" style="font-size:12px;margin-top:2px;">Joined ${new Date(d.profile?.joinDate||Date.now()).toLocaleDateString()}</div>
        </div>
        ${d.profile?.isGuest?'<button class="btn btn-primary btn-sm" id="link-btn">Save Account</button>':'<button class="btn btn-ghost btn-sm" id="logout-btn">Log Out</button>'}
      </div>

      <div class="tab-row">
        <button class="tab-btn active" data-tab-target="stats">Stats</button>
        <button class="tab-btn" data-tab-target="achievements">Trophies</button>
        <button class="tab-btn" data-tab-target="history">Transactions</button>
      </div>

      <div class="tab-content active" data-tab="stats">
        <div class="stat-grid mb-16">
          <div class="stat-box"><div class="label">Balance</div><div class="value">${Economy.format(Economy.getBalance())}</div></div>
          <div class="stat-box"><div class="label">Matches Won</div><div class="value">${stats.matchesWon||0}<div class="sub-value">${winRate}% win rate</div></div></div>
          <div class="stat-box"><div class="label">Tournament Wins</div><div class="value">${stats.tournamentWins||0}</div></div>
          <div class="stat-box"><div class="label">Packs Opened</div><div class="value">${stats.boosterPacksOpened||0}</div></div>
          <div class="stat-box"><div class="label">Unique Cards</div><div class="value">${bStats.uniqueCards}</div></div>
          <div class="stat-box"><div class="label">Collection Value</div><div class="value" style="font-size:15px;">${Economy.format(bStats.totalValue)}</div></div>
        </div>
        ${topDeck?`<div class="settings-row"><div><div class="lbl">Most Played Deck</div><div class="sub">${UI.escapeHtml(topDeck.name)} · ${topDeck.stats.played} games</div></div><span class="badge badge-accent">${topDeck.stats.played?Math.round((topDeck.stats.won/topDeck.stats.played)*100)+'% wins':'-'}</span></div>`:''}
        ${bStats.mostValuable?`<div class="settings-row mt-8"><div><div class="lbl">Most Valuable Card</div><div class="sub">${UI.escapeHtml(bStats.mostValuable.name)}</div></div><span class="badge badge-success">${Economy.format(bStats.mostValuableValue)}</span></div>`:''}
      </div>

      <div class="tab-content" data-tab="achievements">
        ${trophies.length?`<div class="achievement-grid">${trophies.map(a=>`<div class="achievement-card"><div class="ach-icon">${a.icon||'🏆'}</div><div><div class="ach-name">${UI.escapeHtml(a.name)}</div><div class="ach-desc">${UI.escapeHtml(a.description||'')}</div><div class="text-faint" style="font-size:10.5px;margin-top:4px;">${a.unlockDate?new Date(a.unlockDate).toLocaleDateString():''}</div></div></div>`).join('')}</div>`
        :`<div class="empty-state"><div class="glyph">🏆</div><h3>No trophies yet</h3><p>Win a tournament to earn your first trophy.</p></div>`}
      </div>

      <div class="tab-content" data-tab="history">
        ${txHistory.length?txHistory.map(tx=>`<div class="settings-row" style="margin-bottom:8px;"><div><div class="lbl" style="font-size:13px;">${UI.escapeHtml(tx.notes||tx.type||'Transaction')}</div><div class="sub">${new Date(tx.timestamp).toLocaleString()}</div></div><span class="${tx.amount>=0?'badge badge-success':'badge badge-error'}">${tx.amount>=0?'+':''}${Economy.format(tx.amount)}</span></div>`).join('')
        :`<div class="empty-state"><div class="glyph">↔</div><h3>No transactions yet</h3><p>Play matches, open packs, and buy from the Shop to see your history.</p></div>`}
      </div>`;

    UI.initTabs(container);
    const logoutBtn=container.querySelector('#logout-btn');
    const linkBtn=container.querySelector('#link-btn');
    if(logoutBtn) logoutBtn.onclick=async()=>{ const ok=await UI.confirmDialog('Log out?','Your progress stays saved.','Log Out',false); if(ok){ Auth.logout(); location.reload(); } };
    if(linkBtn) linkBtn.onclick=()=>showLinkDialog(container);
  }

  async function showLinkDialog(container){
    const wrap=document.createElement('div');
    wrap.innerHTML=`
      <label class="field mb-16"><span>Username</span><input type="text" id="lu" class="search-input" style="border-radius:8px;width:100%;" placeholder="at least 3 characters"></label>
      <label class="field mb-16"><span>Password</span><input type="password" id="lp" class="search-input" style="border-radius:8px;width:100%;" placeholder="at least 4 characters"></label>
      <label class="field"><span>Display name</span><input type="text" id="ln" class="search-input" style="border-radius:8px;width:100%;" placeholder="optional"></label>`;
    const ok=await UI.dialog({title:'Save Your Progress',body:wrap,actions:[{label:'Cancel',variant:'ghost',value:false},{label:'Create Account',variant:'primary',value:true}]});
    if(!ok) return;
    try{
      await Auth.linkGuestToAccount(wrap.querySelector('#lu').value,wrap.querySelector('#lp').value,wrap.querySelector('#ln').value);
      UI.toast('Progress saved to your new account!','success');
      render(container);
    }catch(e){ UI.toast(e.message,'error'); }
  }

  UI.registerPage('profile',render);
  global.Profile={render};
})(window);
