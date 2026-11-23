const crypto = require('node:crypto');
const express = require('express');

const { PIECES, STANCES } = require('./stats');

const BASE = '/co-tuong-admin';
const PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const OPPONENT = {
  r: { name: 'Thiết Xa', piece: 'Xe' },
  c: { name: 'Hỏa Lôi', piece: 'Pháo' },
  n: { name: 'Phi Vân', piece: 'Mã' },
  p: { name: 'A Lực', piece: 'Tốt' },
  a: { name: 'Văn Khanh', piece: 'Sĩ' },
  b: { name: 'Sơn Tượng', piece: 'Tượng' },
  k: { name: 'Uy Viễn Đại Tướng', piece: 'Tướng' },
};
const STANCE_LABEL = { attack: 'Công', defense: 'Thủ' };
const RESULT_LABEL = { win: 'Người thắng', loss: 'Máy thắng', draw: 'Hòa' };

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');
const when = (at) =>
  at ? new Date(at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : '–';

const CSS = `
:root{--bg:#f4ecdc;--card:#faf5ea;--ink:#2a1d12;--muted:#7a6a58;--line:#e2d6bf;--red:#b3261a;--green:#2f7d4f;--gold:#b8892b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Segoe UI",system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 20px 64px}
header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:20px}
h1{margin:0;font-size:26px;font-family:Georgia,"Times New Roman",serif}h2{margin:32px 0 12px;font-size:18px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.stat b{display:block;font-size:30px;line-height:1.1;font-family:Georgia,serif}.stat span{color:var(--muted);font-size:13px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:middle}th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;background:#f0e6d1}
tr:last-child td{border-bottom:0}.num{text-align:right;font-variant-numeric:tabular-nums}
.wrap{overflow-x:auto;border-radius:12px}.bar{display:inline-block;height:8px;border-radius:4px;background:var(--red);vertical-align:middle;min-width:2px}
.pill{display:inline-block;padding:2px 9px;border-radius:99px;font-size:12px;background:#ece0c8}.pill.bad{background:#f3d6d1;color:var(--red)}.pill.ok{background:#d6ead9;color:var(--green)}
button,.btn{font:inherit;border:1px solid var(--line);background:#fff;border-radius:8px;padding:5px 11px;cursor:pointer;color:var(--ink);text-decoration:none}
button.danger{color:var(--red);border-color:#e3b9b2}button.primary{background:var(--red);border-color:var(--red);color:#fff}
form.inline{display:inline;margin:0}input[type=search],input[type=password]{font:inherit;padding:8px 11px;border:1px solid var(--line);border-radius:8px;background:#fff;min-width:240px}
.muted{color:var(--muted)}.err{color:var(--red)}.login{max-width:380px;margin:12vh auto;padding:0 20px}.login .card{display:grid;gap:12px}
.tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
`;

function shell(title, body) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

function loginPage(error) {
  return shell(
    'Quản trị Cờ tướng',
    `<div class="login"><form class="card" method="post" action="${BASE}/login"><h1>Quản trị Cờ tướng</h1><input type="password" name="password" placeholder="Mật khẩu quản trị" required autofocus><button class="primary">Đăng nhập</button>${
      error ? '<span class="err">Mật khẩu không đúng hoặc thử quá nhiều lần.</span>' : ''
    }</form></div>`,
  );
}

function countsRow(counts) {
  const c = counts || {};
  return { games: c.games || 0, wins: c.wins || 0, losses: c.losses || 0, draws: c.draws || 0 };
}

function dashboard({ csrf, summary, accountTotal, accounts, recent, engine, filter, notice }) {
  const total = countsRow(summary.total);
  const cards = [
    [accountTotal, 'Tài khoản đã tạo'],
    [total.games, 'Ván đã đánh với máy'],
    [pct(total.wins, total.games), 'Người chơi thắng máy'],
    [pct(total.losses, total.games), 'Máy thắng'],
    [total.draws, 'Ván hòa'],
  ]
    .map(([value, label]) => `<div class="card stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`)
    .join('');

  const engineCard = `<div class="grid">
    <div class="card stat"><b>${engine.available ? 'Đang chạy' : 'Không có'}</b><span>Pikafish</span></div>
    <div class="card stat"><b>${esc(engine.nodes ? engine.nodes.toLocaleString('vi-VN') : '–')}</b><span>Số nút mỗi nước</span></div>
    <div class="card stat"><b>${esc(engine.queue)}</b><span>Đang chờ trong hàng</span></div>
    <div class="card stat"><b>${esc(engine.moves)}</b><span>Nước đã tính từ lúc khởi động (${esc(when(engine.since))})</span></div>
    <div class="card stat"><b>${esc(engine.moves ? `${Math.round(engine.waitTotalMs / engine.moves / 100) / 10}s` : '–')}</b><span>Chờ trung bình · lâu nhất ${esc(Math.round(engine.waitMaxMs / 100) / 10)}s</span></div>
    <div class="card stat"><b>${esc(engine.failed)}</b><span>Lỗi hoặc quá tải · bị chặn ${esc(engine.limited)}</span></div>
  </div>${engine.lastError ? `<p class="err">Lỗi gần nhất: ${esc(engine.lastError)}</p>` : ''}`;

  const opponentRows = PIECES.flatMap((piece) =>
    STANCES.map((stance) => {
      const c = countsRow(summary.byOpponent[`${piece}-${stance}`]);
      const width = c.games ? Math.max(2, Math.round((c.losses / c.games) * 100)) : 0;
      return `<tr><td>${esc(OPPONENT[piece].name)} <span class="muted">· ${esc(OPPONENT[piece].piece)}</span></td><td>${STANCE_LABEL[stance]}</td><td class="num">${c.games}</td><td class="num">${c.wins}</td><td class="num">${c.draws}</td><td class="num">${c.losses}</td><td class="num">${pct(c.losses, c.games)}</td><td><span class="bar" style="width:${width}px"></span></td></tr>`;
    }),
  ).join('');

  const days = Object.keys(summary.byDay).sort().reverse().slice(0, 14);
  const dayRows = days.length
    ? days
        .map((day) => {
          const c = countsRow(summary.byDay[day]);
          return `<tr><td>${esc(day)}</td><td class="num">${c.games}</td><td class="num">${c.wins}</td><td class="num">${c.draws}</td><td class="num">${c.losses}</td><td class="num">${pct(c.wins, c.games)}</td></tr>`;
        })
        .join('')
    : '<tr><td colspan="6" class="muted">Chưa có ván nào.</td></tr>';

  const shown = accounts.filter((a) => !filter || a.username.includes(filter));
  const accountRows = shown.length
    ? shown
        .map((a) => {
          const name = esc(a.username);
          const action = (path, label, cls, confirmText) =>
            `<form class="inline" method="post" action="${BASE}/accounts/${name}/${path}"${
              confirmText ? ` onsubmit="return confirm('${esc(confirmText)}')"` : ''
            }><input type="hidden" name="csrf" value="${esc(csrf)}"><button class="${cls}">${label}</button></form>`;
          return `<tr><td><b>${name}</b></td><td>${esc(when(a.createdAt))}</td><td class="num">${a.gamesPlayed}</td><td class="num">${a.wins}/${a.losses}/${a.draws}</td><td>${
            a.disabled ? '<span class="pill bad">Đã khóa</span>' : '<span class="pill ok">Hoạt động</span>'
          }</td><td>${
            a.disabled ? action('enable', 'Mở khóa', '', '') : action('disable', 'Khóa', '', `Khóa tài khoản ${a.username}?`)
          } ${action('delete', 'Xóa', 'danger', `Xóa hẳn tài khoản ${a.username}? Không hoàn tác được.`)}</td></tr>`;
        })
        .join('')
    : '<tr><td colspan="6" class="muted">Không có tài khoản nào.</td></tr>';

  const recentRows = recent.length
    ? recent
        .map((g) => {
          const who = g.username ? esc(g.username) : '<span class="muted">Khách</span>';
          const opponent = OPPONENT[g.piece] ? `${esc(OPPONENT[g.piece].name)} · ${STANCE_LABEL[g.stance] || ''}` : '?';
          return `<tr><td>${esc(when(g.at))}</td><td>${who}</td><td>${opponent}</td><td>${esc(RESULT_LABEL[g.result] || g.result)}</td><td class="num">${esc(g.plies)}</td></tr>`;
        })
        .join('')
    : '<tr><td colspan="5" class="muted">Chưa có ván nào.</td></tr>';

  return shell(
    'Quản trị Cờ tướng',
    `<main><header class="top"><h1>Quản trị Cờ tướng</h1><form method="post" action="${BASE}/logout"><input type="hidden" name="csrf" value="${esc(csrf)}"><button>Đăng xuất</button></form></header>
    ${notice ? `<p class="pill ok">${esc(notice)}</p>` : ''}
    <div class="grid">${cards}</div>
    <h2>Máy chủ Pikafish</h2>${engineCard}
    <h2>Tỷ lệ theo đối thủ</h2><div class="wrap"><table><thead><tr><th>Đối thủ</th><th>Lối</th><th class="num">Ván</th><th class="num">Người thắng</th><th class="num">Hòa</th><th class="num">Máy thắng</th><th class="num">% máy thắng</th><th></th></tr></thead><tbody>${opponentRows}</tbody></table></div>
    <h2>14 ngày gần nhất</h2><div class="wrap"><table><thead><tr><th>Ngày</th><th class="num">Ván</th><th class="num">Người thắng</th><th class="num">Hòa</th><th class="num">Máy thắng</th><th class="num">% người thắng</th></tr></thead><tbody>${dayRows}</tbody></table></div>
    <h2>Tài khoản (${accounts.length} mới nhất)</h2>
    <form class="tools" method="get" action="${BASE}"><input type="search" name="q" value="${esc(filter)}" placeholder="Tìm tên đăng nhập"><button>Tìm</button>${filter ? `<a class="btn" href="${BASE}">Xóa lọc</a>` : ''}</form>
    <div class="wrap"><table><thead><tr><th>Tên</th><th>Tạo lúc</th><th class="num">Ván online</th><th class="num">T/B/H</th><th>Trạng thái</th><th></th></tr></thead><tbody>${accountRows}</tbody></table></div>
    <h2>Ván với máy gần đây</h2><div class="wrap"><table><thead><tr><th>Lúc</th><th>Người chơi</th><th>Đối thủ</th><th>Kết quả</th><th class="num">Số nước</th></tr></thead><tbody>${recentRows}</tbody></table></div>
    </main>`,
  );
}

function loginLimiter(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter((at) => now - at < windowMs);
    if (recent.length >= max) return res.redirect(`${BASE}/login?error=1`);
    recent.push(now);
    hits.set(req.ip, recent);
    next();
  };
}

/** Owner-only page: accounts, the vs-machine record and the engine. Everything is behind the site's admin session. */
function mountAdmin(router, { accounts, stats, engine, isAdmin, authenticateAdmin }) {
  const form = express.urlencoded({ extended: false, limit: '2kb' });
  const secure = (res) => res.set({ 'Content-Security-Policy': PAGE_CSP, 'Cache-Control': 'no-store' });
  const pageOnly = (req, res, next) => (isAdmin?.(req) ? next() : res.redirect(`${BASE}/login`));
  const csrfOnly = (req, res, next) => {
    const sent = Buffer.from(String(req.body?.csrf || ''));
    const real = Buffer.from(String(req.session?.csrf || ''));
    if (!real.length || sent.length !== real.length || !crypto.timingSafeEqual(sent, real)) {
      return res.status(403).type('text/plain').send('Phiên không hợp lệ, hãy tải lại trang.');
    }
    next();
  };

  router.get(`${BASE}/login`, (req, res) => secure(res).send(loginPage(Boolean(req.query.error))));
  router.post(`${BASE}/login`, loginLimiter(8, 15 * 60_000), form, (req, res) => {
    if (!authenticateAdmin?.(req.body?.password || '')) return res.redirect(`${BASE}/login?error=1`);
    req.session.regenerate((error) => {
      if (error) return res.status(500).send('Không thể tạo phiên đăng nhập');
      req.session.user = 'admin';
      req.session.csrf = crypto.randomBytes(24).toString('hex');
      req.session.save((saveError) => (saveError ? res.status(500).send('Không thể lưu phiên') : res.redirect(BASE)));
    });
  });
  router.post(`${BASE}/logout`, pageOnly, form, csrfOnly, (req, res) => {
    req.session.destroy(() => res.redirect(`${BASE}/login`));
  });

  router.get(BASE, pageOnly, async (req, res) => {
    try {
      const [summary, recent, accountList, accountTotal] = await Promise.all([
        stats ? stats.summary() : { total: {}, byOpponent: {}, byDay: {} },
        stats ? stats.recent(50) : [],
        accounts ? accounts.list(200) : [],
        accounts ? accounts.count() : 0,
      ]);
      const filter = String(req.query.q || '').trim().toLowerCase().slice(0, 20);
      const notice = { disabled: 'Đã khóa tài khoản.', enabled: 'Đã mở khóa.', deleted: 'Đã xóa tài khoản.' }[req.query.done] || '';
      secure(res).send(
        dashboard({ csrf: req.session.csrf, summary, accountTotal, accounts: accountList, recent, engine: engine(), filter, notice }),
      );
    } catch (error) {
      console.error('co-tuong admin failed:', error.message);
      secure(res).status(500).type('text/plain').send('Không đọc được dữ liệu. Kiểm tra kết nối cơ sở dữ liệu.');
    }
  });

  const act = (path, run, done) =>
    router.post(`${BASE}/accounts/:username/${path}`, pageOnly, form, csrfOnly, async (req, res) => {
      if (!accounts) return res.status(503).type('text/plain').send('Tài khoản chưa được cấu hình.');
      await run(req.params.username);
      res.redirect(`${BASE}?done=${done}`);
    });
  act('disable', (name) => accounts.setDisabled(name, true), 'disabled');
  act('enable', (name) => accounts.setDisabled(name, false), 'enabled');
  act('delete', (name) => accounts.remove(name), 'deleted');
}

module.exports = { mountAdmin, BASE };
