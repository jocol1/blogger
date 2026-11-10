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
    assert.deepEqual(a, { name: 'Sữa tươi Nuti hộp 1L', uom: 'Hộp', price: 33500, listPrice: 36000, inStock: true, url: 'https://kingfoodmart.com/search?keyword=S%E1%BB%AFa%20t%C6%B0%C6%A1i%20Nuti%20h%E1%BB%99p%201L' });
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
    assert.deepEqual(a, { name: 'Sữa Tươi Devondale Nguyên Kem 1L', uom: '', price: 49900, listPrice: 70500, inStock: true, url: 'https://www.lottemart.vn/vi-nsg/product/sua-tuoi-devondale-1l' });
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
