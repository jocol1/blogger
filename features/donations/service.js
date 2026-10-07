const crypto = require('node:crypto');

const MAX_AMOUNT = 9_999_999_999;
const MAX_BALANCE = 9_999_999;
const REWARD_COST = 100;
const ANONYMOUS = 'Người chơi ẩn danh';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const cleanToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
const cleanId = value => typeof value === 'string' && /^[a-f0-9-]{16,64}$/i.test(value) ? value : null;
const iso = time => new Date(time).toISOString();
const appendHistory = (wallet, entry) => [...(Array.isArray(wallet.history) ? wallet.history : []), entry].slice(-100);

const DIFFICULTIES = {
  easy: { label: 'Thường', payout: 2 },
  medium: { label: 'Khó', payout: 3 },
  hard: { label: 'Siêu khó', payout: 5 },
};
const GAMES = {
  bowl: { label: 'Bắn xu vào bát', expiresMs: 15_000, easy: { period: 2200, width: .20 }, medium: { period: 1600, width: .13 }, hard: { period: 1100, width: .08 } },
  needle: { label: 'Dừng kim', expiresMs: 15_000, easy: { period: 1800, width: .24 }, medium: { period: 1300, width: .14 }, hard: { period: 900, width: .08 } },
  heart: { label: 'Bắt tim', expiresMs: 15_000, easy: { cells: 3, interval: 1200 }, medium: { cells: 6, interval: 900 }, hard: { cells: 9, interval: 650 } },
  memory: { label: 'Nhớ chuỗi', expiresMs: 30_000, easy: { length: 3 }, medium: { length: 5 }, hard: { length: 7 } },
  order: { label: 'Chạm đúng thứ tự', easy: { count: 4, duration: 8000 }, medium: { count: 6, duration: 7000 }, hard: { count: 9, duration: 6000 } },
};

class DonationError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function readConfig(env = process.env) {
  return { bank: (env.DONATION_BANK_CODE || '').trim(), account: (env.DONATION_BANK_ACCOUNT || '').trim(), accountName: (env.DONATION_BANK_ACCOUNT_NAME || '').trim(), webhookKey: (env.SEPAY_WEBHOOK_API_KEY || '').trim() };
}
function verifyKey(header, secret) {
  if (!secret || typeof header !== 'string') return false;
  const match = /^Apikey (\S+)$/i.exec(header);
  return Boolean(match && crypto.timingSafeEqual(Buffer.from(hash(match[1]), 'hex'), Buffer.from(hash(secret), 'hex')));
}
function validateInput(input) {
  if (!input || !Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > MAX_AMOUNT) throw new DonationError(400, 'Số tiền phải là số nguyên từ 1 đến 9.999.999.999 đồng.');
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
function seededNumber(seed, index) { return Number.parseInt(hash(`${seed}:${index}`).slice(0, 8), 16); }
function sequence(seed, length, size = 4) { return Array.from({ length }, (_, index) => seededNumber(seed, index) % size); }
function shuffled(seed, count) {
  const values = Array.from({ length: count }, (_, index) => index + 1);
  for (let index = count - 1; index > 0; index--) { const swap = seededNumber(seed, index) % (index + 1); [values[index], values[swap]] = [values[swap], values[index]]; }
  return values;
}
function publicGame(row, now) {
  const rules = GAMES[row.game][row.difficulty];
  const base = { id: row.id, game: row.game, gameLabel: GAMES[row.game].label, difficulty: row.difficulty, difficultyLabel: DIFFICULTIES[row.difficulty].label, payout: DIFFICULTIES[row.difficulty].payout, status: row.status, startedAt: row.startedAt, expiresAt: row.expiresAt, serverNow: now };
  if (row.game === 'memory') return { ...base, sequence: row.sequence, revealMs: 700 };
  if (row.game === 'order') return { ...base, order: row.order, duration: rules.duration };
  if (row.game === 'heart') return { ...base, ...rules, positions: row.positions };
  return { ...base, ...rules, phase: row.phase };
}

function createDonationService({ db, config = readConfig(), now = () => Date.now() }) {
  const ready = () => Boolean(db && /^[A-Za-z0-9]+$/.test(config.bank) && /^\d+$/.test(config.account) && config.accountName && config.webhookKey);
  const requireReady = () => { if (!ready()) throw new DonationError(503, 'Trang chưa sẵn sàng nhận tiền. Vui lòng quay lại sau.'); };
  const col = name => db.collection(name);
  const requests = () => col('donation_requests');
  const tokens = () => col('donation_tokens');
  const donationAttempts = () => col('donation_idempotency');
  const receipts = () => col('donation_sepay_events');
  const wallets = () => col('game_wallets');
  const walletTokens = () => col('game_wallet_tokens');
  const games = () => col('game_sessions');
  const redemptions = () => col('game_redemptions');
  const redemptionMeta = () => col('game_meta').doc('redemptions');

  async function walletIdFor(token) {
    const valid = cleanToken(token);
    if (!valid) throw new DonationError(401, 'Mã ví không hợp lệ.');
    const mapping = await walletTokens().doc(hash(valid)).get();
    if (!mapping.exists) throw new DonationError(401, 'Không tìm thấy ví.');
    return mapping.data().walletId;
  }
  async function walletView(token) {
    requireReady();
    const walletId = await walletIdFor(token);
    const snapshot = await wallets().doc(walletId).get();
    if (!snapshot.exists) throw new DonationError(404, 'Không tìm thấy ví.');
    const row = snapshot.data();
    let redemptionPending = false;
    if (row.redemptionId) {
      const redemption = await redemptions().doc(row.redemptionId).get();
      redemptionPending = redemption.exists && ['pending', 'approved'].includes(redemption.data().status);
    }
    return { id: walletId, balance: row.balance, remainder: row.remainder, totalDeposited: row.totalDeposited, history: (row.history || []).slice().reverse(), activeGameId: row.activeGameId || null, redemptionId: row.redemptionId || null, redemptionPending, serverNow: now() };
  }
  function gameResult(row, wallet, at, won, reason) {
    const payout = won ? DIFFICULTIES[row.difficulty].payout : 0;
    const balance = wallet.balance + payout;
    if (balance > MAX_BALANCE) throw new DonationError(409, 'Ví đã đạt giới hạn xu.');
    return { payout, balance, result: { won, payout, balance, reason, game: row.game, difficulty: row.difficulty, finishedAt: iso(at) } };
  }

  return {
    config,
    publicConfig() { return { ready: ready(), rewardCost: REWARD_COST, difficulties: DIFFICULTIES, games: Object.fromEntries(Object.entries(GAMES).map(([key, value]) => [key, { label: value.label }])), ...(ready() ? { bank: config.bank, account: config.account, accountName: config.accountName } : {}) }; },
    async createWallet() {
      requireReady();
      const token = crypto.randomBytes(32).toString('hex');
      const walletId = crypto.randomUUID();
      const createdAt = iso(now());
      await db.runTransaction(async tx => {
        tx.create(wallets().doc(walletId), { balance: 0, remainder: 0, totalDeposited: 0, history: [], activeGameId: null, redemptionId: null, createdAt, updatedAt: createdAt });
        tx.create(walletTokens().doc(hash(token)), { walletId, createdAt });
      });
      return { token, ...(await walletView(token)) };
    },
    wallet: walletView,
    async create(input, walletToken) {
      requireReady();
      const walletId = await walletIdFor(walletToken);
      const { name, amount } = validateInput(input);
      const requestId = cleanId(input?.requestId);
      if (!requestId) throw new DonationError(400, 'Yêu cầu tạo QR không hợp lệ.');
      const attemptId = hash(`${walletId}:${requestId}`);
      const token = crypto.createHmac('sha256', config.webhookKey).update(`donation:${walletId}:${requestId}`).digest('hex');
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = `DH${crypto.randomInt(10_000_000).toString().padStart(7, '0')}`;
        const row = await db.runTransaction(async tx => {
          const wallet = await tx.get(wallets().doc(walletId));
          const attemptRef = donationAttempts().doc(attemptId);
          const previous = await tx.get(attemptRef);
          if (!wallet.exists) throw new DonationError(404, 'Không tìm thấy ví.');
          if (previous.exists) {
            const saved = await tx.get(requests().doc(previous.data().code));
            if (!saved.exists) throw new DonationError(503, 'Không thể khôi phục mã chuyển khoản.');
            return saved.data();
          }
          const ref = requests().doc(code);
          const existing = await tx.get(ref);
          if (existing.exists) return null;
          const createdAt = iso(now());
          const value = { walletId, name, amount, code, account: config.account, bank: config.bank, createdAt, status: 'pending', paidAmount: 0, paymentCount: 0 };
          tx.create(ref, value);
          tx.create(tokens().doc(hash(token)), { code, walletId });
          tx.create(attemptRef, { walletId, code, createdAt });
          return value;
        });
        if (row) return { code: row.code, token, name: row.name, amount: row.amount, qrUrl: qrUrl(config, row.code, row.amount), bank: config.bank, account: config.account, accountName: config.accountName };
      }
      throw new DonationError(503, 'Chưa tạo được mã chuyển khoản. Vui lòng thử lại.');
    },
    async status(token, walletToken) {
      requireReady();
      const walletId = await walletIdFor(walletToken);
      const valid = cleanToken(token);
      if (!valid) throw new DonationError(401, 'Token tra cứu không hợp lệ.');
      const mapping = await tokens().doc(hash(valid)).get();
      if (!mapping.exists || mapping.data().walletId !== walletId) throw new DonationError(404, 'Không tìm thấy lượt nạp tiền.');
      const snapshot = await requests().doc(mapping.data().code).get();
      if (!snapshot.exists) throw new DonationError(404, 'Không tìm thấy lượt nạp tiền.');
      const { status, paidAmount, paymentCount } = snapshot.data();
      return { status, paidAmount, paymentCount };
    },
    async receive(payload) {
      requireReady();
      if (!payload || !Number.isSafeInteger(payload.id) || payload.id <= 0) throw new DonationError(400, 'ID giao dịch không hợp lệ.');
      return db.runTransaction(async tx => {
        const receiptRef = receipts().doc(String(payload.id));
        if ((await tx.get(receiptRef)).exists) return { success: true, result: 'duplicate' };
        const code = extractCode(payload);
        let result; let request; let requestRef; let wallet; let walletRef;
        if (payload.transferType !== 'in') result = 'ignored_out';
        else if (String(payload.accountNumber || '') !== config.account) result = 'wrong_account';
        else if (!Number.isSafeInteger(payload.transferAmount) || payload.transferAmount < 1 || payload.transferAmount > MAX_AMOUNT) result = 'invalid_amount';
        else if (!code) result = 'unmatched';
        else {
          requestRef = requests().doc(code);
          const requestSnapshot = await tx.get(requestRef);
          request = requestSnapshot.exists ? requestSnapshot.data() : null;
          if (request?.walletId && request.account === config.account) { walletRef = wallets().doc(request.walletId); const walletSnapshot = await tx.get(walletRef); wallet = walletSnapshot.exists ? walletSnapshot.data() : null; }
          result = request && wallet ? 'matched_paid' : 'unmatched';
        }
        const at = now(); const createdAt = iso(at);
        if (result === 'matched_paid') {
          const paidAmount = request.paidAmount + payload.transferAmount;
          const milli = wallet.remainder + payload.transferAmount;
          const credited = Math.floor(milli / 1000);
          const balance = wallet.balance + credited;
          if (!Number.isSafeInteger(paidAmount) || balance > MAX_BALANCE) throw new DonationError(503, 'Không thể ghi nhận số dư.');
          tx.update(requestRef, { status: 'paid', paidAmount, paymentCount: request.paymentCount + 1, confirmedAt: createdAt });
          tx.update(walletRef, { balance, remainder: milli % 1000, totalDeposited: wallet.totalDeposited + payload.transferAmount, updatedAt: createdAt, history: appendHistory(wallet, { id: `deposit-${payload.id}`, type: 'deposit', amount: credited, money: payload.transferAmount, balance, createdAt }) });
        }
        tx.create(receiptRef, { sepayId: payload.id, code, result, createdAt, amount: Number.isFinite(payload.transferAmount) ? payload.transferAmount : null, account: String(payload.accountNumber || '').slice(0, 100), content: String(payload.content || '').slice(0, 2000), reference: String(payload.referenceCode || '').slice(0, 200), transferType: String(payload.transferType || '').slice(0, 20) });
        return { success: true, result };
      });
    },
    async startGame(walletToken, input) {
      requireReady();
      const walletId = await walletIdFor(walletToken);
      const game = input?.game; const difficulty = input?.difficulty; const requestId = cleanId(input?.requestId);
      if (!GAMES[game] || !DIFFICULTIES[difficulty] || !requestId) throw new DonationError(400, 'Yêu cầu bắt đầu ván không hợp lệ.');
      const gameId = hash(`${walletId}:${requestId}`).slice(0, 32);
      const seed = crypto.randomBytes(16).toString('hex'); const at = now();
      return db.runTransaction(async tx => {
        const walletRef = wallets().doc(walletId); const gameRef = games().doc(gameId);
        const walletSnapshot = await tx.get(walletRef); const existing = await tx.get(gameRef);
        if (existing.exists) return publicGame(existing.data(), at);
        if (!walletSnapshot.exists) throw new DonationError(404, 'Không tìm thấy ví.');
        const wallet = walletSnapshot.data(); let active; let activeRef;
        if (wallet.activeGameId) { activeRef = games().doc(wallet.activeGameId); const activeSnapshot = await tx.get(activeRef); active = activeSnapshot.exists ? activeSnapshot.data() : null; }
        if (active?.status === 'active' && at <= active.expiresAt) throw new DonationError(409, 'Bạn đang có một ván chưa hoàn thành.');
        if (wallet.balance < 1) throw new DonationError(409, 'Bạn không đủ xu để chơi.');
        const rules = GAMES[game][difficulty];
        const expiresAt = at + (game === 'order' ? rules.duration : game === 'memory' ? rules.length * 700 + 15_000 : GAMES[game].expiresMs);
        const row = { id: gameId, walletId, requestId, game, difficulty, status: 'active', seed, phase: seededNumber(seed, 99) % 6283 / 1000, sequence: game === 'memory' ? sequence(seed, rules.length) : null, order: game === 'order' ? shuffled(seed, rules.count) : null, positions: game === 'heart' ? sequence(seed, Math.ceil(GAMES.heart.expiresMs / rules.interval) + 2, rules.cells) : null, startedAt: at, expiresAt };
        const balance = wallet.balance - 1;
        if (active?.status === 'active') tx.update(activeRef, { status: 'lost', finishedAt: iso(at), result: { won: false, payout: 0, reason: 'expired' } });
        tx.create(gameRef, row);
        tx.update(walletRef, { balance, activeGameId: gameId, updatedAt: iso(at), history: appendHistory(wallet, { id: `game-start-${gameId}`, type: 'game_cost', amount: -1, game, difficulty, balance, createdAt: iso(at) }) });
        return publicGame(row, at);
      });
    },
    async currentGame(walletToken) {
      requireReady(); const walletId = await walletIdFor(walletToken); const at = now();
      const walletSnapshot = await wallets().doc(walletId).get();
      if (!walletSnapshot.exists || !walletSnapshot.data().activeGameId) return { game: null, serverNow: at };
      const snapshot = await games().doc(walletSnapshot.data().activeGameId).get();
      if (!snapshot.exists || snapshot.data().status !== 'active') return { game: null, serverNow: at };
      return { game: publicGame(snapshot.data(), at), serverNow: at };
    },
    async play(walletToken, gameIdValue, input) {
      requireReady(); const walletId = await walletIdFor(walletToken); const gameId = cleanId(gameIdValue); const actionId = cleanId(input?.actionId);
      if (!gameId || !actionId) throw new DonationError(400, 'Thao tác chơi không hợp lệ.');
      const at = now();
      return db.runTransaction(async tx => {
        const gameRef = games().doc(gameId); const walletRef = wallets().doc(walletId);
        const gameSnapshot = await tx.get(gameRef); const walletSnapshot = await tx.get(walletRef);
        if (!gameSnapshot.exists || !walletSnapshot.exists || gameSnapshot.data().walletId !== walletId) throw new DonationError(404, 'Không tìm thấy ván chơi.');
        const row = gameSnapshot.data(); const wallet = walletSnapshot.data();
        if (row.status !== 'active') return row.result;
        let won = false; let reason = 'miss';
        if (at > row.expiresAt) reason = 'expired';
        else if (['bowl', 'needle', 'heart'].includes(row.game)) {
          const actionAt = Number(input.actionAt);
          if (!Number.isSafeInteger(actionAt) || Math.abs(at - actionAt) > 450 || actionAt < row.startedAt) throw new DonationError(400, 'Thời điểm thao tác không hợp lệ.');
          const rules = GAMES[row.game][row.difficulty]; const elapsed = actionAt - row.startedAt;
          if (row.game === 'heart') won = Number(input.position) === row.positions[Math.floor(elapsed / rules.interval)];
          else { const position = .5 + Math.sin((elapsed / rules.period) * Math.PI * 2 + row.phase) * .5; won = Math.abs(position - .5) <= rules.width / 2; }
          reason = won ? 'hit' : 'miss';
        } else if (row.game === 'memory') { won = Array.isArray(input.answers) && input.answers.length === row.sequence.length && input.answers.every((value, index) => value === row.sequence[index]); reason = won ? 'correct' : 'wrong_sequence'; }
        else if (row.game === 'order') { won = Array.isArray(input.answers) && input.answers.length === row.order.length && input.answers.every((value, index) => value === index + 1); reason = won ? 'correct' : 'wrong_order'; }
        const settled = gameResult(row, wallet, at, won, reason);
        tx.update(gameRef, { status: won ? 'won' : 'lost', actionId, finishedAt: iso(at), result: settled.result });
        tx.update(walletRef, { balance: settled.balance, activeGameId: null, updatedAt: iso(at), history: appendHistory(wallet, { id: `game-result-${gameId}`, type: won ? 'game_win' : 'game_loss', amount: settled.payout, game: row.game, difficulty: row.difficulty, balance: settled.balance, createdAt: iso(at) }) });
        return settled.result;
      });
    },
    async redeem(walletToken, input) {
      requireReady(); const walletId = await walletIdFor(walletToken);
      const name = String(input?.name || '').trim().slice(0, 80); const contact = String(input?.contact || '').trim().slice(0, 120); const requestId = cleanId(input?.requestId);
      if (!name || !contact || !requestId) throw new DonationError(400, 'Vui lòng nhập tên và số điện thoại hoặc Zalo.');
      const redemptionId = hash(`${walletId}:${requestId}`).slice(0, 32); const at = now();
      return db.runTransaction(async tx => {
        const walletRef = wallets().doc(walletId); const redemptionRef = redemptions().doc(redemptionId); const metaRef = redemptionMeta();
        const walletSnapshot = await tx.get(walletRef); const existing = await tx.get(redemptionRef); const meta = await tx.get(metaRef);
        if (existing.exists) return { id: redemptionId, status: existing.data().status };
        if (!walletSnapshot.exists) throw new DonationError(404, 'Không tìm thấy ví.');
        const wallet = walletSnapshot.data(); let pending;
        if (wallet.redemptionId) pending = await tx.get(redemptions().doc(wallet.redemptionId));
        if (pending?.exists && ['pending', 'approved'].includes(pending.data().status)) throw new DonationError(409, 'Bạn đang có một yêu cầu đổi quà chưa hoàn tất.');
        if (wallet.balance < REWARD_COST) throw new DonationError(409, `Cần đủ ${REWARD_COST} xu để đổi trà sữa.`);
        const createdAt = iso(at); const balance = wallet.balance - REWARD_COST;
        tx.create(redemptionRef, { id: redemptionId, walletId, name, contact, status: 'pending', cost: REWARD_COST, refunded: false, createdAt, updatedAt: createdAt });
        tx.set(metaRef, { ids: [...(meta.exists ? meta.data().ids || [] : []), redemptionId].slice(-500) });
        tx.update(walletRef, { balance, redemptionId, updatedAt: createdAt, history: appendHistory(wallet, { id: `redeem-${redemptionId}`, type: 'redemption', amount: -REWARD_COST, balance, createdAt }) });
        return { id: redemptionId, status: 'pending', balance };
      });
    },
    async redemption(walletToken) {
      requireReady(); const walletId = await walletIdFor(walletToken); const wallet = await wallets().doc(walletId).get();
      if (!wallet.exists || !wallet.data().redemptionId) return { redemption: null };
      const snapshot = await redemptions().doc(wallet.data().redemptionId).get();
      if (!snapshot.exists) return { redemption: null };
      const { id, status, cost, reason, createdAt, updatedAt } = snapshot.data();
      return { redemption: { id, status, cost, reason: reason || null, createdAt, updatedAt } };
    },
    async adminRedemptions() {
      requireReady(); const meta = await redemptionMeta().get(); const ids = meta.exists ? meta.data().ids || [] : [];
      const rows = await Promise.all(ids.slice().reverse().map(id => redemptions().doc(id).get()));
      return Promise.all(rows.filter(row => row.exists).map(async snapshot => {
        const row = snapshot.data();
        const wallet = await wallets().doc(row.walletId).get();
        return { ...row, walletHistory: wallet.exists ? (wallet.data().history || []).slice().reverse() : [] };
      }));
    },
    async updateRedemption(idValue, input) {
      requireReady(); const id = cleanId(idValue); const status = input?.status; const reason = String(input?.reason || '').trim().slice(0, 300);
      if (!id || !['approved', 'fulfilled', 'rejected'].includes(status)) throw new DonationError(400, 'Trạng thái đổi quà không hợp lệ.');
      return db.runTransaction(async tx => {
        const redemptionRef = redemptions().doc(id); const snapshot = await tx.get(redemptionRef);
        if (!snapshot.exists) throw new DonationError(404, 'Không tìm thấy yêu cầu đổi quà.');
        const row = snapshot.data(); if (row.status === status) return { id, status };
        if (status === 'approved' && row.status !== 'pending') throw new DonationError(409, 'Chỉ duyệt yêu cầu đang chờ.');
        if (status === 'fulfilled' && row.status !== 'approved') throw new DonationError(409, 'Cần duyệt trước khi đánh dấu đã tặng.');
        if (status === 'rejected' && !['pending', 'approved'].includes(row.status)) throw new DonationError(409, 'Không thể từ chối yêu cầu này.');
        if (status === 'rejected' && !reason) throw new DonationError(400, 'Cần nhập lý do từ chối.');
        const updatedAt = iso(now());
        let walletRef; let walletSnapshot;
        if (status === 'rejected' && !row.refunded) {
          walletRef = wallets().doc(row.walletId); walletSnapshot = await tx.get(walletRef);
          if (!walletSnapshot.exists) throw new DonationError(404, 'Không tìm thấy ví.');
        }
        if (status === 'rejected' && !row.refunded) {
          const wallet = walletSnapshot.data(); const balance = wallet.balance + row.cost;
          tx.update(walletRef, { balance, updatedAt, history: appendHistory(wallet, { id: `refund-${id}`, type: 'redemption_refund', amount: row.cost, balance, createdAt: updatedAt }) });
          tx.update(redemptionRef, { status, reason, refunded: true, updatedAt });
        } else tx.update(redemptionRef, { status, ...(reason ? { reason } : {}), updatedAt });
        return { id, status };
      });
    },
  };
}

module.exports = { createDonationService, DonationError, readConfig, verifyKey, MAX_AMOUNT, REWARD_COST, GAMES, DIFFICULTIES };
