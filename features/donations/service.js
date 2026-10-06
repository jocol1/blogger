const crypto = require('node:crypto');

const MAX_AMOUNT = 9_999_999_999;
const ANONYMOUS = 'Một vị mạnh thường quân';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function buildBlessing(name, amount) {
  const gift = Number(amount).toLocaleString('vi-VN');
  return `Kính gửi ${name},

Con xin cúi đầu thật sâu, hai tay chắp lại, lòng thành kính cảm tạ tấm lòng rộng rãi mà bạn vừa gửi đến. ${gift} đồng không chỉ là một khoản tiền đặt vào chiếc bát nhỏ này, mà còn là một niềm vui rất lớn, một lời động viên ấm áp và một bằng chứng rằng giữa cuộc đời bận rộn vẫn luôn có người sẵn lòng sẻ chia. Con xin ghi nhớ tấm lòng ấy và xin gửi đến bạn lời chúc dài nhất, chân thành nhất từ tận đáy lòng.

Trước hết, xin chúc bạn và tất cả những người bạn thương luôn có thật nhiều sức khỏe. Chúc mỗi sáng thức dậy, cơ thể nhẹ nhàng, tinh thần khoan khoái, lòng không vướng muộn phiền; mỗi tối đặt lưng xuống là ngủ ngon một mạch, chẳng phải trằn trọc vì bất cứ điều gì. Chúc những cơn đau sớm qua, những ngày mệt mỏi chóng hết, người lớn trong nhà mạnh khỏe, trẻ nhỏ ngoan ngoãn, cả gia đình lúc nào cũng có tiếng nói cười. Mong cho từng bữa cơm của nhà bạn luôn đủ người, đủ món, đủ ấm áp; đi xa có người mong, trở về có người đợi.

Xin chúc đường công danh và công việc của bạn hanh thông rộng mở. Làm việc gì cũng gặp đúng người, đúng lúc, đúng cơ hội; dự định nào cũng có người giúp sức, kế hoạch nào cũng thuận buồm xuôi gió. Chúc bạn nói điều gì cũng được người khác lắng nghe, ký việc gì cũng suôn sẻ, bắt tay vào đâu là thành công đến đó. Nếu đang đi làm, mong bạn được quý trọng, được tăng lương, được thăng tiến và luôn gặp đồng nghiệp tử tế. Nếu đang kinh doanh, xin chúc khách vào tấp nập, đơn về liên tục, hàng đi nhanh, tiền về gọn, buôn may bán đắt, một vốn sinh nhiều lời. Nếu đang học tập, chúc bạn sáng trí, nhớ lâu, thi đâu đỗ đó và sớm chạm tay vào điều mình mong muốn.

Xin chúc tài lộc tìm đến nhà bạn như nước nguồn không cạn. Tiền vào đều tay, tiền ra đúng chỗ, ví luôn có dư, tài khoản luôn thêm số; của cải làm ra bằng sự tử tế ngày một đầy hơn, bền hơn và đem lại thật nhiều tự do. Chúc bạn mua được thứ mình cần, chăm lo được cho người mình thương, có tiền dành dụm cho ngày mai mà hôm nay vẫn sống thật vui. Mong bạn tránh được chuyện hao tài, tránh người gian dối, tránh những quyết định vội vàng; gặp việc khó liền có cách tháo gỡ, gặp lúc thiếu liền có lộc bù vào. Điều tử tế bạn trao hôm nay, mong sẽ trở về với bạn nhiều lần bằng những cơ hội tốt, những mối duyên lành và những niềm vui không báo trước.

Xin chúc chuyện tình cảm của bạn luôn tròn đầy. Người đang ở bên sẽ càng thấu hiểu, thương yêu và cùng bạn đi qua mọi thăng trầm; người còn đang kiếm tìm sẽ sớm gặp một tấm lòng chân thành, biết trân trọng và không để bạn phải cô đơn giữa những ngày khó khăn. Chúc bạn bè quanh bạn đều là người thật tâm, vui thì cùng cười, buồn thì ngồi lại, thành công không ganh ghét, thất bại không quay lưng. Mong cho những hiểu lầm được hóa giải, những khoảng cách được nối gần, những ai bạn nhớ cũng đang nhớ đến bạn bằng một tình cảm ấm áp như vậy.

Xin chúc bạn ra đường chân cứng đá mềm, đi đâu cũng bình an, xe cộ thuận đường, mưa vừa kịp tạnh, nắng vừa đủ ấm. Chúc việc lớn hóa nhỏ, việc nhỏ hóa không; điều dữ đứng ngoài cửa, điều lành tìm đúng lối vào nhà. Những ngày may mắn, mong bạn tận hưởng trọn vẹn; những ngày chưa như ý, mong bạn vẫn đủ vững vàng để bước tiếp và luôn có một bàn tay đưa ra đúng lúc. Chúc bạn giữ được một trái tim hiền nhưng không yếu, rộng lượng mà vẫn biết thương mình, hết lòng với người khác mà không quên dành cho bản thân những phút nghỉ ngơi.

Cuối cùng, con xin chúc ${name} một đời bình an, hai chữ an nhiên, ba phần may mắn, bốn mùa khỏe mạnh, năm tháng rực rỡ, sáu đường thuận lợi, bảy phần viên mãn, tám hướng tài lộc, chín phần hạnh phúc và mười phần như ý. Mong nhà bạn luôn sáng đèn, bếp luôn đỏ lửa, người thân luôn khỏe, trong lòng luôn có hy vọng. Chúc hôm nay vui hơn hôm qua, ngày mai đủ đầy hơn hôm nay; mong mọi điều bạn âm thầm ước nguyện đều lần lượt thành hiện thực. Con xin quỳ xuống, cúi đầu thêm một lần nữa và thành tâm cảm tạ. Chúc phúc, chúc lộc, chúc thọ, chúc bình an; chúc bạn làm đâu thắng đó, cầu gì được nấy, cả đời gặp lành, vạn sự hanh thông!`;
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
