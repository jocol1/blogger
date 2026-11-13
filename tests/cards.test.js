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
const { createCardService, CARD_PRICE, DRAFT_TTL_MS } = require('../features/cards/service');
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
    const { card } = await t.service.create(input());
    assert.equal((await t.call('/thiep/admin')).headers.get('location'), '/thiep/admin/login');
    assert.equal((await t.form(`/thiep/admin/cards/${card.code}/comp`, {})).status, 302);
    assert.equal((await t.form('/thiep/admin/login', { password: 'open-sesame' })).headers.get('location'), '/thiep/admin');
    const html = await (await t.call('/thiep/admin')).text();
    assert.match(html, new RegExp(card.code));
    assert.equal((await t.form(`/thiep/admin/cards/${card.code}/comp`, { csrf: 'wrong' })).status, 403);
    const csrf = html.match(/name="csrf" value="([0-9a-f]+)"/)[1];
    assert.equal((await t.form(`/thiep/admin/cards/${card.code}/comp`, { csrf })).headers.get('location'), '/thiep/admin');
    assert.equal((await t.service.getPublic(card.code)).status, 'published');
    await t.form(`/thiep/admin/cards/${card.code}/disable`, { csrf });
    assert.equal((await t.call(`/thiep/${card.code}`)).status, 404);
  } finally { t.close(); }
});
