const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const { createDonationService, verifyKey, MAX_AMOUNT, GAMES, DIFFICULTIES } = require('../features/donations/service');
const { createDonationRouter } = require('../features/donations/routes');
const { MemoryFirestore } = require('./helpers/memory-firestore');

const config = { bank: 'MB', account: '0000000000', accountName: 'TEST ONLY', webhookKey: 'test-secret-never-use-in-production' };
const id = () => crypto.randomUUID();
const donationInput = (amount, name) => ({ amount, ...(name == null ? {} : { name }), requestId: id() });
const setup = () => {
  const db = new MemoryFirestore();
  let clock = 1_800_000_000_000;
  const service = createDonationService({ db, config, now: () => clock });
  return { db, service, now: () => clock, setNow: value => { clock = value; } };
};
const payload = (code, transactionId = 1, extra = {}) => ({ id: transactionId, code, content: code, accountNumber: config.account, transferType: 'in', transferAmount: 20_000, ...extra });

async function funded(amount = 100_000) {
  const state = setup();
  const wallet = await state.service.createWallet();
  const donation = await state.service.create(donationInput(amount, '<b>Minh</b>'), wallet.token);
  await state.service.receive(payload(donation.code, 1, { transferAmount: amount }));
  return { ...state, wallet, donation };
}

function reflexAction(game, shouldWin) {
  const rules = GAMES[game.game][game.difficulty];
  for (let elapsed = 0; elapsed < Math.min(15_000, game.expiresAt - game.startedAt); elapsed++) {
    const position = .5 + Math.sin((elapsed / rules.period) * Math.PI * 2 + game.phase) * .5;
    if ((Math.abs(position - .5) <= rules.width / 2) === shouldWin) return { elapsed };
  }
  throw new Error(`No ${shouldWin ? 'winning' : 'losing'} instant found`);
}

function gameAction(game, shouldWin) {
  if (game.game === 'bowl' || game.game === 'needle') return reflexAction(game, shouldWin);
  if (game.game === 'heart') return { elapsed: 0, position: shouldWin ? game.positions[0] : (game.positions[0] + 1) % game.cells };
  if (game.game === 'memory') return { answers: shouldWin ? game.sequence : game.sequence.map((value, index) => index ? value : (value + 1) % 4) };
  const answers = Array.from({ length: game.order.length }, (_, index) => index + 1);
  return { answers: shouldWin ? answers : [2, 1, ...answers.slice(2)] };
}

async function playOutcome(state, token, gameName, difficulty, shouldWin) {
  const game = await state.service.startGame(token, { game: gameName, difficulty, requestId: id() });
  const action = gameAction(game, shouldWin);
  if ('elapsed' in action) {
    state.setNow(game.startedAt + action.elapsed);
    action.actionAt = state.now();
    delete action.elapsed;
  }
  const result = await state.service.play(token, game.id, { actionId: id(), ...action });
  return { game, result };
}

test('wallet and top-up tokens are private, QR is correct and names are stored as plain data', async () => {
  const { db, service } = setup();
  const wallet = await service.createWallet();
  assert.match(wallet.token, /^[a-f0-9]{64}$/);
  const input = donationInput(10_000, '  <b>Minh</b>  ');
  const topup = await service.create(input, wallet.token);
  const replay = await service.create(input, wallet.token);
  assert.deepEqual(replay, topup);
  assert.match(topup.code, /^DH\d{7}$/);
  const url = new URL(topup.qrUrl);
  assert.equal(url.pathname, '/image/MB-0000000000-compact2.png');
  assert.equal(url.searchParams.get('amount'), '10000');
  assert.equal(url.searchParams.get('addInfo'), topup.code);
  assert.equal(db.rows.get(`donation_requests/${topup.code}`).name, '<b>Minh</b>');
  assert.ok(!JSON.stringify([...db.rows]).includes(wallet.token));
  assert.ok(!JSON.stringify([...db.rows]).includes(topup.token));
  await assert.rejects(service.status(topup.token, (await service.createWallet()).token), { status: 404 });
});

test('invalid amounts, names and wallet tokens are rejected', async () => {
  const { service } = setup();
  const wallet = await service.createWallet();
  for (const amount of [0, -1, 1.2, '10000', NaN, Infinity, MAX_AMOUNT + 1, undefined]) {
    await assert.rejects(service.create(donationInput(amount), wallet.token), { status: 400 });
  }
  await assert.rejects(service.create(donationInput(1, 'x'.repeat(61)), wallet.token), { status: 400 });
  await assert.rejects(service.create({ amount: 1_000 }, wallet.token), { status: 400 });
  await assert.rejects(service.wallet('bad-token'), { status: 401 });
});

test('actual money credits one coin per 1,000đ and carries remainder across top-ups', async () => {
  const { service } = setup();
  const wallet = await service.createWallet();
  const first = await service.create(donationInput(10_000), wallet.token);
  const second = await service.create(donationInput(10_000), wallet.token);
  await service.receive(payload(first.code, 1, { transferAmount: 1_500 }));
  assert.deepEqual(await service.status(first.token, wallet.token), { status: 'paid', paidAmount: 1500, paymentCount: 1 });
  let view = await service.wallet(wallet.token);
  assert.equal(view.balance, 1);
  assert.equal(view.remainder, 500);
  await service.receive(payload(second.code, 2, { transferAmount: 600 }));
  view = await service.wallet(wallet.token);
  assert.equal(view.balance, 2);
  assert.equal(view.remainder, 100);
  assert.equal(view.totalDeposited, 2_100);
});

test('duplicate and simultaneous SePay deliveries credit exactly once; distinct IDs both count', async () => {
  const { db, service } = setup();
  const wallet = await service.createWallet();
  const topup = await service.create(donationInput(20_000), wallet.token);
  const outcomes = await Promise.all(Array.from({ length: 12 }, () => service.receive(payload(topup.code, 91))));
  assert.equal(outcomes.filter(item => item.result === 'matched_paid').length, 1);
  assert.equal(outcomes.filter(item => item.result === 'duplicate').length, 11);
  await Promise.all([service.receive(payload(topup.code, 92)), service.receive(payload(topup.code, 93))]);
  assert.equal((await service.wallet(wallet.token)).balance, 60);
  assert.equal([...db.rows.keys()].filter(key => key.startsWith('donation_sepay_events/')).length, 3);
});

test('old codes, wrong accounts, money out, ambiguous codes and invalid amounts never credit a wallet', async () => {
  const { db, service } = setup();
  const wallet = await service.createWallet();
  const topup = await service.create(donationInput(20_000), wallet.token);
  db.rows.set('donation_requests/DH7654321', { code: 'DH7654321', account: config.account, status: 'pending', paidAmount: 0, paymentCount: 0 });
  const cases = [
    payload(topup.code, 10, { accountNumber: '123' }),
    payload(topup.code, 11, { transferType: 'out' }),
    payload('DH9999999', 12),
    payload('DH7654321', 13),
    payload(topup.code, 14, { code: '', content: `${topup.code} DH1111111` }),
    payload(topup.code, 15, { transferAmount: 0 }),
  ];
  for (const item of cases) await service.receive(item);
  assert.equal((await service.wallet(wallet.token)).balance, 0);
  assert.equal(db.rows.get(`donation_requests/${topup.code}`).status, 'pending');
});

test('all 15 game and difficulty combinations settle wins and losses on the server', async () => {
  const state = await funded(100_000);
  for (const gameName of Object.keys(GAMES)) {
    for (const difficulty of Object.keys(DIFFICULTIES)) {
      const beforeWin = (await state.service.wallet(state.wallet.token)).balance;
      const won = await playOutcome(state, state.wallet.token, gameName, difficulty, true);
      assert.equal(won.result.won, true, `${gameName}/${difficulty} should win`);
      assert.equal(won.result.payout, DIFFICULTIES[difficulty].payout);
      assert.equal((await state.service.wallet(state.wallet.token)).balance, beforeWin - 1 + DIFFICULTIES[difficulty].payout);

      const beforeLoss = (await state.service.wallet(state.wallet.token)).balance;
      const lost = await playOutcome(state, state.wallet.token, gameName, difficulty, false);
      assert.equal(lost.result.won, false, `${gameName}/${difficulty} should lose`);
      assert.equal(lost.result.payout, 0);
      assert.equal((await state.service.wallet(state.wallet.token)).balance, beforeLoss - 1);
    }
  }
});

test('simultaneous retries start and settle one game exactly once', async () => {
  const state = await funded(10_000);
  const startRequest = id();
  const games = await Promise.all(Array.from({ length: 8 }, () => state.service.startGame(state.wallet.token, { game: 'needle', difficulty: 'medium', requestId: startRequest })));
  assert.equal(new Set(games.map(game => game.id)).size, 1);
  assert.equal((await state.service.wallet(state.wallet.token)).balance, 9);
  const game = games[0];
  const action = reflexAction(game, true);
  state.setNow(game.startedAt + action.elapsed);
  const actionId = id();
  const results = await Promise.all(Array.from({ length: 8 }, () => state.service.play(state.wallet.token, game.id, { actionId, actionAt: state.now() })));
  assert.ok(results.every(result => result.won && result.payout === 3));
  assert.equal((await state.service.wallet(state.wallet.token)).balance, 12);
});

test('one wallet has one active game, cannot go negative, resumes and settles expiry once', async () => {
  const state = await funded(1_000);
  const game = await state.service.startGame(state.wallet.token, { game: 'bowl', difficulty: 'easy', requestId: id() });
  assert.equal((await state.service.wallet(state.wallet.token)).balance, 0);
  await assert.rejects(state.service.startGame(state.wallet.token, { game: 'heart', difficulty: 'easy', requestId: id() }), { status: 409 });
  assert.equal((await state.service.currentGame(state.wallet.token)).game.id, game.id);
  state.setNow(game.expiresAt + 1);
  const result = await state.service.play(state.wallet.token, game.id, { actionId: id(), actionAt: state.now() });
  assert.equal(result.reason, 'expired');
  const repeated = await state.service.play(state.wallet.token, game.id, { actionId: id(), actionAt: state.now() });
  assert.deepEqual(repeated, result);
  assert.equal((await state.service.wallet(state.wallet.token)).balance, 0);
  await assert.rejects(state.service.startGame(state.wallet.token, { game: 'heart', difficulty: 'easy', requestId: id() }), { status: 409 });
});

test('client-supplied result and payout fields cannot change the server outcome', async () => {
  const state = await funded(2_000);
  const game = await state.service.startGame(state.wallet.token, { game: 'memory', difficulty: 'hard', requestId: id() });
  const result = await state.service.play(state.wallet.token, game.id, { actionId: id(), answers: [], won: true, payout: 999_999, balance: 999_999 });
  assert.equal(result.won, false);
  assert.equal(result.payout, 0);
  assert.equal((await state.service.wallet(state.wallet.token)).balance, 1);
});

test('redemption costs 100 coins, permits only one pending request and rejection refunds once', async () => {
  const state = await funded(200_000);
  const request = await state.service.redeem(state.wallet.token, { name: 'Minh', contact: '0900000000', requestId: id() });
  assert.equal(request.status, 'pending');
  assert.equal((await state.service.wallet(state.wallet.token)).balance, 100);
  await assert.rejects(state.service.redeem(state.wallet.token, { name: 'Minh', contact: 'Zalo', requestId: id() }), { status: 409 });
  const publicStatus = await state.service.redemption(state.wallet.token);
  assert.equal(publicStatus.redemption.status, 'pending');
  assert.equal('contact' in publicStatus.redemption, false);
  const adminRows = await state.service.adminRedemptions();
  assert.equal(adminRows[0].contact, '0900000000');
  assert.ok(adminRows[0].walletHistory.length);
  await assert.rejects(state.service.updateRedemption(request.id, { status: 'rejected' }), { status: 400 });
  await state.service.updateRedemption(request.id, { status: 'rejected', reason: 'Không liên hệ được' });
  assert.equal((await state.service.wallet(state.wallet.token)).balance, 200);
  await state.service.updateRedemption(request.id, { status: 'rejected', reason: 'Không liên hệ được' });
  assert.equal((await state.service.wallet(state.wallet.token)).balance, 200);
});

test('redemption follows pending → approved → fulfilled and then allows another request', async () => {
  const state = await funded(200_000);
  const request = await state.service.redeem(state.wallet.token, { name: 'Lan', contact: 'zalo-lan', requestId: id() });
  await assert.rejects(state.service.updateRedemption(request.id, { status: 'fulfilled' }), { status: 409 });
  await state.service.updateRedemption(request.id, { status: 'approved' });
  await state.service.updateRedemption(request.id, { status: 'fulfilled' });
  assert.equal((await state.service.redemption(state.wallet.token)).redemption.status, 'fulfilled');
  const next = await state.service.redeem(state.wallet.token, { name: 'Lan', contact: 'zalo-lan', requestId: id() });
  assert.equal(next.status, 'pending');
  assert.equal((await state.service.wallet(state.wallet.token)).balance, 0);
});

test('storage errors roll back webhook credits and are surfaced for SePay retry', async () => {
  const { db, service } = setup();
  const wallet = await service.createWallet();
  const topup = await service.create(donationInput(20_000), wallet.token);
  db.failWrites = true;
  await assert.rejects(service.receive(payload(topup.code, 55)), /Simulated storage failure/);
  db.failWrites = false;
  assert.equal((await service.wallet(wallet.token)).balance, 0);
  assert.equal((await service.status(topup.token, wallet.token)).status, 'pending');
  await service.receive(payload(topup.code, 55));
  assert.equal((await service.wallet(wallet.token)).balance, 20);
});

test('webhook authentication uses the configured API key format', () => {
  assert.equal(verifyKey(`Apikey ${config.webhookKey}`, config.webhookKey), true);
  assert.equal(verifyKey(`Bearer ${config.webhookKey}`, config.webhookKey), false);
  assert.equal(verifyKey('Apikey wrong', config.webhookKey), false);
  assert.equal(verifyKey('', ''), false);
});

test('HTTP API creates a wallet, binds top-up status to it and rejects unauthenticated webhook', async t => {
  const db = new MemoryFirestore();
  const app = express();
  app.use(createDonationRouter({ db, config }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const created = await fetch(`${base}/api/game/wallets`, { method: 'POST' });
  assert.equal(created.status, 201);
  const wallet = await created.json();
  const topupResponse = await fetch(`${base}/api/donations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wallet-Token': wallet.token }, body: JSON.stringify(donationInput(5_000)) });
  assert.equal(topupResponse.status, 201);
  const topup = await topupResponse.json();
  const denied = await fetch(`${base}/api/webhooks/sepay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(topup.code, 222, { transferAmount: 5_000 })) });
  assert.equal(denied.status, 401);
  const accepted = await fetch(`${base}/api/webhooks/sepay`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${config.webhookKey}` }, body: JSON.stringify(payload(topup.code, 222, { transferAmount: 5_000 })) });
  assert.equal(accepted.status, 200);
  const status = await fetch(`${base}/api/donations/status`, { headers: { 'X-Wallet-Token': wallet.token, 'X-Donation-Token': topup.token } });
  assert.deepEqual(await status.json(), { status: 'paid', paidAmount: 5000, paymentCount: 1 });
});

test('admin redemption page requires a session and CSRF token, and escapes contact data', async t => {
  const db = new MemoryFirestore();
  const service = createDonationService({ db, config });
  const wallet = await service.createWallet();
  const topup = await service.create(donationInput(100_000), wallet.token);
  await service.receive(payload(topup.code, 333, { transferAmount: 100_000 }));
  const redemption = await service.redeem(wallet.token, { name: '<img src=x>', contact: '<script>bad</script>', requestId: id() });

  const app = express();
  app.use(session({ secret: 'test-session-secret-should-be-long', resave: false, saveUninitialized: false }));
  app.use(createDonationRouter({ db, config, isAdmin: req => req.session.user === 'admin', authenticateAdmin: password => password === 'correct-password' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const anonymous = await fetch(`${base}/xin-tien/admin`, { redirect: 'manual' });
  assert.equal(anonymous.status, 302);
  const login = await fetch(`${base}/xin-tien/admin/login`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=correct-password' });
  assert.equal(login.status, 302);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const page = await fetch(`${base}/xin-tien/admin`, { headers: { Cookie: cookie } });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>bad<\/script>/);
  const csrf = /name="csrf" value="([a-f0-9]+)"/.exec(html)[1];

  const blocked = await fetch(`${base}/xin-tien/admin/redemptions/${redemption.id}`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'status=approved' });
  assert.equal(blocked.status, 403);
  const approved = await fetch(`${base}/xin-tien/admin/redemptions/${redemption.id}`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ status: 'approved', csrf }) });
  assert.equal(approved.status, 302);
  assert.equal((await service.redemption(wallet.token)).redemption.status, 'approved');
});
