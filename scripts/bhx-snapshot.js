'use strict';
// Validate/export or atomically install a browser-collected snapshot. Never refresh its capture timestamp.
const fs = require('node:fs/promises');
const path = require('node:path');
const { readBhxSnapshot, DEFAULT_FILE } = require('../features/tea/bhx-prices');
const cell = value => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';
async function main() {
  const [action, input = DEFAULT_FILE, destination] = process.argv.slice(2);
  if (!['check', 'csv', 'install'].includes(action)) throw new Error('Usage: node scripts/bhx-snapshot.js check|csv|install [input.json] [output]');
  const snapshot = await readBhxSnapshot(Date.now(), input);
  if (action === 'csv') {
    if (!destination) throw new Error('Provide a CSV output path');
    const rows = [['ID', 'Sản phẩm', 'Quy cách', 'Giá bán VND', 'Giá gốc VND', 'Link', 'Trang nguồn', 'Thời điểm lấy', 'Khu vực đã xác minh'], ...snapshot.products.map(p => [p.id, p.originalName, p.pack, p.price, p.listPrice || '', p.url, p.sourcePage, snapshot.capturedAt, snapshot.regionLabel || 'Chưa xác minh TP.HCM'])];
    await fs.writeFile(destination, '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n', { flag: 'wx' });
  }
  if (action === 'install') {
    if (!destination) throw new Error('Provide a destination file; then configure BHX_SNAPSHOT_FILE');
    if (snapshot.expired) throw new Error('Snapshot older than 7 days');
    const target = path.resolve(destination), temp = `${target}.${process.pid}.tmp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    try { await fs.writeFile(temp, await fs.readFile(input), { flag: 'wx' }); await fs.rename(temp, target); }
    finally { await fs.unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  }
  console.log(JSON.stringify({ products: snapshot.products.length, capturedAt: snapshot.capturedAt, region: snapshot.regionLabel, stale: snapshot.stale, expired: snapshot.expired }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
