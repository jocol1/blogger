const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createDonationService } = require('../features/donations/service');
const { createTeaService, emptyRoom, makeDeck, TABLES } = require('../features/tea/service');
const { findPath, blocked, clearLine } = require('../public/tea/world');

const config = { bank: 'MB', account: '6999912092003', accountName: 'LY TAN LOC', webhookKey: 'tea-test-secret' };
function fixture() {
  let clock = Date.parse('2026-10-12T00:00:00Z');
  const db = new MemoryFirestore(); const now = () => clock;
  const tea = createTeaService({ db, config, now });
  const donations = createDonationService({ db, config, now, teaService: tea });
  return { db, tea, donations, tick(ms) { clock += ms; }, now };
}
async function player(f, name = 'Mochi') {
  const wallet = await f.donations.createWallet();
  await f.tea.saveProfile(wallet.token, { nickname: name, hair: 1, clothes: 2, shoes: 3, language: 'en' });
  return wallet;
}
async function seedSeat(f, walletId, tableIndex = 0, seatIndex = 0) {
  const room = emptyRoom(), table = room.tables[tableIndex], seat = table.seats[seatIndex];
  seat.walletId = walletId; seat.seatedAt = f.now(); table.ownerId = walletId;
  await f.db.collection('tea_rooms').doc('main').set(room);
  return { room, table, seat };
}
const fakeSocket = name => ({ id: name, data: {}, rooms: new Set(), join(room) { this.rooms.add(room); }, leave(room) { this.rooms.delete(room); }, emit() {}, disconnect() {} });
async function walkNear(f, walletId, target) {
  let current = (await f.tea.publicState()).guests.find(g => g.walletId === walletId); const points=findPath(current,target);
  assert.ok(points.length, 'chair must be reachable');
  for(const point of points)for(let n=0;n<100;n++){current=(await f.tea.publicState()).guests.find(g=>g.walletId===walletId);const dx=point.x-current.x,dy=point.y-current.y,distance=Math.hypot(dx,dy);if(distance<1)break;f.tick(50);f.tea.move(walletId,{dx,dy,distance});}
}

test('tea deck contains the promised 60 cards', () => {
  const deck = makeDeck();
  assert.equal(deck.length, 60);
  assert.equal(deck.filter(card => card.kind === 'number').length, 40);
  assert.equal(deck.filter(card => card.kind === 'skip').length, 8);
  assert.equal(deck.filter(card => card.kind === 'draw2').length, 8);
  assert.equal(deck.filter(card => card.kind === 'wild').length, 4);
});

test('the café has public tables for 2, 4 and 8 people with enough seats for every guest', () => {
  assert.deepEqual([...new Set(TABLES.map(table => table.capacity))], [2, 4, 8]);
  assert.equal(TABLES.reduce((sum, table) => sum + table.seats.length, 0), 34);
  assert.equal(TABLES.every(table => !('locked' in table)), true);
});

test('every chair has a walkable path from the entrance without crossing furniture', () => {
  const entrance={x:150,y:560};for(const table of TABLES)for(const seat of table.seats){assert.equal(blocked(seat.x,seat.y),false,seat.id);const path=findPath(entrance,seat);assert.ok(path.length,seat.id);let previous=entrance;for(const point of path){assert.equal(clearLine(previous,point),true,seat.id);previous=point;}}
});

test('a café order keeps partial payment pending, creates one item and credits only excess money', async () => {
  const f = fixture(), wallet = await player(f); await seedSeat(f, wallet.id);
  const order = await f.tea.order(wallet.token, { kind: 'tea', requestId: 'order-request-0001' });
  assert.equal(order.price, 5000); assert.match(order.qrUrl, /6999912092003/); assert.match(order.qrUrl, new RegExp(order.code));
  const first = await f.donations.receive({ id: 91001, transferType: 'in', transferAmount: 2000, accountNumber: config.account, content: order.code });
  assert.equal(first.result, 'tea_partial');
  let current = await f.tea.currentOrder(wallet.token); assert.equal(current.order.remaining, 3000); assert.equal(current.item, null);
  const second = await f.donations.receive({ id: 91002, transferType: 'in', transferAmount: 3000, accountNumber: config.account, content: order.code });
  assert.equal(second.result, 'tea_paid');
  current = await f.tea.currentOrder(wallet.token); assert.equal(current.order, null); assert.equal(current.item.remaining, 3); assert.equal(current.item.status, 'delivering');
  assert.equal((await f.donations.receive({ id: 91002, transferType: 'in', transferAmount: 3000, accountNumber: config.account, content: order.code })).result, 'duplicate');
  assert.equal((await f.donations.wallet(wallet.token)).balance, 0);
  const excess = await f.donations.receive({ id: 91003, transferType: 'in', transferAmount: 2500, accountNumber: config.account, content: order.code });
  assert.equal(excess.result, 'tea_excess'); const balance = await f.donations.wallet(wallet.token); assert.equal(balance.balance, 2); assert.equal(balance.remainder, 500);
  f.tick(2300); current = await f.tea.currentOrder(wallet.token); assert.equal(current.item.status, 'served');
  const one = await f.tea.consume(wallet.token, { requestId: 'consume-request-01' }); assert.equal(one.remaining, 2);
  assert.deepEqual(await f.tea.consume(wallet.token, { requestId: 'consume-request-01' }), one);
  await f.tea.consume(wallet.token, { requestId: 'consume-request-02' }); const done = await f.tea.consume(wallet.token, { requestId: 'consume-request-03' }); assert.equal(done.remaining, 0);
});

test('money sent after cancellation goes into the wallet with remainder intact', async () => {
  const f = fixture(), wallet = await player(f); await seedSeat(f, wallet.id);
  const order = await f.tea.order(wallet.token, { kind: 'snack', requestId: 'cancel-order-0001' });
  await f.donations.receive({ id: 92000, transferType: 'in', transferAmount: 2500, accountNumber: config.account, code: order.code });
  await f.tea.cancelOrder(wallet.token);
  let view = await f.donations.wallet(wallet.token); assert.equal(view.balance, 2); assert.equal(view.remainder, 500);
  const result = await f.donations.receive({ id: 92001, transferType: 'in', transferAmount: 1500, accountNumber: config.account, code: order.code });
  assert.equal(result.result, 'tea_canceled_credit'); view = await f.donations.wallet(wallet.token); assert.equal(view.balance, 4); assert.equal(view.remainder, 0);
});

test('chat is visible only at the current table and content stays plain text', async () => {
  const f = fixture(), one = await player(f, 'One'), two = await player(f, 'Two');
  const room = emptyRoom(); room.tables[0].ownerId = one.id; Object.assign(room.tables[0].seats[0], { walletId: one.id, seatedAt: f.now() }); room.tables[1].ownerId = two.id; Object.assign(room.tables[1].seats[0], { walletId: two.id, seatedAt: f.now() }); await f.db.collection('tea_rooms').doc('main').set(room);
  await f.tea.chat(one.token, { text: '<img src=x onerror=alert(1)> hello' });
  const own = await f.tea.chats(one.token, 0), other = await f.tea.chats(two.token, 0);
  assert.equal(own.messages.length, 1); assert.equal(own.messages[0].text, '<img src=x onerror=alert(1)> hello'); assert.equal(other.messages.length, 0);
});

test('card game hides opponents hands, supports a bot and deduplicates an action', async () => {
  const f = fixture(), wallet = await player(f); await seedSeat(f, wallet.id);
  const game = await f.tea.startCard(wallet.token, { requestId: 'card-start-00001', botCount: 1 });
  assert.equal(game.players.length, 2); assert.equal(game.hand.length, 7); assert.equal('hands' in game, false); assert.equal(game.players[1].bot, true);
  const action = { action: 'draw', gameId:game.id, requestId: 'card-action-0001' };
  const first = await f.tea.cardAction(wallet.token, action); const retry = await f.tea.cardAction(wallet.token, action);
  assert.deepEqual(retry, first); assert.ok(first.hand.length>=8);
});

test('only one player wins a simultaneous claim for the same chair', async () => {
  const f = fixture(), one = await player(f, 'One'), two = await player(f, 'Two');
  await f.tea.connect(one.token, fakeSocket('one')); await f.tea.connect(two.token, fakeSocket('two'));
  async function walk(walletId, target) {
    for (let n = 0; n < 35; n++) { const current = (await f.tea.publicState()).guests.find(g => g.walletId === walletId); const dx = target.x - current.x, dy = target.y - current.y; if (Math.hypot(dx, dy) < 45) break; f.tick(100); f.tea.move(walletId, { dx, dy }); }
  }
  const target = emptyRoom().tables[1].seats[3]; await walk(one.id, target); await walk(two.id, target);
  const results = await Promise.allSettled([f.tea.seat(one.token, target.id), f.tea.seat(two.token, target.id)]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1); assert.equal(results.filter(value => value.status === 'rejected').length, 1);
});

test('spamming movement within one server tick cannot speed up the character',async()=>{const f=fixture(),wallet=await player(f);await f.tea.connect(wallet.token,fakeSocket('spam'));f.tea.move(wallet.id,{dx:1,dy:0});const before=(await f.tea.publicState()).guests[0];for(let i=0;i<100;i++)f.tea.move(wallet.id,{dx:1,dy:0});const after=(await f.tea.publicState()).guests[0];assert.equal(before.x,after.x);assert.equal(before.y,after.y)});

test('walking preserves the requested direction and stops precisely at a waypoint',async()=>{const f=fixture(),wallet=await player(f);await f.tea.connect(wallet.token,fakeSocket('walk'));const before=(await f.tea.publicState()).guests[0];f.tick(50);f.tea.move(wallet.id,{dx:80,dy:20,distance:4});const after=(await f.tea.publicState()).guests[0];assert.ok(Math.abs(Math.hypot(after.x-before.x,after.y-before.y)-4)<0.0001);assert.ok(Math.abs((after.x-before.x)/(after.y-before.y)-4)<0.0001)});

test('asking before sitting is optional and only a current table guest can answer', async () => {
  const f = fixture(), host = await player(f, 'Host'), visitor = await player(f, 'Visitor'), outsider = await player(f, 'Outsider');
  await f.tea.connect(host.token, fakeSocket('host')); await f.tea.connect(visitor.token, fakeSocket('visitor')); await f.tea.connect(outsider.token, fakeSocket('outsider'));
  const table = emptyRoom().tables[1]; await walkNear(f, host.id, table.seats[0]); await f.tea.seat(host.token, table.seats[0].id); await walkNear(f, visitor.id, table.seats[1]);
  const request = await f.tea.askToSit(visitor.token, table.seats[1].id); assert.equal(request.status, 'pending');
  await assert.rejects(f.tea.respondSeatRequest(outsider.token, request.id, true), error => error.code === 'wrong_table');
  assert.equal((await f.tea.respondSeatRequest(host.token, request.id, true)).status, 'accepted');
  const seated = await f.tea.seat(visitor.token, table.seats[1].id); assert.equal(seated.tableId, table.id);
});

test('pixel brawl needs consent, rate limits hits and ends when a player leaves', async () => {
  const f = fixture(), one = await player(f, 'One'), two = await player(f, 'Two'); await f.tea.connect(one.token, fakeSocket('one')); await f.tea.connect(two.token, fakeSocket('two'));
  const table = emptyRoom().tables[1]; await walkNear(f, one.id, table.seats[0]); await f.tea.seat(one.token, table.seats[0].id); await walkNear(f, two.id, table.seats[1]); await f.tea.seat(two.token, table.seats[1].id);
  const pending = await f.tea.challengeFight(one.token, two.id); assert.equal(pending.status, 'pending'); const active = await f.tea.respondFight(two.token, pending.id, true); assert.equal(active.status, 'active');
  const first = await f.tea.hitFight(one.token, pending.id, { requestId: 'fight-hit-request-01' }); assert.equal(first.players.find(p => p.id === two.id).health, 11);
  assert.deepEqual(await f.tea.hitFight(one.token, pending.id, { requestId: 'fight-hit-request-01' }), first);
  await assert.rejects(f.tea.hitFight(one.token, pending.id, { requestId: 'fight-hit-request-02' }), error => error.code === 'hit_rate');
  await f.tea.leave(two.token); const finished = (await f.tea.fightState(one.token)).fight; assert.equal(finished, null);
});

test('a completed brawl deduplicates its winning hit and ignores forged damage',async()=>{
  const f=fixture(),one=await player(f,'One'),two=await player(f,'Two');const room=emptyRoom();Object.assign(room.tables[0].seats[0],{walletId:one.id,seatedAt:f.now()});Object.assign(room.tables[0].seats[1],{walletId:two.id,seatedAt:f.now()});room.tables[0].ownerId=one.id;await f.db.collection('tea_rooms').doc('main').set(room);await f.tea.connect(one.token,fakeSocket('one'));await f.tea.connect(two.token,fakeSocket('two'));
  const challenge=await f.tea.challengeFight(one.token,two.id);await f.tea.respondFight(two.token,challenge.id,true);let finished,input;for(let i=0;i<12;i++){f.tick(300);input={requestId:`winning-hit-request-${i}`,damage:999,winnerId:two.id};finished=await f.tea.hitFight(one.token,challenge.id,input)}assert.equal(finished.status,'finished');assert.equal(finished.winnerId,one.id);assert.equal(finished.players.find(p=>p.id===two.id).health,0);assert.deepEqual(await f.tea.hitFight(one.token,challenge.id,input),finished);assert.equal((await f.donations.wallet(one.token)).balance,0);
});

test('expired and declined brawl challenges free both players for a new challenge',async()=>{
  const f=fixture(),one=await player(f,'One'),two=await player(f,'Two');const room=emptyRoom();Object.assign(room.tables[0].seats[0],{walletId:one.id,seatedAt:f.now()});Object.assign(room.tables[0].seats[1],{walletId:two.id,seatedAt:f.now()});room.tables[0].ownerId=one.id;await f.db.collection('tea_rooms').doc('main').set(room);await f.tea.connect(one.token,fakeSocket('one'));await f.tea.connect(two.token,fakeSocket('two'));
  await f.tea.challengeFight(one.token,two.id);f.tick(21000);const next=await f.tea.challengeFight(one.token,two.id);assert.equal(next.status,'pending');assert.equal((await f.tea.respondFight(one.token,next.id,false)).reason,'declined');const again=await f.tea.challengeFight(two.token,one.id);assert.equal(again.status,'pending');
});
