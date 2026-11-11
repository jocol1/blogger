const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { CATALOG } = require('../features/tea/grocery-catalog');
const { parseSize, pickBest, createGroceryPrices, nextRefreshAt, toCsv } = require('../features/tea/grocery-prices');
const { createTeaRouter } = require('../features/tea/routes');

const item = id => CATALOG.find(i => i.id === id);
const product = (name, price, extra = {}) => ({ name, uom: '', price, listPrice: 0, inStock: true, url: `https://winmart.vn/products/${encodeURIComponent(name)}`, ...extra });

test('parseSize reads pack sizes in the unit the item is compared by', () => {
  assert.deepEqual(parseSize('Sữa tươi hộp 1 lít', '', 'l'), { qty: 1, label: '1lít' });
  assert.equal(parseSize('Sữa tươi Vinamilk 220ml', '', 'l').qty, 0.22);
  assert.equal(parseSize('Sữa tươi lốc 4x180ml', '', 'l').qty, 0.72);
  assert.equal(parseSize('Dầu ăn Cái Lân 5L', '', 'l').qty, 5);
  assert.equal(parseSize('Đường tinh luyện 500g', '', 'kg').qty, 0.5);
  assert.equal(parseSize('Muối tinh 1,5kg', '', 'kg').qty, 1.5);
  assert.equal(parseSize('Trứng gà vỉ 10Tx60g NTX', 'Vỉ', 'qua').qty, 10);
  assert.equal(parseSize('Trứng gà tươi hộp 10 quả', '', 'qua').qty, 10);
  assert.equal(parseSize('Trứng gà Co.op loại 1- 10 trứng', '', 'qua').qty, 10);
});

test('parseSize treats loose goods sold per kilo as one kilo and per-pack weights as that weight', () => {
  assert.equal(parseSize('Cà chua kg', 'Kg', 'kg').qty, 1);
  assert.equal(parseSize('Cà rốt', '1 KG', 'kg').qty, 1);
  assert.equal(parseSize('MEATDELI Phi lê ức gà', '0.5KG', 'kg').qty, 0.5);
  assert.equal(parseSize('Cà rốt', 'Gói', 'kg'), null);
  assert.equal(parseSize('Nước mắm', '', 'l'), null);
  assert.equal(parseSize('Đường 50g/L pha', '', 'l'), null, 'a weight is not a volume');
});

test('pickBest ignores look-alike products and picks the cheapest pack per unit', () => {
  const eggs = item('trung-ga');
  const pick = pickBest(eggs, [
    product('Tràng trứng gà (trứng non) THÀNH ĐẠT', 209900, { uom: 'Kg' }),
    product('Trứng gà ác 729 Ba Vì giỏ 10 quả', 60000),
    product('Trứng gà tươi hộp 10 quả', 38700),
    product('Trứng gà tươi hộp 30 quả', 90000),
    product('Bột trứng gà 500g', 10000),
  ]);
  assert.equal(pick.status, 'ok');
  assert.equal(pick.name, 'Trứng gà tươi hộp 30 quả');
  assert.equal(pick.unitPrice, 3000);

  const carrots = item('ca-rot');
  const carrot = pickBest(carrots, [product('OTOKI Cháo tươi thịt bò và cà rốt 220g', 25200), product('Cà rốt', 56900, { uom: '1 KG' })]);
  assert.equal(carrot.name, 'Cà rốt');
  assert.equal(carrot.unitPrice, 56900);
});

test('pickBest tells out of stock apart from not found and keeps pack sizes sensible', () => {
  const milk = item('sua-tuoi');
  assert.equal(pickBest(milk, [product('Bột giặt', 1000)]).status, 'not_found');
  assert.equal(pickBest(milk, [product('Sữa tươi tiệt trùng hộp 1 lít', 40000, { inStock: false })]).status, 'out_of_stock');
  assert.equal(pickBest(milk, [product('Sữa tươi tiệt trùng 110ml', 5000)]).status, 'not_found', 'small packs are not a litre carton');
  assert.equal(pickBest(milk, [product('Sữa tươi tiệt trùng hộp 1 lít', 0)]).status, 'not_found', 'zero price is bad data');
  const list = pickBest(item('nuoc-mam'), [product('Nước mắm Nhất vị 500ml', 29900, { listPrice: 49000 })]);
  assert.equal(list.listPrice, 49000);
  assert.equal(list.unitPrice, 59800);
});

// Both fake stores sell every item at 1 kg / 1 l / 10 eggs, WinMart pricier by a fixed amount.
const fakeStore = extra => async keyword => {
  const base = { 'trứng gà': 'Trứng gà tươi hộp 10 quả', 'ba rọi heo': 'Ba rọi heo 1kg', 'ức gà': 'Ức gà 1kg', 'thịt ức gà': 'Ức gà 1kg', 'cà rốt': 'Cà rốt 1kg', 'khoai tây': 'Khoai tây 1kg', 'cà chua': 'Cà chua 1kg', 'đường': 'Đường tinh luyện 1kg', 'đường tinh luyện': 'Đường tinh luyện 1kg', 'muối tinh': 'Muối tinh 1kg', 'nước mắm': 'Nước mắm 500ml', 'sữa tươi 1l': 'Sữa tươi hộp 1 lít', 'dầu ăn': 'Dầu ăn 1 lít', 'dầu thực vật': 'Dầu ăn 1 lít' }[keyword];
  if (!base) return [];
  return [product(base, 10000 + extra, { url: `https://winmart.vn/products/${encodeURIComponent(base)}` })];
};
const KNOWN = 11; // catalog items the fake stores know a keyword for
const clock = start => { let value = start; return { now: () => value, advance: ms => { value += ms; } }; };

test('getPrices caches, shares one refresh between callers and survives one store failing', async () => {
  const time = clock(Date.parse('2026-11-10T08:00:00Z'));
  let winmartCalls = 0;
  const prices = createGroceryPrices({ now: time.now, delayMs: 0, fetchers: { winmart: async k => { winmartCalls += 1; return fakeStore(5000)(k); }, coop: async () => { throw new Error('boom'); } } });
  const [a, b] = await Promise.all([prices.getPrices(), prices.getPrices()]);
  assert.equal(a, b, 'concurrent callers share one build');
  assert.equal(a.items.length, CATALOG.length);
  assert.equal(a.items[0].perStore.winmart.status, 'ok');
  assert.equal(a.items[0].perStore.coop.status, 'error');
  assert.equal(a.stores.find(s => s.id === 'winmart').failed, false);
  assert.equal(a.stores.find(s => s.id === 'coop').failed, true);
  assert.equal(a.stores.find(s => s.id === 'coop').checkedAt, null);
  assert.equal(a.basket.count, 0);
  const calls = winmartCalls;
  await prices.getPrices();
  assert.equal(winmartCalls, calls, 'cached inside the retry window');
  time.advance(6 * 60_000);
  await prices.getPrices();
  assert.ok(winmartCalls > calls, 'errors are retried after a few minutes, not after six hours');
});

test('a store that fails later keeps its last good prices, marked as old', async () => {
  const time = clock(Date.parse('2026-11-10T08:00:00Z'));
  let broken = false;
  const prices = createGroceryPrices({ now: time.now, delayMs: 0, fetchers: { winmart: fakeStore(5000), coop: async k => { if (broken) throw new Error('down'); return fakeStore(0)(k); } } });
  const first = await prices.getPrices();
  assert.equal(first.basket.count, KNOWN);
  assert.ok(first.basket.totals.winmart > first.basket.totals.coop);
  broken = true; time.advance(18 * 3600_000);
  const second = await prices.getPrices();
  const cell = second.items[0].perStore.coop;
  assert.equal(cell.status, 'ok');
  assert.equal(cell.stale, true);
  assert.equal(second.stores.find(s => s.id === 'coop').checkedAt, first.stores.find(s => s.id === 'coop').checkedAt, 'old checkedAt kept so the board shows how old it is');
});

test('current never waits: null at first, then the snapshot, refreshed once it expires', async () => {
  const time = clock(Date.parse('2026-11-10T08:00:00Z'));
  const prices = createGroceryPrices({ now: time.now, delayMs: 0, fetchers: { winmart: fakeStore(0), coop: fakeStore(0) } });
  assert.equal(prices.current(), null);
  const built = await prices.getPrices();
  assert.equal(prices.current(), built);
  time.advance(18 * 3600_000); // 09:00 ICT the next morning, past the 08:00 run
  assert.equal(prices.current(), built, 'stale snapshot is served while a refresh runs');
  const refreshed = await prices.getPrices();
  assert.notEqual(refreshed, built);
});

test('CSV opens in Excel: BOM, quoted cells, one row per item and store', async () => {
  const prices = createGroceryPrices({ delayMs: 0, fetchers: { winmart: fakeStore(0), coop: async k => (await fakeStore(0)(k)).map(p => ({ ...p, name: p.name + ', "đặc biệt"' })) } });
  const csv = toCsv(await prices.getPrices());
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const lines = csv.slice(1).trim().split('\r\n'); // trim() would eat the BOM
  assert.equal(lines.length, 1 + CATALOG.length * 2);
  assert.match(lines[0], /^Mặt hàng,Siêu thị,Sản phẩm/);
  assert.ok(lines.some(l => l.includes('"Trứng gà tươi hộp 10 quả, ""đặc biệt"""')));
});

test('price routes answer 202 while loading, then JSON and a CSV download', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const prices = createGroceryPrices({ delayMs: 0, fetchers: { winmart: async k => { await gate; return fakeStore(0)(k); }, coop: fakeStore(100) } });
  const app = express(); app.use(createTeaRouter({ service: {}, isAdmin: () => false, groceryPrices: prices }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const loading = await fetch(`${base}/api/tea/prices`);
    assert.equal(loading.status, 202);
    assert.deepEqual(await loading.json(), { loading: true });
    assert.equal((await fetch(`${base}/api/tea/prices.csv`)).status, 503);
    release(); await prices.getPrices();
    const ok = await fetch(`${base}/api/tea/prices`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).items.length, CATALOG.length);
    const csv = await fetch(`${base}/api/tea/prices.csv`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.headers.get('content-disposition'), /attachment; filename="bang-gia-sieu-thi\.csv"/);
  } finally { await new Promise(resolve => server.close(resolve)); }
  const bare = express(); bare.use(createTeaRouter({ service: {}, isAdmin: () => false }));
  const bareServer = await new Promise(resolve => { const listener = bare.listen(0, '127.0.0.1', () => resolve(listener)); });
  try { assert.equal((await fetch(`http://127.0.0.1:${bareServer.address().port}/api/tea/prices`)).status, 503); }
  finally { await new Promise(resolve => bareServer.close(resolve)); }
});

test('the café wires the price board: tab, view, scripts, cache list and wall board', () => {
  const fs = require('node:fs'), path = require('node:path'), read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const html = read('public/tea/index.html'), app = read('public/tea/app.js'), worker = read('public/tea/sw.js');
  assert.match(html, /data-tab="prices"/); assert.match(html, /id="prices-view"/); assert.match(html, /prices-ui\.js/); assert.match(html, /prices-words\.js/); assert.match(html, /prices\.css/);
  assert.match(app, /atBoard\(\)/); assert.match(app, /TeaPricesUI\(/);
  for (const file of ['prices-ui.js', 'prices-words.js', 'prices.css']) { assert.match(worker, new RegExp(file.replace('.', '\\.'))); assert.ok(fs.existsSync(path.join(__dirname, '..', 'public/tea', file))); }
  assert.match(read('public/tea/scene.js'), /BẢNG GIÁ/);
  assert.match(read('public/tea/prices-ui.js'), /textContent/); assert.doesNotMatch(read('public/tea/prices-ui.js'), /innerHTML/);
});

test('nextRefreshAt is the next 08:00 in Vietnam (UTC+7), never the current instant', () => {
  const iso = ms => new Date(ms).toISOString();
  assert.equal(iso(nextRefreshAt(Date.parse('2026-11-10T00:30:00Z'))), '2026-11-10T01:00:00.000Z', '07:30 ICT waits for 08:00 today');
  assert.equal(iso(nextRefreshAt(Date.parse('2026-11-10T01:00:00Z'))), '2026-11-11T01:00:00.000Z', 'exactly 08:00 means tomorrow');
  assert.equal(iso(nextRefreshAt(Date.parse('2026-11-10T20:00:00Z'))), '2026-11-11T01:00:00.000Z', '03:00 ICT next day, still before 08:00');
  assert.equal(iso(nextRefreshAt(Date.parse('2026-12-31T23:00:00Z'))), '2027-01-01T01:00:00.000Z', 'crosses the year');
  assert.equal(iso(nextRefreshAt(Date.parse('2026-11-10T00:30:00Z'), { hour: 6, offsetHours: 7 })), '2026-11-10T23:00:00.000Z', '07:30 ICT is past 06:00, so tomorrow');
});

test('prices stay fresh until 08:00, then refresh; start() arms a daily timer', async () => {
  const time = clock(Date.parse('2026-11-10T02:00:00Z')); // 09:00 ICT, just after the morning run
  const timers = []; let calls = 0;
  const prices = createGroceryPrices({ now: time.now, delayMs: 0, setTimer: (fn, ms) => { const t = { fn, ms, unref() {} }; timers.push(t); return t; }, fetchers: { winmart: async k => { calls += 1; return fakeStore(0)(k); }, coop: fakeStore(0) } });
  prices.start();
  await prices.getPrices();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 23 * 3600_000, 'next run is 08:00 ICT tomorrow, 23 hours after 09:00');
  const afterFirst = calls;
  time.advance(22 * 3600_000); // 07:00 ICT
  await prices.getPrices();
  assert.equal(calls, afterFirst, 'still the same morning snapshot at 07:00');
  time.advance(2 * 3600_000); // 09:00 ICT, past 08:00
  const stale = prices.current();
  assert.ok(stale, 'serves the old snapshot instantly while refreshing');
  await prices.getPrices();
  assert.ok(calls > afterFirst, 'refreshed after 08:00');
  timers[0].fn(); // the 08:00 timer fires: refresh and re-arm
  assert.equal(timers.length, 2, 'rearmed for the next day');
  prices.stop();
});

test('Kingfoodmart results map to the common product shape (sale price, stock, safe search link)', async () => {
  const { fetchKingfood } = require('../features/tea/grocery-prices');
  const real = global.fetch; let seen;
  global.fetch = async (url, init) => { seen = { url: String(url), init }; return new Response(JSON.stringify({ products: [{ name: 'Sữa tươi Nuti hộp 1L', discountPrice: 33500, originalPrice: 36000, inStock: 12, variants: [{ unit: { name: 'Hộp' } }] }, { name: 'Hết hàng 1L', discountPrice: 0, originalPrice: 20000, inStock: 0 }] }), { headers: { 'content-type': 'application/json' } }); };
  try {
    const [a, b] = await fetchKingfood('sữa tươi 1l');
    assert.equal(seen.init.method, 'GET');
    assert.equal(seen.init.headers['x-ol-tenant'], 'kingfood');
    assert.match(seen.url, /keyword=s%E1%BB%AFa%20t%C6%B0%C6%A1i%201l/);
    assert.deepEqual(a, { name: 'Sữa tươi Nuti hộp 1L', uom: 'Hộp', price: 33500, listPrice: 36000, inStock: true, url: 'https://kingfoodmart.com/search?keyword=S%E1%BB%AFa%20t%C6%B0%C6%A1i%20Nuti%20h%E1%BB%99p%201L', image: undefined });
    assert.equal(b.price, 20000, 'no discount means the original price');
    assert.equal(b.inStock, false);
  } finally { global.fetch = real; }
});

test('LOTTE Mart results map selling price, list price, stock and product link', async () => {
  const { fetchLotte } = require('../features/tea/grocery-prices');
  const real = global.fetch; let seen;
  global.fetch = async (url, init) => { seen = { url: String(url), init }; return new Response(JSON.stringify({ data: { items: [{ name: 'Sữa Tươi Devondale Nguyên Kem 1L', url_key: 'sua-tuoi-devondale-1l', in_stock: 1, stock_qty: 147, price: { VND: { default: 49900, price: 70500 } } }, { name: 'Hết 1L', url_key: 'het', in_stock: 0, stock_qty: 0, price: { VND: { default: 41000, price: 41000 } } }] } }), { headers: { 'content-type': 'application/json' } }); };
  try {
    const [a, b] = await fetchLotte('sữa tươi 1l');
    assert.equal(seen.init.method, 'POST');
    assert.deepEqual(JSON.parse(seen.init.body).where, { query: 'sữa tươi 1l' });
    assert.deepEqual(a, { name: 'Sữa Tươi Devondale Nguyên Kem 1L', uom: '', price: 49900, listPrice: 70500, inStock: true, url: 'https://www.lottemart.vn/vi-nsg/product/sua-tuoi-devondale-1l', image: undefined });
    assert.equal(b.inStock, false);
  } finally { global.fetch = real; }
});

test('cart compares the whole cart per store: complete stores first, cheapest wins, reference stores never win', () => {
  const { compareCart } = require('../public/tea/prices-cart');
  const ok = unitPrice => ({ status: 'ok', unitPrice });
  const data = {
    stores: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'r', name: 'R', referenceOnly: true }],
    items: [
      { id: 'egg', name: 'Trứng', perStore: { a: ok(3000), b: ok(2500), c: ok(2000), r: ok(100) } },
      { id: 'milk', name: 'Sữa', perStore: { a: ok(40000), b: ok(38000), c: { status: 'not_found' }, r: ok(100) } },
      { id: 'salt', name: 'Muối', perStore: { a: ok(9000), b: { ...ok(5000), stale: true }, c: ok(7000), r: ok(100) } },
    ],
  };
  const result = compareCart(data, ['egg', 'milk'], ['a', 'b', 'c', 'r']);
  assert.deepEqual(result.rows.map(r => r.store.id), ['b', 'a', 'c', 'r'], 'complete stores by total, then partial, reference last');
  assert.equal(result.best.store.id, 'b');
  assert.equal(result.best.total, 40500);
  assert.deepEqual(result.rows.find(r => r.store.id === 'c').missing, ['Sữa']);
  assert.equal(compareCart(data, ['salt'], ['a', 'b']).best.store.id, 'a', 'a stale price does not count');
  assert.equal(compareCart(data, [], ['a']).best, null);
  assert.equal(compareCart(data, ['egg'], ['r']).best, null, 'reference-only prices never win');
  const partial = compareCart(data, ['egg', 'milk'], ['c', 'r']);
  assert.equal(partial.best.store.id, 'c', 'when nobody has everything, the verified store with the most items wins');
  assert.equal(partial.best.have, 1);
  assert.equal(compareCart(data, ['milk'], ['c']).best, null, 'a store with none of the items is not a winner');
});

test('price cells keep an https product photo and the relay serves only photos in the snapshot', async () => {
  const eggs = CATALOG.find(i => i.id === 'trung-ga');
  assert.equal(pickBest(eggs, [product('Trứng gà tươi hộp 10 quả', 30000, { image: 'https://img.example/egg.jpg' })]).image, 'https://img.example/egg.jpg');
  assert.equal(pickBest(eggs, [product('Trứng gà tươi hộp 10 quả', 30000, { image: 'http://img.example/egg.jpg' })]).image, undefined, 'plain http is dropped');

  const photo = 'https://img.example/egg.jpg';
  const prices = createGroceryPrices({ delayMs: 0, fetchers: { winmart: async k => (await fakeStore(0)(k)).map(p => ({ ...p, image: photo })) } });
  await prices.getPrices();
  const upstream = [];
  const imageFetch = async url => { upstream.push(String(url)); return String(url).endsWith('.jpg') ? new Response(Buffer.from([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } }) : new Response('<html>', { headers: { 'content-type': 'text/html' } }); };
  const app = express(); app.use(createTeaRouter({ service: {}, isAdmin: () => false, groceryPrices: prices, imageFetch }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/api/tea/prices/img?u=`;
  try {
    const ok = await fetch(base + encodeURIComponent(photo));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/jpeg');
    assert.match(ok.headers.get('cache-control'), /max-age=86400/);
    assert.equal((await fetch(base + encodeURIComponent('https://evil.example/x.jpg'))).status, 404, 'not in the snapshot');
    assert.equal((await fetch(base + encodeURIComponent('file:///etc/passwd'))).status, 404);
    assert.deepEqual(upstream, [photo], 'unknown URLs are never fetched');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('prices are saved to Firestore, served at once after a restart, and refreshed behind a stale or foreign snapshot', async () => {
  const { MemoryFirestore } = require('./helpers/memory-firestore');
  const { firestorePriceStore } = require('../features/tea/grocery-prices');
  const db = new MemoryFirestore(), store = firestorePriceStore(db);
  const time = clock(Date.parse('2026-11-10T08:00:00Z')); // 15:00 in Vietnam
  let calls = 0;
  const fetchers = { winmart: async k => { calls += 1; return fakeStore(0)(k); } };
  const first = createGroceryPrices({ now: time.now, delayMs: 0, fetchers, store, log: {} });
  await first.getPrices();
  await new Promise(resolve => setImmediate(resolve));
  const saved = await store.load();
  assert.equal(saved.items.length, CATALOG.length);
  assert.equal(saved.catalogKey, CATALOG.map(i => i.id).join(','));

  time.advance(2 * 3600_000);
  calls = 0;
  const second = createGroceryPrices({ now: time.now, delayMs: 0, fetchers, store, log: {}, setTimer: () => ({ unref() {} }) });
  await second.start();
  assert.equal(second.current().checkedAt, saved.checkedAt, 'the saved snapshot is served immediately');
  assert.equal(calls, 0, 'still fresh before the next 08:00, so no rebuild');

  const later = clock(time.now() + 20 * 3600_000); // past 08:00 next morning
  const third = createGroceryPrices({ now: later.now, delayMs: 0, fetchers, store, log: {}, setTimer: () => ({ unref() {} }) });
  await third.start();
  assert.equal(third.current().checkedAt, saved.checkedAt, 'the old snapshot is served while the refresh runs');
  await third.getPrices();
  assert.ok(calls > 0, 'refreshed after 08:00');

  await db.collection('tea_prices').doc('latest').set({ json: JSON.stringify({ ...saved, catalogKey: 'old,catalog' }), savedAt: saved.checkedAt });
  calls = 0;
  const fourth = createGroceryPrices({ now: time.now, delayMs: 0, fetchers, store, log: {}, setTimer: () => ({ unref() {} }) });
  await fourth.start();
  await fourth.getPrices();
  assert.ok(calls > 0, 'a snapshot built for another catalog is refreshed straight away');
});

test('a failing or unreadable store never breaks the board', async () => {
  const warnings = [];
  const time = clock(Date.parse('2026-11-10T08:00:00Z'));
  const store = { load: async () => { throw new Error('no db'); }, save: async () => { throw new Error('write failed'); } };
  const prices = createGroceryPrices({ now: time.now, delayMs: 0, fetchers: { winmart: fakeStore(0) }, store, log: { warn: (...a) => warnings.push(a.join(' ')) }, setTimer: () => ({ unref() {} }) });
  await prices.start();
  const data = await prices.getPrices();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(data.items.length, CATALOG.length);
  assert.ok(warnings.some(w => /unreadable/.test(w)) && warnings.some(w => /not saved/.test(w)));
});

test('each price knows how it moved since yesterday, and a restart within the day keeps the same yardstick', async () => {
  const time = clock(Date.parse('2026-11-10T08:00:00Z')); // 15:00 Vietnam, 10 Nov
  let extra = 5000;
  const prices = createGroceryPrices({ now: time.now, delayMs: 0, fetchers: { winmart: k => fakeStore(extra)(k) } });
  const cell = data => data.items.find(i => i.id === 'ca-rot').perStore.winmart;
  const day1 = await prices.getPrices();
  assert.equal(day1.baseline.prices, null, 'no yesterday on the very first run');
  assert.equal(cell(day1).change, undefined);

  time.advance(24 * 3600_000); extra = 4000; // 11 Nov
  const day2 = await prices.getPrices({ force: true });
  assert.equal(day2.baseline.day, '2026-11-11');
  assert.equal(cell(day2).change, -1000, 'cheaper than yesterday');

  time.advance(3 * 3600_000); extra = 3000; // later on 11 Nov, e.g. after a restart
  const later = await prices.getPrices({ force: true });
  assert.equal(later.baseline.day, '2026-11-11');
  assert.equal(cell(later).change, -2000, 'still measured against 10 Nov, not against this morning');
  assert.equal(later.items.find(i => i.id === 'ca-rot').perStore.bhx, undefined, 'only live stores get an arrow');
});

test('ready-made carts only name real catalog items, and deals, drops and share links behave', () => {
  const { PRESETS, presetIds, topDeals, priceDrops, cartQuery, cartFromQuery, compareCart } = require('../public/tea/prices-cart');
  const ids = CATALOG.map(i => i.id);
  for (const preset of PRESETS) {
    assert.ok(preset.ids.length >= 5, preset.id);
    for (const id of preset.ids) assert.ok(ids.includes(id), `${preset.id} names ${id}, which is not in the catalog`);
  }
  assert.deepEqual(presetIds({ items: [{ id: 'gao' }] }, PRESETS[0]), ['gao'], 'missing items are skipped');

  const cell = (unitPrice, extra = {}) => ({ status: 'ok', unitPrice, price: unitPrice, ...extra });
  const data = {
    stores: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'r', name: 'Ref', referenceOnly: true }],
    items: [
      { id: 'egg', name: 'Trứng', perStore: { a: cell(3000, { price: 27000, listPrice: 33000, image: 'https://x/e.jpg', change: -600 }), b: cell(3500, { price: 35000, listPrice: 36000, change: 100 }), r: cell(100, { price: 100, listPrice: 1000, change: -50 }) } },
      { id: 'milk', name: 'Sữa', perStore: { a: cell(40000, { price: 40000, listPrice: 40000 }), b: cell(38000, { price: 38000, listPrice: 50000, change: -9000 }), r: { status: 'error' } } },
      { id: 'salt', name: 'Muối', perStore: { a: { ...cell(9000, { price: 9000, listPrice: 20000 }), stale: true }, b: { status: 'not_found' }, r: { status: 'error' } } },
    ],
  };
  const deals = topDeals(data);
  assert.deepEqual(deals.map(d => [d.item.id, d.store.id, d.percent]), [['egg', 'a', 18], ['milk', 'b', 24]], 'photos first, reference and stale prices never count, tiny markdowns are dropped');
  const drops = priceDrops(data);
  assert.deepEqual(drops.map(d => [d.item.id, d.store.id, d.percent]), [['milk', 'b', 19], ['egg', 'a', 17]], 'biggest percentage first; a rise or a reference store is ignored');
  assert.equal(drops[0].before, 47000);

  assert.equal(cartQuery(['gao', 'trung-ga']), 'gio=gao,trung-ga');
  assert.deepEqual(cartFromQuery('?gio=gao,trung-ga,../x,<b>,gao', ids), ['gao', 'trung-ga'], 'unknown, unsafe and duplicate ids are dropped');
  assert.deepEqual(cartFromQuery('', ids), []);
  assert.equal(compareCart(data, ['egg'], ['a', 'b']).best.store.id, 'a');
});

test('/gia is a standalone page with link-preview tags that state today\'s answer, and /so-sanh-gia redirects to it', async () => {
  const http = require('node:http');
  const { PRESETS } = require('../public/tea/prices-cart');
  const cell = unitPrice => ({ status: 'ok', unitPrice, price: unitPrice });
  const items = PRESETS[0].ids.map(id => ({ id, name: id, perStore: { a: cell(2000), b: cell(3000) } }));
  const snapshot = { checkedAt: '2026-11-11T01:00:00Z', stores: [{ id: 'a', name: 'Siêu thị "A" <x>' }, { id: 'b', name: 'B' }], items };
  const app = express(); app.use(createTeaRouter({ service: {}, isAdmin: () => false, groceryPrices: { current: () => snapshot } }));
  const bare = express(); bare.use(createTeaRouter({ service: {}, isAdmin: () => false }));
  const listen = application => new Promise(resolve => { const listener = application.listen(0, '127.0.0.1', () => resolve(listener)); });
  const get = (port, pathname, host) => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: pathname, headers: host ? { Host: host } : {} }, res => { let body = ''; res.setEncoding('utf8'); res.on('data', d => body += d); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body })); }).on('error', reject));
  const [server, plain] = [await listen(app), await listen(bare)];
  try {
    const page = await get(server.address().port, '/gia');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /text\/html/);
    assert.match(page.headers['content-security-policy'], /script-src 'self'/);
    assert.match(page.body, /<main id="prices-view"/);
    assert.match(page.body, /property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/assets\/tea\/og-prices\.png"/);
    assert.match(page.body, /Hôm nay giỏ cơ bản 10 món rẻ nhất ở Siêu thị &quot;A&quot; &lt;x&gt;: 20\.000đ/, 'the headline is in the preview, escaped');
    assert.doesNotMatch(page.body, /<!--PREVIEW-->/);
    assert.match(page.body, /giá đồng bộ lúc 08:00 11\/11\/2026/, 'the preview says when prices were synced, in Vietnam time');

    const spoof = await get(server.address().port, '/gia', 'evil.example"><script>alert(1)</script>');
    assert.doesNotMatch(spoof.body, /<script>alert\(1\)/, 'a hostile Host header cannot inject markup');

    const generic = await get(plain.address().port, '/gia');
    assert.match(generic.body, /So giá 70 món/, 'before any prices exist the preview is generic');

    const moved = await get(server.address().port, '/so-sanh-gia?gio=gao,trung-ga');
    assert.equal(moved.status, 302);
    assert.equal(moved.headers.location, '/gia?gio=gao,trung-ga');
  } finally { await Promise.all([server, plain].map(s => new Promise(resolve => s.close(resolve)))); }
});

test('the headline basket only counts items every live store has, so totals are like for like', () => {
  const { commonCart } = require('../public/tea/prices-cart');
  const ok = unitPrice => ({ status: 'ok', unitPrice, price: unitPrice });
  const data = {
    stores: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'r', name: 'Ref', referenceOnly: true }],
    items: [
      { id: 'x', name: 'X', perStore: { a: ok(10), b: ok(30), r: { status: 'error' } } },
      { id: 'y', name: 'Y', perStore: { a: ok(10), b: ok(20), r: ok(1) } },
      { id: 'z', name: 'Z', perStore: { a: ok(5), b: { status: 'not_found' }, r: ok(1) } },
    ],
  };
  const result = commonCart(data, ['x', 'y', 'z'], ['a', 'b', 'r']);
  assert.deepEqual(result.items.map(i => i.id), ['x', 'y'], 'z is missing at B, so it is left out for everyone');
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.rows.map(r => [r.store.id, r.total]), [['a', 20], ['b', 50]], 'the reference store is not part of it');
  assert.equal(result.best.store.id, 'a');
});

// ---- load protection: photo cache and per-snapshot prepared responses ----
const imageResponse = (bytes = 10, type = 'image/jpeg', extra = {}) => new Response(Buffer.alloc(bytes, 1), { headers: { 'content-type': type, ...extra } });
const instantResize = async body => ({ body: body.subarray(0, 3), type: 'image/webp' });

test('photo cache: equal requests share one download, later ones come from memory, and it expires', async () => {
  const { createImageCache } = require('../features/tea/price-images');
  const time = clock(1_000_000); let downloads = 0;
  const cache = createImageCache({ fetchImage: async () => { downloads += 1; await new Promise(r => setTimeout(r, 5)); return imageResponse(); }, resize: instantResize, now: time.now, ttlMs: 1000 });
  const results = await Promise.all(Array.from({ length: 8 }, () => cache.get('https://img.example/a.jpg')));
  assert.equal(downloads, 1, 'a crowd arriving together costs one download');
  assert.ok(results.every(r => r && r.type === 'image/webp' && r.body.length === 3 && /^"/.test(r.etag)));
  await cache.get('https://img.example/a.jpg');
  assert.equal(downloads, 1, 'now served from memory');
  time.advance(1500);
  await cache.get('https://img.example/a.jpg');
  assert.equal(downloads, 2, 'refetched after the lifetime ends');
});

test('photo cache: limits parallel work, remembers failures, evicts the least recently used, and rejects non-images', async () => {
  const { createImageCache } = require('../features/tea/price-images');
  let running = 0, peak = 0;
  const slow = createImageCache({ fetchImage: async () => imageResponse(), resize: async body => { running += 1; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 10)); running -= 1; return { body, type: 'image/webp' }; }, concurrency: 2 });
  await Promise.all(Array.from({ length: 7 }, (_, i) => slow.get(`https://img.example/${i}.jpg`)));
  assert.equal(peak, 2, 'never more than two at once');

  const time = clock(5_000_000); let calls = 0, fail = true;
  const flaky = createImageCache({ fetchImage: async () => { calls += 1; if (fail) throw new Error('down'); return imageResponse(); }, resize: instantResize, now: time.now, failTtlMs: 60_000 });
  assert.equal(await flaky.get('https://img.example/x.jpg'), null);
  assert.equal(await flaky.get('https://img.example/x.jpg'), null);
  assert.equal(calls, 1, 'a failure is not retried on every page view');
  fail = false; time.advance(61_000);
  assert.ok(await flaky.get('https://img.example/x.jpg'), 'retried after the pause');

  const fetched = []; const small = createImageCache({ fetchImage: async url => { fetched.push(url); return imageResponse(); }, resize: instantResize, maxEntries: 2 });
  await small.get('a'); await small.get('b'); await small.get('a'); await small.get('c'); // b is now the least recently used
  await small.get('a'); await small.get('b');
  assert.deepEqual(fetched, ['a', 'b', 'c', 'b'], 'a and c stayed, b was evicted and fetched again');
  assert.ok(small.stats().entries <= 2);

  const picky = createImageCache({ fetchImage: async url => url.includes('html') ? imageResponse(10, 'text/html') : imageResponse(10, 'image/png', { 'content-length': '99000000' }), resize: instantResize });
  assert.equal(await picky.get('https://x/page.html'), null, 'not an image');
  assert.equal(await picky.get('https://x/huge.png'), null, 'declared far too large');
});

test('photo cache: when shrinking fails a small original is served as is, a big one is refused', async () => {
  const { createImageCache } = require('../features/tea/price-images');
  const broken = async () => { throw new Error('corrupt'); };
  const small = createImageCache({ fetchImage: async () => imageResponse(1000, 'image/png'), resize: broken });
  assert.equal((await small.get('https://x/s.png')).type, 'image/png');
  const big = createImageCache({ fetchImage: async () => imageResponse(300_000, 'image/png'), resize: broken });
  assert.equal(await big.get('https://x/b.png'), null);
  const { shrink } = require('../features/tea/price-images');
  const sharp = require('sharp');
  const original = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#cc3322' } }).png().toBuffer();
  const thumb = await shrink(original);
  assert.equal(thumb.type, 'image/webp');
  assert.ok(thumb.body.length < original.length / 5 && thumb.body.length < 5000, 'a thumbnail is a few KB');
});

test('price endpoints serve a prepared response: ETag/304, no bookkeeping fields, photos fetched once, CSV reused', async () => {
  const http = require('node:http');
  const photo = 'https://img.example/p.jpg';
  const prices = createGroceryPrices({ delayMs: 0, fetchers: { winmart: async k => (await fakeStore(0)(k)).map(p => ({ ...p, image: photo })) } });
  await prices.getPrices();
  let downloads = 0;
  const app = express(); app.use(createTeaRouter({ service: {}, isAdmin: () => false, groceryPrices: prices, imageFetch: async () => { downloads += 1; return imageResponse(20, 'image/png'); }, imageResize: async b => ({ body: b.subarray(0, 4), type: 'image/webp' }) }));
  const server = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const raw = (pathname, headers = {}) => new Promise((resolve, reject) => http.get(`${base}${pathname}`, { headers }, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })); }).on('error', reject));
  try {
    const first = await raw('/api/tea/prices');
    assert.equal(first.status, 200);
    assert.match(first.headers['cache-control'], /public, max-age=30/);
    const json = JSON.parse(first.body);
    for (const field of ['baseline', 'catalogKey', 'hasErrors']) assert.equal(field in json, false, `${field} stays on the server`);
    assert.equal(json.items.length, CATALOG.length);
    const again = await raw('/api/tea/prices');
    assert.equal(again.headers.etag, first.headers.etag, 'same snapshot, same ETag');
    assert.deepEqual(again.body, first.body);
    const revalidated = await raw('/api/tea/prices', { 'If-None-Match': first.headers.etag });
    assert.equal(revalidated.status, 304);
    assert.equal(revalidated.body.length, 0);

    const csv = await raw('/api/tea/prices.csv'), csv2 = await raw('/api/tea/prices.csv');
    assert.equal(csv.status, 200);
    assert.deepEqual(csv.body, csv2.body);

    const url = `/api/tea/prices/img?u=${encodeURIComponent(photo)}`;
    const img1 = await raw(url), img2 = await raw(url);
    assert.equal(img1.status, 200);
    assert.equal(img1.headers['content-type'], 'image/webp');
    assert.match(img1.headers['cache-control'], /max-age=86400, immutable/);
    assert.equal(img1.body.length, 4);
    assert.equal(downloads, 1, 'the second visitor never reaches the supermarket');
    assert.equal((await raw(url, { 'If-None-Match': img1.headers.etag })).status, 304);
    assert.equal((await raw(`/api/tea/prices/img?u=${encodeURIComponent('https://other.example/x.jpg')}`)).status, 404);
    assert.equal((await raw(`/api/tea/prices/img?u=${'a'.repeat(700)}`)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }

  const empty = express(); empty.use(createTeaRouter({ service: {}, isAdmin: () => false, groceryPrices: { current: () => null } }));
  const waiting = await new Promise(resolve => { const l = empty.listen(0, '127.0.0.1', () => resolve(l)); });
  try {
    const res = await new Promise(resolve => http.get(`http://127.0.0.1:${waiting.address().port}/api/tea/prices`, r => { r.resume(); r.on('end', () => resolve(r)); }));
    assert.equal(res.statusCode, 202);
    assert.equal(res.headers['retry-after'], '5');
  } finally { await new Promise(resolve => waiting.close(resolve)); }
});
