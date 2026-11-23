const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createCotuongRouter } = require('../features/cotuong/routes');
const { MemoryFirestore } = require('./helpers/memory-firestore');

const engine = { analyse: async () => ({ candidates: [{ uci: 'h2e2', cp: 1 }], depth: 5 }), close() {}, waiting: 2 };
const json = { 'Content-Type': 'application/json' };

/** One shared session object stands in for the browser's admin cookie. */
async function start() {
  const session = {};
  Object.defineProperties(session, {
    regenerate: { value: (cb) => { for (const k of Object.keys(session)) delete session[k]; cb(); } },
    save: { value: (cb) => cb() },
    destroy: { value: (cb) => { for (const k of Object.keys(session)) delete session[k]; cb(); } },
  });
  const app = express();
  app.use((req, res, next) => { req.session = session; next(); });
  const router = createCotuongRouter({
    engine,
    nodes: 1000,
    db: new MemoryFirestore(),
    secret: 'test-secret-at-least-32-characters',
    isAdmin: (req) => req.session?.user === 'admin',
    authenticateAdmin: (password) => password === 'owner-pass',
  });
  app.use(router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (url, init = {}) => fetch(base + url, { redirect: 'manual', ...init });
  const form = (url, fields) =>
    call(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
  const stop = () => { router.close(); server.close(); };
  return { call, form, session, stop };
}

const game = (over = {}) => ({ gameId: crypto.randomUUID(), piece: 'r', stance: 'attack', result: 'loss', plies: 40, reason: 'checkmate', ...over });
const send = (call, body, headers = {}) => call('/api/bot/result', { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify(body) });

test('a finished game against the machine is stored once and counted', async () => {
  const { call, form, stop } = await start();
  try {
    const first = game();
    assert.equal((await send(call, first)).status, 201);
    assert.deepEqual(await (await send(call, first)).json(), { stored: false }, 'a resend does not count twice');
    assert.equal((await send(call, game({ result: 'win', piece: 'c', stance: 'defense' }))).status, 201);
    assert.equal((await send(call, { ...game(), result: 'cheated' })).status, 400);
    assert.equal((await send(call, { ...game(), piece: 'z' })).status, 400);
    assert.equal((await send(call, { ...game(), plies: -1 })).status, 400);

    await form('/co-tuong-admin/login', { password: 'owner-pass' });
    const page = await (await call('/co-tuong-admin')).text();
    assert.match(page, /Ván đã đánh với máy<\/span>/);
    assert.match(page, /<b>2<\/b><span>Ván đã đánh với máy/);
    assert.match(page, /<b>50%<\/b><span>Máy thắng/);
    assert.match(page, /Thiết Xa/);
    assert.match(page, /Khách/);
  } finally {
    stop();
  }
});

test('the admin page needs the owner password and never shows password hashes', async () => {
  const { call, form, stop } = await start();
  try {
    const anon = await call('/co-tuong-admin');
    assert.equal(anon.status, 302);
    assert.match(anon.headers.get('location'), /\/co-tuong-admin\/login$/);
    const wrong = await form('/co-tuong-admin/login', { password: 'nope' });
    assert.match(wrong.headers.get('location'), /error=1/);
    assert.equal((await call('/co-tuong-admin')).status, 302);

    await call('/api/auth/register', { method: 'POST', headers: json, body: JSON.stringify({ username: 'nguoi_choi', password: 'secret-secret' }) });
    assert.equal((await form('/co-tuong-admin/login', { password: 'owner-pass' })).headers.get('location'), '/co-tuong-admin');
    const res = await call('/co-tuong-admin');
    const page = await res.text();
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(page, /nguoi_choi/);
    assert.match(page, /Đang chạy/);
    assert.doesNotMatch(page, /\$2[aby]\$/, 'no bcrypt hash on the page');
    assert.doesNotMatch(page, /secret-secret/);
  } finally {
    stop();
  }
});

test('the owner can suspend, restore and delete accounts, with a CSRF token', async () => {
  const { call, form, session, stop } = await start();
  try {
    const registered = await (await call('/api/auth/register', { method: 'POST', headers: json, body: JSON.stringify({ username: 'ban_me', password: 'secret-secret' }) })).json();
    await form('/co-tuong-admin/login', { password: 'owner-pass' });

    assert.equal((await form('/co-tuong-admin/accounts/ban_me/disable', { csrf: 'forged' })).status, 403);
    assert.equal((await call('/api/me', { headers: { Authorization: `Bearer ${registered.accessToken}` } })).status, 200);

    const csrf = session.csrf;
    assert.equal((await form('/co-tuong-admin/accounts/ban_me/disable', { csrf })).status, 302);
    const login = await call('/api/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ username: 'ban_me', password: 'secret-secret' }) });
    assert.equal(login.status, 403);
    assert.equal((await call('/api/me', { headers: { Authorization: `Bearer ${registered.accessToken}` } })).status, 401, 'an old token stops working');
    assert.equal((await call('/api/auth/refresh', { method: 'POST', headers: json, body: JSON.stringify({ refreshToken: registered.refreshToken }) })).status, 401);
    assert.match(await (await call('/co-tuong-admin')).text(), /Đã khóa/);

    await form('/co-tuong-admin/accounts/ban_me/enable', { csrf });
    assert.equal((await call('/api/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ username: 'ban_me', password: 'secret-secret' }) })).status, 200);

    await form('/co-tuong-admin/accounts/ban_me/delete', { csrf });
    assert.equal((await call('/api/auth/login', { method: 'POST', headers: json, body: JSON.stringify({ username: 'ban_me', password: 'secret-secret' }) })).status, 401);
    assert.doesNotMatch(await (await call('/co-tuong-admin')).text(), /<b>ban_me<\/b>/);
  } finally {
    stop();
  }
});

test('a signed-in player is named on the game, and a flood of results is turned away', async () => {
  const { call, form, stop } = await start();
  try {
    const tokens = await (await call('/api/auth/register', { method: 'POST', headers: json, body: JSON.stringify({ username: 'locly', password: 'secret-secret' }) })).json();
    assert.equal((await send(call, game(), { Authorization: `Bearer ${tokens.accessToken}` })).status, 201);
    await form('/co-tuong-admin/login', { password: 'owner-pass' });
    assert.match(await (await call('/co-tuong-admin')).text(), /<td>locly<\/td>/);
    let limited = 0;
    for (let i = 0; i < 40; i++) if ((await send(call, game())).status === 429) limited++;
    assert.ok(limited >= 9, `expected the 30 per minute cap to bite, got ${limited} rejections`);
  } finally {
    stop();
  }
});
