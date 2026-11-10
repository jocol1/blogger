'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const DAY = 86400_000;
const DEFAULT_FILE = path.join(__dirname, 'snapshots/bhx-public.json');
const COLUMNS = ['id', 'name', 'pack', 'priceText', 'listText', 'path', 'sourcePath', 'inStock'];

function vnd(text) {
  if (typeof text !== 'string' || !/^(?:\d{1,3}(?:\.\d{3})+|\d+)đ$/.test(text)) throw new Error('Invalid BHX price');
  const value = Number(text.replace(/[.đ]/g, ''));
  if (!Number.isSafeInteger(value) || value <= 0 || value > 100_000_000) throw new Error('Invalid BHX price');
  return value;
}
function sourceUrl(value) {
  if (typeof value !== 'string' || !/^\/[a-z0-9/-]*$/.test(value)) throw new Error('Invalid BHX source path');
  const url = new URL(value, 'https://www.bachhoaxanh.com');
  if (url.origin !== 'https://www.bachhoaxanh.com') throw new Error('Invalid BHX source host');
  return url.href;
}
function validateSnapshot(raw, now = Date.now()) {
  if (raw?.version !== 1 || JSON.stringify(raw.columns) !== JSON.stringify(COLUMNS) || !Array.isArray(raw.rows) || !raw.rows.length || raw.rows.length > 5000) throw new Error('Invalid BHX snapshot');
  const stamp = Date.parse(raw.capturedAt);
  if (!Number.isFinite(stamp) || stamp > now + 300_000) throw new Error('Invalid BHX capture time');
  if (raw.targetRegion !== 'TP.HCM' || typeof raw.regionVerified !== 'boolean' || (raw.regionVerified && raw.regionLabel !== 'TP.HCM')) throw new Error('Invalid BHX region');
  const seen = new Set();
  const products = raw.rows.map(row => {
    if (!Array.isArray(row) || row.length !== COLUMNS.length) throw new Error('Invalid BHX row');
    const [id, name, pack, priceText, listText, productPath, sourcePath, inStock] = row;
    if (!/^\d{1,12}$/.test(id) || seen.has(id) || typeof name !== 'string' || !name.trim() || name.length > 300 || /[\x00-\x1f]/.test(name) || typeof pack !== 'string' || pack.length > 80 || /[\x00-\x1f]/.test(pack) || typeof inStock !== 'boolean') throw new Error('Invalid BHX product');
    seen.add(id);
    return { id, name: pack ? `${name} (${pack})` : name, originalName: name, pack, uom: '', price: vnd(priceText), listPrice: listText === '' ? 0 : vnd(listText), url: sourceUrl(productPath), sourcePage: sourceUrl(sourcePath), inStock };
  });
  return { capturedAt: new Date(stamp).toISOString(), targetRegion: 'TP.HCM', regionVerified: raw.regionVerified, regionLabel: raw.regionVerified ? 'TP.HCM' : null, stale: now - stamp >= DAY, expired: now - stamp >= 7 * DAY, products };
}
async function readBhxSnapshot(now = Date.now(), filename = process.env.BHX_SNAPSHOT_FILE || DEFAULT_FILE) {
  const file = await fs.open(filename, 'r');
  try {
    if ((await file.stat()).size > 3_000_000) throw new Error('BHX snapshot too large');
    return validateSnapshot(JSON.parse(await file.readFile('utf8')), now);
  } finally { await file.close(); }
}
// Combo/gift counts cannot be inferred safely from the first quantity in a title.
function comparableProducts(products) {
  return products.filter(p => !/^\d+\s*(?:hộp|lốc|thùng|gói|túi)\b|tặng|combo|mua\s+\d/i.test(p.originalName));
}
module.exports = { COLUMNS, DEFAULT_FILE, vnd, sourceUrl, validateSnapshot, readBhxSnapshot, comparableProducts };
