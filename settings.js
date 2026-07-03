/* ============================================================
   settings.js — Settings screen
   Preferences persist locally and apply globally (e.g. animation
   speed is read by animations.js on every screen).
   ============================================================ */
(function(global){

  function render(container){
    const prefs = Persistence.getPreferences();
    container.innerHTML = `
      <div class="section-head"><h2>Settings</h2></div>
      <div class="settings-list">

        <div class="settings-row">
          <div><div class="lbl">Animation speed</div><div class="sub">Applies across the whole app</div></div>
          <select class="select-input" id="s-anim">
            ${['instant','fast','normal','slow'].map(v=>`<option value="${v}" ${prefs.animSpeed===v?'selected':''}>${v[0].toUpperCase()+v.slice(1)}</option>`).join('')}
          </select>
        </div>

        <div class="settings-row">
          <div><div class="lbl">Reduced motion</div><div class="sub">Minimize non-essential movement</div></div>
          <div class="switch ${prefs.reducedMotion?'on':''}" id="s-reduced"></div>
        </div>

        <div class="settings-row">
          <div><div class="lbl">Sound volume</div><div class="sub">${prefs.soundVolume}%</div></div>
          <input type="range" min="0" max="100" value="${prefs.soundVolume}" id="s-sound">
        </div>

        <div class="settings-row">
          <div><div class="lbl">Music volume</div><div class="sub">${prefs.musicVolume}%</div></div>
          <input type="range" min="0" max="100" value="${prefs.musicVolume}" id="s-music">
        </div>

        <div class="settings-row">
          <div><div class="lbl">Export backup</div><div class="sub">Download your collection, decks &amp; stats as JSON</div></div>
          <button class="btn btn-secondary btn-sm" id="s-export">Export</button>
        </div>

        <div class="settings-row">
          <div><div class="lbl">Sign out</div><div class="sub">${Auth.currentUser?.isGuest ? 'Guest progress stays on this device' : 'Return to the welcome screen'}</div></div>
          <button class="btn btn-ghost btn-sm" id="s-logout">Log Out</button>
        </div>

      </div>
    `;

    container.querySelector('#s-anim').onchange = (e) => { prefs.animSpeed = e.target.value; save(prefs); };
    container.querySelector('#s-reduced').onclick = (e) => { prefs.reducedMotion = !prefs.reducedMotion; e.target.classList.toggle('on'); save(prefs); };
    container.querySelector('#s-sound').oninput = (e) => { prefs.soundVolume = parseInt(e.target.value); container.querySelector('#s-sound').closest('.settings-row').querySelector('.sub').textContent = prefs.soundVolume + '%'; };
    container.querySelector('#s-sound').onchange = () => save(prefs);
    container.querySelector('#s-music').oninput = (e) => { prefs.musicVolume = parseInt(e.target.value); container.querySelector('#s-music').closest('.settings-row').querySelector('.sub').textContent = prefs.musicVolume + '%'; };
    container.querySelector('#s-music').onchange = () => save(prefs);
    container.querySelector('#s-export').onclick = () => {
      const blob = new Blob([Persistence.exportBackup(Auth.currentUser.id)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `prizerush-backup-${Auth.currentUser.username}.json`;
      a.click();
      UI.toast('Backup downloaded', 'success');
    };
    container.querySelector('#s-logout').onclick = async () => {
      const ok = await UI.confirmDialog('Log out?', 'Your progress is saved on this device.', 'Log Out');
      if(ok){ Auth.logout(); location.reload(); }
    };
  }

  function save(prefs){
    Persistence.setPreferences(prefs);
    Animations.applySpeedSetting(prefs.animSpeed);
    document.documentElement.classList.toggle('reduced-motion', prefs.reducedMotion);
    UI.toast('Settings saved', 'success', 1600);
  }

  UI.registerPage('settings', render);
  global.SettingsPage = { render };
})(window);
