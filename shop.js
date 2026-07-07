/* ============================================================
   shop.js — Shop Service + Booster Opening
   Fixes from prior review:
   - Pack inventory entries now carry a unique `id`. Previously
     packs were matched by object reference after a JSON
     round-trip through localStorage, which never matched —
     so opened packs never actually left the inventory ("open
     next pack" appeared infinite). Fixed by comparing `.id`.
   - getInv() now self-heals: any legacy pack saved before this
     fix (missing an id) gets one patched in immediately, so old
     data can never cause the removal-matching bug either.
   - Removed the cross-set "top up from any Pokémon" fallback
     that could dilute a named pack (e.g. "151") with cards from
     an unrelated set. A named pack now only ever pulls from its
     own set; the generic fallback pool is used only if the
     live API is fully unreachable.
   - The pack-opening screen now shows the real official set logo
     image (same one already used in the Shop grid, sourced
     legitimately from the Pokémon TCG API) instead of a generic
     glyph placeholder.
   Packs open as 11 cards (10 + Basic Energy, like real modern
   packs), with a guaranteed "hit" at slot 10. Odds below are
   community-estimated — The Pokémon Company has never published
   official rates, so nobody outside the company has the real
   numbers.
   ============================================================ */
(function(global){
  const PACK_SIZE = 11;
  const HIT_SLOT_INDEX = 9; // 10th card (0-indexed)
  let catalogCache = null;

  const VINTAGE_CUTOFF = new Date('2003-01-01');

  function priceForSet(set){
    const released = set.releaseDate ? new Date(set.releaseDate) : new Date();
    if(released < VINTAGE_CUTOFF){
      const yearsOld = (Date.now() - released.getTime()) / (1000*60*60*24*365);
      return Math.round(Math.min(450, 25 + yearsOld * 12) * 100) / 100;
    }
    const monthsOld = Math.max(0, (Date.now() - released.getTime()) / (1000*60*60*24*30));
    const recencyPremium = Math.max(0, 3 - monthsOld * 0.05);
    return Math.round((8.5 + recencyPremium) * 100) / 100;
  }
  function isVintage(set){
    const released = set.releaseDate ? new Date(set.releaseDate) : new Date();
    return released < VINTAGE_CUTOFF;
  }

  const Shop = {
    async getCatalog(){
      if(catalogCache) return catalogCache;
      let sets = [];
      try{ sets = await Api.getSets(); }catch(e){}
      catalogCache = sets.map((s,i) => ({
        productId:'pack_'+s.id, name:s.name+' Booster Pack', expansion:s.name,
        series:s.series||'', price:priceForSet(s), setId:s.id,
        logo:(s.images&&(s.images.logo||s.images.symbol))||'',
        releaseDate:s.releaseDate, isNew:i<3, totalCards:s.printedTotal||'?',
        vintage:isVintage(s)
      }));
      if(!catalogCache.length){
        catalogCache = [
          { productId:'pack_base1', name:'Base Set Booster Pack', expansion:'Base Set', series:'Base', price:250, setId:'base1', logo:'', releaseDate:'1999-01-09', isNew:false, totalCards:102, vintage:true },
          { productId:'pack_offline', name:'Classic Booster Pack', expansion:'Classic Set', series:'Classic', price:8.50, setId:'offline', logo:'', releaseDate:'2024-01-01', isNew:true, totalCards:102, vintage:false }
        ];
      }
      return catalogCache;
    },

    async purchasePack(productId){
      const catalog = await Shop.getCatalog();
      const product = catalog.find(p => p.productId === productId);
      if(!product) throw new Error('Product not found in catalog.');
      Economy.charge(product.price, 'Purchase', productId, product.name);
      const inv = getInv();
      inv.push({ id: makePackId(), productId, setId:product.setId, name:product.name, purchasedAt:Date.now() });
      setInv(inv);
      return product;
    },

    grantFreePacks(count, setId){
      const inv = getInv();
      for(let i=0;i<count;i++) inv.push({ id: makePackId(), productId:'pack_reward', setId:setId||'', name:'Tournament Reward Pack', purchasedAt:Date.now(), free:true });
      setInv(inv);
      Events.emit('PackGranted', { count });
    },

    getUnopenedPacks(){ return getInv(); },

    /** Opens exactly one pack (by unique id) and removes only that one from inventory. */
    async openPack(packEntry){
      const setId = packEntry.setId || '';
      let cards = [];
      try{
        // Purity fix: a named pack ONLY pulls from its own set. No cross-set top-up.
        const query = setId ? `set.id:${setId}` : 'supertype:Pokémon';
        const res = await Api.searchCards({ query, pageSize:100, orderBy:'-rarity' });
        cards = res.cards;
      }catch(e){}
      if(!cards.length) cards = offlinePack();

      const pulled = drawRealisticPack(cards);
      pulled.forEach(c => Binder.addCard(c, 1));

      const inv = getInv().filter(p => p.id !== packEntry.id); // fixed: id match, not object reference
      setInv(inv);

      const d = Persistence.getUserData(Auth.currentUser.id);
      d.statistics.boosterPacksOpened = (d.statistics.boosterPacksOpened||0)+1;
      Persistence.saveUserData(Auth.currentUser.id, d);
      Events.emit('PackOpened', { count:pulled.length, setId });
      return pulled;
    }
  };

  function makePackId(){ return 'pack_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }
  /** Reads inventory and immediately patches any legacy entries that predate
      the id field (e.g. from before this fix was deployed), so removal by
      id always works no matter how old the saved data is. */
  function getInv(){
    const inv = Persistence.read('packs:'+(Auth.currentUser?.id||''), []);
    let patched = false;
    inv.forEach(p => { if(!p.id){ p.id = makePackId(); patched = true; } });
    if(patched) setInv(inv);
    return inv;
  }
  function setInv(inv){ Persistence.write('packs:'+Auth.currentUser.id, inv); }

  function byRarity(pool, re){ return pool.filter(c => re.test(c.rarity||'')); }

  const HIT_TIERS = [
    { test:/secret|hyper|rainbow/i,                  weight:0.01 },
    { test:/special illustration|alt(ernate)? art/i, weight:0.03 },
    { test:/ultra|vmax|vstar|full art/i,              weight:0.11 },
    { test:/double rare|\bex\b|\bv\b(?!max|star)/i,   weight:0.25 },
    { test:/rare/i,                                   weight:0.60 }
  ];

  function rollHitTier(pool){
    const r = Math.random();
    let cumulative = 0;
    for(const tier of HIT_TIERS){
      cumulative += tier.weight;
      if(r <= cumulative){
        const matches = pool.filter(c => tier.test.test(c.rarity||''));
        if(matches.length) return matches[Math.floor(Math.random()*matches.length)];
      }
    }
    const anyRare = pool.filter(c => c.rarity && !/common|uncommon/i.test(c.rarity));
    return (anyRare.length ? anyRare : pool)[Math.floor(Math.random()*(anyRare.length||pool.length))];
  }

  function drawRealisticPack(pool){
    const commons = byRarity(pool, /common/i);
    const uncommons = byRarity(pool, /uncommon/i);
    const pick = (arr,n) => Array.from({length:n}, () => arr.length ? arr[Math.floor(Math.random()*arr.length)] : pool[Math.floor(Math.random()*pool.length)]);

    const result = [];
    result.push(...pick(commons.length?commons:pool, 6));
    result.push(...pick(uncommons.length?uncommons:pool, 3));
    result[HIT_SLOT_INDEX] = rollHitTier(pool);
    result.push(syntheticEnergyCard());
    return result.slice(0, PACK_SIZE);
  }

  function syntheticEnergyCard(){
    const types = ['Fire','Water','Grass','Lightning','Psychic','Fighting','Colorless'];
    const type = types[Math.floor(Math.random()*types.length)];
    return { id:'basic-energy-'+type.toLowerCase()+'-'+Date.now()+Math.random().toString(36).slice(2,6), name:`Basic ${type} Energy`, supertype:'Energy', subtypes:['Basic'], types:[type], rarity:'Common', set:{name:'Energy'}, images:{} };
  }

  function offlinePack(){
    return [
      {id:'off-1',name:'Pikachu',supertype:'Pokémon',types:['Lightning'],hp:'60',rarity:'Common',set:{name:'Classic'},images:{}},
      {id:'off-2',name:'Mewtwo',supertype:'Pokémon',types:['Psychic'],hp:'120',rarity:'Rare Holo',set:{name:'Classic'},images:{}},
      {id:'off-3',name:'Jigglypuff',supertype:'Pokémon',types:['Fairy'],hp:'60',rarity:'Common',set:{name:'Classic'},images:{}}
    ];
  }

  function isRare(card){ return /(holo|rare|ex|ultra|secret|full.?art|double|shiny|promo|special|vmax|vstar)/i.test(card.rarity||''); }
  function isUltra(card){ return /(ultra|secret|full.?art|alt.?art|special|illustration)/i.test(card.rarity||''); }

  /* ---------- Shop page ---------- */
  async function renderShop(container){
    UI.skeletonGrid(container, 8);
    const [catalog, unopened] = await Promise.all([Shop.getCatalog(), [...Shop.getUnopenedPacks()]]);
    const lastCheck = Api.lastPriceCheck();
    container.innerHTML = `
      <div class="section-head">
        <h2>Shop</h2>
        <span class="hint">${Economy.format(Economy.getBalance())} ${lastCheck ? '· Prices updated ' + new Date(lastCheck).toLocaleDateString() : ''}</span>
      </div>`;
    if(unopened.length){
      const banner = document.createElement('div'); banner.className = 'resume-banner';
      banner.innerHTML = `<div><b>✦ ${unopened.length} Unopened Pack${unopened.length>1?'s':''}</b><div class="hint">Ready to reveal</div></div>`;
      const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.textContent='Open Now';
      btn.onclick = () => UI.navigate('opening'); banner.appendChild(btn);
      container.appendChild(banner);
    }
    const featured = catalog.filter(p => p.isNew);
    if(featured.length){
      const feat = document.createElement('div'); feat.className='shop-featured';
      feat.innerHTML = `<div class="fl"><div class="eyebrow">✦ Newest Expansion</div><h3 style="font-size:24px;margin:6px 0 4px;">${UI.escapeHtml(featured[0].expansion)}</h3><p class="text-dim" style="font-size:13px;">${UI.escapeHtml(featured[0].series)} · ${featured[0].totalCards} cards</p></div>
        <button class="btn btn-primary btn-lg" data-buy="${featured[0].productId}">Buy — ${Economy.format(featured[0].price)}</button>`;
      container.appendChild(feat);
    }
    const newSection = document.createElement('div');
    newSection.innerHTML = `<div class="section-label">New Releases</div>`;
    const newGrid = document.createElement('div'); newGrid.className='shop-grid';
    catalog.filter(p => p.isNew).forEach(p => newGrid.appendChild(makePackCard(p)));
    newSection.appendChild(newGrid); container.appendChild(newSection);

    const modern = catalog.filter(p => !p.isNew && !p.vintage);
    if(modern.length){
      const sec = document.createElement('div'); sec.className='mt-24';
      sec.innerHTML = `<div class="section-label">All Modern Expansions</div>`;
      const grid = document.createElement('div'); grid.className='shop-grid';
      modern.forEach(p => grid.appendChild(makePackCard(p)));
      sec.appendChild(grid); container.appendChild(sec);
    }

    const vintage = catalog.filter(p => p.vintage);
    if(vintage.length){
      const sec = document.createElement('div'); sec.className='mt-24';
      sec.innerHTML = `<div class="section-label">Vintage (Collector Pricing — no longer sold at retail)</div>`;
      const grid = document.createElement('div'); grid.className='shop-grid';
      vintage.forEach(p => grid.appendChild(makePackCard(p)));
      sec.appendChild(grid); container.appendChild(sec);
    }

    container.querySelectorAll('[data-buy]').forEach(btn => {
      btn.addEventListener('click', async e => {
        const b = e.currentTarget; UI.setButtonLoading(b,true);
        try{ await Shop.purchasePack(b.dataset.buy); UI.toast('Pack purchased!','success'); renderShop(container); }
        catch(err){ UI.toast(err.message,'error'); UI.setButtonLoading(b,false); }
      });
    });
  }

  function makePackCard(p){
    const el = document.createElement('div'); el.className='pack-card';
    el.innerHTML = `
      <div class="pack-img-wrap">${p.logo?`<img src="${UI.escapeHtml(p.logo)}" onerror="this.style.display='none'" alt="">`:''}</div>
      <h4>${UI.escapeHtml(p.name)}</h4>
      <div class="exp">${UI.escapeHtml(p.series)}${p.totalCards?' · '+p.totalCards+' cards':''}</div>
      <div class="price">${Economy.format(p.price)}</div>
      <button class="btn btn-primary btn-sm btn-block" data-buy="${UI.escapeHtml(p.productId)}">Buy Pack</button>`;
    return el;
  }

  /* ---------- Pack opening page (Quick Open / cinematic Open coming next round) ---------- */
  function renderOpening(container){
    const packs = Shop.getUnopenedPacks();
    if(!packs.length){
      container.innerHTML = '';
      container.appendChild(UI.emptyState({ glyph:'✦', title:'No packs to open', body:'Visit the Shop to buy booster packs.', actionLabel:'Go to Shop', onAction:()=>UI.navigate('shop') }));
      return;
    }
    const firstPack = packs[0];
    container.innerHTML = `
      <div class="opening-stage">
        <div class="opening-pack-count">${packs.length} pack${packs.length>1?'s':''} to open · 11 cards each</div>
        <div class="pack-hero" id="pack-hero" data-set="${UI.escapeHtml(firstPack.setId||'')}">
          <div class="pack-glyph" id="pack-hero-art">✦</div>
          <div>${UI.escapeHtml(firstPack.name||'Booster Pack')}</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:4px;">Tap to open</div>
        </div>
        <div class="reveal-row" id="reveal-row"></div>
        <button class="btn btn-ghost" id="opening-done" style="display:none;">← Back to Binder</button>
        <button class="btn btn-primary" id="open-next" style="display:none;">Open Next Pack</button>
      </div>`;

    // Show the real official set logo (the same image the API provides in the Shop) if available.
    loadPackArt(container, firstPack.setId);

    container.querySelector('#pack-hero').onclick = async () => {
      const hero = container.querySelector('#pack-hero');
      const thisPack = Shop.getUnopenedPacks()[0]; // re-read fresh, always the current top pack
      if(!thisPack) return;
      hero.style.pointerEvents = 'none';
      hero.innerHTML = '<div style="animation:spin .6s linear infinite;width:32px;height:32px;border-radius:50%;border:3px solid rgba(255,255,255,.2);border-top-color:#fff;margin:auto;"></div>';
      const revealRow = container.querySelector('#reveal-row');
      const pulled = await Shop.openPack(thisPack);
      hero.classList.add('opened');
      pulled.forEach((card,i) => {
        const el = document.createElement('div');
        el.className = 'reveal-card' + (isUltra(card)?' ultra':isRare(card)?' rare':'');
        el.style.animationDelay = (i*120)+'ms';
        const imgSrc = UI.cardImg(card);
        el.innerHTML = `${imgSrc?`<img src="${UI.escapeHtml(imgSrc)}" onerror="this.style.opacity=0.15" alt="">`:`<div style="width:110px;height:154px;background:var(--surface-2);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--text-faint);font-size:11px;text-align:center;padding:6px;">${UI.escapeHtml(card.name)}</div>`}<div class="rn">${UI.escapeHtml(card.name)}${i===9?' ⭐':''}</div>`;
        revealRow.appendChild(el);
      });
      const rareCount = pulled.filter(c => isRare(c)).length;
      UI.toast(`${pulled.length} cards added!${rareCount?` (${rareCount} rare${rareCount>1?'s':''}!)`:''}`, rareCount?'success':'info');
      const remaining = Shop.getUnopenedPacks();
      if(remaining.length){
        container.querySelector('#open-next').style.display='inline-flex';
        container.querySelector('#opening-done').style.display='inline-flex';
        container.querySelector('#open-next').onclick=()=>renderOpening(container);
      } else {
        container.querySelector('#opening-done').style.display='inline-flex';
      }
    };
    container.querySelector('#opening-done').onclick = () => UI.navigate('binder');
  }

  async function loadPackArt(container, setId){
    if(!setId) return;
    try{
      const catalog = await Shop.getCatalog();
      const product = catalog.find(p => p.setId === setId);
      const artEl = container.querySelector('#pack-hero-art');
      if(product && product.logo && artEl){
        artEl.innerHTML = `<img src="${UI.escapeHtml(product.logo)}" alt="" style="max-width:110px;max-height:70px;object-fit:contain;" onerror="this.parentElement.textContent='✦'">`;
      }
    }catch(e){ /* keep the glyph fallback */ }
  }

  UI.registerPage('shop', renderShop);
  UI.registerPage('opening', renderOpening);
  global.Shop = Shop;
})(window);
