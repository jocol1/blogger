const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createDonationService } = require('../features/donations/service');
const { createTeaService, emptyRoom, makeDeck } = require('../features/tea/service');

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

test('tea deck contains the promised 60 cards', () => {
  const deck = makeDeck();
  assert.equal(deck.length, 60);
  assert.equal(deck.filter(card => card.kind === 'number').length, 40);
  assert.equal(deck.filter(card => card.kind === 'skip').length, 8);
  assert.equal(deck.filter(card => card.kind === 'draw2').length, 8);
  assert.equal(deck.filter(card => card.kind === 'wild').length, 4);
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
  const action = { action: 'draw', requestId: 'card-action-0001' };
  const first = await f.tea.cardAction(wallet.token, action); const retry = await f.tea.cardAction(wallet.token, action);
  assert.deepEqual(retry, first); assert.equal(first.hand.length, 8);
});

test('only one player wins a simultaneous claim for the same chair', async () => {
  const f = fixture(), one = await player(f, 'One'), two = await player(f, 'Two');
  const fake = name => ({ id: name, data: {}, rooms: new Set(), join(room) { this.rooms.add(room); }, leave(room) { this.rooms.delete(room); }, emit() {}, disconnect() {} });
  await f.tea.connect(one.token, fake('one')); await f.tea.connect(two.token, fake('two'));
  async function walk(walletId, target) {
    for (let n = 0; n < 35; n++) { const current = (await f.tea.publicState()).guests.find(g => g.walletId === walletId); const dx = target.x - current.x, dy = target.y - current.y; if (Math.hypot(dx, dy) < 45) break; f.tick(100); f.tea.move(walletId, { dx, dy }); }
  }
  const target = emptyRoom().tables[3].seats[3]; await walk(one.id, target); await walk(two.id, target);
  const results = await Promise.allSettled([f.tea.seat(one.token, target.id), f.tea.seat(two.token, target.id)]);
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1); assert.equal(results.filter(value => value.status === 'rejected').length, 1);
});
