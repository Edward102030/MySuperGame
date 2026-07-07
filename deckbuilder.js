/* ============================================================
   deckbuilder.js — Deck Builder (independent from gameplay)
   Real Pokémon TCG deck rules: 60 cards, max 4 copies of any
   card EXCEPT Basic Energy (unlimited), per official rules.

   Starter decks: exactly 2 copies of the named ex card (real
   printing, real price — see note below), with every OTHER
   card in the deck capped at NZ$2.00 using live market data.
   Note: an authentic Charizard ex is a chase card and will not
   itself be under $2 — that cap only applies to the supporting
   cast around it, same as real starter-deck products (the box
   costs more than $2 total specifically because of the one
   valuable card inside).
   ============================================================ */
(function(global){
  const DECK_SIZE = 60;
  const MAX_COPIES = 4;
  const PRICE_CAP_NZD = 2.00;
  const TARGET_ENERGY = 17; // realistic energy count for a 60-card deck

  const STARTERS = {
    fire: {
      name:'Ember Striker', primaryType:'Fire', icon:'🔥', exCard:'Charizard ex',
      stage1Name:'Charmeleon', basicName:'Charmander',
      blurb:'Aggressive fire power. Evolve into Charizard ex and overwhelm your opponent.'
    },
    water: {
      name:'Tide Warden', primaryType:'Water', icon:'💧', exCard:'Blastoise ex',
      stage1Name:'Wartortle', basicName:'Squirtle',
      blurb:'Tough and resilient. Blastoise ex soaks hits while you build your bench.'
    },
    grass: {
      name:'Bloom Engine', primaryType:'Grass', icon:'🌿', exCard:'Venusaur ex',
      stage1Name:'Ivysaur', basicName:'Bulbasaur',
      blurb:'Steady and strategic. Grow stronger each turn with Venusaur ex leading the way.'
    }
  };

  function data(){ return Persistence.getUserData(Auth.currentUser.id); }
  function persist(d){ Persistence.saveUserData(Auth.currentUser.id, d); }

  function isBasicEnergy(card){
    return !!card && card.supertype === 'Energy' && ((card.subtypes||[]).includes('Basic') || /^basic-energy-/.test(card.id));
  }
  /** Regex, not exact equality — protects against a differently-encoded
      "é" (from copy/paste hops) silently breaking supertype comparisons. */
  function matchesSupertype(card, wanted){
    if(/^pok.mon$/i.test(wanted)) return /^pok.mon$/i.test(card.supertype||'');
    return card.supertype === wanted;
  }

  const DeckBuilder = {
    STARTERS, DECK_SIZE, MAX_COPIES, PRICE_CAP_NZD,

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

    maxCopiesFor(cardId){
      const card = Binder._getMeta(cardId);
      return isBasicEnergy(card) ? DECK_SIZE : MAX_COPIES;
    },

    setCardCount(deckId, cardId, qty){
      const d=data(); const deck=d.decks[deckId]; if(!deck) return;
      const cap = DeckBuilder.maxCopiesFor(cardId);
      qty=Math.max(0,Math.min(cap,qty));
      if(qty===0) delete deck.cards[cardId]; else deck.cards[cardId]=qty;
      deck.modifiedAt=Date.now(); persist(d);
    },
    totalCount(deck){ return Object.values(deck.cards).reduce((a,b)=>a+b,0); },

    validate(deck){
      const total=DeckBuilder.totalCount(deck); const errors=[];
      if(total !== DECK_SIZE) errors.push(`Needs exactly ${DECK_SIZE} cards (currently ${total}).`);
      for(const [cardId,qty] of Object.entries(deck.cards)){
        const cap = DeckBuilder.maxCopiesFor(cardId);
        if(qty > cap){ errors.push(cap===MAX_COPIES ? `Max ${MAX_COPIES} copies of any card (Basic Energy is unlimited).` : ''); break; }
      }
      return { valid:errors.length===0 && errors.every(e=>!e), errors:errors.filter(Boolean), total };
    },

    /**
     * Builds a real 60-card starter deck:
     *  - exactly 2 copies of the exact named ex card (real printing, real price)
     *  - every other card capped at NZ$2.00 using live market data
     *  - a realistic ~17-energy / ~15-trainer / ~28-Pokémon split
     * Falls back to synthetic placeholder cards only if the live API
     * is unreachable, so the deck can always be built offline too.
     */
    async grantStarterDeck(kind){
      const cfg = STARTERS[kind];
      const d = data();
      const id = 'deck_starter_' + kind;
      if(d.decks[id]) return d.decks[id]; // don't rebuild for returning players
      const deck = { id, name:cfg.name, createdAt:Date.now(), modifiedAt:Date.now(), cards:{}, favorite:true, notes:'', stats:{played:0,won:0,lost:0}, isStarter:true };

      // 1. The headline ex — exact card, cheapest real printing, price shown as-is (not capped).
      const exCard = await findCheapestExact(cfg.exCard, 'Pokémon');
      addToDeck(deck, exCard, 2);

      // 2. Supporting evolution line, capped at NZ$2.00 each.
      const stage1 = await findCheapestExact(cfg.stage1Name, 'Pokémon', PRICE_CAP_NZD);
      addToDeck(deck, stage1, 4);
      const basic = await findCheapestExact(cfg.basicName, 'Pokémon', PRICE_CAP_NZD);
      addToDeck(deck, basic, 6);

      // 3. A couple of cheap filler attackers of the same type, for bench options.
      const fillerPool = await Api.searchCards({ query:`supertype:Pokémon types:${cfg.primaryType}`, pageSize:30, orderBy:'-set.releaseDate' });
      const fillers = (fillerPool.cards||[])
        .filter(c => c.subtypes && c.subtypes.includes('Basic') && c.name!==cfg.basicName && Api.marketPrice(c) <= PRICE_CAP_NZD)
        .slice(0,2);
      fillers.forEach(c => addToDeck(deck, c, 3));

      // 4. Cheap Trainer cards (Items/Supporters), capped, max 4 copies each.
      const trainerPool = await Api.searchCards({ query:'supertype:Trainer', pageSize:30, orderBy:'-set.releaseDate' });
      const trainers = (trainerPool.cards||[]).filter(c => Api.marketPrice(c) <= PRICE_CAP_NZD || Api.marketPriceUSD(c)===0).slice(0,4);
      let trainerBudget = DECK_SIZE - TARGET_ENERGY - DeckBuilder.totalCount(deck);
      for(const t of trainers){
        if(trainerBudget <= 0) break;
        const qty = Math.min(4, trainerBudget);
        addToDeck(deck, t, qty);
        trainerBudget -= qty;
      }

      // 5. Fill the rest with Basic Energy (unlimited copies, negligible real value).
      const energyCard = syntheticBasicEnergy(cfg.primaryType);
      Binder._cacheMeta(energyCard);
      const remaining = Math.max(0, DECK_SIZE - DeckBuilder.totalCount(deck));
      if(remaining > 0){ deck.cards[energyCard.id] = (deck.cards[energyCard.id]||0) + remaining; }

      // Safety: if live data came back thin (offline), pad with more basic energy to hit exactly 60.
      let total = DeckBuilder.totalCount(deck);
      if(total < DECK_SIZE){ deck.cards[energyCard.id] = (deck.cards[energyCard.id]||0) + (DECK_SIZE - total); }
      if(total > DECK_SIZE){
        // trim energy first, then trainers, to land exactly on 60
        let over = total - DECK_SIZE;
        const trimOrder = [energyCard.id, ...trainers.map(t=>t.id)];
        for(const cid of trimOrder){
          if(over<=0) break;
          const cur = deck.cards[cid]||0;
          const cut = Math.min(cur, over);
          deck.cards[cid] = cur - cut;
          if(deck.cards[cid]===0) delete deck.cards[cid];
          over -= cut;
        }
      }

      d.decks[id] = deck; persist(d);
      return deck;
    }
  };

  /** Finds the exact-named card, optionally capped by NZD price, cheapest printing first. */
  async function findCheapestExact(exactName, supertype, maxPrice){
    try{
      const res = await Api.searchCards({ query:`name:"${exactName}"`, pageSize:20, orderBy:'' });
      let matches = (res.cards||[]).filter(c => c.name.toLowerCase() === exactName.toLowerCase() && (!supertype || matchesSupertype(c, supertype)));
      if(maxPrice != null) matches = matches.filter(c => Api.marketPrice(c) <= maxPrice || Api.marketPriceUSD(c)===0);
      matches.sort((a,b) => Api.marketPrice(a) - Api.marketPrice(b));
      if(matches.length) return matches[0];
    }catch(e){ /* fall through to offline card below */ }
    return offlineCard(exactName);
  }

  function offlineCard(name){
    return { id:'offline-'+name.toLowerCase().replace(/\s+/g,'-'), name, supertype:'Pokémon', subtypes:['Basic'], types:['Colorless'], hp:'60',
      attacks:[{name:'Tackle',cost:['Colorless'],damage:'20',text:''}], weaknesses:[], resistances:[], retreatCost:['Colorless'],
      set:{name:'Offline Cache'}, rarity:'Common', images:{}, tcgplayer:null };
  }

  function syntheticBasicEnergy(type){
    // Basic Energy is intentionally not pulled from the live API: it's always
    // available, always cheap (real-world value is negligible), and unlimited
    // per the real rules, so synthesizing it keeps deck-building reliable offline.
    return {
      id: 'basic-energy-' + type.toLowerCase(), name: `Basic ${type} Energy`, supertype:'Energy', subtypes:['Basic'],
      types:[type], hp:null, attacks:[], weaknesses:[], resistances:[], retreatCost:[],
      set:{ name:'Energy' }, rarity:'Common', images:{}, tcgplayer:null
    };
  }

  function addToDeck(deck, card, qty){
    if(!card) return;
    Binder._cacheMeta(card);
    Binder.addCard(card, qty);
    deck.cards[card.id] = (deck.cards[card.id]||0) + qty;
  }

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
          <div class="count">${DeckBuilder.totalCount(deck)}/${DeckBuilder.DECK_SIZE} · ${v.valid ? '<span class="text-success">Ready</span>' : '<span class="text-warning">Incomplete</span>'}</div>
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
            <span class="text-mono text-dim" style="font-size:12px;">${v.total}/${DeckBuilder.DECK_SIZE}</span>
          </div>
          <div class="progress-bar mb-16"><div class="progress-bar-fill ${v.valid?'success':''}" style="width:${Math.min(100,Math.round((v.total/DeckBuilder.DECK_SIZE)*100))}%"></div></div>
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
      const cap = Math.min(DeckBuilder.maxCopiesFor(card.id), entry.quantity);
      const maxReached = inDeck >= cap;
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
