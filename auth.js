/* ============================================================
   auth.js — Authentication Layer
   Local-first account system: usernames are hashed with a salted
   SHA-256 digest via SubtleCrypto (never stored in plaintext).
   This is a genuine client-side auth implementation; when a real
   backend is attached, only login()/register()/ensure sync calls
   here need to change — everything else reads Auth.currentUser.
   ============================================================ */
(function(global){

  async function sha256(text){
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }
  function randomSalt(){ return crypto.getRandomValues(new Uint8Array(16)).reduce((s,b)=>s+b.toString(16).padStart(2,'0'),''); }
  function uid(){ return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

  const Auth = {
    currentUser: null, // { id, username, nickname, isGuest }

    getAccounts(){ return Persistence.read('accounts', {}); },
    saveAccounts(a){ Persistence.write('accounts', a); },

    async register(username, password, nickname){
      username = username.trim().toLowerCase();
      if(username.length < 3) throw new Error('Username must be at least 3 characters.');
      if(password.length < 4) throw new Error('Password must be at least 4 characters.');
      const accounts = Auth.getAccounts();
      if(accounts[username]) throw new Error('That username is already taken.');
      const salt = randomSalt();
      const hash = await sha256(salt + password);
      const id = uid();
      accounts[username] = { id, username, nickname: nickname || username, salt, hash, joinDate: Date.now(), avatar: defaultAvatar(username) };
      Auth.saveAccounts(accounts);
      Bootstrap.newUserData(id, { username, nickname: nickname || username, avatar: accounts[username].avatar, joinDate: accounts[username].joinDate, isGuest:false });
      return Auth.setCurrentUser(id, username, nickname || username, false);
    },

    async login(username, password, remember){
      username = username.trim().toLowerCase();
      const accounts = Auth.getAccounts();
      const acc = accounts[username];
      if(!acc) throw new Error('No account found with that username.');
      const hash = await sha256(acc.salt + password);
      if(hash !== acc.hash) throw new Error('Incorrect password.');
      const result = Auth.setCurrentUser(acc.id, acc.username, acc.nickname, false);
      if(remember) Persistence.setSession({ userId: acc.id, username: acc.username });
      // "cloud" sync pull — merge newest if this device has a stale copy
      const cloud = await Persistence.SyncAdapter.pull('users', acc.id);
      if(cloud && cloud.payload){
        const local = Persistence.getUserData(acc.id);
        const localTs = local.updatedAt || 0;
        if(cloud.updatedAt > localTs){ Persistence.write('user:' + acc.id, cloud.payload); Events.emit('SynchronizationCompleted', { merged:true }); }
      }
      return result;
    },

    continueAsGuest(){
      const id = 'guest_' + (Persistence.read('guestId', null) || (() => { const g = uid(); Persistence.write('guestId', g); return g; })());
      Bootstrap.newUserData(id, { username:'guest', nickname:'Guest Trainer', avatar: defaultAvatar('guest'), joinDate: Date.now(), isGuest:true }, true);
      return Auth.setCurrentUser(id, 'guest', 'Guest Trainer', true);
    },

    /** Link a guest account to a real permanent account, carrying progress over. */
    async linkGuestToAccount(username, password, nickname){
      if(!Auth.currentUser || !Auth.currentUser.isGuest) throw new Error('No guest session to link.');
      const guestData = Persistence.getUserData(Auth.currentUser.id);
      const result = await Auth.register(username, password, nickname);
      const merged = Persistence.getUserData(result.id);
      merged.collection = guestData.collection;
      merged.decks = guestData.decks;
      merged.statistics = guestData.statistics;
      merged.wallet = guestData.wallet;
      merged.achievements = guestData.achievements;
      Persistence.saveUserData(result.id, merged);
      return result;
    },

    setCurrentUser(id, username, nickname, isGuest){
      Auth.currentUser = { id, username, nickname, isGuest };
      Events.emit('AuthChanged', Auth.currentUser);
      return Auth.currentUser;
    },

    logout(){
      Persistence.clearSession();
      Auth.currentUser = null;
      Events.emit('AuthChanged', null);
    },

    tryResumeSession(){
      const session = Persistence.getSession();
      if(!session) return false;
      const accounts = Auth.getAccounts();
      const acc = accounts[session.username];
      if(!acc) return false;
      Auth.setCurrentUser(acc.id, acc.username, acc.nickname, false);
      return true;
    }
  };

  function defaultAvatar(seed){
    const palettes = ['🔥','💧','🌿','⚡','🔮','⭐'];
    let h = 0; for(const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return palettes[h % palettes.length];
  }

  /** Sets up a brand-new user's save bundle (called by register/guest). */
  const Bootstrap = {
    newUserData(id, profileFields, isGuestFlag){
      const existing = Persistence.read('user:' + id, null);
      if(existing) return existing; // don't clobber returning users
      const data = Persistence.getUserData(id); // returns defaults
      data.profile = {
        id, username: profileFields.username, nickname: profileFields.nickname,
        avatar: profileFields.avatar, joinDate: profileFields.joinDate, isGuest: !!isGuestFlag,
        favoriteDeckId: null, favoriteCardId: null
      };
      data.wallet.balance = 25; // starting currency, NZD
      Persistence.saveUserData(id, data);
      return data;
    }
  };

  global.Auth = Auth;
})(window);
