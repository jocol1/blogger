const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createDonationService, verifyKey, MAX_AMOUNT } = require('../features/donations/service');
const { createDonationRouter } = require('../features/donations/routes');
const { MemoryFirestore } = require('./helpers/memory-firestore');

const config = { bank: 'MB', account: '0000000000', accountName: 'TEST ONLY', webhookKey: 'test-secret-never-use-in-production' };
const setup = () => { const db = new MemoryFirestore(); return { db, service: createDonationService({ db, config }) }; };
const payload = (code, id = 1, extra = {}) => ({ id, code, content: `${code} TEST`, accountNumber: config.account, transferType: 'in', transferAmount: 20_000, ...extra });

test('QR includes the recipient, unique code and amount; anonymous names default safely', async () => {
  const { db, service } = setup();
  const first = await service.create({ amount: 10_000 });
  const second = await service.create({ amount: 10_000, name: '  Minh  ' });
  assert.match(first.code, /^DH\d{7}$/);
  assert.notEqual(first.code, second.code);
  assert.equal(first.name, 'Một vị mạnh thường quân');
  assert.equal(second.name, 'Minh');
  const url = new URL(first.qrUrl);
  assert.equal(url.pathname, '/image/MB-0000000000-compact2.png');
  assert.equal(url.searchParams.get('amount'), '10000');
  assert.equal(url.searchParams.get('addInfo'), first.code);
  assert.equal(url.searchParams.get('accountName'), config.accountName);
  assert.equal(db.rows.get(`donation_requests/${first.code}`).name, 'Một vị mạnh thường quân');
  assert.equal(db.rows.get(`donation_requests/${second.code}`).name, 'Minh');
  assert.ok(!JSON.stringify([...db.rows]).includes(first.token), 'raw lookup token is not stored');
  assert.deepEqual(await service.status(first.token), { status: 'pending', paidAmount: 0, paymentCount: 0 });
});

test('rejects invalid amounts and names before writing', async () => {
  const { db, service } = setup();
  for (const amount of [0, -1, 1.2, '10000', NaN, Infinity, MAX_AMOUNT + 1, undefined]) {
    await assert.rejects(service.create({ amount }), { status: 400 });
  }
  await assert.rejects(service.create({ amount: 1, name: 'x'.repeat(61) }), { status: 400 });
  await assert.rejects(service.create({ amount: 1, name: {} }), { status: 400 });
  assert.equal(db.rows.size, 0);
});

test('actual amount wins; multiple different transfers using one code remain separate gifts', async () => {
  const { service } = setup();
  const donation = await service.create({ amount: 10_000, name: 'Minh' });
  assert.equal((await service.receive(payload(donation.code, 1, { transferAmount: 50_000 }))).result, 'matched_paid');
  await service.receive(payload(donation.code, 2));
  const status = await service.status(donation.token);
  assert.equal(status.status, 'paid');
  assert.equal(status.paidAmount, 70_000);
  assert.equal(status.paymentCount, 2);
  assert.match(status.message, /Kính gửi Minh/);
  assert.ok(status.message.split(/\s+/).length >= 500, 'the private thank-you should be about one A4 page');
  const feed = await service.listEvents('0');
  assert.deepEqual(feed.events.map(event => event.amount), [50_000, 20_000]);
  assert.match(feed.events[0].message, /50\.000 đồng/);
  assert.ok(feed.events[0].message.split(/\s+/).length >= 500, 'the public thank-you should be about one A4 page');
});

test('concurrent duplicate webhooks produce exactly one receipt, credit and event', async () => {
  const { db, service } = setup();
  const donation = await service.create({ amount: 20_000 });
  const results = await Promise.all(Array.from({ length: 12 }, () => service.receive(payload(donation.code))));
  assert.equal(results.filter(item => item.result === 'matched_paid').length, 1);
  assert.equal(results.filter(item => item.result === 'duplicate').length, 11);
  const { message, ...status } = await service.status(donation.token);
  assert.deepEqual(status, { status: 'paid', paidAmount: 20_000, paymentCount: 1 });
  assert.ok(message.length > 0);
  assert.equal((await service.listEvents('0')).events.length, 1);
  assert.equal([...db.rows.keys()].filter(key => key.startsWith('donation_sepay_events/')).length, 1);
});

test('concurrent distinct gifts preserve all increments and ordered events', async () => {
  const { service } = setup();
  const donation = await service.create({ amount: 20_000 });
  await Promise.all(Array.from({ length: 12 }, (_, i) => service.receive(payload(donation.code, i + 1))));
  assert.equal((await service.status(donation.token)).paidAmount, 240_000);
  assert.deepEqual((await service.listEvents('0')).events.map(item => Number(item.id)), Array.from({ length: 12 }, (_, i) => i + 1));
});

test('wrong account, outgoing, unknown, missing/ambiguous codes and invalid amounts are private audit only', async () => {
  const { db, service } = setup();
  const donation = await service.create({ amount: 20_000 });
  const cases = [
    [{ accountNumber: '111111' }, 'wrong_account'],
    [{ transferType: 'out' }, 'ignored_out'],
    [{ code: 'DH0000001', content: '' }, 'unmatched'],
    [{ code: null, content: 'cam on' }, 'unmatched'],
    [{ content: 'DH9999999' }, 'unmatched'],
    [{ transferAmount: 0 }, 'invalid_amount'],
    [{ transferAmount: 1.5 }, 'invalid_amount'],
  ];
  for (const [index, [extra, expected]] of cases.entries()) {
    const result = await service.receive(payload(donation.code, index + 1, extra));
    assert.deepEqual(result, { success: true, result: expected });
  }
  assert.equal((await service.listEvents('0')).events.length, 0);
  assert.equal((await service.status(donation.token)).status, 'pending');
  assert.equal([...db.rows.keys()].filter(key => key.startsWith('donation_sepay_events/')).length, cases.length);
});

test('content fallback handles absent code and lowercase; long codes cannot partially match', async () => {
  const { service } = setup();
  const donation = await service.create({ amount: 20_000 });
  assert.equal((await service.receive(payload(null, 1, { content: `ung ho ${donation.code.toLowerCase()} cam on` }))).result, 'matched_paid');
  assert.equal((await service.receive(payload(null, 2, { content: `${donation.code}7` }))).result, 'unmatched');
});

test('storage failure rolls back every write and webhook retry can succeed', async () => {
  const { db, service } = setup();
  const donation = await service.create({ amount: 20_000 });
  db.failWrites = true;
  await assert.rejects(service.receive(payload(donation.code)), /storage failure/);
  assert.equal((await service.status(donation.token)).status, 'pending');
  assert.equal((await service.listEvents('0')).events.length, 0);
  assert.equal(db.rows.has('donation_sepay_events/1'), false);
  db.failWrites = false;
  assert.equal((await service.receive(payload(donation.code))).result, 'matched_paid');
});

test('new viewers start at current sequence; reconnect paginates without losing or repeating events', async () => {
  const { service } = setup();
  const donation = await service.create({ amount: 20_000, name: '<img src=x onerror=alert(1)>' });
  await service.receive(payload(donation.code, 1));
  const start = await service.listEvents();
  assert.deepEqual(start, { events: [], cursor: 1, hasMore: false });
  for (let id = 2; id <= 53; id++) await service.receive(payload(donation.code, id));
  const page1 = await service.listEvents(String(start.cursor));
  const page2 = await service.listEvents(String(page1.cursor));
  assert.equal(page1.events.length, 50);
  assert.equal(page1.hasMore, true);
  assert.equal(page2.events.length, 2);
  assert.equal(page2.cursor, 53);
  assert.equal((await service.listEvents(String(page2.cursor))).events.length, 0);
  assert.deepEqual(Object.keys(page1.events[0]).sort(), ['id', 'name', 'amount', 'createdAt', 'message'].sort());
  for (const cursor of ['-1', 'x', '1.2', ['1'], '1'.repeat(16)]) await assert.rejects(service.listEvents(cursor), { status: 400 });
  await assert.rejects(service.status('bad-token'), { status: 401 });
  await assert.rejects(service.status('a'.repeat(64)), { status: 404 });
});

test('API key is exact and missing configuration disables all payment operations', async () => {
  assert.equal(verifyKey(`Apikey ${config.webhookKey}`, config.webhookKey), true);
  for (const header of [undefined, 'Bearer test', 'Apikey wrong', `Apikey ${config.webhookKey} extra`]) assert.equal(verifyKey(header, config.webhookKey), false);
  const service = createDonationService({ db: null, config });
  assert.deepEqual(service.publicConfig(), { ready: false });
  await assert.rejects(service.create({ amount: 20_000 }), { status: 503 });
  const missingKey = createDonationService({ db: new MemoryFirestore(), config: { ...config, webhookKey: '' } });
  assert.deepEqual(missingKey.publicConfig(), { ready: false });
});

async function serverFor(t, options) {
  const app = express();
  app.use(createDonationRouter(options));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return (url, options) => fetch(`http://127.0.0.1:${server.address().port}${url}`, options);
}

test('HTTP integration: page, create/status, authentication, JSON errors, retries and rate limit', async t => {
  const { db } = setup();
  const request = await serverFor(t, { db, config });
  const page = await request('/an-xin');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await page.text(), /Cho xin một chút/);
  const post = data => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  let response = await request('/api/donations', post({ amount: 20_000, name: 'Test' }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const donation = await response.json();
  assert.equal((await request('/api/donations/status')).status, 401);
  assert.equal((await request('/api/webhooks/sepay', post(payload(donation.code)))).status, 401);
  const webhook = post(payload(donation.code));
  webhook.headers.Authorization = `Apikey ${config.webhookKey}`;
  db.failWrites = true;
  assert.equal((await request('/api/webhooks/sepay', webhook)).status, 503);
  db.failWrites = false;
  response = await request('/api/webhooks/sepay', webhook);
  assert.deepEqual(await response.json(), { success: true, result: 'matched_paid' });
  assert.deepEqual(await (await request('/api/webhooks/sepay', webhook)).json(), { success: true, result: 'duplicate' });
  const status = await request('/api/donations/status', { headers: { 'X-Donation-Token': donation.token } });
  assert.equal((await status.json()).status, 'paid');
  assert.equal((await request('/api/webhooks/sepay', { ...webhook, body: '{bad' })).status, 400);
  assert.equal((await request('/api/webhooks/sepay', { ...webhook, body: JSON.stringify({ x: 'a'.repeat(33_000) }) })).status, 413);
  for (let i = 0; i < 9; i++) assert.equal((await request('/api/donations', post({ amount: 1 }))).status, 201);
  response = await request('/api/donations', post({ amount: 1 }));
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('retry-after')) > 0);
});

test('HTTP missing config does not issue QR or acknowledge payments', async t => {
  const request = await serverFor(t, { db: null, config });
  assert.deepEqual(await (await request('/api/donations/config')).json(), { ready: false });
  assert.equal((await request('/api/donations', { method: 'POST' })).status, 503);
  assert.equal((await request('/api/webhooks/sepay', { method: 'POST' })).status, 503);
});
