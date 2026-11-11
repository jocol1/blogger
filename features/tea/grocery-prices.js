'use strict';
/* Supermarket price board: WinMart and Co.op Online, both through the public JSON endpoints their own sites use.
 * Prices are the online prices of each site's default store, not shelf prices. */

const { CATALOG, GROUPS, DEFAULT_SIZE } = require('./grocery-catalog');
const { readBhxSnapshot, comparableProducts } = require('./bhx-prices');

const STORES = [
  { id: 'winmart', name: 'WinMart' },
  { id: 'coop', name: 'Co.op Online' },
  { id: 'kingfood', name: 'Kingfoodmart' },
  { id: 'lotte', name: 'LOTTE Mart' },
];


const UNIT_LABEL = { kg: 'kg', l: 'lít', qua: 'quả', cuon: 'cuộn' };
const NUMBER = '(\\d+(?:[.,]\\d+)?)';
const MEASURE = '(kg|g|ml|lít|lit|l)(?![a-zà-ỹ])';
const toNumber = text => Number(String(text).replace(',', '.'));
function measureToBase(value, unit) {
  if (unit === 'kg' || unit === 'l' || unit === 'lít' || unit === 'lit') return { amount: value, base: unit === 'kg' ? 'kg' : 'l' };
  return { amount: value / 1000, base: unit === 'g' ? 'kg' : 'l' };
}

/** Reads pack size from a product name. Returns { qty, label } in the item's unit, or null when it cannot tell. */
function parseSize(name, uom, unit) {
  const text = String(name || '').toLowerCase().replace(/\s+/g, ' ');
  const uomText = String(uom || '').toLowerCase();
  if (unit === 'cai') { // one branded pack; the label is just the size printed on it
    const printed = text.match(new RegExp(`${NUMBER}\\s*${MEASURE}`));
    return { qty: 1, label: printed ? `${printed[1]}${printed[2]}` : '' };
  }
  if (unit === 'qua' || unit === 'cuon') {
    const count = text.match(unit === 'qua' ? /(\d+)\s*(?:quả|trứng|t(?=\s*x)|t\b)/ : /(\d+)\s*cuộn/);
    if (count && Number(count[1]) > 0) return { qty: Number(count[1]), label: `${count[1]} ${UNIT_LABEL[unit]}` };
    return null;
  }
  const base = unit === 'kg' ? 'kg' : 'l';
  const multi = text.match(new RegExp(`(\\d+)\\s*[x×]\\s*${NUMBER}\\s*${MEASURE}`));
  if (multi) {
    const one = measureToBase(toNumber(multi[2]), multi[3]);
    if (one.base === base) return { qty: Number(multi[1]) * one.amount, label: `${multi[1]}×${multi[2]}${multi[3]}` };
  }
  const single = [...text.matchAll(new RegExp(`${NUMBER}\\s*${MEASURE}`, 'g'))].map(m => ({ ...measureToBase(toNumber(m[1]), m[2]), label: `${m[1]}${m[2]}` })).filter(m => m.base === base && m.amount > 0);
  if (single.length) return { qty: single[0].amount, label: single[0].label };
  // WinMart sells loose goods per "1 KG" or per pack such as "0.5KG"; Co.op uses plain "Kg".
  const perUom = base === 'kg' && uomText.match(/^(?:(\d+(?:[.,]\d+)?)\s*)?kg$/);
  if (perUom) { const qty = perUom[1] ? toNumber(perUom[1]) : 1; if (qty > 0) return { qty, label: `${qty}kg` }; }
  return null;
}

/** Cheapest in-stock match per standard unit. status: ok | out_of_stock | not_found. */
function pickBest(item, products) {
  const matches = products.filter(p => {
    const text = String(p.name || '').toLowerCase();
    return item.must.every(re => re.test(text)) && !item.not.some(re => re.test(text)) && Number(p.price) > 0;
  });
  if (!matches.length) return { status: 'not_found' };
  const [lo, hi] = item.size || DEFAULT_SIZE[item.unit];
  const sized = matches.map(p => ({ p, size: parseSize(p.name, p.uom, item.unit) })).filter(x => x.size && x.size.qty >= lo - 1e-9 && x.size.qty <= hi + 1e-9);
  if (!sized.length) return { status: 'not_found' };
  const inStock = sized.filter(x => x.p.inStock);
  if (!inStock.length) return { status: 'out_of_stock', name: sized[0].p.name, url: sized[0].p.url };
  const best = inStock.map(x => ({ ...x, unitPrice: x.p.price / x.size.qty })).sort((a, b) => a.unitPrice - b.unitPrice)[0];
  return { status: 'ok', name: best.p.name, price: best.p.price, listPrice: best.p.listPrice > best.p.price ? best.p.listPrice : null, size: best.size.label, unitPrice: Math.round(best.unitPrice), image: /^https:\/\//.test(best.p.image || '') ? best.p.image : undefined, url: best.p.url };
}

// ---- real fetchers ----
const MAX_BODY = 3_000_000;
async function postJsonOnce(url, headers, body) {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(7000), headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'LoclyTeaPriceBoard/1.0', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get('content-length') || 0) > MAX_BODY) throw new Error('Response too large');
  const text = await response.text();
  if (text.length > MAX_BODY) throw new Error('Response too large');
  return JSON.parse(text);
}
// A supermarket sometimes stalls a request; one quick retry is cheaper than showing "error" for a day.
async function postJson(url, headers, body, retries = 1) {
  for (let attempt = 0; ; attempt++) {
    try { return await postJsonOnce(url, headers, body); } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

async function fetchWinmart(keyword) {
  const json = await postJson('https://api-crownx.winmart.vn/ss/api/v2/public/winmart/item-search', { 'x-api-merchant': 'WCM' }, { keyword, pageNumber: 1, pageSize: 20, storeNo: '1535', storeGroupCode: '1998', applicationType: 'Winmart' });
  return (Array.isArray(json.data) ? json.data : []).map(p => ({
    name: p.description, uom: p.uomName, price: Number(p.price?.salePrice ?? 0), listPrice: Number(p.price?.originPrice ?? 0),
    inStock: Number(p.warehouse?.availableQuantity ?? 0) > 0, url: p.seoName ? `https://winmart.vn/products/${p.seoName}` : 'https://winmart.vn', image: p.image || undefined,
  }));
}

async function fetchCoop(keyword) {
  const json = await postJson('https://discovery.tekoapis.com/api/v2/search-skus-v2', {}, { terminalId: 26607, page: 1, pageSize: 20, query: keyword, filter: {}, sorting: { sort: 'SORT_BY_UNSPECIFIED', order: 'ORDER_BY_UNSPECIFIED' }, returnFilterable: [] });
  return (Array.isArray(json.data?.products) ? json.data.products : []).map(p => ({
    name: p.name, uom: p.uomName, price: Number(p.latestPrice ?? 0), listPrice: Number(p.supplierRetailPrice ?? 0),
    inStock: p.sellable !== false && Number(p.totalAvailable ?? 0) > 0, url: p.canonical ? `https://cooponline.vn/${p.canonical}` : 'https://cooponline.vn', image: p.imageUrl ? (p.imageUrl.includes('=') ? p.imageUrl : `${p.imageUrl}=w160`) : undefined,
  }));
}

// Kingfoodmart's own web app search (robots.txt allows product pages); the tenant header is how its API picks the shop.
async function fetchKingfood(keyword) {
  const json = await postJson(`https://onelife-api.kingfoodmart.com/v1/products/search?type=NORMAL&keyword=${encodeURIComponent(keyword)}&page=1&limit=30`, { 'x-ol-tenant': 'kingfood' });
  return (Array.isArray(json.products) ? json.products : []).map(p => ({
    name: p.name, uom: p.variants?.[0]?.unit?.name || '', price: Number(p.discountPrice || p.originalPrice || 0), listPrice: Number(p.originalPrice ?? 0),
    // shortcut: search results carry no product-page path, so link to the shop's search for that name; upgrade if the API exposes one.
    inStock: Number(p.inStock ?? 0) > 0, url: `https://kingfoodmart.com/search?keyword=${encodeURIComponent(p.name || keyword)}`, image: p.thumbnail || p.images?.[0] || undefined,
  }));
}

// LOTTE Mart's own web search (empty robots.txt), store "nsg" = Nam Sài Gòn. price.VND.default is today's selling price.
async function fetchLotte(keyword) {
  const json = await postJson('https://www.lottemart.vn/v1/p/mart/es/vi_nsg/products/search', {}, { limit: 30, offset: 1, facet_filters: {}, fields: ['name', 'price', 'url_key', 'in_stock', 'stock_qty', 'image_url'], where: { query: keyword } });
  return (Array.isArray(json.data?.items) ? json.data.items : []).map(p => ({
    name: p.name, uom: '', price: Number(p.price?.VND?.default ?? 0), listPrice: Number(p.price?.VND?.price ?? 0),
    inStock: Number(p.in_stock) === 1 && Number(p.stock_qty ?? 1) > 0, url: p.url_key ? `https://www.lottemart.vn/vi-nsg/product/${encodeURIComponent(p.url_key)}` : 'https://www.lottemart.vn', image: p.image_url || undefined,
  }));
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const HOUR = 3600_000;
/** Next occurrence of `hour`:00 in a fixed-offset zone (Vietnam is UTC+7, no daylight saving), as epoch ms. */
function nextRefreshAt(nowMs, { hour = 8, offsetHours = 7 } = {}) {
  const local = new Date(nowMs + offsetHours * HOUR);
  let target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour);
  if (target <= local.getTime()) target += 24 * HOUR;
  return target - offsetHours * HOUR;
}

/** Calendar day in Vietnam (UTC+7) as YYYY-MM-DD; the price "yesterday" comparison is per local day. */
const dayKey = (ms, offsetHours = 7) => new Date(ms + offsetHours * HOUR).toISOString().slice(0, 10);
const catalogKey = () => CATALOG.map(i => i.id).join(',');
const unitPrices = data => Object.fromEntries(data.items.map(i => [i.id, Object.fromEntries(Object.entries(i.perStore).filter(([, c]) => c.status === 'ok' && !c.stale && Number.isFinite(c.unitPrice)).map(([id, c]) => [id, c.unitPrice]))]));

/** Keeps the latest snapshot in Firestore (one document, as a JSON string so undefined fields are never an issue),
 *  so a restarted server answers at once instead of rebuilding for minutes. */
function firestorePriceStore(db, { collection = 'tea_prices', id = 'latest' } = {}) {
  const ref = () => db.collection(collection).doc(id);
  return {
    async load() { const snap = await ref().get(); if (!snap.exists) return null; const saved = JSON.parse(snap.data().json); return Array.isArray(saved?.items) && Array.isArray(saved?.stores) && saved.checkedAt ? saved : null; },
    async save(data) { await ref().set({ json: JSON.stringify(data), savedAt: data.checkedAt }); },
  };
}

const DEFAULT_FETCHERS = { winmart: fetchWinmart, coop: fetchCoop, kingfood: fetchKingfood, lotte: fetchLotte };
function createGroceryPrices({ fetchers = DEFAULT_FETCHERS, bhxLoader = fetchers === DEFAULT_FETCHERS ? readBhxSnapshot : null, now = () => Date.now(), dailyAt = { hour: 8, offsetHours: 7 }, setTimer = setTimeout, retryMs = 5 * 60_000, delayMs = 300, concurrency = 3, storeDeadlineMs = 150_000, maxFailureStreak = 6, store = null, log = console } = {}) {
  let cache = null, inflight = null, timer = null;

  // Each supermarket is queried by a few lookups at a time (polite, like a browser). A shop that stops answering cannot
  // hold the board hostage: after `maxFailureStreak` failures in a row, or `storeDeadlineMs`, the rest of its items fall
  // back to yesterday's prices (marked old) and the other shops carry on.
  async function buildShop(shop, previous) {
    const cells = {}, started = now(); let next = 0, streak = 0, gaveUp = false;
    const fallback = item => {
      shop.errors += 1;
      const old = previous?.items.find(i => i.id === item.id)?.perStore[shop.id];
      return old && old.status !== 'error' && old.status !== 'pending' ? { ...old, stale: true } : { status: 'error' };
    };
    async function lookup(item) {
      const products = [], seen = new Set(); let failures = 0;
      const keywords = [].concat(item.keyword);
      for (const keyword of keywords) {
        try { for (const p of await fetchers[shop.id](keyword)) if (!seen.has(p.url)) { seen.add(p.url); products.push(p); } } catch (error) { failures += 1; }
        if (delayMs) await sleep(delayMs);
      }
      if (failures === keywords.length) throw new Error('all searches failed');
      return { ...pickBest(item, products), checkedAt: new Date(now()).toISOString() };
    }
    async function worker() {
      while (next < CATALOG.length) {
        const item = CATALOG[next++];
        if (gaveUp || now() - started > storeDeadlineMs) { cells[item.id] = fallback(item); continue; }
        try { cells[item.id] = await lookup(item); streak = 0; }
        catch (error) { cells[item.id] = fallback(item); if (++streak >= maxFailureStreak && !gaveUp) { gaveUp = true; log.warn?.(`${shop.name} stopped answering; using older prices for the rest`); } }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return cells;
  }

  const cellsFromBhx = bhx => {
    const usable = bhx && !bhx.expired, products = usable ? comparableProducts(bhx.products) : [];
    const shop = { id: 'bhx', name: 'Bách Hóa Xanh', checkedAt: bhx?.capturedAt || null, errors: 0, snapshot: true, region: bhx?.regionLabel || null, targetRegion: 'TP.HCM', referenceOnly: !usable || !bhx.regionVerified || bhx.stale, unavailable: !usable };
    return { shop, cells: Object.fromEntries(CATALOG.map(item => {
      if (!usable) return [item.id, { status: 'error' }];
      const cell = pickBest(item, products);
      if (cell.status === 'not_found') cell.status = 'not_collected';
      return [item.id, { ...cell, checkedAt: bhx.capturedAt, stale: bhx.stale }];
    })) };
  };

  // Turns whatever has finished so far into a snapshot. Shops still working show their older prices (or "updating").
  function assemble({ shops, cells, previous, updating }) {
    const items = CATALOG.map(item => ({
      id: item.id, group: item.group, name: item.name, unit: item.unit, unitLabel: item.unitLabel || UNIT_LABEL[item.unit],
      perStore: Object.fromEntries(shops.map(shop => [shop.id, cells[shop.id][item.id]])),
    }));
    const stamp = new Date(now()).toISOString(), today = dayKey(now());
    // Yesterday's prices: the previous snapshot if it is from an earlier day, else the baseline already carried today.
    const baseline = previous?.baseline?.day === today ? previous.baseline
      : { day: today, prices: previous?.checkedAt && dayKey(Date.parse(previous.checkedAt)) !== today ? unitPrices(previous) : null };
    for (const item of items) for (const [shopId, cell] of Object.entries(item.perStore)) {
      const before = baseline.prices?.[item.id]?.[shopId];
      if (cell.status === 'ok' && !cell.stale && !shops.find(x => x.id === shopId)?.snapshot && Number.isFinite(before)) cell.change = cell.unitPrice - before;
    }
    for (const shop of shops) if (!shop.snapshot) shop.checkedAt = updating.includes(shop.id) ? (previous?.stores.find(x => x.id === shop.id)?.checkedAt ?? null) : shop.errors < CATALOG.length ? stamp : (previous?.stores.find(x => x.id === shop.id)?.checkedAt ?? null);
    const compared = shops.filter(x => !x.referenceOnly);
    const both = items.filter(i => compared.every(x => i.perStore[x.id].status === 'ok' && !i.perStore[x.id].stale));
    const totals = Object.fromEntries(compared.map(x => [x.id, both.reduce((sum, i) => sum + i.perStore[x.id].unitPrice, 0)]));
    return {
      checkedAt: stamp, catalogKey: catalogKey(), baseline, stores: shops.map(({ errors, ...x }) => ({ ...x, failed: errors > 0 || !!x.unavailable })), groups: GROUPS, items,
      basket: { count: both.length, totals, storeIds: compared.map(x => x.id) },
      hasErrors: shops.some(x => x.errors > 0), updating,
    };
  }

  // Shops are fetched side by side and the board is published as each one finishes (`onPartial`), so a slow shop
  // does not keep the fast ones off the page.
  async function build(previous, onPartial = () => {}) {
    const shops = STORES.filter(x => fetchers[x.id]).map(x => ({ ...x, checkedAt: null, errors: 0 })); // a shop without a fetcher is simply not on the board
    const cells = {}, pending = new Set(shops.map(x => x.id));
    const older = id => previous?.items ? Object.fromEntries(CATALOG.map(item => { const old = previous.items.find(i => i.id === item.id)?.perStore[id]; return [item.id, old && old.status !== 'error' && old.status !== 'pending' ? { ...old, stale: true } : { status: 'pending' }]; })) : Object.fromEntries(CATALOG.map(item => [item.id, { status: 'pending' }]));
    for (const shop of shops) cells[shop.id] = older(shop.id);
    if (bhxLoader) {
      const before = previous?.stores.find(x => x.id === 'bhx');
      shops.push(before ? { ...before, errors: 0 } : { id: 'bhx', name: 'Bách Hóa Xanh', checkedAt: null, errors: 0, snapshot: true, targetRegion: 'TP.HCM', referenceOnly: true, unavailable: true });
      cells.bhx = older('bhx'); pending.add('bhx');
    }
    const publish = () => { if (pending.size) onPartial(assemble({ shops, cells, previous, updating: [...pending] })); }; // only once a shop has finished: an all-"updating" board helps nobody
    const jobs = shops.filter(x => !x.snapshot).map(async shop => { cells[shop.id] = await buildShop(shop, previous); pending.delete(shop.id); publish(); });
    if (bhxLoader) jobs.push(Promise.resolve().then(() => bhxLoader(now())).catch(() => null).then(bhx => { const loaded = cellsFromBhx(bhx), at = shops.findIndex(x => x.id === 'bhx'); shops[at] = loaded.shop; cells.bhx = loaded.cells; pending.delete('bhx'); publish(); }));
    await Promise.all(jobs);
    return assemble({ shops, cells, previous, updating: [] });
  }

  /** When a snapshot taken at `at` is due for a refresh: the next 08:00 (or soon, after errors), or when a dated BHX capture ages out. */
  function expiryOf(data, at) {
    let expiresAt = data.hasErrors ? at + retryMs : nextRefreshAt(at, dailyAt);
    for (const store of data.stores.filter(s => s.snapshot && s.checkedAt)) {
      for (const age of [86400_000, 7 * 86400_000]) {
        const boundary = Date.parse(store.checkedAt) + age;
        if (boundary > now()) expiresAt = Math.min(expiresAt, boundary);
      }
    }
    return expiresAt;
  }
  function refresh() {
    if (!inflight) {
      inflight = build(cache?.data, partial => { cache = { data: partial, expiresAt: now() + retryMs }; }).then(data => {
        cache = { data, expiresAt: expiryOf(data, now()) };
        if (store) Promise.resolve().then(() => store.save(data)).catch(error => log.warn?.('Price snapshot was not saved:', error.message));
        return data;
      }).finally(() => { inflight = null; });
      inflight.catch(() => {});
    }
    return inflight;
  }
  /** Resolves with fresh data, waiting for a refresh when the cache is empty or expired. */
  async function getPrices({ force = false } = {}) {
    if (!force && cache && now() < cache.expiresAt && !cache.data.updating?.length) return cache.data; // a half-built board is not "fresh data": wait for the build
    return refresh();
  }
  /** Never waits: returns the cached snapshot (even if stale) or null, and starts a refresh when it is due. */
  function current() {
    if (!cache || now() >= cache.expiresAt) refresh();
    return cache ? cache.data : null;
  }
  /** Fetches now, then again every day at the scheduled hour. If the host slept through 08:00, the first visit afterwards refreshes via current(). */
  function start() {
    const arm = () => {
      timer = setTimer(() => { refresh(); arm(); }, Math.max(1000, nextRefreshAt(now(), dailyAt) - now()));
      timer?.unref?.();
    };
    arm();
    // A saved snapshot is served at once; if it is older than the last 08:00 (or the catalog changed) a refresh runs behind it.
    const loaded = store ? Promise.resolve().then(() => store.load()).catch(error => { log.warn?.('Saved price snapshot unreadable:', error.message); return null; }) : Promise.resolve(null);
    return loaded.then(saved => {
      if (saved && !cache) cache = { data: saved, expiresAt: saved.catalogKey === catalogKey() ? expiryOf(saved, Date.parse(saved.checkedAt)) : 0 };
      if (!cache || now() >= cache.expiresAt) refresh();
    });
  }
  function stop() { clearTimeout(timer); timer = null; }
  return { getPrices, current, start, stop };
}

const csvCell = value => { const text = String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&"); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
const STATUS_TEXT = { ok: 'Có hàng', out_of_stock: 'Hết hàng', not_found: 'Không tìm thấy', not_collected: 'Chưa thu thập mặt hàng phù hợp', pending: 'Đang cập nhật', error: 'Lỗi lấy dữ liệu' };

/** UTF-8 with BOM so Excel shows Vietnamese correctly. */
function toCsv(snapshot) {
  const rows = [['Mặt hàng', 'Siêu thị', 'Sản phẩm', 'Giá bán (đ)', 'Giá niêm yết (đ)', 'Quy cách', 'Giá trên đơn vị (đ)', 'Đơn vị', 'Trạng thái', 'Link', 'Thời điểm lấy giá', 'Khu vực', 'Chỉ tham khảo']];
  for (const item of snapshot.items) for (const store of snapshot.stores) {
    const c = item.perStore[store.id];
    rows.push([item.name, store.name, c.name || '', c.price ?? '', c.listPrice ?? '', c.size || '', c.unitPrice ?? '', item.unitLabel, STATUS_TEXT[c.status] + (c.stale ? ' (dữ liệu cũ)' : ''), c.url || '', c.checkedAt || store.checkedAt || '', store.region || (store.id === 'bhx' ? 'Chưa xác minh TP.HCM' : 'Cửa hàng mặc định'), store.referenceOnly ? 'Có' : '']);
  }
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { CATALOG, STORES, firestorePriceStore, dayKey, parseSize, pickBest, fetchWinmart, fetchCoop, fetchKingfood, fetchLotte, createGroceryPrices, nextRefreshAt, toCsv };
