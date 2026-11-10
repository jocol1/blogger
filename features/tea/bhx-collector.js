'use strict';
/* Automatic Bách Hóa Xanh collector that feeds the existing snapshot format (features/tea/bhx-prices.js).
 * It only reads what BHX publishes for crawlers and allows in robots.txt:
 *   /sitemapnew/sitemap-product*      -> product URLs (search pages are disallowed, so they are never used)
 *   product pages, schema.org JSON-LD -> offers.lowPrice (selling), offers.price (list), offers.availability
 * No private API, no cookies, no login. Requests say who they are, go one at a time with a pause, and the collector
 * gives up on the first HTTP error instead of retrying around it.
 * Limits, verified on 10/11/2026: prices are those of the default store a visitor without an address sees; the page
 * does not say which region that is, so snapshots are written with regionVerified=false (BHX stays "reference").
 * JSON-LD can lag the live page (a carrot page said 300g / 9.900đ while the page showed 250g / 10.050đ), and fresh
 * meat titles often carry no weight, so those rows have an empty pack and are not compared. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { COLUMNS, readBhxSnapshot, DEFAULT_FILE } = require('./bhx-prices');

const BASE = 'https://www.bachhoaxanh.com';
const UA = 'LoclyTeaPriceBoard/1.0 (daily price comparison, one request at a time)';
const MAX_BODY = 3_000_000;
const COLLECTED_FILE = path.join(__dirname, '../../data/bhx-prices.json');

// Where each price-board item lives on BHX: product sitemap ids, the category part of the URL and a slug filter.
// Ids come from /sitemapnew/sitemap-product (checked 10/11/2026). Unknown ids simply yield nothing.
const VEG = { ids: [8785, 8820, 10298], cats: ['cu', 'rau-sach'] };
const FRUIT = { ids: [8788], cats: ['trai-cay-tuoi-ngon'] };
const TARGETS = {
  'trung-ga': { ids: [8686, 8783], cats: ['trung'], slug: /trung-ga/, notSlug: /vit|cut|non|bac-thao|muoi/ },
  'thit-heo': { ids: [8781], cats: ['thit-heo'], slug: /ba-roi|ba-chi/, notSlug: /xong-khoi|nuong|uop|rut-suon/ },
  'thit-heo-xay': { ids: [8781], cats: ['thit-heo'], slug: /heo-xay|thit-xay/ },
  'thit-ga': { ids: [8790], cats: ['thit-ga'], slug: /uc-ga/, notSlug: /sun|xong|chien|uop/ },
  'thit-bo': { ids: [8139], cats: ['thit-bo'], slug: /bap-bo|bap-hoa/ },
  'ca-basa': { ids: [8782, 8400], cats: ['ca-tom-muc-ech', 'ca-hai-san-dong-lanh'], slug: /basa/, notSlug: /bao-tu|vien|cha/ },
  'ca-rot': { ...VEG, slug: /^ca-rot/, notSlug: /baby/ },
  'khoai-tay': { ...VEG, slug: /^khoai-tay/ },
  'ca-chua': { ...VEG, slug: /^ca-chua/, notSlug: /bi|cherry/ },
  'hanh-tay': { ...VEG, slug: /hanh-tay/, notSlug: /tim/ },
  'toi': { ...VEG, slug: /^toi/, notSlug: /bam|phi|den|ot/ },
  'bap-cai': { ...VEG, slug: /bap-cai/, notSlug: /tim|thao/ },
  'dua-leo': { ...VEG, slug: /dua-leo|dua-chuot/, notSlug: /baby/ },
  'bi-do': { ...VEG, slug: /bi-do/, notSlug: /ho-lo|baby/ },
  'chuoi': { ...FRUIT, slug: /^chuoi/ },
  'cam': { ...FRUIT, slug: /^cam-/, notSlug: /vat|xoan/ },
  'tao': { ...FRUIT, slug: /^tao/ },
  'gao': { ids: [2513, 7149], cats: ['gao-gao-nep'], slug: /gao/, notSlug: /nep|lut|tam-/ },
  'bot-mi': { ids: [2388], cats: ['bot-che-bien-san'], slug: /bot-mi/, notSlug: /chien|gion/ },
  'duong': { ids: [2804], cats: ['duong'], slug: /duong/, notSlug: /phen|long|an-kieng|den/ },
  'muoi': { ids: [2803], cats: ['muoi-an'], slug: /muoi/, notSlug: /tom|ot|tieu|hong/ },
  'nuoc-mam': { ids: [2289, 7148], cats: ['nuoc-mam'], slug: /nuoc-mam/, notSlug: /cham|pha-san/ },
  'nuoc-tuong': { ids: [2683], cats: ['nuoc-tuong'], slug: /nuoc-tuong|xi-dau/ },
  'dau-an': { ids: [2286], cats: ['dau-an'], slug: /dau-an|dau-thuc-vat|dau-dau-nanh/, notSlug: /oliu|olive|-me-|gac|dua/ },
  'hat-nem': { ids: [2806, 7148], cats: ['hat-nem'], slug: /hat-nem/, notSlug: /chay|nam|ga|hai-san/ },
  'bot-ngot': { ids: [2806, 7148, 8275], cats: ['hat-nem', 'bot-gia-vi', 'gia-vi-nem-san'], slug: /bot-ngot|mi-chinh/ },
  'tuong-ot': { ids: [2567], cats: ['tuong-ot-ca-den'], slug: /tuong-ot/ },
  'sua-tuoi': { ids: [2386, 7091], cats: ['sua-tuoi'], slug: /sua-tuoi/, notSlug: /dau|socola|chuoi|tra/ },
  'sua-dac': { ids: [2526], cats: ['sua-dac'], slug: /sua-dac/, notSlug: /creamer|pha-che/ },
  'nuoc-suoi': { ids: [2488, 2563], cats: ['nuoc-suoi-khoang'], slug: /aquafina/ },
  'bot-giat': { ids: [2463], cats: ['bot-giat'], slug: /omo/ },
  'nuoc-rua-chen': { ids: [2387], cats: ['nuoc-rua-chen'], slug: /sunlight/ },
};

// Multi-packs and bundles never win on unit price and confuse pack parsing; skipping them saves requests.
const BULK = /^(\d+-|thung-|loc-|combo|set-|hop-qua)|tieu-dung-tiet-kiem/;

// A dropped connection is retried once after a pause; an HTTP error from BHX (403, 429, 5xx) is never retried.
async function getText(url) {
  let response;
  for (let attempt = 0; ; attempt++) {
    try { response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { 'user-agent': UA, accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' } }); break; }
    catch (error) { if (attempt >= 1) throw new Error(`BHX unreachable for ${new URL(url).pathname}: ${error.cause?.code || error.message}`); await new Promise(resolve => setTimeout(resolve, 3000)); }
  }
  if (!response.ok) throw new Error(`BHX answered HTTP ${response.status} for ${new URL(url).pathname}`);
  if (Number(response.headers.get('content-length') || 0) > MAX_BODY) throw new Error('BHX response too large');
  const text = await response.text();
  if (text.length > MAX_BODY) throw new Error('BHX response too large');
  return text;
}

const locs = xml => [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
const vndText = n => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
const PACK = /(\d+(?:[.,]\d+)?\s*(?:kg|g|ml|lít|l)|\d+\s*(?:quả|trứng))(?![a-zà-ỹ])/i;

/** One snapshot row from a product page, or null when the page has no usable Product JSON-LD. */
function rowFromPage(html, url, sourcePath) {
  for (const m of String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data; try { data = JSON.parse(m[1]); } catch { continue; }
    if (data?.['@type'] !== 'Product' || !data.offers) continue;
    const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
    const list = Math.round(Number(offer.price) || 0), low = Math.round(Number(offer.lowPrice ?? offer.price) || 0);
    const id = (String(data.image || '').match(/\/Products\/(?:Images\/)?\d+\/(\d{1,12})\//) || [])[1];
    // SEO titles end in "giá tốt tại Bách hóa XANH" (spelt both "hóa" and "hoá"); keep only the product name.
    const name = String(data.name || '').normalize('NFC').replace(/\s*(giá tốt\s*)?(tại\s*)?bách h[oó][aá] xanh\s*$/i, '').replace(/\s*(giá tốt|chất lượng|tươi ngon)\s*$/i, '').replace(/^mua\s+/i, '').replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 300);
    const productPath = new URL(url).pathname;
    if (!id || !name || !(low > 0) || !/^\/[a-z0-9/-]*$/.test(productPath)) return null;
    // Pack only from the visible title, never from the slug: slugs keep old sizes ("ca-rot-300g" sold as 250g).
    const pack = (name.match(PACK) || [''])[0].replace(/\s+/g, '');
    return [id, name, pack, vndText(low), list > low ? vndText(list) : '', productPath, sourcePath, /InStock|LimitedAvailability/i.test(String(offer.availability || ''))];
  }
  return null;
}

function createBhxCollector({ get = getText, delayMs = 1200, maxCandidates = 4, now = () => Date.now(), file = process.env.BHX_SNAPSHOT_FILE || COLLECTED_FILE, everyMs = 20 * 3600_000, log = console } = {}) {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const polite = async url => { if (delayMs) await sleep(delayMs); return get(url); };
  let lastAttempt = 0, running = null;

  /** Visits BHX once and returns a raw snapshot in the bhx-prices.js format. Throws on the first HTTP error. */
  async function collect() {
    const index = locs(await polite(`${BASE}/sitemapnew/sitemap-product`));
    const sitemapCache = new Map(), rows = new Map();
    for (const [itemId, target] of Object.entries(TARGETS)) {
      const subs = index.filter(u => target.ids.some(id => new RegExp(`/sitemap-product-${id}-\\d+$`).test(u)));
      const candidates = [];
      for (const sub of subs) {
        if (!sitemapCache.has(sub)) sitemapCache.set(sub, locs(await polite(sub)));
        for (const url of sitemapCache.get(sub)) {
          const [, cat, slug = ''] = url.replace(BASE, '').split('/');
          if (target.cats.includes(cat) && target.slug.test(slug) && !target.notSlug?.test(slug) && !BULK.test(slug)) candidates.push({ url, sourcePath: new URL(sub).pathname });
        }
      }
      for (const { url, sourcePath } of candidates.filter((c, i, all) => all.findIndex(x => x.url === c.url) === i).slice(0, maxCandidates)) {
        const row = rowFromPage(await polite(url), url, sourcePath);
        if (row && !rows.has(row[0])) rows.set(row[0], row);
      }
      if (!candidates.length) log.info?.(`BHX: no sitemap candidates for ${itemId}`);
    }
    if (!rows.size) throw new Error('BHX: no product rows collected');
    return { version: 1, capturedAt: new Date(now()).toISOString(), targetRegion: 'TP.HCM', regionVerified: false, regionLabel: null, columns: COLUMNS, rows: [...rows.values()] };
  }

  async function writeAtomic(snapshot) {
    const target = path.resolve(file), temp = `${target}.${process.pid}.tmp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    try { await fs.writeFile(temp, JSON.stringify(snapshot), { flag: 'wx' }); await fs.rename(temp, target); }
    finally { await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }

  /** bhxLoader for createGroceryPrices: collect at most once per `everyMs`, then read the newest valid snapshot. */
  async function loader(nowMs = now()) {
    if (!running && nowMs - lastAttempt >= everyMs) {
      lastAttempt = nowMs;
      running = collect().then(writeAtomic).catch(error => log.warn?.('BHX collection skipped:', error.message)).finally(() => { running = null; });
    }
    if (running) await running;
    try { return await readBhxSnapshot(nowMs, file); }
    catch { return readBhxSnapshot(nowMs, DEFAULT_FILE); } // bundled browser capture until the first collection succeeds
  }

  return { collect, loader, writeAtomic };
}

module.exports = { createBhxCollector, rowFromPage, getText, TARGETS, COLLECTED_FILE, vndText };
