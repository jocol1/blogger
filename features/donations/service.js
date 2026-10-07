const crypto = require('node:crypto');

const MAX_AMOUNT = 9_999_999_999;
const ANONYMOUS = 'Người thanh toán ẩn danh';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function buildBlessing(name, amount) {
  const gift = Number(amount).toLocaleString('vi-VN');
  return `Kính gửi ${name},

Thông báo từ bộ phận gạch nợ: ${gift} đồng đã về an toàn. Hóa đơn tưởng tượng vừa được đóng dấu “XONG RỒI NHA”, chiếc máy tính bỏ túi được phép nghỉ ngơi, còn nhân vật trực quầy thì bớt nhìn điện thoại mỗi ba phút một lần. Cảm ơn bạn đã thanh toán gọn gàng. Đây là kiểu “ting ting” khiến cả hai bên đều đỡ phải nhắn câu “bạn chuyển chưa?” — một phát minh của văn minh nhân loại.

Chúc bạn từ nay đi ăn được bạn bè nhớ phần, đi làm gặp file đã lưu, gửi tin nhắn không bị seen rồi im, và mỗi lần mở app ngân hàng đều là tin vui chứ không phải bài kiểm tra tâm lý. Chúc ai đang nợ bạn cũng có ngày giác ngộ giống bạn hôm nay; nhớ khoản, trả đúng hẹn, chuyển xong còn biết gửi sticker xin lỗi cho lịch sự. Chúc cuộc đời bớt các khoản lặt vặt, bớt “để mai tính”, nhiều mã giảm giá, nhiều cơ hội ngon và nhiều người bạn có câu thần chú “để tao trả phần này”.

Khoản thanh toán đã được ghi nhận, không cần quỳ, không cần cúng, không cần đọc sớ. Chỉ cần bạn vui, người nhận vui, thế là hệ thống vũ trụ chấm 10 điểm cho sự sòng phẳng. Cảm ơn ${name} — người đã biến một hóa đơn bé xíu thành một câu chuyện có hậu.`;
}

class DonationError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function readConfig(env = process.env) {
  return {
    bank: (env.DONATION_BANK_CODE || '').trim(),
    account: (env.DONATION_BANK_ACCOUNT || '').trim(),
    accountName: (env.DONATION_BANK_ACCOUNT_NAME || '').trim(),
    webhookKey: (env.SEPAY_WEBHOOK_API_KEY || '').trim(),
  };
}

function verifyKey(header, secret) {
  if (!secret || typeof header !== 'string') return false;
  const match = /^Apikey (\S+)$/i.exec(header);
  return Boolean(match && crypto.timingSafeEqual(Buffer.from(hash(match[1]), 'hex'), Buffer.from(hash(secret), 'hex')));
}

function validateInput(input) {
  if (!input || !Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > MAX_AMOUNT) {
    throw new DonationError(400, 'Số tiền phải là số nguyên từ 1 đến 9.999.999.999 đồng.');
  }
  if (input.name != null && typeof input.name !== 'string') throw new DonationError(400, 'Tên không hợp lệ.');
  const name = (input.name || '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  if (name.length > 60) throw new DonationError(400, 'Tên tối đa 60 ký tự.');
  return { name: name || ANONYMOUS, amount: input.amount };
}

function extractCode(payload) {
  const matches = `${payload.code || ''} ${payload.content || ''}`.toUpperCase().match(/\bDH\d{7}(?![A-Z0-9])/g) || [];
  const codes = [...new Set(matches)];
  return codes.length === 1 ? codes[0] : null;
}

function qrUrl(config, code, amount) {
  const url = new URL(`https://img.vietqr.io/image/${encodeURIComponent(config.bank)}-${encodeURIComponent(config.account)}-compact2.png`);
  url.search = new URLSearchParams({ amount: String(amount), addInfo: code, accountName: config.accountName }).toString();
  return url.href;
}

function createDonationService({ db, config = readConfig() }) {
  const ready = () => Boolean(db && /^[A-Za-z0-9]+$/.test(config.bank) && /^\d+$/.test(config.account) && config.accountName && config.webhookKey);
  const requireReady = () => { if (!ready()) throw new DonationError(503, 'Trang chưa sẵn sàng nhận tiền. Vui lòng quay lại sau.'); };
  const requests = () => db.collection('donation_requests');
  const tokens = () => db.collection('donation_tokens');
  const receipts = () => db.collection('donation_sepay_events');
  const events = () => db.collection('donation_public_events');
  const counter = () => db.collection('donation_meta').doc('public');

  return {
    config,
    publicConfig() {
      return { ready: ready(), ...(ready() ? { bank: config.bank, account: config.account, accountName: config.accountName } : {}) };
    },
    async create(input) {
      requireReady();
      const { name, amount } = validateInput(input);
      const token = crypto.randomBytes(32).toString('hex');
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = `DH${crypto.randomInt(10_000_000).toString().padStart(7, '0')}`;
        const created = await db.runTransaction(async tx => {
          const ref = requests().doc(code);
          if ((await tx.get(ref)).exists) return false;
          tx.create(ref, { name, amount, code, account: config.account, bank: config.bank, createdAt: new Date().toISOString(), status: 'pending', paidAmount: 0, paymentCount: 0 });
          tx.create(tokens().doc(hash(token)), { code });
          return true;
        });
        if (created) return { code, token, name, amount, qrUrl: qrUrl(config, code, amount), bank: config.bank, account: config.account, accountName: config.accountName };
      }
      throw new DonationError(503, 'Chưa tạo được mã chuyển khoản. Vui lòng thử lại.');
    },
    async status(token) {
      requireReady();
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new DonationError(401, 'Token tra cứu không hợp lệ.');
      const mapping = await tokens().doc(hash(token)).get();
      if (!mapping.exists) throw new DonationError(404, 'Không tìm thấy lượt thanh toán.');
      const snapshot = await requests().doc(mapping.data().code).get();
      if (!snapshot.exists) throw new DonationError(404, 'Không tìm thấy lượt thanh toán.');
      const { status, paidAmount, paymentCount, name } = snapshot.data();
      return {
        status,
        paidAmount,
        paymentCount,
        ...(status === 'paid' ? { message: buildBlessing(name, paidAmount) } : {}),
      };
    },
    async listEvents(after) {
      requireReady();
      if (after === undefined) {
        const snapshot = await counter().get();
        return { events: [], cursor: snapshot.exists ? snapshot.data().sequence : 0, hasMore: false };
      }
      if (typeof after !== 'string' || !/^\d{1,15}$/.test(after)) throw new DonationError(400, 'Mốc sự kiện không hợp lệ.');
      const cursor = Number(after);
      const snapshot = await events().where('sequence', '>', cursor).orderBy('sequence').limit(50).get();
      const rows = snapshot.docs.map(doc => {
        const { sequence, name, amount, createdAt, message } = doc.data();
        return { id: String(sequence), name, amount, createdAt, message };
      });
      return { events: rows, cursor: rows.length ? Number(rows.at(-1).id) : cursor, hasMore: rows.length === 50 };
    },
    async receive(payload) {
      requireReady();
      if (!payload || !Number.isSafeInteger(payload.id) || payload.id <= 0) throw new DonationError(400, 'ID giao dịch không hợp lệ.');
      // All reads precede writes. The receipt and public sequence are committed together.
      return db.runTransaction(async tx => {
        const receipt = receipts().doc(String(payload.id));
        if ((await tx.get(receipt)).exists) return { success: true, result: 'duplicate' };
        const code = extractCode(payload);
        let result;
        let request;
        let requestRef;
        if (payload.transferType !== 'in') result = 'ignored_out';
        else if (String(payload.accountNumber || '') !== config.account) result = 'wrong_account';
        else if (!Number.isSafeInteger(payload.transferAmount) || payload.transferAmount < 1 || payload.transferAmount > MAX_AMOUNT) result = 'invalid_amount';
        else if (!code) result = 'unmatched';
        else {
          requestRef = requests().doc(code);
          const snapshot = await tx.get(requestRef);
          request = snapshot.exists ? snapshot.data() : null;
          result = request && request.account === config.account ? 'matched_paid' : 'unmatched';
        }
        const createdAt = new Date().toISOString();
        if (result === 'matched_paid') {
          const metaRef = counter();
          const meta = await tx.get(metaRef);
          const sequence = (meta.exists ? meta.data().sequence : 0) + 1;
          const paidAmount = request.paidAmount + payload.transferAmount;
          if (!Number.isSafeInteger(paidAmount)) throw new DonationError(503, 'Không thể ghi nhận tổng tiền.');
          const message = buildBlessing(request.name, payload.transferAmount);
          tx.set(metaRef, { sequence });
          tx.create(events().doc(String(sequence)), { sequence, name: request.name, amount: payload.transferAmount, createdAt, message });
          tx.update(requestRef, { status: 'paid', paidAmount, paymentCount: request.paymentCount + 1, confirmedAt: createdAt });
        }
        // Private audit: allowlisted fields only; never exposed through the event API.
        tx.create(receipt, {
          sepayId: payload.id, code, result, createdAt,
          amount: Number.isFinite(payload.transferAmount) ? payload.transferAmount : null,
          account: String(payload.accountNumber || '').slice(0, 100),
          content: String(payload.content || '').slice(0, 2000),
          reference: String(payload.referenceCode || '').slice(0, 200),
          transferType: String(payload.transferType || '').slice(0, 20),
        });
        return { success: true, result };
      });
    },
  };
}

module.exports = { createDonationService, DonationError, readConfig, verifyKey, buildBlessing, MAX_AMOUNT };
