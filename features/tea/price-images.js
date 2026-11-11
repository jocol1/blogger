'use strict';
/* Product thumbnails for the price board.
 * The supermarkets' photos are full-size (some are 5 MB), but the board shows them at 34-64 px. Each photo is fetched
 * once, shrunk to a ~3 KB WebP and kept in memory, so a crowd of visitors costs the server memory reads, not
 * upstream requests, and each visitor downloads kilobytes instead of megabytes.
 * Safe by construction: callers only pass URLs that are in the current price snapshot (checked in routes.js), at most
 * `concurrency` fetches/resizes run at once, equal requests share one fetch, failures are remembered for a while so a
 * broken photo is not retried on every page view, and the cache has a hard size cap. */
const crypto = require('node:crypto');

const MAX_SOURCE = 8_000_000; // largest original we accept; the thumbnail itself is tiny

async function shrink(buffer) {
  const sharp = require('sharp');
  const body = await sharp(buffer, { limitInputPixels: 50_000_000, failOn: 'none' }).rotate().resize(96, 96, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  return { body, type: 'image/webp' };
}

function createImageCache({ fetchImage = fetch, resize = shrink, now = () => Date.now(), maxEntries = 1000, maxBytes = 24_000_000, ttlMs = 24 * 3600_000, failTtlMs = 10 * 60_000, concurrency = 4, timeoutMs = 8000 } = {}) {
  const entries = new Map(), failures = new Map(), inflight = new Map();
  let bytes = 0, active = 0; const waiting = [];

  const limited = task => new Promise((resolve, reject) => {
    const run = () => { active += 1; task().then(resolve, reject).finally(() => { active -= 1; waiting.shift()?.(); }); };
    active < concurrency ? run() : waiting.push(run);
  });
  const evict = () => { for (const [key, entry] of entries) { if (entries.size <= maxEntries && bytes <= maxBytes) break; bytes -= entry.body.length; entries.delete(key); } };

  async function download(url) {
    const response = await fetchImage(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'LoclyTeaPriceBoard/1.0', accept: 'image/*' } });
    const type = String(response.headers.get('content-type') || '').toLowerCase().split(';')[0];
    if (!response.ok || !/^image\/(png|jpe?g|webp|gif|avif)$/.test(type) || Number(response.headers.get('content-length') || 0) > MAX_SOURCE) throw new Error('not a usable image');
    const original = Buffer.from(await response.arrayBuffer());
    if (original.length > MAX_SOURCE) throw new Error('image too large');
    try { return await resize(original); }
    catch { if (original.length <= 200_000) return { body: original, type }; throw new Error('could not shrink image'); }
  }

  /** { body, type, etag } for a photo URL, or null when it cannot be had right now. */
  async function get(url) {
    const key = String(url), hit = entries.get(key);
    if (hit && now() - hit.at < ttlMs) { entries.delete(key); entries.set(key, hit); return hit; } // most recently used goes last
    if (hit) { bytes -= hit.body.length; entries.delete(key); }
    if ((failures.get(key) ?? 0) > now()) return null;
    if (!inflight.has(key)) {
      inflight.set(key, limited(() => download(key)).then(result => {
        const entry = { ...result, at: now(), etag: `"${crypto.createHash('sha1').update(result.body).digest('base64url').slice(0, 22)}"` };
        entries.set(key, entry); bytes += entry.body.length; evict(); return entry;
      }).catch(() => { failures.set(key, now() + failTtlMs); if (failures.size > 5000) failures.delete(failures.keys().next().value); return null; }).finally(() => inflight.delete(key)));
    }
    return inflight.get(key);
  }
  return { get, stats: () => ({ entries: entries.size, bytes, failures: failures.size, active, waiting: waiting.length }) };
}

module.exports = { createImageCache, shrink };
