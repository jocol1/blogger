const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const sharp = require('sharp');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { normalizeCard, PALETTES, contrast, textOn, CardError } = require('../features/cards/validate');
const { createCardService, CARD_PRICE, HARDSHIP_PRICE, DRAFT_TTL_MS } = require('../features/cards/service');
const { createCardsRouter } = require('../features/cards/routes');

const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cards-'));
const reqId = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fakeMailer = () => { const sent = []; return { configured: true, to: 'owner@example.com', sent, async send(mail) { sent.push(mail); } }; };
const input = (over = {}) => ({
  content: { nickname: 'Minh Anh', fullName: 'Trần Minh Anh', school: 'Trường A', date: '2026-12-08', start: '11:30', end: '13:00', venue: { name: 'Hội trường', address: 'Số 1', mapUrl: 'https://maps.app.goo.gl/abc' }, contacts: [{ name: 'Anh', phone: '0368 068 544' }, { name: '', phone: '' }], ...(over.content || {}) },
  look: { palette: 'green', font: 'cute', portrait: { type: 'icon', icon: 'star' }, ...(over.look || {}) },
});
async function fundWallet(db, balance) {
  const token = crypto.randomBytes(32).toString('hex');
  const walletId = crypto.randomUUID();
  await db.collection('game_wallet_tokens').doc(hash(token)).set({ walletId });
  await db.collection('game_wallets').doc(walletId).set({ balance, remainder: 0, history: [] });
  return { token, walletId, read: async () => (await db.collection('game_wallets').doc(walletId).get()).data() };
}
const pngBuffer = (w = 1600, h = 1200) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 46, g: 158, b: 110 } } }).png().toBuffer();

/* ---------- validation ---------- */
test('every ready-made palette keeps text readable', () => {
  for (const [name, p] of Object.entries(PALETTES)) {
    assert.ok(contrast(p.ink, p.card) >= 7, `${name}: text on card`);
    assert.ok(contrast(p.ink, p.bg) >= 4.5, `${name}: text on page`);
    assert.ok(contrast(textOn(p.accent), p.accent) >= 4.5, `${name}: button text`);
  }
});

test('card input is cleaned and gets safe defaults', () => {
  const { content, look } = normalizeCard(input({ look: { font: 'comic-sans', portrait: { type: 'icon', icon: 'skull' }, modules: { music: false } } }));
  assert.equal(content.headline, 'Lễ tốt nghiệp');
  assert.equal(content.contacts.length, 1);
  assert.equal(look.font, 'cute');
  assert.equal(look.portrait.icon, 'cap');
  assert.equal(look.modules.music, false);
  assert.equal(look.modules.wishes, true);
  assert.deepEqual(look.colors, PALETTES.green);
  const custom = normalizeCard(input({ look: { palette: 'custom', colors: { bg: '#FFFFFF', card: '#ffffff', accent: '#123456', ink: '#000000' } } })).look;
  assert.equal(custom.palette, 'custom');
  assert.equal(custom.colors.bg, '#ffffff');
});

test('bad card input is refused with a clear message', () => {
  const bad = [
    [{ content: { nickname: '  ' } }, /tên/],
    [{ content: { date: '2026-02-30' } }, /Ngày/],
    [{ content: { date: '1999-01-01' } }, /Ngày/],
    [{ content: { start: '25:00' } }, /Giờ/],
    [{ content: { start: '13:00', end: '12:00' } }, /kết thúc/],
    [{ content: { venue: { mapUrl: 'javascript:alert(1)' } } }, /https/],
    [{ content: { venue: { mapUrl: 'http://maps.example.com' } } }, /https/],
    [{ content: { venue: { mapUrl: 'https://user:pw@evil.com' } } }, /https/],
    [{ content: { contacts: [{ name: 'A', phone: 'gọi tôi' }] } }, /điện thoại/],
    [{ look: { palette: 'custom', colors: { bg: 'red', card: '#fff', accent: '#000', ink: '#000' } } }, /Màu/],
  ];
  for (const [over, message] of bad) assert.throws(() => normalizeCard(input(over)), err => err instanceof CardError && message.test(err.message));
});

/* ---------- service ---------- */
test('a new card is a private draft that only its owner can open and edit', async () => {
  const service = createCardService({ db: new MemoryFirestore(), mailer: fakeMailer() });
  const { card, ownerToken } = await service.create(input());
  assert.match(card.code, /^[A-Z2-9]{8}$/);
  assert.equal(card.status, 'draft');
  await assert.rejects(service.getPublic(card.code), err => err.status === 409);
  await assert.rejects(service.getForOwner(card.code, 'f'.repeat(64)), err => err.status === 403);
  await assert.rejects(service.getForOwner(card.code, 'nope'), err => err.status === 403);
  const updated = await service.update(card.code, ownerToken, input({ content: { nickname: 'Thảo Đan' } }));
  assert.equal(updated.content.nickname, 'Thảo Đan');
  assert.equal((await service.getForOwner(card.code.toLowerCase(), ownerToken)).content.nickname, 'Thảo Đan');
});

test('publishing charges 29 xu exactly once and opens the card to everyone', async () => {
  const db = new MemoryFirestore();
  const mailer = fakeMailer();
  const service = createCardService({ db, mailer, publicUrl: 'https://x.test' });
  const { card, ownerToken } = await service.create(input());
  const poor = await fundWallet(db, CARD_PRICE - 1);
  await assert.rejects(service.publish(card.code, ownerToken, poor.token, { requestId: reqId(1) }), err => err.status === 409);
  assert.equal((await poor.read()).balance, CARD_PRICE - 1);

  const rich = await fundWallet(db, 40);
  await assert.rejects(service.publish(card.code, 'f'.repeat(64), rich.token, { requestId: reqId(2) }), err => err.status === 403);
  await assert.rejects(service.publish(card.code, ownerToken, rich.token, { requestId: 'x' }), err => err.status === 400);
  const published = await service.publish(card.code, ownerToken, rich.token, { requestId: reqId(3) });
  assert.equal(published.status, 'published');
  assert.equal(published.paid, true);
  await service.publish(card.code, ownerToken, rich.token, { requestId: reqId(3) });
  await service.publish(card.code, ownerToken, rich.token, { requestId: reqId(4) });
  const wallet = await rich.read();
  assert.equal(wallet.balance, 40 - CARD_PRICE);
  assert.equal(wallet.history.length, 1);
  assert.equal(wallet.history[0].type, 'card_cost');
  assert.equal(wallet.history[0].amount, -CARD_PRICE);
  assert.equal((await service.getPublic(card.code)).status, 'published');
});

test('publishing needs Firestore, so a laptop without it says so', async () => {
  const service = createCardService({ dir: tmpDir(), mailer: fakeMailer() });
  const { card, ownerToken } = await service.create(input());
  await assert.rejects(service.publish(card.code, ownerToken, 'a'.repeat(64), { requestId: reqId(1) }), err => err.status === 503);
});

test('wishes stay with their own card and only reach published cards that accept them', async () => {
  const db = new MemoryFirestore();
  const mailer = fakeMailer();
  const service = createCardService({ db, mailer, publicUrl: 'https://x.test' });
  const a = await service.create(input());
  const b = await service.create(input({ content: { nickname: 'Bảo' } }));
  const quiet = await service.create(input({ look: { modules: { wishes: false } } }));
  await assert.rejects(service.submitWish(a.card.code, { name: 'Lan', message: 'Chúc mừng', attending: 'yes' }), err => err.status === 409);
  for (const c of [a, b, quiet]) await service.adminComp(c.card.code);
  await service.setEmail(a.card.code, a.ownerToken, 'Owner@Example.com');
  const sent = await service.submitWish(a.card.code, { name: 'Lan', message: 'Chúc mừng', attending: 'yes' });
  assert.equal(await sent.delivery, 'sent');
  assert.equal(mailer.sent.at(-1).to, 'owner@example.com');
  assert.match(mailer.sent.at(-1).subject, /Lan/);
  await (await service.submitWish(b.card.code, { name: 'Hùng', message: 'Hay quá', attending: 'no' })).delivery;
  await assert.rejects(service.submitWish(quiet.card.code, { name: 'X', message: 'Y', attending: 'yes' }), err => err.status === 409);
  await assert.rejects(service.submitWish(a.card.code, { name: 'X', message: 'Y', attending: 'perhaps' }), err => err.status === 400);
  assert.deepEqual((await service.listWishes(a.card.code, a.ownerToken)).map(w => w.name), ['Lan']);
  assert.deepEqual((await service.listWishes(b.card.code, b.ownerToken)).map(w => w.name), ['Hùng']);
  await assert.rejects(service.listWishes(a.card.code, b.ownerToken), err => err.status === 403);
  const [wish] = await service.listWishes(a.card.code, a.ownerToken);
  await service.removeWish(a.card.code, a.ownerToken, wish.id);
  assert.equal((await service.listWishes(a.card.code, a.ownerToken)).length, 0);
});

test('owner email is not mailed before the card is paid, to keep it from being used for spam', async () => {
  const mailer = fakeMailer();
  const service = createCardService({ db: new MemoryFirestore(), mailer });
  const { card, ownerToken } = await service.create(input());
  assert.equal((await service.setEmail(card.code, ownerToken, 'a@b.vn')).mailed, 'skipped');
  assert.equal(mailer.sent.length, 0);
  await assert.rejects(service.setEmail(card.code, ownerToken, 'not-an-email'), err => err.status === 400);
});

test('photos are re-encoded to small WebP files and only real images are accepted', async () => {
  const service = createCardService({ db: new MemoryFirestore(), mailer: fakeMailer() });
  const { card, ownerToken } = await service.create(input());
  const image = await service.uploadImage(card.code, ownerToken, { buffer: await pngBuffer() });
  assert.ok(image.bytes <= 300 * 1024);
  const stored = await service.getImage(image.id);
  assert.equal(stored.mime, 'image/webp');
  assert.equal((await sharp(stored.data).metadata()).format, 'webp');
  assert.ok((await sharp(stored.data).metadata()).width <= 1200);
  await assert.rejects(service.uploadImage(card.code, ownerToken, { buffer: Buffer.from('<svg onload=alert(1)>') }), err => err.status === 400);
  await assert.rejects(service.uploadImage(card.code, 'f'.repeat(64), { buffer: await pngBuffer(10, 10) }), err => err.status === 403);

  const withPhoto = await service.update(card.code, ownerToken, input({ look: { portrait: { type: 'photo', photoId: image.id } }, content: { venue: { name: 'X', photoId: image.id } } }));
  assert.equal(withPhoto.look.portrait.photoId, image.id);
  const other = await service.create(input());
  const stolen = await service.update(other.card.code, other.ownerToken, input({ look: { portrait: { type: 'photo', photoId: image.id } } }));
  assert.equal(stolen.look.portrait.type, 'icon');

  await service.adminSetStatus(card.code, 'disabled');
  assert.equal(await service.getImage(image.id), null);
});

test('unpaid drafts and their photos are swept after two weeks, published cards stay', async () => {
  let at = 1_800_000_000_000;
  const service = createCardService({ db: new MemoryFirestore(), mailer: fakeMailer(), now: () => at });
  const draft = await service.create(input());
  const image = await service.uploadImage(draft.card.code, draft.ownerToken, { buffer: await pngBuffer(400, 300) });
  const kept = await service.create(input());
  await service.adminComp(kept.card.code);
  at += DRAFT_TTL_MS - 1000;
  assert.equal(await service.sweep(), 0);
  at += 2000;
  await service.sweep();
  await assert.rejects(service.getForOwner(draft.card.code, draft.ownerToken), err => err.status === 404);
  assert.equal(await service.getImage(image.id), null);
  assert.equal((await service.getPublic(kept.card.code)).status, 'published');
});

test('a card costs 29 xu, or 19 xu once the owner explains a hard situation', async () => {
  assert.equal(CARD_PRICE, 29);
  assert.equal(HARDSHIP_PRICE, 19);
  const db = new MemoryFirestore();
  const service = createCardService({ db, mailer: fakeMailer() });
  const { card, ownerToken } = await service.create(input());
  assert.equal(card.price, 29);
  assert.equal(card.hardship, null);
  await assert.rejects(service.requestHardship(card.code, ownerToken, 'nghèo'), err => err.status === 400 && /ít nhất/.test(err.message));
  await assert.rejects(service.requestHardship(card.code, 'f'.repeat(64), 'Mình là sinh viên tự túc, vừa học vừa làm.'), err => err.status === 403);
  const reduced = await service.requestHardship(card.code, ownerToken, '  Mình là sinh viên tự túc, vừa học vừa làm thêm.  ');
  assert.equal(reduced.price, 19);
  assert.equal(reduced.hardship.reason, 'Mình là sinh viên tự túc, vừa học vừa làm thêm.');
  assert.equal((await service.getForOwner(card.code, ownerToken)).price, 19);

  const wallet = await fundWallet(db, HARDSHIP_PRICE);
  const published = await service.publish(card.code, ownerToken, wallet.token, { requestId: reqId(21) });
  assert.equal(published.status, 'published');
  assert.equal((await wallet.read()).balance, 0);
  assert.equal((await wallet.read()).history.at(-1).amount, -HARDSHIP_PRICE);
  const stored = (await service.adminList()).find(c => c.code === card.code);
  assert.equal(stored.purchase.xu, HARDSHIP_PRICE);
  assert.equal(stored.purchase.hardship, true);
  await assert.rejects(service.requestHardship(card.code, ownerToken, 'Mình là sinh viên tự túc, vừa học vừa làm thêm.'), err => err.status === 409);

  const full = await service.create(input());
  const short = await fundWallet(db, HARDSHIP_PRICE);
  await assert.rejects(service.publish(full.card.code, full.ownerToken, short.token, { requestId: reqId(22) }), err => err.status === 409 && /29 xu/.test(err.message));
});

test('the owner links a bank transfer to the card, and the admin can confirm it by hand', async () => {
  const db = new MemoryFirestore();
  const service = createCardService({ db, mailer: fakeMailer() });
  const { card, ownerToken } = await service.create(input());
  const wallet = await fundWallet(db, 0);
  const stranger = await fundWallet(db, 0);
  await db.collection('donation_requests').doc('DH1234567').set({ walletId: wallet.walletId, amount: 29000, status: 'pending', paidAmount: 0 });
  await assert.rejects(service.recordTransfer(card.code, ownerToken, wallet.token, { code: 'nope' }), err => err.status === 400);
  await assert.rejects(service.recordTransfer(card.code, ownerToken, wallet.token, { code: 'DH7654321' }), err => err.status === 404);
  await assert.rejects(service.recordTransfer(card.code, ownerToken, stranger.token, { code: 'DH1234567' }), err => err.status === 403);
  await assert.rejects(service.recordTransfer(card.code, 'f'.repeat(64), wallet.token, { code: 'DH1234567' }), err => err.status === 403);

  const started = await service.recordTransfer(card.code, ownerToken, wallet.token, { code: 'dh1234567', amount: 1 });
  assert.deepEqual(started.transfer, { code: 'DH1234567', amount: 29000, claimedMs: null });
  const claimed = await service.recordTransfer(card.code, ownerToken, wallet.token, { code: 'DH1234567', claimed: true });
  assert.ok(claimed.transfer.claimedMs);

  let [row] = await service.adminList();
  assert.deepEqual(row.transferState, { status: 'pending', paidAmount: 0 });
  await db.collection('donation_requests').doc('DH1234567').set({ status: 'paid', paidAmount: 29000 }, { merge: true });
  [row] = await service.adminList();
  assert.equal(row.transferState.status, 'paid');

  await service.adminConfirm(card.code);
  const published = await service.getForOwner(card.code, ownerToken);
  assert.equal(published.status, 'published');
  [row] = await service.adminList();
  assert.deepEqual({ kind: row.purchase.kind, xu: row.purchase.xu, transferCode: row.purchase.transferCode }, { kind: 'manual', xu: CARD_PRICE, transferCode: 'DH1234567' });
  assert.equal((await wallet.read()).balance, 0, 'confirming by hand never touches the wallet');

  const poorer = await service.create(input());
  await service.requestHardship(poorer.card.code, poorer.ownerToken, 'Mình là sinh viên tự túc, vừa học vừa làm thêm.');
  await service.adminConfirm(poorer.card.code);
  assert.equal((await service.adminList()).find(c => c.code === poorer.card.code).purchase.xu, HARDSHIP_PRICE);
});

test('admin can refund a paid card once, which also takes it down', async () => {
  const db = new MemoryFirestore();
  const service = createCardService({ db, mailer: fakeMailer() });
  const { card, ownerToken } = await service.create(input());
  const wallet = await fundWallet(db, CARD_PRICE);
  await service.publish(card.code, ownerToken, wallet.token, { requestId: reqId(9) });
  await service.adminRefund(card.code);
  assert.equal((await wallet.read()).balance, CARD_PRICE);
  assert.equal((await wallet.read()).history.at(-1).type, 'card_refund');
  await assert.rejects(service.adminRefund(card.code), err => err.status === 409);
  assert.equal((await wallet.read()).balance, CARD_PRICE);
  await assert.rejects(service.getPublic(card.code), err => err.status === 404);
});

/* ---------- HTTP ---------- */
async function start() {
  const db = new MemoryFirestore();
  const app = express();
  app.set('trust proxy', 1);
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  const router = createCardsRouter({ db, mailer: fakeMailer(), maintenance: false, isAdmin: req => req.session.user === 'admin', authenticateAdmin: pw => pw === 'open-sesame' });
  app.use(router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (url, init = {}) => {
    const res = await fetch(base + url, { redirect: 'manual', ...init, headers: { ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
    const set = res.headers.getSetCookie?.() || [];
    if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
    return res;
  };
  const json = (url, method, body, headers = {}) => call(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const form = (url, fields) => call(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
  return { db, call, json, form, service: router.cardService, close: () => server.close() };
}

test('the builder page is served with a strict content security policy', async () => {
  const t = await start();
  try {
    const res = await t.call('/taothiep');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    const html = await res.text();
    assert.match(html, /\/assets\/thiep\/builder\.js\?v=[0-9a-f]{10}"/);
    assert.ok(!/style="/.test(html), 'inline styles would be blocked by the policy');
    assert.equal((await t.call('/assets/thiep/card.js')).status, 200);
    assert.equal((await t.json('/api/thiep/config', 'GET')).status, 200);
  } finally { t.close(); }
});

test('create, open, edit and preview a card over HTTP', async () => {
  const t = await start();
  try {
    const created = await t.json('/api/thiep/cards', 'POST', input());
    assert.equal(created.status, 201);
    const { card, ownerToken, manage } = await created.json();
    assert.equal(manage, `/thiep/${card.code}/quanly#k=${ownerToken}`);
    assert.equal((await t.call(`/api/thiep/cards/${card.code}`)).status, 403);
    assert.equal((await t.call(`/api/thiep/cards/${card.code}`, { headers: { 'X-Card-Token': ownerToken } })).status, 200);
    const draftPage = await t.call(`/thiep/${card.code}`);
    assert.equal(draftPage.status, 200);
    assert.match(await draftPage.text(), /chưa được xuất bản/);
    const edited = await t.json(`/api/thiep/cards/${card.code}`, 'PUT', input({ content: { nickname: 'Lan' } }), { 'X-Card-Token': ownerToken });
    assert.equal((await edited.json()).card.content.nickname, 'Lan');
    const bad = await t.json(`/api/thiep/cards/${card.code}`, 'PUT', input({ content: { venue: { mapUrl: 'javascript:alert(1)' } } }), { 'X-Card-Token': ownerToken });
    assert.equal(bad.status, 400);
    assert.equal((await t.call('/thiep/xem-truoc')).status, 200);
    assert.equal((await t.call(`/thiep/${card.code}/quanly`)).status, 200);
    assert.equal((await t.call('/thiep/ZZZZZZZZ')).status, 404);
  } finally { t.close(); }
});

test('a published card page cannot be broken out of by what the owner typed', async () => {
  const t = await start();
  try {
    const evil = '</script><script>alert(1)</script>"><img src=x onerror=alert(2)>';
    const { card } = await t.service.create(input({ content: { nickname: evil.slice(0, 24), fullName: evil, invite: evil } }));
    await t.service.adminComp(card.code);
    const res = await t.call(`/thiep/${card.code}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(!html.includes('</script><script>alert(1)'), 'raw script break-out reached the page');
    assert.ok(!html.includes('<img src=x'), 'raw markup reached the page');
    const data = JSON.parse(html.match(/<script type="application\/json" id="card-data">([\s\S]*?)<\/script>/)[1]);
    assert.equal(data.card.content.fullName, evil.slice(0, 60));
    assert.match(html, /<meta property="og:title" content="Lễ tốt nghiệp · &lt;\/script&gt;/);
    assert.ok(!html.includes('ownerHash'));
  } finally { t.close(); }
});

test('a shared card shows edits at once and gives link previews absolute addresses and a JPEG', async () => {
  const t = await start();
  try {
    const { card, ownerToken } = await t.service.create(input({ content: { nickname: 'Trước' } }));
    const image = await t.service.uploadImage(card.code, ownerToken, { buffer: await pngBuffer(800, 600) });
    await t.service.update(card.code, ownerToken, input({ content: { nickname: 'Trước' }, look: { portrait: { type: 'photo', photoId: image.id }, font: 'elegant' } }));
    await t.service.adminComp(card.code);
    const first = await (await t.call(`/thiep/${card.code}`)).text();
    assert.match(first, /<meta property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/thiep\/anh\/[0-9a-f-]{36}\.jpg">/);
    assert.match(first, /<meta property="og:url" content="http:\/\/127\.0\.0\.1:\d+\/thiep\/[A-Z2-9]{8}">/);
    assert.match(first, /<link rel="stylesheet" data-font="elegant" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Playfair/);
    assert.match(first, /<link rel="preload" as="image" href="\/thiep\/anh\/[0-9a-f-]{36}\.webp" fetchpriority="high">/);

    // The page is served from memory now; an edit must still show up on the next view.
    await t.service.update(card.code, ownerToken, input({ content: { nickname: 'Sau' }, look: { portrait: { type: 'photo', photoId: image.id } } }));
    assert.match(await (await t.call(`/thiep/${card.code}`)).text(), /Lễ tốt nghiệp · Sau/);
    await t.service.adminSetStatus(card.code, 'disabled');
    assert.equal((await t.call(`/thiep/${card.code}`)).status, 404);
    assert.equal((await t.call(`/thiep/anh/${image.id}.webp`)).status, 404);
    await t.service.adminSetStatus(card.code, 'enabled');

    const jpg = await t.call(`/thiep/anh/${image.id}.jpg`);
    assert.equal(jpg.status, 200);
    assert.equal(jpg.headers.get('content-type'), 'image/jpeg');
    assert.equal((await sharp(Buffer.from(await jpg.arrayBuffer())).metadata()).format, 'jpeg');
  } finally { t.close(); }
});

test('the album keeps up to six of the card\'s own photos', async () => {
  const service = createCardService({ db: new MemoryFirestore(), mailer: fakeMailer() });
  const { card, ownerToken } = await service.create(input());
  const ids = [];
  for (let i = 0; i < 7; i++) ids.push((await service.uploadImage(card.code, ownerToken, { buffer: await pngBuffer(300, 300) })).id);
  const other = await service.create(input());
  const foreign = (await service.uploadImage(other.card.code, other.ownerToken, { buffer: await pngBuffer(300, 300) })).id;
  const saved = await service.update(card.code, ownerToken, input({ content: { album: [ids[0], ids[0], foreign, 'not-an-id', ...ids.slice(1)] } }));
  assert.deepEqual(saved.content.album, ids.slice(0, 5), 'duplicates, other cards\' photos and junk are dropped, then capped at six');
  assert.equal((await service.getForOwner(card.code, ownerToken)).content.album.length, 5);
});

test('the wish wall shows recent wishes on published cards only, and updates when a wish arrives', async () => {
  const t = await start();
  try {
    const { card, ownerToken } = await t.service.create(input());
    assert.deepEqual(await t.service.publicWall(card.code), []);
    await t.service.adminComp(card.code);
    await (await t.service.submitWish(card.code, { name: 'Lan', message: 'Chúc mừng!', attending: 'no' })).delivery;
    const res = await t.call(`/api/thiep/cards/${card.code}/wall`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /max-age=15/);
    const { wishes } = await res.json();
    assert.deepEqual(wishes.map(w => [w.name, w.message]), [['Lan', 'Chúc mừng!']]);
    assert.equal(wishes[0].attending, undefined, 'whether someone comes stays private to the owner');
    await (await t.service.submitWish(card.code, { name: 'Hùng', message: 'Hay quá', attending: 'yes' })).delivery;
    assert.deepEqual((await t.service.publicWall(card.code)).map(w => w.name), ['Hùng', 'Lan']);
    const [newest] = await t.service.listWishes(card.code, ownerToken);
    await t.service.removeWish(card.code, ownerToken, newest.id);
    assert.deepEqual((await t.service.publicWall(card.code)).map(w => w.name), ['Lan']);
    await t.service.update(card.code, ownerToken, input({ look: { modules: { wall: false } } }));
    assert.deepEqual(await t.service.publicWall(card.code), []);
  } finally { t.close(); }
});

test('a published card offers its QR code as SVG and PNG; drafts do not', async () => {
  const t = await start();
  try {
    const { card } = await t.service.create(input());
    assert.equal((await t.call(`/thiep/${card.code}/qr.svg`)).status, 404);
    await t.service.adminComp(card.code);
    const svg = await t.call(`/thiep/${card.code}/qr.svg`);
    assert.equal(svg.status, 200);
    assert.match(svg.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(await svg.text(), /^<svg/);
    const png = await t.call(`/thiep/${card.code}/qr.png?tai=1`);
    assert.equal(png.headers.get('content-type'), 'image/png');
    assert.match(png.headers.get('content-disposition'), /attachment; filename="thiep-[A-Z2-9]{8}\.png"/);
    assert.equal((await sharp(Buffer.from(await png.arrayBuffer())).metadata()).width, 1024);
    const page = await (await t.call(`/thiep/${card.code}`)).text();
    assert.ok(page.includes('id="envelope"') && page.includes('id="album"') && page.includes('id="wall"'));
  } finally { t.close(); }
});

test('photos upload over HTTP and are served as images with safe headers', async () => {
  const t = await start();
  try {
    const { card, ownerToken } = await t.service.create(input());
    const data = new FormData();
    data.append('image', new Blob([await pngBuffer(900, 700)], { type: 'image/png' }), 'me.png');
    const res = await t.call(`/api/thiep/cards/${card.code}/images`, { method: 'POST', headers: { 'X-Card-Token': ownerToken }, body: data });
    assert.equal(res.status, 201);
    const { url } = await res.json();
    const img = await t.call(url);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/webp');
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await t.call('/thiep/anh/00000000-0000-4000-8000-000000000000.webp')).status, 404);
  } finally { t.close(); }
});

test('guests send wishes to a published card, bots and floods are stopped', async () => {
  const t = await start();
  try {
    const { card, ownerToken } = await t.service.create(input());
    await t.service.adminComp(card.code);
    const ok = await t.json(`/api/thiep/cards/${card.code}/wishes`, 'POST', { name: 'Lan', message: 'Chúc mừng', attending: 'maybe' }, { 'X-Forwarded-For': '10.0.0.7' });
    assert.equal(ok.status, 201);
    await t.json(`/api/thiep/cards/${card.code}/wishes`, 'POST', { name: 'Bot', message: 'spam', attending: 'yes', website: 'x' }, { 'X-Forwarded-For': '10.0.0.7' });
    assert.deepEqual((await t.service.listWishes(card.code, ownerToken)).map(w => w.name), ['Lan']);
    for (let i = 0; i < 3; i++) await t.json(`/api/thiep/cards/${card.code}/wishes`, 'POST', { name: `A${i}`, message: 'hi', attending: 'yes' }, { 'X-Forwarded-For': '10.0.0.7' });
    const blocked = await t.json(`/api/thiep/cards/${card.code}/wishes`, 'POST', { name: 'Z', message: 'hi', attending: 'yes' }, { 'X-Forwarded-For': '10.0.0.7' });
    assert.equal(blocked.status, 429);
    const csv = await t.call(`/api/thiep/cards/${card.code}/wishes.csv`, { headers: { 'X-Card-Token': ownerToken } });
    assert.match(await csv.text(), /Chưa chắc/);
  } finally { t.close(); }
});

test('admin pages need the password and every action needs the CSRF token', async () => {
  const t = await start();
  try {
    const { card, ownerToken } = await t.service.create(input());
    const asked = await t.json(`/api/thiep/cards/${card.code}/hardship`, 'POST', { reason: 'Nhà mình khó khăn <script>alert(1)</script>, mình tự lo học phí.' }, { 'X-Card-Token': ownerToken });
    assert.equal((await asked.json()).card.price, 19);
    assert.equal((await t.json(`/api/thiep/cards/${card.code}/hardship`, 'POST', { reason: 'ngắn' }, { 'X-Card-Token': ownerToken })).status, 400);
    assert.equal((await t.call('/thiep/admin')).headers.get('location'), '/thiep/admin/login');
    assert.equal((await t.form(`/thiep/admin/cards/${card.code}/comp`, {})).status, 302);
    assert.equal((await t.form('/thiep/admin/login', { password: 'open-sesame' })).headers.get('location'), '/thiep/admin');
    const html = await (await t.call('/thiep/admin')).text();
    assert.match(html, new RegExp(card.code));
    assert.ok(html.includes('Hoàn cảnh khó khăn'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>alert(1)'));
    assert.equal((await t.form(`/thiep/admin/cards/${card.code}/comp`, { csrf: 'wrong' })).status, 403);
    const csrf = html.match(/name="csrf" value="([0-9a-f]+)"/)[1];
    assert.equal((await t.form(`/thiep/admin/cards/${card.code}/comp`, { csrf })).headers.get('location'), '/thiep/admin');
    assert.equal((await t.service.getPublic(card.code)).status, 'published');
    await t.form(`/thiep/admin/cards/${card.code}/disable`, { csrf });
    assert.equal((await t.call(`/thiep/${card.code}`)).status, 404);
  } finally { t.close(); }
});

test('the admin page shows who is waiting on a transfer and confirms it with one button', async () => {
  const t = await start();
  try {
    const config = await (await t.json('/api/thiep/config', 'GET')).json();
    assert.equal(config.supportUrl, 'https://www.facebook.com/loc.ly.336717');
    const { card, ownerToken } = await t.service.create(input({ content: { nickname: 'Đang chờ' } }));
    await t.service.create(input({ content: { nickname: 'Đang thiết kế' } }));
    const wallet = await fundWallet(t.db, 0);
    await t.db.collection('donation_requests').doc('DH5550001').set({ walletId: wallet.walletId, amount: 29000, status: 'pending', paidAmount: 0 });
    const linked = await t.json(`/api/thiep/cards/${card.code}/transfer`, 'POST', { code: 'DH5550001', claimed: true }, { 'X-Card-Token': ownerToken, 'X-Wallet-Token': wallet.token });
    assert.equal(linked.status, 200);

    await t.form('/thiep/admin/login', { password: 'open-sesame' });
    const html = await (await t.call('/thiep/admin')).text();
    const waiting = html.slice(html.indexOf('Cần xác nhận'), html.indexOf('Đang tạo thiệp</h2>'));
    assert.ok(waiting.includes('Đang chờ') && waiting.includes('DH5550001') && waiting.includes('Chưa nhận tiền') && waiting.includes('Khách báo đã chuyển'));
    assert.ok(!waiting.includes('Đang thiết kế'));
    assert.ok(html.slice(html.indexOf('Đang tạo thiệp</h2>')).includes('Đang thiết kế'));
    assert.ok(html.includes('/assets/thiep/admin.js'));

    const csrf = html.match(/name="csrf" value="([0-9a-f]+)"/)[1];
    assert.equal((await t.form(`/thiep/admin/cards/${card.code}/confirm`, {})).status, 403);
    assert.equal((await t.form(`/thiep/admin/cards/${card.code}/confirm`, { csrf })).headers.get('location'), '/thiep/admin');
    assert.equal((await t.service.getPublic(card.code)).status, 'published');
  } finally { t.close(); }
});

test('a personal invite shows one guest their name and private note, and only that link does', async () => {
  const t = await start();
  try {
    const { card, ownerToken } = await t.service.create(input());
    const owner = { 'X-Card-Token': ownerToken };
    assert.equal((await t.json(`/api/thiep/cards/${card.code}/invites`, 'POST', { name: 'Cô Hạnh' }, { 'X-Card-Token': 'f'.repeat(64) })).status, 403);
    assert.equal((await t.json(`/api/thiep/cards/${card.code}/invites`, 'POST', { name: '  ' }, owner)).status, 400);
    const res = await t.json(`/api/thiep/cards/${card.code}/invites`, 'POST', { name: 'Cô  Hạnh', message: 'Cô ơi, em mong cô đến lắm ạ! </script><b>x</b>' }, owner);
    assert.equal(res.status, 201);
    const { invite } = await res.json();
    assert.match(invite.id, /^[a-z2-9]{6}$/);
    assert.equal(invite.name, 'Cô Hạnh');
    const other = (await (await t.json(`/api/thiep/cards/${card.code}/invites`, 'POST', { name: 'Lan' }, owner)).json()).invite;
    assert.deepEqual((await t.service.getForOwner(card.code, ownerToken)).invites.map(i => i.name), ['Cô Hạnh', 'Lan']);

    // Drafts stay private even through an invite link.
    assert.equal((await t.call(`/thiep/${card.code}?moi=${invite.id}`)).status, 200);
    assert.doesNotMatch(await (await t.call(`/thiep/${card.code}?moi=${invite.id}`)).text(), /em mong cô/);
    await t.service.adminComp(card.code);

    const page = await (await t.call(`/thiep/${card.code}?moi=${invite.id}`)).text();
    const data = JSON.parse(page.match(/<script type="application\/json" id="card-data">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(data.card.invite, { name: 'Cô Hạnh', message: 'Cô ơi, em mong cô đến lắm ạ! </script><b>x</b>' });
    assert.doesNotMatch(page, /<\/script><b>/);
    assert.equal(data.card.invites, undefined);

    for (const url of [`/thiep/${card.code}`, `/thiep/${card.code}?moi=zzzzzz`, `/thiep/${card.code}?moi=${other.id}`]) {
      assert.doesNotMatch(await (await t.call(url)).text(), /em mong cô/, url);
    }
    const lower = await t.call(`/thiep/${card.code.toLowerCase()}?moi=${invite.id}`);
    assert.equal(lower.headers.get('location'), `/thiep/${card.code}?moi=${invite.id}`);

    const removed = await (await t.call(`/api/thiep/cards/${card.code}/invites/${invite.id}`, { method: 'DELETE', headers: owner })).json();
    assert.deepEqual(removed.invites.map(i => i.name), ['Lan']);
    t.service.forget?.(card.code);
    assert.doesNotMatch(await (await t.call(`/thiep/${card.code}?moi=${invite.id}`)).text(), /em mong cô/);
  } finally { await t.close(); }
});

test('the guest ticket is on by default and the owner can turn it off', async () => {
  const t = await start();
  try {
    const { card, ownerToken } = await t.service.create(input());
    assert.equal(card.look.modules.ticket, true);
    const off = await t.service.update(card.code, ownerToken, input({ look: { modules: { ticket: false } } }));
    assert.equal(off.look.modules.ticket, false);
    await t.service.adminComp(card.code);
    const page = await (await t.call(`/thiep/${card.code}`)).text();
    assert.match(page, /id="ve-moi"/);
    assert.match(page, /id="ticket-save"/);
  } finally { await t.close(); }
});
