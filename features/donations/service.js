const crypto = require('node:crypto');

const MAX_AMOUNT = 9_999_999_999;
const ANONYMOUS = 'Một vị mạnh thường quân';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function buildBlessing(name, amount) {
  const gift = Number(amount).toLocaleString('vi-VN');
  return `Kính gửi ${name},

Tin nóng từ đáy bát: ${gift} đồng của bạn vừa hạ cánh an toàn, khiến cái bát rung bần bật như điện thoại vừa báo lương về. Con xin đội chiếc vương miện bìa carton, kéo lại chiếc áo vá chằng vá đụp, rồi quỳ xuống cúi đầu bằng tất cả sự long trọng mà một người đang ngồi cạnh ba con ruồi có thể huy động. Đây không chỉ là tiền; đây là vitamin tinh thần, là một cơn mưa nhỏ rơi đúng lúc cái ví đang thở oxy, là bằng chứng rằng ${name} có trái tim vàng mà hệ thống ngân hàng cũng phải gật gù xác nhận.

Trước hết, xin chúc bạn khỏe như Wi-Fi nhà hàng xóm khi họ chưa đổi mật khẩu: luôn căng vạch, luôn ổn định, cần lúc nào có lúc đó. Chúc bạn sáng mở mắt ra không đau lưng, trưa ăn gì cũng ngon, tối nằm xuống ngủ một lèo tới sáng mà không phải suy nghĩ về tin nhắn đã gửi lúc 2 giờ đêm. Chúc ly cà phê luôn vừa miệng, cơm phần luôn có thêm miếng thịt, quán quen luôn còn chỗ gửi xe, và người giao hàng luôn gọi đúng số thay vì đứng ở đầu hẻm hỏi “nhà mình ở đâu ạ?”. Chúc người thân trong nhà khỏe mạnh, bữa cơm nào cũng đông đủ, điều hòa không dở chứng đúng hôm nóng nhất, và chiếc dép bên trái không bao giờ biến mất một cách bí ẩn.

Xin chúc con đường công việc của bạn trơn tru như lúc vuốt màn hình điện thoại mới. Sếp đọc tin nhắn và chỉ nhắn “ok em”, bảng tính tự hết lỗi, máy in không kẹt giấy, họp nào cũng ngắn hơn dự kiến, deadline tự biết đường lùi lại một bước mỗi khi bạn vừa định thở dài. Nếu bạn đang kinh doanh, chúc khách tới đều như thông báo quảng cáo nhưng dễ thương hơn nhiều: hỏi giá xong chốt luôn, chuyển khoản nhanh, không xin giảm bằng nửa bữa cơm. Nếu bạn đang đi học, chúc đề thi nhìn vào là thấy quen, câu trắc nghiệm nào cũng tự lóe lên đáp án, còn thầy cô thì bất ngờ bảo “bài này được đấy”. Nếu bạn đang thất nghiệp, chúc công việc tử tế tự tìm đến, lương đủ xài, đồng nghiệp biết mời trà sữa và không ai đòi họp vào đúng giờ ngủ trưa.

Xin chúc tài khoản của bạn phát triển theo chiều hướng khiến ứng dụng ngân hàng phải mở to mắt. Tiền vào có lý do rõ ràng, tiền ra có mục đích đàng hoàng, ví không còn phát ra tiếng vọng, còn các khoản phải trả thì tự biết điều mà nhỏ lại. Chúc bạn nhặt được cơ hội tốt giống như nhặt được tiền trong túi áo cũ: bất ngờ, sạch sẽ và làm cả ngày vui lên. Ai nợ bạn thì nhớ lịch, ai hứa với bạn thì giữ lời, ai rủ góp vốn mù mờ thì tự mất sóng trước khi bấm gọi. Chúc mỗi lần mở ứng dụng thanh toán, bạn không thấy dòng “số dư khả dụng” làm mình suy tư về nhân sinh; thay vào đó là cảm giác bình tĩnh của người có thể gọi thêm topping mà không cần họp gia đình.

Xin chúc chuyện tình cảm của bạn mềm mại như chăn mới phơi nắng. Người thương hiểu ý, người chưa thương thì sớm nhận ra bạn vui tính, người cũ sống tốt ở một vũ trụ khác, còn bạn bè quanh bạn đều là loại thấy bạn buồn sẽ kéo đi ăn chứ không chỉ thả mỗi cái tim vào story. Chúc bạn nhắn tin không bị xem rồi im, đăng ảnh không bị góc mặt phản chủ, kể chuyện không gặp người chỉ chờ đến lượt họ nói. Nếu đang độc thân, chúc bạn gặp đúng người: không hỏi “em/anh ăn gì cũng được” rồi phủ định hết mọi quán, không giận vì bạn ngủ sớm, và biết đưa ô khi trời mưa thay vì gửi một cái sticker đám mây.

Xin chúc khi bạn ra đường, đèn xanh đến vừa kịp, thang máy mở đúng lúc, trời mưa chỉ mưa khi bạn đã vào nhà, còn những cuộc gọi không muốn nghe thì pin điện thoại khéo léo xuống 1%. Chúc bãi xe còn chỗ, mã giảm giá còn hiệu lực, cơm gà luôn có da giòn, trà đá luôn mát, và món bạn thích không bao giờ bị báo “hết hàng” ngay sau khi xếp hàng mười lăm phút. Chúc bạn bực mình ít lại, cười nhiều hơn, gặp chuyện khó thì có người cùng gỡ, gặp chuyện vui thì có người cùng khoe. Những điều không đáng thì trôi qua nhanh như quảng cáo năm giây có nút bỏ qua; những điều đáng giữ thì ở lại lâu như mùi áo quần sạch.

Cuối cùng, con xin chúc ${name} một đời đủ pin, đủ tiền, đủ thời gian, đủ người thương và đủ độ lì để không bỏ cuộc vì một ngày xấu trời. Chúc bạn phúc lớn hơn thông báo dung lượng trống, lộc nhiều hơn tab đang mở, may mắn dày hơn lớp topping trong cốc trà sữa size L. Chúc mọi kế hoạch có đường ra, mọi chuyến đi có người rủ, mọi bữa ăn có món ngon, mọi tháng đều có một khoản khiến bạn vui bất ngờ. Con xin cúi đầu lần nữa, lưng hơi mỏi nhưng lòng rất nhiệt tình: cảm ơn bạn đã cứu trợ chiếc bát này. Mong vũ trụ trả công cho bạn bằng bình an, tiếng cười và thật nhiều “ting ting” hợp pháp, rõ nguồn gốc, không cần xin mã OTP!`;
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
