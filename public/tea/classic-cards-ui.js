window.TeaClassicCardsLayout = function (players, viewerId) {
  if (!players.length) return new Map();
  const anchor = Math.max(0, players.findIndex(player => player.id === viewerId)), ordered = [...players.slice(anchor), ...players.slice(0, anchor)];
  const edges = new Map([[ordered[0].id, 'bottom']]), opponents = ordered.slice(1);
  if (opponents.length === 1) edges.set(opponents[0].id, 'top');
  else if (opponents.length === 2) { edges.set(opponents[0].id, 'left'); edges.set(opponents[1].id, 'right'); }
  else {
    const left = Math.floor(opponents.length / 3), right = left, top = opponents.length - left - right;
    opponents.forEach((player, index) => edges.set(player.id, index < left ? 'left' : index < left + top ? 'top' : 'right'));
  }
  return edges;
};
window.TeaClassicCardsUI = function ({api, t, id, myId, myTable, key}) {
  const poker = key === 'poker', prefix = poker ? 'pk-' : 'bc-', root = poker ? 'poker-mode' : 'baicao-mode';
  const $ = name => document.getElementById(prefix + name), suits = ['♠', '♣', '♦', '♥'];
  let game = null, meta = {}, busy = false, fetching = false, generation = 0, retry = null, startRequest = null, errorKey = '', botsTouched = false;
  const text = (element, value) => { if (element && element.textContent !== String(value ?? '')) element.textContent = value ?? ''; };
  const isMember = () => Boolean(game && (game.member ?? game.players.some(player => player.id === myId())));
  const ownTurn = () => Boolean(game?.status === 'active' && isMember() && game.turn === myId());
  const blocked = () => busy || Boolean(retry || startRequest);
  const ranks = {11: 'J', 12: 'Q', 13: 'K', 14: 'A'};
  const cardLabel = card => (ranks[card.rank] || card.rank) + ' ' + t('tlSuit' + card.suit);
  const chips = value => Number.isFinite(Number(value)) ? String(value) : '0';

  function face(card) {
    const element = document.createElement('span'); element.className = 'classic-card' + (card.suit >= 2 ? ' red' : '');
    element.setAttribute('aria-label', cardLabel(card)); element.title = cardLabel(card); element.dataset.cardId = card.id;
    const corner = document.createElement('b'), symbol = document.createElement('span'), bottom = document.createElement('b');
    corner.className = 'classic-card-corner'; bottom.className = 'classic-card-corner bottom'; symbol.className = 'classic-card-symbol';
    for(const part of [corner,bottom]){const number=document.createElement('span'),suit=document.createElement('span');number.className='card-rank';suit.className='card-suit';number.textContent=ranks[card.rank]||card.rank;suit.textContent=suits[card.suit];part.append(number,suit)}symbol.textContent=suits[card.suit];
    element.append(corner, symbol, bottom); return element;
  }
  function back() {
    const element = document.createElement('span'); element.className = 'classic-card card-back'; element.setAttribute('aria-label', t('classicHiddenCard'));
    const pattern = document.createElement('span'); pattern.textContent = '✦'; element.append(pattern); return element;
  }
  function cardsInto(element, cards, count = 0) {
    const signature = cards?.length ? cards.map(card => card.id).join(',') : 'backs:' + count;
    if (element.dataset.signature === signature) return;
    const previous = new Map([...element.children].filter(child => child.dataset.cardId).map(child => [child.dataset.cardId, child]));
    if (cards?.length) element.replaceChildren(...cards.map(card => previous.get(card.id) || face(card)));
    else element.replaceChildren(...Array.from({length: count}, back));
    element.dataset.signature = signature;
  }
  function update(value, metadata) {
    if (!myTable() || (value && value.tableId !== myTable().id)) return clear();
    if (game && value && game.id === value.id && Number(value.version || 0) < Number(game.version || 0)) return;
    if (value && value.status !== 'active' && !(value.member ?? value.players.some(player => player.id === myId()))) value = null;
    if (game?.id !== value?.id) { const input = $('raise'); if (input) { input.value = ''; input.dataset.dirty = ''; } }
    game = value; if (metadata) meta = metadata; render();
  }
  function clear() {
    generation++; game = null; meta = {}; busy = false; retry = null; startRequest = null; errorKey = ''; render();
  }
  function playerStatus(player) {
    if (poker) {
      if (player.folded) return t('pkFolded'); if (player.allIn) return t('pkAllIn');
      if (game.status === 'active' && game.turn === player.id) return t('tlPlaying');
      return player.id === myId() ? t('tlYou') : player.bot ? t('tlBot') : '';
    }
    return game.status === 'active' ? t(player.ready ? 'bcReady' : 'bcWaiting') : (game.winnerIds || []).includes(player.id) ? t('tlWinner') : t('bcRevealed');
  }
  function renderPlayers() {
    const element = $('players'), existing = new Map([...element.querySelectorAll('.classic-player')].map(row => [row.dataset.playerId, row])), seen = new Set(), layout = window.TeaClassicCardsLayout(game.players, myId());
    for (const edge of ['top', 'left', 'right', 'bottom']) if (!element.querySelector('.classic-edge-' + edge)) { const group = document.createElement('div'); group.className = 'classic-edge classic-edge-' + edge; element.append(group); }
    const edgeCount = new Map();
    game.players.forEach((player, index) => {
      let row = existing.get(player.id);
      if (!row) {
        row = document.createElement('div'); row.className = 'classic-player'; row.dataset.playerId = player.id;
        for (const [tag, className] of [['b', 'classic-player-name'], ['small', 'classic-player-badge'], ['div', 'classic-player-cards'], ['span', 'classic-player-info']]) { const child = document.createElement(tag); child.className = className; row.append(child); }
      }
      const edge = layout.get(player.id), group = element.querySelector('.classic-edge-' + edge), slot = edgeCount.get(edge) || 0;
      if (group.children[slot] !== row) group.insertBefore(row, group.children[slot] || null); edgeCount.set(edge, slot + 1); seen.add(player.id);
      row.classList.toggle('mine', player.id === myId()); row.classList.toggle('turn', poker && game.status === 'active' && game.turn === player.id); row.classList.toggle('winner', (game.winnerIds || []).includes(player.id)); row.classList.toggle('folded', Boolean(player.folded));
      text(row.querySelector('.classic-player-name'), (player.bot ? '🤖 ' : '') + player.name); row.querySelector('.classic-player-name').title = player.name;
      const badges = [playerStatus(player)]; if (poker) { if (game.dealerId === player.id) badges.push(t('pkDealer')); if (game.smallBlindId === player.id) badges.push('SB'); if (game.bigBlindId === player.id) badges.push('BB'); }
      text(row.querySelector('.classic-player-badge'), badges.filter(Boolean).join(' · '));
      const score = (game.scores || []).find(item => item.playerId === player.id);
      const revealed = game.status !== 'active' && Array.isArray(player.hand) ? player.hand : game.status !== 'active' && Array.isArray(player.cards) ? player.cards : game.status !== 'active' && Array.isArray(score?.hand) ? score.hand : null;
      cardsInto(row.querySelector('.classic-player-cards'), revealed, poker ? 2 : 3); row.querySelector('.classic-player-cards').hidden = player.id === myId();
      const payout = (game.payouts || []).filter(item => item.playerId === player.id).reduce((total, item) => total + Number(item.amount || 0), 0);
      text(row.querySelector('.classic-player-info'), poker ? t('pkPlayerChips', {stack: chips(player.stack), bet: chips(player.bet)}) + (payout ? ' · ' + t('pkWonChips', {amount: payout}) : '') : score ? score.threeFaces ? t('bcThreeFaces') : t('bcPoints', {points: score.points}) : '');
    }); for (const [playerId, row] of existing) if (!seen.has(playerId)) row.remove();
  }
  function renderResults() {
    const results = $('results'); if (!results) return; const ended = game.status !== 'active'; results.hidden = !ended;
    if (!ended) return; results.replaceChildren();
    const heading = document.createElement('b'), winners = game.players.filter(player => (game.winnerIds || []).includes(player.id)).map(player => player.name);
    heading.textContent = game.reason ? t('gameCanceled') : winners.length ? t(winners.length > 1 ? 'classicTie' : 'winners', {names: winners.join(', ')}) : t('gameEnded'); results.append(heading);
    if (poker) {
      for (const result of game.results || []) {
        const player = game.players.find(item => item.id === result.playerId), line = document.createElement('p');
        const categoryNumber = {high_card:0,pair:1,two_pair:2,three_of_a_kind:3,straight:4,flush:5,full_house:6,four_of_a_kind:7,straight_flush:8}[result.category];
        const category = Number.isInteger(result.category) ? t('pkRank' + result.category) : categoryNumber !== undefined ? t('pkRank' + categoryNumber) : result.rankLabel || t('pkShowdown');
        const amount = (game.payouts || []).filter(item => item.playerId === result.playerId).reduce((sum, item) => sum + Number(item.amount || 0), 0);
        line.textContent = (player?.name || '…') + ' · ' + category + (amount ? ' · ' + t('pkWonChips', {amount}) : ''); results.append(line);
      }
      if (!(game.results || []).length && !game.reason) { const note = document.createElement('p'); note.textContent = t('pkUncontested'); results.append(note); }
    }
  }
  function render() {
    if (!document.getElementById(root)) return;
    const table = myTable(); if (game && table?.id !== game.tableId) return clear();
    if (!table) { game = null; retry = null; startRequest = null; }
    $('lobby').hidden = Boolean(game); $('game').hidden = !game;
    const humans = table?.seats.filter(seat => seat.walletId).length || 0, host = meta.hostId || game?.hostId || table?.ownerId;
    const active = meta.activeCardGame || game?.activeCardGame, otherBusy = active && active !== key;
    const canStart = Boolean(table && host === myId() && humans <= 8 && meta.canStart !== false && game?.canStart !== false && !otherBusy);
    const bots = $('bots'), maximum = Math.min(3, Math.max(0, 8 - humans));
    for (const option of bots.options) option.disabled = Number(option.value) > maximum;
    if (!botsTouched) bots.value = humans === 1 ? '1' : '0'; else if (Number(bots.value) > maximum) bots.value = String(maximum);
    bots.disabled = blocked();
    const rematchBots=$('rematch-bots');for(const option of rematchBots.options)option.disabled=Number(option.value)>maximum;rematchBots.value=bots.value;rematchBots.disabled=blocked()||!canStart;$('rematch-setup').hidden=!game||game.status==='active'||host!==myId();
    $('start').disabled = busy || Boolean(retry) || (!startRequest && (!canStart || humans + Number(bots.value) < 2));
    text($('start'), startRequest && !busy ? t('retryCard') : t('startGame'));
    text($('lobby-status'), errorKey ? t(errorKey) : !table ? t('cardWait') : otherBusy ? t('classicGameBusy') : !canStart ? t('cardsHostWait') : humans + Number(bots.value) < 2 ? t('classicNeedPlayers') : t(poker ? 'pkReady' : 'bcReadyToDeal'));
    $('lobby-status').classList.toggle('error', Boolean(errorKey)); if (!game) return;
    const felt = $('game').querySelector('.classic-felt'); felt.classList.toggle('classic-poker-table', poker); felt.classList.toggle('classic-baicao-table', !poker); felt.dataset.players = game.players.length;
    renderPlayers(); cardsInto($('hand'), game.hand || []); renderResults();
    if (!poker) {
      let center = felt.querySelector('.baicao-table-center');
      if (!center) { center = document.createElement('div'); center.className = 'baicao-table-center'; const symbols = document.createElement('span'); symbols.textContent = '♠ ♥ ♣ ♦'; symbols.setAttribute('aria-hidden', 'true'); const label = document.createElement('small'); center.append(symbols, label); felt.append(center); }
      text(center.querySelector('small'), t(game.status === 'active' ? 'bcFlipTogether' : 'bcRevealed'));
    }
    const ended = game.status !== 'active', member = isMember(), player = game.players.find(item => item.id === game.turn), pending = Boolean(retry || startRequest);
    text($('turn-label'), ended ? game.reason ? t('gameCanceled') : t('cardsFinished') : !member ? t('spectator') : poker ? ownTurn() ? t('yourTurn') : t('theirTurn', {name: player?.name || '…'}) : t('bcReadyCount', {count: game.readyCount || 0, total: game.totalPlayers || game.players.length}));
    if (poker) {
      cardsInto($('board'), game.board || [], 5); const board = $('board');
      if ((game.board || []).length && board.children.length < 5) { while (board.children.length < 5) board.append(back()); }
      text($('stage'), t('pkStage' + (game.stage || 'preflop'))); text($('pot'), t('pkPot', {amount: chips(game.pot)}));
      text($('round-bet'), t('pkCurrentBet', {amount: chips(game.currentBet)}));
      const locked = blocked() || ended || !ownTurn();
      for (const action of ['fold', 'check', 'call', 'raise-button', 'allin']) $(action).disabled = locked;
      $('check').hidden = !game.canCheck; $('call').hidden = Boolean(game.canCheck); $('check').disabled ||= !game.canCheck;
      const stack = Number(game.players.find(item => item.id === myId())?.stack || 0), owed = Number(game.toCall || 0), callAmount = Math.min(owed, stack);
      $('call').disabled ||= owed <= 0 || stack <= 0; text($('call'), t(stack < owed ? 'pkCallAllIn' : 'pkCall', {amount: chips(callAmount)}));
      $('raise-button').disabled ||= !game.canRaise; $('allin').disabled ||= !game.canAllIn;
      const input = $('raise'); input.disabled = locked || !game.canRaise; input.min = game.minRaiseTo || 0; input.max = game.maxRaiseTo || 0;
      if (!input.dataset.dirty && document.activeElement !== input) input.value = game.canRaise ? String(game.minRaiseTo || '') : '';
      text($('raise-help'), game.canRaise ? t('pkRaiseRange', {min: chips(game.minRaiseTo), max: chips(game.maxRaiseTo)}) : t('pkNoRaise'));
      const last = game.lastAction, actor = game.players.find(item => item.id === last?.playerId);
      text($('last-action'), last ? t('pkLast' + String(last.type || last.action || 'move'), {name: actor?.name || '…', amount: last.amount ?? last.raiseTo ?? ''}) : t('pkBlinds'));
      $('controls').hidden = ended || !member || pending;
    } else {
      const own = game.players.find(item => item.id === myId()); $('reveal').disabled = blocked() || ended || !member || Boolean(own?.ready);
      text($('reveal'), t(own?.ready ? 'bcReady' : 'bcReveal')); $('reveal').hidden = ended || !member || pending;
    }
    $('retry').hidden = !pending; $('retry').disabled = busy;
    $('rematch').hidden = !ended; $('rematch').disabled = busy || pending || !canStart || humans+Number(bots.value)<2;
    const message = busy ? 'cardsSending' : errorKey || (pending ? 'cardsRetry' : !member ? 'spectator' : ended ? 'cardsFinished' : poker ? ownTurn() ? 'pkYourChoice' : 'cardsWaitTurn' : game.players.find(item => item.id === myId())?.ready ? 'bcWaitReveal' : 'bcRevealHelp');
    text($('feedback'), t(message)); $('feedback').classList.toggle('error', Boolean(errorKey)); clock();
  }
  function clock() {
    const skew = game && Number.isFinite(game.receivedAt) ? Number(game.serverNow) - game.receivedAt : 0;
    const deadline = poker ? game?.turnEndsAt : game?.revealEndsAt || game?.turnEndsAt;
    text($('clock'), game?.status === 'active' && Number.isFinite(deadline) ? t('secondsLeft', {seconds: Math.max(0, Math.ceil((deadline - (Date.now() + skew)) / 1000))}) : '');
  }
  async function refresh() {
    if (!myTable()) return clear(); if (busy || fetching) return; fetching = true; const revision = generation;
    try { const data = await api('/api/tea/card-games/' + key + '/current'); if (revision === generation && !busy) { if (data.game) data.game.receivedAt = Date.now(); if (errorKey === 'cardsConnection') errorKey = ''; update(data.game, data); } }
    catch (error) { if (revision === generation) { errorKey = 'cardsConnection'; render(); } } finally { fetching = false; }
  }
  function errorMessage(error) {
    const codes = {not_host: 'cardsHostWait', bad_player_count: 'classicNeedPlayers', invalid_player_count: 'classicNeedPlayers', not_turn: 'cardsWaitTurn', not_player: 'spectator', not_seated: 'cardWait', stale_game: 'cardsChanged', stale_game_version: 'cardsChanged', game_finished: 'cardsFinished', game_active: 'classicGameBusy', game_busy: 'classicGameBusy', card_busy: 'classicGameBusy', table_busy: 'classicGameBusy', bad_raise: 'pkInvalidRaise', invalid_raise: 'pkInvalidRaise', raise_too_small: 'pkInvalidRaise', raise_too_large: 'pkInvalidRaise', raise_not_reopened:'pkNoRaise', cannot_raise: 'pkNoRaise', cannot_check: 'pkCannotCheck', already_ready: 'bcWaitReveal', already_revealed: 'bcWaitReveal'};
    return codes[error.code] || 'cardsActionFailed';
  }
  async function mutate(payload, starting = false) {
    if (busy) return; busy = true; generation++; const revision = generation; errorKey = ''; render();
    try {
      const value = await api('/api/tea/card-games/' + key + (starting ? '' : '/action'), {method: 'POST', body: JSON.stringify(payload)});
      if (revision !== generation) return; value.receivedAt = Date.now(); retry = null; startRequest = null; errorKey = '';
      if (poker) { $('raise').dataset.dirty = ''; } update(value);if(starting)document.querySelector('.cards-view').scrollTop=0;
    } catch (error) {
      if (revision !== generation) return; const transient = !error.status || error.status >= 500;
      if (starting) startRequest = transient ? payload : null; else retry = transient ? payload : null;
      errorKey = transient ? 'cardsRetry' : errorMessage(error);
    } finally { if (revision === generation) { busy = false; render(); if (!retry && !startRequest) refresh(); } }
  }
  function start() { if (busy || retry) return; startRequest ||= {botCount: Number($('bots').value), requestId: id()}; mutate(startRequest, true); }
  function action(type) {
    if (blocked() || !game || !isMember() || game.status !== 'active') return;
    if (poker && !ownTurn()) return;
    if (!poker && game.players.find(item => item.id === myId())?.ready) return;
    const payload = {gameId: game.id, expectedVersion: game.version || 1, requestId: id(), action: type};
    if (type === 'raise') { const amount = Number($('raise').value); if (!Number.isSafeInteger(amount) || amount < Number(game.minRaiseTo) || amount > Number(game.maxRaiseTo)) { errorKey = 'pkInvalidRaise'; render(); $('raise').focus(); return; } payload.raiseTo = amount; }
    mutate(payload);
  }
  $('rematch-bots').onchange=()=>{botsTouched=true;$('bots').value=$('rematch-bots').value;render()};$('bots').onchange = () => { botsTouched = true; render(); }; $('start').onclick = start; $('rematch').onclick = start;
  $('retry').onclick = () => { if (retry) mutate(retry); else if (startRequest) mutate(startRequest, true); };
  if (poker) {
    for (const type of ['fold', 'check', 'call', 'allin']) $(type).onclick = () => action(type);
    $('raise-button').onclick = () => action('raise'); $('raise').oninput = () => { $('raise').dataset.dirty = '1'; errorKey = ''; text($('feedback'), t('pkYourChoice')); };
  } else $('reveal').onclick = () => action('reveal');
  render(); return {render, refresh, clock, clear};
};
