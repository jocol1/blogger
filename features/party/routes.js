const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { createPartyService, PartyError } = require('./service');

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function createPartyRouter(options) {
  const router = express.Router();
  const service = createPartyService(options);
  const assets = path.join(__dirname, '../../public/party');
  const attempts = new Map();
  const loginAttempts = new Map();
  const asyncRoute = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const limiter = (map, limit, windowMs) => (req, res, next) => {
    const at = Date.now();
    for (const [key, value] of map) if (at >= value.until) map.delete(key);
    const bucket = map.get(req.ip) || { count: 0, until: at + windowMs };
    if (bucket.count >= limit || (!map.has(req.ip) && map.size >= 10_000)) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - at) / 1000))));
      return res.status(429).json({ error: 'Bạn thao tác quá nhanh. Hãy thử lại sau.' });
    }
    bucket.count++;
    map.set(req.ip, bucket);
    next();
  };
  const actionLimiter = limiter(attempts, 300, 10 * 60 * 1000);
  const loginLimiter = limiter(loginAttempts, 5, 15 * 60 * 1000);
  const partyToken = req => req.get('X-Party-Token');
  const walletToken = req => req.get('X-Wallet-Token');
  const isAdmin = req => Boolean(options.isAdmin?.(req));
  const adminOnly = (req, res, next) => isAdmin(req) ? next() : res.redirect('/party/admin/login');
  const ensureCsrf = req => req.session.csrf ||= crypto.randomBytes(24).toString('hex');
  const csrfOnly = (req, res, next) => {
    const expected = Buffer.from(String(req.session?.csrf || ''));
    const actual = Buffer.from(String(req.body.csrf || ''));
    if (!expected.length || expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return res.status(403).send('Phiên quản trị không hợp lệ.');
    next();
  };
  const adminPage = body => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quản trị Locly Party</title><style>body{margin:0;background:#100c1d;color:#f7f3ff;font:15px/1.6 "Segoe UI",Arial,sans-serif}.wrap{width:min(1040px,calc(100% - 32px));margin:40px auto}a{color:#f7b955}.top{display:flex;justify-content:space-between;align-items:center}.card{padding:18px;margin:12px 0;border:1px solid #ffffff18;border-radius:16px;background:#1a142b}.meta{color:#a99fb9}.badge{display:inline-block;padding:3px 8px;border-radius:99px;background:#ffffff12;color:#ffca78;font-size:11px}input,button{font:inherit;padding:9px 11px;border-radius:8px}input{border:1px solid #ffffff22;background:#0e0a19;color:#fff}button{border:0;background:#f26d50;color:#fff;font-weight:800}form{display:flex;gap:8px;flex-wrap:wrap}</style></head><body><main class="wrap">${body}</main></body></html>`;

  router.use('/assets/party', express.static(assets, { index: false }));
  router.get('/party', (req, res) => {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.sendFile(path.join(assets, 'index.html'));
  });

  router.get('/party/admin/login', (req, res) => res.send(adminPage(`<h1>Quản trị Locly Party</h1><form method="post"><input type="password" name="password" placeholder="Mật khẩu quản trị" required autofocus><button>Đăng nhập</button></form>${req.query.error ? '<p>Mật khẩu không đúng hoặc thử quá nhiều lần.</p>' : ''}`)));
  router.post('/party/admin/login', loginLimiter, express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    if (!options.authenticateAdmin?.(req.body.password || '')) return res.redirect('/party/admin/login?error=1');
    req.session.regenerate(error => {
      if (error) return res.status(500).send('Không thể tạo phiên quản trị.');
      req.session.user = 'admin';
      req.session.csrf = crypto.randomBytes(24).toString('hex');
      req.session.save(saveError => saveError ? res.status(500).send('Không thể lưu phiên quản trị.') : res.redirect('/party/admin'));
    });
  });
  router.get('/party/admin', adminOnly, asyncRoute(async (req, res) => {
    const csrf = ensureCsrf(req);
    const rows = await service.adminRooms();
    const cards = rows.map(row => `<article class="card"><span class="badge">${esc(row.status)} · ${esc(row.packageStatus)}</span><h2>${esc(row.code)} · ${esc(row.selectedGame)}</h2><p class="meta">${esc(row.players)} người · cập nhật ${esc(new Date(row.updatedAt).toLocaleString('vi-VN'))}</p>${row.status !== 'closed' ? `<form method="post" action="/party/admin/rooms/${encodeURIComponent(row.code)}/cancel"><input type="hidden" name="csrf" value="${csrf}"><input name="reason" maxlength="300" placeholder="Lý do hủy và hoàn phí" required><button>Đóng phòng</button></form>` : ''}</article>`).join('') || '<div class="card">Chưa có phòng nào.</div>';
    res.send(adminPage(`<div class="top"><div><a href="/party">← Trang Party</a><h1>Phòng đang quản lý</h1></div><a href="/xin-tien/admin">Ví & đổi quà</a></div>${cards}`));
  }));
  router.post('/party/admin/rooms/:code/cancel', adminOnly, express.urlencoded({ extended: false, limit: '8kb' }), csrfOnly, asyncRoute(async (req, res) => {
    await service.adminCancel(req.params.code, req.body.reason);
    res.redirect('/party/admin');
  }));

  router.use('/api/party', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/api/party/config', (req, res) => res.json(service.publicConfig()));
  router.post('/api/party/rooms', actionLimiter, express.json({ limit: '8kb' }), asyncRoute(async (req, res) => res.status(201).json(await service.createRoom(walletToken(req), req.body))));
  router.post('/api/party/rooms/:code/join', actionLimiter, express.json({ limit: '8kb' }), asyncRoute(async (req, res) => res.status(201).json(await service.join(req.params.code, req.body))));
  router.get('/api/party/rooms/:code', asyncRoute(async (req, res) => res.json(await service.state(req.params.code, partyToken(req)))));
  router.post('/api/party/rooms/:code/purchase', actionLimiter, express.json({ limit: '8kb' }), asyncRoute(async (req, res) => res.json(await service.purchase(req.params.code, partyToken(req), walletToken(req), req.body))));
  router.post('/api/party/rooms/:code/actions', actionLimiter, express.json({ limit: '8kb' }), asyncRoute(async (req, res) => res.json(await service.action(req.params.code, partyToken(req), req.body))));

  router.use((error, req, res, next) => {
    if (error instanceof PartyError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ.' });
    console.error('Party operation failed:', error.code || error.name);
    res.status(503).json({ error: 'Kết nối phòng chơi đang gián đoạn. Hãy thử lại.' });
  });

  router.partyService = service;
  service.startMaintenance().catch(error => console.error('Party startup failed:', error.code || error.name));
  return router;
}

module.exports = { createPartyRouter };
