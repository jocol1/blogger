const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBhxCollector, rowFromPage, vndText } = require('../features/tea/bhx-collector');
const { validateSnapshot, DEFAULT_FILE } = require('../features/tea/bhx-prices');

const BASE = 'https://www.bachhoaxanh.com';
const page = ({ name, price, lowPrice = price, stock = 'InStock', id = '275804', cat = '8781' }) => `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Bách Hoá Xanh"}</script>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name, image: `https://cdnv2.tgdd.vn/bhx-static/bhx/Products/Images/${cat}/${id}/x.jpg`, offers: { '@type': 'AggregateOffer', availability: `https://schema.org/${stock}`, price: `${price}.00`, lowPrice: `${lowPrice}.00`, priceCurrency: 'VND' } })}</script>
</head><body></body></html>`;
const sitemap = urls => `<?xml version="1.0"?><urlset>${urls.map(u => `<url><loc>${u}</loc><lastmod>2026-11-10</lastmod></url>`).join('')}</urlset>`;

test('a product page becomes one snapshot row: selling price, list price, stock, id, clean title, pack from the title', () => {
  const row = rowFromPage(page({ name: 'Ba rọi heo nhập khẩu 400g giá tốt tại Bách hóa XANH', price: 56400, lowPrice: 47600 }), `${BASE}/thit-heo/ba-roi-heo-nhap-khau`, '/sitemapnew/sitemap-product-8781-1');
  assert.deepEqual(row, ['275804', 'Ba rọi heo nhập khẩu 400g', '400g', '47.600đ', '56.400đ', '/thit-heo/ba-roi-heo-nhap-khau', '/sitemapnew/sitemap-product-8781-1', true]);
  assert.equal(rowFromPage(page({ name: 'Muối 1kg tại Bách hoá XANH', price: 10000 }), `${BASE}/muoi-an/muoi`, '/s')[1], 'Muối 1kg', 'both spellings of hóa/hoá are trimmed');
  const noPack = rowFromPage(page({ name: 'Ba rọi rút sườn heo nhập khẩu', price: 56400, stock: 'OutOfStock' }), `${BASE}/thit-heo/ba-roi-heo-300g`, '/s');
  assert.equal(noPack[2], '', 'the slug size is never used as the pack');
  assert.equal(noPack[4], '', 'no list price when nothing is discounted');
  assert.equal(noPack[7], false);
  assert.equal(rowFromPage('<html>no structured data</html>', `${BASE}/x/y`, '/s'), null);
  assert.equal(vndText(1234567), '1.234.567đ');
});

function fakeSite(extra = {}) {
  const pages = {
    '/sitemapnew/sitemap-product': sitemap([`${BASE}/sitemapnew/sitemap-product-2804-1`, `${BASE}/sitemapnew/sitemap-product-9999-1`]),
    '/sitemapnew/sitemap-product-2804-1': sitemap([`${BASE}/duong/duong-kinh-trang-an-khe-1kg`, `${BASE}/duong/5-goi-duong-kinh-trang-an-khe-1kg`, `${BASE}/duong/duong-phen-500g`, `${BASE}/banh-quy/banh-duong`]),
    '/duong/duong-kinh-trang-an-khe-1kg': page({ name: 'Đường kính trắng An Khê 1kg tại Bách hoá XANH', price: 27000, id: '230451', cat: '2804' }),
    ...extra,
  };
  const requested = [];
  return { requested, get: async url => { const p = new URL(url).pathname; requested.push(p); if (!(p in pages)) throw new Error(`HTTP 404 ${p}`); return pages[p]; } };
}

test('collect reads only the sitemaps and product pages it needs, skips bundles, and writes a valid unverified snapshot', async () => {
  const site = fakeSite();
  const collector = createBhxCollector({ get: site.get, delayMs: 0, now: () => Date.parse('2026-11-10T01:00:00Z'), log: {} });
  const raw = await collector.collect();
  assert.equal(raw.regionVerified, false, 'the default store region is not shown on the page, so it is not claimed');
  assert.equal(raw.capturedAt, '2026-11-10T01:00:00.000Z');
  assert.deepEqual(raw.rows.map(r => r[0]), ['230451']);
  assert.ok(!site.requested.includes('/duong/5-goi-duong-kinh-trang-an-khe-1kg'), 'multi-packs are not even fetched');
  assert.ok(!site.requested.includes('/duong/duong-phen-500g'), 'filtered by slug before fetching');
  assert.ok(!site.requested.includes('/sitemapnew/sitemap-product-9999-1'), 'unrelated sitemaps are not fetched');
  assert.ok(!site.requested.some(p => p.startsWith('/tim-kiem')), 'search pages (disallowed in robots.txt) are never used');
  const snap = validateSnapshot(raw, Date.parse('2026-11-10T01:00:00Z'));
  assert.equal(snap.products[0].price, 27000);
});

test('loader collects once a day, installs the file atomically, and falls back to the bundled capture when BHX fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bhx-'));
  const file = path.join(dir, 'bhx.json');
  let clock = Date.parse('2026-11-10T01:00:00Z');
  const site = fakeSite();
  const ok = createBhxCollector({ get: site.get, delayMs: 0, now: () => clock, file, log: {} });
  const first = await ok.loader(clock);
  assert.equal(first.products.length, 1);
  assert.ok(fs.existsSync(file));
  const calls = site.requested.length;
  clock += 3600_000;
  await ok.loader(clock);
  assert.equal(site.requested.length, calls, 'an hour later it only reads the file');
  clock += 20 * 3600_000;
  await ok.loader(clock);
  assert.ok(site.requested.length > calls, 'the next morning it collects again');

  let failures = 0;
  const broken = createBhxCollector({ get: async () => { failures++; throw new Error('HTTP 403'); }, delayMs: 0, now: () => clock, file: path.join(dir, 'missing.json'), log: {} });
  const fallback = await broken.loader(Date.parse(require(DEFAULT_FILE).capturedAt));
  assert.equal(fallback.products.length, require(DEFAULT_FILE).rows.length, 'bundled browser capture is used');
  await broken.loader(Date.parse(require(DEFAULT_FILE).capturedAt));
  assert.equal(failures, 1, 'a refused request is not retried until the next day');
  fs.rmSync(dir, { recursive: true, force: true });
});
