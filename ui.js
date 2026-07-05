/* ============================================================
   ui.js — Screen Manager, Navigation, Dialogs, Toasts
   ============================================================ */
(function(global){

  function showScreen(id){
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if(el) el.classList.add('active');
  }
  function hideAllScreens(){
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  }

  /* ---------- Page navigation ---------- */
  const pageRenderers = {};
  let currentPage = null;

  function registerPage(name, fn){ pageRenderers[name] = fn; }

  function navigate(page, opts = {}){
    if(!pageRenderers[page]){ console.warn('No renderer for page:', page); return; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.nav === page);
    });
    const container = document.getElementById('page-' + page);
    if(!container){ console.warn('No container for page:', page); return; }
    container.classList.add('active');
    document.getElementById('top-bar-title').textContent = opts.title || titleCase(page);
    currentPage = page;
    closeMobileNav();
    container.scrollTop = 0;
    try{ pageRenderers[page](container, opts); }
    catch(e){ console.error('Page render error [' + page + ']:', e); container.innerHTML = `<div class="empty-state"><div class="glyph">⚠</div><h3>Something went wrong</h3><p>${escapeHtml(e.message)}</p></div>`; }
    UI.refreshWallet();
  }

  function titleCase(s){ return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------- Click delegation for nav ---------- */
  document.addEventListener('click', e => {
    const navBtn = e.target.closest('[data-nav]');
    if(navBtn && navBtn.dataset.nav) navigate(navBtn.dataset.nav);
  });

  /* ---------- Mobile nav overlay ---------- */
  function openMobileNav(){
    const overlay = document.getElementById('mobile-nav-overlay');
    if(!overlay) return;
    overlay.classList.add('active');
    const userEl = document.getElementById('mobile-nav-user');
    if(userEl && global.Auth && Auth.currentUser){
      const d = Persistence.getUserData(Auth.currentUser.id);
      userEl.innerHTML = `<div class="nickname">${d.profile ? d.profile.avatar + ' ' + escapeHtml(d.profile.nickname) : escapeHtml(Auth.currentUser.nickname)}</div>
        <div class="balance">${global.Economy ? Economy.format(Economy.getBalance()) : ''}</div>`;
    }
  }
  function closeMobileNav(){
    const overlay = document.getElementById('mobile-nav-overlay');
    if(overlay) overlay.classList.remove('active');
  }
  document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const closeBtn = document.getElementById('mobile-nav-close');
    const overlay = document.getElementById('mobile-nav-overlay');
    if(menuBtn) menuBtn.addEventListener('click', openMobileNav);
    if(closeBtn) closeBtn.addEventListener('click', closeMobileNav);
    if(overlay) overlay.addEventListener('click', e => { if(e.target === overlay) closeMobileNav(); });
    const authBack = document.querySelector('[data-action="back-to-welcome"]');
    if(authBack) authBack.addEventListener('click', () => showScreen('welcome'));
  });

  /* ---------- Dialogs ---------- */
  function dialog({ title, body, actions = [{ label:'OK', variant:'primary', value:true }] }){
    return new Promise(resolve => {
      const root = document.getElementById('dialog-root');
      root.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'dialog-box';
      const h = document.createElement('h3'); h.textContent = title; box.appendChild(h);
      const bodyWrap = document.createElement('div');
      if(typeof body === 'string'){ const p = document.createElement('p'); p.textContent = body; bodyWrap.appendChild(p); }
      else if(body) bodyWrap.appendChild(body);
      box.appendChild(bodyWrap);
      const acts = document.createElement('div'); acts.className = 'dialog-actions';
      actions.forEach(a => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-' + (a.variant || 'secondary');
        btn.textContent = a.label;
        btn.onclick = () => { root.classList.remove('active'); resolve(a.value); };
        acts.appendChild(btn);
      });
      box.appendChild(acts);
      root.appendChild(box);
      root.classList.add('active');
      // close on backdrop click
      root.onclick = e => { if(e.target === root){ root.classList.remove('active'); resolve(null); } };
    });
  }

  function confirmDialog(title, body, confirmLabel = 'Confirm', danger = false){
    return dialog({
      title, body,
      actions:[
        { label:'Cancel', variant:'ghost', value:false },
        { label:confirmLabel, variant: danger ? 'danger' : 'primary', value:true }
      ]
    });
  }

  function closeDialog(){ document.getElementById('dialog-root').classList.remove('active'); }

  /* ---------- Toasts ---------- */
  const activeToasts = new Set();
  function toast(message, type = 'info', ms = 3400){
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    const msg = document.createElement('span'); msg.textContent = message; el.appendChild(msg);
    const close = document.createElement('button'); close.className = 'toast-close'; close.textContent = '✕'; close.onclick = () => dismiss(el); el.appendChild(close);
    root.appendChild(el);
    activeToasts.add(el);
    const timer = setTimeout(() => dismiss(el), ms);
    el._timer = timer;
    Events.emit('NotificationShown', { message, type });
    return el;
  }
  function dismiss(el){ clearTimeout(el._timer); el.classList.add('leaving'); setTimeout(() => { el.remove(); activeToasts.delete(el); }, 240); }

  /* ---------- Loading overlay ---------- */
  function showLoading(){ document.getElementById('loading-cover').classList.add('active'); }
  function hideLoading(){ document.getElementById('loading-cover').classList.remove('active'); }

  /* ---------- Button loading state ---------- */
  function setButtonLoading(btn, loading){
    if(!btn) return;
    btn.classList.toggle('loading', !!loading);
    btn.disabled = !!loading;
  }

  /* ---------- Shared render helpers ---------- */
  function escapeHtml(str){
    return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function typeTagHtml(type){
    return `<span class="tag tag-${escapeHtml(String(type||'colorless').toLowerCase())}">${escapeHtml(type||'?')}</span>`;
  }

  function cardImg(card, size = 'small'){
    return (card && card.images && (card.images[size] || card.images.small)) || '';
  }

  function emptyState({ glyph='◇', title, body, actionLabel, onAction }){
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

  function skeletonGrid(container, count = 8){
    container.innerHTML = '';
    const grid = document.createElement('div'); grid.className = 'card-grid';
    for(let i=0;i<count;i++){
      const sk = document.createElement('div');
      sk.className = 'skeleton';
      sk.style.cssText = 'aspect-ratio:5/7; border-radius:10px;';
      grid.appendChild(sk);
    }
    container.appendChild(grid);
  }

  function refreshWallet(){
    const el = document.getElementById('top-bar-wallet');
    if(!el || !global.Auth || !Auth.currentUser || !global.Economy) return;
    el.textContent = Economy.format(Economy.getBalance());
  }

  /* ---------- Tabs ---------- */
  function initTabs(container){
    const tabs = container.querySelectorAll('.tab-btn');
    const panes = container.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const target = container.querySelector('[data-tab="' + tab.dataset.tabTarget + '"]');
        if(target) target.classList.add('active');
      });
    });
    if(tabs[0]) tabs[0].click();
  }

  function debounce(fn, ms){ let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  const UI = {
    showScreen, hideAllScreens, registerPage, navigate, dialog, confirmDialog,
    closeDialog, toast, showLoading, hideLoading, setButtonLoading,
    escapeHtml, typeTagHtml, cardImg, emptyState, skeletonGrid, refreshWallet,
    initTabs, debounce, openMobileNav, closeMobileNav,
    get currentPage(){ return currentPage; }
  };
  global.UI = UI;
})(window);
