const crypto = require('node:crypto');
const poker = require('./poker');
const { readCardGames } = require('./card-coordination');

const KEYS = ['baicao', 'poker'];
const REVEAL_MS = 30_000;
const REQUEST = /^[a-zA-Z0-9-]{12,80}$/;
const GAME_ID = /^[a-zA-Z0-9-]{1,80}$/;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const iso = value => new Date(value).toISOString();
const fail = (status, message, code) => { throw Object.assign(new Error(message), { status, code, classicCardError: true }); };

function makeDeck() {
  const deck = [];
  for (let rank = 2; rank <= 14; rank++) for (let suit = 0; suit < 4; suit++) deck.push({ id: `bc-${rank}-${suit}`, rank, suit });
  for (let i = deck.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

function score(hand) {
  return {
    points: hand.reduce((total, card) => total + (card.rank === 14 ? 1 : card.rank < 10 ? card.rank : 0), 0) % 10,
    threeFaces: hand.length === 3 && hand.every(card => card.rank >= 11 && card.rank <= 13),
  };
}

function finishBaiCao(game, at) {
  const scores = game.players.map(playerId => ({ playerId, ...score(game.hands[playerId]), hand: game.hands[playerId] }));
  const best = Math.max(...scores.map(value => value.threeFaces ? 10 : value.points));
  game.status = 'finished'; game.finishedAt = iso(at); game.version++;
  game.winnerIds = scores.filter(value => (value.threeFaces ? 10 : value.points) === best).map(value => value.playerId);
}

function progressBaiCao(game, at) {
  if (game.status !== 'active') return;
  const allReady = game.players.every(id => game.ready[id]);
  if (allReady || at >= game.revealEndsAt) finishBaiCao(game, allReady ? at : game.revealEndsAt);
}

function baiCaoView(game, walletId, at) {
  return {
    id: game.id, tableId: game.tableId, key: 'baicao', status: game.status, version: game.version,
    players: game.players.map(id => ({ id, name: game.names[id], bot: id.startsWith('bot:'), cards: game.hands[id].length, ready: Boolean(game.ready[id]) })),
    hand: game.hands[walletId] || [], turn: null, turnEndsAt: game.revealEndsAt, revealEndsAt: game.revealEndsAt, serverNow: at,
    readyCount: game.players.filter(id => game.ready[id]).length, totalPlayers: game.players.length,
    winnerIds: game.winnerIds || [], lastAction: game.lastAction || null, reason: game.reason || null,
    ...(game.status === 'finished' && !game.reason ? { scores: game.players.map(playerId => ({ playerId, ...score(game.hands[playerId]), hand: game.hands[playerId] })) } : {}),
  };
}

function createClassicCards({ db, now = () => Date.now(), tableIds = [] }) {
  const games = () => db.collection('tea_classic_card_games');
  const starts = () => db.collection('tea_classic_card_starts');
  const attempts = () => db.collection('tea_classic_card_actions');
  let io = null;

  function validateKey(key) { if (!KEYS.includes(key)) fail(400, 'Choose Bài cào or Poker.', 'bad_game'); }
  function checkPlayers(game, table, at) {
    if (game.status !== 'active') return;
    const absent = game.players.filter(id => !id.startsWith('bot:') && !table.seats.some(seat => seat.walletId === id));
    if (!absent.length) return;
    if (game.key === 'poker') {
      const noHumans = game.players.filter(id => !id.startsWith('bot:')).every(id => !table.seats.some(seat => seat.walletId === id));
      poker.depart(game, absent, at, noHumans);
    } else {
      game.status = 'finished'; game.version++; game.finishedAt = iso(at); game.reason = 'player_left'; game.winnerIds = [];
    }
  }
  function advance(game, table, at) {
    if (!game) return;
    checkPlayers(game, table, at);
    if (game.key === 'poker') poker.progress(game, at); else progressBaiCao(game, at);
  }
  async function context(tx, walletId, key, allowAbsent = false) {
    const room = await tx.get(db.collection('tea_rooms').doc('main'));
    const table = room.exists && room.data().tables.find(value => value.seats.some(seat => seat.walletId === walletId));
    if (!table && !allowAbsent) fail(409, 'Sit at a table first.', 'not_seated');
    if (!table) return { table: null, rows: {}, refs: {}, before: {} };
    const shared = await readCardGames(tx, db, table.id), refs = {}, rows = {}, before = {};
    for (const [mode, { ref, snapshot }] of Object.entries(shared)) {
      refs[mode] = ref; rows[mode] = snapshot.exists ? snapshot.data() : null;
      before[mode] = rows[mode] && JSON.stringify(rows[mode]);
    }
    return { table, rows, refs, before, key };
  }
  function progressContext(ctx, at) { for (const mode of KEYS) advance(ctx.rows[mode], ctx.table, at); }
  function changedKeys(ctx) { return KEYS.filter(key => ctx.rows[key] && ctx.before[key] !== JSON.stringify(ctx.rows[key])); }
  function saveChanges(tx, ctx) { const changed = changedKeys(ctx); for (const key of changed) tx.set(ctx.refs[key], ctx.rows[key]); return changed; }
  function metadata(ctx, game, walletId) {
    const seatedPlayers = ctx.table?.seats.filter(seat => seat.walletId).map(seat => seat.walletId) || [];
    const activeCardGame = Object.keys(ctx.rows).find(key => ctx.rows[key]?.status === 'active') || null;
    return {
      hostId: ctx.table?.ownerId || null, member: Boolean(game?.players.includes(walletId)), seatedPlayers, activeCardGame,
      canStart: Boolean(ctx.table?.ownerId === walletId && seatedPlayers.length <= 8 && !activeCardGame),
    };
  }
  function view(ctx, game, walletId, at) {
    return game ? { ...(game.key === 'poker' ? poker.view(game, walletId, at) : baiCaoView(game, walletId, at)), ...metadata(ctx, game, walletId) } : null;
  }
  function result(ctx, walletId, at, changed = [], error = null) {
    return { game: view(ctx, ctx.rows[ctx.key], walletId, at), changed, tableId: ctx.table?.id || null, error, meta: metadata(ctx, ctx.rows[ctx.key], walletId) };
  }
  function emit(tableId, changed) { for (const key of changed) io?.to(`table:${tableId}`).emit('tea:classic-card', { tableId, key }); }
  function unwrap(value, state = false) {
    emit(value.tableId, value.changed);
    if (value.error) fail(value.error.status, value.error.message, value.error.code);
    return state ? { game: value.game, ...value.meta } : value.game;
  }

  return {
    attachIO(value) { io = value; },
    departInTransaction(tx, table, activity) {
      const rows = {}, refs = {}, before = {};
      for(const [key, value] of Object.entries(activity)) {
        refs[key] = value.ref; rows[key] = value.snapshot.exists ? value.snapshot.data() : null;
        before[key] = rows[key] && JSON.stringify(rows[key]);
      }
      const ctx = { table, rows, refs, before };
      progressContext(ctx, now());
      return saveChanges(tx, ctx);
    },
    async start(walletId, input) {
      const key = input?.key, requestId = input?.requestId, botCount = input?.botCount === undefined ? 0 : input.botCount;
      validateKey(key);
      if (typeof requestId !== 'string' || !REQUEST.test(requestId)) fail(400, 'A request ID is required.', 'bad_request');
      if (!Number.isInteger(botCount) || botCount < 0 || botCount > 3) fail(400, 'Choose 0–3 bots.', 'bad_bot_count');
      const value = await db.runTransaction(async tx => {
        const ctx = await context(tx, walletId, key), at = now();
        const attemptRef = starts().doc(hash(`${walletId}:${requestId}`)), prior = await tx.get(attemptRef), old = ctx.rows[key];
        if (prior.exists && (!old || prior.data().gameId !== old.id || prior.data().tableId !== ctx.table.id || prior.data().key !== key)) fail(409, 'That earlier round has ended. Start with a new request.', 'stale_start');
        progressContext(ctx, at);
        if (prior.exists) return result(ctx, walletId, at, saveChanges(tx, ctx));
        const reject = (status, message, code) => result(ctx, walletId, at, saveChanges(tx, ctx), { status, message, code });
        if (ctx.table.ownerId !== walletId) return reject(403, 'Only the table host can start.', 'not_host');
        if (metadata(ctx, old, walletId).activeCardGame) return reject(409, 'A card game is already running at this table.', 'game_active');
        const humans = ctx.table.seats.filter(seat => seat.walletId).map(seat => seat.walletId);
        if (humans.length + botCount < 2 || humans.length + botCount > 8) return reject(400, 'This game needs 2–8 players.', 'bad_player_count');
        const names = {};
        for (const id of humans) { const profile = await tx.get(db.collection('tea_profiles').doc(id)); names[id] = profile.exists ? profile.data().nickname : 'Guest'; }
        const players = [...humans, ...Array.from({ length: botCount }, (_, i) => `bot:${i + 1}`)];
        players.filter(id => id.startsWith('bot:')).forEach((id, i) => { names[id] = `BOT ${i + 1}`; });
        const id = crypto.randomUUID();
        let game;
        if (key === 'poker') {
          game = poker.createGame({ id, tableId: ctx.table.id, players, names, now: at, dealerIndex: old ? ((old.dealerIndex || 0) + 1) % players.length : 0 });
        } else {
          const deck = makeDeck(), hands = Object.fromEntries(players.map(id => [id, []]));
          for (let n = 0; n < 3; n++) for (const id of players) hands[id].push(deck.pop());
          game = { id, tableId: ctx.table.id, key, status: 'active', version: 1, players, names, hands,
            ready: Object.fromEntries(players.map(id => [id, id.startsWith('bot:')])), revealEndsAt: at + REVEAL_MS,
            winnerIds: [], lastAction: null, reason: null };
        }
        Object.assign(game, { requestId, startedBy: walletId, createdAt: iso(at) });
        ctx.rows[key] = game; advance(game, ctx.table, at);
        const changed = saveChanges(tx, ctx);
        tx.create(attemptRef, { gameId: game.id, key, tableId: ctx.table.id, walletId, createdAt: iso(at) });
        return result(ctx, walletId, at, changed);
      });
      return unwrap(value);
    },
    async state(walletId, key) {
      validateKey(key);
      const value = await db.runTransaction(async tx => {
        const ctx = await context(tx, walletId, key, true), at = now();
        if (!ctx.table) return result({ ...ctx, key }, walletId, at);
        progressContext(ctx, at);
        return result(ctx, walletId, at, saveChanges(tx, ctx));
      });
      return unwrap(value, true);
    },
    async action(walletId, input) {
      validateKey(input?.key);
      if (typeof input.requestId !== 'string' || !REQUEST.test(input.requestId) || typeof input.gameId !== 'string' || !GAME_ID.test(input.gameId)) fail(400, 'A game ID and request ID are required.', 'bad_request');
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) fail(400, 'A current game version is required.', 'bad_version');
      const value = await db.runTransaction(async tx => {
        const ctx = await context(tx, walletId, input.key), at = now(), game = ctx.rows[input.key];
        if (!game) fail(404, 'Start a round first.', 'game_not_found');
        if (game.id !== input.gameId) fail(409, 'This round has changed. Refresh the table.', 'stale_game');
        if (!game.players.includes(walletId)) fail(403, 'You are watching this round.', 'not_player');
        const attemptRef = attempts().doc(hash(`${walletId}:${game.id}:${input.requestId}`)), prior = await tx.get(attemptRef);
        progressContext(ctx, at);
        if (prior.exists) return result(ctx, walletId, at, saveChanges(tx, ctx));
        const reject = (status, message, code) => result(ctx, walletId, at, saveChanges(tx, ctx), { status, message, code });
        if (input.expectedVersion !== game.version) return reject(409, 'The round has changed. Refresh the table.', 'stale_game_version');
        if (game.status !== 'active') return reject(409, 'This round has ended.', 'game_finished');
        if (game.key === 'baicao') {
          if (input.action !== 'reveal') return reject(400, 'Choose Reveal.', 'bad_action');
          if (game.ready[walletId]) return reject(409, 'Your hand is already ready.', 'already_revealed');
          game.ready[walletId] = true; game.version++; game.lastAction = { playerId: walletId, type: 'reveal', at };
          progressBaiCao(game, at);
        } else {
          const progressed = structuredClone(game);
          try { poker.act(game, walletId, { action: input.action, raiseTo: input.raiseTo }, at); poker.progress(game, at); }
          catch (error) {
            if (!error.classicCardError) throw error;
            ctx.rows[input.key] = progressed;
            return reject(error.status || 400, error.message, error.code || 'bad_action');
          }
        }
        const changed = saveChanges(tx, ctx);
        tx.create(attemptRef, { walletId, gameId: game.id, key: game.key, createdAt: iso(at) });
        return result(ctx, walletId, at, changed);
      });
      return unwrap(value);
    },
    async cancelAfterRestart() {
      for (const tableId of tableIds) for (const key of KEYS) {
        const ref = games().doc(`${tableId}-${key}`);
        await db.runTransaction(async tx => {
          const snapshot = await tx.get(ref);
          if (snapshot.exists && snapshot.data().status === 'active') {
            const game = snapshot.data(); game.status = 'finished'; game.reason = 'server_restart'; game.version++; game.finishedAt = iso(now()); game.winnerIds = [];
            // No money or wallet balance is attached to either casual card game.
            tx.set(ref, game);
          }
        });
      }
    },
  };
}

module.exports = { createClassicCards, makeDeck, score, REVEAL_MS };
