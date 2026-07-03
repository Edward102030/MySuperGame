/* ============================================================
   ai.js — AI Architecture (Standard difficulty)
   Component pipeline: Observe -> Evaluate -> Generate Legal
   Actions -> Score -> Choose Highest -> Execute -> Wait -> End.
   Structured so future difficulty levels only need a different
   Evaluation/scoring strategy — the pipeline itself stays fixed.
   ============================================================ */
(function(global){

  const AI = {
    async takeTurn(Engine){
      const match = Engine.getMatch();
      if(!match || match.winner || match.activeSide !== 'opp') return;
      await wait(450); // brief pause so the human can read the board

      // Main phase: keep acting on the single highest-scoring legal action until none remain.
      let guard = 0;
      while(guard++ < 12){
        const m = Engine.getMatch();
        if(!m || m.winner || m.activeSide !== 'opp') return;
        const action = chooseBestAction(m);
        if(!action) break;
        await execute(Engine, action);
        await wait(380);
      }

      const m2 = Engine.getMatch();
      if(m2 && !m2.winner && m2.activeSide === 'opp'){
        const attacked = await tryAttack(Engine, m2);
        await wait(300);
        const m3 = Engine.getMatch();
        if(m3 && !m3.winner && m3.activeSide === 'opp') await Engine.endTurn();
      }
    }
  };

  function wait(ms){ return new Promise(r => setTimeout(r, ms)); }

  /** Observe the board and produce every currently-legal non-attack action, scored. */
  function chooseBestAction(match){
    const p = match.players.opp;
    const candidates = [];

    // 1. Evolve whenever possible — AI prefers evolving.
    p.hand.forEach(cardId => {
      const card = Binder._getMeta(cardId);
      if(!card || !card.evolvesFrom) return;
      const target = [p.active, ...p.bench].find(s => s && Engine.Rules.canEvolve(s, card, match));
      if(target) candidates.push({ type:'evolve', score: 90, cardId, targetUid: target.uid });
    });

    // 2. Play basic Pokémon to fill the board.
    p.hand.forEach(cardId => {
      const card = Binder._getMeta(cardId);
      if(!card || card.supertype !== 'Pokémon' || card.stage !== 'Basic') return;
      if(!p.active) candidates.push({ type:'playBasicActive', score: 85, cardId });
      else if(p.bench.length < 3) candidates.push({ type:'playBasicBench', score: 60, cardId });
    });

    // 3. Attach energy to whichever attacker is closest to affording its best attack.
    if(!p.energyAttachedThisTurn){
      const energyCard = p.hand.find(id => { const c = Binder._getMeta(id); return c && isEnergyLike(c); });
      if(energyCard){
        const best = bestAttachTarget(p);
        if(best) candidates.push({ type:'attach', score: 70, cardId: energyCard, targetUid: best.uid });
      }
    }

    // 4. Play trainer cards when nothing more urgent is available.
    p.hand.forEach(cardId => {
      const card = Binder._getMeta(cardId);
      if(!card) return;
      if(card.supertype === 'Trainer' || (!card.supertype && !isEnergyLike(card) && card.supertype !== 'Pokémon')){
        candidates.push({ type:'trainer', score: 40, cardId });
      }
    });

    if(!candidates.length) return null;
    candidates.sort((a,b) => b.score - a.score);
    return candidates[0];
  }

  function bestAttachTarget(p){
    // Prefer the active Pokémon; fall back to the strongest bench Pokémon.
    if(p.active) return p.active;
    return p.bench[0] || null;
  }

  function isEnergyLike(card){ return card.supertype === 'Energy' || /energy/i.test(card.name || ''); }

  async function execute(Engine, action){
    switch(action.type){
      case 'evolve': return Engine.evolve(action.cardId, action.targetUid);
      case 'playBasicActive': return Engine.playBasic(action.cardId, true);
      case 'playBasicBench': return Engine.playBasic(action.cardId, false);
      case 'attach': return Engine.attachEnergy(action.cardId, action.targetUid);
      case 'trainer': return Engine.playTrainer(action.cardId);
    }
  }

  /** Attack whenever advantageous: use the legal attack with the highest damage. */
  async function tryAttack(Engine, match){
    const p = match.players.opp;
    if(!p.active) return false;
    const card = Binder._getMeta(p.active.cardId);
    const attacks = (card.attacks || []).map((atk, i) => ({ atk, i })).filter(({atk}) => Engine.Rules.attackCostMet(p.active, atk));
    if(!attacks.length) return false;
    attacks.sort((a,b) => (parseInt(b.atk.damage)||0) - (parseInt(a.atk.damage)||0));
    await Engine.attack(attacks[0].i);
    return true;
  }

  global.AI = AI;
})(window);
