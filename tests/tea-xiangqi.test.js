const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createTableGames } = require('../features/tea/table-games');
const { emptyRoom } = require('../features/tea/service');
const X = require('../public/tea/xiangqi-rules');

const at = (row, col) => row * 9 + col;
const put = map => { const cells = Array(90).fill('.'); for (const [sq, piece] of Object.entries(map)) cells[sq] = piece; return cells.join(''); };
const targets = (board, from) => X.movesFrom(board, from).sort((a, b) => a - b);

test('opening position has 44 moves each side and perft matches the reference counts', () => {
  assert.equal(X.legalMoves(X.START, 'red').length, 44);
  assert.equal(X.legalMoves(X.START, 'black').length, 44);
  const perft = (board, side, depth) => depth === 0 ? 1 : X.legalMoves(board, side).reduce((sum, m) => sum + perft(X.applyMove(board, m.from, m.to), X.other(side), depth - 1), 0);
  assert.deepEqual([1, 2, 3].map(depth => perft(X.START, 'red', depth)), [44, 1920, 79666]);
});

test('horse legs, elephant eyes and the river, palace limits and cannon screens', () => {
  // A horse with a blocked leg cannot jump that way.
  let board = put({ [at(9, 4)]: 'K', [at(0, 3)]: 'k', [at(9, 1)]: 'N', [at(8, 1)]: 'P' });
  assert.deepEqual(targets(board, at(9, 1)), [at(8, 3)]);
  // Elephants stay on their own side of the river and are blocked at the eye.
  board = put({ [at(9, 4)]: 'K', [at(0, 3)]: 'k', [at(5, 2)]: 'B', [at(6, 3)]: 'P' });
  assert.deepEqual(targets(board, at(5, 2)), [at(7, 0)], 'the soldier on (6,3) blocks the eye toward (7,4); nothing crosses the river');
  // Advisors and kings never leave the palace.
  board = put({ [at(9, 4)]: 'K', [at(0, 3)]: 'k', [at(8, 4)]: 'A' });
  assert.deepEqual(targets(board, at(8, 4)), [at(7, 3), at(7, 5), at(9, 3), at(9, 5)]);
  // A cannon captures only over exactly one screen and cannot move through it.
  board = put({ [at(9, 5)]: 'K', [at(0, 3)]: 'k', [at(7, 1)]: 'C', [at(4, 1)]: 'P', [at(1, 1)]: 'p' });
  assert.ok(targets(board, at(7, 1)).includes(at(1, 1)), 'captures over one screen');
  assert.ok(!targets(board, at(7, 1)).includes(at(4, 1)), 'cannot take the screen itself');
  assert.ok(!targets(board, at(7, 1)).includes(at(3, 1)), 'cannot slide through the screen');
  board = put({ [at(9, 5)]: 'K', [at(0, 3)]: 'k', [at(7, 1)]: 'C', [at(1, 1)]: 'p' });
  assert.ok(!targets(board, at(7, 1)).includes(at(1, 1)), 'no capture without a screen');
  // Soldiers move sideways only after crossing the river.
  board = put({ [at(9, 4)]: 'K', [at(0, 3)]: 'k', [at(6, 0)]: 'P', [at(4, 4)]: 'P' });
  assert.deepEqual(targets(board, at(6, 0)), [at(5, 0)]);
  assert.deepEqual(targets(board, at(4, 4)), [at(3, 4), at(4, 3), at(4, 5)].sort((a, b) => a - b));
});

test('flying generals, pins, checkmate and stalemate', () => {
  // The chariot shields the kings; it may slide along the file but never leave it.
  let board = put({ [at(9, 4)]: 'K', [at(0, 4)]: 'k', [at(5, 4)]: 'R' });
  assert.ok(!X.isLegal(board, 'red', at(5, 4), at(5, 0)));
  assert.ok(X.isLegal(board, 'red', at(5, 4), at(3, 4)));
  // Kings may not face each other after moving either.
  board = put({ [at(9, 3)]: 'K', [at(0, 4)]: 'k' });
  assert.ok(!X.isLegal(board, 'red', at(9, 3), at(9, 4)), 'moving into the open file is illegal');
  // Two chariots checkmate a lone king.
  board = put({ [at(9, 3)]: 'K', [at(0, 4)]: 'k', [at(0, 8)]: 'R', [at(1, 0)]: 'R' });
  assert.equal(X.status(board, 'black'), 'checkmate');
  // No legal move and no check is a loss too (stalemate).
  board = put({ [at(9, 5)]: 'K', [at(0, 3)]: 'k', [at(1, 8)]: 'R', [at(2, 4)]: 'R' });
  assert.equal(X.status(board, 'black'), 'stalemate');
  assert.equal(X.status(X.START, 'red'), 'ok');
});

test('bot levels answer quickly with legal moves', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const started = Date.now(), move = X.bestMove(X.START, 'red', { level, seed: 'x' });
    assert.ok(Date.now() - started < 400, `${level} took ${Date.now() - started} ms`);
    assert.ok(X.isLegal(X.START, 'red', move.from, move.to));
  }
  const middle = X.applyMove(X.applyMove(X.START, at(7, 7), at(7, 4)), at(0, 7), at(2, 6));
  const started = Date.now(), move = X.bestMove(middle, 'red', { level: 'hard', seed: 'y' });
  assert.ok(Date.now() - started < 400);
  assert.ok(X.isLegal(middle, 'red', move.from, move.to));
  assert.deepEqual(X.bestMove(X.START, 'red', { level: 'medium', seed: 's' }), X.bestMove(X.START, 'red', { level: 'medium', seed: 's' }));
});

async function fixture(count = 1) {
  let clock = 1800000000000;
  const db = new MemoryFirestore(), games = createTableGames({ db, now: () => clock }), room = emptyRoom(), table = room.tables[2];
  for (let n = 0; n < count; n++) { table.seats[n].walletId = 'p' + n; table.seats[n].seatedAt = n + 1; await db.collection('tea_profiles').doc('p' + n).set({ nickname: 'Player ' + n }); }
  table.ownerId = 'p0'; await db.collection('tea_rooms').doc('main').set(room);
  const f = {
    db, games, tick: ms => clock += ms,
    read: async (id = 'p0') => (await games.state(id, 'xiangqi')).game,
    start: (extra = {}, id = 'p0') => games.start(id, { key: 'xiangqi', requestId: crypto.randomUUID(), opponent: 'bot', level: 'medium', ...extra }),
    send: (g, id, extra) => games.action(id, { key: 'xiangqi', gameId: g.id, requestId: crypto.randomUUID(), round: 1, ply: g.moves, ...extra }),
    patch(g, change) { const row = db.rows.get(`tea_social_games/${g.tableId}-xiangqi`); change(row); db.version++; },
    stand(seat) { const row = db.rows.get('tea_rooms/main'); row.tables[2].seats[seat].walletId = null; db.version++; },
  };
  return f;
}
const dummyHistory = (game, plies, board) => { game.xq.history = Array.from({ length: plies }, () => ({ f: 0, t: 0, p: 'p', c: '' })); game.xq.hashes = Array.from({ length: plies + 1 }, () => crypto.randomUUID().slice(0, 12)); game.turnIndex = plies % 2; if (board) game.xq.board = board; };

test('against the bot: legal moves only, the bot answers after a short pause, stale and duplicate requests are safe', async () => {
  const f = await fixture(); let game = await f.start();
  assert.equal(game.myColor, 'red'); assert.equal(game.timed, false); assert.equal(game.board, X.START); assert.equal(game.ratings.p0.rating, 1000);
  await assert.rejects(f.send(game, 'p0', { type: 'move', from: at(9, 0), to: at(5, 0) }), e => e.code === 'xiangqi_bad_move');
  await assert.rejects(f.send(game, 'p0', { type: 'move', from: at(7, 7), to: at(7, 4), ply: 3 }), e => e.code === 'xiangqi_stale');
  const requestId = crypto.randomUUID(), move = { type: 'move', from: at(7, 7), to: at(7, 4), requestId };
  const [one, two] = await Promise.all([f.send(game, 'p0', move), f.send(game, 'p0', move)]);
  assert.equal(one.moves, 1); assert.equal(two.moves, 1);
  await assert.rejects(f.send(one, 'p0', { type: 'move', from: at(7, 4), to: at(7, 5) }), e => e.code === 'xiangqi_not_turn');
  assert.equal((await f.read()).moves, 1, 'bot has not answered yet');
  f.tick(700); game = await f.read();
  assert.equal(game.moves, 2); assert.equal(game.side, 'red'); assert.ok(game.lastMove);
});

test('two players: black waits, clocks run 60 s, timeouts lose, and a table spectator can watch', async () => {
  const f = await fixture(3); let game = await f.start({ opponent: 'friend' });
  assert.deepEqual(game.players.map(p => p.id), ['p0', 'p1']); assert.equal(game.timed, true);
  await assert.rejects(f.send(game, 'p1', { type: 'move', from: at(2, 1), to: at(2, 4) }), e => e.code === 'xiangqi_not_turn');
  await assert.rejects(f.send(game, 'p2', { type: 'move', from: at(7, 7), to: at(7, 4) }), e => e.code === 'spectator');
  game = await f.send(game, 'p0', { type: 'move', from: at(7, 7), to: at(7, 4) });
  const watcher = await f.read('p2'); assert.equal(watcher.member, false); assert.equal(watcher.myColor, null); assert.equal(watcher.moves, 1);
  f.tick(60001); game = await f.read('p0');
  assert.equal(game.status, 'finished'); assert.deepEqual(game.winnerIds, ['p0']); assert.equal(game.reason, 'timeout');
  assert.equal(game.ratingChange, null, 'a game this short is not rated');
});

test('bot game needs no second person but a friend game does', async () => {
  const f = await fixture(1);
  await assert.rejects(f.start({ opponent: 'friend' }), e => e.code === 'xiangqi_need_friend');
  assert.equal((await f.start({ level: 'hard' })).level, 'hard');
});

const mateFor = async (level) => {
  const f = await fixture(); let game = await f.start({ level });
  f.patch(game, row => dummyHistory(row, 4, put({ [at(9, 3)]: 'K', [at(0, 4)]: 'k', [at(1, 0)]: 'R', [at(5, 8)]: 'R' })));
  game = await f.read();
  game = await f.send(game, 'p0', { type: 'move', from: at(5, 8), to: at(0, 8) });
  return { f, game };
};

test('checkmating the bot is rated: harder bots pay more, streaks and the leaderboard update once', async () => {
  const easy = await mateFor('easy'), hard = await mateFor('hard');
  for (const { game } of [easy, hard]) { assert.equal(game.status, 'finished'); assert.deepEqual(game.winnerIds, ['p0']); assert.equal(game.reason, 'checkmate'); }
  assert.ok(hard.game.ratingChange.p0.delta > easy.game.ratingChange.p0.delta);
  assert.equal(easy.game.ratingChange.p0.streak, 1);
  // Polling again (even in parallel) must not rate the game a second time.
  await Promise.all([easy.f.read('p0'), easy.f.read('p0'), easy.f.games.state('p0', 'xiangqi')]);
  const board = await easy.f.games.leaderboard('p0');
  assert.equal(board.me.wins, 1); assert.equal(board.me.rating, easy.game.ratingChange.p0.after); assert.equal(board.top[0].me, true); assert.equal(board.streaks[0].bestStreak, 1);
  assert.equal(Object.keys(board.top[0]).includes('id'), false, 'wallet ids are not published');
  // A second win extends the streak and the Elo gain is smaller because the first one raised the rating.
  const again = await easy.f.start({ level: 'easy' });
  easy.f.patch(again, row => dummyHistory(row, 4, put({ [at(9, 3)]: 'K', [at(0, 4)]: 'k', [at(1, 0)]: 'R', [at(5, 8)]: 'R' })));
  const second = await easy.f.send(await easy.f.read(), 'p0', { type: 'move', from: at(5, 8), to: at(0, 8) });
  assert.equal(second.ratingChange.p0.streak, 2); assert.ok(second.ratingChange.p0.delta <= easy.game.ratingChange.p0.delta);
});

test('resigning a real game costs rating and resets the streak; resigning at once is unrated', async () => {
  const f = await fixture(); let game = await f.start();
  game = await f.send(game, 'p0', { type: 'resign' });
  assert.equal(game.status, 'finished'); assert.equal(game.ratingChange, null);
  game = await f.start(); f.patch(game, row => dummyHistory(row, 4)); game = await f.read();
  game = await f.send(game, 'p0', { type: 'resign' });
  assert.deepEqual(game.winnerIds, ['bot:1']); assert.ok(game.ratingChange.p0.delta < 0); assert.equal(game.ratingChange.p0.streak, 0);
});

test('draws: agreement between friends, and no draw offers to the bot', async () => {
  const f = await fixture(2); let game = await f.start({ opponent: 'friend' });
  game = await f.send(game, 'p0', { type: 'draw' }); assert.equal(game.drawOffer, 'mine');
  assert.equal((await f.read('p1')).drawOffer, 'theirs');
  game = await f.send(game, 'p1', { type: 'draw' });
  assert.equal(game.status, 'finished'); assert.deepEqual(game.winnerIds, []); assert.equal(game.reason, 'agreed');
  const bot = await fixture(); const botGame = await bot.start();
  await assert.rejects(bot.send(botGame, 'p0', { type: 'draw' }), e => e.code === 'xiangqi_no_draw');
});

test('take-backs: free with the bot (3 max, game becomes unrated), friends must agree', async () => {
  const f = await fixture(); let game = await f.start();
  for (let n = 0; n < 3; n++) {
    game = await f.send(game, 'p0', { type: 'move', from: at(7, 7), to: at(7, 4) }); f.tick(700); game = await f.read(); assert.equal(game.moves, 2);
    game = await f.send(game, 'p0', { type: 'undo' }); assert.equal(game.moves, 0); assert.equal(game.board, X.START); assert.equal(game.rated, false);
  }
  game = await f.send(game, 'p0', { type: 'move', from: at(7, 7), to: at(7, 4) }); f.tick(700); game = await f.read();
  await assert.rejects(f.send(game, 'p0', { type: 'undo' }), e => e.code === 'xiangqi_no_undo');

  const g = await fixture(2); let pair = await g.start({ opponent: 'friend' });
  await assert.rejects(g.send(pair, 'p0', { type: 'undo' }), e => e.code === 'xiangqi_cannot_undo');
  pair = await g.send(pair, 'p0', { type: 'move', from: at(7, 7), to: at(7, 4) });
  pair = await g.send(pair, 'p0', { type: 'undo' }); assert.equal(pair.undoOffer, 'mine'); assert.equal(pair.moves, 1);
  assert.equal((await g.read('p1')).undoOffer, 'theirs');
  pair = await g.send(pair, 'p1', { type: 'undo' }); assert.equal(pair.moves, 0); assert.equal(pair.board, X.START); assert.equal(pair.side, 'red');
});

test('hints are bot-only, limited, legal and private to the asker', async () => {
  const f = await fixture(2); const friend = await f.start({ opponent: 'friend' });
  await assert.rejects(f.send(friend, 'p0', { type: 'hint' }), e => e.code === 'xiangqi_no_hint');
  const solo = await fixture(); let game = await solo.start();
  for (let n = 0; n < 3; n++) { game = await solo.send(game, 'p0', { type: 'hint' }); assert.ok(X.isLegal(game.board, 'red', game.hint.from, game.hint.to)); assert.equal(game.hintsLeft, 2 - n); }
  assert.equal(game.rated, false);
  await assert.rejects(solo.send(game, 'p0', { type: 'hint' }), e => e.code === 'xiangqi_no_hint');
});

test('table reactions: players and spectators may send fixed reactions, rate limited, even after the game', async () => {
  const f = await fixture(3); let game = await f.start({ opponent: 'friend' });
  game = await f.send(game, 'p2', { type: 'emote', code: 'clap' });
  assert.equal(game.emotes[0].name, 'Player 2'); assert.equal(game.emotes[0].code, 'clap');
  await assert.rejects(f.send(game, 'p2', { type: 'emote', code: 'clap' }), e => e.code === 'xiangqi_emote_rate');
  await assert.rejects(f.send(game, 'p0', { type: 'emote', code: '<script>' }), e => e.code === 'xiangqi_bad_emote');
  game = await f.send(game, 'p0', { type: 'resign' });
  f.tick(2500); game = await f.send(game, 'p1', { type: 'emote', code: 'tea' });
  assert.equal(game.emotes.length, 2); assert.equal(game.status, 'finished');
});

test('standing up mid-game: forfeit after four moves, cancel before', async () => {
  const early = await fixture(2); let game = await early.start({ opponent: 'friend' });
  early.stand(1); game = await early.read('p0');
  assert.equal(game.status, 'finished'); assert.equal(game.last.canceled, true);
  const late = await fixture(2); game = await late.start({ opponent: 'friend' });
  late.patch(game, row => dummyHistory(row, 4)); late.stand(1); game = await late.read('p0');
  assert.equal(game.status, 'finished'); assert.deepEqual(game.winnerIds, ['p0']); assert.equal(game.reason, 'left'); assert.ok(game.ratingChange.p0.delta > 0); assert.ok(game.ratingChange.p1.delta < 0);
});

test('120 quiet half-moves end the game as a draw', async () => {
  const f = await fixture(); let game = await f.start();
  f.patch(game, row => { dummyHistory(row, 4, put({ [at(9, 3)]: 'K', [at(0, 5)]: 'k', [at(9, 8)]: 'R', [at(0, 0)]: 'r' })); row.xq.quiet = 119; });
  game = await f.read(); game = await f.send(game, 'p0', { type: 'move', from: at(9, 8), to: at(8, 8) });
  assert.equal(game.status, 'finished'); assert.equal(game.reason, 'moveLimit'); assert.deepEqual(game.winnerIds, []);
});

test('a timeout seen by both players at once is rated exactly once', async () => {
  const f = await fixture(2); const game = await f.start({ opponent: 'friend' });
  f.patch(game, row => dummyHistory(row, 4)); f.tick(60001);
  const [a, b] = await Promise.all([f.read('p0'), f.read('p1')]);
  for (const view of [a, b]) { assert.equal(view.reason, 'timeout'); assert.deepEqual(view.winnerIds, ['p1']); }
  await f.read('p0');
  const winner = await f.games.leaderboard('p1'), loser = await f.games.leaderboard('p0');
  assert.equal(winner.me.wins, 1); assert.equal(loser.me.losses, 1); assert.equal(winner.me.rating, 1020); assert.equal(loser.me.rating, 980);
  assert.deepEqual(winner.top.map(row => row.rating), [1020, 980]);
});
