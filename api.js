/* ============================================================
   api.js — Pokémon TCG API service layer
   Every external card-data request passes through here.
   Handles: caching, retry/backoff, pagination, error fallback.
   Config: window.APP_CONFIG.pokemonTcgApiKey (optional — the
   public API works unauthenticated at a lower rate limit).
   ============================================================ */
(function(global){
  const BASE = 'https://api.pokemontcg.io/v2';
  const CACHE_TTL = 1000 * 60 * 60 * 12; // 12h metadata cache
  const MAX_RETRIES = 3;

  function getApiKey(){
    return (global.APP_CONFIG && global.APP_CONFIG.pokemonTcgApiKey) || '';
  }

  function cacheGet(key){
    const rec = Persistence.read('apicache:' + key, null);
    if(!rec) return null;
    if(Date.now() - rec.ts > CACHE_TTL) return null;
    return rec.value;
  }
  function cacheSet(key, value){
    Persistence.write('apicache:' + key, { ts: Date.now(), value });
  }

  async function requestWithRetry(url, attempt = 1){
    try{
      const headers = {};
      const key = getApiKey();
      if(key) headers['X-Api-Key'] = key;
      const res = await fetch(url, { headers });
      if(!res.ok){
        if(res.status === 429 && attempt <= MAX_RETRIES){
          await delay(attempt * 800);
          return requestWithRetry(url, attempt + 1);
        }
        throw new Error('API error ' + res.status);
      }
      return await res.json();
    }catch(err){
      if(attempt <= MAX_RETRIES){
        await delay(attempt * 600);
        return requestWithRetry(url, attempt + 1);
      }
      throw err;
    }
  }
  function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

  const Api = {
    /**
     * Search cards. query uses Pokémon TCG API lucene-like syntax,
     * e.g. `name:charizard`, `set.id:sv1`, `supertype:Pokémon`.
     */
    async searchCards({ query = '', page = 1, pageSize = 20, orderBy = '' } = {}){
      const cacheKey = `search:${query}:${page}:${pageSize}:${orderBy}`;
      const cached = cacheGet(cacheKey);
      if(cached) return cached;
      const params = new URLSearchParams();
      if(query) params.set('q', query);
      params.set('page', page);
      params.set('pageSize', pageSize);
      if(orderBy) params.set('orderBy', orderBy);
      try{
        const data = await requestWithRetry(`${BASE}/cards?${params.toString()}`);
        const result = { cards: data.data || [], totalCount: data.totalCount || 0, page, pageSize };
        cacheSet(cacheKey, result);
        return result;
      }catch(err){
        console.warn('Api.searchCards failed, falling back to cache/offline set', err);
        Events.emit('ApiError', { scope:'searchCards', err });
        return { cards: OfflineCards.filter(query), totalCount: 0, page, pageSize, offline:true };
      }
    },

    async getCard(id){
      const cacheKey = 'card:' + id;
      const cached = cacheGet(cacheKey);
      if(cached) return cached;
      try{
        const data = await requestWithRetry(`${BASE}/cards/${id}`);
        cacheSet(cacheKey, data.data);
        return data.data;
      }catch(err){
        return OfflineCards.all.find(c => c.id === id) || null;
      }
    },

    async getSets(){
      const cacheKey = 'sets:all';
      const cached = cacheGet(cacheKey);
      if(cached) return cached;
      try{
        const data = await requestWithRetry(`${BASE}/sets?orderBy=-releaseDate`);
        cacheSet(cacheKey, data.data || []);
        return data.data || [];
      }catch(err){
        return OfflineCards.sets;
      }
    },

    marketPrice(card){
      const tp = card && card.tcgplayer && card.tcgplayer.prices;
      if(!tp) return 0;
      const variant = tp.holofoil || tp.reverseHolofoil || tp.normal || tp['1stEditionHolofoil'] || Object.values(tp)[0];
      return (variant && (variant.market || variant.mid)) || 0;
    },

    formatCurrency(amount){
      const n = Number(amount) || 0;
      return 'NZ$' + n.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  };

  /* ---------- Minimal offline fallback so the app never shows a
     blank screen if the network / API is unreachable. Used only
     as a last resort by searchCards/getCard above. ---------- */
  const OfflineCards = {
    all: [
      mkCard('offline-charizard-ex','Charizard ex','Fire',330,'ex','Stage 2','Charmeleon'),
      mkCard('offline-blastoise-ex','Blastoise ex','Water',330,'ex','Stage 2','Wartortle'),
      mkCard('offline-venusaur-ex','Venusaur ex','Grass',330,'ex','Stage 2','Ivysaur'),
      mkCard('offline-charmander','Charmander','Fire',70,'Basic','Basic',null),
      mkCard('offline-squirtle','Squirtle','Water',70,'Basic','Basic',null),
      mkCard('offline-bulbasaur','Bulbasaur','Grass',70,'Basic','Basic',null)
    ],
    sets: [{ id:'offline', name:'Offline Cache', series:'Local', releaseDate:'2026-01-01', images:{} }],
    filter(query){
      if(!query) return this.all;
      const m = /name:([^\s]+)/i.exec(query);
      const term = (m ? m[1] : query).toLowerCase();
      return this.all.filter(c => c.name.toLowerCase().includes(term));
    }
  };
  function mkCard(id, name, type, hp, stage, supertypeStage, evolvesFrom){
    return {
      id, name, supertype:'Pokémon', subtypes:[stage], types:[type], hp:String(hp),
      stage: supertypeStage, evolvesFrom,
      attacks:[{ name:'Tackle', cost:[type], damage:'30', text:'' }],
      weaknesses:[], resistances:[], retreatCost:['Colorless'],
      set:{ id:'offline', name:'Offline Cache', series:'Local', printedTotal:6, releaseDate:'2026-01-01' },
      number:'1', rarity:'Rare', images:{ small:'', large:'' }, tcgplayer:null
    };
  }

  global.Api = Api;
})(window);
