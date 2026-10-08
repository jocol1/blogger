const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createDonationService } = require('../features/donations/service');
const { createPartyService, ROOM_COST, PAID_DURATION_MS } = require('../features/party/service');
const { createPartyRouter } = require('../features/party/routes');
const { COURT_QUESTIONS, WRITER_QUESTIONS, WORD_PAIRS, CHALLENGES } = require('../features/party/content');

const donationConfig = { bank: 'MB', account: '123456789', accountName: 'TEST', webhookKey: 'test-key' };
const reqId = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

async function setup() {
  let at = 1_800_000_000_000;
  const db = new MemoryFirestore();
  const donations = createDonationService({ db, config: donationConfig, now: () => at });
  const wallet = await donations.createWallet();
  const party = createPartyService({ db, secret: 'party-test-secret', now: () => at });
  return { db, donations, wallet, party, tick(ms) { at += ms; }, now: () => at };
}
async function makeRoom(state, game = 'court') {
  const created = await state.party.createRoom(state.wallet.token, { name: 'Chủ phòng', requestId: reqId(1) });
  const code = created.room.code;
  const joins = [];
  for (let index = 2; index <= 3; index++) joins.push(await state.party.join(code, { name: `Bạn ${index}`, requestId: reqId(index) }));
  const actors = [{ token: created.token, room: created.room }, ...joins.map(value => ({ token: value.token, room: value.room }))];
  await state.party.action(code, created.token, { requestId: reqId(10), type: 'select_game', game });
  for (let index = 0; index < actors.length; index++) await state.party.action(code, actors[index].token, { requestId: reqId(20 + index), type: 'ready', ready: true });
  return { code, actors };
}

test('party ships the promised content library', () => {
  assert.equal(COURT_QUESTIONS.length, 60);
  assert.equal(WRITER_QUESTIONS.length, 60);
  assert.equal(WORD_PAIRS.length, 40);
  assert.equal(CHALLENGES.length, 30);
});

test('three people join by nickname and one free server-controlled game starts once', async () => {
  const state = await setup();
  const { code, actors } = await makeRoom(state, 'court');
  const started = await state.party.action(code, actors[0].token, { requestId: reqId(30), type: 'start_game' });
  assert.equal(started.status, 'playing');
  assert.equal(started.game.key, 'court');
  assert.equal(started.game.phase, 'vote');
  assert.equal(started.entitlement.trialUsed, true);
  const retry = await state.party.action(code, actors[0].token, { requestId: reqId(30), type: 'start_game' });
  assert.equal(retry.game.startedAt, started.game.startedAt);
  const walletRow = state.db.rows.get(`game_wallets/${state.wallet.id}`);
  assert.equal(walletRow.partyTrialUsed, true);
  await assert.rejects(() => state.party.action(code, actors[0].token, { requestId: reqId(31), type: 'start_game' }), /đang diễn ra/i);
});

test('undercover secrets are personalized and never expose the hidden identity during play', async () => {
  const state = await setup();
  const { code, actors } = await makeRoom(state, 'undercover');
  await state.party.action(code, actors[0].token, { requestId: reqId(30), type: 'start_game' });
  const views = await Promise.all(actors.map(actor => state.party.state(code, actor.token)));
  assert.equal(views.filter(view => view.game.secretRole === 'undercover').length, 1);
  assert.equal(new Set(views.map(view => view.game.secretWord)).size, 2);
  for (const view of views) {
    assert.equal(view.game.undercoverId, undefined);
    assert.equal(view.game.normalWord, undefined);
    assert.equal(view.game.undercoverWord, undefined);
  }
});

test('court accepts one private vote each, limits the defense and resolves the verdict', async () => {
  const state = await setup();
  const { code, actors } = await makeRoom(state, 'court');
  let view = await state.party.action(code, actors[0].token, { requestId: reqId(30), type: 'start_game' });
  const ids = view.players.map(player => player.id);
  for (let index = 0; index < actors.length; index++) {
    view = await state.party.action(code, actors[index].token, { requestId: reqId(40 + index), type: 'game_action', targetId: ids[(index + 1) % ids.length] });
  }
  assert.equal(view.game.phase, 'defense');
  const accusedIndex = ids.indexOf(view.game.accusedId);
  await assert.rejects(() => state.party.action(code, actors[(accusedIndex + 1) % actors.length].token, { requestId: reqId(50), type: 'game_action', text: 'Giành quyền biện hộ' }), /bị cáo/i);
  view = await state.party.action(code, actors[accusedIndex].token, { requestId: reqId(51), type: 'game_action', text: 'Tôi có bằng chứng là lúc đó đang mua trà sữa.' });
  assert.equal(view.game.phase, 'verdict');
  let actionIndex = 60;
  for (let index = 0; index < actors.length; index++) {
    if (index !== accusedIndex) view = await state.party.action(code, actors[index].token, { requestId: reqId(actionIndex++), type: 'game_action', choice: 'punish' });
  }
  assert.equal(view.game.phase, 'result');
  assert.equal(view.game.outcome, 'punish');
  assert.ok(view.game.challenge);
});

test('writer keeps answers anonymous while guessing and reveals the author in the result', async () => {
  const state = await setup();
  const { code, actors } = await makeRoom(state, 'writer');
  let view = await state.party.action(code, actors[0].token, { requestId: reqId(30), type: 'start_game' });
  for (let index = 0; index < actors.length; index++) {
    view = await state.party.action(code, actors[index].token, { requestId: reqId(40 + index), type: 'game_action', text: `Câu trả lời bí mật ${index}` });
  }
  assert.equal(view.game.phase, 'guess');
  const views = await Promise.all(actors.map(actor => state.party.state(code, actor.token)));
  const writerIndex = views.findIndex(item => item.game.isSelectedWriter);
  assert.notEqual(writerIndex, -1);
  const writerId = views[writerIndex].self.id;
  let actionIndex = 60;
  for (let index = 0; index < actors.length; index++) {
    if (index !== writerIndex) view = await state.party.action(code, actors[index].token, { requestId: reqId(actionIndex++), type: 'game_action', targetId: writerId });
  }
  assert.equal(view.game.phase, 'result');
  assert.equal(view.game.result.writerId, writerId);
});

test('undercover runs clue turns, discussion and server-counted elimination', async () => {
  const state = await setup();
  const { code, actors } = await makeRoom(state, 'undercover');
  await state.party.action(code, actors[0].token, { requestId: reqId(30), type: 'start_game' });
  const initialViews = await Promise.all(actors.map(actor => state.party.state(code, actor.token)));
  const actorById = new Map(initialViews.map((view, index) => [view.self.id, actors[index]]));
  const undercoverId = initialViews.find(view => view.game.secretRole === 'undercover').self.id;
  let view = initialViews[0];
  for (let index = 0; index < actors.length; index++) {
    const currentId = view.game.currentPlayerId;
    view = await state.party.action(code, actorById.get(currentId).token, { requestId: reqId(40 + index), type: 'game_action', text: `Gợi ý kín ${index}` });
  }
  assert.equal(view.game.phase, 'discussion');
  state.tick(60_001);
  view = await state.party.state(code, actors[0].token);
  assert.equal(view.game.phase, 'vote');
  const citizenId = view.players.find(player => player.id !== undercoverId).id;
  let actionIndex = 60;
  for (const player of view.players) {
    const targetId = player.id === undercoverId ? citizenId : undercoverId;
    view = await state.party.action(code, actorById.get(player.id).token, { requestId: reqId(actionIndex++), type: 'game_action', targetId });
  }
  assert.equal(view.game.status, 'finished');
  assert.equal(view.game.winner, 'citizens');
});

test('a paid room deducts 19 coins once, activates for two hours and refunds an unused pass once', async () => {
  const state = await setup();
  await state.db.collection('game_wallets').doc(state.wallet.id).set({ balance: 100, partyTrialUsed: true }, { merge: true });
  const created = await state.party.createRoom(state.wallet.token, { name: 'Chủ phòng', requestId: reqId(1) });
  const code = created.room.code;
  const roomRef = state.db.collection('party_rooms').doc(code);
  await roomRef.set({ trialUsed: true }, { merge: true });
  const paid = await state.party.purchase(code, created.token, state.wallet.token, { requestId: reqId(40) });
  assert.equal(paid.entitlement.packageStatus, 'paid');
  assert.equal(state.db.rows.get(`game_wallets/${state.wallet.id}`).balance, 100 - ROOM_COST);
  await state.party.purchase(code, created.token, state.wallet.token, { requestId: reqId(40) });
  assert.equal(state.db.rows.get(`game_wallets/${state.wallet.id}`).balance, 100 - ROOM_COST);
  state.tick(24 * 60 * 60 * 1000 + 1);
  const refunded = await state.party.state(code, created.token);
  assert.equal(refunded.entitlement.packageStatus, 'refunded');
  assert.equal(state.db.rows.get(`game_wallets/${state.wallet.id}`).balance, 100);
  await state.party.state(code, created.token);
  assert.equal(state.db.rows.get(`game_wallets/${state.wallet.id}`).balance, 100);

  await roomRef.set({ packageStatus: 'paid', purchaseDeadline: state.now() + 1000, purchaseId: 'second' }, { merge: true });
  const joinA = await state.party.join(code, { name: 'A', requestId: reqId(2) });
  const joinB = await state.party.join(code, { name: 'B', requestId: reqId(3) });
  for (const [index, token] of [created.token, joinA.token, joinB.token].entries()) await state.party.action(code, token, { requestId: reqId(50 + index), type: 'ready', ready: true });
  const active = await state.party.action(code, created.token, { requestId: reqId(60), type: 'start_game' });
  assert.equal(active.entitlement.packageStatus, 'active');
  assert.equal(active.entitlement.activeUntil, state.now() + PAID_DURATION_MS);
});

test('party rejects forged control, duplicate names and rooms with fewer than three players', async () => {
  const state = await setup();
  const created = await state.party.createRoom(state.wallet.token, { name: 'Host', requestId: reqId(1) });
  const code = created.room.code;
  await assert.rejects(() => state.party.join(code, { name: 'Host', requestId: reqId(2) }), /biệt danh/i);
  await state.party.action(code, created.token, { requestId: reqId(3), type: 'ready', ready: true });
  await assert.rejects(() => state.party.action(code, created.token, { requestId: reqId(4), type: 'start_game' }), /ít nhất 3/i);
  await assert.rejects(() => state.party.state(code, '0'.repeat(64)), /người chơi/i);
});

test('HTTP party APIs require wallet ownership for room purchase and party token for state', async () => {
  const state = await setup();
  const app = express();
  app.use(session({ secret: 'test-session', resave: false, saveUninitialized: false }));
  app.use(createPartyRouter({ db: state.db, secret: 'party-test-secret' }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const createdResponse = await fetch(`${base}/api/party/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Wallet-Token': state.wallet.token },
      body: JSON.stringify({ name: 'Host', requestId: reqId(1) }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal((await fetch(`${base}/api/party/rooms/${created.room.code}`)).status, 401);
    assert.equal((await fetch(`${base}/api/party/rooms/${created.room.code}`, { headers: { 'X-Party-Token': created.token } })).status, 200);
    assert.equal((await fetch(`${base}/api/party/rooms/${created.room.code}/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Party-Token': created.token },
      body: JSON.stringify({ requestId: reqId(2) }),
    })).status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
