const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createTeaService, emptyRoom } = require('../features/tea/service');
const { createDonationService } = require('../features/donations/service');

function fixture() {
  let clock = Date.parse('2026-10-12T00:00:00Z');
  const db = new MemoryFirestore(), now = () => clock, tea = createTeaService({ db, config: {}, now }), wallets = createDonationService({ db, config: {}, now }), events = [];
  tea.attachIO({ to() { return { emit() {} }; }, emit(name, data) { events.push({ name, data }); } });
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
