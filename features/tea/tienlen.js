const crypto = require('node:crypto');
const { readCardGames, activeCardGame } = require('./card-coordination');

const TURN_MS = 30_000;
const REQUEST = /^[a-zA-Z0-9-]{12,80}$/;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const iso = value => new Date(value).toISOString();
const strength = card => card.rank * 4 + card.suit;
const sorted = cards => [...cards].sort((a, b) => strength(a) - strength(b));
const fail = (status, message, code) => { throw Object.assign(new Error(message), { status, code, tienLenError: true }); };

function makeDeck() {
  const deck = [];
  for (let rank = 3; rank <= 15; rank++) for (let suit = 0; suit < 4; suit++) deck.push({ id: `tl-${rank}-${suit}`, rank, suit });
  for (let i = deck.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

function classify(cards) {
  if (!Array.isArray(cards) || !cards.length || cards.length > 13) return null;
  if (cards.some(card => !card || typeof card.id !== 'string' || !Number.isInteger(card.rank) || card.rank < 3 || card.rank > 15 || !Number.isInteger(card.suit) || card.suit < 0 || card.suit > 3)) return null;
  if (new Set(cards.map(card => card.id)).size !== cards.length || new Set(cards.map(card => strength(card))).size !== cards.length) return null;
  const hand = sorted(cards), high = hand.at(-1), groups = new Map();
  for (const card of hand) groups.set(card.rank, (groups.get(card.rank) || 0) + 1);
  const ranks = [...groups.keys()], consecutive = ranks.every((rank, index) => index === 0 || rank === ranks[index - 1] + 1);
  let kind = null;
  if (cards.length === 1) kind = 'single';
  else if (groups.size === 1 && cards.length <= 4) kind = ({ 2: 'pair', 3: 'triple', 4: 'four' })[cards.length];
  else if (groups.size === cards.length && cards.length >= 3 && high.rank < 15 && consecutive) kind = 'straight';
  else if ((cards.length === 6 || cards.length === 8) && high.rank < 15 && [...groups.values()].every(count => count === 2) && consecutive) kind = cards.length === 6 ? 'pairs3' : 'pairs4';
  return kind ? { kind, length: cards.length, high: strength(high), rank: high.rank, suit: high.suit } : null;
}

function combination(value) { return Array.isArray(value) ? classify(value) : value?.cards ? classify(value.cards) : value; }
function beats(candidate, top) {
  const next = combination(candidate), previous = combination(top);
  if (!next) return false;
  if (!previous) return !top;
  if (next.kind === previous.kind && next.length === previous.length) return next.kind === 'four' ? next.rank > previous.rank : next.high > previous.high;
  const singleTwo = previous.kind === 'single' && previous.rank === 15;
  const pairTwo = previous.kind === 'pair' && previous.rank === 15;
  if (next.kind === 'pairs3') return singleTwo;
  if (next.kind === 'four') return singleTwo || pairTwo || previous.kind === 'pairs3';
  if (next.kind === 'pairs4') return singleTwo || pairTwo || previous.kind === 'pairs3' || previous.kind === 'four';
  return false;
}

// At most thirteen cards are held, so enumerating subsets is bounded (8,191).
// Only the bot's own hand and the public trick are considered.
function legalMoves(hand, top = null, openingCardId = null, offTurn = false) {
  if (!Array.isArray(hand) || hand.length > 13) return [];
  const moves = [];
  for (let mask = 1; mask < 2 ** hand.length; mask++) {
    const cards = hand.filter((_, i) => mask & (1 << i));
    if (openingCardId && !cards.some(card => card.id === openingCardId)) continue;
    const shape = classify(cards);
    if (!shape || (offTurn && (shape.kind !== 'pairs4' || !top)) || !beats(shape, top)) continue;
    moves.push(sorted(cards));
  }
  return moves;
}
function chooseMove(hand, top = null, openingCardId = null, offTurn = false) {
  const moves = legalMoves(hand, top, openingCardId, offTurn);
  moves.sort((a, b) => {
    const one = classify(a), two = classify(b);
    if (!top) return b.length - a.length || one.high - two.high;
    const oneBomb = one.kind === combination(top).kind ? 0 : 1, twoBomb = two.kind === combination(top).kind ? 0 : 1;
    return oneBomb - twoBomb || one.high - two.high || a.length - b.length;
  });
  return moves[0] || null;
}

function createTienLen({ db, now = () => Date.now(), tableIds = [] }) {
  const games = () => db.collection('tea_tienlen_games');
  const attempts = () => db.collection('tea_tienlen_actions');
  const starts = () => db.collection('tea_tienlen_starts');
  let io = null;

  function metadata(table, game, walletId, otherGame = null) {
    const seatedPlayers = table?.seats.filter(seat => seat.walletId).map(seat => seat.walletId) || [];
    return { member: Boolean(game?.players.includes(walletId)), hostId: table?.ownerId || null, seatedPlayers, cardGameActive: Boolean(otherGame), activeCardGame: game?.status === 'active' ? 'tienlen' : otherGame || null, canStart: Boolean(table?.ownerId === walletId && seatedPlayers.length <= 4 && game?.status !== 'active' && !otherGame) };
  }
  function view(game, walletId, table, otherGame = null) {
    if (!game) return null;
    return {
      id: game.id, tableId: game.tableId, status: game.status, version: game.version,
      players: game.players.map(id => ({ id, name: game.names[id], bot: id.startsWith('bot:'), cards: game.hands[id]?.length || 0 })),
      hand: sorted(game.hands[walletId] || []), turn: game.players[game.turnIndex], turnEndsAt: game.turnEndsAt, serverNow: now(),
      top: game.top || null, passed: [...game.passed], openingCardId: game.openingCardId || null,
      winnerId: game.winnerId || null, reason: game.reason || null, lastAction: game.lastAction || null,
      ...metadata(table, game, walletId, otherGame),
    };
  }
  function record(game, playerId, type, cards, at) {
    game.version = (game.version || 1) + 1;
    game.lastAction = { playerId, type, cards: sorted(cards), at };
  }
  function setTurn(game, playerId, at) { game.turnIndex = game.players.indexOf(playerId); game.turnEndsAt = at + TURN_MS; }
  function advance(game, playerId, at) {
    const owner = game.top?.playerId;
    if (owner && game.players.every(id => id === owner || game.passed.includes(id))) {
      game.top = null; game.passed = []; setTurn(game, owner, at); return;
    }
    const from = game.players.indexOf(playerId);
    for (let step = 1; step <= game.players.length; step++) {
      const next = game.players[(from + step) % game.players.length];
      if (!game.passed.includes(next)) { setTurn(game, next, at); return; }
    }
  }
  function play(game, playerId, cards, at, timeout = false) {
    const shape = classify(cards), used = new Set(cards.map(card => card.id));
    game.hands[playerId] = game.hands[playerId].filter(card => !used.has(card.id));
    game.top = { cards: sorted(cards), ...shape, playerId };
    game.passed = game.passed.filter(id => id !== playerId);
    game.openingCardId = null;
    record(game, playerId, timeout ? 'timeout_play' : 'play', cards, at);
    if (!game.hands[playerId].length) {
      game.status = 'finished'; game.winnerId = playerId; game.finishedAt = iso(at); return;
    }
    advance(game, playerId, at);
  }
  function pass(game, playerId, at, timeout = false) {
    if (!game.passed.includes(playerId)) game.passed.push(playerId);
    record(game, playerId, timeout ? 'timeout_pass' : 'pass', [], at);
    advance(game, playerId, at);
  }
  function checkPlayers(game, table) {
    if (game.status === 'active' && game.players.some(id => !id.startsWith('bot:') && !table.seats.some(seat => seat.walletId === id))) {
      game.status = 'finished'; game.winnerId = null; game.reason = 'player_left'; game.finishedAt = iso(now()); game.version++;
    }
  }
  function progress(game) {
    for (let guard = 0; guard < 512 && game.status === 'active'; guard++) {
      const playerId = game.players[game.turnIndex];
      if (playerId.startsWith('bot:')) {
        const at = game.turnEndsAt - TURN_MS;
        const cards = chooseMove(game.hands[playerId], game.top, game.openingCardId);
        if (cards) play(game, playerId, cards, at); else pass(game, playerId, at);
        continue;
      }
      if (now() < game.turnEndsAt) break;
      const at = game.turnEndsAt;
      if (game.top) pass(game, playerId, at, true);
      else {
        const hand = sorted(game.hands[playerId]);
        const card = game.openingCardId ? hand.find(value => value.id === game.openingCardId) : hand[0];
        play(game, playerId, [card], at, true);
      }
    }
  }
  async function current(tx, walletId, allowAbsent = false) {
    const room = await tx.get(db.collection('tea_rooms').doc('main'));
    const table = room.exists && room.data().tables.find(value => value.seats.some(seat => seat.walletId === walletId));
    if (!table && !allowAbsent) fail(409, 'Sit at a table first.', 'not_seated');
    return { table: table || null, ref: table ? games().doc(table.id) : null };
  }
  function emit(tableId) { if (tableId) io?.to(`table:${tableId}`).emit('tea:tienlen', { tableId }); }
  function finishResult(result) {
    if (result?.error) fail(result.error.status, result.error.message, result.error.code);
    return result;
  }

  return {
    attachIO(value) { io = value; },
    async start(walletId, input) {
      const requestId = input?.requestId, botCount = input?.botCount ?? 0;
      if (typeof requestId !== 'string' || !REQUEST.test(requestId)) fail(400, 'A request ID is required.', 'bad_request');
      if (!Number.isInteger(botCount) || botCount < 0 || botCount > 3) fail(400, 'Choose 0–3 bots.', 'bad_bot_count');
      const result = await db.runTransaction(async tx => {
        const { table, ref } = await current(tx, walletId);
        if (table.ownerId !== walletId) fail(403, 'Only the table host can start.', 'not_host');
        const activity = await readCardGames(tx, db, table.id), snapshot = activity.tienlen.snapshot;
        const otherGame = activeCardGame(activity, 'tienlen');
        const attemptRef = starts().doc(hash(`${walletId}:${requestId}`)), prior = await tx.get(attemptRef);
        const old = snapshot.exists ? snapshot.data() : null;
        if (prior.exists && (!old || prior.data().gameId !== old.id || prior.data().tableId !== table.id)) fail(409, 'That earlier round has ended. Start with a new request.', 'stale_start');
        const before = old && JSON.stringify(old);
        if (old) { checkPlayers(old, table); progress(old); }
        if (prior.exists) { if (before !== JSON.stringify(old)) tx.update(ref, old); return view(old, walletId, table, otherGame); }
        if (old?.status === 'active' || otherGame) {
          if (old && before !== JSON.stringify(old)) tx.update(ref, old);
          return { tableId: table.id, error: { status: 409, message: 'A card game is already running at this table.', code: 'game_active' } };
        }
        const humans = table.seats.filter(seat => seat.walletId).map(seat => seat.walletId);
        if (humans.length + botCount < 2 || humans.length + botCount > 4) fail(400, 'Tiến lên needs 2–4 players.', 'bad_player_count');
        const names = {};
        for (const id of humans) { const profile = await tx.get(db.collection('tea_profiles').doc(id)); names[id] = profile.exists ? profile.data().nickname : 'Guest'; }
        const players = [...humans, ...Array.from({ length: botCount }, (_, i) => `bot:${i + 1}`)];
        players.filter(id => id.startsWith('bot:')).forEach((id, i) => { names[id] = `BOT ${i + 1}`; });
        const deck = makeDeck(), hands = Object.fromEntries(players.map(id => [id, []]));
        for (let n = 0; n < 13; n++) for (const id of players) hands[id].push(deck.pop());
        const minimum = sorted(Object.values(hands).flat())[0];
        const rematch = old?.status === 'finished' && old.winnerId && players.includes(old.winnerId);
        const leader = rematch ? old.winnerId : players.find(id => hands[id].some(card => card.id === minimum.id));
        const at = now(), game = {
          id: crypto.randomUUID(), tableId: table.id, status: 'active', version: 1, players, names, hands,
          top: null, passed: [], openingCardId: rematch ? null : minimum.id, turnIndex: players.indexOf(leader), turnEndsAt: at + TURN_MS,
          requestId, startedBy: walletId, createdAt: iso(at), winnerId: null, reason: null, lastAction: null,
        };
        progress(game);
        tx.set(ref, game); tx.create(attemptRef, { gameId: game.id, tableId: table.id, walletId, createdAt: iso(at) });
        return view(game, walletId, table);
      });
      emit(result.tableId); return finishResult(result);
    },
    async state(walletId) {
      const result = await db.runTransaction(async tx => {
        const { table, ref } = await current(tx, walletId, true);
        if (!table) return { game: null, ...metadata(null, null, walletId) };
        const activity = await readCardGames(tx, db, table.id), snapshot = activity.tienlen.snapshot;
        const game = snapshot.exists ? snapshot.data() : null, before = game && JSON.stringify(game), otherGame = activeCardGame(activity, 'tienlen');
        if (game) { checkPlayers(game, table); progress(game); }
        const changed = Boolean(game && before !== JSON.stringify(game));
        if (changed) tx.update(ref, game);
        return { game: view(game, walletId, table, otherGame), ...metadata(table, game, walletId, otherGame), changed, tableId: table.id };
      });
      if (result.changed) emit(result.tableId);
      const { changed, tableId, ...publicResult } = result; return publicResult;
    },
    async action(walletId, input) {
      if (typeof input?.requestId !== 'string' || !REQUEST.test(input.requestId) || typeof input?.gameId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(input.gameId)) fail(400, 'A game ID and request ID are required.', 'bad_request');
      if (input.expectedVersion !== undefined && (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)) fail(400, 'Invalid game version.', 'bad_version');
      const result = await db.runTransaction(async tx => {
        const { table, ref } = await current(tx, walletId), snapshot = await tx.get(ref);
        if (!snapshot.exists) fail(404, 'Start a round first.', 'game_not_found');
        const game = snapshot.data();
        if (game.id !== input.gameId) fail(409, 'This round has changed. Refresh the table.', 'stale_game');
        if (!game.players.includes(walletId)) fail(403, 'You are watching this round.', 'not_player');
        const attemptRef = attempts().doc(hash(`${walletId}:${game.id}:${input.requestId}`)), prior = await tx.get(attemptRef);
        const before = JSON.stringify(game); checkPlayers(game, table); progress(game);
        const changed = before !== JSON.stringify(game);
        if (prior.exists) { if (changed) tx.update(ref, game); return view(game, walletId, table); }
        const reject = (status, message, code) => { if (changed) tx.update(ref, game); return { tableId: table.id, error: { status, message, code } }; };
        if (input.expectedVersion !== undefined && input.expectedVersion !== game.version) return reject(409, 'The turn has changed. Refresh the table.', 'stale_game_version');
        if (game.status !== 'active') return reject(409, 'This round has ended.', 'game_finished');
        const turn = game.players[game.turnIndex] === walletId;
        if (input.action === 'pass') {
          if (!turn || game.passed.includes(walletId)) return reject(409, 'Wait for your turn.', 'not_turn');
          if (!game.top) return reject(400, 'The leader must play a card.', 'cannot_pass');
          pass(game, walletId, now());
        } else if (input.action === 'play') {
          const ids = input.cardIds;
          if (!Array.isArray(ids) || !ids.length || ids.length > 13 || ids.some(id => typeof id !== 'string' || id.length > 80) || new Set(ids).size !== ids.length) return reject(400, 'Choose a valid set of cards.', 'invalid_cards');
          const cards = ids.map(id => game.hands[walletId].find(card => card.id === id));
          if (cards.some(card => !card)) return reject(400, 'Those cards are not in your hand.', 'invalid_cards');
          const shape = classify(cards);
          if (!shape || !beats(shape, game.top)) return reject(400, 'That combination cannot beat the table.', 'invalid_combination');
          if (game.openingCardId && !ids.includes(game.openingCardId)) return reject(400, 'The first play must include the lowest dealt card.', 'opening_card_required');
          if ((!turn || game.passed.includes(walletId)) && !(game.top && shape.kind === 'pairs4')) return reject(409, 'Wait for your turn.', 'not_turn');
          play(game, walletId, cards, now());
        } else return reject(400, 'Choose play or pass.', 'bad_action');
        progress(game);
        tx.update(ref, game); tx.create(attemptRef, { walletId, gameId: game.id, createdAt: iso(now()) });
        return view(game, walletId, table);
      });
      emit(result.tableId); return finishResult(result);
    },
    async cancelAfterRestart() {
      for (const tableId of tableIds) {
        const ref = games().doc(tableId);
        await db.runTransaction(async tx => {
          const snapshot = await tx.get(ref);
          if (snapshot.exists && snapshot.data().status === 'active') tx.update(ref, { status: 'finished', reason: 'server_restart', winnerId: null, version: (snapshot.data().version || 1) + 1, finishedAt: iso(now()) });
        });
      }
    },
  };
}

module.exports = { createTienLen, makeDeck, classify, beats, legalMoves, chooseMove, TURN_MS };
