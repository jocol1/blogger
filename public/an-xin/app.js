(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const money = amount => `${amount.toLocaleString('vi-VN')}đ`;
  const choices = [...document.querySelectorAll('[data-amount]')];
  let payment = null;
  let cursor;
  let playing = false;
  let sound = false;
  let active = false;
  let personalThanks = '';
  let thankedToken = null;
  let bowlMotionStarted = false;
  let selectedGame = 'bowl';
  let clockTime = 0;
  let shownHeart = -1;
  let needleFrozenUntil = 0;
  let needleFrozenPosition = 50;
  const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const queue = [];
  // Sequence cursors already prevent replay; IDs also protect the animation queue.
  const seen = new Set();
  const defaultSpeech = 'Ai có dư… gửi mình một chút nhé!';
  const paymentStorageKey = 'donation-payment';

  function savePayment(value) {
    const serialized = JSON.stringify(value);
    try { localStorage.setItem(paymentStorageKey, serialized); } catch { /* Private browsing may disable storage. */ }
    try { sessionStorage.setItem(paymentStorageKey, serialized); } catch { /* Keep compatibility with existing tabs. */ }
  }
  function loadPayment() {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const serialized = storage.getItem(paymentStorageKey);
        if (serialized) return JSON.parse(serialized);
      } catch { /* Try the other browser storage. */ }
    }
    return null;
  }
  function forgetPayment() {
    for (const storage of [localStorage, sessionStorage]) {
      try { storage.removeItem(paymentStorageKey); } catch { /* Optional storage. */ }
    }
  }

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(12000) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Kết nối đang gián đoạn. Vui lòng thử lại.');
    return body;
  }
  function connection(text, live = false) {
    const element = $('connection');
    element.replaceChildren(document.createElement('i'), document.createTextNode(text));
    element.classList.toggle('live', live);
  }
  function speak(message) {
    if (!sound || !('speechSynthesis' in window)) return;
    const voice = window.speechSynthesis.getVoices().find(item => /^vi(?:-|_)/i.test(item.lang) || item.lang === 'vi');
    if (!voice) return;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'vi-VN';
    utterance.voice = voice;
    utterance.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
  function playNext() {
    if (playing || !queue.length) return;
    playing = true;
    const event = queue.shift();
    $('speech').classList.add('thanking');
    $('speech-kicker').textContent = 'MỘT KHOẢN VỪA VỀ RỒI';
    $('speech-text').textContent = event.message;
    $('scene').classList.add('celebrating');
    speak(event.message);
    setTimeout(() => {
      $('scene').classList.remove('celebrating');
      $('speech').classList.toggle('thanking', Boolean(personalThanks));
      $('speech-kicker').textContent = personalThanks ? 'TIỀN ĐÃ VỀ, VUI QUÁ TRỜI' : 'HỘP NHẬN TIỀN ĐANG TRỐNG';
      $('speech-text').textContent = personalThanks || defaultSpeech;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      playing = false;
      // Give CSS animations a new frame before the next donation.
      setTimeout(playNext, 80);
    }, 7000);
  }
  function coinTotal(status) {
    return Math.floor(Math.max(0, Number(status.paidAmount) || 0) / 1000);
  }
  function bowlOffsetAt(time) {
    if (reducedMotion) return -118;
    return Math.sin(time / 520) * 118;
  }
  function needlePositionAt(time) {
    return reducedMotion ? 50 : 50 + Math.sin(time / 430) * 45;
  }
  function heartPositionAt(time) {
    return reducedMotion ? 1 : Math.floor(time / 850) % 3;
  }
  function renderGameMotion(time) {
    clockTime = time;
    $('coin-bowl').setAttribute('transform', `translate(${bowlOffsetAt(time)} 0)`);
    $('needle-marker').style.left = `${time < needleFrozenUntil ? needleFrozenPosition : needlePositionAt(time)}%`;
    const heart = heartPositionAt(time);
    if (heart !== shownHeart) {
      shownHeart = heart;
      document.querySelectorAll('[data-heart]').forEach(button => {
        const isHeart = Number(button.dataset.heart) === heart;
        button.textContent = isHeart ? '♥' : '♡';
        button.classList.toggle('has-heart', isHeart);
      });
    }
  }
  function startBowlMotion() {
    if (bowlMotionStarted || typeof requestAnimationFrame !== 'function') return;
    bowlMotionStarted = true;
    const move = time => {
      renderGameMotion(time);
      requestAnimationFrame(move);
    };
    requestAnimationFrame(move);
  }
  function selectGame(mode) {
    selectedGame = mode;
    document.querySelectorAll('[data-game]').forEach(button => {
      const active = button.dataset.game === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    for (const game of ['bowl', 'needle', 'heart']) $(`game-${game}`).hidden = game !== mode;
    $('coin-feedback').textContent = mode === 'bowl' ? 'Canh bát chạy qua làn rơi rồi bắn nhé.'
      : mode === 'needle' ? 'Dừng kim trong vùng cam nhé.' : 'Chạm ô có tim trước khi nó chạy đi nhé.';
  }
  function spendCoin() {
    if (!payment || !Number.isSafeInteger(payment.coinTotal) || !Number.isSafeInteger(payment.coinsThrown) || payment.coinsThrown >= payment.coinTotal) return false;
    payment.coinsThrown++;
    const available = payment.coinTotal - payment.coinsThrown;
    $('coin-balance').textContent = String(available);
    for (const id of ['throw-coin', 'stop-needle']) $(id).disabled = available < 1;
    if ((typeof performance !== 'undefined' ? performance.now() : clockTime) < needleFrozenUntil) $('stop-needle').disabled = true;
    document.querySelectorAll('[data-heart]').forEach(button => { button.disabled = available < 1; });
    savePayment(payment);
    return true;
  }
  function recordHit(game) {
    if (!payment) return;
    payment.gameHits ||= {};
    payment.gameHits[game] = Math.max(0, Number(payment.gameHits[game]) || 0) + 1;
    $('game-score').textContent = String(Object.values(payment.gameHits).reduce((sum, value) => sum + (Number.isSafeInteger(value) && value > 0 ? value : 0), 0));
    savePayment(payment);
  }
  function updateCoinGame(status, current) {
    const total = coinTotal(status);
    const thrown = Math.min(total, Math.max(0, Number.isSafeInteger(current.coinsThrown) ? current.coinsThrown : 0));
    const available = total - thrown;
    current.coinsThrown = thrown;
    const changed = $('coin-game').hidden || current.displayedCoinTotal !== total;
    $('coin-game').hidden = false;
    $('coin-balance').textContent = String(available);
    $('game-score').textContent = String(Object.values(current.gameHits || {}).reduce((sum, value) => sum + (Number.isSafeInteger(value) && value > 0 ? value : 0), 0));
    for (const id of ['throw-coin', 'stop-needle']) $(id).disabled = available < 1;
    if ((typeof performance !== 'undefined' ? performance.now() : clockTime) < needleFrozenUntil) $('stop-needle').disabled = true;
    document.querySelectorAll('[data-heart]').forEach(button => { button.disabled = available < 1; });
    if (changed) $('coin-feedback').textContent = available > 0
      ? `Bạn có ${available} xu. Chọn một trò rồi chơi nhé.`
      : total ? 'Bạn đã dùng hết xu. Có thêm tiền về thì lại chơi tiếp nhé!' : 'Khoản này chưa đủ 1.000đ để đổi thành xu.';
    current.displayedCoinTotal = total;
    savePayment(current);
  }
  function tossCoin() {
    if (selectedGame !== 'bowl' || !spendCoin()) return;
    const current = payment;
    const available = payment.coinTotal - payment.coinsThrown;
    const now = typeof performance !== 'undefined' ? performance.now() : clockTime;
    const willHit = Math.abs(433 + bowlOffsetAt(now + 625) - 307) < 47;
    $('coin-feedback').textContent = `Xu đang bay… còn ${available} xu.`;
    const coin = document.createElement('span');
    coin.className = 'thrown-coin shot-coin';
    coin.textContent = '₫';
    coin.style.setProperty('--shot-distance', `${Math.max(170, $('coin-flight-layer').clientHeight * .5 || 220)}px`);
    $('coin-flight-layer').append(coin);
    setTimeout(() => {
      if (payment !== current) return;
      if (willHit) recordHit('bowl');
      if (selectedGame === 'bowl') $('coin-feedback').textContent = willHit
        ? `VÀO BÁT! Còn ${current.coinTotal - current.coinsThrown} xu.`
        : `Trượt mất rồi! Còn ${current.coinTotal - current.coinsThrown} xu.`;
    }, 625);
    setTimeout(() => coin.remove(), 900);
  }
  function stopNeedle() {
    if (selectedGame !== 'needle' || $('stop-needle').disabled || !spendCoin()) return;
    const now = typeof performance !== 'undefined' ? performance.now() : clockTime;
    needleFrozenPosition = needlePositionAt(now);
    needleFrozenUntil = now + 700;
    $('needle-marker').style.left = `${needleFrozenPosition}%`;
    $('stop-needle').disabled = true;
    const hit = Math.abs(needleFrozenPosition - 50) <= 12;
    if (hit) recordHit('needle');
    $('coin-feedback').textContent = `${hit ? 'Trúng vùng cam!' : 'Lệch kim rồi!'} Còn ${payment.coinTotal - payment.coinsThrown} xu.`;
    const current = payment;
    setTimeout(() => {
      if (payment === current) $('stop-needle').disabled = current.coinsThrown >= current.coinTotal;
    }, 700);
  }
  function catchHeart(position) {
    if (selectedGame !== 'heart' || !spendCoin()) return;
    const now = typeof performance !== 'undefined' ? performance.now() : clockTime;
    const hit = position === heartPositionAt(now);
    if (hit) recordHit('heart');
    $('coin-feedback').textContent = `${hit ? 'Bắt được tim!' : 'Tim chạy mất rồi!'} Còn ${payment.coinTotal - payment.coinsThrown} xu.`;
  }
  function showPaidState(status, current) {
    const donor = current.name || 'bạn';
    const total = `${money(status.paidAmount)}${status.paymentCount > 1 ? ` qua ${status.paymentCount} lượt` : ''}`;
    personalThanks = status.message || `Tiền của ${donor} đã được ghi nhận. Cảm ơn bạn đã gửi một khoản rất dễ thương nhé!`;
    $('payment').classList.add('paid');
    $('paid-success').hidden = false;
    $('payment-heading-text').textContent = 'Đã nhận tiền rồi, cảm ơn bạn!';
    $('new-donation').textContent = 'Tạo QR khác';
    $('paid-title').textContent = `Đã nhận ${total}. Hộp tiền vui hẳn lên.`;
    $('paid-message').textContent = personalThanks;
    $('scene').classList.add('grateful');
    $('speech').classList.add('thanking');
    $('speech-kicker').textContent = 'TIỀN ĐÃ VỀ, VUI QUÁ TRỜI';
    $('speech-text').textContent = personalThanks;
    current.coinTotal = coinTotal(status);
    updateCoinGame(status, current);
    if (thankedToken !== current.token) {
      thankedToken = current.token;
      speak(personalThanks);
    }
  }
  async function pollEvents() {
    try {
      const result = await api(`/api/donations/events${cursor === undefined ? '' : `?after=${cursor}`}`);
      for (const event of result.events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        queue.push(event);
      }
      cursor = result.cursor;
      while (seen.size > 1000) seen.delete(seen.values().next().value);
      connection('Đang ngồi ở đây', true);
      playNext();
      if (active) setTimeout(pollEvents, result.hasMore ? 100 : 3000);
    } catch {
      connection('Đang nối lại…');
      if (active) setTimeout(pollEvents, 3000);
    }
  }
  async function checkStatus() {
    const current = payment;
    if (current) {
      try {
        const status = await api('/api/donations/status', { headers: { 'X-Donation-Token': current.token } });
        if (payment === current) {
          if (status.status === 'paid') showPaidState(status, current);
          else {
            $('payment').classList.remove('paid');
            $('payment-status').classList.remove('paid');
            $('payment-status').textContent = 'QR đã sẵn sàng. Chuyển đúng nội dung DH ở trên nhé.';
          }
        }
      } catch (error) {
        if (payment === current) {
          $('payment-status').classList.remove('paid');
          $('payment-status').textContent = `${error.message} Nếu đã chuyển, đừng chuyển lại; trang sẽ tự cập nhật khi kết nối lại.`;
        }
      }
    }
  }
  async function pollStatus() {
    await checkStatus();
    if (active) setTimeout(pollStatus, 3000);
  }
  function displayPayment(value) {
    payment = value;
    personalThanks = '';
    thankedToken = null;
    $('scene').classList.remove('grateful');
    $('speech').classList.remove('thanking');
    $('speech-kicker').textContent = 'HỘP NHẬN TIỀN ĐANG TRỐNG';
    $('speech-text').textContent = defaultSpeech;
    $('payment').classList.remove('paid');
    $('paid-success').hidden = true;
    $('coin-game').hidden = true;
    $('payment-heading-text').textContent = 'Quét QR này, gửi mình một chút vui.';
    $('new-donation').textContent = 'Đổi thông tin';
    $('bank-name').textContent = value.bank;
    $('account-name').textContent = value.accountName;
    $('account-number').textContent = value.account;
    $('payment-code').textContent = value.code;
    $('payment-amount').textContent = money(value.amount);
    $('qr-error').hidden = true;
    $('qr-image').hidden = false;
    $('qr-image').src = value.qrUrl;
    $('payment-status').classList.remove('paid');
    $('payment-status').textContent = 'QR đã sẵn sàng. Chuyển đúng nội dung DH ở trên nhé.';
    $('payment').hidden = false;
    $('donation-form').hidden = true;
    $('copy-status').textContent = '';
    savePayment(value);
  }
  choices.forEach(button => button.addEventListener('click', () => {
    $('amount').value = button.dataset.amount;
    updateChoices();
  }));
  function updateChoices() {
    choices.forEach(button => {
      const selected = button.dataset.amount === $('amount').value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  $('amount').addEventListener('input', updateChoices);
  $('sound').addEventListener('click', () => {
    if (!('speechSynthesis' in window)) {
      $('sound-label').textContent = 'Máy chưa hỗ trợ giọng đọc';
      return;
    }
    sound = !sound;
    $('sound').setAttribute('aria-pressed', String(sound));
    const hasVoice = window.speechSynthesis.getVoices().some(voice => /^vi(?:-|_|$)/i.test(voice.lang));
    $('sound-label').textContent = sound ? (hasVoice ? 'Tắt giọng đọc' : 'Chưa có giọng Việt · Tắt') : 'Bật giọng đọc';
    if (!sound) window.speechSynthesis.cancel();
  });
  $('donation-form').addEventListener('submit', async event => {
    event.preventDefault();
    $('form-error').hidden = true;
    $('donation-fields').disabled = true;
    $('create-qr').textContent = 'Đang tạo QR gửi tiền…';
    try {
      displayPayment(await api('/api/donations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('donor-name').value, amount: Number($('amount').value) }) }));
    } catch (error) {
      $('form-error').textContent = error.message;
      $('form-error').hidden = false;
    } finally {
      $('donation-fields').disabled = false;
      $('create-qr').textContent = 'Tạo QR gửi tiền ↗';
    }
  });
  $('new-donation').addEventListener('click', () => {
    payment = null;
    personalThanks = '';
    thankedToken = null;
    $('scene').classList.remove('grateful');
    $('speech').classList.remove('thanking');
    $('speech-kicker').textContent = 'HỘP NHẬN TIỀN ĐANG TRỐNG';
    $('speech-text').textContent = defaultSpeech;
    forgetPayment();
    $('payment').hidden = true;
    $('coin-game').hidden = true;
    $('donation-form').hidden = false;
    $('form-error').hidden = true;
    $('donor-name').focus();
  });
  $('throw-coin').addEventListener('click', tossCoin);
  $('stop-needle').addEventListener('click', stopNeedle);
  document.querySelectorAll('[data-game]').forEach(button => button.addEventListener('click', () => selectGame(button.dataset.game)));
  document.querySelectorAll('[data-heart]').forEach(button => button.addEventListener('click', () => catchHeart(Number(button.dataset.heart))));
  $('share-payment').addEventListener('click', async () => {
    if (!payment) return;
    const text = `Gửi tiền ${money(payment.amount)}\nNgân hàng: ${payment.bank}\nSố tài khoản: ${payment.account}\nChủ tài khoản: ${payment.accountName}\nNội dung chuyển khoản: ${payment.code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Thông tin gửi tiền', text });
      else {
        await navigator.clipboard.writeText(text);
        $('copy-status').textContent = 'Đã sao chép thông tin gửi tiền. Gửi cho người thương là xong.';
      }
    } catch (error) {
      if (error.name !== 'AbortError') $('copy-status').textContent = 'Chưa chia sẻ được. Bạn có thể chép số tài khoản và mã ở bên dưới.';
    }
  });
  $('qr-image').addEventListener('error', () => { $('qr-image').hidden = true; $('qr-error').hidden = false; });
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const value = $(button.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(value);
      $('copy-status').textContent = `Đã sao chép: ${value}`;
    } catch {
      const range = document.createRange();
      range.selectNodeContents($(button.dataset.copy));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      $('copy-status').textContent = 'Đã chọn nội dung. Bạn có thể nhấn giữ hoặc dùng Ctrl+C để sao chép.';
    }
  }));
  async function init() {
    try {
      const config = await api('/api/donations/config');
      if (!config.ready) {
        $('availability').textContent = 'Góc nhận tiền đang được chuẩn bị. Trang chưa sẵn sàng nhận tiền, bạn ghé lại sau nhé!';
        connection('Chưa mở nhận tiền');
        return;
      }
      $('availability').hidden = true;
      $('donation-fields').disabled = false;
      try {
        const cached = loadPayment();
        if (cached && /^[a-f0-9]{64}$/.test(cached.token) && /^DH\d{7}$/.test(cached.code) && cached.account === config.account && cached.bank === config.bank && Number.isSafeInteger(cached.amount) && cached.amount > 0) {
          // Rebuild the URL from trusted current configuration instead of using a cached URL.
          const params = new URLSearchParams({ amount: String(cached.amount), addInfo: cached.code, accountName: config.accountName });
          displayPayment({ ...cached, accountName: config.accountName, qrUrl: `https://img.vietqr.io/image/${encodeURIComponent(config.bank)}-${encodeURIComponent(config.account)}-compact2.png?${params}` });
        }
      } catch { /* An unavailable or outdated cached payment can be discarded. */ }
      active = true;
      startBowlMotion();
      pollEvents();
      pollStatus();
    } catch {
      $('availability').textContent = 'Chưa kết nối được góc nhận tiền. Hãy tải lại trang sau một chút nhé.';
      connection('Chưa kết nối');
    }
  }
  window.addEventListener('pageshow', () => { if (active) checkStatus(); });
  document.addEventListener('visibilitychange', () => { if (active && document.visibilityState === 'visible') checkStatus(); });
  init();
})();
