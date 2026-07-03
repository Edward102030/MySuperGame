/* ============================================================
   ui.js — Screen Manager, Navigation, Dialogs, Notifications,
   and small reusable render helpers shared across pages.
   Only one primary screen/page is active at a time; navigation
   never reloads the document, it just toggles .active.
   ============================================================ */
(function(global){

  /* ---------- Screen Manager (boot/welcome/auth/starter/app) ---------- */
  function showScreen(id){
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if(el) el.classList.add('active');
  }
  function hideAllScreens(){
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  }

  /* ---------- Page navigation within the app shell ---------- */
  const pageRenderers = {}; // pageName -> function(container)
  let currentPage = null;

  function registerPage(name, renderFn){ pageRenderers[name] = renderFn; }

  function navigate(page, opts = {}){
    if(!pageRenderers[page]){ console.warn('No renderer for page', page); return; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === page));
    const container = document.getElementById('page-' + page);
    container.classList.add('active');
    document.getElementById('top-bar-title').textContent = opts.title || titleCase(page);
    currentPage = page;
    Animations.fadeSwap(container, () => { pageRenderers[page](container, opts); });
    UI.refreshWallet();
  }

  function titleCase(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

  document.addEventListener('click', (e) => {
    const navBtn = e.target.closest('[data-nav]');
    if(navBtn) navigate(navBtn.dataset.nav);
  });

  /* ---------- Dialogs ---------- */
  const dialogRoot = () => document.getElementById('dialog-root');

  function dialog({ title, body, actions = [{ label:'OK', variant:'primary', value:true }] }){
    return new Promise((resolve) => {
      const root = dialogRoot();
      root.innerHTML = `
        <div class="dialog-box" role="dialog" aria-modal="true">
          <h3>${escapeHtml(title)}</h3>
          <div class="dialog-body">${typeof body === 'string' ? `<p>${body}</p>` : ''}</div>
          <div class="dialog-actions"></div>
        </div>`;
      if(body && typeof body !== 'string'){ root.querySelector('.dialog-body').appendChild(body); }
      const actionsEl = root.querySelector('.dialog-actions');
      actions.forEach(a => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-' + (a.variant || 'secondary');
        btn.textContent = a.label;
        btn.onclick = () => { root.classList.remove('active'); resolve(a.value); };
        actionsEl.appendChild(btn);
      });
      root.classList.add('active');
    });
  }

  function confirmDialog(title, body, confirmLabel = 'Confirm'){
    return dialog({
      title, body,
      actions: [
        { label:'Cancel', variant:'ghost', value:false },
        { label:confirmLabel, variant:'primary', value:true }
      ]
    });
  }

  function closeDialog(){ dialogRoot().classList.remove('active'); }

  /* ---------- Toast notifications ---------- */
  function toast(message, type = 'info', ms = 3200){
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 240);
    }, ms);
    Events.emit('NotificationShown', { message, type });
  }

  /* ---------- Loading button helper ---------- */
  function setButtonLoading(btn, loading){
    if(!btn) return;
    btn.classList.toggle('loading', !!loading);
    btn.disabled = !!loading;
  }

  /* ---------- Small render helpers reused across pages ---------- */
  function escapeHtml(str){
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function typeTagClass(type){
    return 'tag tag-' + String(type || 'colorless').toLowerCase();
  }

  function emptyState({ glyph = '◇', title, body, actionLabel, onAction }){
    const wrap = document.createElement('div');
    wrap.className = 'empty-state';
    wrap.innerHTML = `<div class="glyph">${glyph}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p>`;
    if(actionLabel){
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = actionLabel;
      btn.onclick = onAction;
      wrap.appendChild(btn);
    }
    return wrap;
  }

  function cardImg(card, size = 'small'){
    const url = card && card.images && (card.images[size] || card.images.small);
    return url || '';
  }

  function skeletonGrid(container, count = 8){
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    for(let i=0;i<count;i++){
      const sk = document.createElement('div');
      sk.className = 'skeleton';
      sk.style.aspectRatio = '5/7';
      sk.style.borderRadius = '10px';
      grid.appendChild(sk);
    }
    container.appendChild(grid);
  }

  /* ---------- Wallet badge ---------- */
  function refreshWallet(){
    const el = document.getElementById('top-bar-wallet');
    if(!el || !global.Auth || !Auth.currentUser) return;
    const balance = Economy.getBalance();
    el.textContent = Api.formatCurrency(balance);
  }

  const UI = {
    showScreen, hideAllScreens, registerPage, navigate, dialog, confirmDialog, closeDialog,
    toast, setButtonLoading, escapeHtml, typeTagClass, emptyState, cardImg,
    skeletonGrid, refreshWallet, get currentPage(){ return currentPage; }
  };
  global.UI = UI;
})(window);
