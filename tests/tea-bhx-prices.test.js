const test = require('node:test');
const assert = require('node:assert/strict');
const sample = require('../features/tea/snapshots/bhx-public.json');
const { validateSnapshot, vnd, sourceUrl, comparableProducts, readBhxSnapshot } = require('../features/tea/bhx-prices');
const { createGroceryPrices, pickBest, CATALOG, toCsv } = require('../features/tea/grocery-prices');
const stamp = Date.parse(sample.capturedAt);
const raw = () => structuredClone(sample);
const fake = async () => [{ name: 'Trứng gà 10 quả', price: 30000, inStock: true, url: 'https://winmart.vn/products/test' }];
const fetchers = { winmart: fake, coop: fake };
const loader = now => validateSnapshot(sample, now);

test('real browser capture has 59 unique public products and does not assert a delivery region', async () => {
  const data = await readBhxSnapshot(stamp);
  assert.equal(data.products.length, 59);
  assert.equal(data.regionVerified, false);
  assert.equal(data.regionLabel, null);
  assert.equal(data.stale, false);
  assert.equal(data.products.find(p => p.id === '230451').price, 5600);
});
test('VND parsing rejects ranges, installment prices, zero, negatives and foreign formats', () => {
  assert.equal(vnd('21.713đ'), 21713);
  for (const bad of ['21,713đ', '0đ', '-10đ', '1.00đ', '5.000đ/kg', 'Từ 5.000đ', 'NaN', 5000]) assert.throws(() => vnd(bad));
});
test('normalization uses displayed pack, never the 1kg/500g slug', () => {
  const products = comparableProducts(loader(stamp).products);
  const cucumber = pickBest(CATALOG.find(i => i.id === 'dua-leo'), products);
  assert.equal(cucumber.size, '200g');
  assert.equal(cucumber.unitPrice, 28000);
  const carrot = pickBest(CATALOG.find(i => i.id === 'ca-rot'), products);
  assert.equal(carrot.size, '250g');
  assert.equal(carrot.unitPrice, 40200);
  const fish = pickBest(CATALOG.find(i => i.id === 'ca-basa'), products);
  assert.match(fish.name, /phi lê/);
  assert.equal(fish.unitPrice, 130000, 'cut fish must not replace fillets');
  assert.ok(!products.some(p => p.id === '358218' || p.id === '309143'), 'ambiguous gift and multi-box counts excluded');
});
test('snapshot rejects invalid origin, duplicate IDs, empty data and invalid capture dates', () => {
  for (const value of ['//evil.com/p', '/path?q=token', 'https://evil.com/', '/../../evil']) assert.throws(() => sourceUrl(value));
  for (const mutate of [r => { r.rows.push(r.rows[0]); }, r => { r.rows=[]; }, r => { r.rows[0][3]='NaN'; }, r => { r.capturedAt='bad'; }, r => { r.capturedAt=new Date(stamp+3600000).toISOString(); }, r => { r.regionVerified=true; }, r => { r.rows[0][7]='true'; }]) {
    const input = raw(); mutate(input); assert.throws(() => validateSnapshot(input, stamp));
  }
});
test('unverified BHX is shown as reference without shrinking the other stores basket', async () => {
  const prices = createGroceryPrices({ fetchers, bhxLoader: loader, now: () => stamp, delayMs: 0 });
  const data = await prices.getPrices();
  assert.equal(data.stores.length, 3);
  const bhx = data.stores.find(s => s.id === 'bhx');
  assert.equal(bhx.referenceOnly, true);
  assert.equal(bhx.checkedAt, sample.capturedAt);
  assert.equal(data.basket.count, 1);
  assert.deepEqual(data.basket.storeIds, ['winmart', 'coop']);
  assert.equal(data.items[0].perStore.bhx.price, 27000);
  assert.match(toCsv(data), /Chưa xác minh TP.HCM/);
});
test('verified fresh captures participate in a three-store basket, and expire on time', async () => {
  const input = raw(); input.regionVerified = true; input.regionLabel = 'TP.HCM';
  let now = stamp;
  const prices = createGroceryPrices({ fetchers, bhxLoader: n => validateSnapshot(input, n), now: () => now, delayMs: 0 });
  const fresh = await prices.getPrices();
  assert.deepEqual(fresh.basket.storeIds, ['winmart','coop','bhx']);
  assert.equal(fresh.basket.totals.bhx, 2700);
  now += 86400_000;
  const old = await prices.getPrices();
  assert.equal(old.items[0].perStore.bhx.stale, true);
  assert.equal(old.stores[2].checkedAt, sample.capturedAt, 'reading a file is not a fresh crawl');
  assert.deepEqual(old.basket.storeIds, ['winmart','coop']);
  now = stamp + 7*86400_000;
  const expired = await prices.getPrices();
  assert.equal(expired.items[0].perStore.bhx.status, 'error');
  assert.equal(expired.items[0].perStore.bhx.price, undefined);
});
test('missing or broken capture does not fail the entire board or retry a blocked website', async () => {
  let loads = 0;
  const prices = createGroceryPrices({ fetchers, bhxLoader: async () => { loads++; throw new Error('bad file'); }, delayMs: 0 });
  const data = await prices.getPrices();
  assert.equal(loads, 1);
  assert.equal(data.items[0].perStore.winmart.status, 'ok');
  assert.equal(data.items[0].perStore.bhx.status, 'error');
  assert.equal(data.stores[2].checkedAt, null);
  assert.equal(data.hasErrors, false, 'manual source failure does not repeatedly hit the live stores');
});
