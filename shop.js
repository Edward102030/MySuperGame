/* ============================================================
   shop.js — Shop Service + Booster Opening
   ============================================================ */
(function(global){
  const PACK_SIZE=8;
  let catalogCache=null;

  function priceForSet(set,i){ return Math.round((5.5+Math.max(0,6-i)*0.5)*100)/100; }

  const Shop={
    async getCatalog(){
      if(catalogCache) return catalogCache;
      let sets=[];
      try{ sets=await Api.getSets(); }catch(e){}
      sets=sets.slice(0,18);
      catalogCache=sets.map((s,i)=>({
        productId:'pack_'+s.id, name:s.name+' Booster Pack', expansion:s.name,
        series:s.series||'', price:priceForSet(s,i), setId:s.id,
        logo:(s.images&&(s.images.logo||s.images.symbol))||'',
        releaseDate:s.releaseDate, isNew:i<3, totalCards:s.printedTotal||'?'
      }));
      if(!catalogCache.length) catalogCache=[{productId:'pack_offline',name:'Classic Booster Pack',expansion:'Classic Set',series:'Classic',price:5.50,setId:'offline',logo:'',releaseDate:'2024-01-01',isNew:true,totalCards:102}];
      return catalogCache;
    },

    async purchasePack(productId){
      const catalog=await Shop.getCatalog();
      const product=catalog.find(p=>p.productId===productId);
      if(!product) throw new Error('Product not found in catalog.');
      Economy.charge(product.price,'Purchase',productId,product.name);
      const inv=getInv(); inv.push({productId,setId:product.setId,name:product.name,purchasedAt:Date.now()});
      setInv(inv);
      return product;
    },

    grantFreePacks(count,setId){
      const inv=getInv();
      for(let i=0;i<count;i++) inv.push({productId:'pack_reward',setId:setId||'',name:'Tournament Reward Pack',purchasedAt:Date.now(),free:true});
      setInv(inv);
      Events.emit('PackGranted',{count});
    },

    getUnopenedPacks(){ return getInv(); },

    async openPack(packEntry){
      const setId=packEntry.setId||'';
      let cards=[];
      try{
        const query=setId&&setId!=='offline'&&setId!=='reward_pack'?`set.id:${setId}`:'supertype:Pokémon';
        const res=await Api.searchCards({query,pageSize:60,orderBy:'-rarity'});
        cards=res.cards;
      }catch(e){}
      if(cards.length<PACK_SIZE){
        try{ const r=await Api.searchCards({query:'supertype:Pokémon',pageSize:60}); cards=[...cards,...r.cards]; }catch(e){}
      }
      const pulled=drawPack(cards.length?cards:offlinePack());
      pulled.forEach(c=>Binder.addCard(c,1));
      const inv=getInv().filter(p=>p!==packEntry); setInv(inv);
      const d=Persistence.getUserData(Auth.currentUser.id);
      d.statistics.boosterPacksOpened=(d.statistics.boosterPacksOpened||0)+1;
      Persistence.saveUserData(Auth.currentUser.id,d);
      Events.emit('PackOpened',{count:pulled.length,setId});
      return pulled;
    }
  };

  function getInv(){ return Persistence.read('packs:'+(Auth.currentUser?.id||''),[]); }
  function setInv(inv){ Persistence.write('packs:'+Auth.currentUser.id,inv); }

  function drawPack(pool){
    const commons=pool.filter(c=>/common/i.test(c.rarity||''));
    const uncommons=pool.filter(c=>/uncommon/i.test(c.rarity||''));
    const rares=pool.filter(c=>c.rarity&&!/common|uncommon/i.test(c.rarity));
    const pick=(arr,n)=>Array.from({length:n},()=>arr.length?arr[Math.floor(Math.random()*arr.length)]:pool[Math.floor(Math.random()*pool.length)]);
    return [...pick(commons.length?commons:pool,4),...pick(uncommons.length?uncommons:pool,3),...pick(rares.length?rares:pool,1)].slice(0,PACK_SIZE);
  }

  function offlinePack(){
    return [{id:'off-1',name:'Pikachu',supertype:'Pokémon',types:['Lightning'],hp:'60',rarity:'Common',set:{name:'Classic'},images:{}},
      {id:'off-2',name:'Mewtwo',supertype:'Pokémon',types:['Psychic'],hp:'120',rarity:'Rare Holo',set:{name:'Classic'},images:{}},
      {id:'off-3',name:'Jigglypuff',supertype:'Pokémon',types:['Fairy'],hp:'60',rarity:'Common',set:{name:'Classic'},images:{}}];
  }

  function isRare(card){ return /(holo|rare|ex|ultra|secret|full.?art|double|shiny|promo|special|vmax|vstar)/i.test(card.rarity||''); }
  function isUltra(card){ return /(ultra|secret|full.?art|alt.?art|special|illustration)/i.test(card.rarity||''); }

  /* ---------- Shop page ---------- */
  async function renderShop(container){
    UI.skeletonGrid(container,8);
    const [catalog,unopened]=await Promise.all([Shop.getCatalog(),[...Shop.getUnopenedPacks()]]);
    container.innerHTML=`<div class="section-head"><h2>Shop</h2><span class="hint">${Economy.format(Economy.getBalance())}</span></div>`;
    if(unopened.length){
      const banner=document.createElement('div'); banner.className='resume-banner';
      banner.innerHTML=`<div><b>✦ ${unopened.length} Unopened Pack${unopened.length>1?'s':''}</b><div class="hint">Ready to reveal</div></div>`;
      const btn=document.createElement('button'); btn.className='btn btn-primary'; btn.textContent='Open Now';
      btn.onclick=()=>UI.navigate('opening'); banner.appendChild(btn);
      container.appendChild(banner);
    }
    const featured=catalog.filter(p=>p.isNew);
    if(featured.length){
      const feat=document.createElement('div'); feat.className='shop-featured';
      feat.innerHTML=`<div class="fl"><div class="eyebrow">✦ Newest Expansion</div><h3 style="font-size:24px;margin:6px 0 4px;">${UI.escapeHtml(featured[0].expansion)}</h3><p class="text-dim" style="font-size:13px;">${UI.escapeHtml(featured[0].series)} · ${featured[0].totalCards} cards</p></div>
        <button class="btn btn-primary btn-lg" data-buy="${featured[0].productId}">Buy — ${Economy.format(featured[0].price)}</button>`;
      container.appendChild(feat);
    }
    const newSection=document.createElement('div');
    newSection.innerHTML=`<div class="section-label">New Releases</div>`;
    const newGrid=document.createElement('div'); newGrid.className='shop-grid';
    catalog.filter(p=>p.isNew).forEach(p=>newGrid.appendChild(makePackCard(p)));
    newSection.appendChild(newGrid); container.appendChild(newSection);
    const allSection=document.createElement('div'); allSection.className='mt-24';
    allSection.innerHTML=`<div class="section-label">All Expansions</div>`;
    const allGrid=document.createElement('div'); allGrid.className='shop-grid';
    catalog.forEach(p=>allGrid.appendChild(makePackCard(p)));
    allSection.appendChild(allGrid); container.appendChild(allSection);
    container.querySelectorAll('[data-buy]').forEach(btn=>{
      btn.addEventListener('click',async e=>{
        const b=e.currentTarget; UI.setButtonLoading(b,true);
        try{ await Shop.purchasePack(b.dataset.buy); UI.toast('Pack purchased!','success'); renderShop(container); }
        catch(err){ UI.toast(err.message,'error'); UI.setButtonLoading(b,false); }
      });
    });
  }

  function makePackCard(p){
    const el=document.createElement('div'); el.className='pack-card';
    el.innerHTML=`
      <div class="pack-img-wrap">${p.logo?`<img src="${UI.escapeHtml(p.logo)}" onerror="this.style.display='none'" alt="">`:''}</div>
      <h4>${UI.escapeHtml(p.name)}</h4>
      <div class="exp">${UI.escapeHtml(p.series)}${p.totalCards?' · '+p.totalCards+' cards':''}</div>
      <div class="price">${Economy.format(p.price)}</div>
      <button class="btn btn-primary btn-sm btn-block" data-buy="${UI.escapeHtml(p.productId)}">Buy Pack</button>`;
    return el;
  }

  /* ---------- Pack opening page ---------- */
  function renderOpening(container){
    const packs=Shop.getUnopenedPacks();
    if(!packs.length){
      container.innerHTML='';
      container.appendChild(UI.emptyState({glyph:'✦',title:'No packs to open',body:'Visit the Shop to buy booster packs.',actionLabel:'Go to Shop',onAction:()=>UI.navigate('shop')}));
      return;
    }
    container.innerHTML=`
      <div class="opening-stage">
        <div class="opening-pack-count">${packs.length} pack${packs.length>1?'s':''} to open</div>
        <div class="pack-hero" id="pack-hero">
          <div class="pack-glyph">✦</div>
          <div>${UI.escapeHtml(packs[0].name||'Booster Pack')}</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:4px;">Tap to open</div>
        </div>
        <div class="reveal-row" id="reveal-row"></div>
        <button class="btn btn-ghost" id="opening-done" style="display:none;">← Back to Binder</button>
        <button class="btn btn-primary" id="open-next" style="display:none;">Open Next Pack</button>
      </div>`;

    container.querySelector('#pack-hero').onclick=async()=>{
      const hero=container.querySelector('#pack-hero');
      hero.style.pointerEvents='none';
      hero.innerHTML='<div style="animation:spin .6s linear infinite;width:32px;height:32px;border-radius:50%;border:3px solid rgba(255,255,255,.2);border-top-color:#fff;margin:auto;"></div>';
      const revealRow=container.querySelector('#reveal-row');
      const pulled=await Shop.openPack(packs[0]);
      hero.classList.add('opened');
      pulled.forEach((card,i)=>{
        const el=document.createElement('div');
        el.className='reveal-card'+(isUltra(card)?' ultra':isRare(card)?' rare':'');
        el.style.animationDelay=(i*130)+'ms';
        const imgSrc=UI.cardImg(card);
        el.innerHTML=`${imgSrc?`<img src="${UI.escapeHtml(imgSrc)}" onerror="this.style.opacity=0.15" alt="">`:`<div style="width:120px;height:168px;background:var(--surface-2);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--text-faint);">${UI.escapeHtml(card.name)}</div>`}<div class="rn">${UI.escapeHtml(card.name)}</div>`;
        revealRow.appendChild(el);
      });
      const rareCount=pulled.filter(c=>isRare(c)).length;
      UI.toast(`${pulled.length} cards added!${rareCount?` (${rareCount} rare${rareCount>1?'s':''}!)`:''}`, rareCount?'success':'info');
      const remaining=Shop.getUnopenedPacks();
      if(remaining.length){
        container.querySelector('#open-next').style.display='inline-flex';
        container.querySelector('#opening-done').style.display='inline-flex';
        container.querySelector('#open-next').onclick=()=>renderOpening(container);
      } else {
        container.querySelector('#opening-done').style.display='inline-flex';
      }
    };
    container.querySelector('#opening-done').onclick=()=>UI.navigate('binder');
  }

  UI.registerPage('shop',renderShop);
  UI.registerPage('opening',renderOpening);
  global.Shop=Shop;
})(window);
