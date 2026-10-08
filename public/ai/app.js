(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const walletKey = 'locly-game-wallet';
  const paymentKey = 'locly-chat-payment';
  const topupAttemptKey = 'locly-chat-topup-attempt';
  const startAttemptKey = 'locly-chat-start-attempt';
  const requestId = () => crypto.randomUUID?.() || `${Date.now().toString(16)}-${crypto.getRandomValues(new Uint32Array(4)).join('-')}`;
  const money = value => `${Number(value).toLocaleString('vi-VN')}đ`;
  let walletToken = localStorage.getItem(walletKey);
  let wallet = null;
  let config = null;
  let payment = null;
  let sessions = [];
  let selectedSession = null;
  let activeSessionId = null;
  let cursor = 0;
  let seenMessages = new Set();
  let selectedFiles = [];
  let clockOffset = 0;
  let timerId = 0;
  let paymentTimer = 0;
  let messageTimer = 0;
  let messageAttemptId = null;

  function openImage(image) {
    if (!image?.src) return;
    $('image-lightbox-img').src = image.src;
    $('image-lightbox-img').alt = image.alt || 'Ảnh phóng lớn';
    $('image-lightbox-caption').textContent = image.alt || '';
    $('image-lightbox').showModal();
  }

  async function api(url, options = {}, withWallet = true) {
    const headers = { ...(options.headers || {}) };
    if (withWallet && walletToken) headers['X-Wallet-Token'] = walletToken;
    const response = await fetch(url, { ...options, headers, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    const type = response.headers.get('content-type') || '';
    const body = type.includes('application/json') ? await response.json().catch(() => ({})) : {};
    if (!response.ok) throw new Error(body.error || 'Kết nối đang gián đoạn.');
    return body;
  }
  const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const serverNow = () => Date.now() + clockOffset;

  function renderWallet(value) {
    wallet = value;
    $('wallet-balance').textContent = value.balance;
    $('start-chat').disabled = !config?.ready || !config.available || value.balance < 10 || Boolean(activeSessionId);
  }
  async function refreshWallet() { const value = await api('/api/game/wallet'); renderWallet(value); return value; }
  async function ensureWallet() {
    if (walletToken) {
      try { return await refreshWallet(); } catch { localStorage.removeItem(walletKey); walletToken = null; }
    }
    const created = await api('/api/game/wallets', { method: 'POST' }, false);
    walletToken = created.token; localStorage.setItem(walletKey, walletToken); renderWallet(created); return created;
  }

  function savePayment(value) {
    payment = value;
    if (value) localStorage.setItem(paymentKey, JSON.stringify(value)); else localStorage.removeItem(paymentKey);
  }
  async function pollPayment() {
    clearTimeout(paymentTimer);
    if (!payment) return;
    try {
      const status = await api('/api/donations/status', { headers: { 'X-Donation-Token': payment.token } });
      if (status.status === 'paid') {
        $('payment-status').textContent = `Đã nhận ${money(status.paidAmount)}. Xu đã vào ví.`;
        $('qr-box').hidden = true; savePayment(null); await refreshWallet(); return;
      }
    } catch (error) { $('payment-status').textContent = `${error.message} Trang sẽ tự thử lại.`; }
    paymentTimer = setTimeout(pollPayment, 3000);
  }
  function displayPayment(value) {
    savePayment(value); $('topup-form').hidden = true; $('payment').hidden = false; $('qr-box').hidden = false; $('qr-image').hidden = false; $('qr-error').hidden = true;
    $('qr-image').src = value.qrUrl; $('bank-name').textContent = value.bank; $('account-number').textContent = value.account; $('payment-amount').textContent = money(value.amount); $('payment-code').textContent = value.code; $('payment-status').textContent = 'Đang chờ tiền về…'; pollPayment();
  }

  function sessionLabel(session) {
    if (session.status === 'active' && session.expiresAt > serverNow()) return 'Đang hoạt động';
    if (session.refunded) return 'Đã hết giờ · đã hoàn 10 xu';
    return 'Đã kết thúc';
  }
  function renderSessionList() {
    $('session-list').replaceChildren(...sessions.map(session => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `session-item${selectedSession?.id === session.id ? ' active' : ''}`;
      const title = document.createElement('strong'); title.textContent = new Date(session.startedAt).toLocaleString('vi-VN');
      const state = document.createElement('small'); state.textContent = sessionLabel(session);
      button.append(title, state); button.addEventListener('click', () => selectSession(session)); return button;
    }));
  }
  function updateComposer() {
    const active = selectedSession?.status === 'active' && selectedSession.expiresAt > serverNow();
    $('message-text').disabled = !active; $('image-input').disabled = !active; $('send-message').disabled = !active;
    $('session-state').textContent = selectedSession ? sessionLabel(selectedSession) : 'Chưa có phiên';
    $('live-dot').classList.toggle('live', active);
    $('new-session').hidden = Boolean(activeSessionId);
  }
  function updateTimer() {
    clearTimeout(timerId);
    if (!selectedSession) return;
    const remaining = Math.max(0, selectedSession.expiresAt - serverNow());
    const minutes = Math.floor(remaining / 60_000); const seconds = Math.floor(remaining % 60_000 / 1000);
    $('chat-timer').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (remaining <= 0 && selectedSession.status === 'active') refreshSessions().catch(() => {});
    else timerId = setTimeout(updateTimer, 1000);
  }

  async function attachmentImage(sessionId, messageId, index, alt) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'image-open'; button.setAttribute('aria-label', `Phóng lớn ${alt || 'ảnh đính kèm'}`);
    const image = document.createElement('img'); image.alt = alt || 'Ảnh đính kèm'; image.loading = 'lazy';
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/images/${messageId}/${index}`, { headers: { 'X-Wallet-Token': walletToken }, cache: 'no-store' });
      if (!response.ok) throw new Error();
      image.src = URL.createObjectURL(await response.blob());
      button.addEventListener('click', () => openImage(image));
    } catch { image.alt = 'Không tải được ảnh'; button.disabled = true; }
    button.append(image);
    return button;
  }
  async function appendMessages(items, sessionId) {
    const box = $('messages');
    const stayAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    if (items.length && box.querySelector('.empty')) box.replaceChildren();
    for (const item of items) {
      if (seenMessages.has(item.id)) continue;
      seenMessages.add(item.id);
      const article = document.createElement('article'); article.className = `message ${item.role === 'user' ? 'user' : 'assistant'}`;
      if (item.text) { const text = document.createElement('div'); text.textContent = item.text; article.append(text); }
      if (item.attachments?.length) {
        const gallery = document.createElement('div'); gallery.className = 'message-images'; article.append(gallery);
        for (const attachment of item.attachments) gallery.append(await attachmentImage(sessionId, item.id, attachment.index, attachment.name));
      }
      const time = document.createElement('time'); time.textContent = new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); article.append(time); box.append(article);
    }
    if (stayAtBottom) box.scrollTop = box.scrollHeight;
  }
  async function pollMessages() {
    clearTimeout(messageTimer);
    if (!selectedSession) return;
    const sessionId = selectedSession.id;
    try {
      let page;
      do {
        page = await api(`/api/chat/sessions/${sessionId}/messages?after=${cursor}`);
        if (selectedSession?.id !== sessionId) return;
        await appendMessages(page.messages, sessionId); cursor = page.cursor;
      } while (page.hasMore);
    } catch (error) { $('message-error').textContent = error.message; }
    messageTimer = setTimeout(pollMessages, 2000);
  }
  async function selectSession(session) {
    selectedSession = session; cursor = 0; seenMessages = new Set(); $('messages').innerHTML = '<div class="empty"><p>Đang tải tin nhắn…</p></div>'; $('chat-shell').hidden = false;
    renderSessionList(); updateComposer(); updateTimer(); await pollMessages();
  }
  async function refreshSessions() {
    const response = await api('/api/chat/sessions');
    clockOffset = response.serverNow - Date.now(); sessions = response.sessions; activeSessionId = response.activeSessionId;
    if (sessions.length) {
      $('purchase').hidden = Boolean(activeSessionId);
      $('chat-shell').hidden = false;
      const updated = selectedSession ? sessions.find(item => item.id === selectedSession.id) : sessions.find(item => item.id === activeSessionId) || sessions[0];
      if (!selectedSession || !updated || updated.status !== selectedSession.status) await selectSession(updated || sessions[0]);
      else { selectedSession = updated; renderSessionList(); updateComposer(); updateTimer(); }
    } else { $('purchase').hidden = false; $('chat-shell').hidden = true; }
    await refreshWallet();
  }
  function renderAvailability() {
    $('availability').textContent = config?.ready ? (config.available ? 'Locly AI sẵn sàng nhận phiên mới.' : 'AI đang bận đủ 3 phiên. Bạn chưa bị trừ xu; hãy quay lại sau.') : 'Locly AI chưa sẵn sàng nhận phiên mới.';
    $('availability').hidden = Boolean(config?.ready && config.available);
    if (wallet) renderWallet(wallet);
  }
  async function refreshChatState() {
    config = await api('/api/chat/config', {}, false); renderAvailability();
    if (config.ready) await refreshSessions();
    else await refreshSessions().catch(() => {});
  }

  function renderPreviews() {
    const holder = $('previews'); holder.replaceChildren();
    selectedFiles.forEach((file, index) => {
      const box = document.createElement('div'); box.className = 'preview';
      const image = document.createElement('img'); image.src = URL.createObjectURL(file); image.alt = file.name;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.addEventListener('click', () => { selectedFiles.splice(index, 1); renderPreviews(); });
      box.append(image, remove); holder.append(box);
    });
    holder.hidden = !selectedFiles.length;
  }

  document.querySelectorAll('[data-amount]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-amount]').forEach(item => item.classList.remove('active')); button.classList.add('active'); $('topup-amount').value = button.dataset.amount; }));
  $('image-lightbox-close').addEventListener('click', () => $('image-lightbox').close());
  $('image-lightbox').addEventListener('click', event => { if (event.target === $('image-lightbox')) $('image-lightbox').close(); });
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => navigator.clipboard.writeText($(button.dataset.copy).textContent)));
  $('qr-image').addEventListener('error', () => { $('qr-image').hidden = true; $('qr-error').hidden = false; });
  $('topup-form').addEventListener('submit', async event => {
    event.preventDefault(); $('topup-error').textContent = ''; $('create-qr').disabled = true;
    const attemptId = localStorage.getItem(topupAttemptKey) || requestId(); localStorage.setItem(topupAttemptKey, attemptId);
    try { const created = await api('/api/donations', json({ name: $('player-name').value, amount: Number($('topup-amount').value), requestId: attemptId })); localStorage.removeItem(topupAttemptKey); displayPayment(created); }
    catch (error) { $('topup-error').textContent = error.message; } finally { $('create-qr').disabled = false; }
  });
  $('new-topup').addEventListener('click', () => { savePayment(null); localStorage.removeItem(topupAttemptKey); $('payment').hidden = true; $('topup-form').hidden = false; });
  $('start-chat').addEventListener('click', async () => {
    $('start-error').textContent = ''; $('start-chat').disabled = true;
    const attemptId = localStorage.getItem(startAttemptKey) || requestId(); localStorage.setItem(startAttemptKey, attemptId);
    try { await api('/api/chat/sessions', json({ requestId: attemptId })); localStorage.removeItem(startAttemptKey); selectedSession = null; await refreshSessions(); }
    catch (error) { $('start-error').textContent = error.message; await refreshWallet().catch(() => {}); }
  });
  $('new-session').addEventListener('click', () => { $('purchase').hidden = false; $('purchase').scrollIntoView({ behavior: 'smooth' }); });
  $('image-input').addEventListener('change', event => {
    const files = [...event.target.files];
    if (selectedFiles.length + files.length > 3) { $('message-error').textContent = 'Mỗi tin nhắn chỉ được gửi tối đa 3 ảnh.'; return; }
    if (files.some(file => file.size > 5 * 1024 * 1024)) { $('message-error').textContent = 'Mỗi ảnh tối đa 5 MB.'; return; }
    selectedFiles.push(...files); event.target.value = ''; renderPreviews();
  });
  $('message-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!selectedSession) return; $('message-error').textContent = ''; $('send-message').disabled = true;
    messageAttemptId ||= requestId(); const data = new FormData(); data.append('requestId', messageAttemptId); data.append('text', $('message-text').value); selectedFiles.forEach(file => data.append('images', file, file.name));
    try { await api(`/api/chat/sessions/${selectedSession.id}/messages`, { method: 'POST', body: data }); messageAttemptId = null; $('message-text').value = ''; selectedFiles = []; renderPreviews(); await pollMessages(); }
    catch (error) { $('message-error').textContent = error.message; } finally { updateComposer(); }
  });

  async function init() {
    try {
      await ensureWallet(); await refreshChatState();
      try { const cached = JSON.parse(localStorage.getItem(paymentKey)); if (cached?.token) displayPayment(cached); } catch { savePayment(null); }
      setInterval(() => refreshChatState().catch(() => {}), 5000);
    } catch (error) { $('availability').textContent = error.message; }
  }
  init();
})();
