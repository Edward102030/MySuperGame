/* ============================================================
   economy.js — centralized Economy Service
   All currency math lives here. Nothing else may mutate the
   wallet directly. Currency is always displayed in NZD.
   ============================================================ */
(function(global){

  function data(){ return Persistence.getUserData(Auth.currentUser.id); }
  function persist(d){ Persistence.saveUserData(Auth.currentUser.id, d); }

  const Economy = {
    getBalance(){
      if(!Auth.currentUser) return 0;
      return data().wallet.balance;
    },

    getWallet(){ return data().wallet; },

    /** Adds currency and logs an immutable transaction record. */
    grant(amount, type, source, notes){
      const d = data();
      amount = round2(amount);
      const before = d.wallet.balance;
      d.wallet.balance = round2(before + amount);
      d.wallet.lifetimeEarned = round2(d.wallet.lifetimeEarned + amount);
      const tx = record(d, { type, source, amount, balanceBefore: before, balanceAfter: d.wallet.balance, notes });
      persist(d);
      Events.emit('RewardGranted', { amount, type, source });
      UI.refreshWallet();
      return tx;
    },

    /** Validates and processes a purchase. Throws on failure — caller shows the message. */
    charge(amount, type, source, notes){
      const d = data();
      amount = round2(amount);
      if(d.wallet.balance < amount){
        throw new Error(`Insufficient funds — you need ${Api.formatCurrency(amount - d.wallet.balance)} more.`);
      }
      const before = d.wallet.balance;
      d.wallet.balance = round2(before - amount);
      d.wallet.lifetimeSpent = round2(d.wallet.lifetimeSpent + amount);
      d.wallet.largestPurchase = Math.max(d.wallet.largestPurchase || 0, amount);
      const tx = record(d, { type, source, amount: -amount, balanceBefore: before, balanceAfter: d.wallet.balance, notes });
      persist(d);
      UI.refreshWallet();
      return tx;
    },

    refund(transactionId, reason){
      const d = data();
      const original = d.wallet.transactions.find(t => t.id === transactionId);
      if(!original) throw new Error('Original transaction not found.');
      return Economy.grant(Math.abs(original.amount), 'Refund', original.source, reason);
    },

    getTransactionHistory(limit = 50){
      if(!Auth.currentUser) return [];
      return data().wallet.transactions.slice(-limit).reverse();
    },

    format(amount){ return Api.formatCurrency(amount); }
  };

  function record(d, tx){
    const entry = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      timestamp: Date.now(), ...tx
    };
    d.wallet.transactions.push(entry);
    if(d.wallet.transactions.length > 500) d.wallet.transactions.shift();
    return entry;
  }
  function round2(n){ return Math.round(n * 100) / 100; }

  global.Economy = Economy;
})(window);
