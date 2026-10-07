const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../public/an-xin/app.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

// Minimal DOM harness to test asynchronous queue/error behavior, not layout.
function fixture(handler, initialPayment) {
  const nodes = new Map();
  const timers = [];
  const frames = [];
  let now = 0;
  const storage = new Map();
  const session = new Map();
  if (initialPayment) storage.set('donation-payment', JSON.stringify(initialPayment));
  function element() {
    const classes = new Set();
    return {
      textContent: '', hidden: false, disabled: false, value: '', dataset: {}, handlers: {}, attributes: {}, children: [], clientHeight: 440, style: { setProperty(name, value) { this[name] = value; } },
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
      addEventListener(event, handler) { this.handlers[event] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      replaceChildren(...children) { this.textContent = children.map(item => item.textContent).join(''); },
      append(...children) { this.children.push(...children); },
      remove() {},
      focus() {},
    };
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  get('amount').value = '20000';
  get('donation-fields').disabled = true;
  const choices = [10000, 20000, 50000, 100000].map(amount => Object.assign(element(), { dataset: { amount: String(amount) } }));
  const games = ['bowl', 'needle', 'heart'].map(game => Object.assign(element(), { dataset: { game } }));
  const hearts = [0, 1, 2].map(position => Object.assign(element(), { dataset: { heart: String(position) } }));
  const storageApi = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
  const context = {
    document: { visibilityState: 'visible', handlers: {}, getElementById: get, querySelectorAll: selector => selector === '[data-amount]' ? choices : selector === '[data-game]' ? games : selector === '[data-heart]' ? hearts : [], createElement: element, createTextNode: text => ({ textContent: text }), addEventListener(event, handler) { this.handlers[event] = handler; } },
    window: { handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; }, matchMedia: () => ({ matches: false }) }, navigator: {}, URLSearchParams, AbortSignal,
    performance: { now: () => now }, requestAnimationFrame: fn => { frames.push(fn); },
    localStorage: storageApi(storage), sessionStorage: storageApi(session),
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); },
    fetch: async (url, options) => { const result = await handler(url, options); return { ok: result.ok !== false, json: async () => result.body }; },
  };
  vm.runInNewContext(source, context);
  return { get, choices, games, hearts, timers, storage, session, context, tick(time) { now = time; const frame = frames.shift(); assert.ok(frame, 'missing animation frame'); frame(time); }, async run(delay) { const index = timers.findIndex(timer => timer.delay === delay); assert.notEqual(index, -1, `missing ${delay}ms timer`); const [timer] = timers.splice(index, 1); await timer.fn(); await settle(); } };
}

test('client queues donations for seven seconds and ignores replayed event IDs', async () => {
  let poll = 0;
  const ui = fixture(async url => {
    if (url.endsWith('/config')) return { body: { ready: true } };
    poll++;
    return { body: { cursor: 2, events: poll === 1 ? [{ id: '1', message: 'Cảm ơn A' }, { id: '2', message: 'Cảm ơn B' }] : [{ id: '2', message: 'Cảm ơn B' }], hasMore: false } };
  });
  await settle();
  assert.equal(ui.get('speech-text').textContent, 'Cảm ơn A');
  await ui.run(7000);
  await ui.run(80);
  assert.equal(ui.get('speech-text').textContent, 'Cảm ơn B');
  await ui.run(3000); // event polling; the next 3000ms timer may be status polling
  await ui.run(3000);
  await ui.run(7000);
  await ui.run(80);
  assert.equal(ui.get('scene').classList.contains('celebrating'), false);
  assert.equal(ui.timers.filter(timer => timer.delay === 7000).length, 0);
});

test('client preserves its cursor across a connection failure', async () => {
  const eventUrls = [];
  const ui = fixture(async url => {
    if (url.endsWith('/config')) return { body: { ready: true } };
    eventUrls.push(url);
    if (eventUrls.length === 2) throw new Error('Offline');
    return { body: { cursor: 4, events: [], hasMore: false } };
  });
  await settle();
  for (let i = 0; i < 4; i++) await ui.run(3000);
  assert.deepEqual(eventUrls, ['/api/donations/events', '/api/donations/events?after=4', '/api/donations/events?after=4']);
});

test('QR failure preserves manual transfer details and client never infers a paid status from submit', async () => {
  const ui = fixture(async url => {
    if (url.endsWith('/config')) return { body: { ready: true } };
    if (url === '/api/donations') return { body: { bank: 'MB', account: '0000000000', accountName: 'TEST', amount: 20000, code: 'DH0123456', token: 'a'.repeat(64), qrUrl: 'https://img.vietqr.io/test.png' } };
    return { body: { cursor: 0, events: [], hasMore: false } };
  });
  await settle();
  await ui.get('donation-form').handlers.submit({ preventDefault() {} });
  assert.match(ui.get('payment-status').textContent, /đúng nội dung DH/);
  ui.get('qr-image').handlers.error();
  assert.equal(ui.get('qr-image').hidden, true);
  assert.equal(ui.get('qr-error').hidden, false);
  assert.equal(ui.get('account-number').textContent, '0000000000');
  assert.equal(ui.get('payment-code').textContent, 'DH0123456');
  assert.ok(ui.storage.has('donation-payment'));
});

test('missing configuration keeps the form disabled and does not poll transactions', async () => {
  const calls = [];
  const ui = fixture(async url => { calls.push(url); return { body: { ready: false } }; });
  await settle();
  assert.equal(ui.get('donation-fields').disabled, true);
  assert.match(ui.get('availability').textContent, /chưa sẵn sàng/);
  assert.deepEqual(calls, ['/api/donations/config']);
});

test('a new tab restores the latest QR and immediately shows its paid status', async () => {
  const cached = { bank: 'MB', account: '0000000000', accountName: 'TEST', amount: 20000, code: 'DH0123456', token: 'a'.repeat(64), qrUrl: 'https://old.example/qr.png' };
  const ui = fixture(async url => {
    if (url.endsWith('/config')) return { body: { ready: true, bank: 'MB', account: '0000000000', accountName: 'TEST' } };
    if (url === '/api/donations/status') return { body: { status: 'paid', paidAmount: 20000, paymentCount: 1 } };
    return { body: { cursor: 0, events: [], hasMore: false } };
  }, cached);
  await settle();
  assert.equal(ui.get('payment').hidden, false);
  assert.equal(ui.get('payment-code').textContent, 'DH0123456');
  assert.equal(ui.get('payment').classList.contains('paid'), true);
  assert.equal(ui.get('paid-success').hidden, false);
  assert.match(ui.get('paid-title').textContent, /Đã nhận 20\.000đ/);
  assert.match(ui.get('paid-message').textContent, /Tiền của/);
  assert.equal(ui.get('coin-game').hidden, false);
  assert.equal(ui.get('coin-balance').textContent, '20');
  assert.equal(ui.get('scene').classList.contains('grateful'), true);
});

test('each confirmed 1.000đ grants one coin that can be thrown into the bowl', async () => {
  const cached = { bank: 'MB', account: '0000000000', accountName: 'TEST', amount: 20000, code: 'DH0123456', token: 'a'.repeat(64), qrUrl: 'https://old.example/qr.png' };
  const ui = fixture(async url => {
    if (url.endsWith('/config')) return { body: { ready: true, bank: 'MB', account: '0000000000', accountName: 'TEST' } };
    if (url === '/api/donations/status') return { body: { status: 'paid', paidAmount: 2500, paymentCount: 1 } };
    return { body: { cursor: 0, events: [], hasMore: false } };
  }, cached);
  await settle();
  assert.equal(ui.get('coin-balance').textContent, '2');
  ui.get('throw-coin').handlers.click();
  assert.equal(ui.get('coin-balance').textContent, '1');
  assert.equal(ui.get('coin-flight-layer').children.length, 1);
  assert.match(ui.get('coin-feedback').textContent, /còn 1 xu/i);
});

test('three games share only confirmed coins and preserve spending on reload', async () => {
  const cached = { bank: 'MB', account: '0000000000', accountName: 'TEST', amount: 5000, code: 'DH0123456', token: 'a'.repeat(64) };
  const handler = async url => {
    if (url.endsWith('/config')) return { body: { ready: true, bank: 'MB', account: '0000000000', accountName: 'TEST' } };
    if (url === '/api/donations/status') return { body: { status: 'paid', paidAmount: 2500, paymentCount: 1 } };
    return { body: { cursor: 0, events: [], hasMore: false } };
  };
  const ui = fixture(handler, cached);
  await settle();
  ui.tick(0);
  ui.games[1].handlers.click();
  assert.equal(ui.get('game-needle').hidden, false);
  ui.get('stop-needle').handlers.click();
  assert.equal(ui.get('coin-balance').textContent, '1');
  assert.equal(ui.get('game-score').textContent, '1');
  assert.equal(ui.get('stop-needle').disabled, true);
  await ui.run(700);
  assert.equal(ui.get('stop-needle').disabled, false);
  ui.tick(850);
  ui.games[2].handlers.click();
  ui.hearts[1].handlers.click();
  assert.equal(ui.get('coin-balance').textContent, '0');
  assert.equal(ui.get('game-score').textContent, '2');
  assert.equal(ui.get('throw-coin').disabled, true);
  ui.hearts[1].handlers.click();
  assert.equal(JSON.parse(ui.storage.get('donation-payment')).coinsThrown, 2);
  const restored = fixture(handler, JSON.parse(ui.storage.get('donation-payment')));
  await settle();
  assert.equal(restored.get('coin-balance').textContent, '0');
  assert.equal(restored.get('game-score').textContent, '2');
  assert.equal(restored.get('stop-needle').disabled, true);
});
