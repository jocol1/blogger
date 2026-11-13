const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createGraduationService, WishError } = require('./service');

const BASE = '/totnghiep';
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function createGraduationRouter(options = {}) {
  const router = express.Router();
  const assets = path.join(__dirname, '../../public/totnghiep');
  const service = options.service || createGraduationService({
    db: options.db || null,
    file: options.file || path.join(__dirname, '../../data/graduation-wishes.json'),
    mailer: options.mailer,
    adminUrl: options.publicUrl ? `${options.publicUrl.replace(/\/$/, '')}${BASE}/admin` : '',
  });
  const production = process.env.NODE_ENV === 'production';
  const asyncRoute = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

  // Stamp every local css/js link with a hash of its content, so a deploy never pairs fresh HTML
  // with a stylesheet the browser cached from the previous one.
  const render = () => {
    const html = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');
    return html.replace(/(\/assets\/totnghiep\/)([\w.-]+\.(?:css|js))"/g, (match, prefix, file) => {
      const source = path.join(assets, file);
      if (!fs.existsSync(source)) return match;
      const version = crypto.createHash('sha1').update(fs.readFileSync(source)).digest('hex').slice(0, 10);
      return `${prefix}${file}?v=${version}"`;
    });
  };
  const page = production ? render() : null;

  const limiter = (map, limit, windowMs, message) => (req, res, next) => {
    const at = Date.now();
    for (const [key, item] of map) if (at >= item.until) map.delete(key);
    const bucket = map.get(req.ip) || { count: 0, until: at + windowMs };
    if (bucket.count >= limit || (!map.has(req.ip) && map.size >= 10_000)) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - at) / 1000))));
      return res.status(429).json({ error: message });
    }
    bucket.count++;
    map.set(req.ip, bucket);
    next();
  };
  const sendLimiter = limiter(new Map(), 5, 10 * 60 * 1000, 'Bạn gửi hơi nhanh rồi, đợi một chút rồi thử lại nhé.');
  const loginLimiter = limiter(new Map(), 5, 15 * 60 * 1000, 'Thử đăng nhập quá nhiều lần. Hãy đợi 15 phút.');
  // One shared ceiling so a script rotating addresses still cannot flood the inbox.
  let hourStart = 0, hourCount = 0;
  const globalCap = (req, res, next) => {
    const at = Date.now();
    if (at - hourStart > 3600_000) { hourStart = at; hourCount = 0; }
    if (++hourCount > 200) return res.status(429).json({ error: 'Hôm nay nhiều lời chúc quá, bạn thử lại sau nhé.' });
    next();
  };

  const isAdmin = req => Boolean(options.isAdmin?.(req));
  const adminOnly = (req, res, next) => isAdmin(req) ? next() : res.redirect(`${BASE}/admin/login`);
  const ensureCsrf = req => req.session.csrf ||= crypto.randomBytes(24).toString('hex');
  const csrfOnly = (req, res, next) => {
    const expected = Buffer.from(String(req.session?.csrf || ''));
    const actual = Buffer.from(String(req.body?.csrf || ''));
    if (!expected.length || expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return res.status(403).send('Phiên quản trị không hợp lệ.');
    next();
  };

  const shell = (title, body) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#e3f5e8;color:#1f3d2e;font:16px/1.55 'Segoe UI',system-ui,sans-serif}
main{width:min(760px,100%);margin:0 auto;padding:28px 16px 64px}h1{margin:0 0 4px;font-size:1.6rem;line-height:1.2}
.muted{color:#5b7d6a;margin:0}.top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.top a,.link{color:#1f7a52;font-weight:600}.note{margin:0 0 18px;padding:12px 16px;border-radius:14px;background:#fff;font-size:.95rem}
.note.warn{background:#fff1d6;color:#8a5a00}.card{margin:0 0 12px;padding:18px 18px 14px;border-radius:20px;background:#fff}
.head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline}.head b{font-size:1.1rem}.head time{color:#5b7d6a;font-size:.9rem}
.msg{margin:8px 0 12px;white-space:pre-wrap;overflow-wrap:anywhere}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.badge{padding:3px 12px;border-radius:999px;font-size:.85rem;font-weight:700;background:#d9f1e1;color:#1f7a52}.badge.bad{background:#ffe0e0;color:#b02a2a}.badge.idle{background:#eee;color:#666}
button,.btn{padding:8px 16px;border:0;border-radius:999px;background:#2e9e6e;color:#fff;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
button.soft{background:#eaf8ef;color:#1f7a52}button.danger{background:#ffe0e0;color:#b02a2a}form{margin:0}
input[type=password]{width:100%;padding:12px 16px;margin:12px 0;border:2px solid #c9e9d4;border-radius:999px;font:inherit}
.login{margin-top:15vh;padding:28px;border-radius:24px;background:#fff}.empty{padding:36px 16px;text-align:center;color:#5b7d6a}
</style></head><body><main>${body}</main></body></html>`;

  const mailBadge = wish => ({
    sent: '<span class="badge">Đã gửi mail</span>',
    failed: '<span class="badge bad">Gửi mail lỗi</span>',
    'not-configured': '<span class="badge idle">Chưa cấu hình mail</span>',
    pending: '<span class="badge idle">Đang gửi mail</span>',
  }[wish.mail] || '<span class="badge idle">Chưa gửi mail</span>');
  const when = ms => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

  router.use('/assets/totnghiep', express.static(assets, { index: false, maxAge: production ? '7d' : 0 }));
  router.get(BASE, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(page || render());
  });
  // The page used to live at /chucmungsinhnhat; keep links that were already sent working.
  router.get('/chucmungsinhnhat', (req, res) => {
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(302, `${BASE}${query}`);
  });

  // Public: leave a wish.
  router.post('/api/totnghiep/wishes', sendLimiter, globalCap, express.json({ limit: '4kb' }), asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    // Hidden field only a script fills in: pretend it worked and keep nothing.
    if (req.body?.website) return res.status(201).json({ ok: true });
    await service.submit(req.body);
    res.status(201).json({ ok: true });
  }));

  // Admin.
  router.get(`${BASE}/admin/login`, (req, res) => res.send(shell('Đăng nhập quản trị', `<form class="login" method="post"><h1>Quản trị thư mời</h1><p class="muted">Nhập mật khẩu quản trị để xem lời chúc.</p><input type="password" name="password" placeholder="Mật khẩu quản trị" required autofocus>${req.query.error ? '<p class="muted" style="color:#b02a2a">Mật khẩu không đúng.</p>' : ''}<button>Đăng nhập</button></form>`)));
  router.post(`${BASE}/admin/login`, loginLimiter, express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    if (!options.authenticateAdmin?.(req.body.password || '')) return res.redirect(`${BASE}/admin/login?error=1`);
    req.session.regenerate(error => {
      if (error) return res.status(500).send('Không thể tạo phiên quản trị.');
      req.session.user = 'admin';
      req.session.csrf = crypto.randomBytes(24).toString('hex');
      req.session.save(saveError => saveError ? res.status(500).send('Không thể lưu phiên quản trị.') : res.redirect(`${BASE}/admin`));
    });
  });

  router.get(`${BASE}/admin`, adminOnly, asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const csrf = ensureCsrf(req);
    const wishes = await service.list();
    const notice = service.mailConfigured
      ? `<p class="note">Mỗi lời chúc mới được gửi về <b>${esc(service.mailTo)}</b>.</p>`
      : `<p class="note warn">Chưa cấu hình gửi mail nên lời chúc chỉ được lưu ở đây. Đặt <b>SMTP_USER</b> và <b>SMTP_PASS</b> (mật khẩu ứng dụng Gmail) để thư tự gửi về <b>${esc(service.mailTo)}</b>.</p>`;
    const cards = wishes.map(wish => `<article class="card"><div class="head"><b>${esc(wish.name)}</b><time>${esc(when(wish.createdMs))}</time></div><p class="msg">${esc(wish.message)}</p><div class="row">${mailBadge(wish)}`
      + (wish.mail !== 'sent' && service.mailConfigured ? `<form method="post" action="${BASE}/admin/wishes/${esc(wish.id)}/resend"><input type="hidden" name="csrf" value="${esc(csrf)}"><button class="soft">Gửi lại mail</button></form>` : '')
      + `<form method="post" action="${BASE}/admin/wishes/${esc(wish.id)}/delete" onsubmit="return confirm('Xoá lời chúc của ${esc(wish.name).replace(/'/g, '')}?')"><input type="hidden" name="csrf" value="${esc(csrf)}"><button class="danger">Xoá</button></form></div></article>`).join('');
    res.send(shell('Lời chúc tốt nghiệp', `<div class="top"><div><h1>Lời chúc cho Thảo Đan</h1><p class="muted">${wishes.length} lời chúc</p></div><div class="row"><a class="link" href="${BASE}">Xem thiệp</a>${wishes.length ? ` <a class="link" href="${BASE}/admin/wishes.csv">Tải CSV</a>` : ''}</div></div>${notice}${cards || '<p class="empty">Chưa có lời chúc nào. Khi bạn bè gửi, lời chúc sẽ hiện ở đây.</p>'}`));
  }));

  router.get(`${BASE}/admin/wishes.csv`, adminOnly, asyncRoute(async (req, res) => {
    // A leading = + - @ would be run as a formula by spreadsheet apps, so defuse it.
    const cell = value => `"${(/^[=+\-@\t\r]/.test(String(value)) ? `'${value}` : String(value)).replace(/"/g, '""')}"`;
    const rows = (await service.list()).map(wish => [cell(when(wish.createdMs)), cell(wish.name), cell(wish.message), cell(wish.mail || '')].join(','));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="loi-chuc-tot-nghiep.csv"', 'Cache-Control': 'no-store' });
    res.send('﻿' + ['Thời gian,Tên,Lời chúc,Mail', ...rows].join('\r\n'));
  }));

  router.post(`${BASE}/admin/wishes/:id/delete`, adminOnly, express.urlencoded({ extended: false, limit: '2kb' }), csrfOnly, asyncRoute(async (req, res) => {
    await service.remove(req.params.id);
    res.redirect(`${BASE}/admin`);
  }));
  router.post(`${BASE}/admin/wishes/:id/resend`, adminOnly, express.urlencoded({ extended: false, limit: '2kb' }), csrfOnly, asyncRoute(async (req, res) => {
    await service.resend(req.params.id);
    res.redirect(`${BASE}/admin`);
  }));

  router.use((error, req, res, next) => {
    if (error instanceof WishError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') return res.status(400).json({ error: 'Lời chúc không hợp lệ.' });
    console.error('Graduation request failed:', error.code || error.name);
    if (req.path.startsWith('/api/')) return res.status(503).json({ error: 'Chưa gửi được lúc này, bạn thử lại nhé.' });
    res.status(500).send('Có lỗi xảy ra.');
  });

  router.graduationService = service;
  return router;
}

module.exports = { createGraduationRouter };
