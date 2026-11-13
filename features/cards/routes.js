const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { createCardService, CardError, MAX_UPLOAD_BYTES } = require('./service');
const { PALETTES, ICONS } = require('./validate');
const { ATTENDING } = require('../graduation/service');

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
// JSON inside a <script> block: no character sequence can close the tag or open a comment.
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://img.vietqr.io", "connect-src 'self'", "media-src 'none'", "object-src 'none'",
  "base-uri 'none'", "frame-ancestors 'self'", "form-action 'self'",
].join('; ');

function createCardsRouter(options = {}) {
  const router = express.Router();
  const assets = path.join(__dirname, '../../public/thiep');
  const service = options.service || createCardService({
    db: options.db || null,
    dir: options.dir || path.join(__dirname, '../../data/cards'),
    mailer: options.mailer,
    publicUrl: options.publicUrl || '',
    supportUrl: options.supportUrl || undefined,
  });
  const production = process.env.NODE_ENV === 'production';
  const asyncRoute = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 2 } });

  // Stamp local css/js links with a content hash so a deploy never mixes old and new files.
  const stamp = html => html.replace(/(\/assets\/thiep\/)([\w.-]+\.(?:css|js))"/g, (match, prefix, file) => {
    const source = path.join(assets, file);
    if (!fs.existsSync(source)) return match;
    return `${prefix}${file}?v=${crypto.createHash('sha1').update(fs.readFileSync(source)).digest('hex').slice(0, 10)}"`;
  });
  const cache = new Map();
  const template = name => {
    if (production && cache.has(name)) return cache.get(name);
    const html = stamp(fs.readFileSync(path.join(assets, name), 'utf8'));
    if (production) cache.set(name, html);
    return html;
  };
  const sendPage = (res, html, status = 200) => {
    res.status(status).set({ 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' }).type('html').send(html);
  };
  const imageUrl = imageId => (imageId ? `/thiep/anh/${imageId}.webp` : '');
  const renderCard = (card, mode) => {
    const c = card?.content;
    const title = c ? `${c.headline} · ${c.nickname}` : 'Thiệp tốt nghiệp';
    const when = c ? `${c.start}${c.end ? ` – ${c.end}` : ''} · ${c.date.split('-').reverse().join('/')}` : '';
    const desc = c ? `${c.fullName || c.nickname} trân trọng mời bạn đến chung vui ngày tốt nghiệp. ${when}${c.venue.name ? ` · ${c.venue.name}` : ''}` : 'Tạo thiệp mời tốt nghiệp online của riêng bạn.';
    const image = card?.look?.portrait?.type === 'photo' ? imageUrl(card.look.portrait.photoId) : '/assets/thiep/og.png';
    return template('card.html')
      .replace('{{ROBOTS}}', mode === 'live' ? 'index' : 'noindex')
      .replaceAll('{{TITLE}}', esc(title))
      .replaceAll('{{DESC}}', esc(desc))
      .replace('{{IMAGE}}', esc(image))
      .replace('{{THEME}}', esc(card?.look?.colors?.bg || '#e3f5e8'))
      .replace('{{DATA}}', safeJson({ mode, card }));
  };
  const messagePage = (title, text) => template('message.html').replaceAll('{{TITLE}}', esc(title)).replace('{{TEXT}}', esc(text));

  const limiter = (limit, windowMs, message, key = req => req.ip) => {
    const map = new Map();
    return (req, res, next) => {
      const at = Date.now();
      for (const [k, item] of map) if (at >= item.until) map.delete(k);
      const id = key(req);
      const bucket = map.get(id) || { count: 0, until: at + windowMs };
      if (bucket.count >= limit || (!map.has(id) && map.size >= 10_000)) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - at) / 1000))));
        return res.status(429).json({ error: message });
      }
      bucket.count++;
      map.set(id, bucket);
      next();
    };
  };
  const createLimiter = limiter(10, 3600_000, 'Bạn tạo hơi nhiều thiệp rồi, thử lại sau một lúc nhé.');
  const uploadLimiter = limiter(30, 3600_000, 'Bạn tải ảnh hơi nhiều rồi, thử lại sau một lúc nhé.');
  const editLimiter = limiter(240, 3600_000, 'Bạn thao tác hơi nhanh, thử lại sau nhé.');
  const publishLimiter = limiter(20, 600_000, 'Bạn thử xuất bản hơi nhiều lần, đợi một chút nhé.');
  const wishLimiter = limiter(5, 600_000, 'Bạn gửi hơi nhanh rồi, đợi một chút rồi thử lại nhé.');
  const cardWishCap = limiter(100, 3600_000, 'Thiệp này đang nhận quá nhiều lời chúc, thử lại sau nhé.', req => String(req.params.code).toUpperCase());
  const loginLimiter = limiter(5, 15 * 60_000, 'Thử đăng nhập quá nhiều lần. Hãy đợi 15 phút.');
  const cardToken = req => req.get('X-Card-Token');

  /* ---------- pages ---------- */
  router.use('/assets/thiep', express.static(assets, { index: false, maxAge: production ? '7d' : 0 }));
  router.get('/taothiep', (req, res) => sendPage(res, template('builder.html')));
  router.get('/thiep/xem-truoc', (req, res) => sendPage(res, renderCard(null, 'preview')));
  router.get('/thiep/anh/:id.webp', asyncRoute(async (req, res) => {
    const image = await service.getImage(req.params.id);
    if (!image) return res.status(404).type('text/plain').send('Không tìm thấy ảnh.');
    res.set({ 'Content-Type': image.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
    res.send(image.data);
  }));
  router.get('/thiep/:code([A-Za-z2-9]{8})', asyncRoute(async (req, res) => {
    try {
      const card = await service.getPublic(req.params.code);
      if (req.params.code !== card.code) return res.redirect(301, `/thiep/${card.code}`);
      sendPage(res, renderCard(card, 'live'));
    } catch (error) {
      if (!(error instanceof CardError)) throw error;
      const draft = error.status === 409;
      sendPage(res, messagePage(draft ? 'Thiệp chưa được xuất bản' : 'Không tìm thấy thiệp', draft
        ? 'Chủ thiệp đang hoàn thiện thiệp này. Bạn quay lại sau nhé.'
        : 'Link thiệp không đúng hoặc thiệp đã bị gỡ.'), draft ? 200 : 404);
    }
  }));
  router.get('/thiep/:code([A-Za-z2-9]{8})/quanly', (req, res) => sendPage(res, template('manage.html')));

  /* ---------- API ---------- */
  router.use('/api/thiep', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/api/thiep/config', (req, res) => res.json({ price: service.price, hardshipPrice: service.hardshipPrice, supportUrl: service.supportUrl, paymentsReady: service.paymentsReady, mailConfigured: service.mailConfigured, palettes: PALETTES, icons: ICONS, attending: ATTENDING }));
  router.post('/api/thiep/cards', createLimiter, express.json({ limit: '16kb' }), asyncRoute(async (req, res) => {
    const { card, ownerToken } = await service.create(req.body);
    res.status(201).json({ card, ownerToken, manage: `/thiep/${card.code}/quanly#k=${ownerToken}` });
  }));
  router.get('/api/thiep/cards/:code', editLimiter, asyncRoute(async (req, res) => res.json({ card: await service.getForOwner(req.params.code, cardToken(req)) })));
  router.put('/api/thiep/cards/:code', editLimiter, express.json({ limit: '16kb' }), asyncRoute(async (req, res) => res.json({ card: await service.update(req.params.code, cardToken(req), req.body) })));
  router.post('/api/thiep/cards/:code/hardship', editLimiter, express.json({ limit: '4kb' }), asyncRoute(async (req, res) => res.json({ card: await service.requestHardship(req.params.code, cardToken(req), req.body?.reason) })));
  router.post('/api/thiep/cards/:code/transfer', publishLimiter, express.json({ limit: '2kb' }), asyncRoute(async (req, res) => res.json({ card: await service.recordTransfer(req.params.code, cardToken(req), req.get('X-Wallet-Token'), req.body) })));
  router.post('/api/thiep/cards/:code/email', editLimiter, express.json({ limit: '2kb' }), asyncRoute(async (req, res) => res.json(await service.setEmail(req.params.code, cardToken(req), req.body?.email))));
  router.post('/api/thiep/cards/:code/images', uploadLimiter, upload.single('image'), asyncRoute(async (req, res) => {
    const image = await service.uploadImage(req.params.code, cardToken(req), req.file);
    res.status(201).json({ id: image.id, url: imageUrl(image.id) });
  }));
  router.post('/api/thiep/cards/:code/publish', publishLimiter, express.json({ limit: '2kb' }), asyncRoute(async (req, res) => {
    res.json({ card: await service.publish(req.params.code, cardToken(req), req.get('X-Wallet-Token'), req.body) });
  }));
  router.post('/api/thiep/cards/:code/wishes', wishLimiter, cardWishCap, express.json({ limit: '4kb' }), asyncRoute(async (req, res) => {
    if (req.body?.website) return res.status(201).json({ ok: true });
    await service.submitWish(req.params.code, req.body);
    res.status(201).json({ ok: true });
  }));
  router.get('/api/thiep/cards/:code/wishes', editLimiter, asyncRoute(async (req, res) => res.json({ wishes: await service.listWishes(req.params.code, cardToken(req)) })));
  router.delete('/api/thiep/cards/:code/wishes/:id', editLimiter, asyncRoute(async (req, res) => { await service.removeWish(req.params.code, cardToken(req), req.params.id); res.json({ ok: true }); }));
  router.get('/api/thiep/cards/:code/wishes.csv', editLimiter, asyncRoute(async (req, res) => {
    const wishes = await service.listWishes(req.params.code, cardToken(req));
    const cell = value => `"${(/^[=+\-@\t\r]/.test(String(value)) ? `'${value}` : String(value)).replace(/"/g, '""')}"`;
    const rows = wishes.map(w => [cell(service.vnTime(w.createdMs)), cell(w.name), cell(ATTENDING[w.attending] || ''), cell(w.message)].join(','));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="loi-chuc.csv"' });
    res.send('\ufeff' + ['Thời gian,Tên,Tham dự,Lời chúc', ...rows].join('\r\n'));
  }));

  /* ---------- admin ---------- */
  const isAdmin = req => Boolean(options.isAdmin?.(req));
  const adminOnly = (req, res, next) => (isAdmin(req) ? next() : res.redirect('/thiep/admin/login'));
  const ensureCsrf = req => req.session.csrf ||= crypto.randomBytes(24).toString('hex');
  const csrfOnly = (req, res, next) => {
    const expected = Buffer.from(String(req.session?.csrf || ''));
    const actual = Buffer.from(String(req.body?.csrf || ''));
    if (!expected.length || expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return res.status(403).send('Phiên quản trị không hợp lệ.');
    next();
  };
  const shell = (title, body) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/assets/thiep/icon.svg" type="image/svg+xml"><link rel="icon" href="/assets/thiep/icon-48.png" sizes="48x48" type="image/png"><title>${esc(title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#eef3f0;color:#1f2d27;font:15px/1.5 'Segoe UI',system-ui,sans-serif}main{width:min(1200px,100%);margin:0 auto;padding:24px 16px 64px}
h1{margin:0 0 4px;font-size:1.5rem}.muted{color:#5f7068;margin:0}.top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.stats{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}.stat{flex:1 1 140px;padding:12px 16px;border-radius:14px;background:#fff}.stat b{display:block;font-size:1.5rem}.stat span{color:#5f7068;font-size:.9rem}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e3ebe6;vertical-align:top}th{background:#f6f9f7;font-size:.85rem;color:#5f7068}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.8rem;font-weight:700}.published{background:#d9f1e1;color:#1f7a52}.draft{background:#eee;color:#555}.disabled{background:#ffe0e0;color:#b02a2a}
.row{display:flex;gap:6px;flex-wrap:wrap}button{padding:6px 12px;border:0;border-radius:999px;background:#2e9e6e;color:#fff;font:inherit;font-weight:600;cursor:pointer}button.soft{background:#eaf3ee;color:#1f7a52}button.danger{background:#ffe0e0;color:#b02a2a}form{margin:0}a{color:#1f7a52}
h2{margin:28px 0 6px;font-size:1.2rem}.empty{padding:12px 0}.scroll{overflow-x:auto;margin-top:10px}.ok{background:#d9f1e1;color:#1f7a52}.wait{background:#fff1d6;color:#8a5a00}.claim{color:#b45309;font-weight:700;font-size:.85rem}
.why{margin-top:6px;font-size:.85rem}.why summary{cursor:pointer;color:#8a5a00;font-weight:700}.why p{margin:4px 0 0;max-width:36ch;white-space:pre-wrap;overflow-wrap:anywhere;color:#5f7068}
input[type=password]{width:100%;padding:12px 16px;margin:12px 0;border:2px solid #cfe3d7;border-radius:999px;font:inherit}.login{max-width:420px;margin:15vh auto 0;padding:28px;border-radius:22px;background:#fff}
</style></head><body><main>${body}</main></body></html>`;
  const when = ms => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

  router.get('/thiep/admin/login', (req, res) => res.send(shell('Đăng nhập quản trị thiệp', `<form class="login" method="post"><h1>Quản trị thiệp</h1><p class="muted">Nhập mật khẩu quản trị.</p><input type="password" name="password" placeholder="Mật khẩu quản trị" required autofocus>${req.query.error ? '<p class="muted" style="color:#b02a2a">Mật khẩu không đúng.</p>' : ''}<button>Đăng nhập</button></form>`)));
  router.post('/thiep/admin/login', loginLimiter, express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    if (!options.authenticateAdmin?.(req.body.password || '')) return res.redirect('/thiep/admin/login?error=1');
    req.session.regenerate(error => {
      if (error) return res.status(500).send('Không thể tạo phiên quản trị.');
      req.session.user = 'admin';
      req.session.csrf = crypto.randomBytes(24).toString('hex');
      req.session.save(saveError => (saveError ? res.status(500).send('Không thể lưu phiên quản trị.') : res.redirect('/thiep/admin')));
    });
  });
  router.get('/thiep/admin', adminOnly, asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const csrf = ensureCsrf(req);
    const cards = await service.adminList();
    const sold = cards.filter(c => ['paid', 'manual'].includes(c.purchase?.kind) && !c.purchase.refunded);
    const action = (code, name, label, cls = 'soft', confirm = '') => `<form method="post" action="/thiep/admin/cards/${esc(code)}/${name}"${confirm ? ` data-confirm="${esc(confirm)}"` : ''}><input type="hidden" name="csrf" value="${esc(csrf)}"><button class="${cls}">${label}</button></form>`;
    const money = vnd => `${Number(vnd || 0).toLocaleString('vi-VN')}đ`;
    const price = c => (c.hardship ? service.hardshipPrice : service.price);

    // Where the owner's money stands, in plain words.
    const transferInfo = c => {
      if (!c.transfer) return c.status === 'draft' ? '<span class="muted">Chưa bấm xuất bản</span>' : '';
      const received = c.transferState?.status === 'paid';
      const state = received
        ? `<span class="badge ok">Đã nhận ${esc(money(c.transferState.paidAmount))}</span>`
        : `<span class="badge wait">Chưa nhận tiền</span>`;
      const claimed = c.transfer.claimedMs ? `<br><span class="claim">Khách báo đã chuyển lúc ${esc(when(c.transfer.claimedMs))}</span>` : '';
      return `<b>${esc(c.transfer.code)}</b> · ${esc(money(c.transfer.amount))}<br>${state}${claimed}`;
    };
    const purchaseInfo = c => {
      if (!c.purchase) return `<span class="muted">Giá ${price(c)} xu</span>`;
      const kind = { comp: 'Tặng', manual: 'Xác nhận tay', paid: 'Trả bằng ví' }[c.purchase.kind] || c.purchase.kind;
      return `${esc(kind)}${c.purchase.xu ? ` · ${c.purchase.xu} xu` : ''}${c.purchase.refunded ? ' (đã hoàn)' : ''}`;
    };
    const actionsFor = c => [
      c.status === 'published' ? `<a href="/thiep/${esc(c.code)}" target="_blank" rel="noopener">Xem thiệp</a>` : '',
      c.status === 'draft' ? action(c.code, 'confirm', `Xác nhận đã nhận ${price(c) * 1000 / 1000}k`, '', `Xác nhận đã nhận ${money(price(c) * 1000)} cho thiệp ${c.code} và xuất bản?`) : '',
      c.status === 'draft' ? action(c.code, 'comp', 'Tặng miễn phí') : '',
      c.status === 'disabled' ? action(c.code, 'enable', 'Mở lại') : action(c.code, 'disable', 'Khoá', 'danger', `Khoá thiệp ${c.code}?`),
      c.purchase?.kind === 'paid' && !c.purchase.refunded ? action(c.code, 'refund', `Hoàn ${c.purchase.xu} xu`, 'danger', `Hoàn ${c.purchase.xu} xu về ví và gỡ thiệp ${c.code}?`) : '',
    ].filter(Boolean).join('');
    const who = c => `<b>${esc(c.content.nickname)}</b>${c.content.school ? `<br><span class="muted">${esc(c.content.school)}</span>` : ''}${c.hardship ? `<details class="why"><summary>Hoàn cảnh khó khăn</summary><p>${esc(c.hardship.reason)}</p></details>` : ''}`;
    const statusBadge = c => `<span class="badge ${esc(c.status)}">${esc({ draft: 'Nháp', published: 'Đã xuất bản', disabled: 'Đã khoá' }[c.status] || c.status)}</span>`;
    const row = c => `<tr><td><b>${esc(c.code)}</b><br>${statusBadge(c)}</td><td>${who(c)}</td><td>${transferInfo(c)}</td><td>${purchaseInfo(c)}</td><td><span class="muted">Tạo</span> ${esc(when(c.createdMs))}<br><span class="muted">Sửa</span> ${esc(when(c.updatedMs || c.createdMs))}</td><td><div class="row">${actionsFor(c)}</div></td></tr>`;
    const table = (list, empty) => (list.length ? `<div class="scroll"><table><thead><tr><th>Mã</th><th>Thiệp</th><th>Chuyển khoản</th><th>Thanh toán</th><th>Thời gian</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>` : `<p class="muted empty">${empty}</p>`);

    // Drafts whose owner has a transfer going: these may need a hand.
    const waiting = cards.filter(c => c.status === 'draft' && c.transfer).sort((a, b) => (b.transfer.claimedMs || 0) - (a.transfer.claimedMs || 0) || b.updatedMs - a.updatedMs);
    const drafting = cards.filter(c => c.status === 'draft' && !c.transfer);
    const done = cards.filter(c => c.status !== 'draft');

    res.send(shell('Quản trị thiệp tốt nghiệp', `<div class="top"><div><h1>Thiệp tốt nghiệp</h1><p class="muted">Giá ${service.price} xu, ${service.hardshipPrice} xu cho hoàn cảnh khó khăn · ${service.paymentsReady ? 'thanh toán đang bật' : 'chưa có Firestore nên chưa thu tiền được'}</p></div><div class="row"><a href="/taothiep">Trang tạo thiệp</a><a href="/thiep/admin">Tải lại</a></div></div>`
      + `<div class="stats"><div class="stat"><b>${waiting.length}</b><span>Đang chờ tiền</span></div><div class="stat"><b>${drafting.length}</b><span>Đang tạo thiệp</span></div><div class="stat"><b>${cards.filter(c => c.status === 'published').length}</b><span>Đang xuất bản</span></div><div class="stat"><b>${sold.length}</b><span>Đã bán (${sold.filter(c => c.purchase.hardship).length} giá hỗ trợ)</span></div><div class="stat"><b>${(sold.reduce((s, c) => s + c.purchase.xu, 0) * 1000).toLocaleString('vi-VN')}đ</b><span>Doanh thu</span></div></div>`
      + `<h2>Cần xác nhận</h2><p class="muted">Khách đã bấm xuất bản và có mã chuyển khoản. Nếu "Chưa nhận tiền" mà khách báo đã chuyển, hãy kiểm tra sao kê ngân hàng theo nội dung chuyển khoản rồi bấm Xác nhận.</p>${table(waiting, 'Không có ai đang chờ.')}`
      + `<h2>Đang tạo thiệp</h2>${table(drafting, 'Chưa có ai đang tạo.')}`
      + `<h2>Đã xuất bản hoặc đã khoá</h2>${table(done, 'Chưa có thiệp nào xuất bản.')}`
      + `<script src="/assets/thiep/admin.js" defer></script>`));
  }));
  const adminAction = fn => [adminOnly, express.urlencoded({ extended: false, limit: '2kb' }), csrfOnly, asyncRoute(async (req, res) => { await fn(req.params.code); res.redirect('/thiep/admin'); })];
  router.post('/thiep/admin/cards/:code/confirm', ...adminAction(code => service.adminConfirm(code)));
  router.post('/thiep/admin/cards/:code/comp', ...adminAction(code => service.adminComp(code)));
  router.post('/thiep/admin/cards/:code/disable', ...adminAction(code => service.adminSetStatus(code, 'disabled')));
  router.post('/thiep/admin/cards/:code/enable', ...adminAction(code => service.adminSetStatus(code, 'enabled')));
  router.post('/thiep/admin/cards/:code/refund', ...adminAction(code => service.adminRefund(code)));

  router.use((error, req, res, next) => {
    if (error instanceof CardError) {
      if (req.path.startsWith('/api/')) return res.status(error.status).json({ error: error.message });
      return res.status(error.status).send(esc(error.message));
    }
    if (error instanceof multer.MulterError) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Ảnh tối đa 5 MB.' : 'Không nhận được ảnh.' });
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ.' });
    console.error('Card request failed:', error.code || error.name || error.message);
    if (req.path.startsWith('/api/')) return res.status(503).json({ error: 'Máy chủ đang bận, bạn thử lại nhé.' });
    res.status(500).send('Có lỗi xảy ra.');
  });

  if (options.maintenance !== false) {
    const run = () => service.sweep().catch(error => console.error('Card sweep failed:', error.message));
    setTimeout(run, 30_000).unref();
    setInterval(run, 3600_000).unref();
  }

  router.cardService = service;
  return router;
}

module.exports = { createCardsRouter };
