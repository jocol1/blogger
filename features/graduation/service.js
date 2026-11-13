const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const COLLECTION = 'graduation_wishes';
const NAME_MAX = 40;
const MESSAGE_MAX = 240;
const LIST_LIMIT = 1000;
const DEFAULT_MAIL_TO = 'lytanloc10c1@gmail.com';
const ATTENDING = { yes: 'Sẽ đến', no: 'Không đến được', maybe: 'Chưa chắc' };

class WishError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const clean = (value, max) => String(value ?? '')
  .normalize('NFC')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, max);

// Wishes live in Firestore when the app has it, otherwise in a private JSON file.
function createWishStore({ db, file }) {
  if (db) {
    const col = () => db.collection(COLLECTION);
    return {
      async add(wish) { await col().doc(wish.id).set(wish); },
      async get(id) { const snap = await col().doc(id).get(); return snap.exists ? snap.data() : null; },
      async update(id, patch) { await col().doc(id).set(patch, { merge: true }); },
      async remove(id) { await col().doc(id).delete(); },
      async list() {
        const snap = await col().where('createdMs', '>', 0).orderBy('createdMs').limit(LIST_LIMIT).get();
        return snap.docs.map(doc => doc.data()).reverse();
      },
    };
  }
  let rows = null;
  const load = () => {
    if (rows) return rows;
    try { rows = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { rows = []; }
    return rows;
  };
  const persist = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rows, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  };
  return {
    async add(wish) { load().unshift(wish); persist(); },
    async get(id) { return load().find(row => row.id === id) || null; },
    async update(id, patch) { const row = load().find(item => item.id === id); if (row) { Object.assign(row, patch); persist(); } },
    async remove(id) { rows = load().filter(row => row.id !== id); persist(); },
    async list() { return load().slice(0, LIST_LIMIT).map(row => ({ ...row })); },
  };
}

// Mail goes out through SMTP. Without SMTP_USER and SMTP_PASS nothing is sent and wishes are
// still saved, so the admin page remains the source of truth.
function createMailer(env = process.env) {
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const to = env.GRADUATION_MAIL_TO || DEFAULT_MAIL_TO;
  if (!user || !pass) return { configured: false, to, async send() { throw new Error('SMTP chưa được cấu hình'); } };
  let transport = null;
  const make = () => {
    const nodemailer = require('nodemailer');
    const port = Number(env.SMTP_PORT || 465);
    return nodemailer.createTransport({
      host: env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465,
      auth: { user, pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    });
  };
  return {
    configured: true, to,
    async send({ subject, text, html }) {
      transport ||= make();
      await transport.sendMail({
        from: env.SMTP_FROM || `Thư mời tốt nghiệp <${user}>`, to,
        subject: String(subject).replace(/[\r\n]+/g, ' ').slice(0, 150), text, html,
      });
    },
  };
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const vnTime = ms => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

function wishEmail(wish, adminUrl) {
  const when = vnTime(wish.createdMs);
  const text = [
    `${wish.name} vừa gửi lời chúc mừng tốt nghiệp cho Thảo Đan:`, '', wish.message, '',
    `Tham dự: ${ATTENDING[wish.attending] || 'Chưa cho biết'}`,
    `Gửi lúc: ${when} (giờ Việt Nam)`, ...(adminUrl ? ['', `Xem tất cả lời chúc: ${adminUrl}`] : []),
  ].join('\n');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;background:#e3f5e8;border-radius:20px">`
    + `<p style="margin:0 0 12px;color:#1f7a52;font-weight:700">${escapeHtml(wish.name)} vừa gửi lời chúc cho Thảo Đan</p>`
    + `<p style="margin:0 0 16px;padding:16px;background:#fff;border-radius:14px;color:#1f3d2e;white-space:pre-wrap">${escapeHtml(wish.message)}</p>`
    + `<p style="margin:0 0 6px;color:#1f7a52;font-weight:700">Tham dự: ${escapeHtml(ATTENDING[wish.attending] || 'Chưa cho biết')}</p>`
    + `<p style="margin:0;color:#5b7d6a;font-size:13px">${escapeHtml(when)} (giờ Việt Nam)</p>`
    + (adminUrl ? `<p style="margin:12px 0 0"><a href="${escapeHtml(adminUrl)}" style="color:#1f7a52">Xem tất cả lời chúc</a></p>` : '')
    + '</div>';
  return { subject: `Lời chúc tốt nghiệp mới từ ${wish.name}${ATTENDING[wish.attending] ? ` (${ATTENDING[wish.attending]})` : ''}`, text, html };
}

function createGraduationService({ db = null, file, mailer = createMailer(), adminUrl = '', now = Date.now, id = () => crypto.randomUUID() } = {}) {
  const store = createWishStore({ db, file });

  async function deliver(wish) {
    if (!mailer.configured) { await store.update(wish.id, { mail: 'not-configured' }); return 'not-configured'; }
    try {
      await mailer.send(wishEmail(wish, adminUrl));
      await store.update(wish.id, { mail: 'sent', mailedMs: now(), mailError: null });
      return 'sent';
    } catch (error) {
      console.error('Graduation wish mail failed:', error.code || error.message);
      await store.update(wish.id, { mail: 'failed', mailError: String(error.code || error.message).slice(0, 120) });
      return 'failed';
    }
  }

  return {
    mailTo: mailer.to,
    mailConfigured: mailer.configured,

    // Saves the wish, then mails it. The caller answers the visitor without waiting for the mail;
    // `delivery` settles once the mail attempt is done.
    async submit(input) {
      const name = clean(input?.name, NAME_MAX).replace(/\n/g, ' ');
      const message = clean(input?.message, MESSAGE_MAX);
      if (!name) throw new WishError('Bạn cho Đan biết tên bạn nhé.');
      if (!message) throw new WishError('Bạn viết vài chữ chúc Đan nhé.');
      const attending = String(input?.attending ?? '');
      if (!Object.hasOwn(ATTENDING, attending)) throw new WishError('Bạn chọn đến, không đến hay chưa chắc nhé.');
      const wish = { id: id(), name, message, attending, createdMs: now(), mail: 'pending' };
      await store.add(wish);
      const delivery = deliver(wish).catch(error => { console.error('Graduation delivery error:', error.message); return 'failed'; });
      return { wish, delivery };
    },

    list: () => store.list(),

    async remove(wishId) {
      if (!/^[\w-]{8,64}$/.test(String(wishId))) throw new WishError('Mã lời chúc không hợp lệ.');
      await store.remove(wishId);
    },

    async resend(wishId) {
      const wish = await store.get(String(wishId));
      if (!wish) throw new WishError('Không tìm thấy lời chúc.', 404);
      return deliver(wish);
    },
  };
}

module.exports = { ATTENDING, createGraduationService, createMailer, createWishStore, wishEmail, WishError, NAME_MAX, MESSAGE_MAX, DEFAULT_MAIL_TO };
