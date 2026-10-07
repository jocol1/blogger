const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { createDonationService, DonationError, verifyKey } = require('./service');

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function createDonationRouter(options) {
  const router = express.Router();
  const service = createDonationService(options);
  const assets = path.join(__dirname, '../../public/an-xin');
  const attempts = new Map();
  const gameAttempts = new Map();
  const loginAttempts = new Map();
  const asyncRoute = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const walletToken = req => req.get('X-Wallet-Token');
  const limiter = (map, limit, windowMs) => (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of map) if (now >= value.until) map.delete(key);
    const bucket = map.get(req.ip) || { count: 0, until: now + windowMs };
    if (bucket.count >= limit || (!map.has(req.ip) && map.size >= 10_000)) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - now) / 1000))));
      return res.status(429).json({ error: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' });
    }
    bucket.count++;
    map.set(req.ip, bucket);
    next();
  };
  const createLimiter = limiter(attempts, 20, 10 * 60 * 1000);
  const gameLimiter = limiter(gameAttempts, 240, 10 * 60 * 1000);
  const adminLimiter = limiter(loginAttempts, 5, 15 * 60 * 1000);
  const adminOnly = (req, res, next) => options.isAdmin?.(req) ? next() : res.redirect('/xin-tien/admin/login');
  const ensureCsrf = req => req.session.csrf ||= crypto.randomBytes(24).toString('hex');
  const checkCsrf = (req, res, next) => {
    const expected = Buffer.from(String(req.session.csrf || ''));
    const actual = Buffer.from(String(req.body.csrf || ''));
    if (!expected.length || expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return res.status(403).send('Phiên quản trị không hợp lệ.');
    next();
  };
  const adminPage = body => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quản trị trà sữa</title><style>body{font:15px/1.6 Arial,sans-serif;background:#f7f4ed;color:#343c32;margin:0}.wrap{max-width:1000px;margin:40px auto;padding:0 20px}h1{font-size:34px}.card{background:#fff;border:1px solid #ddd7c9;border-radius:10px;padding:20px;margin:14px 0}input,select,button{font:inherit;padding:9px;border:1px solid #cfc7b7;border-radius:5px}button{background:#b65736;color:#fff;border:0;font-weight:700}form{display:flex;gap:8px;flex-wrap:wrap}.muted{color:#777}.status{font-weight:700;color:#9a4b2d}</style></head><body><main class="wrap">${body}</main></body></html>`;

  router.use('/assets/an-xin', express.static(assets, { index: false }));
  router.get(['/an-xin', '/tra-tien'], (req, res) => res.redirect(302, '/xin-tien'));
  router.get('/xin-tien', (req, res) => {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://img.vietqr.io; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.sendFile(path.join(assets, 'index.html'));
  });

  router.get('/xin-tien/admin/login', (req, res) => res.send(adminPage(`<h1>Quản trị đổi trà sữa</h1><div class="card"><form method="post"><input type="password" name="password" placeholder="Mật khẩu quản trị" required autofocus><button>Đăng nhập</button></form>${req.query.error ? '<p class="status">Mật khẩu không đúng hoặc thử quá nhiều lần.</p>' : ''}</div>`)));
  router.post('/xin-tien/admin/login', adminLimiter, express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    if (!options.authenticateAdmin?.(req.body.password || '')) return res.redirect('/xin-tien/admin/login?error=1');
    req.session.regenerate(error => {
      if (error) return res.status(500).send('Không thể tạo phiên quản trị.');
      req.session.user = 'admin';
      req.session.csrf = crypto.randomBytes(24).toString('hex');
      req.session.save(saveError => saveError ? res.status(500).send('Không thể lưu phiên quản trị.') : res.redirect('/xin-tien/admin'));
    });
  });
  router.post('/xin-tien/admin/logout', adminOnly, express.urlencoded({ extended: false }), checkCsrf, (req, res) => req.session.destroy(() => res.redirect('/xin-tien/admin/login')));
  router.get('/xin-tien/admin', adminOnly, asyncRoute(async (req, res) => {
    const csrf = ensureCsrf(req);
    const rows = await service.adminRedemptions();
    const cards = rows.map(row => {
      const history = row.walletHistory.slice(0, 20).map(item => `<li>${esc(item.createdAt)} · ${esc(item.type)} · ${Number(item.amount) > 0 ? '+' : ''}${esc(item.amount)} xu · còn ${esc(item.balance)}</li>`).join('');
      return `<section class="card"><div class="status">${esc(row.status)}</div><h2>${esc(row.name)}</h2><p>Liên hệ: <strong>${esc(row.contact)}</strong> · ${row.cost} xu</p><p class="muted">${esc(row.createdAt)}</p><details><summary>Lịch sử xu gần đây</summary><ul>${history || '<li>Chưa có lịch sử.</li>'}</ul></details><form method="post" action="/xin-tien/admin/redemptions/${encodeURIComponent(row.id)}"><input type="hidden" name="csrf" value="${csrf}"><select name="status"><option value="approved">Duyệt</option><option value="fulfilled">Đã tặng</option><option value="rejected">Từ chối + hoàn xu</option></select><input name="reason" maxlength="300" placeholder="Lý do nếu từ chối"><button>Cập nhật</button></form></section>`;
    }).join('') || '<div class="card">Chưa có yêu cầu đổi quà.</div>';
    res.send(adminPage(`<form method="post" action="/xin-tien/admin/logout"><input type="hidden" name="csrf" value="${csrf}"><button>Đăng xuất</button></form><h1>Yêu cầu đổi trà sữa</h1>${cards}`));
  }));
  router.post('/xin-tien/admin/redemptions/:id', adminOnly, express.urlencoded({ extended: false, limit: '8kb' }), checkCsrf, asyncRoute(async (req, res) => {
    await service.updateRedemption(req.params.id, req.body);
    res.redirect('/xin-tien/admin');
  }));

  router.use(['/api/donations', '/api/game', '/api/webhooks/sepay'], (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/api/donations/config', (req, res) => res.json(service.publicConfig()));
  router.post('/api/game/wallets', createLimiter, asyncRoute(async (req, res) => res.status(201).json(await service.createWallet())));
  router.get('/api/game/wallet', asyncRoute(async (req, res) => res.json(await service.wallet(walletToken(req)))));
  router.get('/api/game/current', asyncRoute(async (req, res) => res.json(await service.currentGame(walletToken(req)))));
  router.post('/api/game/sessions', gameLimiter, express.json({ limit: '8kb' }), asyncRoute(async (req, res) => res.status(201).json(await service.startGame(walletToken(req), req.body))));
  router.post('/api/game/sessions/:id/action', gameLimiter, express.json({ limit: '8kb' }), asyncRoute(async (req, res) => res.json(await service.play(walletToken(req), req.params.id, req.body))));
  router.post('/api/game/redemptions', createLimiter, express.json({ limit: '8kb' }), asyncRoute(async (req, res) => res.status(201).json(await service.redeem(walletToken(req), req.body))));
  router.get('/api/game/redemption', asyncRoute(async (req, res) => res.json(await service.redemption(walletToken(req)))));
  router.post('/api/donations', createLimiter, express.json({ limit: '8kb' }), asyncRoute(async (req, res) => res.status(201).json(await service.create(req.body, walletToken(req)))));
  router.get('/api/donations/status', asyncRoute(async (req, res) => res.json(await service.status(req.get('X-Donation-Token'), walletToken(req)))));
  router.get('/api/donations/events', (req, res) => res.json({ events: [], cursor: Number(req.query.after || 0), hasMore: false }));
  router.post('/api/webhooks/sepay', (req, res, next) => {
    if (!service.publicConfig().ready) return res.status(503).json({ error: 'Chưa cấu hình nhận tiền.' });
    if (!verifyKey(req.get('Authorization'), service.config.webhookKey)) return res.status(401).json({ error: 'Webhook không được xác thực.' });
    next();
  }, express.json({ limit: '32kb' }), asyncRoute(async (req, res) => res.json(await service.receive(req.body))));
  router.use((error, req, res, next) => {
    if (error instanceof DonationError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu vượt giới hạn.' });
    console.error('Game storage operation failed:', error.code || error.name);
    res.status(503).json({ error: 'Kết nối dữ liệu đang gián đoạn. Vui lòng thử lại sau.' });
  });
  return router;
}

module.exports = { createDonationRouter };
