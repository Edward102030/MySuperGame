/* ============================================================
   deckbuilder.js — Deck Builder (independent from gameplay)
   ============================================================ */
(function(global){
  const DECK_SIZE = 20;
  const MAX_COPIES = 4;

  const STARTERS = {
    fire: {
      name:'Ember Striker', primaryType:'Fire', icon:'🔥', exCard:'Charizard ex',
      query:'name:charizard OR name:charmander OR name:charmeleon',
      blurb:'Aggressive fire power. Evolve into Charizard ex and overwhelm your opponent.'
    },
    water: {
      name:'Tide Warden', primaryType:'Water', icon:'💧', exCard:'Blastoise ex',
      query:'name:blastoise OR name:squirtle OR name:wartortle',
      blurb:'Tough and resilient. Blastoise ex soaks hits while you build your bench.'
    },
    grass: {
      name:'Bloom Engine', primaryType:'Grass', icon:'🌿', exCard:'Venusaur ex',
      query:'name:venusaur OR name:bulbasaur OR name:ivysaur',
      blurb:'Steady and strategic. Grow stronger each turn with Venusaur ex leading the way.'
    }
  };

  function data(){ return Persistence.getUserData(Auth.currentUser.id); }
  function persist(d){ Persistence.saveUserData(Auth.currentUser.id, d); }

  const DeckBuilder = {
    STARTERS, DECK_SIZE, MAX_COPIES,

    getDecks(){ return Object.values(data().decks).sort((a,b) => (b.modifiedAt||0)-(a.modifiedAt||0)); },
    getDeck(id){ return data().decks[id] || null; },

    createDeck(name){
      const d = data();
      const id = 'deck_' + Date.now();
      d.decks[id] = { id, name, createdAt:Date.now(), modifiedAt:Date.now(), cards:{}, favorite:false, notes:'', stats:{played:0,won:0,lost:0} };
      persist(d); return d.decks[id];
    },
    renameDeck(id, name){ const d=data(); if(d.decks[id]){ d.decks[id].name=name; d.decks[id].modifiedAt=Date.now(); persist(d); } },
    deleteDeck(id){ const d=data(); delete d.decks[id]; persist(d); },
    duplicateDeck(id){
      const d=data(); const src=d.decks[id]; if(!src) return null;
      const newId='deck_'+Date.now();
      d.decks[newId]={...src, id:newId, name:src.name+' (Copy)', createdAt:Date.now(), modifiedAt:Date.now(), cards:{...src.cards}, stats:{played:0,won:0,lost:0}};
      persist(d); return d.decks[newId];
    },
    setCardCount(deckId, cardId, qty){
      const d=data(); const deck=d.decks[deckId]; if(!deck) return;
      qty=Math.max(0,Math.min(MAX_COPIES,qty));
      if(qty===0) delete deck.cards[cardId]; else deck.cards[cardId]=qty;
      deck.modifiedAt=Date.now(); persist(d);
    },
    totalCount(deck){ return Object.values(deck.cards).reduce((a,b)=>a+b,0); },

    validate(deck){
      const total=DeckBuilder.totalCount(deck); const errors=[];
      if(total !== DECK_SIZE) errors.push(`Needs exactly ${DECK_SIZE} cards (currently ${total}).`);
      for(const qty of Object.values(deck.cards)) if(qty>MAX_COPIES){ errors.push(`Max ${MAX_COPIES} copies of any card.`); break; }
      return { valid:errors.length===0, errors, total };
    },

    async grantStarterDeck(kind){
      const cfg = STARTERS[kind];
      const d = data();
      const id = 'deck_starter_' + kind;
      if(d.decks[id]) return d.decks[id]; // already have it
      const deck = { id, name:cfg.name, createdAt:Date.now(), modifiedAt:Date.now(), cards:{}, favorite:true, notes:'', stats:{played:0,won:0,lost:0}, isStarter:true };
      let pool = [];
      try{ const res = await Api.searchCards({ query:cfg.query, pageSize:20 }); pool = res.cards; }catch(e){}
      if(!pool.length){
        pool = [
          { id:`offline-${kind}-ex`, name:cfg.exCard, supertype:'Pokémon', subtypes:['Stage 2'], types:[cfg.primaryType], hp:'330', evolvesFrom:kind==='fire'?'Charmeleon':kind==='water'?'Wartortle':'Ivysaur', attacks:[{name:'Mega Blast',cost:[cfg.primaryType,cfg.primaryType],damage:'150',text:''}], weaknesses:[], resistances:[], retreatCost:['Colorless','Colorless'], set:{id:'starter',name:'Starter Set',series:'Starter'}, number:'1', rarity:'Double Rare', images:{} },
          { id:`offline-${kind}-mid`, name:kind==='fire'?'Charmeleon':kind==='water'?'Wartortle':'Ivysaur', supertype:'Pokémon', subtypes:['Stage 1'], types:[cfg.primaryType], hp:'90', evolvesFrom:kind==='fire'?'Charmander':kind==='water'?'Squirtle':'Bulbasaur', attacks:[{name:'Slash',cost:[cfg.primaryType],damage:'40',text:''}], weaknesses:[], resistances:[], retreatCost:['Colorless'], set:{id:'starter',name:'Starter Set',series:'Starter'}, number:'2', rarity:'Uncommon', images:{} },
          { id:`offline-${kind}-basic`, name:kind==='fire'?'Charmander':kind==='water'?'Squirtle':'Bulbasaur', supertype:'Pokémon', subtypes:['Basic'], types:[cfg.primaryType], hp:'70', evolvesFrom:null, attacks:[{name:'Scratch',cost:['Colorless'],damage:'20',text:''}], weaknesses:[], resistances:[], retreatCost:['Colorless'], set:{id:'starter',name:'Starter Set',series:'Starter'}, number:'3', rarity:'Common', images:{} }
        ];
      }
      // Build deck: 1 ex, 2 stage 1, up to 4 basics, rest padding to exactly DECK_SIZE
      const sorted = pool.slice(0,6);
      sorted.forEach(c => { Binder._cacheMeta(c); Binder.addCard(c, 1); });
      // distribute card slots
      sorted.forEach((c,i) => { deck.cards[c.id] = i===0 ? 1 : i<=1 ? 2 : 3; });
      // trim or pad to DECK_SIZE
      let total = DeckBuilder.totalCount(deck);
      const padCard = sorted[sorted.length-1];
      while(total < DECK_SIZE && padCard){
        const cur = deck.cards[padCard.id]||0;
        if(cur >= MAX_COPIES) break;
        deck.cards[padCard.id] = cur + 1; total++;
      }
      // trim if over
      for(const id of Object.keys(deck.cards)){
        if(DeckBuilder.totalCount(deck) <= DECK_SIZE) break;
        if(deck.cards[id] > 1) deck.cards[id]--;
      }
      d.decks[id] = deck; persist(d); return deck;
    }
  };

  /* ---------- Decks page ---------- */
  function renderDecks(container){
    const decks = DeckBuilder.getDecks();
    container.innerHTML = `
      <div class="section-head">
        <h2>Decks</h2>
        <button class="btn btn-primary btn-sm" id="new-deck-btn">+ New Deck</button>
      </div>`;
    if(!decks.length){
      container.appendChild(UI.emptyState({ glyph:'▣', title:'No decks yet', body:'Create a deck and add cards from your Binder.', actionLabel:'Create Deck', onAction:createDeckFlow }));
    } else {
      const grid = document.createElement('div'); grid.className = 'deck-grid';
      decks.forEach(deck => {
        const v = DeckBuilder.validate(deck);
        const thumbs = Object.keys(deck.cards).slice(0,4).map(id=>Binder._getMeta(id)).filter(Boolean);
        const wr = deck.stats.played ? Math.round((deck.stats.won/deck.stats.played)*100) : null;
        const el = document.createElement('div'); el.className = 'deck-card';
        el.innerHTML = `
          <h3>${deck.favorite?'★ ':''}${UI.escapeHtml(deck.name)}</h3>
          <div class="count">${DeckBuilder.totalCount(deck)}/${DECK_SIZE} · ${v.valid ? '<span class="text-success">Ready</span>' : '<span class="text-warning">Incomplete</span>'}</div>
          <div class="thumbs">${thumbs.map(c=>`<img src="${UI.escapeHtml(UI.cardImg(c))}" onerror="this.style.opacity=0">`).join('')}</div>
          <div class="deck-stats">
            <span>${deck.stats.played} played</span>
            ${wr !== null ? `<span>${wr}% win rate</span>` : ''}
          </div>`;
        el.addEventListener('click', () => openEditor(deck.id));
        grid.appendChild(el);
      });
      container.appendChild(grid);
    }
    container.querySelector('#new-deck-btn').addEventListener('click', createDeckFlow);
  }

  async function createDeckFlow(){
    const wrap = document.createElement('div');
    wrap.innerHTML = `<label class="field"><span>Deck name</span><input type="text" id="nd-name" class="search-input" style="border-radius:8px;" placeholder="My Deck" value="New Deck"></label>`;
    const ok = await UI.dialog({ title:'Create Deck', body:wrap, actions:[{label:'Cancel',variant:'ghost',value:false},{label:'Create',variant:'primary',value:true}] });
    if(!ok) return;
    const name = wrap.querySelector('#nd-name').value.trim() || 'New Deck';
    const deck = DeckBuilder.createDeck(name);
    openEditor(deck.id);
  }

  /* ---------- Deck editor ---------- */
  let editingId = null, editorFilter = '';

  function openEditor(id){ editingId = id; UI.navigate('deckedit', { title:'Edit Deck' }); }

  function renderEditor(container){
    const deck = DeckBuilder.getDeck(editingId);
    if(!deck){
      container.innerHTML = '';
      container.appendChild(UI.emptyState({ title:'Deck not found', body:'It may have been deleted.', actionLabel:'Back', onAction:()=>UI.navigate('decks') }));
      return;
    }
    const owned = Binder.getOwned();
    const v = DeckBuilder.validate(deck);
    container.innerHTML = `
      <div class="section-head">
        <h2 class="truncate" style="max-width:200px;">${UI.escapeHtml(deck.name)}</h2>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" id="de-back">← Back</button>
          <button class="btn btn-secondary btn-sm" id="de-rename">Rename</button>
          <button class="btn btn-secondary btn-sm" id="de-dupe">Copy</button>
          <button class="btn btn-danger btn-sm" id="de-delete">Delete</button>
        </div>
      </div>
      <div class="builder-layout">
        <div class="builder-list">
          <div class="search-wrap" style="margin-bottom:12px;">
            <input type="text" class="search-input" id="de-search" placeholder="Search your Binder…">
          </div>
          <div id="de-owned"></div>
        </div>
        <div class="builder-side">
          <div class="validation-msg ${v.valid?'ok':'bad'}">${v.valid ? '✓ Deck is ready to play.' : v.errors.join(' ')}</div>
          <div class="flex justify-between items-center mb-8">
            <h4 style="font-size:14px;">In Deck</h4>
            <span class="text-mono text-dim" style="font-size:12px;">${v.total}/${DECK_SIZE}</span>
          </div>
          <div class="progress-bar mb-16"><div class="progress-bar-fill ${v.valid?'success':''}" style="width:${Math.min(100,Math.round((v.total/DECK_SIZE)*100))}%"></div></div>
          <div id="de-deck-list" style="flex:1;overflow-y:auto;"></div>
          <div class="flex gap-8 mt-12">
            <button class="btn btn-primary btn-block" id="de-play" ${v.valid?'':'disabled'}>▶ Play This Deck</button>
          </div>
        </div>
      </div>`;
    renderOwnedList(container, owned, deck);
    renderDeckList(container, deck);
    container.querySelector('#de-back').onclick = () => UI.navigate('decks');
    container.querySelector('#de-rename').onclick = async () => {
      const w=document.createElement('div');
      w.innerHTML=`<label class="field"><span>Deck name</span><input type="text" id="rn" class="search-input" style="border-radius:8px;width:100%;" value="${UI.escapeHtml(deck.name)}"></label>`;
      const ok=await UI.dialog({title:'Rename',body:w,actions:[{label:'Cancel',variant:'ghost',value:false},{label:'Save',variant:'primary',value:true}]});
      if(ok){ DeckBuilder.renameDeck(deck.id,w.querySelector('#rn').value.trim()||deck.name); renderEditor(container); }
    };
    container.querySelector('#de-dupe').onclick = () => { const d=DeckBuilder.duplicateDeck(deck.id); if(d){ UI.toast('Deck duplicated','success'); openEditor(d.id); } };
    container.querySelector('#de-delete').onclick = async () => {
      const ok=await UI.confirmDialog('Delete deck?','This cannot be undone.','Delete',true);
      if(ok){ DeckBuilder.deleteDeck(deck.id); UI.navigate('decks'); }
    };
    container.querySelector('#de-play').onclick = () => { if(global.Engine) Engine.startMatch(deck.id); };
    container.querySelector('#de-search').addEventListener('input', UI.debounce(e => { editorFilter=e.target.value.toLowerCase(); renderOwnedList(container,owned,deck); }, 180));
  }

  function renderOwnedList(container, owned, deck){
    const list = container.querySelector('#de-owned');
    const filtered = owned.filter(({card})=>card.name.toLowerCase().includes(editorFilter));
    if(!filtered.length){ list.innerHTML='<p class="text-dim" style="font-size:13px;">No matching cards in your Binder.</p>'; return; }
    list.innerHTML = filtered.map(({card,entry})=>{
      const inDeck = deck.cards[card.id]||0;
      const maxReached = inDeck >= Math.min(MAX_COPIES, entry.quantity);
      return `<div class="deck-row" data-card="${UI.escapeHtml(card.id)}">
        <img src="${UI.escapeHtml(UI.cardImg(card))}" onerror="this.style.opacity=0">
        <span class="n">${UI.escapeHtml(card.name)} <span class="text-faint">(own ${entry.quantity})</span></span>
        <span class="qty-ctl">
          <button class="btn-icon de-dec" style="width:26px;height:26px;font-size:14px;" ${inDeck===0?'disabled':''}>−</button>
          <span style="min-width:16px;text-align:center;">${inDeck}</span>
          <button class="btn-icon de-inc" style="width:26px;height:26px;font-size:14px;" ${maxReached?'disabled':''}>+</button>
        </span>
      </div>`;
    }).join('');
    list.querySelectorAll('.deck-row').forEach(row=>{
      const cardId=row.dataset.card;
      const ownedEntry=owned.find(o=>o.card.id===cardId);
      if(!ownedEntry) return;
      row.querySelector('.de-inc').onclick=()=>{
        const cur=deck.cards[cardId]||0;
        if(cur>=ownedEntry.entry.quantity){ UI.toast("You don't own more copies.",'warning',2000); return; }
        DeckBuilder.setCardCount(deck.id,cardId,cur+1); renderEditor(container);
      };
      row.querySelector('.de-dec').onclick=()=>{
        DeckBuilder.setCardCount(deck.id,cardId,(deck.cards[cardId]||0)-1); renderEditor(container);
      };
    });
  }

  function renderDeckList(container, deck){
    const list=container.querySelector('#de-deck-list');
    const entries=Object.entries(deck.cards);
    if(!entries.length){ list.innerHTML='<p class="text-dim" style="font-size:13px;">Add cards from the left panel.</p>'; return; }
    list.innerHTML=entries.map(([cardId,qty])=>{
      const card=Binder._getMeta(cardId); if(!card) return '';
      return `<div class="deck-row"><img src="${UI.escapeHtml(UI.cardImg(card))}" onerror="this.style.opacity=0"><span class="n">${UI.escapeHtml(card.name)}</span><span class="qty-ctl text-mono">×${qty}</span></div>`;
    }).join('');
  }

  UI.registerPage('decks', renderDecks);
  UI.registerPage('deckedit', renderEditor);
  global.DeckBuilder = DeckBuilder;
})(window);
