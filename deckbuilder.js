/* ============================================================
   deckbuilder.js — Deck Builder (independent from gameplay)
   Decks store a card list as {cardId: quantity}. Validation
   enforces standard deck-size and duplicate-limit rules.
   ============================================================ */
(function(global){

  const DECK_SIZE = 20; // trimmed-down "learning" deck size, not the full 60, so games stay fast
  const MAX_COPIES = 4;

  const STARTERS = {
    fire: {
      name: 'Ember Starter', primaryType: 'Fire', exCard: 'Charizard ex',
      query: 'name:charizard OR name:charmander OR name:charmeleon',
      blurb: 'An aggressive deck built around evolving into Charizard ex and burning through the board.'
    },
    water: {
      name: 'Tide Starter', primaryType: 'Water', exCard: 'Blastoise ex',
      query: 'name:blastoise OR name:squirtle OR name:wartortle',
      blurb: 'A defensive deck that stalls behind Blastoise ex\'s high HP wall.'
    },
    grass: {
      name: 'Bloom Starter', primaryType: 'Grass', exCard: 'Venusaur ex',
      query: 'name:venusaur OR name:bulbasaur OR name:ivysaur',
      blurb: 'A steady value deck that grows stronger turn after turn with Venusaur ex.'
    }
  };

  function data(){ return Persistence.getUserData(Auth.currentUser.id); }
  function persist(d){ Persistence.saveUserData(Auth.currentUser.id, d); }

  const DeckBuilder = {
    STARTERS, DECK_SIZE, MAX_COPIES,

    getDecks(){ return Object.values(data().decks); },
    getDeck(id){ return data().decks[id]; },

    createDeck(name){
      const d = data();
      const id = 'deck_' + Date.now();
      d.decks[id] = { id, name, createdAt: Date.now(), modifiedAt: Date.now(), cards: {}, favorite:false, stats:{ played:0, won:0, lost:0 } };
      persist(d);
      return d.decks[id];
    },

    renameDeck(id, name){ const d = data(); if(d.decks[id]){ d.decks[id].name = name; d.decks[id].modifiedAt = Date.now(); persist(d); } },
    deleteDeck(id){ const d = data(); delete d.decks[id]; persist(d); },
    duplicateDeck(id){
      const d = data(); const src = d.decks[id]; if(!src) return null;
      const newId = 'deck_' + Date.now();
      d.decks[newId] = { ...src, id:newId, name: src.name + ' (Copy)', createdAt: Date.now(), modifiedAt: Date.now(), cards: { ...src.cards } };
      persist(d); return d.decks[newId];
    },

    setCardCount(deckId, cardId, qty){
      const d = data(); const deck = d.decks[deckId]; if(!deck) return;
      qty = Math.max(0, Math.min(MAX_COPIES, qty));
      if(qty === 0) delete deck.cards[cardId]; else deck.cards[cardId] = qty;
      deck.modifiedAt = Date.now();
      persist(d);
    },

    totalCount(deck){ return Object.values(deck.cards).reduce((a,b) => a+b, 0); },

    validate(deck){
      const total = DeckBuilder.totalCount(deck);
      const errors = [];
      if(total !== DECK_SIZE) errors.push(`Deck must contain exactly ${DECK_SIZE} cards (currently ${total}).`);
      for(const [cardId, qty] of Object.entries(deck.cards)){
        if(qty > MAX_COPIES){ errors.push(`Too many copies of one card (max ${MAX_COPIES}).`); break; }
      }
      const hasBasic = Object.keys(deck.cards).some(id => Binder._getMeta(id) && (Binder._getMeta(id).stage === 'Basic' || Binder._getMeta(id).supertype !== 'Pokémon'));
      return { valid: errors.length === 0, errors, total };
    },

    /** Builds & saves a starter deck for a brand-new player using bundled offline-safe data. */
    async grantStarterDeck(kind){
      const cfg = STARTERS[kind];
      const d = data();
      const id = 'deck_starter_' + kind;
      const deck = { id, name: cfg.name, createdAt: Date.now(), modifiedAt: Date.now(), cards: {}, favorite:true, stats:{ played:0, won:0, lost:0 }, isStarter:true };
      let pool = [];
      try{
        const res = await Api.searchCards({ query: cfg.query, pageSize: 20 });
        pool = res.cards;
      }catch(e){ /* handled by Api fallback already */ }
      if(!pool.length){
        pool = [{ id:`offline-${kind}-ex`, name:cfg.exCard, supertype:'Pokémon', types:[cfg.primaryType], hp:'330', stage:'Stage 2',
                  attacks:[{name:'Overpower',cost:[cfg.primaryType,cfg.primaryType],damage:'120',text:''}], weaknesses:[], resistances:[], retreatCost:['Colorless','Colorless'],
                  set:{name:'Starter Set'}, rarity:'Double Rare', images:{} }];
      }
      // ensure the ex headliner + basics fill exactly DECK_SIZE across a small pool
      pool.slice(0, 6).forEach((card, i) => {
        Binder._cacheMeta(card);
        const qty = i === 0 ? 1 : 3; // 1 ex + supporting basics, trimmed to fit DECK_SIZE
        deck.cards[card.id] = Math.min(MAX_COPIES, qty);
        Binder.addCard(card, qty); // starter cards are also added to the binder — they're genuinely owned
      });
      // pad/trim to exactly DECK_SIZE with duplicates of the first basic found
      let total = DeckBuilder.totalCount(deck);
      const basicId = pool[1] ? pool[1].id : pool[0].id;
      while(total < DECK_SIZE && basicId){
        deck.cards[basicId] = Math.min(MAX_COPIES, (deck.cards[basicId]||0) + 1);
        total = DeckBuilder.totalCount(deck);
        if((deck.cards[basicId]||0) >= MAX_COPIES) break;
      }
      d.decks[id] = deck;
      persist(d);
      return deck;
    }
  };

  /* ---------- Decks page ---------- */
  function renderDecks(container){
    const decks = DeckBuilder.getDecks();
    container.innerHTML = `<div class="section-head"><h2>Decks</h2><button class="btn btn-primary btn-sm" id="new-deck-btn">+ New Deck</button></div>`;
    if(!decks.length){
      container.appendChild(UI.emptyState({ glyph:'▣', title:'No decks created yet', body:'Build a deck from cards in your binder.', actionLabel:'Create Deck', onAction: makeDeck }));
    } else {
      const grid = document.createElement('div'); grid.className = 'deck-grid';
      decks.forEach(deck => {
        const valid = DeckBuilder.validate(deck);
        const thumbs = Object.keys(deck.cards).slice(0,3).map(id => Binder._getMeta(id)).filter(Boolean);
        const el = document.createElement('div'); el.className = 'deck-card';
        el.innerHTML = `
          <h3>${deck.favorite ? '★ ' : ''}${UI.escapeHtml(deck.name)}</h3>
          <div class="count">${DeckBuilder.totalCount(deck)}/${DeckBuilder.DECK_SIZE} cards · ${valid.valid ? '<span style="color:var(--success)">Ready</span>' : '<span style="color:var(--warning)">Incomplete</span>'}</div>
          <div class="thumbs">${thumbs.map(c => `<img src="${UI.cardImg(c)}" onerror="this.style.opacity=0">`).join('')}</div>
        `;
        el.addEventListener('click', () => openDeckEditor(deck.id));
        grid.appendChild(el);
      });
      container.appendChild(grid);
    }
    container.querySelector('#new-deck-btn').addEventListener('click', makeDeck);
  }
  async function makeDeck(){
    const wrap = document.createElement('div');
    wrap.innerHTML = `<label class="field"><span>Deck name</span><input type="text" id="new-deck-name" class="search-input" style="border-radius:6px;" value="New Deck"></label>`;
    const ok = await UI.dialog({ title:'Create Deck', body: wrap, actions:[{label:'Cancel',variant:'ghost',value:false},{label:'Create',variant:'primary',value:true}] });
    if(!ok) return;
    const name = wrap.querySelector('#new-deck-name').value.trim() || 'New Deck';
    const deck = DeckBuilder.createDeck(name);
    openDeckEditor(deck.id);
  }

  /* ---------- Deck editor page ---------- */
  let editingId = null, editorFilter = '';
  function openDeckEditor(id){ editingId = id; UI.navigate('deckedit', { title: 'Edit Deck' }); }

  function renderEditor(container){
    const deck = DeckBuilder.getDeck(editingId);
    if(!deck){ container.innerHTML = ''; container.appendChild(UI.emptyState({ title:'Deck not found', body:'It may have been deleted.', actionLabel:'Back to Decks', onAction:()=>UI.navigate('decks') })); return; }
    const owned = Binder.getOwned();
    const validation = DeckBuilder.validate(deck);
    container.innerHTML = `
      <div class="section-head">
        <h2>${UI.escapeHtml(deck.name)}</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost btn-sm" id="deck-back">← Back</button>
          <button class="btn btn-secondary btn-sm" id="deck-rename">Rename</button>
          <button class="btn btn-danger btn-sm" id="deck-delete">Delete</button>
        </div>
      </div>
      <div class="builder-layout">
        <div class="builder-list">
          <input type="text" class="search-input" id="editor-search" placeholder="Search your binder…" style="margin-bottom:12px; width:100%;">
          <div id="editor-owned-list"></div>
        </div>
        <div class="builder-side">
          <div class="validation-msg ${validation.valid ? 'ok' : 'bad'}">${validation.valid ? 'Deck is tournament-ready.' : validation.errors.join(' ')}</div>
          <h4 style="margin-bottom:10px;">In Deck (${validation.total}/${DeckBuilder.DECK_SIZE})</h4>
          <div id="editor-deck-list" style="flex:1; overflow-y:auto;"></div>
          <button class="btn btn-primary btn-block" style="margin-top:12px;" id="deck-play-btn" ${validation.valid ? '' : 'disabled'}>Play with this deck</button>
        </div>
      </div>
    `;
    renderOwnedList(container, owned, deck);
    renderDeckList(container, deck);
    container.querySelector('#deck-back').onclick = () => UI.navigate('decks');
    container.querySelector('#deck-rename').onclick = async () => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<label class="field"><span>Deck name</span><input type="text" id="rn" class="search-input" style="border-radius:6px; width:100%;" value="${UI.escapeHtml(deck.name)}"></label>`;
      const ok = await UI.dialog({ title:'Rename Deck', body:wrap, actions:[{label:'Cancel',variant:'ghost',value:false},{label:'Save',variant:'primary',value:true}] });
      if(ok){ DeckBuilder.renameDeck(deck.id, wrap.querySelector('#rn').value.trim() || deck.name); renderEditor(container); }
    };
    container.querySelector('#deck-delete').onclick = async () => {
      const ok = await UI.confirmDialog('Delete this deck?', 'This cannot be undone.', 'Delete');
      if(ok){ DeckBuilder.deleteDeck(deck.id); UI.navigate('decks'); }
    };
    container.querySelector('#deck-play-btn').onclick = () => Engine.startMatch(deck.id);
    container.querySelector('#editor-search').addEventListener('input', (e) => { editorFilter = e.target.value.toLowerCase(); renderOwnedList(container, owned, deck); });
  }

  function renderOwnedList(container, owned, deck){
    const list = container.querySelector('#editor-owned-list');
    const filtered = owned.filter(({card}) => card.name.toLowerCase().includes(editorFilter));
    if(!filtered.length){ list.innerHTML = '<p style="color:var(--text-dim); font-size:13px;">No matching cards in your binder.</p>'; return; }
    list.innerHTML = filtered.map(({card, entry}) => {
      const inDeck = deck.cards[card.id] || 0;
      return `<div class="deck-row" data-card="${card.id}">
        <img src="${UI.cardImg(card)}" onerror="this.style.opacity=0">
        <span class="n">${UI.escapeHtml(card.name)} <span style="color:var(--text-faint)">(own ${entry.quantity})</span></span>
        <span class="qty-ctl">
          <button class="btn-icon dec" style="width:24px;height:24px;">−</button>
          <span>${inDeck}</span>
          <button class="btn-icon inc" style="width:24px;height:24px;">+</button>
        </span>
      </div>`;
    }).join('');
    list.querySelectorAll('.deck-row').forEach(row => {
      const cardId = row.dataset.card;
      const entry = owned.find(o => o.card.id === cardId).entry;
      row.querySelector('.inc').onclick = () => {
        const cur = deck.cards[cardId] || 0;
        if(cur >= entry.quantity){ UI.toast("You don't own more copies of this card.", 'warning'); return; }
        DeckBuilder.setCardCount(deck.id, cardId, cur + 1);
        renderEditor(container);
      };
      row.querySelector('.dec').onclick = () => {
        const cur = deck.cards[cardId] || 0;
        DeckBuilder.setCardCount(deck.id, cardId, Math.max(0, cur - 1));
        renderEditor(container);
      };
    });
  }

  function renderDeckList(container, deck){
    const list = container.querySelector('#editor-deck-list');
    const entries = Object.entries(deck.cards);
    if(!entries.length){ list.innerHTML = '<p style="color:var(--text-dim); font-size:13px;">Add cards from your binder on the left.</p>'; return; }
    list.innerHTML = entries.map(([cardId, qty]) => {
      const card = Binder._getMeta(cardId);
      if(!card) return '';
      return `<div class="deck-row"><img src="${UI.cardImg(card)}" onerror="this.style.opacity=0"><span class="n">${UI.escapeHtml(card.name)}</span><span class="qty-ctl">×${qty}</span></div>`;
    }).join('');
  }

  UI.registerPage('decks', renderDecks);
  UI.registerPage('deckedit', renderEditor);
  global.DeckBuilder = DeckBuilder;
})(window);
