const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const sharp = require('sharp');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createDonationService } = require('../features/donations/service');
const { createPartyService, ROOM_COST, PAID_DURATION_MS } = require('../features/party/service');
const { createPartyRouter } = require('../features/party/routes');
const { COURT_QUESTIONS, WRITER_QUESTIONS, WORD_PAIRS, CHALLENGES, DRAWING_PROMPTS } = require('../features/party/content');
const { beginDrawingGame, assignmentFor, processDrawing, MAX_DRAWING_INPUT_BYTES } = require('../features/party/drawing');

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
async function makeRoom(state, game = 'court', playerCount = 3) {
  const created = await state.party.createRoom(state.wallet.token, { name: 'Chủ phòng', requestId: reqId(1) });
  const code = created.room.code;
  const joins = [];
  for (let index = 2; index <= playerCount; index++) joins.push(await state.party.join(code, { name: `Bạn ${index}`, requestId: reqId(index) }));
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
  assert.equal(DRAWING_PROMPTS.length, 60);
});

test('drawing assignments pass every chain through every player exactly once for 3, 4 and 10 people', () => {
  for (const count of [3, 4, 10]) {
    const players = Array.from({ length: count }, (_, index) => ({ id: String(index).padStart(24, 'a') }));
    const game = beginDrawingGame({ code: 'ABC234', gameNumber: 0, players }, 1_800_000_000_000, DRAWING_PROMPTS);
    for (const player of players) {
      const chains = Array.from({ length: count }, (_, turn) => assignmentFor(game, player.id, turn).chainId);
      assert.equal(new Set(chains).size, count);
      assert.equal(chains[0], player.id);
    }
  }
});

test('one person can add two bots and finish a complete drawing chain with bot images', async () => {
  const state = await setup();
  const created = await state.party.createRoom(state.wallet.token, { name: 'Người chơi thật', requestId: reqId(1) });
  const code = created.room.code;
  let view = await state.party.action(code, created.token, { requestId: reqId(2), type: 'add_bot' });
  view = await state.party.action(code, created.token, { requestId: reqId(3), type: 'add_bot' });
  assert.equal(view.players.length, 3);
  assert.equal(view.players.filter(player => player.isBot).length, 2);
  assert.ok(view.players.filter(player => player.isBot).every(player => player.ready));
  await state.party.action(code, created.token, { requestId: reqId(4), type: 'select_game', game: 'drawing' });
  await state.party.action(code, created.token, { requestId: reqId(5), type: 'ready', ready: true });
  view = await state.party.action(code, created.token, { requestId: reqId(6), type: 'start_game' });
  assert.equal(view.game.turn, 0);
  assert.equal(view.game.submittedCount, 2);
  const gameId = view.game.gameId;
  view = await state.party.action(code, created.token, { requestId: reqId(7), type: 'game_action', gameId, turn: 0, text: 'Một chú cá đi mua dép' });
  assert.equal(view.game.turn, 1);
  assert.equal(view.game.submittedCount, 2);
  const imageBuffer = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#fff' } }).png().toBuffer();
  view = await state.party.submitDrawing(code, created.token, { requestId: reqId(8), gameId, turn: '1' }, { buffer: imageBuffer, mimetype: 'image/png' });
  assert.equal(view.game.turn, 2);
  assert.equal(view.game.submittedCount, 2);
  assert.equal(view.game.previous.kind, 'drawing');
  assert.equal((await state.party.drawingImage(code, created.token, view.game.previous.imageId)).mime, 'image/webp');
  view = await state.party.action(code, created.token, { requestId: reqId(9), type: 'game_action', gameId, turn: 2, text: 'Bot đang tấu hài' });
  assert.equal(view.game.status, 'finished');
  assert.equal(view.game.chains.length, 3);
  assert.ok(view.game.chains.flatMap(chain => chain.contributions).some(item => item.kind === 'drawing' && item.authorName.startsWith('Bot ')));
  const botImages = [...state.db.rows.values()].filter(row => row.gameId === gameId && row.kind === 'drawing' && row.isBot);
  assert.equal(botImages.length, 2);
  assert.ok(botImages.every(row => Buffer.from(row.data).length <= 128 * 1024));
});

test('bots take their opening turns in every original Party game and can never become host', async () => {
  for (const game of ['court', 'writer', 'undercover']) {
    const state = await setup();
    const created = await state.party.createRoom(state.wallet.token, { name: 'Solo', requestId: reqId(1) });
    const code = created.room.code;
    await state.party.action(code, created.token, { requestId: reqId(2), type: 'add_bot' });
    const withBots = await state.party.action(code, created.token, { requestId: reqId(3), type: 'add_bot' });
    const botId = withBots.players.find(player => player.isBot).id;
    await assert.rejects(() => state.party.action(code, created.token, { requestId: reqId(4), type: 'transfer', targetId: botId }), /không thể làm chủ/i);
    await state.party.action(code, created.token, { requestId: reqId(5), type: 'select_game', game });
    await state.party.action(code, created.token, { requestId: reqId(6), type: 'ready', ready: true });
    const started = await state.party.action(code, created.token, { requestId: reqId(7), type: 'start_game' });
    const stored = state.db.rows.get(`party_rooms/${code}`).game;
    if (game === 'court') assert.equal(Object.keys(stored.votes).length, 2);
    if (game === 'writer') assert.equal(Object.keys(stored.responses).length, 2);
    if (game === 'undercover') assert.equal(stored.clueOrder[stored.clueIndex], started.self.id);
  }
});

test('a solo human can play every original Party game with two bots through the final result', async () => {
  for (const game of ['court', 'writer', 'undercover']) {
    const state = await setup();
    const created = await state.party.createRoom(state.wallet.token, { name: 'Solo', requestId: reqId(1) });
    const code = created.room.code;
    await state.party.action(code, created.token, { requestId: reqId(2), type: 'add_bot' });
    await state.party.action(code, created.token, { requestId: reqId(3), type: 'add_bot' });
    await state.party.action(code, created.token, { requestId: reqId(4), type: 'select_game', game });
    await state.party.action(code, created.token, { requestId: reqId(5), type: 'ready', ready: true });
    let view = await state.party.action(code, created.token, { requestId: reqId(6), type: 'start_game' });
    let request = 20;
    for (let guard = 0; guard < 80 && view.game.status !== 'finished'; guard++) {
      const current = view.game;
      let payload = null;
      if (game === 'court' && current.phase === 'vote' && !current.hasActed) payload = { targetId: view.players.find(player => player.id !== view.self.id).id };
      else if (game === 'court' && current.phase === 'defense' && current.accusedId === view.self.id && !current.hasActed) payload = { text: 'Tôi đang chơi một mình nên bot phải chịu trách nhiệm.' };
      else if (game === 'court' && current.phase === 'verdict' && current.accusedId !== view.self.id && !current.hasActed) payload = { choice: 'forgive' };
      else if (game === 'writer' && current.phase === 'answer' && !current.hasActed) payload = { text: 'Câu trả lời của người thật duy nhất.' };
      else if (game === 'writer' && current.phase === 'guess' && !current.isSelectedWriter && !current.hasActed) payload = { targetId: view.players.find(player => player.id !== view.self.id).id };
      else if (game === 'undercover' && current.phase === 'clue' && current.currentPlayerId === view.self.id && !current.hasActed) payload = { text: 'Một gợi ý rất con người.' };
      else if (game === 'undercover' && current.phase === 'vote' && !current.hasActed && !current.eliminated.includes(view.self.id)) {
        const allowed = current.tieIds?.length ? current.tieIds : view.players.filter(player => !current.eliminated.includes(player.id)).map(player => player.id);
        payload = { targetId: allowed.find(id => id !== view.self.id) };
      }
      if (payload) view = await state.party.action(code, created.token, { requestId: reqId(request++), type: 'game_action', ...payload });
      else if (current.phaseEndsAt != null) {
        state.tick(Math.max(1, current.phaseEndsAt - state.now() + 1));
        view = await state.party.state(code, created.token);
      } else break;
    }
    assert.equal(view.game.status, 'finished', `${game} phải kết thúc khi chơi với bot`);
  }
});

test('drawing party keeps chains private, accepts images once and reveals every contribution at the end', async () => {
  const state = await setup();
  const { code, actors } = await makeRoom(state, 'drawing');
  let view = await state.party.action(code, actors[0].token, { requestId: reqId(30), type: 'start_game' });
  assert.equal(view.game.key, 'drawing');
  assert.equal(view.game.assignment.kind, 'prompt');
  assert.equal(view.game.chains, undefined);
  const gameId = view.game.gameId;
  for (let index = 0; index < actors.length; index++) {
    const own = await state.party.state(code, actors[index].token);
    view = await state.party.action(code, actors[index].token, { requestId: reqId(40 + index), type: 'game_action', gameId, turn: 0, text: `Câu mở đầu ${index}` });
    assert.equal(own.game.chains, undefined);
  }
  assert.equal(view.game.turn, 1);
  const promptViews = await Promise.all(actors.map(actor => state.party.state(code, actor.token)));
  for (const item of promptViews) {
    assert.equal(item.game.previous.kind, 'prompt');
    assert.equal(item.game.previous.authorName, undefined);
  }
  await assert.rejects(() => state.party.action(code, actors[0].token, { requestId: reqId(49), type: 'game_action', gameId, turn: 0, text: 'Bài cũ' }), /lượt này đã thay đổi/i);
  const imageBuffer = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ffffff' } }).png().toBuffer();
  for (let index = 0; index < actors.length; index++) {
    view = await state.party.submitDrawing(code, actors[index].token, { requestId: reqId(50 + index), gameId, turn: '1' }, { buffer: imageBuffer, mimetype: 'image/png' });
  }
  assert.equal(view.game.turn, 2);
  const drawingViews = await Promise.all(actors.map(actor => state.party.state(code, actor.token)));
  const imageIds = drawingViews.map(item => item.game.previous.imageId);
  assert.equal(new Set(imageIds).size, actors.length);
  const allowed = await state.party.drawingImage(code, actors[0].token, imageIds[0]);
  assert.equal(allowed.mime, 'image/webp');
  await assert.rejects(() => state.party.drawingImage(code, actors[0].token, imageIds[1]), /chưa được xem/i);
  for (let index = 0; index < actors.length; index++) {
    view = await state.party.action(code, actors[index].token, { requestId: reqId(60 + index), type: 'game_action', gameId, turn: 2, text: `Lời đoán ${index}` });
  }
  assert.equal(view.game.status, 'finished');
  assert.equal(view.game.chains.length, 3);
  assert.ok(view.game.chains.every(chain => chain.contributions.length === 3));
  assert.ok(view.game.chains.flatMap(chain => chain.contributions).every(item => item.authorName));
  assert.equal((await state.party.drawingImage(code, actors[0].token, imageIds[1])).mime, 'image/webp');
});

test('drawing timeouts preserve the original schedule and replace a missing prompt with a server suggestion', async () => {
  const state = await setup();
  const { code, actors } = await makeRoom(state, 'drawing', 4);
  const started = await state.party.action(code, actors[0].token, { requestId: reqId(30), type: 'start_game' });
  const firstDeadline = started.game.phaseEndsAt;
  state.tick(30_001 + 60_001);
  const progressed = await state.party.state(code, actors[0].token);
  assert.equal(progressed.game.turn, 2);
  assert.equal(progressed.game.previous.skipped, true);
  assert.equal(progressed.game.phaseEndsAt, firstDeadline + 60_000 + 30_000);
});

test('drawing submissions are idempotent under retry and only one concurrent answer is stored', async () => {
  const state = await setup();
  const { code, actors } = await makeRoom(state, 'drawing');
  const started = await state.party.action(code, actors[0].token, { requestId: reqId(30), type: 'start_game' });
  const payload = { type: 'game_action', gameId: started.game.gameId, turn: 0, text: 'Một con mèo lái máy bay' };
  const same = { ...payload, requestId: reqId(40) };
  const first = await state.party.action(code, actors[0].token, same);
  const retry = await state.party.action(code, actors[0].token, same);
  assert.equal(retry.version, first.version);
  const results = await Promise.allSettled([
    state.party.action(code, actors[1].token, { ...payload, requestId: reqId(41), text: 'Bản một' }),
    state.party.action(code, actors[1].token, { ...payload, requestId: reqId(42), text: 'Bản hai' }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const secondPlayer = await state.party.state(code, actors[1].token);
  const saved = [...state.db.rows.values()].filter(row => row.gameId === started.game.gameId && row.playerId === secondPlayer.self.id);
  assert.equal(saved.length, 1);
});

test('drawing image validation rejects fake and oversized uploads', async () => {
  await assert.rejects(() => processDrawing({ mimetype: 'image/png', buffer: Buffer.from('<svg></svg>') }), /không phải ảnh/i);
  await assert.rejects(() => processDrawing({ mimetype: 'image/webp', buffer: Buffer.alloc(MAX_DRAWING_INPUT_BYTES + 1) }), /tối đa 1 MB/i);
  await assert.rejects(() => processDrawing({ mimetype: 'image/svg+xml', buffer: Buffer.from('<svg></svg>') }), /PNG hoặc WebP/i);
});

test('expired drawing bytes are physically removed by maintenance', async () => {
  const state = await setup();
  state.db.rows.set('party_drawing_contributions/stale-image', { id: 'stale-image', purgeAt: state.now() - 1, kind: 'drawing', data: Buffer.from('old') });
  await state.party.runMaintenance();
  assert.equal(state.db.rows.has('party_drawing_contributions/stale-image'), false);
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
  const guest = await state.party.join(code, { name: 'Khách', requestId: reqId(5) });
  await assert.rejects(() => state.party.action(code, guest.token, { requestId: reqId(6), type: 'add_bot' }), /chủ phòng/i);
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
