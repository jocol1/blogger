(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const walletKey = 'locly-game-wallet';
  const sessionPrefix = 'locly-party-session-';
  const requestId = () => crypto.randomUUID?.() || `${Date.now().toString(16)}-${crypto.getRandomValues(new Uint32Array(4)).join('-')}`;
  const gameRounds = { court: 5, writer: 5, undercover: 3 };
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
    $('close-room').hidden = !room.self.isBillingOwner;
    const canPurchase = room.self.isBillingOwner && room.entitlement.trialUsed && !['paid', 'active'].includes(room.entitlement.packageStatus);
    $('purchase-button').hidden = !canPurchase;
    document.querySelectorAll('[data-party-game]').forEach(button => {
      button.classList.toggle('active', button.dataset.partyGame === room.selectedGame);
      button.disabled = !room.self.isHost || room.status !== 'lobby';
    });
    const allReady = room.players.length >= config.minPlayers && room.players.every(player => player.ready);
    const entitlement = room.entitlement.trialAvailable || room.entitlement.packageStatus === 'paid' || (room.entitlement.packageStatus === 'active' && room.entitlement.activeUntil > now());
    $('start-button').disabled = !room.self.isHost || !allReady || !entitlement;
    $('start-label').textContent = room.players.length < config.minPlayers ? `Cần thêm ${config.minPlayers - room.players.length} người` : !room.players.every(player => player.ready) ? 'Đang chờ mọi người sẵn sàng' : !entitlement ? 'Cần mở khóa phòng để chơi tiếp' : 'Cả nhóm đã sẵn sàng';
    $('selected-game-label').textContent = `${room.selectedGameLabel} · tối đa ${gameRounds[room.selectedGame]} vòng`;
  }
  function acceptRoom(next) {
    const soundCue = next.game ? `${next.game.gameNumber}:${next.game.round}:${next.game.phase}:${next.game.status}` : `room:${next.status}`;
    if (lastSoundCue && soundCue !== lastSoundCue) playSound();
    lastSoundCue = soundCue;
    if (lastGameStatus === 'active' && next.game?.status === 'finished') showSummary = true;
    lastGameStatus = next.game?.status || null;
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
  function renderFinished(game) {
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
