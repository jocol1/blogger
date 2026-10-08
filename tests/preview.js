// Explicit, loopback-only UI test fixture. Never mounted by server.js.
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const session = require('express-session');
const { createDonationRouter } = require('../features/donations/routes');
const { createChatRouter } = require('../features/chat/routes');
const { createPartyRouter } = require('../features/party/routes');
const { MemoryFirestore } = require('./helpers/memory-firestore');
if (process.env.NODE_ENV === 'production') throw new Error('Do not run the UI fixture in production.');
const db = new MemoryFirestore();
const imageFiles = new Map();
const bucket = { async getMetadata() { return [{ name: 'local-chat-preview' }]; }, file(name) { return { async save(buffer, options) { imageFiles.set(name, { buffer: Buffer.from(buffer), options }); }, async download() { const item = imageFiles.get(name); if (!item) throw new Error('not found'); return [Buffer.from(item.buffer)]; }, async delete() { imageFiles.delete(name); } }; } };
const config = { bank: 'MB', account: '0000000000', accountName: 'TEST ONLY - KHONG CHUYEN TIEN', webhookKey: 'local-preview-only' };
const app = express();
app.use(session({ secret: 'local-preview-session-secret', resave: false, saveUninitialized: false }));
let offline = false;
app.post('/__test/offline', express.json(), (req, res) => { offline = req.body.offline === true; res.json({ offline }); });
app.use('/api/donations', (req, res, next) => offline ? res.status(503).json({ error: 'Mất kết nối thử nghiệm.' }) : next());
app.get(['/an-xin', '/tra-tien', '/xin-tien'], (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '../public/an-xin/index.html'), 'utf8');
  res.send(html.replace('<body>', '<body><div class="notice" role="note">BẢN KIỂM THỬ CỤC BỘ · KHÔNG CHUYỂN TIỀN · DỮ LIỆU GIẢ LẬP</div>'));
});
app.use(createDonationRouter({ db, config }));
app.use(createChatRouter({ db, bucket, isAdmin: req => req.session.user === 'admin', authenticateAdmin: password => password === 'local-admin' }));
app.use(createPartyRouter({ db, secret: 'local-party-secret', isAdmin: req => req.session.user === 'admin', authenticateAdmin: password => password === 'local-admin' }));
app.listen(3101, '127.0.0.1', () => console.log('UI test fixture: http://127.0.0.1:3101/xin-tien (fake data only)'));
