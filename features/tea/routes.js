const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { TeaError } = require('./service');

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function createTeaRouter({ service, isAdmin }) {
  const router = express.Router();
  const assets = path.join(__dirname, '../../public/tea');
  const json = express.json({ limit: '24kb' });
  const token = req => req.get('X-Wallet-Token');
  const asyncRoute = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const adminOnly = (req, res, next) => isAdmin?.(req) ? next() : res.redirect('/xin-tien/admin/login?next=tea');
  const csrf = req => req.session.csrf ||= crypto.randomBytes(24).toString('hex');
  const checkCsrf = (req, res, next) => {
    const expected = Buffer.from(String(req.session.csrf || '')); const actual = Buffer.from(String(req.body.csrf || ''));
    if (!expected.length || expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return res.status(403).send('Invalid admin session.');
    next();
  };
  const page = body => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pixel Tea Café admin</title><style>body{margin:0;background:#201914;color:#f7ead0;font:15px/1.5 system-ui,sans-serif}.wrap{max-width:1080px;margin:32px auto;padding:0 18px}.card{background:#34271e;border:2px solid #6d4c31;border-radius:12px;padding:18px;margin:14px 0}a{color:#ffd166}button,input{font:inherit;padding:10px 13px;border-radius:7px;border:1px solid #946d48}button{background:#e76f51;color:white;font-weight:800}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:12px}.muted{color:#cdbb9a}.paid{color:#8bd450}</style></head><body><main class="wrap">${body}</main></body></html>`;

  router.use('/assets/tea', express.static(assets, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
  router.get('/', (req, res) => res.redirect(302, '/tra-da'));
  router.get('/tra-da', (req, res) => {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://img.vietqr.io data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    res.sendFile(path.join(assets, 'index.html'));
  });
  router.use('/api/tea', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/api/tea/config', asyncRoute(async (req, res) => { const ready = service.paymentReady(); res.json({ ready, menu: await service.menu(), bankTransferOnly: true, ...(ready ? { bank: service.config.bank, account: service.config.account, accountName: service.config.accountName } : {}) }); }));
  router.get('/api/tea/profile', asyncRoute(async (req, res) => res.json(await service.profile(token(req)))));
  router.put('/api/tea/profile', json, asyncRoute(async (req, res) => res.json(await service.saveProfile(token(req), req.body))));
  router.get('/api/tea/state', asyncRoute(async (req, res) => { await service.walletIdFor(token(req)); res.json(await service.publicState()); }));
  router.post('/api/tea/seats/:seatId', json, asyncRoute(async (req, res) => res.json(await service.seat(token(req), req.params.seatId))));
  router.post('/api/tea/seats/:seatId/ask', json, asyncRoute(async (req, res) => res.status(201).json(await service.askToSit(token(req), req.params.seatId))));
  router.get('/api/tea/seat-requests', asyncRoute(async (req, res) => res.json(await service.seatRequestsFor(token(req)))));
  router.post('/api/tea/seat-requests/:id/respond', json, asyncRoute(async (req, res) => res.json(await service.respondSeatRequest(token(req), req.params.id, req.body.accepted === true))));
  router.delete('/api/tea/seat', asyncRoute(async (req, res) => res.json(await service.leave(token(req)))));
  router.get('/api/tea/chat', asyncRoute(async (req, res) => res.json(await service.chats(token(req), req.query.after))));
  router.post('/api/tea/chat', json, asyncRoute(async (req, res) => res.status(201).json(await service.chat(token(req), req.body))));
  router.post('/api/tea/orders', json, asyncRoute(async (req, res) => res.status(201).json(await service.order(token(req), req.body))));
  router.get('/api/tea/order', asyncRoute(async (req, res) => res.json(await service.currentOrder(token(req)))));
  router.delete('/api/tea/order', asyncRoute(async (req, res) => res.json(await service.cancelOrder(token(req)))));
  router.post('/api/tea/items/consume', json, asyncRoute(async (req, res) => res.json(await service.consume(token(req), req.body))));
  router.post('/api/tea/cards', json, asyncRoute(async (req, res) => res.status(201).json(await service.startCard(token(req), req.body))));
  router.get('/api/tea/cards/current', asyncRoute(async (req, res) => res.json(await service.cardState(token(req)))));
  router.post('/api/tea/cards/action', json, asyncRoute(async (req, res) => res.json(await service.cardAction(token(req), req.body))));
  router.post('/api/tea/tienlen', json, asyncRoute(async (req, res) => res.status(201).json(await service.startTienLen(token(req), req.body))));
  router.get('/api/tea/tienlen/current', asyncRoute(async (req, res) => res.json(await service.tienLenState(token(req)))));
  router.post('/api/tea/tienlen/action', json, asyncRoute(async (req, res) => res.json(await service.tienLenAction(token(req), req.body))));
  router.post('/api/tea/card-games/:key', json, asyncRoute(async (req, res) => res.status(201).json(await service.startClassicCard(token(req), { ...req.body, key: req.params.key }))));
  router.get('/api/tea/card-games/:key/current', asyncRoute(async (req, res) => res.json(await service.classicCardState(token(req), req.params.key))));
  router.post('/api/tea/card-games/:key/action', json, asyncRoute(async (req, res) => res.json(await service.classicCardAction(token(req), { ...req.body, key: req.params.key }))));
  router.post('/api/tea/games', json, asyncRoute(async (req,res)=>res.status(201).json({game:await service.startTableGame(token(req),req.body)})));
  router.get('/api/tea/games/:key', asyncRoute(async (req,res)=>res.json(await service.tableGameState(token(req),req.params.key))));
  router.post('/api/tea/games/:key/action', json, asyncRoute(async (req,res)=>res.json({game:await service.tableGameAction(token(req),{...req.body,key:req.params.key})})));
  router.get('/api/tea/fights/current', asyncRoute(async (req, res) => res.json(await service.fightState(token(req)))));
  router.post('/api/tea/fights', json, asyncRoute(async (req, res) => res.status(201).json({ fight: await service.challengeFight(token(req), req.body.opponentId) })));
  router.post('/api/tea/fights/:id/respond', json, asyncRoute(async (req, res) => res.json({ fight: await service.respondFight(token(req), req.params.id, req.body.accepted === true) })));
  router.post('/api/tea/fights/:id/hit', json, asyncRoute(async (req, res) => res.json({ fight: await service.hitFight(token(req), req.params.id, req.body, req.get('X-Tea-Socket-ID')) })));
  router.post('/api/tea/fights/:id/quit', json, asyncRoute(async (req, res) => res.json({ fight: await service.forfeitFight(token(req), req.params.id) })));

  router.get('/tra-da/admin', adminOnly, asyncRoute(async (req, res) => {
    const [rows, prices] = await Promise.all([service.adminOrders(), service.menu()]); const key = csrf(req);
    const cards = rows.map(row => `<article class="card"><strong>${esc(row.kind === 'tea' ? 'Iced tea' : 'Snack plate')}</strong> · <span class="${row.status === 'paid' ? 'paid' : ''}">${esc(row.status)}</span><p>${esc(row.code)} · ${Number(row.price).toLocaleString('vi-VN')}đ · received ${Number(row.paidAmount).toLocaleString('vi-VN')}đ</p><p class="muted">${esc(row.createdAt)} · wallet ${esc(row.walletId)}</p>${row.status === 'paid' ? `<form method="post" action="/tra-da/admin/orders/${encodeURIComponent(row.id)}/redeliver"><input type="hidden" name="csrf" value="${key}"><button>Send waiter again</button></form>` : ''}</article>`).join('') || '<div class="card">No café orders yet.</div>';
    res.send(page(`<p><a href="/tra-da">← Café</a> · <a href="/xin-tien/admin">Wallet admin</a></p><h1>Pixel Tea Café</h1><section class="card"><h2>Prices for new orders</h2><form method="post" action="/tra-da/admin/prices"><input type="hidden" name="csrf" value="${key}"><label>Iced tea <input name="tea" type="number" step="1000" value="${prices.tea}"></label> <label>Snack plate <input name="snack" type="number" step="1000" value="${prices.snack}"></label> <button>Save</button></form></section><div class="grid">${cards}</div>`));
  }));
  router.post('/tra-da/admin/prices', adminOnly, express.urlencoded({ extended: false, limit: '8kb' }), checkCsrf, asyncRoute(async (req, res) => { await service.updatePrices({ tea: Number(req.body.tea), snack: Number(req.body.snack) }); res.redirect('/tra-da/admin'); }));
  router.post('/tra-da/admin/orders/:id/redeliver', adminOnly, express.urlencoded({ extended: false, limit: '8kb' }), checkCsrf, asyncRoute(async (req, res) => { await service.redeliver(req.params.id); res.redirect('/tra-da/admin'); }));

  router.use((error, req, res, next) => {
    if (error instanceof TeaError || error.tableGameError || error.tienLenError || error.classicCardError || error.brawlError) return res.status(error.status).json({ error: error.message, code: error.code });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.', code: 'bad_json' });
    console.error('Tea café operation failed:', error.code || error.name);
    res.status(503).json({ error: 'The café connection is taking a break. Please try again.', code: 'storage_error' });
  });
  return router;
}

function attachTeaSockets(io, service) {
  service.attachIO(io);
  io.use(async (socket, next) => {
    try { socket.data.tea = await service.connect(socket.handshake.auth?.token, socket); next(); }
    catch (error) { next(new Error(error.code || 'unauthorized')); }
  });
  io.on('connection', socket => {
    socket.emit('tea:ready', socket.data.tea);
    socket.broadcast.emit('tea:state-request');
    socket.on('tea:move', input => service.move(socket.data.walletId, input));
    socket.on('tea:fight-input', (input, acknowledge) => {
      try {
        const fight = service.fightInput(socket.data.walletId, socket.id, input);
        if (typeof acknowledge === 'function') acknowledge({ ok: true, fight });
      } catch (error) {
        const payload = { ok: false, error: error.message, code: error.code || 'fight_unavailable' };
        if (typeof acknowledge === 'function') acknowledge(payload);
        else if (error.report !== false) socket.emit('tea:fight-error', payload);
      }
    });
    socket.on('disconnect', () => service.disconnect(socket.data.walletId, socket.id));
  });
}

module.exports = { createTeaRouter, attachTeaSockets };
