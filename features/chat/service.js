const crypto = require('node:crypto');
const sharp = require('sharp');

const CHAT_COST = 10;
const CHAT_DURATION_MS = 60 * 60 * 1000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE = 3;
const MAX_TEXT = 4000;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Keep a session below Firestore's 500-write transaction limit so retention
// cleanup can delete every message and mark the session purged atomically.
const MAX_MESSAGES = 400;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const cleanToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
const cleanId = value => typeof value === 'string' && /^[a-f0-9-]{16,64}$/i.test(value) ? value : null;
const iso = value => new Date(value).toISOString();
const appendHistory = (wallet, entry) => [...(Array.isArray(wallet.history) ? wallet.history : []), entry].slice(-100);

class ChatError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function safeText(value) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new ChatError(400, 'Tin nhắn không hợp lệ.');
  const text = value.replace(/\r\n?/g, '\n').replace(/\p{Cf}/gu, '').replace(/\p{Cc}/gu, char => char === '\n' || char === '\t' ? char : '').trim();
  if (text.length > MAX_TEXT) throw new ChatError(400, `Tin nhắn tối đa ${MAX_TEXT.toLocaleString('vi-VN')} ký tự.`);
  return text;
}

function safeFileName(value) {
  return String(value || 'anh').normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 100) || 'anh';
}

function publicSession(row, now) {
  const expired = now >= row.expiresAt && row.status === 'active';
  return {
    id: row.id,
    status: expired ? 'expired' : row.status,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    purgeAt: row.purgeAt,
    serverNow: now,
    messageCount: row.messageCount || 0,
    userMessageCount: row.userMessageCount || 0,
    adminMessageCount: row.adminMessageCount || 0,
    adminReplied: Boolean(row.adminRepliedAt),
    refunded: Boolean(row.refundApplied),
  };
}

function createChatService({ db, bucket, buckets = [], now = () => Date.now() }) {
  const storageCandidates = [bucket, ...buckets].filter(Boolean);
  let storageBucket = null;
  let storageVerified = false;
  let maintenanceTimer = null;
  let lastOrphanSweep = 0;
  const col = name => db.collection(name);
  const wallets = () => col('game_wallets');
  const walletTokens = () => col('game_wallet_tokens');
  const sessions = () => col('chat_sessions');
  const messages = () => col('chat_messages');
  const metaRef = () => col('chat_meta').doc('sessions');
  const ready = () => Boolean(db && storageBucket && storageVerified);
  const requireDb = () => { if (!db) throw new ChatError(503, 'Trợ lý chat chưa sẵn sàng. Vui lòng quay lại sau.'); };
  const requireReady = () => { if (!ready()) throw new ChatError(503, 'Trợ lý chat chưa sẵn sàng. Vui lòng quay lại sau.'); };

  async function walletIdFor(token) {
    requireDb();
    const valid = cleanToken(token);
    if (!valid) throw new ChatError(401, 'Mã ví không hợp lệ.');
    const mapping = await walletTokens().doc(hash(valid)).get();
    if (!mapping.exists) throw new ChatError(401, 'Không tìm thấy ví.');
    return mapping.data().walletId;
  }

  async function verifyStorage() {
    if (!db || !storageCandidates.length) return false;
    let lastError;
    for (const candidate of storageCandidates) {
      let probe = null;
      try {
        const probePath = `private-chat-health/${crypto.randomUUID()}.txt`;
        probe = candidate.file(probePath);
        await probe.save(Buffer.from('ok'), { resumable: false, contentType: 'text/plain', metadata: { cacheControl: 'private, no-store, max-age=0' } });
        const [contents] = await probe.download();
        if (!Buffer.isBuffer(contents) || contents.toString() !== 'ok') throw new Error('storage health check mismatch');
        await probe.delete({ ignoreNotFound: true });
        probe = null;
        storageBucket = candidate;
        storageVerified = true;
        return true;
      } catch (error) {
        lastError = error;
        if (probe) await probe.delete({ ignoreNotFound: true }).catch(() => {});
      }
    }
    storageBucket = null;
    storageVerified = false;
    console.error('Chat storage verification failed:', lastError?.code || lastError?.name || 'unavailable');
    return false;
  }

  async function sessionForWallet(token, sessionIdValue, allowPurged = false) {
    requireDb();
    const walletId = await walletIdFor(token);
    const sessionId = cleanId(sessionIdValue);
    if (!sessionId) throw new ChatError(400, 'Phiên trò chuyện không hợp lệ.');
    await settleExpired(sessionId);
    const snapshot = await sessions().doc(sessionId).get();
    if (!snapshot.exists || snapshot.data().walletId !== walletId) throw new ChatError(404, 'Không tìm thấy phiên trò chuyện.');
    const row = snapshot.data();
    if (!allowPurged && (row.status === 'purged' || now() >= row.purgeAt)) throw new ChatError(410, 'Nội dung phiên trò chuyện đã hết thời hạn lưu trữ.');
    return { walletId, row };
  }

  async function activeRows() {
    if (!db) return [];
    const meta = await metaRef().get();
    const ids = meta.exists ? meta.data().activeIds || [] : [];
    const rows = await Promise.all(ids.map(id => sessions().doc(id).get()));
    const at = now();
    return rows.filter(item => item.exists).map(item => item.data()).filter(row => row.status === 'active' && row.expiresAt > at);
  }

  async function settleExpired(sessionIdValue) {
    if (!db) return null;
    const sessionId = cleanId(sessionIdValue);
    if (!sessionId) return null;
    const at = now();
    return db.runTransaction(async tx => {
      const sessionRef = sessions().doc(sessionId);
      const snapshot = await tx.get(sessionRef);
      if (!snapshot.exists) return null;
      const row = snapshot.data();
      if (row.status !== 'active' || at < row.expiresAt) return row;
      const walletRef = wallets().doc(row.walletId);
      const walletSnapshot = await tx.get(walletRef);
      if (!walletSnapshot.exists) throw new ChatError(404, 'Không tìm thấy ví của phiên trò chuyện.');
      const wallet = walletSnapshot.data();
      const refund = !row.adminRepliedAt && !row.refundApplied;
      const balance = wallet.balance + (refund ? CHAT_COST : 0);
      const updatedAt = iso(at);
      tx.update(sessionRef, { status: 'expired', refundApplied: refund || Boolean(row.refundApplied), refundedAt: refund ? updatedAt : row.refundedAt || null, updatedAt });
      const walletUpdate = { updatedAt };
      if (wallet.activeChatId === sessionId) walletUpdate.activeChatId = null;
      if (refund) {
        walletUpdate.balance = balance;
        walletUpdate.history = appendHistory(wallet, { id: `chat-refund-${sessionId}`, type: 'chat_refund', amount: CHAT_COST, balance, createdAt: updatedAt });
      }
      tx.update(walletRef, walletUpdate);
      return { ...row, status: 'expired', refundApplied: refund || Boolean(row.refundApplied) };
    });
  }

  async function encodeAndUpload(files, sessionId, messageId) {
    if (!files?.length) return [];
    if (files.length > MAX_IMAGES) throw new ChatError(400, `Mỗi tin nhắn chỉ được gửi tối đa ${MAX_IMAGES} ảnh.`);
    const attachments = [];
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        if (!file?.buffer || file.buffer.length > MAX_IMAGE_BYTES) throw new ChatError(400, 'Mỗi ảnh tối đa 5 MB.');
        let pipeline;
        let metadata;
        try {
          pipeline = sharp(file.buffer, { failOn: 'error', limitInputPixels: 40_000_000 });
          metadata = await pipeline.metadata();
        } catch {
          throw new ChatError(400, 'Tệp gửi lên không phải ảnh hợp lệ.');
        }
        if (!ALLOWED_FORMATS.has(metadata.format)) throw new ChatError(400, 'Chỉ nhận ảnh JPEG, PNG hoặc WebP.');
        const output = await pipeline.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
        if (output.length > MAX_IMAGE_BYTES) throw new ChatError(400, 'Ảnh sau xử lý vẫn vượt quá 5 MB.');
        const storagePath = `private-chat/${sessionId}/${messageId}/${crypto.randomUUID()}-${index}.webp`;
        await storageBucket.file(storagePath).save(output, { resumable: false, contentType: 'image/webp', metadata: { cacheControl: 'private, no-store, max-age=0' } });
        attachments.push({ index, name: safeFileName(file.originalname), mime: 'image/webp', size: output.length, storagePath });
      }
      return attachments;
    } catch (error) {
      await removeFiles(attachments);
      throw error;
    }
  }

  async function removeFiles(attachments) {
    await Promise.allSettled((attachments || []).map(item => storageBucket.file(item.storagePath).delete({ ignoreNotFound: true })));
  }

  async function sendMessage({ sessionIdValue, requestIdValue, textValue, files, role, walletToken }) {
    requireDb();
    const sessionId = cleanId(sessionIdValue);
    const requestId = cleanId(requestIdValue);
    if (!sessionId || !requestId) throw new ChatError(400, 'Yêu cầu gửi tin không hợp lệ.');
    const text = safeText(textValue);
    if (!text && !files?.length) throw new ChatError(400, 'Hãy nhập nội dung hoặc chọn ảnh.');
    let walletId = null;
    if (role === 'user') walletId = await walletIdFor(walletToken);
    const messageId = hash(`${sessionId}:${role}:${requestId}`).slice(0, 32);
    const existing = await messages().doc(messageId).get();
    if (existing.exists) return existing.data();
    if (files?.length) requireReady();
    const before = await sessions().doc(sessionId).get();
    if (!before.exists || (role === 'user' && before.data().walletId !== walletId)) throw new ChatError(404, 'Không tìm thấy phiên trò chuyện.');
    if (before.data().status !== 'active' || now() >= before.data().expiresAt) {
      await settleExpired(sessionId);
      throw new ChatError(409, 'Phiên trò chuyện đã hết giờ.');
    }
    let attachments = [];
    try {
      attachments = await encodeAndUpload(files, sessionId, messageId);
      const at = now();
      const result = await db.runTransaction(async tx => {
        const sessionRef = sessions().doc(sessionId);
        const messageRef = messages().doc(messageId);
        const sessionSnapshot = await tx.get(sessionRef);
        const messageSnapshot = await tx.get(messageRef);
        if (messageSnapshot.exists) return messageSnapshot.data();
        if (!sessionSnapshot.exists || (role === 'user' && sessionSnapshot.data().walletId !== walletId)) throw new ChatError(404, 'Không tìm thấy phiên trò chuyện.');
        const session = sessionSnapshot.data();
        if (session.status !== 'active' || at >= session.expiresAt) throw new ChatError(409, 'Phiên trò chuyện đã hết giờ.');
        if ((session.messageCount || 0) >= MAX_MESSAGES) throw new ChatError(409, 'Phiên trò chuyện đã đạt giới hạn tin nhắn.');
        const seq = (session.messageCount || 0) + 1;
        const createdAt = iso(at);
        const row = { id: messageId, sessionId, seq, role, text, attachments, createdAt };
        tx.create(messageRef, row);
        tx.update(sessionRef, { messageCount: seq, messageIds: [...(session.messageIds || []), messageId], userMessageCount: (session.userMessageCount || 0) + (role === 'user' ? 1 : 0), adminMessageCount: (session.adminMessageCount || 0) + (role === 'admin' ? 1 : 0), updatedAt: createdAt, ...(role === 'admin' ? { adminRepliedAt: session.adminRepliedAt || createdAt } : {}) });
        return row;
      });
      const keptPaths = new Set((result.attachments || []).map(item => item.storagePath));
      await removeFiles(attachments.filter(item => !keptPaths.has(item.storagePath)));
      return result;
    } catch (error) {
      await removeFiles(attachments);
      throw error;
    }
  }

  async function listMessages(row, afterValue) {
    const after = Number.isSafeInteger(Number(afterValue)) && Number(afterValue) >= 0 ? Number(afterValue) : 0;
    const ids = (row.messageIds || []).slice(after, after + 50);
    const snapshots = await Promise.all(ids.map(id => messages().doc(id).get()));
    const items = snapshots.filter(item => item.exists).map(item => {
      const message = item.data();
      return { id: message.id, seq: message.seq, role: message.role, text: message.text, createdAt: message.createdAt, attachments: (message.attachments || []).map(({ index, name, mime, size }) => ({ index, name, mime, size })) };
    }).sort((a, b) => a.seq - b.seq);
    return { messages: items, cursor: after + items.length, hasMore: after + items.length < (row.messageIds || []).length };
  }

  async function purgeSession(sessionIdValue) {
    const sessionId = cleanId(sessionIdValue);
    if (!sessionId || !db || !storageBucket) return false;
    const snapshot = await sessions().doc(sessionId).get();
    if (!snapshot.exists) return false;
    const row = snapshot.data();
    if (row.status === 'purged' || now() < row.purgeAt) return false;
    const messageSnapshots = await Promise.all((row.messageIds || []).map(id => messages().doc(id).get()));
    const attachments = messageSnapshots.filter(item => item.exists).flatMap(item => item.data().attachments || []);
    await removeFiles(attachments);
    await db.runTransaction(async tx => {
      const sessionRef = sessions().doc(sessionId);
      const current = await tx.get(sessionRef);
      const currentMessages = await Promise.all((current.exists ? current.data().messageIds || [] : []).map(id => tx.get(messages().doc(id))));
      if (!current.exists || current.data().status === 'purged') return;
      for (const item of currentMessages) if (item.exists) tx.delete(messages().doc(item.data().id));
      tx.update(sessionRef, { status: 'purged', messageIds: [], messageCount: 0, contentPurgedAt: iso(now()), updatedAt: iso(now()) });
    });
    return true;
  }

  async function cleanupOrphanImages() {
    const at = now();
    if (!storageBucket?.getFiles || at - lastOrphanSweep < 60 * 60 * 1000) return;
    lastOrphanSweep = at;
    const [files] = await storageBucket.getFiles({ prefix: 'private-chat/' });
    for (const file of files) {
      const created = Date.parse(file.metadata?.timeCreated || '');
      if (!Number.isFinite(created) || at - created < 60 * 60 * 1000) continue;
      const parts = String(file.name || '').split('/');
      const messageId = parts.length === 4 ? cleanId(parts[2]) : null;
      if (!messageId || !(await messages().doc(messageId).get()).exists) await file.delete({ ignoreNotFound: true });
    }
  }

  async function sweep() {
    if (!db) return;
    const meta = await metaRef().get();
    const ids = meta.exists ? meta.data().ids || [] : [];
    for (const id of ids) {
      const snapshot = await sessions().doc(id).get();
      if (!snapshot.exists) continue;
      const row = snapshot.data();
      if (row.status === 'active' && now() >= row.expiresAt) await settleExpired(id);
      if (now() >= row.purgeAt) await purgeSession(id);
    }
    const active = await activeRows();
    await metaRef().set({ ids: ids.slice(-1000), activeIds: active.map(row => row.id), updatedAt: iso(now()) }, { merge: true });
    await cleanupOrphanImages();
  }

  return {
    constants: { cost: CHAT_COST, durationMs: CHAT_DURATION_MS, retentionMs: RETENTION_MS, maxActive: MAX_ACTIVE, maxImages: MAX_IMAGES, maxImageBytes: MAX_IMAGE_BYTES, maxText: MAX_TEXT },
    ready,
    async publicConfig() {
      const active = db ? await activeRows() : [];
      return { ready: ready(), cost: CHAT_COST, durationMs: CHAT_DURATION_MS, retentionMs: RETENTION_MS, maxActive: MAX_ACTIVE, activeCount: active.length, available: ready() && active.length < MAX_ACTIVE, humanAnswered: true };
    },
    async startMaintenance() {
      await verifyStorage();
      if (db) await sweep().catch(error => console.error('Chat maintenance failed:', error.code || error.name));
      if (!maintenanceTimer) {
        maintenanceTimer = setInterval(() => sweep().catch(error => console.error('Chat maintenance failed:', error.code || error.name)), 60_000);
        maintenanceTimer.unref?.();
      }
    },
    stopMaintenance() { if (maintenanceTimer) clearInterval(maintenanceTimer); maintenanceTimer = null; },
    verifyStorage,
    sweep,
    settleExpired,
    purgeSession,
    async start(walletToken, input) {
      requireReady();
      const walletId = await walletIdFor(walletToken);
      const requestId = cleanId(input?.requestId);
      if (!requestId) throw new ChatError(400, 'Yêu cầu bắt đầu phiên không hợp lệ.');
      const sessionId = hash(`${walletId}:${requestId}`).slice(0, 32);
      const at = now();
      return db.runTransaction(async tx => {
        const walletRef = wallets().doc(walletId);
        const sessionRef = sessions().doc(sessionId);
        const walletSnapshot = await tx.get(walletRef);
        const existing = await tx.get(sessionRef);
        const meta = await tx.get(metaRef());
        if (existing.exists) return publicSession(existing.data(), at);
        if (!walletSnapshot.exists) throw new ChatError(404, 'Không tìm thấy ví.');
        const metaData = meta.exists ? meta.data() : {};
        const activeSnapshots = await Promise.all((metaData.activeIds || []).map(id => tx.get(sessions().doc(id))));
        const wallet = walletSnapshot.data();
        let walletActive = null;
        if (wallet.activeChatId && !(metaData.activeIds || []).includes(wallet.activeChatId)) walletActive = await tx.get(sessions().doc(wallet.activeChatId));
        const active = activeSnapshots.filter(item => item.exists).map(item => item.data()).filter(row => row.status === 'active' && row.expiresAt > at);
        const current = active.find(row => row.walletId === walletId) || (walletActive?.exists && walletActive.data().status === 'active' && walletActive.data().expiresAt > at ? walletActive.data() : null);
        if (current) throw new ChatError(409, 'Bạn đang có một phiên trò chuyện chưa kết thúc.');
        if (active.length >= MAX_ACTIVE) throw new ChatError(409, 'Trợ lý đang bận đủ 3 phiên. Bạn chưa bị trừ xu, vui lòng quay lại sau.');
        if (wallet.balance < CHAT_COST) throw new ChatError(409, `Cần ${CHAT_COST} xu để bắt đầu trò chuyện.`);
        const startedAt = at;
        const expiresAt = at + CHAT_DURATION_MS;
        const createdAt = iso(at);
        const row = { id: sessionId, walletId, requestId, status: 'active', startedAt, expiresAt, purgeAt: expiresAt + RETENTION_MS, messageCount: 0, userMessageCount: 0, adminMessageCount: 0, messageIds: [], adminRepliedAt: null, refundApplied: false, createdAt, updatedAt: createdAt };
        const balance = wallet.balance - CHAT_COST;
        tx.create(sessionRef, row);
        tx.update(walletRef, { balance, activeChatId: sessionId, chatSessionIds: [...(wallet.chatSessionIds || []), sessionId].slice(-30), updatedAt: createdAt, history: appendHistory(wallet, { id: `chat-start-${sessionId}`, type: 'chat_cost', amount: -CHAT_COST, balance, createdAt }) });
        tx.set(metaRef(), { ids: [...new Set([...(metaData.ids || []), sessionId])].slice(-1000), activeIds: [...active.map(item => item.id), sessionId], updatedAt: createdAt });
        return publicSession(row, at);
      });
    },
    async list(walletToken) {
      requireDb();
      const walletId = await walletIdFor(walletToken);
      const wallet = await wallets().doc(walletId).get();
      if (!wallet.exists) throw new ChatError(404, 'Không tìm thấy ví.');
      const ids = (wallet.data().chatSessionIds || []).slice(-20).reverse();
      for (const id of ids) await settleExpired(id);
      const snapshots = await Promise.all(ids.map(id => sessions().doc(id).get()));
      const at = now();
      const rows = snapshots.filter(item => item.exists).map(item => item.data()).filter(row => row.status !== 'purged' && at < row.purgeAt);
      return { sessions: rows.map(row => publicSession(row, at)), activeSessionId: rows.find(row => row.status === 'active' && row.expiresAt > at)?.id || null, serverNow: at };
    },
    async get(walletToken, sessionId) {
      const { row } = await sessionForWallet(walletToken, sessionId);
      return publicSession(row, now());
    },
    async messages(walletToken, sessionId, after) {
      const { row } = await sessionForWallet(walletToken, sessionId);
      return listMessages(row, after);
    },
    sendUserMessage(walletToken, sessionId, input, files) { return sendMessage({ sessionIdValue: sessionId, requestIdValue: input?.requestId, textValue: input?.text, files, role: 'user', walletToken }); },
    async adminSessions() {
      requireDb();
      await sweep();
      const meta = await metaRef().get();
      const ids = meta.exists ? (meta.data().ids || []).slice().reverse() : [];
      const snapshots = await Promise.all(ids.map(id => sessions().doc(id).get()));
      const at = now();
      return snapshots.filter(item => item.exists).map(item => item.data()).filter(row => row.status !== 'purged' && at < row.purgeAt).map(row => publicSession(row, at));
    },
    async adminMessages(sessionIdValue, after) {
      requireDb();
      const sessionId = cleanId(sessionIdValue);
      if (!sessionId) throw new ChatError(400, 'Phiên trò chuyện không hợp lệ.');
      await settleExpired(sessionId);
      const snapshot = await sessions().doc(sessionId).get();
      if (!snapshot.exists || snapshot.data().status === 'purged' || now() >= snapshot.data().purgeAt) throw new ChatError(404, 'Không tìm thấy phiên trò chuyện.');
      return listMessages(snapshot.data(), after);
    },
    sendAdminMessage(sessionId, input, files) { return sendMessage({ sessionIdValue: sessionId, requestIdValue: input?.requestId, textValue: input?.text, files, role: 'admin' }); },
    async readImage({ walletToken, sessionIdValue, messageIdValue, indexValue, admin = false }) {
      requireReady();
      const sessionId = cleanId(sessionIdValue);
      const messageId = cleanId(messageIdValue);
      const index = Number(indexValue);
      if (!sessionId || !messageId || !Number.isInteger(index) || index < 0 || index >= MAX_IMAGES) throw new ChatError(400, 'Ảnh không hợp lệ.');
      if (!admin) await sessionForWallet(walletToken, sessionId);
      else {
        const session = await sessions().doc(sessionId).get();
        if (!session.exists || session.data().status === 'purged' || now() >= session.data().purgeAt) throw new ChatError(404, 'Không tìm thấy ảnh.');
      }
      const message = await messages().doc(messageId).get();
      if (!message.exists || message.data().sessionId !== sessionId) throw new ChatError(404, 'Không tìm thấy ảnh.');
      const attachment = (message.data().attachments || []).find(item => item.index === index);
      if (!attachment) throw new ChatError(404, 'Không tìm thấy ảnh.');
      const [buffer] = await storageBucket.file(attachment.storagePath).download();
      return { buffer, mime: attachment.mime, name: attachment.name };
    },
  };
}

module.exports = { createChatService, ChatError, CHAT_COST, CHAT_DURATION_MS, RETENTION_MS, MAX_ACTIVE, MAX_TEXT, MAX_IMAGES, MAX_IMAGE_BYTES };
