(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const requestId = () => crypto.randomUUID?.() || `${Date.now().toString(16)}-${crypto.getRandomValues(new Uint32Array(4)).join('-')}`;
  let csrf = '';
  let sessions = [];
  let selected = null;
  let cursor = 0;
  let seen = new Set();
  let selectedFiles = [];
  let previousUserTotal = null;
  let clockOffset = 0;
  let pollTimer = 0;
  let replyAttemptId = null;
  const readKey = 'locly-chat-admin-read';
  let readCounts = (() => { try { return JSON.parse(localStorage.getItem(readKey)) || {}; } catch { return {}; } })();

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { if (response.status === 401) location.href = '/ai/admin/login'; throw new Error(body.error || 'Kết nối đang gián đoạn.'); }
    return body;
  }
  function beep() {
    if (!$('sound').checked) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass(); const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.frequency.value = 740; gain.gain.setValueAtTime(.09, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .18); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .18);
  }
  const serverNow = () => Date.now() + clockOffset;
  const stateLabel = session => session.status === 'active' && session.expiresAt > serverNow() ? 'Đang hoạt động' : session.refunded ? 'Hết giờ · đã hoàn xu' : 'Đã kết thúc';
  function renderSessions() {
    $('active-count').textContent = `${sessions.filter(item => item.status === 'active' && item.expiresAt > serverNow()).length} / 3`;
    $('admin-sessions').replaceChildren(...(sessions.length ? sessions.map(session => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `admin-session${selected?.id === session.id ? ' active' : ''}`;
      const title = document.createElement('span'); title.textContent = new Date(session.startedAt).toLocaleString('vi-VN');
      const unread = Math.max(0, (session.userMessageCount || 0) - Number(readCounts[session.id] || 0));
      const status = document.createElement('small'); status.className = session.status === 'active' && session.expiresAt > serverNow() ? 'live' : ''; status.textContent = `${stateLabel(session)} · ${unread ? `${unread} tin khách chưa đọc` : `${session.messageCount} tin`}`;
      button.append(title, status); button.addEventListener('click', () => selectSession(session)); return button;
    }) : [Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Chưa có phiên trò chuyện.' })]));
  }
  function updateSelected() {
    if (!selected) return;
    const active = selected.status === 'active' && selected.expiresAt > serverNow(); const remaining = Math.max(0, selected.expiresAt - serverNow());
    $('admin-session-title').textContent = `Phiên ${new Date(selected.startedAt).toLocaleString('vi-VN')}`; $('admin-session-state').textContent = stateLabel(selected);
    $('admin-timer').textContent = active ? `${String(Math.floor(remaining / 60000)).padStart(2, '0')}:${String(Math.floor(remaining % 60000 / 1000)).padStart(2, '0')}` : 'Đã hết giờ';
    $('admin-text').disabled = !active; $('admin-images').disabled = !active; $('admin-send').disabled = !active;
  }
  function renderImage(sessionId, messageId, attachment) {
    const image = document.createElement('img'); image.loading = 'lazy'; image.alt = attachment.name; image.src = `/api/chat/sessions/${sessionId}/images/${messageId}/${attachment.index}`; return image;
  }
  function appendMessages(items, sessionId) {
    const box = $('admin-messages'); const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    if (items.length && box.querySelector('.empty')) box.replaceChildren();
    for (const item of items) {
      if (seen.has(item.id)) continue; seen.add(item.id);
      const article = document.createElement('article'); article.className = `message ${item.role === 'user' ? 'user' : 'assistant'}`;
      if (item.text) { const text = document.createElement('div'); text.textContent = item.text; article.append(text); }
      if (item.attachments?.length) { const gallery = document.createElement('div'); gallery.className = 'message-images'; item.attachments.forEach(attachment => gallery.append(renderImage(sessionId, item.id, attachment))); article.append(gallery); }
      const time = document.createElement('time'); time.textContent = `${item.role === 'user' ? 'Khách' : 'Bạn'} · ${new Date(item.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`; article.append(time); box.append(article);
    }
    if (atBottom) box.scrollTop = box.scrollHeight;
  }
  async function pollMessages() {
    if (!selected) return;
    const sessionId = selected.id;
    let page;
    do {
      page = await api(`/api/chat/admin/sessions/${sessionId}/messages?after=${cursor}`);
      if (selected?.id !== sessionId) return;
      appendMessages(page.messages, sessionId); cursor = page.cursor;
    } while (page.hasMore);
    const current = sessions.find(item => item.id === sessionId);
    if (current) { readCounts[sessionId] = current.userMessageCount || 0; localStorage.setItem(readKey, JSON.stringify(readCounts)); renderSessions(); }
  }
  async function selectSession(session) {
    selected = session; cursor = 0; seen = new Set(); $('admin-messages').innerHTML = '<div class="empty">Đang tải tin nhắn…</div>'; renderSessions(); updateSelected(); await pollMessages(); readCounts[session.id] = session.userMessageCount || 0; localStorage.setItem(readKey, JSON.stringify(readCounts)); renderSessions();
  }
  async function refresh() {
    clearTimeout(pollTimer);
    try {
      const data = await api('/api/chat/admin/bootstrap'); csrf = data.csrf; sessions = data.sessions; clockOffset = (data.sessions[0]?.serverNow || Date.now()) - Date.now(); $('admin-status').textContent = data.ready ? 'Firestore và ảnh riêng tư đang hoạt động.' : 'Dịch vụ chat chưa sẵn sàng.';
      const userTotal = sessions.reduce((sum, item) => sum + (item.userMessageCount || 0), 0); if (previousUserTotal != null && userTotal > previousUserTotal) beep(); previousUserTotal = userTotal;
      if (selected) { const updated = sessions.find(item => item.id === selected.id); if (updated) selected = updated; else selected = null; }
      else if (sessions.length) await selectSession(sessions[0]);
      renderSessions(); updateSelected(); await pollMessages();
    } catch (error) { $('admin-status').textContent = error.message; }
    pollTimer = setTimeout(refresh, 2500);
  }
  function renderPreviews() {
    const holder = $('admin-previews'); holder.replaceChildren(); selectedFiles.forEach((file, index) => { const box = document.createElement('div'); box.className = 'preview'; const image = document.createElement('img'); image.src = URL.createObjectURL(file); const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.addEventListener('click', () => { selectedFiles.splice(index, 1); renderPreviews(); }); box.append(image, remove); holder.append(box); }); holder.hidden = !selectedFiles.length;
  }
  $('admin-images').addEventListener('change', event => { const files = [...event.target.files]; if (selectedFiles.length + files.length > 3) { $('admin-error').textContent = 'Tối đa 3 ảnh.'; return; } selectedFiles.push(...files); event.target.value = ''; renderPreviews(); });
  $('admin-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!selected) return; $('admin-error').textContent = ''; $('admin-send').disabled = true;
    replyAttemptId ||= requestId(); const data = new FormData(); data.append('requestId', replyAttemptId); data.append('text', $('admin-text').value); selectedFiles.forEach(file => data.append('images', file, file.name));
    try { await api(`/api/chat/admin/sessions/${selected.id}/messages`, { method: 'POST', headers: { 'X-CSRF-Token': csrf }, body: data }); replyAttemptId = null; $('admin-text').value = ''; selectedFiles = []; renderPreviews(); await pollMessages(); }
    catch (error) { $('admin-error').textContent = error.message; } finally { updateSelected(); }
  });
  $('logout').addEventListener('click', async () => { await api('/api/chat/admin/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrf } }); location.href = '/ai/admin/login'; });
  setInterval(updateSelected, 1000); refresh();
})();
