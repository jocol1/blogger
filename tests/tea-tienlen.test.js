const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createTeaService, emptyRoom } = require('../features/tea/service');
const { makeDeck, classify, beats, legalMoves } = require('../features/tea/tienlen');

const c = (rank, suit = 0) => ({ id: `tl-${rank}-${suit}`, rank, suit });
const pair = rank => [c(rank, 0), c(rank, 1)];
const four = rank => [0, 1, 2, 3].map(suit => c(rank, suit));
const pairs = (...ranks) => ranks.flatMap(pair);
const stronger = (candidate, top) => beats(classify(candidate), classify(top));
const request = () => crypto.randomUUID();

async function fixture(count = 2, seated = count) {
  let clock = Date.parse('2026-10-13T00:00:00Z');
  const db = new MemoryFirestore();
  const tea = createTeaService({ db, config: {}, now: () => clock });
  const players = Array.from({ length: seated }, (_, i) => ({ id: `tl-player-${i + 1}`, token: String(i + 1).repeat(64), name: `Player ${i + 1}` }));
  for (const player of players) {
    await db.collection('game_wallet_tokens').doc(crypto.createHash('sha256').update(player.token).digest('hex')).set({ walletId: player.id });
    await db.collection('tea_profiles').doc(player.id).set({ walletId: player.id, nickname: player.name });
    await db.collection('game_wallets').doc(player.id).set({ id: player.id, balance: 73, remainder: 432, history: [{ id: 'prior-purchase', amount: 73 }] });
  }
  const room = emptyRoom(), table = room.tables[2]; table.ownerId = players[0].id;
  players.forEach((player, i) => Object.assign(table.seats[i], { walletId: player.id, seatedAt: clock + i }));
  await db.collection('tea_rooms').doc('main').set(room);
  const game = {
    id: request(), key: 'tienlen', version: 1, tableId: table.id, status: 'active',
    players: players.slice(0, count).map(player => player.id), names: Object.fromEntries(players.map(player => [player.id, player.name])),
    hands: Object.fromEntries(players.slice(0, count).map((player, i) => [player.id, [c(3 + i), c(8 + i), c(12 + i)]])),
    turnIndex: 0, turnEndsAt: clock + 30_000, top: null, passed: [], openingCardId: null,
    requestId: request(), createdAt: new Date(clock).toISOString(), lastAction: null,
  };
  const ref = db.collection('tea_tienlen_games').doc(table.id);
  await ref.set(game);
  return { db, tea, players, room, table, game, ref, async save() { await ref.set(game); }, async stored() { return (await ref.get()).data(); }, tick(ms) { clock += ms; }, now: () => clock };
}
const action = (f, input = {}) => ({ gameId: f.game.id, expectedVersion: 1, requestId: request(), action: 'play', cardIds: [f.game.hands[f.players[0].id][0].id], ...input });

test('Tiến lên uses 52 unique standard cards ordered 3 through 2 and spades through hearts', () => {
  const deck = makeDeck(); assert.equal(deck.length, 52); assert.equal(new Set(deck.map(card => card.id)).size, 52);
  assert.equal(new Set(deck.map(card => `${card.rank}-${card.suit}`)).size, 52);
  for (let rank = 3; rank <= 15; rank++) assert.equal(deck.filter(card => card.rank === rank).length, 4);
  assert.equal(stronger([c(3, 3)], [c(3, 2)]), true); assert.equal(stronger([c(3, 0)], [c(3, 1)]), false);
  assert.equal(stronger([c(15)], [c(14, 3)]), true); assert.equal(stronger([c(3, 3)], [c(15)]), false);
});

test('classification accepts ordinary pairs, triples, straights and consecutive pairs', () => {
  assert.equal(classify(pair(6)).kind, 'pair'); assert.equal(classify(four(6).slice(0, 3)).kind, 'triple');
  assert.equal(classify(four(6)).kind, 'four'); assert.equal(classify([c(5), c(3), c(4, 3)]).kind, 'straight');
  assert.equal(classify(pairs(3, 4, 5)).kind, 'pairs3'); assert.equal(classify(pairs(8, 9, 10, 11)).kind, 'pairs4');
  assert.equal(classify([c(12), c(13), c(14)]).kind, 'straight');
});

test('invalid selections reject duplicates, forged cards, incomplete runs and any straight containing 2', () => {
  for (const cards of [[], [c(3), c(3)], [c(3), { ...c(4), id: c(3).id }], [c(3), c(4)], [c(3), c(5), c(6)], [c(3), c(3, 1), c(4)], [c(13), c(14), c(15)], [c(14), c(15), c(3)], pairs(13, 14, 15), [c(2)], [c(16)], [c(3, 4)], [c(3, -1)], [{ ...c(3), rank: '3' }]]) assert.equal(classify(cards), null);
});

test('ordinary combinations must match type and length, then compare highest rank and suit', () => {
  assert.equal(stronger(pair(7), pair(6)), true); assert.equal(stronger(pair(6), pair(7)), false);
  assert.equal(stronger([c(6, 2), c(6, 3)], pair(6)), true);
  assert.equal(stronger(four(8).slice(0, 3), four(7).slice(0, 3)), true);
  assert.equal(stronger([c(4), c(5), c(6)], [c(3), c(4), c(5)]), true);
  assert.equal(stronger([c(4), c(5), c(6), c(7)], [c(3), c(4), c(5)]), false);
  assert.equal(stronger(pair(8), [c(7)]), false); assert.equal(stronger(four(8).slice(0, 3), pair(7)), false);
});

test('three consecutive pairs, four of a kind and four consecutive pairs chop only permitted combinations', () => {
  const p3 = pairs(3, 4, 5), p4 = pairs(4, 5, 6, 7), quad = four(7), oneTwo = [c(15)], twoTwos = pair(15), threeTwos = four(15).slice(0, 3);
  assert.equal(stronger(p3, oneTwo), true); assert.equal(stronger(p3, twoTwos), false);
  assert.equal(stronger(pairs(6, 7, 8), p3), true); assert.equal(stronger(p3, four(3)), false);
  for (const top of [oneTwo, twoTwos, p3, four(6)]) assert.equal(stronger(quad, top), true);
  for (const top of [oneTwo, twoTwos, p3, quad, pairs(3, 4, 5, 6)]) assert.equal(stronger(p4, top), true);
  assert.equal(stronger(four(14), p4), false);
  for (const bomb of [p3, quad, p4]) { assert.equal(stronger(bomb, threeTwos), false); assert.equal(stronger(bomb, [c(14)]), false); }
});

test('legal move discovery honors the opening card and limits out-of-turn moves to a legal four-pair chop', () => {
  const hand = [...pairs(3, 4, 5, 6), c(10), c(15)];
  const opening = legalMoves(hand, null, c(3).id); assert.ok(opening.length); assert.equal(opening.every(cards => cards.some(card => card.id === c(3).id)), true);
  const top = { cards: [c(15, 3)], ...classify([c(15, 3)]) };
  const offTurn = legalMoves(hand, top, null, true); assert.ok(offTurn.length); assert.equal(offTurn.every(cards => classify(cards).kind === 'pairs4'), true);
  assert.deepEqual(legalMoves(hand, { cards: [c(10, 3)], ...classify([c(10, 3)]) }, null, true), []);
});

test('a four-person deal gives 13 cards each, keeps all 52 unique and starts with the smallest dealt card', async () => {
  const f = await fixture(4); await f.ref.delete();
  const view = await f.tea.startTienLen(f.players[0].token, { botCount: 0, requestId: request() });
  const stored = await f.stored(); const dealt = Object.values(stored.hands).flat();
  assert.equal(view.players.length, 4); assert.equal(view.hand.length, 13); assert.equal(Object.values(stored.hands).every(hand => hand.length === 13), true);
  assert.equal(new Set(dealt.map(card => card.id)).size, 52); assert.equal(stored.openingCardId, c(3).id);
  assert.equal(stored.hands[view.turn].some(card => card.id === c(3).id), true); assert.equal('hands' in view, false); assert.equal('deck' in view, false);
});

test('first play must include the smallest dealt card and cannot pass; valid multi-card opening clears the obligation', async () => {
  const f = await fixture(); f.game.hands[f.players[0].id] = [c(3), c(4), c(5), c(10)]; f.game.openingCardId = c(3).id; await f.save();
  await assert.rejects(f.tea.tienLenAction(f.players[0].token, action(f, { cardIds: [c(10).id] })));
  await assert.rejects(f.tea.tienLenAction(f.players[0].token, action(f, { action: 'pass' })));
  assert.equal((await f.stored()).version, 1);
  const view = await f.tea.tienLenAction(f.players[0].token, action(f, { cardIds: [c(3).id, c(4).id, c(5).id] }));
  assert.equal(view.hand.length, 1); assert.equal(view.top.kind, 'straight'); assert.equal(view.turn, f.players[1].id); assert.equal(view.version, 2);
  assert.equal((await f.stored()).openingCardId, null);
});

test('play validates ownership and combinations, removes only selected cards, and ignores forged winner or hand fields', async () => {
  const f = await fixture(); f.game.hands[f.players[0].id] = [...pair(4), c(7)]; await f.save();
  for (const cardIds of [[c(4).id, c(4).id], [c(4).id, c(7).id], [c(5).id]]) await assert.rejects(f.tea.tienLenAction(f.players[0].token, action(f, { cardIds })));
  assert.equal((await f.stored()).hands[f.players[0].id].length, 3);
  const view = await f.tea.tienLenAction(f.players[0].token, action(f, { cardIds: pair(4).map(card => card.id), hand: [], winnerId: f.players[0].id, status: 'finished' }));
  assert.equal(view.top.kind, 'pair'); assert.deepEqual(view.hand.map(card => card.id), [c(7).id]); assert.equal(view.status, 'active');
});

test('passing locks a player out until everyone else passes and the last player leads a fresh trick', async () => {
  const f = await fixture(4); f.game.hands[f.players[0].id] = [c(7), c(10)]; f.game.hands[f.players[2].id] = [c(8), c(3, 3)]; await f.save();
  let view = await f.tea.tienLenAction(f.players[0].token, action(f, { cardIds: [c(7).id] }));
  view = await f.tea.tienLenAction(f.players[1].token, action(f, { action: 'pass', expectedVersion: view.version }));
  view = await f.tea.tienLenAction(f.players[2].token, action(f, { cardIds: [c(8).id], expectedVersion: view.version }));
  await assert.rejects(f.tea.tienLenAction(f.players[1].token, action(f, { cardIds: [c(9).id], expectedVersion: view.version })));
  view = await f.tea.tienLenAction(f.players[3].token, action(f, { action: 'pass', expectedVersion: view.version })); assert.equal(view.turn, f.players[0].id);
  view = await f.tea.tienLenAction(f.players[0].token, action(f, { action: 'pass', expectedVersion: view.version }));
  assert.equal(view.turn, f.players[2].id); assert.equal(view.top, null); assert.deepEqual((await f.stored()).passed, []);
  await assert.rejects(f.tea.tienLenAction(f.players[2].token, action(f, { action: 'pass', expectedVersion: view.version })));
  const won = await f.tea.tienLenAction(f.players[2].token, action(f, { cardIds: [c(3, 3).id], expectedVersion: view.version })); assert.equal(won.winnerId, f.players[2].id);
});

test('an already-passed player may chop out of turn with four consecutive pairs, but cannot use other bombs out of turn', async () => {
  const f = await fixture(4); const bomb = pairs(3, 4, 5, 6), player = f.players[3];
  f.game.top = { cards: [c(15)], ...classify([c(15)]), playerId: f.players[0].id }; f.game.turnIndex = 1; f.game.passed = [player.id]; f.game.hands[player.id] = [...bomb, ...four(9)]; await f.save();
  await assert.rejects(f.tea.tienLenAction(player.token, action(f, { cardIds: four(9).map(card => card.id) })));
  const view = await f.tea.tienLenAction(player.token, action(f, { cardIds: bomb.map(card => card.id) }));
  assert.equal(view.top.kind, 'pairs4'); assert.equal(view.top.playerId, player.id); assert.equal(view.hand.length, 4); assert.equal(view.turn, f.players[0].id);
  assert.equal((await f.stored()).passed.includes(player.id), false);
});

test('first player to empty their hand wins with no extra card, penalty or wallet movement', async () => {
  const f = await fixture(); const walletRows = f.players.map(player => structuredClone(f.db.rows.get(`game_wallets/${player.id}`)));
  f.game.hands[f.players[0].id] = pair(8); await f.save();
  const view = await f.tea.tienLenAction(f.players[0].token, action(f, { cardIds: pair(8).map(card => card.id) }));
  assert.equal(view.status, 'finished'); assert.equal(view.winnerId, f.players[0].id); assert.equal(view.hand.length, 0);
  await assert.rejects(f.tea.tienLenAction(f.players[1].token, action(f, { action: 'pass', expectedVersion: view.version })));
  f.players.forEach((player, i) => assert.deepEqual(f.db.rows.get(`game_wallets/${player.id}`), walletRows[i]));
});

test('next deal gives the previous winner the opening lead without requiring the smallest card', async () => {
  const f = await fixture(); Object.assign(f.game, { status: 'finished', winnerId: f.players[1].id }); await f.save();
  const view = await f.tea.startTienLen(f.players[0].token, { botCount: 0, requestId: request() });
  assert.equal(view.turn, f.players[1].id); assert.equal((await f.stored()).openingCardId, null); assert.notEqual(view.id, f.game.id);
  const highest = view.turn === f.players[0].id ? view.hand.at(-1) : (await f.stored()).hands[f.players[1].id].at(-1);
  const result = await f.tea.tienLenAction(f.players[1].token, { gameId: view.id, expectedVersion: view.version, requestId: request(), action: 'play', cardIds: [highest.id] });
  assert.equal(result.top.cards[0].id, highest.id);
});

test('opponent hands remain private, spectators cannot act, and an unseated or invalid wallet cannot access a match', async () => {
  const f = await fixture(2, 3); const own = await f.tea.tienLenState(f.players[0].token), spectator = await f.tea.tienLenState(f.players[2].token);
  assert.deepEqual(own.game.hand, f.game.hands[f.players[0].id]); assert.equal('hands' in own.game, false); assert.equal('deck' in own.game, false);
  assert.equal(spectator.game.member, false); assert.deepEqual(spectator.game.hand, []); assert.equal(spectator.canStart, false);
  await assert.rejects(f.tea.tienLenAction(f.players[2].token, action(f)));
  await assert.rejects(f.tea.tienLenState('f'.repeat(64)));
  const room = (await f.db.collection('tea_rooms').doc('main').get()).data(); room.tables[2].seats[1].walletId = null; await f.db.collection('tea_rooms').doc('main').set(room);
  const unseated = await f.tea.tienLenState(f.players[1].token); assert.equal(unseated.game, null);
  await assert.rejects(f.tea.tienLenAction(f.players[1].token, action(f)));
});

test('duplicates and concurrent retries execute one play and retry returns current caller state', async () => {
  const f = await fixture(); const input = action(f);
  const [first, second] = await Promise.all([f.tea.tienLenAction(f.players[0].token, input), f.tea.tienLenAction(f.players[0].token, input)]);
  assert.deepEqual(first, second); assert.equal((await f.stored()).version, 2); assert.equal((await f.stored()).hands[f.players[0].id].length, 2);
  const peer = await f.tea.tienLenAction(f.players[1].token, action(f, { cardIds: [c(4).id], expectedVersion: first.version }));
  const retry = await f.tea.tienLenAction(f.players[0].token, input); assert.equal(retry.version, peer.version); assert.deepEqual(retry.hand.map(card => card.id), [c(8).id, c(12).id]);
});

test('request IDs are scoped to player and match, so another player cannot replay a private hand', async () => {
  const f = await fixture(), sharedId = 'same-request-different-player';
  const first = await f.tea.tienLenAction(f.players[0].token, action(f, { requestId: sharedId }));
  const second = await f.tea.tienLenAction(f.players[1].token, action(f, { requestId: sharedId, cardIds: [c(4).id], expectedVersion: first.version }));
  assert.deepEqual(second.hand.map(card => card.id), [c(9).id, c(13).id]); assert.equal(second.hand.some(card => first.hand.some(other => other.id === card.id)), false);
  assert.equal((await f.stored()).version, 3);
});

test('two distinct submissions at the same version cannot both play and stale match IDs cannot affect a rematch', async () => {
  const f = await fixture(); const outcomes = await Promise.allSettled([f.tea.tienLenAction(f.players[0].token, action(f)), f.tea.tienLenAction(f.players[0].token, action(f))]);
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1); assert.equal((await f.stored()).version, 2);
  const oldId = f.game.id; Object.assign(f.game, await f.stored(), { id: request() }); await f.save();
  await assert.rejects(f.tea.tienLenAction(f.players[1].token, action(f, { gameId: oldId, expectedVersion: 2, cardIds: [c(4).id] })), error => error.code === 'stale_game');
  await assert.rejects(f.tea.tienLenAction(f.players[1].token, { requestId: request(), action: 'play', cardIds: [c(4).id] }));
  assert.equal((await f.stored()).version, 2);
});

test('an elapsed opening turn plays the lowest card and stale actions still persist the timeout exactly once', async () => {
  const f = await fixture(); f.game.openingCardId = c(3).id; await f.save(); f.tick(30_000);
  await assert.rejects(f.tea.tienLenAction(f.players[0].token, action(f)), error => error.code === 'stale_game_version');
  const stored = await f.stored(); assert.equal(stored.version, 2); assert.equal(stored.top.cards[0].id, c(3).id); assert.equal(stored.hands[f.players[0].id].length, 2); assert.equal(stored.turnIndex, 1);
  assert.equal(stored.turnEndsAt, f.now() + 30_000); assert.equal(stored.openingCardId, null);
  assert.equal((await f.tea.tienLenState(f.players[0].token)).game.version, 2);
});

test('missed response turns auto-pass on original deadlines and polling does not prolong the match', async () => {
  const f = await fixture(4); f.game.openingCardId = c(3).id; await f.save(); f.tick(95_000);
  const view = (await f.tea.tienLenState(f.players[0].token)).game;
  assert.equal(view.version, 4); assert.equal(view.turn, f.players[3].id); assert.equal(view.turnEndsAt, f.now() + 25_000);
  assert.deepEqual((await f.stored()).passed, [f.players[1].id, f.players[2].id]);
  assert.equal((await f.tea.tienLenState(f.players[0].token)).game.turnEndsAt, view.turnEndsAt);
});

test('only the host starts, bot counts are integers 0–3, and no more than four people join a deal', async () => {
  const f = await fixture(); await f.ref.delete();
  await assert.rejects(f.tea.startTienLen(f.players[1].token, { botCount: 0, requestId: request() }), error => error.code === 'not_host');
  for (const botCount of [-1, 0.5, 4, '1']) await assert.rejects(f.tea.startTienLen(f.players[0].token, { botCount, requestId: request() }));
  await assert.rejects(f.tea.startTienLen(f.players[0].token, { botCount: 3, requestId: request() }));
  const crowded = await fixture(5); await crowded.ref.delete(); await assert.rejects(crowded.tea.startTienLen(crowded.players[0].token, { botCount: 0, requestId: request() }));
  const solo = await fixture(1); await solo.ref.delete(); await assert.rejects(solo.tea.startTienLen(solo.players[0].token, { botCount: 0, requestId: request() }));
  const view = await solo.tea.startTienLen(solo.players[0].token, { botCount: 3, requestId: request() }); assert.equal(view.players.length, 4); assert.equal(view.players.filter(player => player.bot).length, 3);
});

test('start retries deduplicate across simultaneous calls and old start IDs cannot resurrect a completed deal', async () => {
  const f = await fixture(); await f.ref.delete(); const input = { botCount: 0, requestId: request() };
  const [first, duplicate] = await Promise.all([f.tea.startTienLen(f.players[0].token, input), f.tea.startTienLen(f.players[0].token, input)]); assert.equal(first.id, duplicate.id);
  const stored = await f.stored(); stored.status = 'finished'; stored.winnerId = f.players[0].id; await f.ref.set(stored);
  const next = await f.tea.startTienLen(f.players[0].token, { botCount: 0, requestId: request() }); assert.notEqual(next.id, first.id);
  await assert.rejects(f.tea.startTienLen(f.players[0].token, input), error => error.code === 'stale_start'); assert.equal((await f.stored()).id, next.id);
});

test('bots choose legal cards and return control to the human instead of leaking their hands', async () => {
  const f = await fixture(1); const bot = 'bot:tl:1'; f.game.players.push(bot); f.game.names[bot] = 'BOT 1'; f.game.hands[bot] = [c(4), c(10)]; await f.save();
  const view = await f.tea.tienLenAction(f.players[0].token, action(f));
  assert.equal(view.top.cards[0].id, c(4).id); assert.equal(view.turn, f.players[0].id); assert.equal(view.version, 3);
  assert.equal(view.players.find(player => player.id === bot).cards, 1); assert.equal('hands' in view, false);
});

test('Firestore failures do not remove cards or create a game; retry can safely continue when storage recovers', async () => {
  const f = await fixture(); f.db.failWrites = true;
  await assert.rejects(f.tea.tienLenAction(f.players[0].token, action(f)), /Simulated storage failure/); assert.equal((await f.stored()).version, 1); assert.equal((await f.stored()).hands[f.players[0].id].length, 3);
  f.db.failWrites = false; await f.ref.delete(); f.db.failWrites = true;
  await assert.rejects(f.tea.startTienLen(f.players[0].token, { botCount: 0, requestId: request() }), /Simulated storage failure/); assert.equal((await f.ref.get()).exists, false);
  f.db.failWrites = false; const view = await f.tea.startTienLen(f.players[0].token, { botCount: 0, requestId: request() }); assert.equal(view.hand.length, 13);
});

test('leaving or restarting cancels a deal with no winner and preserves existing wallet history', async () => {
  const f = await fixture(); const wallet = structuredClone(f.db.rows.get(`game_wallets/${f.players[0].id}`));
  await f.tea.leave(f.players[1].token); const left = await f.stored(); assert.equal(left.status, 'finished'); assert.equal(left.winnerId, null); assert.equal(left.reason, 'player_left'); assert.equal(left.version, 2);
  assert.deepEqual(f.db.rows.get(`game_wallets/${f.players[0].id}`), wallet);
  const restarted = await fixture(); await restarted.tea.recoverAfterRestart(); const game = await restarted.stored(); assert.equal(game.status, 'finished'); assert.equal(game.reason, 'server_restart'); assert.equal(game.winnerId, null);
  const room = (await restarted.db.collection('tea_rooms').doc('main').get()).data(); assert.equal(room.tables.every(table => table.seats.every(seat => !seat.walletId)), true);
});

test('an active color-card game prevents a simultaneous Tiến lên deal at the same table', async () => {
  const f = await fixture(); await f.ref.delete(); await f.db.collection('tea_card_games').doc(f.table.id).set({ id: request(), status: 'active', players: f.players.map(player => player.id) });
  await assert.rejects(f.tea.startTienLen(f.players[0].token, { botCount: 0, requestId: request() })); assert.equal((await f.ref.get()).exists, false);
});

test('simultaneous starts cannot open Tiến lên and Color Cards on the same table', async () => {
  const f = await fixture(); await f.ref.delete();
  const outcomes = await Promise.allSettled([
    f.tea.startTienLen(f.players[0].token, { botCount: 0, requestId: request() }),
    f.tea.startCard(f.players[0].token, { botCount: 0, requestId: request() }),
  ]);
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
  const color = (await f.db.collection('tea_card_games').doc(f.table.id).get()).data();
  const tienlen = await f.stored(); assert.equal([color, tienlen].filter(game => game?.status === 'active').length, 1);
});

test('a strong starting hand does not win instantly and ordinary out-of-turn plays are rejected', async () => {
  const f = await fixture(); f.game.hands[f.players[0].id] = [...pairs(3, 4, 5, 6, 7, 8), c(15)]; await f.save();
  const view = (await f.tea.tienLenState(f.players[0].token)).game; assert.equal(view.status, 'active'); assert.equal(view.winnerId, null); assert.equal(view.hand.length, 13);
  await assert.rejects(f.tea.tienLenAction(f.players[1].token, action(f, { cardIds: [c(4).id] })), error => error.code === 'not_turn'); assert.equal((await f.stored()).version, 1);
});

test('the lowest dealt card opens a two-person match even if the 3 of spades was not dealt', async () => {
  const f = await fixture(); f.game.openingCardId = c(5, 1).id; f.game.hands[f.players[0].id] = [c(5, 1), c(7)]; f.game.hands[f.players[1].id] = [c(5, 2), c(8)]; await f.save();
  await assert.rejects(f.tea.tienLenAction(f.players[0].token, action(f, { cardIds: [c(7).id] })), error => error.code === 'opening_card_required');
  const view = await f.tea.tienLenAction(f.players[0].token, action(f, { cardIds: [c(5, 1).id] })); assert.equal(view.top.cards[0].id, c(5, 1).id); assert.equal(view.turn, f.players[1].id);
});

test('HTTP endpoints require the wallet header, validate action/version fields and keep responses private', async () => {
  const express = require('express'), http = require('node:http'), { createTeaRouter } = require('../features/tea/routes');
  const f = await fixture(); await f.ref.delete(); const app = express(); app.use(createTeaRouter({ service: f.tea, isAdmin: () => false }));
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', 'X-Wallet-Token': f.players[0].token };
  try {
    assert.equal((await fetch(base + '/api/tea/tienlen/current')).status, 401);
    assert.equal((await fetch(base + '/api/tea/tienlen/current?token=' + f.players[0].token)).status, 401);
    const start = await fetch(base + '/api/tea/tienlen', { method: 'POST', headers, body: JSON.stringify({ botCount: 0, requestId: request() }) }); assert.equal(start.status, 201);
    const game = await start.json(); assert.equal(game.hand.length, 13); assert.equal('hands' in game, false);
    const snapshot = await fetch(base + '/api/tea/tienlen/current', { headers }); assert.equal(snapshot.status, 200); const view = await snapshot.json(); assert.equal(view.game.id, game.id);
    const invalid = await fetch(base + '/api/tea/tienlen/action', { method: 'POST', headers, body: JSON.stringify({ gameId: game.id, requestId: request(), expectedVersion: -1, action: 'play', cardIds: [] }) }); assert.equal(invalid.status, 400);
    const stale = await fetch(base + '/api/tea/tienlen/action', { method: 'POST', headers, body: JSON.stringify({ gameId: 'previous-game', requestId: request(), action: 'pass' }) }); assert.equal(stale.status, 409);
    assert.equal((await f.stored()).version, 1);
    const stored = await f.stored(), currentId = stored.players[stored.turnIndex], current = f.players.find(player => player.id === currentId);
    const played = await fetch(base + '/api/tea/tienlen/action', { method: 'POST', headers: { ...headers, 'X-Wallet-Token': current.token }, body: JSON.stringify({ gameId: game.id, requestId: request(), expectedVersion: 1, action: 'play', cardIds: [stored.openingCardId], winnerId: currentId, balance: 999999 }) });
    assert.equal(played.status, 200); const result = await played.json(); assert.equal(result.status, 'active'); assert.equal(result.hand.length, 12); assert.equal('hands' in result, false);
    assert.equal(f.db.rows.get(`game_wallets/${currentId}`).balance, 73);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
