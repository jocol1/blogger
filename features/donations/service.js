const crypto = require('node:crypto');

const MAX_AMOUNT = 9_999_999_999;
const ANONYMOUS = 'Một vị mạnh thường quân';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function buildBlessing(name, amount) {
  const gift = Number(amount).toLocaleString('vi-VN');
  return `Kính gửi ${name},

Ơ ${name} ơi, ${gift} đồng vừa rơi cái “ting” vào bát. Cả con hẻm online rung lên ba nhịp, một con ruồi đang bay vòng cũng phải đáp khẩn cấp xuống biển “Đói nhưng có gu” để chứng kiến. Con lập tức đội vương miện carton lệch sang bên trái, chắp tay đúng chuẩn người vừa được cứu khỏi cảnh mở ứng dụng ngân hàng rồi nhìn số dư như nhìn đề thi không học bài. Cảm ơn bạn. Cảm ơn rất thật. Cảm ơn tới mức cái bát bằng nhựa tự nhiên có thần thái của một cái két sắt mini.

Con không dám hứa bạn mai trúng số, vì vụ đó phải hỏi vũ trụ với ban tổ chức. Nhưng con xin chúc những thứ thiết thực hơn: sáng dậy tóc không dựng như tổ quạ, mở tủ lạnh còn đồ ăn, mặc quần áo vừa vặn, ra đường gặp đèn xanh, gửi xe còn chỗ, gọi đồ ăn không bị quán báo “hết món”. Chúc bạn bước vào thang máy là cửa mở ngay, không phải đứng bấm nút năm lần rồi giả vờ mình không sốt ruột. Chúc lúc đi mưa có ô, lúc quên ô thì mưa chỉ đủ để mát mặt chứ không đủ để áo trắng hóa áo bản đồ.

Chúc công việc của bạn có những ngày yên bình đến mức máy in không kẹt giấy, bảng tính không tự nhảy lỗi, họp online không ai nói “em nghe rõ không” mười bảy lần. Sếp đọc tin nhắn rồi trả lời đúng trọng tâm, deadline tự co lại khi thấy bạn mệt, đồng nghiệp hết hạn gửi file lúc 23:59. Nếu đang bán hàng, chúc khách hỏi giá xong chốt luôn, không có màn “để chị suy nghĩ” rồi mất hút như một huyền thoại. Nếu đang đi học, chúc ngồi đâu cũng trúng chỗ có quạt, đề nào cũng rơi vào đúng phần đã ôn, còn bạn học giỏi thì chỉ bài như người tử tế chứ không cười bí hiểm.

Chúc tài khoản của bạn có nhiều tin nhắn đến hơn tin nhắn đòi tiền. Tiền vào không ồn ào nhưng đều đặn; tiền ra thì biết xấu hổ, đi ít và đi đúng chỗ. Chúc những người từng mượn tiền bỗng nhiên tỉnh ngộ, nhớ ra ngày hẹn trả, rồi tự giác chuyển khoản kèm câu “xin lỗi, mình quên”. Chúc mọi cú bấm thanh toán đều có mã giảm giá, mọi lần mở ví đều không thấy gió lùa, mọi buổi đi ăn đều gặp bạn bè có câu thần chú “để tao trả”. Và nếu tháng này hơi chật vật, chúc bạn vẫn còn đủ tiền gọi thêm trứng, thêm topping và thêm một chút niềm tin vào cuộc đời.

Chúc chuyện tình cảm của bạn cũng bớt lằng nhằng như dây tai nghe trong túi quần. Người thương biết điều, người không thương biết tránh đường, người cũ sống ổn ở nơi không có Wi-Fi để quay lại xem story. Ai nhắn tin với bạn thì nói chuyện có muối, không thả một chữ “ừ” rồi bắt bạn gánh cả cuộc hội thoại. Nếu đang độc thân, chúc bạn gặp người rủ đi ăn mà thực sự biết chọn quán; không nói “ăn gì cũng được” rồi phủ định hết mười nơi. Nếu đã có đôi, chúc hai người cãi nhau xong biết mua trà sữa làm lành, không ai dùng câu “tùy” như một loại vũ khí hủy diệt hàng loạt.

Chúc bạn đi đâu cũng gặp người dễ thương: bác bảo vệ chỉ chỗ đỗ xe, cô bán hàng cho thêm đá, shipper gọi trước khi tới, tổng đài bấm phím nào cũng trúng người thật. Chúc điện thoại không rơi úp màn hình, tai nghe không mất một bên, nồi cơm không báo hết nước đúng lúc khách tới, điều hòa không hỏng ngày nóng nhất. Chúc những cuộc gọi không muốn nghe tự rơi đúng lúc máy đang sạc ở phòng khác. Chúc những chuyện bực mình trôi qua nhanh như quảng cáo có nút bỏ qua, còn những chuyện vui ở lại lâu như mùi đồ ăn bám trên áo khoác.

Và đặc biệt, con chúc ${name} có một năm mà mỗi lần quay lại nhìn sẽ thấy: “Ờ, mình cũng ghê đấy chứ.” Có tiền để lo cho người thân, có thời gian để lười một cách có kế hoạch, có bạn bè để cười to, có sức khỏe để đi chơi, có gan để bỏ qua mấy chuyện không đáng. Cảm ơn bạn đã ném cho cái bát này một cục hy vọng trị giá ${gift} đồng. Con xin cúi đầu đủ sâu để cái vương miện carton suýt rơi, nhưng không rơi vì lòng biết ơn đang ghim nó lại. Chúc bạn ngày nào cũng có ít nhất một chuyện khiến mình cười, và nhiều “ting ting” hợp pháp đến mức ngân hàng phải hỏi: “Bạn làm gì mà vui dữ vậy?”`;
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
      if (!mapping.exists) throw new DonationError(404, 'Không tìm thấy lượt ủng hộ.');
      const snapshot = await requests().doc(mapping.data().code).get();
      if (!snapshot.exists) throw new DonationError(404, 'Không tìm thấy lượt ủng hộ.');
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
