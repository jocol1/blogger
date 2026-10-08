const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { createChatService, ChatError, MAX_IMAGE_BYTES } = require('./service');

function createChatRouter(options) {
  const router = express.Router();
  const service = createChatService(options);
  const assets = path.join(__dirname, '../../public/ai');
  const sendAttempts = new Map();
  const startAttempts = new Map();
  const loginAttempts = new Map();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 3, fields: 4, fieldSize: 10_000 } });
  const asyncRoute = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const walletToken = req => req.get('X-Wallet-Token');
  const limiter = (map, limit, windowMs, keyFn = req => req.ip) => (req, res, next) => {
    const at = Date.now();
    for (const [key, item] of map) if (at >= item.until) map.delete(key);
    const key = keyFn(req);
    const bucket = map.get(key) || { count: 0, until: at + windowMs };
    if (bucket.count >= limit || (!map.has(key) && map.size >= 10_000)) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - at) / 1000))));
      return res.status(429).json({ error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' });
    }
    bucket.count++;
    map.set(key, bucket);
    next();
  };
  const startLimiter = limiter(startAttempts, 20, 10 * 60 * 1000);
  const sendLimiter = limiter(sendAttempts, 10, 60 * 1000, req => `${req.ip}:${req.params.id || 'none'}`);
  const adminLoginLimiter = limiter(loginAttempts, 5, 15 * 60 * 1000);
  const isAdmin = req => Boolean(options.isAdmin?.(req));
  const adminPageOnly = (req, res, next) => isAdmin(req) ? next() : res.redirect('/ai/admin/login');
  const adminApiOnly = (req, res, next) => isAdmin(req) ? next() : res.status(401).json({ error: 'Bạn cần đăng nhập quản trị.' });
  const ensureCsrf = req => req.session.csrf ||= crypto.randomBytes(24).toString('hex');
  const csrfOnly = (req, res, next) => {
    const expected = Buffer.from(String(req.session?.csrf || ''));
    const actual = Buffer.from(String(req.get('X-CSRF-Token') || ''));
    if (!expected.length || expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return res.status(403).json({ error: 'Phiên quản trị không hợp lệ.' });
    next();
  };
  const loginPage = error => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Đăng nhập quản trị Locly AI</title><style>body{margin:0;background:#0d1020;color:#f4f5ff;font:16px/1.5 "Segoe UI",Arial,sans-serif}.box{width:min(420px,calc(100% - 32px));margin:12vh auto;background:#171b31;border:1px solid #303852;border-radius:18px;padding:28px;box-sizing:border-box}input,button{width:100%;box-sizing:border-box;font:inherit;padding:12px;border-radius:9px}input{background:#0f1325;color:#fff;border:1px solid #39415d}button{margin-top:12px;border:0;background:#7c6cff;color:#fff;font-weight:800}.error{color:#ff9aaf}</style></head><body><main class="box"><h1>Quản trị Locly AI</h1><form method="post"><input type="password" name="password" placeholder="Mật khẩu quản trị" required autofocus><button>Đăng nhập</button></form>${error ? '<p class="error">Mật khẩu không đúng hoặc thử quá nhiều lần.</p>' : ''}</main></body></html>`;

  router.use('/assets/ai', express.static(assets, { index: false }));
  router.get('/ai', (req, res) => {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: https://img.vietqr.io; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.sendFile(path.join(assets, 'index.html'));
  });
  router.get('/ai/admin/login', (req, res) => res.send(loginPage(Boolean(req.query.error))));
  router.post('/ai/admin/login', adminLoginLimiter, express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    if (!options.authenticateAdmin?.(req.body.password || '')) return res.redirect('/ai/admin/login?error=1');
    req.session.regenerate(error => {
      if (error) return res.status(500).send('Không thể tạo phiên quản trị.');
      req.session.user = 'admin';
      req.session.csrf = crypto.randomBytes(24).toString('hex');
      req.session.save(saveError => saveError ? res.status(500).send('Không thể lưu phiên quản trị.') : res.redirect('/ai/admin'));
    });
  });
  router.get('/ai/admin', adminPageOnly, (req, res) => {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.sendFile(path.join(assets, 'admin.html'));
  });

  router.use('/api/chat', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/api/chat/config', asyncRoute(async (req, res) => res.json(await service.publicConfig())));
  router.get('/api/chat/sessions', asyncRoute(async (req, res) => res.json(await service.list(walletToken(req)))));
  router.post('/api/chat/sessions', startLimiter, express.json({ limit: '4kb' }), asyncRoute(async (req, res) => res.status(201).json(await service.start(walletToken(req), req.body))));
  router.get('/api/chat/sessions/:id', asyncRoute(async (req, res) => res.json(await service.get(walletToken(req), req.params.id))));
  router.get('/api/chat/sessions/:id/messages', asyncRoute(async (req, res) => res.json(await service.messages(walletToken(req), req.params.id, req.query.after))));
  router.post('/api/chat/sessions/:id/messages', sendLimiter, upload.array('images', 3), asyncRoute(async (req, res) => res.status(201).json(await service.sendUserMessage(walletToken(req), req.params.id, req.body, req.files))));
  router.get('/api/chat/sessions/:id/images/:messageId/:index', asyncRoute(async (req, res) => {
    const image = await service.readImage({ walletToken: walletToken(req), sessionIdValue: req.params.id, messageIdValue: req.params.messageId, indexValue: req.params.index, admin: isAdmin(req) });
    res.set({ 'Content-Type': image.mime, 'Content-Disposition': `inline; filename="${encodeURIComponent(image.name)}.webp"`, 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' });
    res.send(image.buffer);
  }));

  router.get('/api/chat/admin/bootstrap', adminApiOnly, asyncRoute(async (req, res) => res.json({ csrf: ensureCsrf(req), sessions: await service.adminSessions(), ...(await service.publicConfig()) })));
  router.post('/api/chat/admin/logout', adminApiOnly, csrfOnly, (req, res) => req.session.destroy(() => res.json({ success: true })));
  router.get('/api/chat/admin/sessions/:id/messages', adminApiOnly, asyncRoute(async (req, res) => res.json(await service.adminMessages(req.params.id, req.query.after))));
  router.post('/api/chat/admin/sessions/:id/messages', adminApiOnly, csrfOnly, sendLimiter, upload.array('images', 3), asyncRoute(async (req, res) => res.status(201).json(await service.sendAdminMessage(req.params.id, req.body, req.files))));

  router.use((error, req, res, next) => {
    if (error instanceof ChatError) return res.status(error.status).json({ error: error.message });
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Mỗi ảnh tối đa 5 MB.' });
      if (error.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Mỗi tin nhắn chỉ được gửi tối đa 3 ảnh.' });
      return res.status(400).json({ error: 'Dữ liệu tải lên không hợp lệ.' });
    }
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ.' });
    console.error('Chat operation failed:', error.code || error.name);
    res.status(503).json({ error: 'Kết nối trợ lý đang gián đoạn. Vui lòng thử lại sau.' });
  });

  router.chatService = service;
  service.startMaintenance().catch(error => console.error('Chat startup failed:', error.code || error.name));
  return router;
}

module.exports = { createChatRouter };
