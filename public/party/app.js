(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const walletKey = 'locly-game-wallet';
  const sessionPrefix = 'locly-party-session-';
  const requestId = () => crypto.randomUUID?.() || `${Date.now().toString(16)}-${crypto.getRandomValues(new Uint32Array(4)).join('-')}`;
  const gameRounds = { court: '5 vòng', writer: '5 vòng', undercover: '3 vòng', drawing: 'đi qua cả nhóm' };
  let walletToken = localStorage.getItem(walletKey);
  let wallet = null;
  let config = null;
  let room = null;
  let roomCode = null;
  let partyToken = null;
  let pollTimer = 0;
  let clockTimer = 0;
  let clockOffset = 0;
  let toastTimer = 0;
  let lastGameStatus = null;
  let showSummary = true;
  let soundEnabled = localStorage.getItem('locly-party-sound') === 'on';
  let lastSoundCue = null;
  let lastDrawingRenderKey = null;
  const drawingObjectUrls = new Set();

  async function api(url, options = {}, headers = {}) {
    const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), ...headers }, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    const type = response.headers.get('content-type') || '';
    const body = type.includes('application/json') ? await response.json().catch(() => ({})) : {};
    if (!response.ok) throw new Error(body.error || 'Kết nối đang gián đoạn.');
    return body;
  }
  const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const walletHeaders = () => walletToken ? { 'X-Wallet-Token': walletToken } : {};
  const partyHeaders = () => partyToken ? { 'X-Party-Token': partyToken } : {};
  const now = () => Date.now() + clockOffset;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function showToast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.add('show');
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2300);
  }
  function clearDrawingUrls() {
    for (const url of drawingObjectUrls) URL.revokeObjectURL(url);
    drawingObjectUrls.clear();
  }
  async function drawingImageUrl(imageId) {
    const response = await fetch(`/api/party/rooms/${roomCode}/drawings/${encodeURIComponent(imageId)}`, { headers: partyHeaders(), cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Không tải được bức vẽ.'); }
    const url = URL.createObjectURL(await response.blob());
    drawingObjectUrls.add(url);
    return url;
  }
  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) { button.dataset.old = button.innerHTML; button.disabled = true; if (label) button.querySelector('span') ? button.querySelector('span').textContent = label : button.textContent = label; }
    else { if (button.dataset.old) button.innerHTML = button.dataset.old; button.disabled = false; delete button.dataset.old; }
  }
  function saveSession(code, token) {
    localStorage.setItem(`${sessionPrefix}${code}`, token);
    history.replaceState({}, '', `/party?room=${encodeURIComponent(code)}`);
  }
  function clearSession() {
    clearDrawingUrls(); lastDrawingRenderKey = null;
    room = null; roomCode = null; partyToken = null; clearTimeout(pollTimer); clearTimeout(clockTimer);
    history.replaceState({}, '', '/party');
    $('room-shell').hidden = true; $('landing').hidden = false;
  }
  function updateSoundButton() {
    const button = $('sound-toggle');
    button.textContent = `Âm thanh: ${soundEnabled ? 'bật' : 'tắt'}`;
    button.setAttribute('aria-pressed', String(soundEnabled));
  }
  function playSound() {
    if (!soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(520, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(760, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.21); oscillator.addEventListener('ended', () => context.close());
    } catch {}
  }
  async function ensureWallet() {
    if (walletToken) {
      try { wallet = await api('/api/game/wallet', {}, walletHeaders()); $('wallet-balance').textContent = wallet.balance; return wallet; }
      catch { localStorage.removeItem(walletKey); walletToken = null; }
    }
    const created = await api('/api/game/wallets', { method: 'POST' });
    walletToken = created.token; localStorage.setItem(walletKey, walletToken); wallet = created; $('wallet-balance').textContent = wallet.balance; return wallet;
  }

  function memberById(id) { return room?.players.find(player => player.id === id); }
  function actionAttemptKey(type) { return `locly-party-attempt-${roomCode}-${type}`; }
  async function postAction(type, payload = {}) {
    const key = actionAttemptKey(type);
    const id = localStorage.getItem(key) || requestId();
    localStorage.setItem(key, id);
    try {
      const next = await api(`/api/party/rooms/${roomCode}/actions`, json({ requestId: id, type, ...payload }), partyHeaders());
      localStorage.removeItem(key);
      acceptRoom(next);
      return next;
    } catch (error) {
      $('room-error').textContent = error.message;
      throw error;
    }
  }
  async function purchaseRoom() {
    const key = actionAttemptKey('purchase');
    const id = localStorage.getItem(key) || requestId(); localStorage.setItem(key, id);
    try {
      const next = await api(`/api/party/rooms/${roomCode}/purchase`, json({ requestId: id }), { ...partyHeaders(), ...walletHeaders() });
      localStorage.removeItem(key); await ensureWallet(); acceptRoom(next); showToast('Đã mở khóa phòng. Bạn có 24 giờ để bắt đầu.');
    } catch (error) { $('room-error').textContent = error.message; throw error; }
  }

  function entitlementText() {
    const value = room.entitlement;
    if (value.packageStatus === 'active' && value.activeUntil > now()) return { title: 'Phòng đang mở khóa', detail: `Còn ${durationText(value.activeUntil - now())} để chơi không giới hạn.` };
    if (value.packageStatus === 'paid') return { title: 'Gói 19 xu đã sẵn sàng', detail: 'Đồng hồ 2 giờ sẽ chạy khi bắt đầu trận tiếp theo.' };
    if (value.packageStatus === 'refunded') return { title: 'Gói chưa dùng đã được hoàn', detail: '19 xu đã quay lại ví chủ phòng.' };
    if (value.trialAvailable) return { title: 'Còn một trận chơi thử', detail: 'Bất kỳ trò nào · cả nhóm cùng chơi miễn phí.' };
    return { title: 'Đã dùng trận miễn phí', detail: 'Chủ phòng mở khóa 2 giờ để chơi tiếp.' };
  }
  function durationText(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), seconds = total % 60;
    return hours ? `${hours} giờ ${minutes} phút` : `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  function renderMembers() {
    $('player-count').textContent = room.players.length;
    $('room-members').replaceChildren(...room.players.map(player => {
      const item = document.createElement('article'); item.className = 'member';
      const avatar = document.createElement('span'); avatar.className = 'member-avatar'; avatar.textContent = player.name.slice(0, 1).toUpperCase();
      const info = document.createElement('div');
      const name = document.createElement('b'); name.textContent = player.name + (player.isHost ? ' 👑' : '');
      const state = document.createElement('small'); state.className = player.ready ? 'ready' : ''; state.textContent = player.eliminated ? 'Đã bị loại' : player.ready ? '✓ Sẵn sàng' : 'Chưa sẵn sàng';
      info.append(name, state); item.append(avatar, info);
      if (room.self.isHost && player.id !== room.self.id && room.status === 'lobby') {
        const actions = document.createElement('span'); actions.className = 'member-actions';
        const host = document.createElement('button'); host.type = 'button'; host.textContent = 'Trao quyền'; host.addEventListener('click', () => postAction('transfer', { targetId: player.id }).catch(() => {}));
        const kick = document.createElement('button'); kick.type = 'button'; kick.textContent = 'Mời ra'; kick.addEventListener('click', () => postAction('kick', { targetId: player.id }).catch(() => {}));
        actions.append(host, kick); item.append(actions);
      }
      return item;
    }));
  }
  function renderLobby() {
    const info = entitlementText();
    $('entitlement').innerHTML = `<b>${esc(info.title)}</b><span>${esc(info.detail)}</span>`;
    const self = memberById(room.self.id);
    $('ready-button').textContent = self?.ready ? '✓ Đã sẵn sàng' : 'Tôi sẵn sàng';
    $('ready-button').classList.toggle('active', Boolean(self?.ready));
    $('ready-button').disabled = room.status !== 'lobby';
    $('lock-room').hidden = !room.self.isHost;
    $('lock-room').textContent = room.locked ? 'Mở khóa phòng' : 'Khóa phòng';
    $('close-room').hidden = !room.self.isBillingOwner || room.status !== 'lobby';
    const canPurchase = room.self.isBillingOwner && room.status === 'lobby' && room.entitlement.trialUsed && !['paid', 'active'].includes(room.entitlement.packageStatus);
    $('purchase-button').hidden = !canPurchase;
    document.querySelectorAll('[data-party-game]').forEach(button => {
      button.classList.toggle('active', button.dataset.partyGame === room.selectedGame);
      button.disabled = !room.self.isHost || room.status !== 'lobby';
    });
    const allReady = room.players.length >= config.minPlayers && room.players.every(player => player.ready);
    const entitlement = room.entitlement.trialAvailable || room.entitlement.packageStatus === 'paid' || (room.entitlement.packageStatus === 'active' && room.entitlement.activeUntil > now());
    $('start-button').disabled = !room.self.isHost || !allReady || !entitlement;
    $('start-label').textContent = room.players.length < config.minPlayers ? `Cần thêm ${config.minPlayers - room.players.length} người` : !room.players.every(player => player.ready) ? 'Đang chờ mọi người sẵn sàng' : !entitlement ? 'Cần mở khóa phòng để chơi tiếp' : 'Cả nhóm đã sẵn sàng';
    $('selected-game-label').textContent = `${room.selectedGameLabel} · ${gameRounds[room.selectedGame]}`;
  }
  function acceptRoom(next) {
    const soundCue = next.game ? `${next.game.gameNumber}:${next.game.round}:${next.game.phase}:${next.game.status}` : `room:${next.status}`;
    if (lastSoundCue && soundCue !== lastSoundCue) playSound();
    lastSoundCue = soundCue;
    if (lastGameStatus === 'active' && next.game?.status === 'finished') showSummary = true;
    lastGameStatus = next.game?.status || null;
    if (room?.game?.gameId && room.game.gameId !== next.game?.gameId) { clearDrawingUrls(); lastDrawingRenderKey = null; }
    room = next; clockOffset = next.serverNow - Date.now();
    $('landing').hidden = true; $('room-shell').hidden = false; $('room-code').textContent = next.code; $('connection-dot').classList.add('online'); $('room-error').textContent = '';
    renderMembers(); renderLobby();
    const showGame = next.status === 'playing' || (next.game?.status === 'finished' && showSummary);
    $('lobby-controls').hidden = showGame;
    $('game-area').hidden = !showGame;
    if (showGame) renderGame();
    updateClock();
  }
  async function pollRoom() {
    clearTimeout(pollTimer);
    if (!roomCode || !partyToken) return;
    try {
      const next = await api(`/api/party/rooms/${roomCode}?afterVersion=${room?.version || 0}`, {}, partyHeaders());
      acceptRoom(next);
    } catch (error) {
      $('connection-dot').classList.remove('online');
      $('room-error').textContent = `${error.message} Trang sẽ tự thử lại.`;
    }
    pollTimer = setTimeout(pollRoom, 2000);
  }
  function updateClock() {
    clearTimeout(clockTimer);
    if (!room) return;
    if (room.game?.status === 'active' && room.game.phaseEndsAt) {
      $('phase-timer').textContent = durationText(room.game.phaseEndsAt - now());
      clockTimer = setTimeout(updateClock, 250);
    }
    if (room.entitlement.packageStatus === 'active') {
      const info = entitlementText(); $('entitlement').innerHTML = `<b>${esc(info.title)}</b><span>${esc(info.detail)}</span>`;
    }
  }
  function waitCard(symbol, title, text) { return `<div class="waiting-card"><span class="big">${symbol}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`; }
  function choiceButtons(players, action) {
    return `<div class="choice-grid">${players.map(player => `<button type="button" data-choice="${esc(player.id)}">${esc(player.name)}</button>`).join('')}</div>`;
  }
  function bindChoices(callback) { document.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => callback(button.dataset.choice))); }
  function bindTextForm(max, callback) {
    const form = $('game-action-form'); if (!form) return;
    form.addEventListener('submit', event => { event.preventDefault(); const text = $('game-text').value.trim(); if (text && text.length <= max) callback(text); });
  }
  function renderCourt(game) {
    const accused = memberById(game.accusedId);
    if (game.phase === 'vote') {
      const choices = room.players.filter(player => player.id !== room.self.id);
      $('game-content').innerHTML = `<span class="phase-kicker">BỎ PHIẾU KÍN · AI ĐÁNG NGỜ NHẤT?</span><h3 class="question">${esc(game.question)}</h3>${game.hasActed ? waitCard('✓','Đã chốt lá phiếu','Đợi hội đồng gọi tên bị cáo…') : choiceButtons(choices)}`;
      if (!game.hasActed) bindChoices(targetId => postAction('game_action', { targetId }).catch(() => {}));
    } else if (game.phase === 'defense') {
      $('game-content').innerHTML = `<span class="phase-kicker">BỊ CÁO: ${esc(accused?.name)}</span><h3 class="question">${esc(game.question)}</h3>${room.self.id === game.accusedId && !game.hasActed ? '<form id="game-action-form" class="game-form"><textarea id="game-text" maxlength="300" placeholder="Viết lời biện hộ đủ thuyết phục hoặc đủ buồn cười…" required></textarea><button>Gửi lời biện hộ</button></form>' : waitCard('⚖','Đang nghe biện hộ',`${accused?.name || 'Bị cáo'} có 30 giây để cứu lấy danh dự.`)}`;
      bindTextForm(300, text => postAction('game_action', { text }).catch(() => {}));
    } else if (game.phase === 'verdict') {
      $('game-content').innerHTML = `<span class="phase-kicker">LỜI BIỆN HỘ CỦA ${esc(accused?.name)}</span><h3 class="question">“${esc(game.defense || 'Bị cáo giữ quyền im lặng.')}”</h3>${room.self.id === game.accusedId || game.hasActed ? waitCard('⌛','Đang chờ phán quyết','Hội đồng đang cân nhắc rất thiếu nghiêm túc.') : '<div class="verdict-actions"><button class="forgive" data-verdict="forgive">Tha</button><button class="punish" data-verdict="punish">Phạt</button></div>'}`;
      document.querySelectorAll('[data-verdict]').forEach(button => button.addEventListener('click', () => postAction('game_action', { choice: button.dataset.verdict }).catch(() => {})));
    } else {
      const punished = game.outcome === 'punish';
      $('game-content').innerHTML = `<div class="result-card"><div class="result-emoji">${punished ? '😈' : game.accusedId ? '😇' : '🤷'}</div><span class="phase-kicker">KẾT QUẢ VÒNG ${game.round}</span><h3>${game.accusedId ? `${esc(accused?.name)} ${punished ? 'có tội!' : 'được tha!'}` : 'Không ai bị réo'}</h3>${game.defense ? `<p>“${esc(game.defense)}”</p>` : ''}${game.challenge ? `<div class="challenge"><b>Thử thách:</b> ${esc(game.challenge)}<br><small>Có thể bỏ qua nếu không thoải mái.</small></div>` : ''}<p>Vòng tiếp theo sẽ tự bắt đầu.</p></div>`;
    }
  }
  function renderWriter(game) {
    if (game.phase === 'answer') {
      $('game-content').innerHTML = `<span class="phase-kicker">VIẾT ẨN DANH · ĐỪNG ĐỂ LỘ VĂN PHONG</span><h3 class="question">${esc(game.question)}</h3>${game.hasActed ? waitCard('✎','Đã nộp câu trả lời','Chờ những cây hài còn lại viết xong…') : '<form id="game-action-form" class="game-form"><textarea id="game-text" maxlength="200" placeholder="Câu trả lời càng thật càng dễ bị bắt…" required></textarea><button>Gửi ẩn danh</button></form>'}`;
      bindTextForm(200, text => postAction('game_action', { text }).catch(() => {}));
    } else if (game.phase === 'guess') {
      const choices = room.players.filter(player => player.id !== room.self.id);
      $('game-content').innerHTML = `<span class="phase-kicker">AI ĐÃ VIẾT CÂU NÀY?</span><h3 class="question">“${esc(game.selectedResponse)}”</h3>${game.isSelectedWriter ? waitCard('🤐','Đây là câu của bạn','Giữ vẻ mặt bình thường và xem mọi người đoán.') : game.hasActed ? waitCard('✓','Đã chốt đáp án','Đợi mọi người lật mặt tác giả…') : choiceButtons(choices)}`;
      if (!game.hasActed && !game.isSelectedWriter) bindChoices(targetId => postAction('game_action', { targetId }).catch(() => {}));
    } else {
      const writer = memberById(game.result?.writerId);
      $('game-content').innerHTML = `<div class="result-card"><div class="result-emoji">📝</div><span class="phase-kicker">LỘ DIỆN TÁC GIẢ</span><h3>${game.result?.skipped ? 'Vòng này chưa đủ câu trả lời' : esc(writer?.name || 'Một cây hài bí ẩn')}</h3>${game.selectedResponse ? `<p>“${esc(game.selectedResponse)}”</p>` : ''}<p>Vòng tiếp theo sẽ tự bắt đầu.</p></div>`;
    }
  }
  function renderUndercover(game) {
    const current = memberById(game.currentPlayerId);
    const clueHtml = game.clues?.length ? `<div class="clue-list">${game.clues.map(item => `<div class="clue"><b>${esc(item.name)}:</b> ${esc(item.text)}</div>`).join('')}</div>` : '';
    if (game.phase === 'clue') {
      $('game-content').innerHTML = `<div class="secret-card"><span>TỪ KHÓA BÍ MẬT CỦA BẠN</span><strong>${esc(game.secretWord)}</strong><small>${game.secretRole === 'undercover' ? 'Bạn là Kẻ nằm vùng. Hãy nói sao cho giống mọi người.' : 'Bạn thuộc phe thường. Hãy tìm người có từ khác.'}</small></div>${clueHtml}${room.self.id === game.currentPlayerId && !game.hasActed ? '<form id="game-action-form" class="game-form"><textarea id="game-text" maxlength="100" placeholder="Đưa một gợi ý, đừng nói thẳng từ khóa…" required></textarea><button>Gửi gợi ý</button></form>' : waitCard('👀',`Đến lượt ${current?.name || 'người chơi'}`,'Quan sát gợi ý và đừng để lộ nét mặt.')}`;
      bindTextForm(100, text => postAction('game_action', { text }).catch(() => {}));
    } else if (game.phase === 'discussion') {
      $('game-content').innerHTML = `<div class="secret-card"><span>TỪ KHÓA CỦA BẠN</span><strong>${esc(game.secretWord)}</strong><small>Thảo luận trực tiếp trong 60 giây.</small></div>${clueHtml}${waitCard('🗣','Đến giờ soi nhau','Ai đang cố nói giống người bình thường nhất?')}`;
    } else if (game.phase === 'vote') {
      const allowed = (game.tieIds?.length ? game.tieIds : room.players.filter(player => !game.eliminated.includes(player.id)).map(player => player.id)).filter(id => id !== room.self.id).map(memberById).filter(Boolean);
      $('game-content').innerHTML = `<span class="phase-kicker">${game.tieIds?.length ? 'BỎ PHIẾU LẠI · ĐANG HÒA' : 'BỎ PHIẾU LOẠI KẺ NẰM VÙNG'}</span><h3 class="question">Ai đang nói hơi đáng ngờ?</h3>${game.hasActed || game.eliminated.includes(room.self.id) ? waitCard('✓','Đã chốt lá phiếu','Chờ cả nhóm đưa ra phán quyết…') : choiceButtons(allowed)}`;
      if (!game.hasActed) bindChoices(targetId => postAction('game_action', { targetId }).catch(() => {}));
    }
  }
  const drawingDraftKey = game => `locly-party-draft-${roomCode}-${game.gameId}-${game.turn}`;
  const drawingRequestKey = game => `locly-party-drawing-request-${roomCode}-${game.gameId}-${game.turn}`;

  async function submitDrawingText(game, text) {
    const key = drawingRequestKey(game);
    const id = localStorage.getItem(key) || requestId(); localStorage.setItem(key, id);
    try {
      const next = await api(`/api/party/rooms/${roomCode}/actions`, json({ requestId: id, type: 'game_action', gameId: game.gameId, turn: game.turn, text }), partyHeaders());
      localStorage.removeItem(key); localStorage.removeItem(drawingDraftKey(game)); acceptRoom(next);
    } catch (error) { $('room-error').textContent = error.message; throw error; }
  }

  async function submitDrawingCanvas(game, canvas) {
    const key = drawingRequestKey(game);
    const id = localStorage.getItem(key) || requestId(); localStorage.setItem(key, id);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob) throw new Error('Không xuất được bức vẽ.');
    const form = new FormData();
    form.append('requestId', id); form.append('gameId', game.gameId); form.append('turn', String(game.turn)); form.append('drawing', blob, 've-chuyen-tay.webp');
    const response = await fetch(`/api/party/rooms/${roomCode}/drawings`, { method: 'POST', headers: partyHeaders(), body: form, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { $('room-error').textContent = body.error || 'Không gửi được bức vẽ.'; throw new Error(body.error || 'Không gửi được bức vẽ.'); }
    localStorage.removeItem(key); localStorage.removeItem(drawingDraftKey(game)); acceptRoom(body);
  }

  function openDrawingLightbox(url) {
    $('drawing-lightbox-image').src = url;
    $('drawing-lightbox').showModal();
  }

  async function hydrateDrawingImages(root = document) {
    const images = [...root.querySelectorAll('[data-drawing-image]:not([data-loaded])')];
    await Promise.all(images.map(async element => {
      element.dataset.loaded = 'loading';
      try {
        const url = await drawingImageUrl(element.dataset.drawingImage);
        element.src = url; element.dataset.loaded = 'yes';
        element.addEventListener('click', () => openDrawingLightbox(url));
      } catch {
        element.alt = 'Không tải được bức vẽ'; element.dataset.loaded = 'error';
      }
    }));
  }

  function setupDrawingCanvas(game) {
    const canvas = $('drawing-board');
    if (!canvas) return;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineCap = 'round'; context.lineJoin = 'round';
    let color = '#17121f'; let size = 7; let drawing = false; let last = null; const undo = [];
    const draftKey = drawingDraftKey(game);
    const saved = localStorage.getItem(draftKey);
    if (saved?.startsWith('data:image/')) {
      const image = new Image(); image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height); image.src = saved;
    }
    const point = event => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; };
    const snapshot = () => { undo.push(canvas.toDataURL('image/webp', .58)); if (undo.length > 12) undo.shift(); };
    const save = () => { try { localStorage.setItem(draftKey, canvas.toDataURL('image/webp', .7)); } catch {} };
    canvas.addEventListener('pointerdown', event => { event.preventDefault(); canvas.setPointerCapture(event.pointerId); snapshot(); drawing = true; last = point(event); });
    canvas.addEventListener('pointermove', event => { if (!drawing) return; event.preventDefault(); const next = point(event); context.strokeStyle = color; context.lineWidth = size; context.beginPath(); context.moveTo(last.x, last.y); context.lineTo(next.x, next.y); context.stroke(); last = next; });
    const finish = event => { if (!drawing) return; event?.preventDefault(); drawing = false; last = null; save(); };
    canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish);
    document.querySelectorAll('.drawing-color').forEach(button => button.addEventListener('click', () => { color = button.dataset.color; document.querySelectorAll('.drawing-color').forEach(item => item.classList.toggle('active', item === button)); $('drawing-eraser').classList.remove('active'); }));
    document.querySelectorAll('.drawing-size').forEach(button => button.addEventListener('click', () => { size = Number(button.dataset.size); document.querySelectorAll('.drawing-size').forEach(item => item.classList.toggle('active', item === button)); }));
    $('drawing-eraser').addEventListener('click', () => { color = '#ffffff'; $('drawing-eraser').classList.add('active'); document.querySelectorAll('.drawing-color').forEach(item => item.classList.remove('active')); });
    $('drawing-undo').addEventListener('click', () => { const value = undo.pop(); if (!value) return; const image = new Image(); image.onload = () => { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); save(); }; image.src = value; });
    $('drawing-clear').addEventListener('click', () => { if (!confirm('Xóa toàn bộ nét vẽ?')) return; snapshot(); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); save(); });
    $('drawing-send').addEventListener('click', async () => { const button = $('drawing-send'); button.disabled = true; button.textContent = 'Đang gửi…'; try { await submitDrawingCanvas(game, canvas); } catch { button.disabled = false; button.textContent = 'Gửi bức vẽ'; } });
  }

  function renderDrawing(game) {
    const renderKey = `${game.gameId}:${game.turn}:${game.status}:${game.hasActed}`;
    const count = `${game.submittedCount}/${room.players.length} người đã gửi`;
    if (lastDrawingRenderKey === renderKey && $('drawing-stage')) { const progress = $('drawing-submitted'); if (progress) progress.textContent = count; return; }
    clearDrawingUrls(); lastDrawingRenderKey = renderKey;
    const kind = game.assignment?.kind;
    const labels = { prompt: 'Viết câu mở đầu', drawing: 'Vẽ lại điều bạn vừa đọc', guess: 'Đoán bức hình này là gì' };
    const reference = game.previous?.kind === 'drawing' && game.previous.imageId
      ? `<div class="drawing-reference"><span>BẠN CHỈ ĐƯỢC NHÌN BỨC NÀY</span><img data-drawing-image="${esc(game.previous.imageId)}" alt="Bức vẽ cần đoán"></div>`
      : game.previous?.text
        ? `<div class="drawing-reference"><span>BẠN CHỈ ĐƯỢC NHÌN CÂU NÀY</span><strong>${esc(game.previous.text)}</strong></div>`
        : game.turn > 0 ? '<div class="drawing-reference"><span>LƯỢT TRƯỚC BỎ QUA</span><strong>Tự do sáng tác tiếp nhé!</strong></div>' : '';
    let action = '';
    if (game.hasActed) action = `<div class="drawing-wait">${waitCard('✓','Đã gửi bài',`Đợi những cây hài còn lại. ${count}`)}</div>`;
    else if (kind === 'prompt' || kind === 'guess') {
      const draft = localStorage.getItem(drawingDraftKey(game)) || '';
      action = `<form id="drawing-text-form" class="drawing-text-form"><textarea id="drawing-text" maxlength="120" placeholder="${kind === 'prompt' ? 'Ví dụ: Con mèo đi đòi nợ bằng xe đạp…' : 'Bạn nghĩ người trước đang vẽ gì?'}" required>${esc(draft)}</textarea><div class="drawing-text-actions">${kind === 'prompt' ? '<button id="drawing-suggestion" class="drawing-suggestion" type="button">Cho tôi một câu bựa</button>' : ''}<button class="drawing-submit" type="submit">Gửi câu này</button></div></form>`;
    } else {
      const colors = ['#17121f','#ef4444','#f97316','#facc15','#22c55e','#38bdf8','#6366f1','#d946ef'];
      action = `<div class="drawing-board-wrap"><canvas id="drawing-board" class="drawing-board" width="800" height="600" aria-label="Bảng vẽ"></canvas></div><div class="drawing-toolbar"><div class="drawing-colors">${colors.map((value,index) => `<button class="drawing-color${index===0?' active':''}" type="button" data-color="${value}" aria-label="Màu ${index+1}"></button>`).join('')}</div><div class="drawing-sizes"><button class="drawing-size" data-size="3" type="button">Mảnh</button><button class="drawing-size active" data-size="7" type="button">Vừa</button><button class="drawing-size" data-size="15" type="button">Đậm</button></div><button id="drawing-eraser" class="drawing-tool" type="button">Tẩy</button><button id="drawing-undo" class="drawing-tool" type="button">Hoàn tác</button><button id="drawing-clear" class="drawing-tool" type="button">Xóa</button><button id="drawing-send" class="drawing-send" type="button">Gửi bức vẽ</button></div>`;
    }
    $('game-content').innerHTML = `<div id="drawing-stage" class="drawing-stage"><div class="drawing-progress"><b>${esc(labels[kind] || 'Vẽ chuyền tay')}</b><span id="drawing-submitted">${esc(count)}</span></div>${reference}${action}</div>`;
    hydrateDrawingImages($('game-content'));
    if (!game.hasActed && (kind === 'prompt' || kind === 'guess')) {
      const textarea = $('drawing-text');
      textarea.addEventListener('input', () => localStorage.setItem(drawingDraftKey(game), textarea.value));
      if ($('drawing-suggestion')) $('drawing-suggestion').addEventListener('click', () => { textarea.value = game.suggestion || ''; textarea.dispatchEvent(new Event('input')); textarea.focus(); });
      $('drawing-text-form').addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; try { await submitDrawingText(game, textarea.value.trim()); } catch { button.disabled = false; } });
    } else if (!game.hasActed && kind === 'drawing') setupDrawingCanvas(game);
  }

  function renderDrawingFinished(game) {
    const renderKey = `${game.gameId}:finished:${game.expired ? 'expired' : 'ready'}`;
    if (lastDrawingRenderKey === renderKey && ($('game-content').querySelector('.chain-results') || $('game-content').querySelector('.drawing-expired'))) return;
    clearDrawingUrls(); lastDrawingRenderKey = renderKey;
    if (game.expired) { $('game-content').innerHTML = '<div class="drawing-expired"><h3>Kết quả đã hết hạn</h3><p>Nội dung Vẽ chuyền tay được giữ trong 7 ngày sau khi trận kết thúc.</p></div>'; return; }
    const chains = game.chains || [];
    $('game-content').innerHTML = `<div class="chain-results"><div class="result-card"><div class="result-emoji">🎨</div><span class="phase-kicker">MỞ XÍCH · ${chains.length} CHUỖI</span><h3>Xem nó đã biến thành cái gì!</h3><p>Mỗi người tự mở từng chuỗi. Không có thắng thua, chỉ có bằng chứng.</p></div>${chains.map((chain,index) => `<article class="chain-card" data-chain-index="${index}"><header><div><span>CHUỖI ${index+1}</span><b>Khởi đầu bởi ${esc(chain.ownerName)}</b></div><button type="button" data-reveal-chain="${index}">Mở chuỗi</button></header><div class="chain-body" hidden>${chain.contributions.map((item,step) => `<div class="chain-step" data-step="${step+1}"><small>${esc(item.authorName)} · ${item.kind === 'drawing' ? 'vẽ' : item.kind === 'prompt' ? 'câu gốc' : 'đoán'}</small>${item.skipped ? '<p class="chain-skip">Bỏ lượt</p>' : item.kind === 'drawing' ? `<img data-drawing-image="${esc(item.imageId)}" alt="Bức vẽ ở bước ${step+1}">` : `<p>${esc(item.text)}</p>`}</div>`).join('')}<button class="chain-download" type="button" data-download-chain="${index}">Tải chuỗi này</button></div></article>`).join('')}<button id="back-lobby" class="advance-button">Chọn trò tiếp</button></div>`;
    document.querySelectorAll('[data-reveal-chain]').forEach(button => button.addEventListener('click', () => { const body = button.closest('.chain-card').querySelector('.chain-body'); body.hidden = !body.hidden; button.textContent = body.hidden ? 'Mở chuỗi' : 'Thu lại'; if (!body.hidden) hydrateDrawingImages(body); }));
    document.querySelectorAll('[data-download-chain]').forEach(button => button.addEventListener('click', () => downloadDrawingChain(chains[Number(button.dataset.downloadChain)], Number(button.dataset.downloadChain) + 1).catch(error => showToast(error.message))));
    $('back-lobby').addEventListener('click', () => { showSummary = false; $('game-area').hidden = true; $('lobby-controls').hidden = false; renderLobby(); });
  }

  function wrapCanvasText(context, text, x, y, maxWidth, lineHeight) {
    const words = String(text).split(/\s+/); let line = ''; let currentY = y;
    for (const word of words) { const test = line ? `${line} ${word}` : word; if (context.measureText(test).width > maxWidth && line) { context.fillText(line, x, currentY); line = word; currentY += lineHeight; } else line = test; }
    if (line) context.fillText(line, x, currentY);
    return currentY + lineHeight;
  }

  async function loadBitmap(imageId) {
    const response = await fetch(`/api/party/rooms/${roomCode}/drawings/${encodeURIComponent(imageId)}`, { headers: partyHeaders(), cache: 'no-store' });
    if (!response.ok) throw new Error('Không tải đủ ảnh để xuất kết quả.');
    return createImageBitmap(await response.blob());
  }

  async function downloadDrawingChain(chain, chainNumber) {
    const chunks = [];
    for (let index = 0; index < chain.contributions.length; index += 3) chunks.push(chain.contributions.slice(index, index + 3));
    for (let page = 0; page < chunks.length; page++) {
      const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350; const context = canvas.getContext('2d');
      const gradient = context.createLinearGradient(0,0,1080,1350); gradient.addColorStop(0,'#201332'); gradient.addColorStop(1,'#ff7052'); context.fillStyle = gradient; context.fillRect(0,0,1080,1350);
      context.fillStyle = '#ffd35a'; context.font = '900 34px Segoe UI, Arial'; context.fillText('LOCLY.PARTY · VẼ CHUYỀN TAY', 65, 72);
      context.fillStyle = '#fff8ee'; context.font = '900 52px Segoe UI, Arial'; context.fillText(`Chuỗi ${chainNumber} · ${chain.ownerName}`, 65, 135);
      let y = 190;
      for (const item of chunks[page]) {
        context.fillStyle = '#ffffff12'; context.fillRect(55,y,970,340); context.fillStyle = '#d9cede'; context.font = '700 23px Segoe UI, Arial'; context.fillText(`${item.authorName} · ${item.kind === 'drawing' ? 'vẽ' : item.kind === 'prompt' ? 'câu gốc' : 'đoán'}`,80,y+38);
        if (item.skipped) { context.fillStyle='#a99fb9'; context.font='italic 30px Segoe UI, Arial'; context.fillText('Bỏ lượt',80,y+105); }
        else if (item.kind === 'drawing') { const bitmap = await loadBitmap(item.imageId); const ratio=Math.min(880/bitmap.width,255/bitmap.height); context.drawImage(bitmap,80,y+58,bitmap.width*ratio,bitmap.height*ratio); bitmap.close?.(); }
        else { context.fillStyle='#fff8ee'; context.font='800 34px Segoe UI, Arial'; wrapCanvasText(context,item.text,80,y+105,880,46); }
        y += 365;
      }
      context.fillStyle='#ffffffaa'; context.font='500 22px Segoe UI, Arial'; context.fillText(`locly.lol/party · Trang ${page+1}/${chunks.length}`,65,1305);
      const link=document.createElement('a'); link.download=`locly-party-chuoi-${chainNumber}-${page+1}.png`; link.href=canvas.toDataURL('image/png'); link.click();
    }
  }

  function renderFinished(game) {
    if (game.key === 'drawing') return renderDrawingFinished(game);
    const sorted = [...room.players].sort((a, b) => (game.scores?.[b.id] || 0) - (game.scores?.[a.id] || 0));
    let heading = 'Trận đấu đã xong!';
    if (game.key === 'undercover') {
      const spy = memberById(game.undercoverId);
      heading = game.winner === 'undercover' ? `${spy?.name || 'Kẻ nằm vùng'} đã qua mặt cả nhóm!` : `Đã bắt được ${spy?.name || 'Kẻ nằm vùng'}!`;
    }
    $('game-content').innerHTML = `<div class="result-card"><div class="result-emoji">🏆</div><span class="phase-kicker">TỔNG KẾT · PHÒNG ${esc(room.code)}</span><h3>${esc(heading)}</h3>${game.key === 'undercover' ? `<p>Từ thường: <b>${esc(game.normalWord)}</b> · Từ nằm vùng: <b>${esc(game.undercoverWord)}</b></p>` : `<div class="scoreboard">${sorted.map((player, index) => `<div class="score-row"><span>${index + 1}. ${esc(player.name)}</span><b>${game.scores?.[player.id] || 0} điểm</b></div>`).join('')}</div>`}<button id="download-result" class="download-button">Tải ảnh kết quả</button> <button id="back-lobby" class="advance-button">Chọn trò tiếp</button></div>`;
    $('download-result').addEventListener('click', downloadResult);
    $('back-lobby').addEventListener('click', () => { showSummary = false; $('game-area').hidden = true; $('lobby-controls').hidden = false; renderLobby(); });
  }
  function renderGame() {
    const game = room.game;
    if (!game) return;
    $('game-title').textContent = game.label;
    $('game-round').textContent = game.status === 'finished' ? 'TRẬN ĐÃ KẾT THÚC' : `VÒNG ${game.round}/${game.maxRounds}`;
    $('phase-timer').textContent = game.phaseEndsAt ? durationText(game.phaseEndsAt - now()) : 'XONG';
    if (game.status === 'finished') return renderFinished(game);
    if (game.key === 'court') renderCourt(game);
    else if (game.key === 'writer') renderWriter(game);
    else if (game.key === 'drawing') renderDrawing(game);
    else renderUndercover(game);
  }
  function downloadResult() {
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1080); gradient.addColorStop(0, '#25133b'); gradient.addColorStop(1, '#ff7052');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1080);
    ctx.fillStyle = '#ffd35a'; ctx.font = '900 34px Segoe UI, Arial'; ctx.fillText('LOCLY.PARTY', 80, 105);
    ctx.fillStyle = '#fff8ee'; ctx.font = '900 72px Segoe UI, Arial'; ctx.fillText(room.game.label, 80, 210);
    ctx.font = '700 32px Segoe UI, Arial'; ctx.fillStyle = '#d7cce0'; ctx.fillText(`Phòng ${room.code} · ${room.players.length} người`, 80, 270);
    let y = 370;
    if (room.game.key === 'undercover') {
      const spy = memberById(room.game.undercoverId);
      ctx.fillStyle = '#fff8ee'; ctx.font = '900 54px Segoe UI, Arial'; ctx.fillText(room.game.winner === 'undercover' ? 'KẺ NẰM VÙNG THẮNG' : 'ĐÃ BẮT ĐƯỢC NẰM VÙNG', 80, y);
      y += 90; ctx.fillStyle = '#ffd35a'; ctx.fillText(spy?.name || 'Bí ẩn', 80, y);
    } else {
      const sorted = [...room.players].sort((a, b) => (room.game.scores?.[b.id] || 0) - (room.game.scores?.[a.id] || 0));
      ctx.font = '700 38px Segoe UI, Arial';
      sorted.forEach((player, index) => { ctx.fillStyle = index === 0 ? '#ffd35a' : '#fff8ee'; ctx.fillText(`${index + 1}. ${player.name}`, 90, y); ctx.textAlign = 'right'; ctx.fillText(`${room.game.scores?.[player.id] || 0} điểm`, 990, y); ctx.textAlign = 'left'; y += 68; });
    }
    ctx.fillStyle = '#ffffffaa'; ctx.font = '500 25px Segoe UI, Arial'; ctx.fillText('Cà khịa có duyên tại locly.lol/party', 80, 1000);
    const link = document.createElement('a'); link.download = `locly-party-${room.code}.png`; link.href = canvas.toDataURL('image/png'); link.click();
  }

  document.querySelectorAll('[data-party-game]').forEach(button => button.addEventListener('click', () => {
    if (room?.self.isHost) postAction('select_game', { game: button.dataset.partyGame }).catch(() => {});
  }));
  $('ready-button').addEventListener('click', () => {
    const self = memberById(room.self.id); postAction('ready', { ready: !self.ready }).catch(() => {});
  });
  $('start-button').addEventListener('click', () => postAction('start_game').catch(() => {}));
  $('purchase-button').addEventListener('click', async () => { setBusy($('purchase-button'), true, 'Đang mở khóa…'); try { await purchaseRoom(); } finally { setBusy($('purchase-button'), false); } });
  $('lock-room').addEventListener('click', () => postAction('lock', { locked: !room.locked }).catch(() => {}));
  $('close-room').addEventListener('click', () => { if (confirm('Đóng phòng này? Sau đó bạn có thể tạo phòng mới.')) postAction('close_room').then(clearSession).catch(() => {}); });
  $('copy-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/party?room=${roomCode}`); showToast('Đã sao chép link mời.'); }
    catch { showToast(`Mã phòng: ${roomCode}`); }
  });
  $('sound-toggle').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('locly-party-sound', soundEnabled ? 'on' : 'off');
    updateSoundButton();
    playSound();
  });
  $('drawing-lightbox-close').addEventListener('click', () => $('drawing-lightbox').close());
  $('drawing-lightbox').addEventListener('click', event => { if (event.target === $('drawing-lightbox')) $('drawing-lightbox').close(); });
  $('leave-view').addEventListener('click', clearSession);
  $('join-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6); });

  $('create-form').addEventListener('submit', async event => {
    event.preventDefault(); setBusy($('create-room'), true, 'Đang tạo phòng…'); $('availability').textContent = '';
    const key = 'locly-party-create-attempt'; const id = localStorage.getItem(key) || requestId(); localStorage.setItem(key, id);
    try {
      await ensureWallet();
      const result = await api('/api/party/rooms', json({ name: $('create-name').value, requestId: id }), walletHeaders());
      localStorage.removeItem(key); roomCode = result.room.code; partyToken = result.token; saveSession(roomCode, partyToken); acceptRoom(result.room); pollRoom();
    } catch (error) { $('availability').textContent = error.message; } finally { setBusy($('create-room'), false); }
  });
  $('join-form').addEventListener('submit', async event => {
    event.preventDefault(); setBusy($('join-room'), true, 'Đang vào phòng…'); $('availability').textContent = '';
    const code = $('join-code').value.toUpperCase(); const key = `locly-party-join-attempt-${code}`; const id = localStorage.getItem(key) || requestId(); localStorage.setItem(key, id);
    try {
      const result = await api(`/api/party/rooms/${code}/join`, json({ name: $('join-name').value, requestId: id }));
      localStorage.removeItem(key); roomCode = code; partyToken = result.token; saveSession(code, partyToken); acceptRoom(result.room); pollRoom();
    } catch (error) { $('availability').textContent = error.message; } finally { setBusy($('join-room'), false); }
  });

  async function init() {
    updateSoundButton();
    try {
      config = await api('/api/party/config');
      $('availability').textContent = config.ready ? '✓ Phòng chơi đang sẵn sàng.' : 'Locly Party chưa sẵn sàng.';
      await ensureWallet().catch(() => {});
      const urlCode = new URLSearchParams(location.search).get('room')?.toUpperCase();
      if (urlCode) {
        $('join-code').value = urlCode;
        const saved = localStorage.getItem(`${sessionPrefix}${urlCode}`);
        if (saved) {
          roomCode = urlCode; partyToken = saved;
          try { acceptRoom(await api(`/api/party/rooms/${roomCode}`, {}, partyHeaders())); pollRoom(); }
          catch { localStorage.removeItem(`${sessionPrefix}${urlCode}`); }
        }
      }
    } catch (error) { $('availability').textContent = error.message; }
  }
  init();
})();
