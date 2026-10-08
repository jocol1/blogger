(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const walletKey = 'locly-game-wallet';
  const paymentKey = 'locly-game-payment';
  const topupAttemptKey = 'locly-game-topup-attempt';
  const money = value => `${Number(value).toLocaleString('vi-VN')}đ`;
  const requestId = () => crypto.randomUUID?.() || `${Date.now().toString(16)}-${crypto.getRandomValues(new Uint32Array(4)).join('-')}`;
  const gameNames = { bowl: 'BẮN XU VÀO BÁT', needle: 'DỪNG KIM', heart: 'BẮT TIM', memory: 'NHỚ CHUỖI', order: 'CHẠM ĐÚNG THỨ TỰ' };
  const difficultyNames = { easy: 'Thường', medium: 'Khó', hard: 'Siêu khó' };
  const payouts = { easy: 2, medium: 3, hard: 5 };
  const symbols = ['●', '▲', '■', '★'];
  let walletToken = localStorage.getItem(walletKey);
  let wallet = null;
  let config = null;
  let payment = null;
  let selectedGame = 'bowl';
  let difficulty = 'easy';
  let activeGame = null;
  let clockOffset = 0;
  let actionPending = false;
  let frame = 0;
  let memoryAnswers = [];
  let orderAnswers = [];

  async function api(url, options = {}, withWallet = true) {
    const headers = { ...(options.headers || {}) };
    if (withWallet && walletToken) headers['X-Wallet-Token'] = walletToken;
    const response = await fetch(url, { ...options, headers, cache: 'no-store', signal: AbortSignal.timeout(12000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Kết nối đang gián đoạn.');
    return body;
  }
  const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  function savePayment(value) {
    payment = value;
    if (value) localStorage.setItem(paymentKey, JSON.stringify(value)); else localStorage.removeItem(paymentKey);
  }
  function renderWallet(value) {
    wallet = value;
    $('wallet-balance').textContent = value.balance;
    $('balance-large').textContent = value.balance;
    const progress = Math.min(100, value.balance);
    $('reward-progress').style.width = `${progress}%`;
    $('reward-progress-text').textContent = value.balance >= 100 ? 'Đã đủ xu để đổi một ly trà sữa!' : `Còn ${100 - value.balance} xu nữa để đổi trà sữa.`;
    $('redeem-button').disabled = value.balance < 100 || value.redemptionPending;
    const labels = { deposit: 'Nạp xu', game_cost: 'Phí chơi', game_win: 'Thắng game', game_loss: 'Thua game', redemption: 'Đổi trà sữa', redemption_refund: 'Hoàn xu', chat_cost: 'Mua giờ chat', chat_refund: 'Hoàn giờ chat' };
    $('history').replaceChildren(...(value.history.length ? value.history.map(item => {
      const row = document.createElement('div');
      row.className = 'history-row';
      const detail = document.createElement('div');
      const title = document.createElement('span'); title.textContent = labels[item.type] || item.type;
      const time = document.createElement('small'); time.textContent = new Date(item.createdAt).toLocaleString('vi-VN');
      detail.append(title, time);
      const amount = document.createElement('b'); amount.className = item.amount > 0 ? 'plus' : 'minus'; amount.textContent = `${item.amount > 0 ? '+' : ''}${item.amount} xu`;
      row.append(detail, amount); return row;
    }) : [Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Chưa có giao dịch.' })]));
  }
  async function refreshWallet() {
    if (!walletToken) return;
    const value = await api('/api/game/wallet');
    renderWallet(value);
    return value;
  }
  async function ensureWallet() {
    if (walletToken) {
      try { return await refreshWallet(); } catch { localStorage.removeItem(walletKey); walletToken = null; }
    }
    const created = await api('/api/game/wallets', { method: 'POST' }, false);
    walletToken = created.token;
    localStorage.setItem(walletKey, walletToken);
    renderWallet(created);
  }
  async function refreshRedemption() {
    const { redemption } = await api('/api/game/redemption');
    if (!redemption) {
      $('redemption-status').textContent = wallet?.balance >= 100 ? 'Bạn đã đủ xu. Nhập thông tin để đổi quà.' : 'Chưa đủ xu để đổi quà.';
      return;
    }
    const names = { pending: 'đang chờ duyệt', approved: 'đã được duyệt, chờ liên hệ', fulfilled: 'đã tặng', rejected: `bị từ chối${redemption.reason ? `: ${redemption.reason}` : ''}` };
    $('redemption-status').textContent = `Yêu cầu đổi trà sữa ${names[redemption.status] || redemption.status}.`;
  }
  async function syncClock() {
    const started = Date.now();
    const value = await api('/api/game/wallet');
    const ended = Date.now();
    const rtt = ended - started;
    if (rtt > 400) throw new Error('Mạng đang chậm hơn 400ms. Chờ kết nối ổn định rồi bắt đầu nhé.');
    clockOffset = value.serverNow - (started + ended) / 2;
    renderWallet(value);
  }
  const serverNow = () => Date.now() + clockOffset;
  function updateGameLabels() {
    $('arena-game').textContent = gameNames[selectedGame];
    $('arena-level').textContent = `${difficultyNames[difficulty]} · Thắng nhận ${payouts[difficulty]} xu`;
  }
  function setStageMessage(message) {
    $('game-stage').replaceChildren(Object.assign(document.createElement('p'), { textContent: message }));
  }
  function createButton(text, handler) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.addEventListener('click', handler); return button;
  }
  function prepareStage(game) {
    memoryAnswers = []; orderAnswers = [];
    const stage = $('game-stage'); stage.replaceChildren();
    if (game.game === 'bowl') {
      const coin = document.createElement('div'); coin.className = 'drop-coin'; coin.textContent = '🪙';
      const bowl = document.createElement('div'); bowl.className = 'moving-bowl'; bowl.textContent = '🥣';
      stage.append(coin, bowl, createButton('BẮN XU', () => submitReflex()));
    } else if (game.game === 'needle') {
      const track = document.createElement('div'); track.className = 'needle-track';
      const target = document.createElement('span'); target.className = 'needle-target'; target.style.width = `${game.width * 100}%`;
      const marker = document.createElement('span'); marker.className = 'needle-marker';
      track.append(target, marker); stage.append(track, createButton('DỪNG KIM', () => submitReflex()));
    } else if (game.game === 'heart') {
      const grid = document.createElement('div'); grid.className = 'heart-grid'; grid.style.gridTemplateColumns = `repeat(${Math.min(3, game.cells)},1fr)`;
      for (let index = 0; index < game.cells; index++) grid.append(createButton('♡', () => submitReflex(index)));
      stage.append(grid);
    } else if (game.game === 'memory') {
      const display = document.createElement('div'); display.className = 'memory-display'; display.textContent = 'Sẵn sàng'; stage.append(display);
    } else if (game.game === 'order') {
      const grid = document.createElement('div'); grid.className = 'order-grid';
      for (const value of game.order) grid.append(createButton(String(value), () => chooseOrder(value)));
      stage.append(grid);
    }
  }
  function animateGame() {
    cancelAnimationFrame(frame);
    const tick = () => {
      if (!activeGame || actionPending) return;
      const now = serverNow();
      const elapsed = now - activeGame.startedAt;
      const remaining = Math.max(0, activeGame.expiresAt - now);
      $('game-timer').textContent = `${(remaining / 1000).toFixed(1)}s`;
      if (remaining <= 0) { submitExpired(); return; }
      const stage = $('game-stage');
      if (activeGame.game === 'bowl') {
        const position = .5 + Math.sin((elapsed / activeGame.period) * Math.PI * 2 + activeGame.phase) * .5;
        stage.querySelector('.moving-bowl').style.left = `${position * 100}%`;
      } else if (activeGame.game === 'needle') {
        const position = .5 + Math.sin((elapsed / activeGame.period) * Math.PI * 2 + activeGame.phase) * .5;
        stage.querySelector('.needle-marker').style.left = `${position * 100}%`;
      } else if (activeGame.game === 'heart') {
        const hot = activeGame.positions[Math.floor(elapsed / activeGame.interval)];
        [...stage.querySelectorAll('button')].forEach((button, index) => { button.textContent = index === hot ? '♥' : '♡'; button.classList.toggle('hot', index === hot); });
      } else if (activeGame.game === 'memory') renderMemory(elapsed);
      frame = requestAnimationFrame(tick);
    };
    tick();
  }
  function renderMemory(elapsed) {
    const stage = $('game-stage');
    const revealDuration = activeGame.sequence.length * activeGame.revealMs;
    if (elapsed < revealDuration) {
      const display = stage.querySelector('.memory-display');
      if (display) display.textContent = symbols[activeGame.sequence[Math.max(0, Math.floor(elapsed / activeGame.revealMs))]];
    } else if (!stage.querySelector('.memory-buttons')) {
      stage.replaceChildren();
      const buttons = document.createElement('div'); buttons.className = 'memory-buttons';
      symbols.forEach((symbol, index) => buttons.append(createButton(symbol, () => chooseMemory(index))));
      stage.append(buttons);
    }
  }
  async function startGame() {
    $('game-result').textContent = '';
    $('start-game').disabled = true;
    try {
      await syncClock();
      const sentAt = Date.now();
      const game = await api('/api/game/sessions', json({ game: selectedGame, difficulty, requestId: requestId() }));
      const receivedAt = Date.now();
      activeGame = game;
      clockOffset = game.serverNow - (sentAt + receivedAt) / 2;
      prepareStage(game); animateGame();
      $('start-game').hidden = true;
      await refreshWallet();
    } catch (error) { $('game-result').textContent = error.message; $('start-game').disabled = false; }
  }
  async function finishGame(body, revealDelay = 0) {
    if (!activeGame || actionPending) return;
    actionPending = true;
    cancelAnimationFrame(frame);
    try {
      const result = await api(`/api/game/sessions/${activeGame.id}/action`, json({ actionId: requestId(), ...body }));
      if (revealDelay) await new Promise(resolve => setTimeout(resolve, revealDelay));
      $('game-result').textContent = result.won ? `THẮNG! Nhận ${result.payout} xu.` : 'Chưa trúng. Thử lại ván sau nhé!';
      activeGame = null; $('start-game').hidden = false; $('start-game').disabled = false; $('game-timer').textContent = '—';
      await refreshWallet();
    } catch (error) { $('game-result').textContent = error.message; }
    finally { actionPending = false; }
  }
  function submitReflex(position) {
    if (activeGame?.game === 'bowl') {
      const coin = $('game-stage').querySelector('.drop-coin'); coin.style.transitionDuration = '400ms'; coin.style.top = '72%';
      finishGame({ actionAt: Math.round(serverNow() + 400) }, 400);
    } else finishGame({ actionAt: Math.round(serverNow()), ...(position == null ? {} : { position }) });
  }
  function submitExpired() { finishGame({ actionAt: Math.round(serverNow()), answers: [] }); }
  function chooseMemory(value) {
    if (!activeGame || actionPending) return;
    memoryAnswers.push(value);
    const index = memoryAnswers.length - 1;
    if (value !== activeGame.sequence[index] || memoryAnswers.length === activeGame.sequence.length) finishGame({ answers: memoryAnswers });
  }
  function chooseOrder(value) {
    if (!activeGame || actionPending) return;
    orderAnswers.push(value);
    const expected = orderAnswers.length;
    const button = [...$('game-stage').querySelectorAll('button')].find(item => Number(item.textContent) === value); if (button) button.disabled = true;
    if (value !== expected || orderAnswers.length === activeGame.order.length) finishGame({ answers: orderAnswers });
  }
  async function restoreGame() {
    const response = await api('/api/game/current');
    if (!response.game) return;
    activeGame = response.game; clockOffset = response.serverNow - Date.now(); selectedGame = activeGame.game; difficulty = activeGame.difficulty;
    document.querySelectorAll('[data-game]').forEach(button => button.classList.toggle('active', button.dataset.game === selectedGame));
    document.querySelectorAll('[data-difficulty]').forEach(button => button.classList.toggle('active', button.dataset.difficulty === difficulty));
    updateGameLabels(); prepareStage(activeGame); animateGame(); $('start-game').hidden = true;
  }
  async function pollPayment() {
    if (!payment) return;
    try {
      const status = await api('/api/donations/status', { headers: { 'X-Donation-Token': payment.token } });
      if (status.status === 'paid') {
        $('payment-status').textContent = `Đã nhận ${money(status.paidAmount)}. Xu đã vào ví.`;
        $('qr-box').hidden = true;
        savePayment(null); await refreshWallet(); return;
      }
    } catch (error) { $('payment-status').textContent = `${error.message} Trang sẽ tự thử lại.`; }
    setTimeout(pollPayment, 3000);
  }
  function displayPayment(value) {
    savePayment(value); $('topup-form').hidden = true; $('payment').hidden = false;
    $('qr-box').hidden = false; $('qr-image').hidden = false; $('qr-error').hidden = true;
    $('qr-image').src = value.qrUrl; $('bank-name').textContent = value.bank; $('account-name').textContent = value.accountName; $('account-number').textContent = value.account; $('payment-code').textContent = value.code; $('payment-amount').textContent = money(value.amount); $('payment-status').textContent = 'Đang chờ tiền về…'; pollPayment();
  }

  document.querySelectorAll('[data-amount]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-amount]').forEach(item => item.classList.remove('active')); button.classList.add('active'); $('topup-amount').value = button.dataset.amount; }));
  document.querySelectorAll('[data-game]').forEach(button => button.addEventListener('click', () => { if (activeGame) return; selectedGame = button.dataset.game; document.querySelectorAll('[data-game]').forEach(item => item.classList.toggle('active', item === button)); updateGameLabels(); setStageMessage('Bấm bắt đầu khi bạn đã sẵn sàng. Mỗi ván tốn 1 xu.'); }));
  document.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => { if (activeGame) return; difficulty = button.dataset.difficulty; document.querySelectorAll('[data-difficulty]').forEach(item => item.classList.toggle('active', item === button)); updateGameLabels(); }));
  $('start-game').addEventListener('click', startGame);
  $('topup-form').addEventListener('submit', async event => { event.preventDefault(); $('topup-error').hidden = true; $('create-qr').disabled = true; const attemptId = localStorage.getItem(topupAttemptKey) || requestId(); localStorage.setItem(topupAttemptKey, attemptId); try { const created = await api('/api/donations', json({ name: $('player-name').value, amount: Number($('topup-amount').value), requestId: attemptId })); localStorage.removeItem(topupAttemptKey); displayPayment(created); } catch (error) { $('topup-error').textContent = error.message; $('topup-error').hidden = false; } finally { $('create-qr').disabled = false; } });
  $('new-topup').addEventListener('click', () => { savePayment(null); localStorage.removeItem(topupAttemptKey); $('payment').hidden = true; $('topup-form').hidden = false; });
  $('qr-image').addEventListener('error', () => { $('qr-image').hidden = true; $('qr-error').hidden = false; });
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => navigator.clipboard.writeText($(button.dataset.copy).textContent)));
  $('backup-wallet').addEventListener('click', async () => { await navigator.clipboard.writeText(walletToken); $('backup-wallet').textContent = 'Đã chép mã ví ✓'; });
  $('show-import').addEventListener('click', () => { $('import-form').hidden = !$('import-form').hidden; });
  $('import-form').addEventListener('submit', async event => { event.preventDefault(); const candidate = $('import-token').value.trim().toLowerCase(); const old = walletToken; walletToken = candidate; try { const value = await refreshWallet(); localStorage.setItem(walletKey, candidate); renderWallet(value); location.reload(); } catch (error) { walletToken = old; $('availability').textContent = error.message; } });
  $('redeem-form').addEventListener('submit', async event => { event.preventDefault(); $('redeem-button').disabled = true; try { await api('/api/game/redemptions', json({ name: $('redeem-name').value, contact: $('redeem-contact').value, requestId: requestId() })); await refreshWallet(); await refreshRedemption(); } catch (error) { $('redemption-status').textContent = error.message; $('redeem-button').disabled = false; } });

  async function init() {
    try {
      config = await api('/api/donations/config', {}, false);
      if (!config.ready) { $('availability').textContent = 'Hệ thống chưa sẵn sàng nhận tiền.'; return; }
      await ensureWallet(); $('availability').hidden = true; await refreshRedemption(); await restoreGame();
      try { const cached = JSON.parse(localStorage.getItem(paymentKey)); if (cached?.token) displayPayment(cached); } catch { savePayment(null); }
      setInterval(() => refreshWallet().then(refreshRedemption).catch(() => {}), 4000);
    } catch (error) { $('availability').textContent = error.message; }
  }
  updateGameLabels(); init();
})();
