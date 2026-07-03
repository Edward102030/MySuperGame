/* ============================================================
   binder.js — Collection Manager + Binder page
   Ownership (quantity, dates, favorite, notes) is stored locally
   per user. Card metadata itself is never duplicated here — it's
   fetched from Api and cached by api.js, per the "separate
   metadata from ownership" principle.
   ============================================================ */
(function(global){

  function data(){ return Persistence.getUserData(Auth.currentUser.id); }
  function persist(d){ Persistence.saveUserData(Auth.currentUser.id, d); }

  const Binder = {
    /** Adds a card (by full card object) to the collection, or increments quantity. */
    addCard(card, qty = 1){
      const d = data();
      const entry = d.collection[card.id];
      const now = Date.now();
      if(entry){
        entry.quantity += qty;
        entry.dateLastObtained = now;
      } else {
        d.collection[card.id] = {
          cardId: card.id, quantity: qty, dateFirstObtained: now, dateLastObtained: now,
          favorite: false, tags: [], notes: ''
        };
        Api._cacheCardMeta && Api._cacheCardMeta(card);
      }
      Binder._cacheMeta(card);
      d.statistics.totalCardsOwned += qty;
      d.statistics.uniqueCardsOwned = Object.keys(d.collection).length;
      persist(d);
      Events.emit('ItemAdded', { card, qty });
      return d.collection[card.id];
    },

    _cacheMeta(card){
      const metaStore = Persistence.read('cardmeta', {});
      metaStore[card.id] = card;
      Persistence.write('cardmeta', metaStore);
    },
    _getMeta(cardId){
      const metaStore = Persistence.read('cardmeta', {});
      return metaStore[cardId] || null;
    },

    removeCard(cardId, qty = 1){
      const d = data();
      const entry = d.collection[cardId];
      if(!entry) return;
      entry.quantity = Math.max(0, entry.quantity - qty);
      d.statistics.totalCardsOwned = Math.max(0, d.statistics.totalCardsOwned - qty);
      if(entry.quantity === 0) delete d.collection[cardId];
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

    getOwned(){
      const d = data();
      return Object.values(d.collection).map(entry => ({ entry, card: Binder._getMeta(entry.cardId) })).filter(x => x.card);
    },

    /** Full search+filter+sort pipeline over the owned collection. */
    query({ term = '', type = 'all', rarity = 'all', favoritesOnly = false, sort = 'name-asc' } = {}){
      let rows = Binder.getOwned();
      const norm = term.trim().toLowerCase();
      if(norm){
        rows = rows.filter(({ card }) => card.name.toLowerCase().includes(norm) || (card.set && card.set.name.toLowerCase().includes(norm)));
      }
      if(type !== 'all') rows = rows.filter(({ card }) => (card.types || []).includes(type));
      if(rarity !== 'all') rows = rows.filter(({ card }) => card.rarity === rarity);
      if(favoritesOnly) rows = rows.filter(({ entry }) => entry.favorite);

      const cmp = {
        'name-asc': (a,b) => a.card.name.localeCompare(b.card.name),
        'name-desc': (a,b) => b.card.name.localeCompare(a.card.name),
        'value-desc': (a,b) => Api.marketPrice(b.card) - Api.marketPrice(a.card),
        'value-asc': (a,b) => Api.marketPrice(a.card) - Api.marketPrice(b.card),
        'qty-desc': (a,b) => b.entry.quantity - a.entry.quantity,
        'recent': (a,b) => b.entry.dateLastObtained - a.entry.dateLastObtained
      }[sort] || (() => 0);
      rows.sort(cmp);
      return rows;
    },

    stats(){
      const owned = Binder.getOwned();
      let totalValue = 0, mostValuable = null, mostValuableValue = -1;
      let totalQty = 0;
      for(const { entry, card } of owned){
        const price = Api.marketPrice(card);
        totalValue += price * entry.quantity;
        totalQty += entry.quantity;
        if(price > mostValuableValue){ mostValuableValue = price; mostValuable = card; }
      }
      return {
        uniqueCards: owned.length, totalCards: totalQty,
        totalValue, mostValuable, mostValuableValue: Math.max(0, mostValuableValue)
      };
    }
  };

  /* ---------- Binder page ---------- */
  let state = { term:'', type:'all', rarity:'all', favoritesOnly:false, sort:'name-asc' };

  function render(container){
    const stats = Binder.stats();
    container.innerHTML = `
      <div class="section-head">
        <h2>Binder</h2>
        <span class="hint">${stats.uniqueCards} unique · ${stats.totalCards} total · ${Economy.format(stats.totalValue)} value</span>
      </div>
      <div class="stat-grid" style="margin-bottom:20px;">
        <div class="stat-box"><div class="label">Unique Cards</div><div class="value">${stats.uniqueCards}</div></div>
        <div class="stat-box"><div class="label">Total Owned</div><div class="value">${stats.totalCards}</div></div>
        <div class="stat-box"><div class="label">Collection Value</div><div class="value">${Economy.format(stats.totalValue)}</div></div>
        <div class="stat-box"><div class="label">Most Valuable</div><div class="value" style="font-size:14px;">${stats.mostValuable ? UI.escapeHtml(stats.mostValuable.name) : '—'}</div></div>
      </div>
      <div class="toolbar">
        <input type="text" class="search-input" id="binder-search" placeholder="Search your collection…" value="${state.term}">
        <select class="select-input" id="binder-type">
          ${['all','Fire','Water','Grass','Lightning','Psychic','Fighting','Darkness','Metal','Dragon','Colorless'].map(t=>`<option value="${t}" ${state.type===t?'selected':''}>${t==='all'?'All types':t}</option>`).join('')}
        </select>
        <select class="select-input" id="binder-sort">
          <option value="name-asc" ${state.sort==='name-asc'?'selected':''}>Name A–Z</option>
          <option value="name-desc" ${state.sort==='name-desc'?'selected':''}>Name Z–A</option>
          <option value="value-desc" ${state.sort==='value-desc'?'selected':''}>Highest value</option>
          <option value="value-asc" ${state.sort==='value-asc'?'selected':''}>Lowest value</option>
          <option value="qty-desc" ${state.sort==='qty-desc'?'selected':''}>Most owned</option>
          <option value="recent" ${state.sort==='recent'?'selected':''}>Recently obtained</option>
        </select>
        <button class="chip ${state.favoritesOnly?'active':''}" id="binder-fav">★ Favorites</button>
      </div>
      <div id="binder-results"></div>
    `;
    wireToolbar(container);
    renderResults(container);
  }

  function wireToolbar(container){
    container.querySelector('#binder-search').addEventListener('input', debounce(e => { state.term = e.target.value; renderResults(container); }, 220));
    container.querySelector('#binder-type').addEventListener('change', e => { state.type = e.target.value; renderResults(container); });
    container.querySelector('#binder-sort').addEventListener('change', e => { state.sort = e.target.value; renderResults(container); });
    container.querySelector('#binder-fav').addEventListener('click', (e) => { state.favoritesOnly = !state.favoritesOnly; e.target.classList.toggle('active'); renderResults(container); });
  }

  function renderResults(container){
    const results = container.querySelector('#binder-results');
    const rows = Binder.query(state);
    if(!rows.length){
      results.innerHTML = '';
      results.appendChild(UI.emptyState({
        glyph:'▤', title:'Your collection is empty', body:'Open booster packs from the shop or win tournament rewards to start filling your binder.',
        actionLabel:'Go to Shop', onAction: () => UI.navigate('shop')
      }));
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    rows.forEach(({ entry, card }) => {
      const el = document.createElement('div');
      el.className = 'tcg-card' + (isHolo(card) ? ' holo' : '');
      el.innerHTML = `
        <span class="qty">×${entry.quantity}</span>
        <img src="${UI.cardImg(card)}" alt="${UI.escapeHtml(card.name)}" loading="lazy" onerror="this.style.opacity=0.15">
        <div class="name">${entry.favorite ? '★ ' : ''}${UI.escapeHtml(card.name)}</div>
        <div class="meta"><span>${UI.escapeHtml(card.set ? card.set.name : '')}</span><span>${Economy.format(Api.marketPrice(card) * entry.quantity)}</span></div>
      `;
      el.addEventListener('click', () => openDetail(entry, card));
      grid.appendChild(el);
    });
    results.innerHTML = '';
    results.appendChild(grid);
  }

  function isHolo(card){
    return /(holo|rare|ex|ultra|secret|full art)/i.test(card.rarity || '');
  }

  async function openDetail(entry, card){
    const body = document.createElement('div');
    body.innerHTML = `
      <div style="display:flex; gap:16px;">
        <img src="${UI.cardImg(card,'large')}" style="width:130px; border-radius:8px;" onerror="this.style.opacity=0.15">
        <div style="font-size:13px; color:var(--text-dim); line-height:1.8;">
          <div><b style="color:var(--text)">${UI.escapeHtml(card.name)}</b></div>
          <div>${UI.escapeHtml(card.set ? card.set.name : '—')} · #${UI.escapeHtml(card.number||'')}</div>
          <div>Rarity: ${UI.escapeHtml(card.rarity||'—')}</div>
          <div>Owned: ×${entry.quantity}</div>
          <div>Value: ${Economy.format(Api.marketPrice(card))} each</div>
          <div>First obtained: ${new Date(entry.dateFirstObtained).toLocaleDateString()}</div>
        </div>
      </div>`;
    const fav = entry.favorite ? 'Unfavorite' : 'Favorite';
    const choice = await UI.dialog({
      title: 'Card Details', body,
      actions: [{ label:'Close', variant:'ghost', value:'close' }, { label:fav, variant:'primary', value:'fav' }]
    });
    if(choice === 'fav'){ Binder.toggleFavorite(card.id); UI.navigate('binder'); }
  }

  function debounce(fn, ms){ let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  UI.registerPage && UI.registerPage('binder', render);
  global.Binder = Binder;
})(window);
