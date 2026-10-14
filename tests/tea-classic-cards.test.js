const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { TABLES } = require('../public/tea/world');
const { createClassicCards, makeDeck, score, REVEAL_MS } = require('../features/tea/classic-cards');
const { ACTION_HOLD_MS } = require('../features/tea/poker');

const request = () => crypto.randomUUID();
const card = (rank, suit = 0) => ({ id: `bc-${rank}-${suit}`, rank, suit });
const code = expected => error => error.classicCardError === true && error.code === expected;

async function fixture(count = 2) {
  let clock = Date.parse('2026-10-13T00:00:00Z');
  const db = new MemoryFirestore(), table = structuredClone(TABLES[2]);
  const players = Array.from({ length: count }, (_, i) => `classic-player-${i + 1}`);
  table.ownerId = players[0]; table.seats.forEach((seat, i) => Object.assign(seat, { walletId: players[i] || null, seatedAt: players[i] ? clock + i : null }));
  const room = { id: 'main', tables: [table] };
  await db.collection('tea_rooms').doc('main').set(room);
  for (const id of players) {
    await db.collection('tea_profiles').doc(id).set({ nickname: id });
    await db.collection('game_wallets').doc(id).set({ balance: 121, remainder: 432, history: [{ id: 'unchanged' }] });
  }
  const classic = createClassicCards({ db, now: () => clock, tableIds: [table.id] });
  const ref = key => db.collection('tea_classic_card_games').doc(`${table.id}-${key}`);
  return { db, classic, table, room, players, ref, now: () => clock, tick(ms) { clock += ms; }, async stored(key = 'baicao') { return (await ref(key).get()).data(); }, async save(game) { await ref(game.key).set(game); } };
}
const start = (f, key = 'baicao', input = {}) => f.classic.start(f.players[0], { key, botCount: 0, requestId: request(), ...input });
const action = (view, input = {}) => ({ key: view.key, gameId: view.id, expectedVersion: view.version, requestId: request(), action: 'reveal', ...input });

async function serviceFixture(count = 2) {
  const f = await fixture(count), { createTeaService } = require('../features/tea/service');
  const tokens = Object.fromEntries(f.players.map(id => [id, crypto.randomBytes(32).toString('hex')]));
  for (const id of f.players) await f.db.collection('game_wallet_tokens').doc(crypto.createHash('sha256').update(tokens[id]).digest('hex')).set({ walletId: id });
  return { ...f, tokens, service: createTeaService({ db: f.db, config: {}, now: f.now }) };
}

test('Bài cào deck has 52 unique cards and ace counts 1 while 10/J/Q/K count zero', () => {
  const deck = makeDeck(); assert.equal(deck.length, 52); assert.equal(new Set(deck.map(value => value.id)).size, 52);
  for (let rank = 2; rank <= 14; rank++) assert.equal(deck.filter(value => value.rank === rank).length, 4);
  assert.deepEqual(score([card(14), card(9), card(10)]), { points: 0, threeFaces: false });
  assert.deepEqual(score([card(7), card(8), card(3)]), { points: 8, threeFaces: false });
  assert.deepEqual(score([card(11), card(12), card(13)]), { points: 0, threeFaces: true });
  assert.equal(score([card(10), card(11), card(13)]).threeFaces, false);
  assert.equal(score([card(14), card(14, 1), card(14, 2)]).threeFaces, false);
});

test('eight players each receive three unique cards and private hands stay hidden before reveal', async () => {
  const f = await fixture(8), view = await start(f), stored = await f.stored();
  assert.equal(view.players.length, 8); assert.equal(view.hand.length, 3); assert.equal(view.version, 1);
  assert.equal(Object.values(stored.hands).every(hand => hand.length === 3), true);
  assert.equal(new Set(Object.values(stored.hands).flat().map(value => value.id)).size, 24);
  for (const id of f.players) {
    const state = await f.classic.state(id, 'baicao');
    assert.deepEqual(state.game.hand, stored.hands[id]); assert.equal('hands' in state.game, false); assert.equal('deck' in state.game, false); assert.equal('scores' in state.game, false);
    assert.equal(state.game.players.every(player => player.cards === 3 && !('hand' in player)), true);
  }
  assert.equal(view.activeCardGame, 'baicao'); assert.equal(view.canStart, false); assert.equal(view.turn, null);
});

test('bots count as ready without exposing their hands and solo human plus bot can finish by revealing', async () => {
  const f = await fixture(1), view = await start(f, 'baicao', { botCount: 3 });
  assert.equal(view.readyCount, 3); assert.equal(view.players.filter(player => player.bot).length, 3); assert.equal('scores' in view, false);
  const finished = await f.classic.action(f.players[0], action(view));
  assert.equal(finished.status, 'finished'); assert.equal(finished.readyCount, 4); assert.equal(finished.scores.length, 4);
  assert.equal(finished.scores.every(value => value.hand.length === 3), true); assert.ok(finished.winnerIds.length);
});

test('all humans must reveal before showing other hands; equal points are joint winners regardless of suit', async () => {
  const f = await fixture(2), view = await start(f), game = await f.stored();
  game.hands[f.players[0]] = [card(9), card(10), card(13)]; game.hands[f.players[1]] = [card(9, 3), card(10, 3), card(12, 3)]; await f.save(game);
  const first = await f.classic.action(f.players[0], action(view));
  assert.equal(first.status, 'active'); assert.equal(first.readyCount, 1); assert.equal('scores' in first, false);
  const second = await f.classic.action(f.players[1], action(first));
  assert.equal(second.status, 'finished'); assert.deepEqual(second.winnerIds, f.players); assert.deepEqual(second.scores.map(value => value.points), [9, 9]);
});

test('ba tây beats nine points; tied ba tây shares win and triple aces have no extra special rule', async () => {
  const f = await fixture(4), view = await start(f), game = await f.stored();
  game.hands[f.players[0]] = [card(11), card(12), card(13)];
  game.hands[f.players[1]] = [card(13, 1), card(13, 2), card(13, 3)];
  game.hands[f.players[2]] = [card(14), card(14, 1), card(14, 2)];
  game.hands[f.players[3]] = [card(9), card(10), card(10, 1)]; await f.save(game);
  f.tick(REVEAL_MS); const finished = (await f.classic.state(f.players[0], 'baicao')).game;
  assert.equal(finished.status, 'finished'); assert.deepEqual(finished.winnerIds, f.players.slice(0, 2));
  assert.equal(finished.scores[2].points, 3); assert.equal(finished.scores[2].threeFaces, false); assert.equal(finished.id, view.id);
});

test('deadline reveals automatically at exactly 30 seconds and stale late action persists the finish', async () => {
  const f = await fixture(), view = await start(f);
  f.tick(REVEAL_MS - 1); assert.equal((await f.classic.state(f.players[0], 'baicao')).game.status, 'active');
  f.tick(1); await assert.rejects(f.classic.action(f.players[0], action(view)), code('stale_game_version'));
  const stored = await f.stored(); assert.equal(stored.status, 'finished'); assert.equal(stored.finishedAt, new Date(f.now()).toISOString());
  const a = (await f.classic.state(f.players[0], 'baicao')).game;
  const b = (await f.classic.state(f.players[0], 'baicao')).game;
  assert.equal(a.version, b.version); assert.deepEqual(a.winnerIds, b.winnerIds); assert.equal(a.scores.length, 2);
});

test('start and reveal retries are scoped, idempotent and return the current caller view', async () => {
  const f = await fixture(), startInput = { key: 'baicao', botCount: 0, requestId: request() };
  const first = await f.classic.start(f.players[0], startInput), payload = action(first);
  const revealed = await f.classic.action(f.players[0], payload);
  const repeated = await f.classic.action(f.players[0], payload); assert.equal(repeated.version, revealed.version); assert.equal(repeated.readyCount, 1);
  const other = await f.classic.action(f.players[1], { ...payload, expectedVersion: revealed.version });
  assert.equal(other.status, 'finished'); assert.deepEqual(other.hand, (await f.stored()).hands[f.players[1]]);
  const retried = await f.classic.start(f.players[0], startInput); assert.equal(retried.id, first.id); assert.equal(retried.status, 'finished');
  for (const [path, value] of f.db.rows) if (path.startsWith('tea_classic_card_actions/') || path.startsWith('tea_classic_card_starts/')) {
    assert.equal('hand' in value, false); assert.equal('hands' in value, false); assert.equal('result' in value, false);
  }
});

test('concurrent duplicate reveal changes a hand only once; simultaneous players use one shared version', async () => {
  const f = await fixture(), view = await start(f), payload = action(view);
  const duplicates = await Promise.all([f.classic.action(f.players[0], payload), f.classic.action(f.players[0], payload)]);
  assert.equal(duplicates[0].version, 2); assert.equal(duplicates[1].version, 2); assert.equal((await f.stored()).ready[f.players[0]], true);
  const finished = await f.classic.action(f.players[1], action(duplicates[0])); assert.equal(finished.status, 'finished');
  const g = await fixture(), initial = await start(g);
  const racing = await Promise.allSettled(g.players.map(id => g.classic.action(id, action(initial))));
  assert.equal(racing.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(racing.find(value => value.status === 'rejected').reason.code, 'stale_game_version');
  assert.equal(Object.values((await g.stored()).ready).filter(Boolean).length, 1);
});

test('invalid inputs, duplicate ready, old game and stale versions cannot mutate cards', async () => {
  const f = await fixture(), view = await start(f);
  for (const patch of [{ expectedVersion: undefined }, { expectedVersion: '1' }, { expectedVersion: 0 }, { expectedVersion: 1.5 }, { requestId: '../bad' }, { gameId: '<bad>' }]) await assert.rejects(f.classic.action(f.players[0], action(view, patch)));
  await assert.rejects(f.classic.action(f.players[0], action(view, { gameId: request() })), code('stale_game'));
  await assert.rejects(f.classic.action(f.players[0], action(view, { expectedVersion: 2 })), code('stale_game_version'));
  await assert.rejects(f.classic.action(f.players[0], action(view, { action: 'play', winnerIds: f.players })), code('bad_action'));
  assert.equal((await f.stored()).version, 1);
  const ready = await f.classic.action(f.players[0], action(view));
  await assert.rejects(f.classic.action(f.players[0], action(ready)), code('already_revealed'));
  const finished = await f.classic.action(f.players[1], action(ready));
  const rematch = await start(f); assert.notEqual(rematch.id, finished.id);
  await assert.rejects(f.classic.action(f.players[0], action(finished)), code('stale_game'));
});

test('only host starts, player counts and bot counts are strictly bounded', async () => {
  const f = await fixture();
  await assert.rejects(f.classic.start(f.players[1], { key: 'baicao', requestId: request(), botCount: 0 }), code('not_host'));
  for (const botCount of ['1', 1.5, -1, 4, null]) {
    await assert.rejects(start(f, 'baicao', { botCount }), code('bad_bot_count'));
  }
  await assert.rejects(start(f, 'unknown'), code('bad_game'));
  const solo = await fixture(1); await assert.rejects(start(solo), code('bad_player_count'));
  const crowded = await fixture(8); await assert.rejects(start(crowded, 'baicao', { botCount: 1 }), code('bad_player_count'));
});

test('spectators have no private hand or action rights; wallets in another table cannot see the game', async () => {
  const f = await fixture(), view = await start(f);
  const observer = 'observer'; Object.assign(f.table.seats[2], { walletId: observer, seatedAt: f.now() });
  await f.db.collection('tea_rooms').doc('main').set(f.room);
  const watched = await f.classic.state(observer, 'baicao'); assert.deepEqual(watched.game.hand, []); assert.equal(watched.member, false);
  assert.equal(watched.game.players.some(player => player.id === observer), false);
  await assert.rejects(f.classic.action(observer, action(view)), code('not_player'));
  const absent = await f.classic.state('another-wallet', 'baicao'); assert.equal(absent.game, null); assert.equal(absent.member, false); assert.equal(absent.canStart, false);
  await assert.rejects(f.classic.action('another-wallet', action(view)), code('not_seated'));
});

test('player leaving cancels Bài cào without naming winners or revealing others', async () => {
  const f = await fixture(), view = await start(f);
  f.table.seats[1].walletId = null; await f.db.collection('tea_rooms').doc('main').set(f.room);
  const current = (await f.classic.state(f.players[0], 'baicao')).game;
  assert.equal(current.status, 'finished'); assert.equal(current.reason, 'player_left'); assert.deepEqual(current.winnerIds, []); assert.equal('scores' in current, false);
  await assert.rejects(f.classic.action(f.players[0], action(view)), code('stale_game_version'));
});

test('color and Tiến lên block classic starts; both classic games cannot start concurrently', async () => {
  for (const [collection, key] of [['tea_card_games', 'color'], ['tea_tienlen_games', 'tienlen']]) {
    const f = await fixture(); await f.db.collection(collection).doc(f.table.id).set({ status: 'active' });
    await assert.rejects(start(f), code('game_active'));
    const state = await f.classic.state(f.players[0], 'baicao'); assert.equal(state.activeCardGame, key); assert.equal(state.canStart, false); assert.equal(state.game, null);
  }
  const f = await fixture();
  const results = await Promise.allSettled([start(f, 'baicao'), start(f, 'poker')]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(results.find(value => value.status === 'rejected').reason.code, 'game_active');
  assert.equal(['baicao', 'poker'].filter(key => f.db.rows.get(`tea_classic_card_games/${f.table.id}-${key}`)?.status === 'active').length, 1);
});

test('rematches reject earlier start retries and failed storage never returns success or records an attempt', async () => {
  const f = await fixture(), payload = { key: 'baicao', requestId: request(), botCount: 0 }, first = await f.classic.start(f.players[0], payload);
  f.tick(REVEAL_MS); await f.classic.state(f.players[0], 'baicao'); await start(f);
  await assert.rejects(f.classic.start(f.players[0], payload), code('stale_start'));
  const active = (await f.classic.state(f.players[0], 'baicao')).game;
  f.db.failWrites = true; await assert.rejects(f.classic.action(f.players[0], action(active)), /storage failure/);
  assert.equal((await f.stored()).ready[f.players[0]], false);
  const clean = await fixture(); clean.db.failWrites = true; await assert.rejects(start(clean), /storage failure/);
  assert.equal((await clean.ref('baicao').get()).exists, false);
  assert.equal([...clean.db.rows.keys()].some(path => path.startsWith('tea_classic_card_starts/')), false);
  assert.notEqual(active.id, first.id);
});

test('neither classic game writes wallet balances or histories; restart cancels active rounds once', async () => {
  const f = await fixture(), walletBefore = f.players.map(id => structuredClone(f.db.rows.get(`game_wallets/${id}`)));
  const c = await start(f); await f.classic.action(f.players[0], action(c));
  await f.classic.cancelAfterRestart(); const canceled = await f.stored();
  assert.equal(canceled.status, 'finished'); assert.equal(canceled.reason, 'server_restart'); assert.deepEqual(canceled.winnerIds, []);
  await f.classic.cancelAfterRestart(); assert.equal((await f.stored()).version, canceled.version);
  const p = await start(f, 'poker'); assert.equal(p.key, 'poker'); await f.classic.cancelAfterRestart();
  assert.equal((await f.stored('poker')).reason, 'server_restart');
  assert.deepEqual(f.players.map(id => f.db.rows.get(`game_wallets/${id}`)), walletBefore);
});

test('card events are table scoped and unchanged polls do not emit again', async () => {
  const f = await fixture(), events = [];
  f.classic.attachIO({ to(room) { return { emit(name, data) { events.push({ room, name, data }); } }; } });
  const view = await start(f); assert.deepEqual(events[0], { room: `table:${f.table.id}`, name: 'tea:classic-card', data: { tableId: f.table.id, key: 'baicao' } });
  await f.classic.state(f.players[0], 'baicao'); assert.equal(events.length, 1);
  await f.classic.action(f.players[0], action(view)); assert.equal(events.length, 2);
  f.tick(REVEAL_MS); await f.classic.state(f.players[0], 'baicao'); assert.equal(events.length, 3);
  assert.equal(events.every(value => !('hand' in value.data)), true);
});

test('Poker actions require owned turn and use the same transaction, version and retry protection', async () => {
  const f = await fixture(), initial = await start(f, 'poker'), stored = await f.stored('poker');
  assert.equal(initial.status, 'active'); assert.equal(initial.hand.length, 2); assert.equal('hands' in initial, false); assert.equal('deck' in initial, false);
  const currentId = initial.turn, otherId = f.players.find(id => id !== currentId);
  await assert.rejects(f.classic.action(otherId, action(initial, { action: 'call' })), code('not_turn'));
  const payload = action(initial, { action: 'call' });
  const called = await f.classic.action(currentId, payload), retried = await f.classic.action(currentId, payload);
  assert.equal(retried.version, called.version); assert.deepEqual(retried.hand, stored.hands[currentId]);
  await assert.rejects(f.classic.action(called.turn, action(initial, { action: 'check' })), code('stale_game_version'));
  assert.equal([...f.db.rows.keys()].filter(path => path.startsWith('tea_classic_card_actions/')).length, 1);
});

test('Poker departure folds the missing human, completes heads-up and leaves virtual stacks conserved', async () => {
  const f = await fixture(), view = await start(f, 'poker'), departed = f.players[1];
  f.table.seats[1].walletId = null; await f.db.collection('tea_rooms').doc('main').set(f.room);
  const result = (await f.classic.state(f.players[0], 'poker')).game, stored = await f.stored('poker');
  assert.equal(result.status, 'finished'); assert.equal(stored.playerState[departed].folded, true);
  assert.deepEqual(result.winnerIds, [f.players[0]]); assert.equal(result.version, view.version + 1);
  assert.equal(Object.values(stored.playerState).reduce((sum, value) => sum + value.stack, 0), 2_000);
  assert.equal(result.players.every(value => !('hand' in value)), true);
  assert.equal((await f.classic.state(f.players[0], 'poker')).game.version, result.version);
});

test('Poker timeout advances and persists before rejecting a late action, without extending its deadline', async () => {
  const f = await fixture(3), first = await start(f, 'poker');
  f.tick(30_000);
  await assert.rejects(f.classic.action(first.turn, action(first, { action: 'call' })), code('stale_game_version'));
  const game = await f.stored('poker'), next = (await f.classic.state(f.players[0], 'poker')).game;
  assert.equal(game.playerState[first.turn].folded, true); assert.equal(game.version, first.version + 1);
  assert.equal(game.lastAction.type, 'timeout_fold'); assert.equal(game.lastAction.at, f.now());
  assert.notEqual(next.turn, first.turn); assert.equal(next.nextActionAt, f.now() + ACTION_HOLD_MS); assert.equal(next.turnEndsAt, next.nextActionAt + 30_000);
});

test('concurrent duplicate starts create a single deal and retries cannot switch to a different card mode', async () => {
  const f = await fixture(), payload = { key: 'baicao', botCount: 0, requestId: request() };
  const [first, second] = await Promise.all([f.classic.start(f.players[0], payload), f.classic.start(f.players[0], payload)]);
  assert.equal(first.id, second.id); assert.deepEqual(first.hand, second.hand);
  assert.equal([...f.db.rows.keys()].filter(path => path.startsWith('tea_classic_card_starts/')).length, 1);
  await assert.rejects(f.classic.start(f.players[0], { ...payload, key: 'poker' }), code('stale_start'));
  assert.equal((await f.ref('poker').get()).exists, false);
});

test('classic HTTP routes authenticate by header, enforce path mode and return safe versioned responses', async () => {
  const express = require('express'), http = require('node:http');
  const { createTeaService } = require('../features/tea/service'), { createTeaRouter } = require('../features/tea/routes');
  for (const key of ['baicao', 'poker']) {
    const f = await fixture(), tokens = Object.fromEntries(f.players.map(id => [id, crypto.randomBytes(32).toString('hex')]));
    for (const id of f.players) await f.db.collection('game_wallet_tokens').doc(crypto.createHash('sha256').update(tokens[id]).digest('hex')).set({ walletId: id });
    const service = createTeaService({ db: f.db, config: {}, now: f.now }), app = express();
    app.use(createTeaRouter({ service, isAdmin: () => false }));
    const server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/tea/card-games/${key}`, headers = { 'Content-Type': 'application/json', 'X-Wallet-Token': tokens[f.players[0]] };
    try {
      assert.equal((await fetch(base + '/current')).status, 401);
      assert.equal((await fetch(base + '/current?token=' + tokens[f.players[0]])).status, 401);
      const bought = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ key: key === 'poker' ? 'baicao' : 'poker', botCount: 0, requestId: request() }) });
      assert.equal(bought.status, 201); assert.equal(bought.headers.get('cache-control'), 'no-store');
      const view = await bought.json(); assert.equal(view.key, key); assert.equal(view.hand.length, key === 'poker' ? 2 : 3); assert.equal('hands' in view, false); assert.equal('deck' in view, false);
      const current = await fetch(base + '/current', { headers }); assert.equal(current.status, 200); assert.equal((await current.json()).game.id, view.id);
      const payload = action(view, { action: key === 'poker' ? 'call' : 'reveal' }), actor = key === 'poker' ? view.turn : f.players[0], actorHeaders = { ...headers, 'X-Wallet-Token': tokens[actor] };
      const missingVersion = await fetch(base + '/action', { method: 'POST', headers: actorHeaders, body: JSON.stringify({ ...payload, expectedVersion: undefined }) }); assert.equal(missingVersion.status, 400);
      const stale = await fetch(base + '/action', { method: 'POST', headers: actorHeaders, body: JSON.stringify({ ...payload, gameId: 'previous-game' }) }); assert.equal(stale.status, 409);
      const applied = await fetch(base + '/action', { method: 'POST', headers: actorHeaders, body: JSON.stringify(payload) }); assert.equal(applied.status, 200);
      const result = await applied.json(); assert.ok(result.version > view.version); assert.equal('hands' in result, false);
      const retry = await fetch(base + '/action', { method: 'POST', headers: actorHeaders, body: JSON.stringify(payload) }); assert.equal(retry.status, 200); assert.equal((await retry.json()).version, result.version);
      assert.equal((await f.db.collection('game_wallets').doc(actor).get()).data().balance, 121);
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
});

test('all four real service starts racing at one table create exactly one active card game', async () => {
  const f = await serviceFixture(), token = f.tokens[f.players[0]];
  const results = await Promise.allSettled([
    f.service.startCard(token, { botCount: 0, requestId: request() }),
    f.service.startTienLen(token, { botCount: 0, requestId: request() }),
    f.service.startClassicCard(token, { key: 'baicao', botCount: 0, requestId: request() }),
    f.service.startClassicCard(token, { key: 'poker', botCount: 0, requestId: request() }),
  ]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(results.filter(value => value.status === 'rejected').every(value => value.reason.code === 'game_active'), true);
  const documents = [`tea_card_games/${f.table.id}`, `tea_tienlen_games/${f.table.id}`, `tea_classic_card_games/${f.table.id}-baicao`, `tea_classic_card_games/${f.table.id}-poker`];
  assert.equal(documents.filter(path => f.db.rows.get(path)?.status === 'active').length, 1);
  const winner = results.find(value => value.status === 'fulfilled').value;
  const states = await Promise.all([
    f.service.cardState(token), f.service.tienLenState(token),
    f.service.classicCardState(token, 'baicao'), f.service.classicCardState(token, 'poker'),
  ]);
  assert.equal(states.every(value => value.canStart === false && value.activeCardGame === winner.activeCardGame), true);
});

test('independent tables can start different card modes concurrently without blocking each other', async () => {
  const f = await serviceFixture(4), other = structuredClone(TABLES[0]);
  f.table.seats.forEach((seat, i) => { if (i >= 2) { seat.walletId = null; seat.seatedAt = null; } });
  other.ownerId = f.players[2]; other.seats.forEach((seat, i) => Object.assign(seat, { walletId: f.players[i + 2], seatedAt: f.now() + i }));
  f.room.tables.push(other); await f.db.collection('tea_rooms').doc('main').set(f.room);
  const [poker, cào] = await Promise.all([
    f.service.startClassicCard(f.tokens[f.players[0]], { key: 'poker', botCount: 0, requestId: request() }),
    f.service.startClassicCard(f.tokens[f.players[2]], { key: 'baicao', botCount: 0, requestId: request() }),
  ]);
  assert.equal(poker.tableId, f.table.id); assert.equal(cào.tableId, other.id); assert.notEqual(poker.id, cào.id);
  assert.equal(poker.status, 'active'); assert.equal(cào.status, 'active');
  const first = await f.service.cardState(f.tokens[f.players[0]]), second = await f.service.tienLenState(f.tokens[f.players[2]]);
  assert.equal(first.activeCardGame, 'poker'); assert.equal(second.activeCardGame, 'baicao');
  const hidden = await f.service.classicCardState(f.tokens[f.players[2]], 'poker'); assert.equal(hidden.game, null);
});

test('finished Color and Tiến lên history cannot start or claim availability while a classic mode is active', async () => {
  for (const key of ['baicao', 'poker']) {
    const f = await serviceFixture(), token = f.tokens[f.players[0]], options = () => ({ botCount: 0, requestId: request() });
    const color = await f.service.startCard(token, options()), colorRef = f.db.collection('tea_card_games').doc(f.table.id);
    await colorRef.set({ ...(await colorRef.get()).data(), status: 'finished', winnerId: f.players[0] });
    const tl = await f.service.startTienLen(token, options()), tlRef = f.db.collection('tea_tienlen_games').doc(f.table.id);
    await tlRef.set({ ...(await tlRef.get()).data(), status: 'finished', winnerId: f.players[0] });
    const classic = await f.service.startClassicCard(token, { ...options(), key }); assert.equal(classic.status, 'active');
    const colorState = await f.service.cardState(token), tlState = await f.service.tienLenState(token);
    for (const state of [colorState, tlState]) {
      assert.equal(state.activeCardGame, key); assert.equal(state.canStart, false);
      assert.equal(state.game.activeCardGame, key); assert.equal(state.game.canStart, false);
      assert.equal(state.game.status, 'finished');
    }
    assert.equal(colorState.game.id, color.id); assert.equal(tlState.game.id, tl.id);
    await assert.rejects(f.service.startCard(token, options()), error => error.code === 'game_active');
    await assert.rejects(f.service.startTienLen(token, options()), error => error.code === 'game_active');
    assert.equal((await f.stored(key)).id, classic.id); assert.equal((await colorRef.get()).data().id, color.id); assert.equal((await tlRef.get()).data().id, tl.id);
  }
});


test('the last human leaving settles bot-only Poker atomically so the next guest can start another card game', async () => {
  const f=await serviceFixture(1),token=f.tokens[f.players[0]];f.room.layoutVersion=2;await f.db.collection('tea_rooms').doc('main').set(f.room);
  await f.service.startClassicCard(token,{key:'poker',botCount:3,requestId:request()});
  await f.service.leave(token);
  const finished=await f.stored('poker');assert.equal(finished.status,'finished');assert.equal(finished.playerState[f.players[0]].folded,true);
  assert.equal(finished.players.reduce((sum,id)=>sum+finished.playerState[id].stack,0),4000);
  const room=(await f.db.collection('tea_rooms').doc('main').get()).data();assert.equal(room.tables[0].seats.every(seat=>!seat.walletId),true);
  Object.assign(room.tables[0].seats[0],{walletId:f.players[0],seatedAt:f.now()});room.tables[0].ownerId=f.players[0];await f.db.collection('tea_rooms').doc('main').set(room);
  const next=await f.service.startTienLen(token,{botCount:1,requestId:request()});assert.equal(next.status,'active');assert.equal(next.activeCardGame,'tienlen');
});

test('a storage failure rolls back both standing up and Poker departure together', async () => {
  const f=await serviceFixture(2),token=f.tokens[f.players[0]];f.room.layoutVersion=2;await f.db.collection('tea_rooms').doc('main').set(f.room);
  await f.service.startClassicCard(token,{key:'poker',botCount:0,requestId:request()});const before=await f.stored('poker');f.db.failWrites=true;
  await assert.rejects(f.service.leave(token),/Simulated storage failure/);assert.deepEqual(await f.stored('poker'),before);
  const room=(await f.db.collection('tea_rooms').doc('main').get()).data();assert.equal(room.tables[0].seats.some(seat=>seat.walletId===f.players[0]),true);
});
