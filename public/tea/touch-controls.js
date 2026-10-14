window.TeaTouchControls = {
  protect(element) {
    if (!element) return;
    for (const event of ['contextmenu','selectstart','dragstart']) element.addEventListener(event, event => event.preventDefault());
  },
  pad(elements, keys, onMove) {
    const pointers = new Map(), directions = {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
    const release = event => {
      const key = pointers.get(event.pointerId); if (!key) return;
      pointers.delete(event.pointerId); if (![...pointers.values()].includes(key)) keys.delete(key);
    };
    const reset = () => {for(const key of pointers.values())keys.delete(key);pointers.clear();};
    for (const button of elements) {
      this.protect(button);
      button.addEventListener('pointerdown', event => {
        if(event.button!==0||button.disabled)return;event.preventDefault();
        const key=directions[button.dataset.dir];if(!key)return;
        pointers.set(event.pointerId,key);keys.add(key);button.setPointerCapture(event.pointerId);onMove?.();
      });
      for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,release);
    }
    window.addEventListener('blur',reset);document.addEventListener('visibilitychange',()=>{if(document.hidden)reset()});
    return {reset};
  },
};
