const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const expressSession = require('express-session');
const sharp = require('sharp');
const { createDonationService } = require('../features/donations/service');
const { createChatService, ChatError, CHAT_COST, CHAT_DURATION_MS, RETENTION_MS } = require('../features/chat/service');
const { createChatRouter } = require('../features/chat/routes');
const { MemoryFirestore } = require('./helpers/memory-firestore');

const donationConfig = { bank: 'MB', account: '0000000000', accountName: 'TEST ONLY', webhookKey: 'test-secret' };
const requestId = () => crypto.randomUUID();

class FakeBucket {
  constructor() { this.files = new Map(); this.available = true; }
  async getMetadata() { if (!this.available) throw new Error('bucket unavailable'); return [{ name: 'fake-private-bucket' }]; }
  file(path) {
    const bucket = this;
    return {
      async save(buffer, options) { if (!bucket.available) throw new Error('bucket unavailable'); bucket.files.set(path, { buffer: Buffer.from(buffer), options }); },
      async download() { const item = bucket.files.get(path); if (!item) throw new Error('not found'); return [Buffer.from(item.buffer)]; },
      async delete() { bucket.files.delete(path); },
    };
  }
}

function setup() {
  const db = new MemoryFirestore();
  const bucket = new FakeBucket();
  let clock = 1_800_000_000_000;
  let transferId = 10;
  const donations = createDonationService({ db, config: donationConfig, now: () => clock });
  const chat = createChatService({ db, bucket, now: () => clock });
  return {
    db, bucket, donations, chat,
    now: () => clock,
    setNow: value => { clock = value; },
    async ready() { assert.equal(await chat.verifyStorage(), true); },
    async wallet(amount = 20_000) {
      const wallet = await donations.createWallet();
      const topup = await donations.create({ amount, requestId: requestId() }, wallet.token);
      await donations.receive({ id: transferId++, code: topup.code, content: topup.code, accountNumber: donationConfig.account, transferType: 'in', transferAmount: amount });
      return wallet;
    },
  };
}

test('chat is ready with Firestore and does not require a paid Storage bucket', async () => {
  const state = setup();
  assert.equal((await state.chat.publicConfig()).ready, true);
  state.bucket.available = false;
  assert.equal(await state.chat.verifyStorage(), true);
  await assert.rejects(state.chat.start('bad', { requestId: requestId() }), { status: 401 });
});

test('starting a session costs 10 coins and retries never charge twice', async () => {
  const state = setup(); await state.ready();
  const wallet = await state.wallet(20_000);
  const startId = requestId();
  const sessions = await Promise.all(Array.from({ length: 8 }, () => state.chat.start(wallet.token, { requestId: startId })));
  assert.equal(new Set(sessions.map(item => item.id)).size, 1);
  assert.equal((await state.donations.wallet(wallet.token)).balance, 10);
  assert.equal(sessions[0].expiresAt - sessions[0].startedAt, CHAT_DURATION_MS);
});

test('at most three wallets can hold active sessions under contention', async () => {
  const state = setup(); await state.ready();
  const wallets = await Promise.all(Array.from({ length: 4 }, () => state.wallet(10_000)));
  const results = await Promise.allSettled(wallets.map(wallet => state.chat.start(wallet.token, { requestId: requestId() })));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 3);
  assert.equal(results.filter(item => item.status === 'rejected' && item.reason instanceof ChatError && item.reason.status === 409).length, 1);
  const balances = await Promise.all(wallets.map(wallet => state.donations.wallet(wallet.token).then(item => item.balance)));
  assert.equal(balances.filter(value => value === 0).length, 3);
  assert.equal(balances.filter(value => value === 10).length, 1);
});

test('one wallet cannot open a second active session', async () => {
  const state = setup(); await state.ready();
  const wallet = await state.wallet(30_000);
  await state.chat.start(wallet.token, { requestId: requestId() });
  await assert.rejects(state.chat.start(wallet.token, { requestId: requestId() }), { status: 409 });
  assert.equal((await state.donations.wallet(wallet.token)).balance, 20);
});

test('messages are ordered, idempotent, private and images are re-encoded to WebP', async () => {
  const state = setup(); await state.ready();
  const owner = await state.wallet(20_000); const stranger = await state.wallet(10_000);
  const session = await state.chat.start(owner.token, { requestId: requestId() });
  const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#ff0066' } }).png().toBuffer();
  const sendId = requestId();
  const first = await state.chat.sendUserMessage(owner.token, session.id, { requestId: sendId, text: '<b>xin chào</b>' }, [{ buffer: png, originalname: '../ảnh.png' }]);
  const replay = await state.chat.sendUserMessage(owner.token, session.id, { requestId: sendId, text: 'khác' }, []);
  assert.equal(replay.id, first.id);
  assert.equal(first.text, '<b>xin chào</b>');
  assert.equal(first.attachments[0].mime, 'image/webp');
  assert.equal(first.attachments[0].name, '.._ảnh.png');
  const storedImage = [...state.db.rows.entries()].find(([key]) => key.startsWith('chat_images/'))[1];
  assert.equal((await sharp(Buffer.from(storedImage.data)).metadata()).format, 'webp');
  const page = await state.chat.messages(owner.token, session.id, 0);
  assert.deepEqual(page.messages.map(item => item.seq), [1]);
  assert.equal('storagePath' in page.messages[0].attachments[0], false);
  await assert.rejects(state.chat.messages(stranger.token, session.id, 0), { status: 404 });
  const image = await state.chat.readImage({ walletToken: owner.token, sessionIdValue: session.id, messageIdValue: first.id, indexValue: 0 });
  assert.equal((await sharp(image.buffer).metadata()).format, 'webp');
});

test('simultaneous image retries keep one message and remove the losing upload', async () => {
  const state = setup(); await state.ready();
  const wallet = await state.wallet(20_000); const session = await state.chat.start(wallet.token, { requestId: requestId() });
  const red = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const blue = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#0000ff' } }).png().toBuffer();
  const sendId = requestId();
  const rows = await Promise.all([
    state.chat.sendUserMessage(wallet.token, session.id, { requestId: sendId, text: 'một' }, [{ buffer: red, originalname: 'red.png' }]),
    state.chat.sendUserMessage(wallet.token, session.id, { requestId: sendId, text: 'hai' }, [{ buffer: blue, originalname: 'blue.png' }]),
  ]);
  assert.equal(rows[0].id, rows[1].id);
  assert.equal([...state.db.rows.keys()].filter(key => key.startsWith('chat_images/')).length, 1);
  assert.equal((await state.chat.messages(wallet.token, session.id, 0)).messages.length, 1);
});

test('SVG, fake images, oversized text and too many images are rejected', async () => {
  const state = setup(); await state.ready();
  const wallet = await state.wallet(20_000); const session = await state.chat.start(wallet.token, { requestId: requestId() });
  await assert.rejects(state.chat.sendUserMessage(wallet.token, session.id, { requestId: requestId(), text: '' }, [{ buffer: Buffer.from('<svg/>'), originalname: 'x.svg' }]), { status: 400 });
  await assert.rejects(state.chat.sendUserMessage(wallet.token, session.id, { requestId: requestId(), text: 'x'.repeat(4001) }, []), { status: 400 });
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(state.chat.sendUserMessage(wallet.token, session.id, { requestId: requestId(), text: '' }, Array.from({ length: 4 }, () => ({ buffer: png, originalname: 'x.png' }))), { status: 400 });
});

test('an unanswered expired session refunds 10 coins exactly once', async () => {
  const state = setup(); await state.ready();
  const wallet = await state.wallet(10_000); const session = await state.chat.start(wallet.token, { requestId: requestId() });
  state.setNow(session.expiresAt + 1);
  await Promise.all([state.chat.sweep(), ...Array.from({ length: 8 }, () => state.chat.settleExpired(session.id))]);
  assert.equal((await state.donations.wallet(wallet.token)).balance, 10);
  assert.equal((await state.chat.get(wallet.token, session.id)).refunded, true);
  assert.equal((await state.donations.wallet(wallet.token)).history.filter(item => item.type === 'chat_refund').length, 1);
});

test('an admin reply prevents refund and both sides are locked after expiry', async () => {
  const state = setup(); await state.ready();
  const wallet = await state.wallet(10_000); const session = await state.chat.start(wallet.token, { requestId: requestId() });
  await state.chat.sendAdminMessage(session.id, { requestId: requestId(), text: 'Mình đang xem nhé.' }, []);
  state.setNow(session.expiresAt + 1);
  await state.chat.settleExpired(session.id);
  assert.equal((await state.donations.wallet(wallet.token)).balance, 0);
  assert.equal((await state.chat.get(wallet.token, session.id)).refunded, false);
  await assert.rejects(state.chat.sendUserMessage(wallet.token, session.id, { requestId: requestId(), text: 'muộn' }, []), { status: 409 });
  await assert.rejects(state.chat.sendAdminMessage(session.id, { requestId: requestId(), text: 'muộn' }, []), { status: 409 });
});

test('purging after seven days deletes message documents and image bytes', async () => {
  const state = setup(); await state.ready();
  const wallet = await state.wallet(10_000); const session = await state.chat.start(wallet.token, { requestId: requestId() });
  const png = await sharp({ create: { width: 3, height: 3, channels: 3, background: '#123456' } }).png().toBuffer();
  const message = await state.chat.sendUserMessage(wallet.token, session.id, { requestId: requestId(), text: '' }, [{ buffer: png, originalname: 'x.png' }]);
  assert.equal([...state.db.rows.keys()].filter(key => key.startsWith('chat_images/')).length, 1);
  state.setNow(session.expiresAt + RETENTION_MS + 1);
  await state.chat.sweep();
  assert.equal([...state.db.rows.keys()].filter(key => key.startsWith('chat_images/')).length, 0);
  assert.equal(state.db.rows.has(`chat_messages/${message.id}`), false);
  await assert.rejects(state.chat.get(wallet.token, session.id), { status: 410 });
});

test('HTTP chat and admin APIs enforce wallet ownership, login and CSRF', async t => {
  const state = setup(); await state.ready();
  const owner = await state.wallet(20_000); const stranger = await state.wallet(10_000);
  const app = express();
  app.use(expressSession({ secret: 'chat-http-test-session-secret', resave: false, saveUninitialized: false }));
  app.use(createChatRouter({ db: state.db, bucket: state.bucket, isAdmin: req => req.session.user === 'admin', authenticateAdmin: value => value === 'correct-password' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await fetch(`${base}/api/chat/config`).then(response => response.json())).ready) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const started = await fetch(`${base}/api/chat/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Wallet-Token': owner.token }, body: JSON.stringify({ requestId: requestId() }) });
  assert.equal(started.status, 201);
  const chatSession = await started.json();
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#456789' } }).png().toBuffer();
  const form = new FormData(); form.append('requestId', requestId()); form.append('text', '<script>alert(1)</script>'); form.append('images', new Blob([png], { type: 'image/png' }), 'ảnh.png');
  const sent = await fetch(`${base}/api/chat/sessions/${chatSession.id}/messages`, { method: 'POST', headers: { 'X-Wallet-Token': owner.token }, body: form });
  assert.equal(sent.status, 201);
  const message = await sent.json();
  const deniedMessages = await fetch(`${base}/api/chat/sessions/${chatSession.id}/messages`, { headers: { 'X-Wallet-Token': stranger.token } });
  assert.equal(deniedMessages.status, 404);
  const deniedImage = await fetch(`${base}/api/chat/sessions/${chatSession.id}/images/${message.id}/0`);
  assert.equal(deniedImage.status, 401);

  const anonymousAdmin = await fetch(`${base}/ai/admin`, { redirect: 'manual' });
  assert.equal(anonymousAdmin.status, 302);
  const login = await fetch(`${base}/ai/admin/login`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=correct-password' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const bootstrap = await fetch(`${base}/api/chat/admin/bootstrap`, { headers: { Cookie: cookie } });
  assert.equal(bootstrap.status, 200);
  const adminData = await bootstrap.json();
  const missingCsrf = await fetch(`${base}/api/chat/admin/sessions/${chatSession.id}/messages`, { method: 'POST', headers: { Cookie: cookie }, body: new FormData() });
  assert.equal(missingCsrf.status, 403);
  const reply = new FormData(); reply.append('requestId', requestId()); reply.append('text', 'Mình đã nhận được ảnh.');
  const replied = await fetch(`${base}/api/chat/admin/sessions/${chatSession.id}/messages`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': adminData.csrf }, body: reply });
  assert.equal(replied.status, 201);
  const adminImage = await fetch(`${base}/api/chat/sessions/${chatSession.id}/images/${message.id}/0`, { headers: { Cookie: cookie } });
  assert.equal(adminImage.status, 200);
  assert.equal(adminImage.headers.get('content-type'), 'image/webp');
});
