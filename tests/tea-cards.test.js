const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createTeaService, emptyRoom, cardMatches } = require('../features/tea/service');

let cardNumber = 0;
const card = (color, value, kind = 'number') => ({ id: `card-${++cardNumber}`, color, kind, ...(kind === 'number' ? { value } : {}) });
const special = (color, kind) => card(color, undefined, kind);
async function fixture(playerCount = 2, seatedCount = playerCount) {
  let clock = Date.parse('2026-10-13T00:00:00Z');
  const db = new MemoryFirestore();
  const tea = createTeaService({ db, config: {}, now: () => clock });
  const players = Array.from({ length: seatedCount }, (_, i) => ({ id: `player-${i + 1}`, token: String(i + 1).repeat(64), name: `Player ${i + 1}` }));
  for (const player of players) {
    await db.collection('game_wallet_tokens').doc(crypto.createHash('sha256').update(player.token).digest('hex')).set({ walletId: player.id });
    await db.collection('tea_profiles').doc(player.id).set({ walletId: player.id, nickname: player.name });
  }
  const room = emptyRoom(); const table = room.tables[1]; table.ownerId = players[0].id;
  players.forEach((player, i) => { Object.assign(table.seats[i], { walletId: player.id, seatedAt: clock + i }); });
  await db.collection('tea_rooms').doc('main').set(room);
  const game = {
    id: crypto.randomUUID(), version: 1, tableId: table.id, status: 'active',
    players: players.slice(0, playerCount).map(player => player.id), names: Object.fromEntries(players.map(player => [player.id, player.name])),
    hands: Object.fromEntries(players.slice(0, playerCount).map(player => [player.id, [card('red', 4), card('green', 6)]])),
    deck: Array.from({ length: 20 }, (_, i) => card('blue', i % 10)), discard: [card('red', 1)], activeColor: 'red',
    turnIndex: 0, turnEndsAt: clock + 30_000, requestId: 'initial-start-request', createdAt: new Date(clock).toISOString(),
  };
  const ref = db.collection('tea_card_games').doc(table.id);
  await ref.set(game);
  return { db, tea, players, game, table, ref, async save() { await ref.set(game); }, async stored() { return (await ref.get()).data(); }, tick(ms) { clock += ms; }, now: () => clock };
}
const action = (f, overrides = {}) => ({ gameId: f.game.id, requestId: crypto.randomUUID(), expectedVersion: 1, action: 'draw', ...overrides });

test('card matching permits active color, equal numbers, matching actions and wild only', () => {
  const top = card('red', 1);
  assert.equal(cardMatches(card('red', 7), top, 'red'), true);
  assert.equal(cardMatches(card('green', 1), top, 'red'), true);
  assert.equal(cardMatches(card('green', 7), top, 'red'), false);
  assert.equal(cardMatches(special('blue', 'skip'), special('red', 'skip'), 'red'), true);
  assert.equal(cardMatches(special('blue', 'draw2'), special('red', 'skip'), 'red'), false);
  assert.equal(cardMatches(special('wild', 'wild'), top, 'red'), true);
  assert.equal(cardMatches(card('red', 9), special('wild', 'wild'), 'blue'), false);
});

test('normal card play removes exactly one card, advances turn and records a public played card', async () => {
  const f = await fixture(); const played = f.game.hands[f.players[0].id][0];
  const view = await f.tea.cardAction(f.players[0].token, action(f, { action: 'play', cardId: played.id }));
  assert.equal(view.hand.length, 1); assert.equal(view.turn, f.players[1].id); assert.equal(view.top.id, played.id);
  assert.equal(view.version, 2); assert.equal(view.lastAction.type, 'play'); assert.equal(view.lastAction.card.id, played.id);
  assert.equal((await f.stored()).hands[f.players[1].id].length, 2);
});

test('an illegal card or missing wild color does not remove cards or advance the turn', async () => {
  const f = await fixture(); const invalid = f.game.hands[f.players[0].id][1];
  await assert.rejects(f.tea.cardAction(f.players[0].token, action(f, { action: 'play', cardId: invalid.id })), e => e.code === 'invalid_card');
  const wild = special('wild', 'wild'); f.game.hands[f.players[0].id].push(wild); await f.save();
  await assert.rejects(f.tea.cardAction(f.players[0].token, action(f, { action: 'play', cardId: wild.id })), e => e.code === 'color_required');
  const stored = await f.stored(); assert.equal(stored.hands[f.players[0].id].length, 3); assert.equal(stored.turnIndex, 0); assert.equal(stored.version, 1);
});

test('wild cards choose the next active color and the next player must match that color', async () => {
  const f = await fixture(); const wild = special('wild', 'wild'); f.game.hands[f.players[0].id] = [wild, card('yellow', 9)];
  const matching = card('blue', 5); f.game.hands[f.players[1].id] = [matching, card('green', 1)]; await f.save();
  const first = await f.tea.cardAction(f.players[0].token, action(f, { action: 'play', cardId: wild.id, color: 'blue' }));
  assert.equal(first.activeColor, 'blue');
  const next = await f.tea.cardAction(f.players[1].token, action(f, { action: 'play', cardId: matching.id, expectedVersion: first.version }));
  assert.equal(next.top.id, matching.id); assert.equal(next.activeColor, 'blue');
});

for (const count of [2, 4]) for (const kind of ['skip', 'draw2']) {
  test(`${kind} skips the next player correctly at a ${count}-player table`, async () => {
    const f = await fixture(count); const played = special('red', kind); f.game.hands[f.players[0].id] = [played, card('green', 9)]; await f.save();
    const result = await f.tea.cardAction(f.players[0].token, action(f, { action: 'play', cardId: played.id }));
    assert.equal(result.turn, f.players[2 % count].id);
    assert.equal((await f.stored()).hands[f.players[1].id].length, kind === 'draw2' ? 4 : 2);
  });
}

test('playing the final card finishes the game and further actions are rejected', async () => {
  const f = await fixture(); const last = card('red', 8); f.game.hands[f.players[0].id] = [last]; await f.save();
  const result = await f.tea.cardAction(f.players[0].token, action(f, { action: 'play', cardId: last.id }));
  assert.equal(result.status, 'finished'); assert.equal(result.winnerId, f.players[0].id); assert.equal(result.hand.length, 0);
  await assert.rejects(f.tea.cardAction(f.players[1].token, action(f, { expectedVersion: result.version })), e => e.code === 'game_finished');
});

test('drawing ends the turn, keeps the drawn card private and refills an empty deck from discard', async () => {
  const f = await fixture(); const top = f.game.discard[0]; const old = card('green', 3); f.game.discard = [old, top]; f.game.deck = []; await f.save();
  const view = await f.tea.cardAction(f.players[0].token, action(f));
  assert.equal(view.turn, f.players[1].id); assert.equal(view.hand.length, 3); assert.equal(view.hand.at(-1).id, old.id);
  assert.equal(view.top.id, top.id); assert.equal(view.lastAction.type, 'draw'); assert.equal(view.lastAction.card, null);
  assert.equal((await f.stored()).discard.length, 1);
});

test('timeout draws once, advances once and stale actions still persist the elapsed turn', async () => {
  const f = await fixture(); f.tick(30_000);
  await assert.rejects(f.tea.cardAction(f.players[0].token, action(f)), e => e.code === 'stale_game_version');
  const stored = await f.stored(); assert.equal(stored.hands[f.players[0].id].length, 3); assert.equal(stored.turnIndex, 1); assert.equal(stored.version, 2);
  assert.equal(stored.turnEndsAt, f.now() + 30_000); assert.equal(stored.lastAction.type, 'timeout');
  const view = await f.tea.cardState(f.players[0].token); assert.equal(view.game.hand.length, 3); assert.equal(view.game.version, 2);
});

test('catching up several missed turns uses their original deadlines', async () => {
  const f = await fixture(); f.tick(95_000);
  const view = await f.tea.cardState(f.players[0].token);
  assert.equal(view.game.version, 4); assert.equal(view.game.turn, f.players[1].id);
  assert.equal(view.game.turnEndsAt, f.now() + 25_000);
  const stored = await f.stored(); assert.equal(stored.hands[f.players[0].id].length, 4); assert.equal(stored.hands[f.players[1].id].length, 3);
});

test('repeating an action is harmless and another wallet can reuse its request ID without seeing the first hand', async () => {
  const f = await fixture(); const sharedId = 'same-client-request-id';
  const firstInput = action(f, { requestId: sharedId }); const first = await f.tea.cardAction(f.players[0].token, firstInput);
  const retry = await f.tea.cardAction(f.players[0].token, firstInput); assert.deepEqual(retry, first);
  const second = await f.tea.cardAction(f.players[1].token, action(f, { requestId: sharedId, expectedVersion: first.version }));
  assert.equal(second.hand.length, 3); assert.equal(second.hand[0].id, f.game.hands[f.players[1].id][0].id);
  assert.equal(second.hand.some(c => c.id === first.hand[0].id), false); assert.equal(second.turn, f.players[0].id);
});

test('concurrent different requests for one version cannot execute two turns', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.tea.cardAction(f.players[0].token, action(f)), f.tea.cardAction(f.players[0].token, action(f))]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.code, 'stale_game_version');
  assert.equal((await f.stored()).hands[f.players[0].id].length, 3); assert.equal((await f.stored()).version, 2);
});

test('concurrent retries of the same request execute once and later retry returns current caller state', async () => {
  const f = await fixture(); const input = action(f);
  const results = await Promise.all([f.tea.cardAction(f.players[0].token, input), f.tea.cardAction(f.players[0].token, input)]);
  assert.deepEqual(results[0], results[1]); assert.equal((await f.stored()).version, 2);
  await f.tea.cardAction(f.players[1].token, action(f, { expectedVersion: 2 }));
  const retry = await f.tea.cardAction(f.players[0].token, input); assert.equal(retry.version, 3); assert.equal(retry.turn, f.players[0].id);
  assert.equal(retry.hand.length, 3); assert.equal((await f.stored()).version, 3);
});

test('a player out of turn cannot draw or play and cannot forge the hand in a request', async () => {
  const f = await fixture();
  await assert.rejects(f.tea.cardAction(f.players[1].token, action(f, { hand: [], winnerId: f.players[1].id, status: 'finished' })), e => e.code === 'not_turn');
  const stored = await f.stored(); assert.equal(stored.status, 'active'); assert.equal(stored.version, 1); assert.equal(stored.hands[f.players[1].id].length, 2);
});

test('a request from the previous game cannot draw from a newly started game', async () => {
  const f = await fixture(); const oldId = f.game.id; f.game.id = crypto.randomUUID(); await f.save();
  await assert.rejects(f.tea.cardAction(f.players[0].token, action(f, { gameId: oldId })), e => e.code === 'stale_game');
  assert.equal((await f.stored()).version, 1); assert.equal((await f.stored()).hands[f.players[0].id].length, 2);
  await assert.rejects(f.tea.cardAction(f.players[0].token, { action: 'draw', requestId: 'missing-game-id-request' }), e => e.code === 'bad_request');
});

test('spectators see no hands and cannot act; card state explains host and membership', async () => {
  const f = await fixture(2, 3); const view = await f.tea.cardState(f.players[2].token);
  assert.equal(view.member, false); assert.equal(view.game.member, false); assert.deepEqual(view.game.hand, []);
  assert.equal(view.hostId, f.players[0].id); assert.equal(view.canStart, false); assert.equal('hands' in view.game, false); assert.equal('deck' in view.game, false);
  await assert.rejects(f.tea.cardAction(f.players[2].token, action(f)), e => e.code === 'not_player');
});

test('start validates whole bot counts, catches up active games and deduplicates starts across rematches', async () => {
  const f = await fixture();
  for (const botCount of [0.5, -1, 3, '1']) await assert.rejects(f.tea.startCard(f.players[0].token, { requestId: 'start-invalid-bot-count', botCount }), e => e.code === 'bad_bot_count');
  const input = { requestId: 'first-scoped-start-request', botCount: 0 }; f.tick(30_000);
  const active = await f.tea.startCard(f.players[0].token, input); assert.equal(active.id, f.game.id); assert.equal(active.version, 2); assert.equal(active.turn, f.players[1].id);
  Object.assign(f.game, await f.stored(), { status: 'finished' }); await f.save();
  const next = await f.tea.startCard(f.players[0].token, { requestId: 'second-scoped-start-request', botCount: 0 }); assert.notEqual(next.id, active.id);
  await assert.rejects(f.tea.startCard(f.players[0].token, input), e => e.code === 'stale_start');
  assert.equal((await f.stored()).id, next.id);
});

test('a predictable bot turn follows legal matching and returns control to the human', async () => {
  const f = await fixture(1); const botId = 'bot:1'; const botCard = card('red', 7);
  f.game.players.push(botId); f.game.names[botId] = 'BOT 1'; f.game.hands[botId] = [botCard, card('green', 8)]; await f.save();
  const view = await f.tea.cardAction(f.players[0].token, action(f));
  assert.equal(view.turn, f.players[0].id); assert.equal(view.top.id, botCard.id); assert.equal(view.version, 3); assert.equal(view.lastAction.playerId, botId);
  assert.equal(view.players.find(row => row.id === botId).cards, 1);
});

test('empty game metadata permits only the table host to start; storage failures never mutate a hand', async () => {
  const f = await fixture(); f.db.failWrites = true;
  await assert.rejects(f.tea.cardAction(f.players[0].token, action(f)), /Simulated storage failure/);
  assert.equal((await f.stored()).hands[f.players[0].id].length, 2); f.db.failWrites = false; await f.ref.delete();
  const host = await f.tea.cardState(f.players[0].token); const guest = await f.tea.cardState(f.players[1].token);
  assert.equal(host.game, null); assert.equal(host.canStart, true); assert.equal(guest.canStart, false); assert.equal(guest.hostId, f.players[0].id);
});
