/* ============================================================
   shop.js — Shop Service + Booster Opening
   Catalog is data-driven from live Pokémon TCG API sets where
   possible, priced by a simple per-set pricing rule. Purchases
   always route through Economy.charge() — the shop never
   touches the wallet directly.
   ============================================================ */
(function(global){
  const PACK_SIZE = 8;

  function priceForSet(set, index){
    // Newer sets cost more; keeps the economy simple & data-driven rather than hardcoded per-card.
    const base = 5.5;
    const recencyBonus = Math.max(0, 6 - index) * 0.5;
    return round2(base + recencyBonus);
  }
  function round2(n){ return Math.round(n*100)/100; }

  let catalogCache = null;

  const Shop = {
    async getCatalog(){
      if(catalogCache) return catalogCache;
      let sets = [];
      try{ sets = await Api.getSets(); }catch(e){ sets = []; }
      sets = sets.slice(0, 16);
      catalogCache = sets.map((set, i) => ({
        productId: 'pack_' + set.id, name: set.name + ' Booster Pack', expansion: set.name,
        series: set.series, price: priceForSet(set, i), setId: set.id,
        thumbnail: (set.images && (set.images.logo || set.images.symbol)) || '',
        releaseDate: set.releaseDate, isNew: i < 3
      }));
      if(!catalogCache.length){
        catalogCache = [{ productId:'pack_offline', name:'Offline Cache Booster Pack', expansion:'Offline Cache', series:'Local', price:5.5, setId:'offline', thumbnail:'', releaseDate:'2026-01-01', isNew:true }];
      }
      return catalogCache;
    },

    async purchasePack(productId){
      const catalog = await Shop.getCatalog();
      const product = catalog.find(p => p.productId === productId);
      if(!product) throw new Error('Product not found.');
      const tx = Economy.charge(product.price, 'Purchase', product.productId, `${product.name}`);
      const inv = inventory();
      inv.push({ productId, purchasedAt: Date.now(), receipt: tx.id });
      persistInventory(inv);
      UI.toast(`Purchased ${product.name}`, 'success');
      return product;
    },

    grantFreePacks(count, setId){
      const inv = inventory();
      for(let i=0;i<count;i++) inv.push({ productId: setId ? 'pack_'+setId : 'reward_pack', purchasedAt: Date.now(), receipt:'reward' });
      persistInventory(inv);
    },

    getUnopenedPacks(){ return inventory(); },

    async openPack(packEntry){
      const setId = (packEntry.productId || '').replace(/^pack_/,'') || (await Shop.getCatalog())[0]?.setId;
      let cards = [];
      try{
        const res = await Api.searchCards({ query: setId && setId !== 'reward_pack' ? `set.id:${setId}` : '', pageSize: 60, orderBy: '-rarity' });
        cards = res.cards;
      }catch(e){ cards = []; }
      if(!cards.length){
        const res = await Api.searchCards({ query:'', pageSize:60 });
        cards = res.cards;
      }
      const pulled = drawPack(cards);
      pulled.forEach(card => Binder.addCard(card, 1));
      const inv = inventory().filter(p => p !== packEntry);
      persistInventory(inv);
      const d = Persistence.getUserData(Auth.currentUser.id);
      d.statistics.boosterPacksOpened++;
      Persistence.saveUserData(Auth.currentUser.id, d);
      Events.emit('ItemAdded', { bulk:true, count: pulled.length });
      return pulled;
    }
  };

  function inventory(){ return Persistence.read('packs:' + (Auth.currentUser?.id||''), []); }
  function persistInventory(inv){ Persistence.write('packs:' + Auth.currentUser.id, inv); }

  function drawPack(pool){
    if(!pool.length) return [];
    const commons = pool.filter(c => /common/i.test(c.rarity||'')) ; 
    const uncommons = pool.filter(c => /uncommon/i.test(c.rarity||''));
    const rares = pool.filter(c => c.rarity && !/common|uncommon/i.test(c.rarity));
    const pick = (arr, n) => Array.from({length:n}, () => arr.length ? arr[Math.floor(Math.random()*arr.length)] : pool[Math.floor(Math.random()*pool.length)]);
    const result = [
      ...pick(commons.length?commons:pool, 4),
      ...pick(uncommons.length?uncommons:pool, 3),
      ...pick(rares.length?rares:pool, 1)
    ];
    return result.slice(0, PACK_SIZE);
  }

  /* ---------- Shop page ---------- */
  async function renderShop(container){
    UI.skeletonGrid(container, 8);
    const catalog = await Shop.getCatalog();
    const featured = catalog.filter(p => p.isNew);
    const unopened = Shop.getUnopenedPacks();
    container.innerHTML = `
      <div class="section-head"><h2>Booster Shop</h2></div>
      ${unopened.length ? `<div class="resume-banner"><div><b>${unopened.length} unopened pack${unopened.length>1?'s':''}</b><div class="hint">Ready to open</div></div><button class="btn btn-primary" id="go-open">Open Packs</button></div>` : ''}
      ${featured.length ? `<div class="shop-featured">
        <div class="fl"><div class="eyebrow">Newest Expansion</div><h3 style="font-size:22px;">${UI.escapeHtml(featured[0].name)}</h3><p style="color:var(--text-dim); font-size:13px; margin-top:6px;">${UI.escapeHtml(featured[0].series)}</p></div>
        <button class="btn btn-primary btn-lg" data-buy="${featured[0].productId}">Buy for ${Economy.format(featured[0].price)}</button>
      </div>` : ''}
      <div class="shop-grid" id="shop-grid"></div>
    `;
    const grid = container.querySelector('#shop-grid');
    catalog.forEach(p => {
      const el = document.createElement('div'); el.className = 'pack-card';
      el.innerHTML = `
        ${p.thumbnail ? `<img src="${p.thumbnail}" onerror="this.style.display='none'">` : `<div style="height:90px;display:flex;align-items:center;justify-content:center;color:var(--text-faint);">${UI.escapeHtml(p.expansion)}</div>`}
        <h4>${UI.escapeHtml(p.name)}</h4>
        <div class="exp">${UI.escapeHtml(p.series||'')}</div>
        <div class="price">${Economy.format(p.price)}</div>
        <button class="btn btn-primary btn-sm btn-block" data-buy="${p.productId}">Buy</button>
      `;
      grid.appendChild(el);
    });
    if(unopened.length) container.querySelector('#go-open').onclick = () => UI.navigate('opening');
    container.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        UI.setButtonLoading(btn, true);
        try{ await Shop.purchasePack(btn.dataset.buy); renderShop(container); }
        catch(e){ UI.toast(e.message, 'error'); UI.setButtonLoading(btn, false); }
      });
    });
  }

  /* ---------- Pack opening page ---------- */
  function renderOpening(container){
    const packs = Shop.getUnopenedPacks();
    if(!packs.length){
      container.innerHTML = '';
      container.appendChild(UI.emptyState({ glyph:'✦', title:'No packs to open', body:'Buy booster packs from the shop first.', actionLabel:'Go to Shop', onAction:()=>UI.navigate('shop') }));
      return;
    }
    container.innerHTML = `<div class="opening-stage">
      <div class="pack-hero" id="pack-hero">Tap to open<br>(${packs.length} left)</div>
      <div class="reveal-row" id="reveal-row"></div>
      <button class="btn btn-secondary" id="opening-done" style="display:none;">Back to Binder</button>
    </div>`;
    const hero = container.querySelector('#pack-hero');
    hero.onclick = async () => {
      hero.classList.add('opened');
      const revealRow = container.querySelector('#reveal-row');
      revealRow.innerHTML = '';
      const pulled = await Shop.openPack(packs[0]);
      pulled.forEach((card, i) => {
        const el = document.createElement('div');
        el.className = 'reveal-card' + (isRare(card) ? ' rare' : '');
        el.style.animationDelay = (i*140) + 'ms';
        el.innerHTML = `<img src="${UI.cardImg(card)}" onerror="this.style.opacity=0"><div class="n">${UI.escapeHtml(card.name)}</div>`;
        revealRow.appendChild(el);
      });
      UI.toast(`Opened pack — ${pulled.length} cards added to your binder`, 'success');
      const remaining = Shop.getUnopenedPacks();
      if(remaining.length){
        setTimeout(() => renderOpening(container), 1400);
      } else {
        container.querySelector('#opening-done').style.display = 'inline-flex';
      }
    };
    container.querySelector('#opening-done').onclick = () => UI.navigate('binder');
  }
  function isRare(card){ return /(holo|rare|ex|ultra|secret|full art|double)/i.test(card.rarity||''); }

  UI.registerPage('shop', renderShop);
  UI.registerPage('opening', renderOpening);
  global.Shop = Shop;
})(window);
