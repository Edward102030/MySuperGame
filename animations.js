/* ============================================================
   animations.js — lightweight animation engine
   CSS transforms/opacity drive everything (GPU friendly).
   Global speed setting is applied via a data-attribute on <html>,
   so every CSS transition/duration in style.css scales together.
   ============================================================ */
(function(global){
  const queue = [];
  let running = false;

  function applySpeedSetting(speed){
    document.documentElement.setAttribute('data-anim-speed', speed || 'normal');
  }

  function wait(ms){ return new Promise(res => setTimeout(res, ms)); }

  /** Run animations one at a time so conflicting effects never overlap. */
  async function enqueue(fn){
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      pump();
    });
  }
  async function pump(){
    if(running || !queue.length) return;
    running = true;
    const { fn, resolve, reject } = queue.shift();
    Events.emit('AnimationStarted');
    try{ const r = await fn(); resolve(r); }
    catch(e){ reject(e); }
    Events.emit('AnimationCompleted');
    running = false;
    if(queue.length) pump(); else Events.emit('QueueEmpty');
  }

  const Animations = {
    applySpeedSetting, enqueue, wait,

    /** Add + auto-remove a CSS animation class on an element. */
    async pulse(el, cls, ms = 350){
      if(!el) return;
      el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
      await wait(ms);
      el.classList.remove(cls);
    },

    async shake(el){ return Animations.pulse(el, 'fx-shake', 350); },

    async knockOut(el){
      if(!el) return;
      return new Promise(res => {
        el.classList.add('fx-ko');
        setTimeout(() => { el.classList.remove('fx-ko'); res(); }, 320);
      });
    },

    async fadeSwap(container, renderFn){
      if(!container){ renderFn(); return; }
      container.style.transition = `opacity var(--dur-base) var(--ease)`;
      container.style.opacity = '0';
      await wait(160);
      renderFn();
      container.style.opacity = '1';
    },

    toastEnter(el){ el.style.animation = ''; },

    /** Deal-style stagger for revealed cards (booster opening). */
    staggerReveal(container, count, delayMs = 140){
      const els = container.querySelectorAll('.reveal-card');
      els.forEach((el, i) => { el.style.animationDelay = (i * delayMs) + 'ms'; });
    }
  };

  global.Animations = Animations;
})(window);
