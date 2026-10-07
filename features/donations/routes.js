const path = require('node:path');
const express = require('express');
const { createDonationService, DonationError, verifyKey } = require('./service');

function createDonationRouter(options) {
  const router = express.Router();
  const service = createDonationService(options);
  const assets = path.join(__dirname, '../../public/an-xin');
  const attempts = new Map();
  const windowMs = 10 * 60 * 1000;
  const limiter = (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (now >= value.until) attempts.delete(key);
    const key = req.ip;
    const bucket = attempts.get(key) || { count: 0, until: now + windowMs };
    if (bucket.count >= 10 || (!attempts.has(key) && attempts.size >= 10_000)) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - now) / 1000))));
      return res.status(429).json({ error: 'Bạn đã tạo nhiều QR. Vui lòng dùng mã hiện tại hoặc thử lại sau 10 phút.' });
    }
    bucket.count++;
    attempts.set(key, bucket);
    next();
  };
  const asyncRoute = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  router.use('/assets/an-xin', express.static(assets, { index: false }));
  router.get('/an-xin', (req, res) => res.redirect(302, '/tra-tien'));
  router.get('/tra-tien', (req, res) => {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://img.vietqr.io; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.sendFile(path.join(assets, 'index.html'));
  });
  router.use(['/api/donations', '/api/webhooks/sepay'], (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/api/donations/config', (req, res) => res.json(service.publicConfig()));
  router.post('/api/donations', limiter, express.json({ limit: '8kb' }), asyncRoute(async (req, res) => {
    res.status(201).json(await service.create(req.body));
  }));
  router.get('/api/donations/status', asyncRoute(async (req, res) => res.json(await service.status(req.get('X-Donation-Token')))));
  router.get('/api/donations/events', asyncRoute(async (req, res) => res.json(await service.listEvents(req.query.after))));
  router.post('/api/webhooks/sepay', (req, res, next) => {
    if (!service.publicConfig().ready) return res.status(503).json({ error: 'Chưa cấu hình nhận tiền.' });
    if (!verifyKey(req.get('Authorization'), service.config.webhookKey)) return res.status(401).json({ error: 'Webhook không được xác thực.' });
    next();
  }, express.json({ limit: '32kb' }), asyncRoute(async (req, res) => res.json(await service.receive(req.body))));
  router.use((error, req, res, next) => {
    if (error instanceof DonationError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu vượt giới hạn.' });
    console.error('Donation storage operation failed:', error.code || error.name);
    res.status(503).json({ error: 'Kết nối xác nhận đang gián đoạn. Vui lòng thử lại sau.' });
  });
  return router;
}

module.exports = { createDonationRouter };
