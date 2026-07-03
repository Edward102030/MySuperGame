/* ============================================================
   storage.js — Persistence Layer + Event Bus
   Single source of truth for reading/writing local data.
   No other module should touch localStorage directly.
   Cloud sync is represented honestly: this build has no live
   backend, so "sync" writes to a namespaced local "cloud" store
   and is queued the same way a real network sync would be —
   swap SyncAdapter.push()/pull() for Firebase/Supabase later
   without touching any other file.
   ============================================================ */
(function(global){
  const NS = 'prizerush:';
  const MATCH_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

  /* ---------- Event Bus ---------- */
  class EventBus{
    constructor(){ this.listeners = {}; }
    on(evt, fn){ (this.listeners[evt] ||= []).push(fn); return () => this.off(evt, fn); }
    off(evt, fn){ if(this.listeners[evt]) this.listeners[evt] = this.listeners[evt].filter(f => f !== fn); }
    emit(evt, payload){ (this.listeners[evt] || []).slice().forEach(fn => { try{ fn(payload); }catch(e){ console.error('[event:'+evt+']', e); } }); }
  }
  const events = new EventBus();

  /* ---------- Low level KV ---------- */
  function read(key, fallback){
    try{
      const raw = localStorage.getItem(NS + key);
      return raw === null ? fallback : JSON.parse(raw);
    }catch(e){ console.warn('storage.read failed', key, e); return fallback; }
  }
  function write(key, value){
    try{ localStorage.setItem(NS + key, JSON.stringify(value)); return true; }
    catch(e){ console.error('storage.write failed', key, e); events.emit('StorageError', { key, error: e }); return false; }
  }
  function remove(key){ try{ localStorage.removeItem(NS + key); }catch(e){/* noop */} }
  function keysWithPrefix(prefix){
    const out = [];
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(NS + prefix)) out.push(k.slice(NS.length));
    }
    return out;
  }

  /* ---------- Sync Adapter (local stand-in for a real backend) ---------- */
  const SyncAdapter = {
    online: navigator.onLine,
    async push(collection, id, payload){
      // In a real backend this would be an authenticated network call.
      write(`cloud:${collection}:${id}`, { payload, updatedAt: Date.now() });
      return true;
    },
    async pull(collection, id){
      return read(`cloud:${collection}:${id}`, null);
    }
  };
  window.addEventListener('online', () => { SyncAdapter.online = true; events.emit('ConnectionRestored'); Persistence.flushQueue(); });
  window.addEventListener('offline', () => { SyncAdapter.online = false; events.emit('ConnectionLost'); });

  /* ---------- Persistence Manager ---------- */
  const Persistence = {
    read, write, remove, keysWithPrefix, events, SyncAdapter,

    /* -- Preferences (local only, never synced) -- */
    getPreferences(){ return read('prefs', { theme:'dark', animSpeed:'normal', reducedMotion:false, soundVolume:70, musicVolume:50 }); },
    setPreferences(p){ write('prefs', p); events.emit('PreferencesChanged', p); },

    /* -- Session (remember-me) -- */
    getSession(){ return read('session', null); },
    setSession(s){ write('session', s); },
    clearSession(){ remove('session'); },

    /* -- Per-user save bundle -- */
    getUserData(userId){
      return read('user:' + userId, {
        profile: null, collection: {}, decks: {}, statistics: Persistence.defaultStats(),
        settings: Persistence.getPreferences(), tournaments: {}, achievements: {},
        wallet: { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, transactions: [] },
        activeTournamentId: null
      });
    },
    saveUserData(userId, data){
      const ok = write('user:' + userId, data);
      if(ok) Persistence.queueSync('users', userId, data);
      events.emit('SaveCompleted', { userId });
      return ok;
    },
    defaultStats(){
      return {
        matchesPlayed:0, matchesWon:0, matchesLost:0,
        tournamentsEntered:0, tournamentsCompleted:0, tournamentWins:0,
        boosterPacksOpened:0, uniqueCardsOwned:0, totalCardsOwned:0
      };
    },

    /* -- Sync queue (offline-first) -- */
    queueSync(collection, id, payload){
      const q = read('syncqueue', []);
      q.push({ id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2,7), collection, entity:id, payload, ts: Date.now(), retries:0, status:'pending' });
      write('syncqueue', q);
      if(SyncAdapter.online) Persistence.flushQueue();
    },
    async flushQueue(){
      let q = read('syncqueue', []);
      if(!q.length) return;
      events.emit('SynchronizationStarted');
      const remaining = [];
      for(const op of q){
        try{ await SyncAdapter.push(op.collection, op.entity, op.payload); }
        catch(e){ op.retries++; if(op.retries < 5) remaining.push(op); }
      }
      write('syncqueue', remaining);
      events.emit('SynchronizationCompleted', { flushed: q.length - remaining.length });
    },

    /* -- Unfinished match autosave / resume (72h window) -- */
    saveMatchSnapshot(userId, snapshot){
      write('match:' + userId, { snapshot, savedAt: Date.now() });
    },
    getResumableMatch(userId){
      const rec = read('match:' + userId, null);
      if(!rec) return null;
      if(Date.now() - rec.savedAt > MATCH_TTL_MS){ remove('match:' + userId); return null; }
      return rec.snapshot;
    },
    clearMatchSnapshot(userId){ remove('match:' + userId); },

    /* -- Tournament persistence -- */
    saveTournamentSnapshot(userId, tid, data){
      const all = read('tourneys:' + userId, {});
      all[tid] = data;
      write('tourneys:' + userId, all);
    },
    getTournament(userId, tid){ return (read('tourneys:' + userId, {}))[tid] || null; },
    getAllTournaments(userId){ return read('tourneys:' + userId, {}); },

    /* -- Backup / export -- */
    exportBackup(userId){
      const data = Persistence.getUserData(userId);
      return JSON.stringify({ exportedAt: Date.now(), userId, data }, null, 2);
    }
  };

  global.Persistence = Persistence;
  global.Events = events;
})(window);
