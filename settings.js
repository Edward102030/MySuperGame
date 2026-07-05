/* ============================================================
   settings.js — Settings page
   ============================================================ */
(function(global){

  function render(container){
    const prefs=Persistence.getPreferences();
    container.innerHTML=`
      <div class="section-head"><h2>Settings</h2></div>
      <div class="settings-list">

        <div class="settings-section-title">Appearance</div>
        <div class="settings-row">
          <div><div class="lbl">Animation speed</div><div class="sub">Applies across the whole app</div></div>
          <select class="select-input" id="s-anim">
            ${['instant','fast','normal','slow'].map(v=>`<option value="${v}" ${prefs.animSpeed===v?'selected':''}>${v[0].toUpperCase()+v.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div class="settings-row">
          <div><div class="lbl">Reduced motion</div><div class="sub">Minimize non-essential movement</div></div>
          <div class="switch ${prefs.reducedMotion?'on':''}" id="s-reduced" role="switch" aria-checked="${!!prefs.reducedMotion}"></div>
        </div>

        <div class="settings-section-title">Audio</div>
        <div class="settings-row">
          <div><div class="lbl">Sound effects</div><div class="sub" id="sound-val">${prefs.soundVolume}%</div></div>
          <input type="range" min="0" max="100" value="${prefs.soundVolume}" id="s-sound">
        </div>
        <div class="settings-row">
          <div><div class="lbl">Music</div><div class="sub" id="music-val">${prefs.musicVolume}%</div></div>
          <input type="range" min="0" max="100" value="${prefs.musicVolume}" id="s-music">
        </div>

        <div class="settings-section-title">Data</div>
        <div class="settings-row">
          <div><div class="lbl">Export backup</div><div class="sub">Download your collection, decks &amp; stats as JSON</div></div>
          <button class="btn btn-secondary btn-sm" id="s-export">Export</button>
        </div>
        <div class="settings-row">
          <div><div class="lbl">Reset local data</div><div class="sub text-error">Erases everything on this device — cannot be undone</div></div>
          <button class="btn btn-danger btn-sm" id="s-reset">Reset</button>
        </div>

        <div class="settings-section-title">Account</div>
        <div class="settings-row">
          <div><div class="lbl">Sign out</div><div class="sub">${Auth.currentUser?.isGuest?'Guest progress stays on this device':'Return to the welcome screen'}</div></div>
          <button class="btn btn-ghost btn-sm" id="s-logout">Log Out</button>
        </div>

      </div>`;

    container.querySelector('#s-anim').onchange=e=>{ prefs.animSpeed=e.target.value; save(prefs); };
    container.querySelector('#s-reduced').onclick=e=>{ prefs.reducedMotion=!prefs.reducedMotion; e.target.classList.toggle('on'); e.target.setAttribute('aria-checked',prefs.reducedMotion); save(prefs); };
    const soundInput=container.querySelector('#s-sound'), musicInput=container.querySelector('#s-music');
    soundInput.oninput=e=>{ prefs.soundVolume=parseInt(e.target.value); container.querySelector('#sound-val').textContent=prefs.soundVolume+'%'; };
    soundInput.onchange=()=>save(prefs);
    musicInput.oninput=e=>{ prefs.musicVolume=parseInt(e.target.value); container.querySelector('#music-val').textContent=prefs.musicVolume+'%'; };
    musicInput.onchange=()=>save(prefs);
    container.querySelector('#s-export').onclick=()=>{
      const blob=new Blob([Persistence.exportBackup(Auth.currentUser.id)],{type:'application/json'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=`prizerush-backup-${Auth.currentUser.username}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      UI.toast('Backup downloaded','success');
    };
    container.querySelector('#s-reset').onclick=async()=>{
      const ok=await UI.confirmDialog('Reset all local data?','This deletes your account, collection, decks, and stats from this device permanently.','Erase Everything',true);
      if(ok){ localStorage.clear(); location.reload(); }
    };
    container.querySelector('#s-logout').onclick=async()=>{
      const ok=await UI.confirmDialog('Log out?','Your progress is saved on this device.','Log Out');
      if(ok){ Auth.logout(); location.reload(); }
    };
  }

  function save(prefs){
    Persistence.setPreferences(prefs);
    Animations.applySpeedSetting(prefs.animSpeed);
    document.documentElement.classList.toggle('reduced-motion',!!prefs.reducedMotion);
    UI.toast('Settings saved','success',1600);
  }

  UI.registerPage('settings',render);
  global.SettingsPage={render};
})(window);
