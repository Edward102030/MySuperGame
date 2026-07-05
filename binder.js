/* ============================================================
   binder.js — Collection Manager + Binder page
   ============================================================ */
(function(global){

  function data(){ return Persistence.getUserData(Auth.currentUser.id); }
  function persist(d){ Persistence.saveUserData(Auth.currentUser.id, d); }

  const Binder = {
    addCard(card, qty = 1){
      if(!card || !card.id) return;
      const d = data();
      const now = Date.now();
      if(d.collection[card.id]){
        d.collection[card.id].quantity += qty;
        d.collection[card.id].dateLastObtained = now;
      } else {
        d.collection[card.id] = { cardId: card.id, quantity: qty, dateFirstObtained: now, dateLastObtained: now, favorite: false, tags: [], notes: '', isNew: true };
      }
      Binder._cacheMeta(card);
      d.statistics.totalCardsOwned = (d.statistics.totalCardsOwned || 0) + qty;
      d.statistics.uniqueCardsOwned = Object.keys(d.collection).length;
      persist(d);
      Events.emit('ItemAdded', { card, qty });
    },

    removeCard(cardId, qty = 1){
      const d = data();
      if(!d.collection[cardId]) return;
      d.collection[cardId].quantity = Math.max(0, d.collection[cardId].quantity - qty);
      d.statistics.totalCardsOwned = Math.max(0, (d.statistics.totalCardsOwned || 0) - qty);
      if(d.collection[cardId].quantity === 0) delete d.collection[cardId];
      d.statistics.uniqueCardsOwned = Object.keys(d.collection).length;
      persist(d);
      Events.emit('QuantityChanged', { cardId });
    },

    toggleFavorite(cardId){
      const d = data();
      if(!d.collection[cardId]) return;
      d.collection[cardId].favorite = !d.collection[cardId].favorite;
      persist(d);
      Events.emit('FavoriteChanged', { cardId });
    },

    clearNew(cardId){
      const d = data();
      if(d.collection[cardId]) d.collection[cardId].isNew = false;
      persist(d);
    },

    _cacheMeta(card){
      try{
        const store = Persistence.read('cardmeta', {});
        store[card.id] = card;
        Persistence.write('cardmeta', store);
      }catch(e){}
    },
    _getMeta(cardId){
      const store = Persistence.read('cardmeta', {});
      return store[cardId] || null;
    },

    getOwned(){
      const d = data();
      return Object.values(d.collection)
        .map(entry => ({ entry, card: Binder._getMeta(entry.cardId) }))
        .filter(x => x.card);
    },

    query({ term='', type='all', rarity='all', favoritesOnly=false, sort='name-asc', newOnly=false } = {}){
      let rows = Binder.getOwned();
      const norm = term.trim().toLowerCase();
      if(norm) rows = rows.filter(({card}) => card.name.toLowerCase().includes(norm) || (card.set && card.set.name.toLowerCase().includes(norm)));
      if(type !== 'all') rows = rows.filter(({card}) => (card.types||[]).some(t => t.toLowerCase() === type.toLowerCase()));
      if(rarity !== 'all') rows = rows.filter(({card}) => (card.rarity||'').toLowerCase() === rarity.toLowerCase());
      if(favoritesOnly) rows = rows.filter(({entry}) => entry.favorite);
      if(newOnly) rows = rows.filter(({entry}) => entry.isNew);
      const sorters = {
        'name-asc':   (a,b) => a.card.name.localeCompare(b.card.name),
        'name-desc':  (a,b) => b.card.name.localeCompare(a.card.name),
        'value-desc': (a,b) => Api.marketPrice(b.card) - Api.marketPrice(a.card),
        'value-asc':  (a,b) => Api.marketPrice(a.card) - Api.marketPrice(b.card),
        'qty-desc':   (a,b) => b.entry.quantity - a.entry.quantity,
        'recent':     (a,b) => b.entry.dateLastObtained - a.entry.dateLastObtained,
        'set':        (a,b) => (a.card.set?.name||'').localeCompare(b.card.set?.name||''),
      };
      rows.sort(sorters[sort] || sorters['name-asc']);
      return rows;
    },

    stats(){
      const owned = Binder.getOwned();
      let totalValue = 0, mostValuable = null, mostValuableValue = -1, totalQty = 0;
      for(const {entry, card} of owned){
        const price = Api.marketPrice(card);
        totalValue += price * entry.quantity;
        totalQty += entry.quantity;
        if(price > mostValuableValue){ mostValuableValue = price; mostValuable = card; }
      }
      return { uniqueCards: owned.length, totalCards: totalQty, totalValue, mostValuable, mostValuableValue: Math.max(0, mostValuableValue) };
    }
  };

  /* ---------- Binder page ---------- */
  let state = { term:'', type:'all', rarity:'all', favoritesOnly:false, sort:'name-asc', newOnly:false };

  function render(container){
    const stats = Binder.stats();
    container.innerHTML = `
      <div class="section-head">
        <h2>Binder</h2>
        <span class="hint">${stats.uniqueCards} unique · ${stats.totalCards} total · ${Economy.format(stats.totalValue)}</span>
      </div>
      <div class="stat-grid mb-16">
        <div class="stat-box"><div class="label">Unique Cards</div><div class="value">${stats.uniqueCards}</div></div>
        <div class="stat-box"><div class="label">Total Owned</div><div class="value">${stats.totalCards}</div></div>
        <div class="stat-box"><div class="label">Collection Value</div><div class="value" style="font-size:16px;">${Economy.format(stats.totalValue)}</div></div>
        <div class="stat-box"><div class="label">Most Valuable</div><div class="value" style="font-size:13px;line-height:1.3;">${stats.mostValuable ? UI.escapeHtml(stats.mostValuable.name) : '—'}<div class="sub-value">${stats.mostValuableValue > 0 ? Economy.format(stats.mostValuableValue) : ''}</div></div></div>
      </div>
      <div class="toolbar">
        <div class="search-wrap"><input type="text" class="search-input" id="binder-search" placeholder="Search cards…" value="${UI.escapeHtml(state.term)}"></div>
        <select class="select-input" id="binder-type">
          ${['all','Fire','Water','Grass','Lightning','Psychic','Fighting','Darkness','Metal','Dragon','Colorless'].map(t=>`<option value="${t.toLowerCase()}" ${state.type===t.toLowerCase()||state.type===t?'selected':''}>${t==='all'?'All Types':t}</option>`).join('')}
        </select>
        <select class="select-input" id="binder-sort">
          <option value="name-asc" ${state.sort==='name-asc'?'selected':''}>Name A–Z</option>
          <option value="name-desc" ${state.sort==='name-desc'?'selected':''}>Name Z–A</option>
          <option value="value-desc" ${state.sort==='value-desc'?'selected':''}>Highest Value</option>
          <option value="value-asc" ${state.sort==='value-asc'?'selected':''}>Lowest Value</option>
          <option value="qty-desc" ${state.sort==='qty-desc'?'selected':''}>Most Owned</option>
          <option value="recent" ${state.sort==='recent'?'selected':''}>Recently Obtained</option>
          <option value="set" ${state.sort==='set'?'selected':''}>By Set</option>
        </select>
      </div>
      <div class="toolbar" style="margin-top:-8px;">
        <button class="chip ${state.favoritesOnly?'active':''}" id="binder-fav">★ Favorites</button>
        <button class="chip ${state.newOnly?'active':''}" id="binder-new">✦ New</button>
      </div>
      <div id="binder-results"></div>
    `;
    wireToolbar(container);
    renderResults(container);
  }

  function wireToolbar(container){
    container.querySelector('#binder-search').addEventListener('input', UI.debounce(e => { state.term = e.target.value; renderResults(container); }, 200));
    container.querySelector('#binder-type').addEventListener('change', e => { state.type = e.target.value; renderResults(container); });
    container.querySelector('#binder-sort').addEventListener('change', e => { state.sort = e.target.value; renderResults(container); });
    container.querySelector('#binder-fav').addEventListener('click', e => { state.favoritesOnly = !state.favoritesOnly; e.target.classList.toggle('active'); renderResults(container); });
    container.querySelector('#binder-new').addEventListener('click', e => { state.newOnly = !state.newOnly; e.target.classList.toggle('active'); renderResults(container); });
  }

  function renderResults(container){
    const results = container.querySelector('#binder-results');
    const rows = Binder.query(state);
    if(!rows.length){
      results.innerHTML = '';
      results.appendChild(UI.emptyState({ glyph:'▤', title:'No cards found', body:'Open booster packs from the Shop to fill your Binder.', actionLabel:'Go to Shop', onAction:()=>UI.navigate('shop') }));
      return;
    }
    const grid = document.createElement('div'); grid.className = 'card-grid';
    rows.forEach(({entry, card}) => {
      const el = document.createElement('div');
      const holo = isHolo(card);
      el.className = 'tcg-card' + (holo ? ' holo' : '');
      const imgSrc = UI.cardImg(card);
      el.innerHTML = `
        ${entry.isNew ? '<span class="c-new">NEW</span>' : ''}
        <span class="c-qty">×${entry.quantity}</span>
        <img src="${UI.escapeHtml(imgSrc)}" alt="${UI.escapeHtml(card.name)}" loading="lazy" onerror="this.style.opacity=0.1">
        <div class="c-name">${entry.favorite?'★ ':''}${UI.escapeHtml(card.name)}</div>
        <div class="c-meta">
          <span class="truncate">${UI.escapeHtml(card.set ? card.set.name : '')}</span>
          <span>${Economy.format(Api.marketPrice(card) * entry.quantity)}</span>
        </div>`;
      el.addEventListener('click', () => { Binder.clearNew(card.id); openDetail(entry, card); });
      grid.appendChild(el);
    });
    results.innerHTML = '';
    results.appendChild(grid);
  }

  function isHolo(card){ return /(holo|rare|ex|ultra|secret|full.?art|double|shiny|promo|special)/i.test(card.rarity||''); }

  async function openDetail(entry, card){
    const body = document.createElement('div');
    body.style.cssText = 'display:flex; gap:18px; align-items:flex-start;';
    const imgWrap = document.createElement('div');
    imgWrap.innerHTML = `<img src="${UI.escapeHtml(UI.cardImg(card,'large'))}" style="width:130px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.4);" onerror="this.style.opacity=0.1">`;
    const info = document.createElement('div');
    info.style.cssText = 'font-size:13px; color:var(--text-dim); line-height:1.9; flex:1;';
    info.innerHTML = `
      <div style="color:var(--text);font-size:16px;font-weight:700;margin-bottom:6px;">${UI.escapeHtml(card.name)}</div>
      ${card.types ? card.types.map(t=>UI.typeTagHtml(t)).join(' ') : ''}
      <div class="mt-8">Set: ${UI.escapeHtml(card.set?.name||'—')}</div>
      <div>Number: #${UI.escapeHtml(card.number||'—')}</div>
      <div>Rarity: ${UI.escapeHtml(card.rarity||'—')}</div>
      <div>HP: ${UI.escapeHtml(card.hp||'—')}</div>
      <div class="mt-8">Owned: <b style="color:var(--text)">×${entry.quantity}</b></div>
      <div>Market value: <b style="color:var(--success)">${Economy.format(Api.marketPrice(card))}</b></div>
      <div>Total value: <b style="color:var(--success)">${Economy.format(Api.marketPrice(card) * entry.quantity)}</b></div>
      <div class="mt-8">First obtained: ${new Date(entry.dateFirstObtained).toLocaleDateString()}</div>
    `;
    body.appendChild(imgWrap);
    body.appendChild(info);
    const choice = await UI.dialog({
      title: 'Card Details', body,
      actions:[
        { label:'Close', variant:'ghost', value:'close' },
        { label: entry.favorite ? '★ Unfavorite' : '☆ Favorite', variant:'secondary', value:'fav' }
      ]
    });
    if(choice === 'fav'){ Binder.toggleFavorite(card.id); UI.navigate('binder'); }
  }

  UI.registerPage('binder', render);
  global.Binder = Binder;
})(window);
