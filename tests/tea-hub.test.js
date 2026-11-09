const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createTeaService, emptyRoom } = require('../features/tea/service');
const { createDonationService } = require('../features/donations/service');

function fixture() {
  let clock = Date.parse('2026-10-12T00:00:00Z');
  const db = new MemoryFirestore(), now = () => clock, tea = createTeaService({ db, config: {}, now }), wallets = createDonationService({ db, config: {}, now }), events = [];
  tea.attachIO({ to(room) { return { emit(name, data) { events.push({ room, name, data }); } }; }, emit(name, data) { events.push({ name, data }); } });
  return { db, tea, wallets, events, tick(ms) { clock += ms; }, now };
}
async function guests(f, count = 2) {
  const players = [], room = emptyRoom();
  for (let n = 0; n < count; n++) {
    const player = await f.wallets.createWallet(); await f.tea.saveProfile(player.token, { nickname: 'Guest ' + n });
    Object.assign(room.tables[2].seats[n], { walletId: player.id, seatedAt: f.now() + n }); players.push(player);
  }
  room.tables[2].ownerId = players[0].id; await f.db.collection('tea_rooms').doc('main').set(room); f.events.length = 0; return players;
}
const req = () => crypto.randomUUID();
const activityOf = async f => (await f.tea.publicState()).room.tables[2].activity;

test('a table reports what it is playing and clears it when the game ends', async () => {
  const f = fixture(), [host] = await guests(f);
  assert.equal(await activityOf(f), null);
  const game = await f.tea.startTableGame(host.token, { key: 'xiangqi', botCount: 0, opponent: 'friend', requestId: req() });
  assert.deepEqual(await activityOf(f), { key: 'xiangqi', players: 2, names: ['Guest 0', 'Guest 1'] });
  assert.equal(f.events.filter(event => event.name === 'tea:state').length, 1, 'starting a game pushes one state update');
  await f.tea.tableGameState(host.token, 'xiangqi'); await f.tea.tableGameState(host.token, 'xiangqi');
  assert.equal(f.events.filter(event => event.name === 'tea:state').length, 1, 'polling an unchanged game does not broadcast');
  await f.tea.tableGameAction(host.token, { key: 'xiangqi', gameId: game.id, requestId: req(), round: 1, type: 'resign' });
  assert.equal(await activityOf(f), null);
  assert.equal(f.events.filter(event => event.name === 'tea:state').length, 2);
});

test('bots are not counted as people and card games are tracked too', async () => {
  const f = fixture(), [host] = await guests(f, 1);
  await f.tea.startTienLen(host.token, { botCount: 2, requestId: req() });
  assert.deepEqual(await activityOf(f), { key: 'tienlen', players: 1, names: ['Guest 0'] });
});

test('activity expires after five quiet minutes and disappears when everyone has left', async () => {
  const f = fixture(), [host] = await guests(f, 1);
  await f.tea.startTableGame(host.token, { key: 'xiangqi', botCount: 0, opponent: 'bot', requestId: req() });
  assert.equal((await activityOf(f)).key, 'xiangqi');
  f.tick(5 * 60_000 + 1000); assert.equal(await activityOf(f), null);
  await f.tea.tableGameState(host.token, 'xiangqi'); assert.equal((await activityOf(f)).key, 'xiangqi', 'a poll proves the game is still being watched');
  const room = (await f.db.collection('tea_rooms').doc('main').get()).data(); room.tables[2].seats[0].walletId = null; await f.db.collection('tea_rooms').doc('main').set(room);
  assert.equal(await activityOf(f), null);
});

test('only the seated table sees its own game and other tables stay empty', async () => {
  const f = fixture(), [host] = await guests(f, 1);
  await f.tea.startTableGame(host.token, { key: 'rps', botCount: 1, requestId: req() });
  const tables = (await f.tea.publicState()).room.tables;
  assert.equal(tables.filter(table => table.activity).length, 1); assert.equal(tables[2].activity.key, 'rps');
});

const fakeSocket = name => ({ id: name, data: {}, rooms: new Set(), join(room) { this.rooms.add(room); }, leave(room) { this.rooms.delete(room); }, emit() {}, disconnect() {} });
const guestOf = async (f, player) => (await f.tea.publicState()).guests.find(guest => guest.walletId === player.id);

test('ranked results put a title and win streak on the people in the café, and reconnecting keeps them', async () => {
  const f = fixture(), [host, other] = await guests(f);
  await f.tea.connect(host.token, fakeSocket('a')); await f.tea.connect(other.token, fakeSocket('b'));
  assert.equal((await guestOf(f, host)).rank, null, 'no ranked game yet, nothing to show');
  const game = await f.tea.startTableGame(host.token, { key: 'xiangqi', botCount: 0, opponent: 'friend', requestId: req() });
  // Pretend four half-moves were played so the game is rated, then the host resigns.
  const row = f.db.rows.get('tea_social_games/' + game.tableId + '-xiangqi'); row.xq.history = Array.from({ length: 4 }, () => ({ f: 0, t: 0, p: 'p', c: '' })); f.db.version++;
  f.events.length = 0;
  await f.tea.tableGameAction(host.token, { key: 'xiangqi', gameId: game.id, requestId: req(), round: 1, type: 'resign' });
  assert.deepEqual((await guestOf(f, other)).rank, { tier: 1, streak: 1 });
  assert.deepEqual((await guestOf(f, host)).rank, { tier: 1, streak: 0 });
  assert.ok(f.events.some(event => event.name === 'tea:state'), 'the café is told');
  const before = f.events.length; await f.tea.tableGameState(other.token, 'xiangqi');
  assert.equal(f.events.length, before, 'asking again does not rebroadcast an unchanged rank');
  await f.tea.connect(other.token, fakeSocket('b2')); assert.deepEqual((await guestOf(f, other)).rank, { tier: 1, streak: 1 }, 'loaded from the saved rating on reconnect');
});

async function seatedAndOnline(count) {
  const f = fixture(), players = await guests(f, count);
  for (const [index, player] of players.entries()) await f.tea.connect(player.token, fakeSocket('s' + index));
  f.events.length = 0; return { f, players };
}

test('a table mate who is not the host can challenge someone and start Xiangqi when they accept', async () => {
  const { f, players: [host, one, two] } = await seatedAndOnline(3);
  await assert.rejects(f.tea.startTableGame(one.token, { key: 'xiangqi', botCount: 0, opponent: 'friend', requestId: req() }), error => error.code === 'not_host');
  const challenge = await f.tea.challengeTableGame(one.token, { key: 'xiangqi', opponentId: two.id });
  assert.equal(challenge.status, 'pending'); assert.equal(challenge.fromName, 'Guest 1');
  assert.ok(f.events.some(event => event.room === 'wallet:' + two.id && event.name === 'tea:game-challenge' && event.data.id === challenge.id), 'only the challenged guest is notified');
  await assert.rejects(f.tea.respondGameChallenge(host.token, challenge.id, true), error => error.code === 'challenge_missing');
  const result = await f.tea.respondGameChallenge(two.token, challenge.id, true);
  assert.equal(result.challenge.status, 'accepted'); assert.deepEqual(result.game.players.map(player => player.id), [one.id, two.id]);
  assert.equal(result.game.myColor, 'black'); assert.equal((await f.tea.tableGameState(one.token, 'xiangqi')).game.myColor, 'red');
  assert.ok(f.events.some(event => event.room === 'wallet:' + one.id && event.name === 'tea:game-challenge-result' && event.data.status === 'accepted'));
  assert.equal((await activityOf(f)).key, 'xiangqi');
  await assert.rejects(f.tea.respondGameChallenge(two.token, challenge.id, true), error => error.code === 'challenge_expired' || error.status === 410, 'cannot be accepted twice');
});

test('challenges can be declined, expire, and are limited to seated table mates', async () => {
  const { f, players: [host, one, two] } = await seatedAndOnline(3);
  const first = await f.tea.challengeTableGame(host.token, { key: 'xiangqi', opponentId: one.id });
  await assert.rejects(f.tea.challengeTableGame(two.token, { key: 'xiangqi', opponentId: host.id }), error => error.code === 'challenge_pending');
  assert.equal((await f.tea.respondGameChallenge(one.token, first.id, false)).challenge.status, 'declined');
  assert.ok(f.events.some(event => event.room === 'wallet:' + host.id && event.data?.status === 'declined'));
  const second = await f.tea.challengeTableGame(host.token, { key: 'xiangqi', opponentId: two.id });
  f.tick(31_000); await assert.rejects(f.tea.respondGameChallenge(two.token, second.id, true), error => error.status === 410);
  const stranger = await f.wallets.createWallet(); await f.tea.saveProfile(stranger.token, { nickname: 'Stranger' });
  await assert.rejects(f.tea.challengeTableGame(host.token, { key: 'xiangqi', opponentId: stranger.id }), error => error.code === 'opponent_unavailable');
  await assert.rejects(f.tea.challengeTableGame(host.token, { key: 'xiangqi', opponentId: host.id }), error => error.code === 'bad_opponent');
  await assert.rejects(f.tea.challengeTableGame(host.token, { key: 'rps', opponentId: one.id }), error => error.code === 'bad_game');
});

test('no new challenge while a Xiangqi game is already running at the table', async () => {
  const { f, players: [host, one] } = await seatedAndOnline(2);
  await f.tea.startTableGame(host.token, { key: 'xiangqi', botCount: 0, opponent: 'friend', requestId: req() });
  await assert.rejects(f.tea.challengeTableGame(one.token, { key: 'xiangqi', opponentId: host.id }), error => error.code === 'game_active');
});
