const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createDonationService } = require('../features/donations/service');
const { createTeaService, emptyRoom } = require('../features/tea/service');
const { createTeaRouter, attachTeaSockets } = require('../features/tea/routes');
const config = { bank: 'MB', account: 'test-account', accountName: 'TEST', webhookKey: 'test-secret' };

const socket = id => ({ id, data: {}, join() {}, leave() {}, emit() {}, disconnect() {} });
async function fixture() {
  let clock = 10_000; const db = new MemoryFirestore(), now = () => clock;
  const tea = createTeaService({ db, config, now }), donations = createDonationService({ db, config, now, teaService: tea });
  const one = await donations.createWallet(), two = await donations.createWallet(), outsider = await donations.createWallet();
  for (const [index, wallet] of [one, two, outsider].entries()) await tea.saveProfile(wallet.token, { nickname: `Fighter ${index}`, hair: index, clothes: index + 1, shoes: index + 2 });
  const room = emptyRoom(); room.tables[0].ownerId = one.id;
  Object.assign(room.tables[0].seats[0], { walletId: one.id, seatedAt: clock });
  Object.assign(room.tables[0].seats[1], { walletId: two.id, seatedAt: clock });
  await db.collection('tea_rooms').doc('main').set(room);
  await tea.connect(one.token, socket('one')); await tea.connect(two.token, socket('two')); await tea.connect(outsider.token, socket('outsider'));
  const fight = await tea.challengeFight(one.token, two.id); await tea.respondFight(two.token, fight.id, true);
  return { db, tea, donations, one, two, outsider, id: fight.id, now, tick(ms) { clock += ms; } };
}

test('socket controls require current tab and participant; server movement writes no Firestore documents', async () => {
  const f = await fixture(); f.tick(3000); const before = f.db.version;
  assert.throws(() => f.tea.fightInput(f.one.id, 'fake', { fightId: f.id, seq: 0, dx: 1, dy: 0 }), error => error.code === 'not_controller');
  assert.throws(() => f.tea.fightInput(f.outsider.id, 'outsider', { fightId: f.id, seq: 0, dx: 1, dy: 0 }), error => error.code === 'not_fighter');
  f.tea.fightInput(f.one.id, 'one', { fightId: f.id, seq: 0, dx: 1, dy: 0, x: 580, health: 999 });
  f.tick(100); f.tea.tickFights(); const fight = (await f.tea.fightState(f.one.token)).fight;
  assert.equal(fight.players[0].x, 237.5); assert.equal(fight.players[0].health, 20); assert.equal(fight.players[0].hair, 0);
  assert.equal(f.db.version, before);
  assert.equal((await f.tea.fightState(f.outsider.token)).fight, null);
});

test('reconnecting replaces the controller and restores the match with its input sequence', async () => {
  const f = await fixture(); f.tick(3000);
  f.tea.fightInput(f.one.id, 'one', { fightId: f.id, seq: 8, dx: 1, dy: 0 }); f.tick(100); f.tea.tickFights();
  f.tea.disconnect(f.one.id, 'one'); const stopped = (await f.tea.fightState(f.two.token)).fight.players[0].x;
  f.tick(1000); f.tea.tickFights(); assert.equal((await f.tea.fightState(f.two.token)).fight.players[0].x, stopped);
  const resumed = await f.tea.connect(f.one.token, socket('replacement'));
  assert.equal(resumed.fight.id, f.id); assert.equal(resumed.fight.players[0].inputSeq, 8);
  assert.throws(() => f.tea.fightInput(f.one.id, 'one', { fightId: f.id, seq: 9, dx: 1, dy: 0 }), error => error.code === 'not_controller');
  f.tea.fightInput(f.one.id, 'replacement', { fightId: f.id, seq: 9, dx: 1, dy: 0 });
  f.tick(50); f.tea.tickFights(); assert.equal((await f.tea.fightState(f.two.token)).fight.players[0].x, stopped + 8.75);
});

test('forfeiting is participant-only, idempotent, retains the chair and cannot affect coins', async () => {
  const f = await fixture();
  await assert.rejects(f.tea.forfeitFight(f.outsider.token, f.id), error => error.code === 'not_fighter');
  const finished = await f.tea.forfeitFight(f.one.token, f.id);
  assert.equal(finished.status, 'finished'); assert.equal(finished.reason, 'forfeit'); assert.equal(finished.winnerId, f.two.id);
  assert.deepEqual(await f.tea.forfeitFight(f.one.token, f.id), finished);
  assert.equal((await f.tea.publicState()).guests.find(player => player.walletId === f.one.id).seatId, emptyRoom().tables[0].seats[0].id);
  assert.equal((await f.donations.wallet(f.one.token)).balance, 0); assert.equal((await f.donations.wallet(f.two.token)).balance, 0);
  assert.equal((await f.tea.connect(f.one.token, socket('again'))).fight.reason, 'forfeit');
});

test('pending challenges can be cancelled by either participant, disconnected seats release after 45 seconds', async () => {
  const f = await fixture(); await f.tea.forfeitFight(f.one.token, f.id);
  const pending = await f.tea.challengeFight(f.two.token, f.one.id);
  assert.equal((await f.tea.forfeitFight(f.one.token, pending.id)).reason, 'forfeit');
  const fresh = await f.tea.challengeFight(f.one.token, f.two.id); await f.tea.respondFight(f.two.token, fresh.id, true);
  f.tea.disconnect(f.two.id, 'two'); f.tick(44_999); await f.tea.releaseDisconnected(f.two.id);
  assert.ok((await f.tea.publicState()).room.tables[0].seats[1].walletId);
  f.tick(1); await f.tea.releaseDisconnected(f.two.id);
  const completed = (await f.tea.fightState(f.one.token)).fight;
  assert.equal(completed.reason, 'player_disconnected'); assert.equal(completed.winnerId, f.one.id);
  assert.equal((await f.tea.publicState()).room.tables[0].seats[1].walletId, null);
});

test('restart cancels only the free fight and completed timeout remains recoverable', async () => {
  const f = await fixture(); f.tick(48_000); f.tea.tickFights();
  assert.equal((await f.tea.fightState(f.one.token)).fight.reason, 'draw');
  assert.equal((await f.tea.connect(f.one.token, socket('after-timeout'))).fight.reason, 'draw');
  const next = await f.tea.challengeFight(f.one.token, f.two.id); await f.tea.respondFight(f.two.token, next.id, true);
  await f.tea.recoverAfterRestart(); assert.equal((await f.tea.fightState(f.one.token)).fight.reason, 'server_restart');
  assert.equal((await f.donations.wallet(f.one.token)).balance, 0);
});

test('fight HTTP endpoints enforce token ownership and legacy hits cannot reach remote opponents', async t => {
  const f = await fixture(), app = express(); app.use(createTeaRouter({ service: f.tea }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve))); const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, wallet, body = {}, socketId = null) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(wallet ? { 'X-Wallet-Token': wallet.token } : {}), ...(socketId ? { 'X-Tea-Socket-ID': socketId } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post(`/api/tea/fights/${f.id}/quit`, null)).status, 401);
  assert.equal((await post(`/api/tea/fights/${f.id}/quit`, f.outsider)).status, 403);
  f.tick(3000);
  assert.equal((await post(`/api/tea/fights/${f.id}/hit`, f.one, { requestId: 'missing-socket-hit01' })).status, 403);
  const remote = await post(`/api/tea/fights/${f.id}/hit`, f.one, { requestId: 'http-remote-punch-01', damage: 9999 }, 'one');
  assert.equal(remote.status, 200); const view = (await remote.json()).fight; assert.equal(view.players[1].health, 20); assert.equal(view.actionHistory.at(-1).hit, false);
  await f.tea.connect(f.one.token, socket('new-controller')); f.tick(450);
  assert.equal((await post(`/api/tea/fights/${f.id}/hit`, f.one, { requestId: 'old-tab-punch-0001' }, 'one')).status, 403);
  assert.equal((await post(`/api/tea/fights/${f.id}/hit`, f.one, { requestId: 'new-tab-punch-0001' }, 'new-controller')).status, 200);
  assert.equal((await post(`/api/tea/fights/${f.id}/quit`, f.one)).status, 200);
});

test('socket transport emits safe acknowledgements and only one game loop is attached', async t => {
  const f = await fixture(); const events = {}, handlers = {}, sent = [];
  const io = { use(handler) { handlers.middleware = handler; }, on(name, handler) { handlers[name] = handler; }, to() { return { emit(name, value) { sent.push({ name, value }); } }; } };
  attachTeaSockets(io, f.tea); f.tea.attachIO(io); t.after(() => f.tea.stopFightLoop());
  const client = { ...socket('one'), data: { walletId: f.one.id, tea: {} }, broadcast: { emit() {} }, on(name, handler) { events[name] = handler; } };
  handlers.connection(client); f.tick(3000);
  let response; events['tea:fight-input']({ fightId: f.id, seq: 0, dx: 1, dy: 0 }, value => { response = value; });
  assert.equal(response.ok, true); assert.equal(response.fight.players[0].inputSeq, 0);
  events['tea:fight-input']({ fightId: f.id, seq: 1, dx: Infinity, dy: 0 }, value => { response = value; });
  assert.equal(response.ok, false); assert.equal(response.code, 'bad_fight_input');
  assert.ok(sent.some(row => row.name === 'tea:fight-state'));
});

test('control floods are capped before simulation and repeated unacknowledged rate errors are quiet', async t => {
  const f = await fixture(), handlers = {}, events = {}, emitted = [], updates = [];
  const io = { use() {}, on(name, handler) { handlers[name] = handler; }, to() { return { emit(name, value) { updates.push({ name, value }); } }; } };
  attachTeaSockets(io, f.tea); t.after(() => f.tea.stopFightLoop());
  const client = { ...socket('one'), emit(name, value) { emitted.push({ name, value }); }, data: { walletId: f.one.id, tea: {} }, broadcast: { emit() {} }, on(name, handler) { events[name] = handler; } };
  handlers.connection(client); f.tick(3000);
  for (let seq = 0; seq < 60; seq++) events['tea:fight-input']({ fightId: f.id, seq, dx: 1, dy: 0 });
  const count = updates.length;
  for (let seq = 60; seq < 1000; seq++) events['tea:fight-input']({ fightId: f.id, seq, dx: 1, dy: 0 });
  assert.equal(updates.length, count);
  let fight = (await f.tea.fightState(f.one.token)).fight;
  assert.equal(fight.players[0].x, 220); assert.equal(fight.players[0].inputSeq, 59);
  assert.equal(emitted.filter(row => row.name === 'tea:fight-error' && row.value.code === 'fight_input_rate').length, 1);
  f.tick(1000); events['tea:fight-input']({ fightId: f.id, seq: 1001, dx: 0, dy: 0 });
  fight = (await f.tea.fightState(f.one.token)).fight;
  assert.equal(fight.players[0].inputSeq, 1001); assert.equal(fight.players[0].x, 263.75);
});
