const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { clean, ATTENDING, createWishStore, createMailer, escapeHtml, vnTime, wishEmail } = require('../graduation/service');
const { CardError, normalizeCard, email: cleanEmail } = require('./validate');

const CARD_PRICE = 29;
const DRAFT_TTL_MS = 14 * 24 * 3600 * 1000;
const NEVER = Number.MAX_SAFE_INTEGER;
const MAX_IMAGES_PER_CARD = 12;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_STORED_IMAGE_BYTES = 300 * 1024;
const IMAGE_MAX_SIDE = 1200;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CARDS = 'grad_cards';
const IMAGES = 'grad_card_images';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const cleanCode = value => (typeof value === 'string' && /^[A-Z2-9]{8}$/.test(value.toUpperCase()) ? value.toUpperCase() : null);
const cleanToken = value => (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null);
const cleanRequestId = value => (typeof value === 'string' && /^[a-f0-9-]{16,64}$/i.test(value) ? value : null);
const iso = ms => new Date(ms).toISOString();
const appendHistory = (wallet, entry) => [...(Array.isArray(wallet.history) ? wallet.history : []), entry].slice(-100);
const randomCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');

// Cards, their images and their wishes live in Firestore when the app has it, otherwise under a
// private folder on disk so the builder works on a laptop.
function createCardStore({ db, dir }) {
  if (db) {
    const cards = () => db.collection(CARDS);
    const images = () => db.collection(IMAGES);
    return {
      db,
      async getCard(code) { const snap = await cards().doc(code).get(); return snap.exists ? snap.data() : null; },
      async putCard(card) { await cards().doc(card.code).set(card); },
      async patchCard(code, patch) { await cards().doc(code).set(patch, { merge: true }); },
      async deleteCard(code) { await cards().doc(code).delete(); },
      async listCards(limit = 500) {
        const snap = await cards().where('createdMs', '>', 0).orderBy('createdMs').limit(limit).get();
        return snap.docs.map(doc => doc.data()).reverse();
      },
      async expiredCards(at, limit = 50) {
        const snap = await cards().where('purgeAtMs', '<', at).limit(limit).get();
        return snap.docs.map(doc => doc.data());
      },
      async putImage(image) { await images().doc(image.id).set(image); },
      async getImage(id) { const snap = await images().doc(id).get(); return snap.exists ? snap.data() : null; },
      async deleteImage(id) { await images().doc(id).delete(); },
      wishes: code => createWishStore({ db, collection: `${CARDS}/${code}/wishes` }),
    };
  }
  const cardsFile = path.join(dir, 'cards.json');
  const imagesDir = path.join(dir, 'images');
  let rows = null;
  const load = () => {
    if (rows) return rows;
    try { rows = JSON.parse(fs.readFileSync(cardsFile, 'utf8')); } catch (_) { rows = {}; }
    return rows;
  };
  const persist = () => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${cardsFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rows), { mode: 0o600 });
    fs.renameSync(tmp, cardsFile);
  };
  const imagePath = id => path.join(imagesDir, `${id}.json`);
  return {
    db: null,
    async getCard(code) { const row = load()[code]; return row ? structuredClone(row) : null; },
    async putCard(card) { load()[card.code] = structuredClone(card); persist(); },
    async patchCard(code, patch) { if (load()[code]) { Object.assign(rows[code], structuredClone(patch)); persist(); } },
    async deleteCard(code) { delete load()[code]; persist(); },
    async listCards(limit = 500) { return Object.values(load()).sort((a, b) => b.createdMs - a.createdMs).slice(0, limit).map(row => structuredClone(row)); },
    async expiredCards(at, limit = 50) { return Object.values(load()).filter(row => row.purgeAtMs < at).slice(0, limit).map(row => structuredClone(row)); },
    async putImage(image) {
      fs.mkdirSync(imagesDir, { recursive: true });
      fs.writeFileSync(imagePath(image.id), JSON.stringify({ ...image, data: Buffer.from(image.data).toString('base64') }), { mode: 0o600 });
    },
    async getImage(id) {
      try { const row = JSON.parse(fs.readFileSync(imagePath(id), 'utf8')); return { ...row, data: Buffer.from(row.data, 'base64') }; } catch (_) { return null; }
    },
    async deleteImage(id) { fs.rmSync(imagePath(id), { force: true }); },
    wishes: code => createWishStore({ file: path.join(dir, 'wishes', `${code}.json`) }),
  };
}

// Same approach as chat images: check the real format, strip metadata, re-encode to WebP and
// shrink until it fits comfortably inside one Firestore document.
async function encodeImage(file) {
  if (!file?.buffer?.length) throw new CardError('Bạn chọn một ảnh nhé.');
  if (file.buffer.length > MAX_UPLOAD_BYTES) throw new CardError('Ảnh tối đa 5 MB.', 413);
  let meta;
  try { meta = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata(); } catch (_) { throw new CardError('Tệp này không phải ảnh.'); }
  if (!['jpeg', 'png', 'webp', 'heif'].includes(meta.format)) throw new CardError('Chỉ nhận ảnh JPG, PNG, WebP hoặc HEIC.');
  let side = IMAGE_MAX_SIDE, quality = 82;
  for (let attempt = 0; attempt < 7; attempt++) {
    const data = await sharp(file.buffer, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    if (data.length <= MAX_STORED_IMAGE_BYTES) return data;
    side = Math.max(640, Math.round(side * 0.8));
    quality = Math.max(48, quality - 8);
  }
  throw new CardError('Ảnh quá chi tiết, bạn thử ảnh khác nhé.');
}

function publicCard(card) {
  return { code: card.code, status: card.status, content: card.content, look: card.look, publishedMs: card.publishedMs || null };
}

function ownerCard(card) {
  return {
    ...publicCard(card),
    ownerEmail: card.ownerEmail || '',
    createdMs: card.createdMs,
    updatedMs: card.updatedMs,
    purgeAtMs: card.status === 'draft' ? card.purgeAtMs : null,
    paid: Boolean(card.purchase),
  };
}

function createCardService({ db = null, dir, mailer = createMailer(), publicUrl = '', now = Date.now, id = () => crypto.randomUUID() } = {}) {
  const store = createCardStore({ db, dir });
  const base = publicUrl.replace(/\/$/, '');
  const manageUrl = (code, token) => `${base}/thiep/${code}/quanly#k=${token}`;

  async function load(code) {
    const valid = cleanCode(code);
    const card = valid && await store.getCard(valid);
    if (!card) throw new CardError('Không tìm thấy thiệp.', 404);
    return card;
  }
  async function owned(code, token) {
    const card = await load(code);
    const valid = cleanToken(token);
    const expected = Buffer.from(card.ownerHash, 'hex');
    const actual = Buffer.from(valid ? hash(valid) : '0'.repeat(64), 'hex');
    if (!valid || !crypto.timingSafeEqual(expected, actual)) throw new CardError('Link quản lý không đúng.', 403);
    return card;
  }
  const requireDb = () => { if (!store.db) throw new CardError('Thanh toán chưa sẵn sàng trên máy chủ này.', 503); };
  const wallets = () => store.db.collection('game_wallets');
  async function walletIdFor(token) {
    const valid = cleanToken(token);
    if (!valid) throw new CardError('Mã ví không hợp lệ.', 401);
    const snap = await store.db.collection('game_wallet_tokens').doc(hash(valid)).get();
    if (!snap.exists) throw new CardError('Không tìm thấy ví.', 401);
    return snap.data().walletId;
  }

  async function mailOwner(card, mail) {
    if (!mailer.configured || !card.ownerEmail || card.status !== 'published') return 'skipped';
    try { await mailer.send({ ...mail, to: card.ownerEmail }); return 'sent'; } catch (error) { console.error('Card owner mail failed:', error.code || error.message); return 'failed'; }
  }
  function linkMail(card, token) {
    const link = manageUrl(card.code, token);
    const share = `${base}/thiep/${card.code}`;
    const name = card.content.nickname;
    return {
      subject: `Link quản lý thiệp tốt nghiệp của ${name}`,
      text: [`Thiệp tốt nghiệp của ${name} đã sẵn sàng.`, '', `Link chia sẻ cho bạn bè: ${share}`, `Link quản lý (giữ bí mật, dùng để sửa thiệp và xem lời chúc): ${link}`].join('\n'),
      html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;background:#f4f7f5;border-radius:20px">`
        + `<p style="margin:0 0 12px;font-weight:700">Thiệp tốt nghiệp của ${escapeHtml(name)} đã sẵn sàng.</p>`
        + `<p style="margin:0 0 8px">Link chia sẻ cho bạn bè:<br><a href="${escapeHtml(share)}">${escapeHtml(share)}</a></p>`
        + `<p style="margin:0">Link quản lý (giữ bí mật):<br><a href="${escapeHtml(link)}">Mở trang quản lý</a></p></div>`,
    };
  }

  return {
    price: CARD_PRICE,
    paymentsReady: Boolean(db),
    mailConfigured: mailer.configured,

    async create(input) {
      const { content, look } = normalizeCard(input);
      const token = crypto.randomBytes(32).toString('hex');
      let code = null;
      for (let attempt = 0; attempt < 6 && !code; attempt++) {
        const candidate = randomCode();
        if (!await store.getCard(candidate)) code = candidate;
      }
      if (!code) throw new CardError('Hệ thống đang bận, bạn thử lại nhé.', 503);
      const at = now();
      const card = { code, ownerHash: hash(token), status: 'draft', content, look, imageIds: [], createdMs: at, updatedMs: at, purgeAtMs: at + DRAFT_TTL_MS, publishedMs: null, purchase: null, ownerEmail: '' };
      await store.putCard(card);
      return { card: ownerCard(card), ownerToken: token };
    },

    async getForOwner(code, token) { return ownerCard(await owned(code, token)); },

    // What a visitor may see: only published cards.
    async getPublic(code) {
      const card = await load(code);
      if (card.status === 'disabled') throw new CardError('Thiệp này đã bị gỡ.', 404);
      if (card.status !== 'published') throw new CardError('Thiệp chưa được xuất bản.', 409);
      return publicCard(card);
    },

    async update(code, token, input) {
      const card = await owned(code, token);
      if (card.status === 'disabled') throw new CardError('Thiệp này đã bị gỡ.', 403);
      const { content, look } = normalizeCard(input);
      const known = new Set(card.imageIds || []);
      if (content.venue.photoId && !known.has(content.venue.photoId)) content.venue.photoId = null;
      if (look.portrait.type === 'photo' && !known.has(look.portrait.photoId)) look.portrait = { type: 'icon', icon: 'cap' };
      const patch = { content, look, updatedMs: now() };
      await store.patchCard(card.code, patch);
      return ownerCard({ ...card, ...patch });
    },

    async setEmail(code, token, value) {
      const card = await owned(code, token);
      const ownerEmail = cleanEmail(value);
      await store.patchCard(card.code, { ownerEmail });
      const next = { ...card, ownerEmail };
      const mailed = ownerEmail ? await mailOwner(next, linkMail(next, token)) : 'skipped';
      return { ownerEmail, mailed };
    },

    async uploadImage(code, token, file) {
      const card = await owned(code, token);
      if (card.status === 'disabled') throw new CardError('Thiệp này đã bị gỡ.', 403);
      if ((card.imageIds || []).length >= MAX_IMAGES_PER_CARD) throw new CardError('Mỗi thiệp tải tối đa 12 ảnh.', 409);
      const data = await encodeImage(file);
      const imageId = id();
      await store.putImage({ id: imageId, cardCode: card.code, data, mime: 'image/webp', bytes: data.length, createdMs: now() });
      await store.patchCard(card.code, { imageIds: [...(card.imageIds || []), imageId] });
      return { id: imageId, bytes: data.length };
    },

    async getImage(imageId) {
      if (!/^[0-9a-f-]{36}$/.test(String(imageId))) return null;
      const image = await store.getImage(String(imageId));
      if (!image) return null;
      const card = await store.getCard(image.cardCode);
      if (!card || card.status === 'disabled') return null;
      return { data: Buffer.from(image.data), mime: image.mime || 'image/webp' };
    },

    // Debit the visitor's xu wallet and publish, in one transaction. Same pattern as the party
    // pass: a request id makes a double click charge once.
    async publish(code, token, walletToken, input) {
      requireDb();
      const card = await owned(code, token);
      const requestId = cleanRequestId(input?.requestId);
      if (!requestId) throw new CardError('Yêu cầu xuất bản không hợp lệ.');
      const walletId = await walletIdFor(walletToken);
      const at = now();
      const next = await store.db.runTransaction(async tx => {
        const cardRef = store.db.collection(CARDS).doc(card.code);
        const walletRef = wallets().doc(walletId);
        const attemptRef = store.db.collection('grad_card_purchases').doc(hash(`${walletId}:${requestId}`));
        const cardSnap = await tx.get(cardRef);
        const walletSnap = await tx.get(walletRef);
        const previous = await tx.get(attemptRef);
        if (!cardSnap.exists) throw new CardError('Không tìm thấy thiệp.', 404);
        const current = cardSnap.data();
        if (current.status === 'disabled') throw new CardError('Thiệp này đã bị gỡ.', 403);
        if (previous.exists || current.status === 'published') return current;
        if (!walletSnap.exists || walletSnap.data().balance < CARD_PRICE) throw new CardError(`Ví cần đủ ${CARD_PRICE} xu để xuất bản.`, 409);
        const wallet = walletSnap.data();
        const balance = wallet.balance - CARD_PRICE;
        const purchaseId = hash(`${walletId}:${requestId}`).slice(0, 32);
        const updated = { ...current, status: 'published', publishedMs: at, updatedMs: at, purgeAtMs: NEVER, purchase: { kind: 'paid', walletId, purchaseId, xu: CARD_PRICE, atMs: at } };
        tx.update(walletRef, { balance, updatedAt: iso(at), history: appendHistory(wallet, { id: `card-purchase-${purchaseId}`, type: 'card_cost', amount: -CARD_PRICE, balance, createdAt: iso(at) }) });
        tx.set(cardRef, updated);
        tx.create(attemptRef, { walletId, code: card.code, purchaseId, createdAt: at });
        return updated;
      });
      if (next.ownerEmail) mailOwner(next, linkMail(next, token)).catch(() => {});
      return ownerCard(next);
    },

    async submitWish(code, input) {
      const card = await load(code);
      if (card.status !== 'published') throw new CardError('Thiệp chưa nhận lời chúc.', 409);
      if (card.look?.modules?.wishes === false) throw new CardError('Thiệp này không nhận lời chúc.', 409);
      const name = clean(input?.name, 40).replace(/\n/g, ' ');
      const message = clean(input?.message, 240);
      const attending = String(input?.attending ?? '');
      if (!name) throw new CardError('Bạn cho biết tên bạn nhé.');
      if (!message) throw new CardError('Bạn viết vài chữ chúc mừng nhé.');
      if (!Object.hasOwn(ATTENDING, attending)) throw new CardError('Bạn chọn đến, không đến hay chưa chắc nhé.');
      const wish = { id: id(), name, message, attending, createdMs: now() };
      await store.wishes(card.code).add(wish);
      const manage = base ? `${base}/thiep/${card.code}/quanly` : '';
      const delivery = mailOwner(card, wishEmail(wish, manage, card.content.nickname));
      return { wish, delivery };
    },

    async listWishes(code, token) { const card = await owned(code, token); return store.wishes(card.code).list(); },

    async removeWish(code, token, wishId) {
      const card = await owned(code, token);
      if (!/^[\w-]{8,64}$/.test(String(wishId))) throw new CardError('Mã lời chúc không hợp lệ.');
      await store.wishes(card.code).remove(String(wishId));
    },

    // Admin.
    async adminList() { return store.listCards(); },
    async adminSetStatus(code, status) {
      const card = await load(code);
      if (status === 'disabled') await store.patchCard(card.code, { status: 'disabled', disabledFrom: card.status, updatedMs: now() });
      else if (status === 'enabled' && card.status === 'disabled') await store.patchCard(card.code, { status: card.disabledFrom || 'draft', updatedMs: now() });
    },
    async adminComp(code) {
      const card = await load(code);
      if (card.status === 'published') return;
      const at = now();
      await store.patchCard(card.code, { status: 'published', publishedMs: at, updatedMs: at, purgeAtMs: NEVER, purchase: { kind: 'comp', xu: 0, atMs: at } });
    },
    async adminRefund(code) {
      requireDb();
      const card = await load(code);
      if (card.purchase?.kind !== 'paid' || card.purchase.refunded) throw new CardError('Thiệp này không có khoản để hoàn.', 409);
      const at = now();
      await store.db.runTransaction(async tx => {
        const cardRef = store.db.collection(CARDS).doc(card.code);
        const walletRef = wallets().doc(card.purchase.walletId);
        const cardSnap = await tx.get(cardRef);
        const walletSnap = await tx.get(walletRef);
        const current = cardSnap.data();
        if (current.purchase?.refunded) return;
        if (!walletSnap.exists) throw new CardError('Không tìm thấy ví để hoàn.', 404);
        const wallet = walletSnap.data();
        const balance = wallet.balance + current.purchase.xu;
        tx.update(walletRef, { balance, updatedAt: iso(at), history: appendHistory(wallet, { id: `card-refund-${current.purchase.purchaseId}`, type: 'card_refund', amount: current.purchase.xu, balance, createdAt: iso(at) }) });
        tx.set(cardRef, { ...current, status: 'disabled', disabledFrom: 'published', updatedMs: at, purchase: { ...current.purchase, refunded: true, refundedMs: at } });
      });
    },

    // Drafts nobody paid for are removed after two weeks, together with their photos.
    async sweep() {
      const at = now();
      const expired = await store.expiredCards(at);
      for (const card of expired) {
        if (card.status === 'published' || card.disabledFrom === 'published') continue;
        for (const imageId of card.imageIds || []) await store.deleteImage(imageId);
        await store.deleteCard(card.code);
      }
      return expired.length;
    },

    manageUrl,
    vnTime,
  };
}

module.exports = { createCardService, createCardStore, encodeImage, CARD_PRICE, DRAFT_TTL_MS, MAX_UPLOAD_BYTES, CardError };
