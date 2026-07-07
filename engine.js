/* ============================================================
   engine.js — GameState, Rules Engine, Match Controller
   ============================================================ */
(function(global){
  const BENCH_MAX = 5;
  const HAND_START = 7;
  const PRIZES = 6;

  /* ---------- Helpers ---------- */
  function uid(){ return 's_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function cardStage(card){
    if(!card) return null;
    const sub=(card.subtypes||[]).find(s=>/^(basic|stage 1|stage 2)$/i.test(s));
    return sub || card.stage || (/^pok.mon$/i.test(card.supertype||'')?'Basic':null);
  }
  function isEnergyLike(card){ return card && (card.supertype==='Energy' || /energy/i.test(card.name||'')); }
  function energyType(card){ return (card.types&&card.types[0]) || (card.name||'').replace(/\s*Energy/i,'') || 'Colorless'; }
  function findSlot(p, u){ if(p.active&&p.active.uid===u) return p.active; return p.bench.find(s=>s.uid===u)||null; }

  /* ---------- Rules Engine ---------- */
  const Rules = {
    canPlayBasic(state, side){ const p=state.players[side]; return !p.active || p.bench.length<BENCH_MAX; },
    canAttachEnergy(state, side){ return !state.players[side].energyAttachedThisTurn; },
    canEvolve(slot, card, state){
      if(!slot||slot.turnPlayed===state.turn) return false;
      const meta=Binder._getMeta(slot.cardId);
      return !!(meta && card.evolvesFrom && card.evolvesFrom.toLowerCase()===meta.name.toLowerCase());
    },
    canRetreat(slot){
      if(!slot) return false;
      const meta=Binder._getMeta(slot.cardId);
      const cost=(meta&&meta.retreatCost||[]).length;
      return slot.energy.length>=cost && !slot.statusConditions.includes('Asleep') && !slot.statusConditions.includes('Paralyzed');
    },
    attackCostMet(slot, attack){
      const cost=attack.cost||[]; const pool=[...slot.energy];
      for(const t of cost.filter(c=>c!=='Colorless')){ const i=pool.findIndex(e=>e.toLowerCase()===t.toLowerCase()); if(i===-1) return false; pool.splice(i,1); }
      return pool.length>=(cost.filter(c=>c==='Colorless').length);
    },
    computeDamage(attack, attackerCard, defenderCard){
      let dmg=parseInt(String(attack.damage||'0').replace(/\D/g,''))||0;
      const weak=(defenderCard.weaknesses||[]).find(w=>attackerCard.types&&attackerCard.types.some(t=>t.toLowerCase()===w.type.toLowerCase()));
      const resist=(defenderCard.resistances||[]).find(r=>attackerCard.types&&attackerCard.types.some(t=>t.toLowerCase()===r.type.toLowerCase()));
      if(weak) dmg=Math.floor(dmg*(parseFloat(weak.value)||2));
      if(resist) dmg=Math.max(0,dmg-(parseInt(String(resist.value||'-30').replace(/\D/g,''))||30));
      return dmg;
    },
    isKO(slot, card){ return slot.damage>=(parseInt(card.hp||'0')); },
    prizesForKO(card){
      const name = card.name || '';
      const subtypes = (card.subtypes || []).join(' ');
      if(/vmax/i.test(name) || /vmax/i.test(subtypes)) return 3;
      if(/\bex\b|\bv\b|\bvstar\b|\bgx\b/i.test(name) || /\bex\b|\bv\b|\bvstar\b|\bgx\b/i.test(subtypes)) return 2;
      return 1;
    },
    checkWinner(state){
      for(const side of ['self','opp']){
        const p=state.players[side]; const other=side==='self'?'opp':'self';
        if(p.prizesRemaining<=0) return other;
        if(!p.active&&p.bench.length===0&&state.turn>1) return other;
        if(p.deck.length===0&&p.mustDrawNext) return other;
      }
      return null;
    }
  };

  /* ---------- Match state ---------- */
  let match=null;

  const Engine = {
    Rules,
    getMatch(){ return match; },

    async startMatch(deckId, opts={}){
      const deck=DeckBuilder.getDeck(deckId);
      if(!deck){ UI.toast('Deck not found','error'); return; }
      const v=DeckBuilder.validate(deck);
      if(!v.valid){ UI.toast('Deck is not ready: '+v.errors[0],'warning');
