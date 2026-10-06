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
  const queue = [];
  // Sequence cursors already prevent replay; IDs also protect the animation queue.
  const seen = new Set();
  const defaultSpeech = 'Ai đi ngang qua… cho xin chút lộc với ạ!';
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
    $('speech-kicker').textContent = 'NHẬN CHÚT LỘC, GỬI CHÚT VUI';
    $('speech-text').textContent = event.message;
    $('scene').classList.add('celebrating');
    speak(event.message);
    setTimeout(() => {
      $('scene').classList.remove('celebrating');
      $('speech').classList.toggle('thanking', Boolean(personalThanks));
      $('speech-kicker').textContent = personalThanks ? 'CÚI ĐẦU CẢM TẠ TẤM LÒNG' : 'LỜI THỈNH CẦU NHỎ XÍU';
      $('speech-text').textContent = personalThanks || defaultSpeech;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      playing = false;
      // Give CSS animations a new frame before the next donation.
      setTimeout(playNext, 80);
    }, 7000);
  }
  function showPaidState(status, current) {
    const donor = current.name || 'bạn';
    const total = `${money(status.paidAmount)}${status.paymentCount > 1 ? ` qua ${status.paymentCount} lượt` : ''}`;
    personalThanks = status.message || `Con xin cúi đầu cảm tạ ${donor}! Chúc bạn phúc đầy nhà, lộc đầy túi, người thân bình an, làm đâu thắng đó!`;
    $('payment').classList.add('paid');
    $('paid-success').hidden = false;
    $('payment-heading-text').textContent = 'Mình đã nhận được rồi!';
    $('new-donation').textContent = 'Cho thêm chút lộc';
    $('paid-title').textContent = `Đã nhận ${total}. Mình xin cúi đầu cảm tạ.`;
    $('paid-message').textContent = personalThanks;
    $('scene').classList.add('grateful');
    $('speech').classList.add('thanking');
    $('speech-kicker').textContent = 'CÚI ĐẦU CẢM TẠ TẤM LÒNG';
    $('speech-text').textContent = personalThanks;
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
    $('speech-kicker').textContent = 'LỜI THỈNH CẦU NHỎ XÍU';
    $('speech-text').textContent = defaultSpeech;
    $('payment').classList.remove('paid');
    $('paid-success').hidden = true;
    $('payment-heading-text').textContent = 'Quét một chiếc QR, gửi một chút vui.';
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
    $('create-qr').textContent = 'Đang chuẩn bị chiếc QR…';
    try {
      displayPayment(await api('/api/donations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('donor-name').value, amount: Number($('amount').value) }) }));
    } catch (error) {
      $('form-error').textContent = error.message;
      $('form-error').hidden = false;
    } finally {
      $('donation-fields').disabled = false;
      $('create-qr').textContent = 'Gửi chút lộc ↗';
    }
  });
  $('new-donation').addEventListener('click', () => {
    payment = null;
    personalThanks = '';
    thankedToken = null;
    $('scene').classList.remove('grateful');
    $('speech').classList.remove('thanking');
    $('speech-kicker').textContent = 'LỜI THỈNH CẦU NHỎ XÍU';
    $('speech-text').textContent = defaultSpeech;
    forgetPayment();
    $('payment').hidden = true;
    $('donation-form').hidden = false;
    $('form-error').hidden = true;
    $('donor-name').focus();
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
        $('availability').textContent = 'Chiếc bát đang được chuẩn bị. Trang chưa sẵn sàng nhận tiền, bạn ghé lại sau nhé!';
        connection('Chưa mở nhận lộc');
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
      pollEvents();
      pollStatus();
    } catch {
      $('availability').textContent = 'Chưa kết nối được trang nhận lộc. Hãy tải lại trang sau một chút nhé.';
      connection('Chưa kết nối');
    }
  }
  window.addEventListener('pageshow', () => { if (active) checkStatus(); });
  document.addEventListener('visibilitychange', () => { if (active && document.visibilityState === 'visible') checkStatus(); });
  init();
})();
