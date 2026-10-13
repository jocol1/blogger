(function(root) {
  // Cursor advances when an action is queued, so polling and retried requests cannot replay it.
  function actionCursor() {
    let gameId = null, version = 0;
    return {
      read(game) {
        const fresh = gameId !== game?.id;
        if (fresh) { gameId = game?.id || null; version = Number(game?.version || 0); return {fresh, actions: []}; }
        const actions = (game?.actionHistory || (game?.lastAction ? [game.lastAction] : []))
          .filter(action => Number(action.version) > version)
          .sort((a,b) => a.version - b.version);
        version = Math.max(version, Number(game?.version || 0), ...actions.map(action => Number(action.version)));
        return {fresh, actions};
      },
      reset() { gameId = null; version = 0; },
    };
  }
  if (typeof module !== 'undefined') { module.exports = {actionCursor}; return; }
  root.TeaCardPlayback = function({target, hand, playerSelector, myId, face, initialCards, onChange}) {
    const cursor = actionCursor(), played = action => /^(play|timeout_play)$/.test(action.type);
    let queue = [], running = false, epoch = 0, current = [], latest = null;
    const flights = new Set(), wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    function stopFlights() { epoch++; queue = []; running = false; for(const node of flights)node.remove(); flights.clear(); delete target.dataset.flying; }
    function visible() { return !document.hidden && target.getClientRects().length > 0; }
    function origins(action) {
      const cards = action.cards || (action.card ? [action.card] : []), player = [...document.querySelectorAll(playerSelector)].find(row => row.dataset.playerId === action.playerId);
      return cards.map(card => {
        const source = action.playerId === myId() ? [...hand.children].find(node => node.dataset.cardId === card.id) : player;
        return source?.getBoundingClientRect() || null;
      });
    }
    function paint(cards, version = '', animate = false) {
      current = cards || [];
      const old = target.querySelector('.card-pile-layer.current'), previous = target.querySelector('.card-pile-layer.previous');
      previous?.remove();
      if (old && animate) { old.classList.replace('current','previous'); old.setAttribute('aria-hidden','true'); }
      else old?.remove();
      target.querySelector('.tl-empty-trick')?.remove();
      if (current.length) {
        const layer = document.createElement('div'); layer.className = 'card-pile-layer current';
        for (const card of current) layer.append(face(card));
        target.append(layer);
      } else {
        const empty = document.createElement('span'); empty.className = 'tl-empty-trick'; empty.textContent = '♠ ♥ ♣ ♦'; target.append(empty);
      }
      target.dataset.cards = current.map(card => card.id).join(','); target.dataset.playVersion = String(version);
      target.classList.toggle('empty', !current.length);
    }
    function snapshot(game) {
      const last = [...(game?.actionHistory || [])].reverse().find(played);
      paint(last ? last.cards || (last.card ? [last.card] : []) : initialCards(game), last?.version || '');
    }
    async function fly(entry, revision) {
      const cards = entry.action.cards || (entry.action.card ? [entry.action.card] : []);
      if (!cards.length) return;
      const end = target.getBoundingClientRect(), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const nodes = [];
      if (!reduced && visible() && end.width > 0) {
        const fallback = origins(entry.action);
        cards.forEach((card,index) => {
          const source = entry.origins[index] || fallback[index] || end, node = face(card);
          node.classList.add('card-flight'); node.setAttribute('aria-hidden','true');
          const width = Math.min(58, Math.max(35, end.width / Math.min(cards.length,4))), height = width * 1.45;
          Object.assign(node.style,{left:source.left+source.width/2-width/2+'px',top:source.top+source.height/2-height/2+'px',width:width+'px',height:height+'px'});
          document.body.append(node); nodes.push(node); flights.add(node);
          const offset = (index - (cards.length-1)/2) * Math.min(width+3, end.width/cards.length);
          node.animate([
            {transform:'translate(0,0) rotate(-7deg)',opacity:1},
            {transform:`translate(${end.left+end.width/2+offset-source.left-source.width/2}px,${end.top+end.height/2-source.top-source.height/2}px) rotate(0deg)`,opacity:1},
          ],{duration:460,easing:'cubic-bezier(.2,.7,.25,1)',fill:'forwards'});
        });
        target.dataset.flying = String(entry.action.version);
        await wait(460);
      }
      for (const node of nodes) { node.remove(); flights.delete(node); }
      if (revision !== epoch) return;
      delete target.dataset.flying;
      paint(cards, entry.action.version, true);
      // Keep the newly landed cards readable before the next queued play covers them.
      await wait(1400);
    }
    async function drain() {
      if (running) return; running = true; const revision = epoch; onChange();
      try {
        while (queue.length && revision === epoch) {
          if (!visible()) { queue = []; snapshot(latest); break; }
          await fly(queue.shift(), revision);
        }
      } finally { if (revision === epoch) { running = false; onChange(); } }
    }
    function clear() {
      stopFlights(); latest = null; current = []; cursor.reset();
      target.replaceChildren(); delete target.dataset.cards; delete target.dataset.playVersion;
    }
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&latest){stopFlights();snapshot(latest);onChange()}});
    return {
      update(game) {
        latest = game; const batch = cursor.read(game);
        if (!game) return clear();
        if (batch.fresh) { stopFlights(); target.replaceChildren(); snapshot(game); return; }
        const actions = batch.actions.filter(played);
        if (!visible()) { stopFlights(); snapshot(game); return; }
        // After a long absence show the current table rather than delaying a live turn with old animations.
        const recent = actions.filter(action => !Number.isFinite(action.at) || action.at >= game.serverNow - 12000);
        if (actions.length && !recent.length) { stopFlights(); snapshot(game); return; }
        for (const action of recent) queue.push({action, origins:origins(action)});
        if (queue.length) drain();
      },
      clear,
      busy:()=>running || queue.length > 0,
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
