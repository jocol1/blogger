const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createGraduationService, createMailer, WishError, MESSAGE_MAX, NAME_MAX } = require('../features/graduation/service');
const { createGraduationRouter } = require('../features/graduation/routes');

const fakeMailer = ({ fail = false } = {}) => {
  const sent = [];
  return { configured: true, to: 'owner@example.com', sent, async send(mail) { if (fail) throw new Error('smtp down'); sent.push(mail); } };
};
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'grad-')), 'wishes.json');
const quiet = async fn => { const original = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = original; } };

test('a wish is trimmed, saved and mailed to the owner', async () => {
  const mailer = fakeMailer();
  const service = createGraduationService({ db: new MemoryFirestore(), mailer, adminUrl: 'https://x.test/totnghiep/admin' });
  const { wish, delivery } = await service.submit({ name: '  Minh   Anh \n', message: ' Chúc Đan thật vui!\u0000 ' });
  assert.equal(wish.name, 'Minh Anh');
  assert.equal(wish.message, 'Chúc Đan thật vui!');
  assert.equal(await delivery, 'sent');
  assert.equal(mailer.sent.length, 1);
  assert.match(mailer.sent[0].subject, /Minh Anh/);
  assert.match(mailer.sent[0].text, /Chúc Đan thật vui!/);
  assert.match(mailer.sent[0].text, /https:\/\/x\.test\/totnghiep\/admin/);
  const [saved] = await service.list();
  assert.equal(saved.mail, 'sent');
});

test('empty names and messages are refused and long ones are cut', async () => {
  const service = createGraduationService({ db: new MemoryFirestore(), mailer: fakeMailer() });
  await assert.rejects(service.submit({ name: '   ', message: 'hi' }), WishError);
  await assert.rejects(service.submit({ name: 'A', message: '  ' }), WishError);
  await assert.rejects(service.submit({}), WishError);
  const { wish, delivery } = await service.submit({ name: 'N'.repeat(300), message: 'M'.repeat(5000) });
  await delivery;
  assert.equal(wish.name.length, NAME_MAX);
  assert.equal(wish.message.length, MESSAGE_MAX);
});

test('mail markup escapes what visitors type', async () => {
  const mailer = fakeMailer();
  const service = createGraduationService({ db: new MemoryFirestore(), mailer });
  const { delivery } = await service.submit({ name: '<b>Hacker</b>', message: '<img src=x onerror=alert(1)>' });
  await delivery;
  assert.ok(!mailer.sent[0].html.includes('<img'));
  assert.ok(!mailer.sent[0].html.includes('<b>Hacker'));
  assert.ok(mailer.sent[0].html.includes('&lt;img'));
});

test('a failing mail server never loses the wish and can be retried', async () => {
  const service = createGraduationService({ db: new MemoryFirestore(), mailer: fakeMailer({ fail: true }) });
  const { wish, delivery } = await quiet(async () => { const result = await service.submit({ name: 'Lan', message: 'Chúc mừng' }); await result.delivery; return result; });
  assert.equal(await delivery, 'failed');
  assert.equal((await service.list())[0].mail, 'failed');
  assert.equal((await service.list())[0].id, wish.id);
});

test('without SMTP settings wishes are kept and marked as not mailed', async () => {
  const mailer = createMailer({});
  assert.equal(mailer.configured, false);
  assert.equal(mailer.to, 'lytanloc10c1@gmail.com');
  const service = createGraduationService({ db: new MemoryFirestore(), mailer });
  const { delivery } = await service.submit({ name: 'Lan', message: 'Chúc mừng' });
  assert.equal(await delivery, 'not-configured');
  assert.equal((await service.list()).length, 1);
});

test('the mail target defaults to the owner and can be overridden', () => {
  assert.equal(createMailer({ SMTP_USER: 'a@b.c', SMTP_PASS: 'x' }).to, 'lytanloc10c1@gmail.com');
  assert.equal(createMailer({ SMTP_USER: 'a@b.c', SMTP_PASS: 'x', GRADUATION_MAIL_TO: 'z@z.z' }).to, 'z@z.z');
});

test('the JSON file store keeps wishes newest first and survives a restart', async () => {
  const file = tmpFile();
  let at = 1_800_000_000_000;
  const make = () => createGraduationService({ file, mailer: fakeMailer(), now: () => at++ });
  const first = make();
  await (await first.submit({ name: 'Một', message: 'a' })).delivery;
  await (await first.submit({ name: 'Hai', message: 'b' })).delivery;
  const second = make();
  assert.deepEqual((await second.list()).map(w => w.name), ['Hai', 'Một']);
  await second.remove((await second.list())[0].id);
  assert.deepEqual((await make().list()).map(w => w.name), ['Một']);
  assert.equal((fs.statSync(file).mode & 0o077) === 0 || process.platform === 'win32', true);
});

async function start(options = {}) {
  const mailer = options.mailer || fakeMailer();
  const app = express();
  app.set('trust proxy', 1);
  app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
  const router = createGraduationRouter({
    db: new MemoryFirestore(), mailer,
    isAdmin: req => req.session.user === 'admin',
    authenticateAdmin: password => password === 'open-sesame',
  });
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
  const post = (url, body) => call(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': options.ip || '10.0.0.1' }, body: JSON.stringify(body) });
  const form = (url, fields) => call(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
  const login = async () => { const res = await form('/totnghiep/admin/login', { password: 'open-sesame' }); assert.equal(res.headers.get('location'), '/totnghiep/admin'); };
  return { base, call, post, form, login, mailer, service: router.graduationService, close: () => server.close() };
}

test('visitors can send a wish and the owner is mailed', async () => {
  const t = await start();
  try {
    const res = await t.post('/api/totnghiep/wishes', { name: 'Lan', message: 'Chúc mừng Đan!' });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { ok: true });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(t.mailer.sent.length, 1);
    assert.equal((await t.service.list()).length, 1);
  } finally { t.close(); }
});

test('bad wishes get a clear 400 and a filled honeypot stores nothing', async () => {
  const t = await start();
  try {
    const blank = await t.post('/api/totnghiep/wishes', { name: '', message: 'x' });
    assert.equal(blank.status, 400);
    assert.match((await blank.json()).error, /tên/);
    const bot = await t.post('/api/totnghiep/wishes', { name: 'Bot', message: 'spam', website: 'http://spam' });
    assert.equal(bot.status, 201);
    const broken = await t.call('/api/totnghiep/wishes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' });
    assert.equal(broken.status, 400);
    assert.equal((await t.service.list()).length, 0);
    assert.equal(t.mailer.sent.length, 0);
  } finally { t.close(); }
});

test('one address can only send five wishes in ten minutes', async () => {
  const t = await start({ ip: '10.9.9.9' });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await t.post('/api/totnghiep/wishes', { name: `A${i}`, message: 'hi' })).status, 201);
    const blocked = await t.post('/api/totnghiep/wishes', { name: 'A6', message: 'hi' });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get('retry-after'));
    assert.equal((await t.service.list()).length, 5);
  } finally { t.close(); }
});

test('the admin page needs the password and shows wishes safely', async () => {
  const t = await start();
  try {
    await (await t.service.submit({ name: '<script>alert(1)</script>', message: 'Chúc <b>mừng</b> & vui' })).delivery;
    const anon = await t.call('/totnghiep/admin');
    assert.equal(anon.status, 302);
    assert.equal(anon.headers.get('location'), '/totnghiep/admin/login');
    assert.equal((await t.call('/totnghiep/admin/wishes.csv')).status, 302);
    const wrong = await t.form('/totnghiep/admin/login', { password: 'nope' });
    assert.equal(wrong.headers.get('location'), '/totnghiep/admin/login?error=1');
    await t.login();
    const html = await (await t.call('/totnghiep/admin')).text();
    assert.ok(!html.includes('<script>alert(1)'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('Chúc &lt;b&gt;mừng&lt;/b&gt; &amp; vui'));
    assert.ok(html.includes('owner@example.com'));
    assert.ok(html.includes('1 lời chúc'));
  } finally { t.close(); }
});

test('deleting a wish needs the admin session and its CSRF token', async () => {
  const t = await start();
  try {
    const { wish, delivery } = await t.service.submit({ name: 'Lan', message: 'Chúc mừng' });
    await delivery;
    const path = `/totnghiep/admin/wishes/${wish.id}/delete`;
    assert.equal((await t.form(path, {})).status, 302);
    assert.equal((await t.service.list()).length, 1);
    await t.login();
    assert.equal((await t.form(path, { csrf: 'wrong' })).status, 403);
    assert.equal((await t.service.list()).length, 1);
    const csrf = (await (await t.call('/totnghiep/admin')).text()).match(/name="csrf" value="([0-9a-f]+)"/)[1];
    assert.equal((await t.form(path, { csrf })).headers.get('location'), '/totnghiep/admin');
    assert.equal((await t.service.list()).length, 0);
  } finally { t.close(); }
});

test('a failed mail can be sent again from the admin page', async () => {
  const flaky = { configured: true, to: 'owner@example.com', sent: [], failNext: true, async send(mail) { if (this.failNext) { this.failNext = false; throw new Error('boom'); } this.sent.push(mail); } };
  const t = await start({ mailer: flaky });
  try {
    const { wish, delivery } = await quiet(async () => { const r = await t.service.submit({ name: 'Lan', message: 'Chúc mừng' }); await r.delivery; return r; });
    assert.equal(await delivery, 'failed');
    await t.login();
    const csrf = (await (await t.call('/totnghiep/admin')).text()).match(/name="csrf" value="([0-9a-f]+)"/)[1];
    await t.form(`/totnghiep/admin/wishes/${wish.id}/resend`, { csrf });
    assert.equal((await t.service.list())[0].mail, 'sent');
    assert.equal(flaky.sent.length, 1);
  } finally { t.close(); }
});

test('the CSV export defuses spreadsheet formulas', async () => {
  const t = await start();
  try {
    await (await t.service.submit({ name: 'Lan', message: '=HYPERLINK("http://evil","click")' })).delivery;
    await t.login();
    const res = await t.call('/totnghiep/admin/wishes.csv');
    assert.match(res.headers.get('content-type'), /text\/csv/);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'Excel needs the UTF-8 byte order mark to read Vietnamese');
    const csv = bytes.toString('utf8');
    assert.ok(csv.includes('Thời gian,Tên,Lời chúc,Mail'));
    assert.ok(csv.includes('"\'=HYPERLINK(""http://evil"",""click"")"'));
  } finally { t.close(); }
});

test('the invitation page is served at /totnghiep and the old path redirects with its query', async () => {
  const t = await start();
  try {
    const page = await t.call('/totnghiep');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /\/assets\/totnghiep\/style\.css\?v=[0-9a-f]{10}"/);
    assert.match(html, /id="wish"/);
    assert.ok(!html.includes('id="khach"'));
    assert.equal((await t.call('/assets/totnghiep/app.js')).status, 200);
    const old = await t.call('/chucmungsinhnhat?ten=Lan');
    assert.equal(old.status, 302);
    assert.equal(old.headers.get('location'), '/totnghiep?ten=Lan');
  } finally { t.close(); }
});
