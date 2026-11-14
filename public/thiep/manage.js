(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const WALLET_KEY = 'locly-game-wallet';
  const LIST_KEY = 'locly-cards';
  const ATTEND = { yes: 'Sẽ đến', no: 'Không đến được', maybe: 'Chưa chắc' };
  const code = (location.pathname.match(/\/thiep\/([A-Za-z2-9]{8})\/quanly/) || [])[1]?.toUpperCase();
  const token = new URLSearchParams(location.hash.slice(1)).get('k');
  let card = null, config = { price: 29, hardshipPrice: 19, paymentsReady: false }, wallet = null, walletToken = null, polling = 0, publishing = false;

  const readJson = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } };
  const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* private mode */ } };
  const money = vnd => `${Number(vnd).toLocaleString('vi-VN')}đ`;
  const requestId = () => crypto.randomUUID?.() || `${Date.now().toString(16)}-${Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-')}`;
  const say = (id, text, bad) => { $(id).textContent = text; $(id).classList.toggle('is-bad', Boolean(bad)); };
  const when = ms => new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  try { walletToken = localStorage.getItem(WALLET_KEY); } catch (_) { walletToken = null; }

  async function api(url, options = {}, extra = {}) {
    const headers = { ...(options.headers || {}), ...extra };
    const res = await fetch(url, { ...options, headers, cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || 'Máy chủ đang bận, bạn thử lại nhé.'), { status: res.status });
    return body;
  }
  const own = (url, options = {}) => api(url, options, { 'X-Card-Token': token });
  const withWallet = (url, options = {}) => api(url, options, walletToken ? { 'X-Wallet-Token': walletToken } : {});
  const copy = async (value, button) => {
    try { await navigator.clipboard.writeText(value); } catch (_) { const area = Object.assign(document.createElement('textarea'), { value }); document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); }
    const old = button.textContent; button.textContent = 'Đã chép!'; setTimeout(() => { button.textContent = old; }, 1500);
  };

  /* ---------- preview ---------- */
  let previewReady = false;
  const pushPreview = () => { if (previewReady && card) $('preview').contentWindow.postMessage({ type: 'card-preview', card }, location.origin); };
  const frame = $('preview');
  frame.addEventListener('load', () => { previewReady = true; pushPreview(); });
  try { if (frame.contentDocument?.readyState === 'complete' && frame.contentWindow.location.pathname === '/thiep/xem-truoc') previewReady = true; } catch (_) { /* not loaded yet */ }
  window.addEventListener('message', e => { if (e.origin === location.origin && e.data?.type === 'card-preview-ready' && e.source === $('preview').contentWindow) { previewReady = true; pushPreview(); } });

  /* ---------- card ---------- */
  function render() {
    const name = card.content.nickname;
    $('title').textContent = `Thiệp của ${name}`;
    document.title = `Quản lý thiệp · ${name}`;
    const pill = $('status-pill');
    pill.className = `pill ${card.status}`;
    pill.textContent = { draft: 'Bản nháp', published: 'Đã xuất bản', disabled: 'Đã bị gỡ' }[card.status] || card.status;
    $('edit-link').href = `/taothiep#c=${code}&k=${token}`;
    $('publish-panel').hidden = card.status !== 'draft';
    $('share-panel').hidden = card.status !== 'published';
    const share = `${location.origin}/thiep/${code}`;
    $('share-url').value = share; $('open-card').href = share;
    if (card.status === 'published') {
      $('qr-card').src = `/thiep/${code}/qr.svg`;
      $('qr-png').href = `/thiep/${code}/qr.png?tai=1`;
      $('qr-svg').href = `/thiep/${code}/qr.svg?tai=1`;
    }
    $('native-share').hidden = !navigator.share;
    $('manage-url').value = `${location.origin}/thiep/${code}/quanly#k=${token}`;
    $('owner-email').value = card.ownerEmail || '';
    const price = card.price || config.price;
    $('price').textContent = money(price * 1000);
    $('hardship-price').textContent = money((config.hardshipPrice || 19) * 1000);
    if (config.supportUrl) $('support-link').href = config.supportUrl;
    $('hardship').hidden = Boolean(card.hardship) || card.status !== 'draft';
    $('price-note').hidden = !card.hardship;
    $('price-note').textContent = card.hardship ? `Đã áp dụng giá hỗ trợ cho hoàn cảnh khó khăn (giá gốc ${money(config.price * 1000)}).` : '';
    if (card.status === 'disabled') { $('load-error').hidden = false; $('load-error').textContent = 'Thiệp này đã bị gỡ vì vi phạm điều khoản. Nếu bạn nghĩ có nhầm lẫn, hãy liên hệ quản trị.'; }
    pushPreview();
  }
  function remember() {
    const list = (readJson(LIST_KEY) || []).filter(x => x.code !== code);
    list.unshift({ code, token, name: card.content.nickname, createdMs: card.createdMs });
    writeJson(LIST_KEY, list.slice(0, 20));
  }

  /* ---------- wallet and publishing ---------- */
  const TOPUP_KEY = `locly-card-topup-${code}`;
  async function loadWallet() {
    if (walletToken) {
      try { wallet = await withWallet('/api/game/wallet'); } catch (_) { wallet = null; walletToken = null; }
    }
    if (!wallet) {
      const created = await api('/api/game/wallets', { method: 'POST' });
      walletToken = created.token; wallet = created;
      try { localStorage.setItem(WALLET_KEY, walletToken); } catch (_) { /* private mode */ }
    }
    $('wallet-line').hidden = false;
    $('wallet-balance').textContent = `${wallet.balance} xu`;
    return wallet;
  }
  async function reportTransfer(transferCode, claimed) {
    try {
      const body = await api(`/api/thiep/cards/${code}/transfer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: transferCode, claimed }) }, { 'X-Card-Token': token, 'X-Wallet-Token': walletToken });
      card = body.card;
    } catch (_) { /* the payment itself still works; the admin just sees less */ }
  }
  function showQr(saved) {
    $('qr').hidden = false; $('pay-wallet').hidden = true;
    $('qr-img').src = saved.qrUrl; $('qr-bank').textContent = saved.bank; $('qr-account').textContent = saved.account;
    $('qr-name').textContent = saved.accountName; $('qr-amount').textContent = money(saved.amount); $('qr-code').textContent = saved.code;
    $('support-card').textContent = code; $('support-transfer').textContent = saved.code;
    if (card?.transfer?.code !== saved.code) reportTransfer(saved.code, false);
  }

  // Money only comes up once the owner asks to publish.
  async function openPay() {
    if (!config.paymentsReady) return say('pub-status', 'Thanh toán chưa được bật trên máy chủ này.', true);
    $('publish').hidden = true; $('pay').hidden = false;
    say('pub-status', 'Đang kiểm tra ví…');
    try {
      await loadWallet();
      if (wallet.balance >= card.price) {
        $('qr').hidden = true; $('pay-wallet').hidden = false;
        $('pay-wallet').textContent = `Dùng ${card.price} xu trong ví để xuất bản`;
        say('pub-status', '');
      } else await startTopup();
    } catch (error) { say('pub-status', error.message, true); }
  }

  async function chargeAndPublish() {
    if (publishing) return;
    publishing = true; $('pay-wallet').disabled = true;
    try {
      say('pub-status', 'Đang xuất bản…');
      const key = `locly-card-publish-${code}`;
      let attempt; try { attempt = localStorage.getItem(key); } catch (_) { attempt = null; }
      if (!attempt) { attempt = requestId(); try { localStorage.setItem(key, attempt); } catch (_) { /* private mode */ } }
      const body = await api(`/api/thiep/cards/${code}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: attempt }) }, { 'X-Card-Token': token, 'X-Wallet-Token': walletToken });
      try { localStorage.removeItem(key); localStorage.removeItem(TOPUP_KEY); } catch (_) { /* private mode */ }
      card = body.card; stopPolling();
      say('pub-status', '');
      render();
      $('share-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (error.status === 409 && /xu/.test(error.message)) { publishing = false; return startTopup(); }
      say('pub-status', error.message, true);
    } finally { publishing = false; $('pay-wallet').disabled = false; }
  }

  async function startTopup() {
    try {
      const donationConfig = await api('/api/donations/config').catch(() => ({ ready: false }));
      if (!donationConfig.ready) throw new Error('Chuyển khoản đang tạm dừng, bạn thử lại sau nhé.');
      const missingXu = Math.max(1, card.price - (wallet?.balance || 0));
      const amount = Math.max(1000, missingXu * 1000 - (wallet?.remainder || 0));
      let saved = readJson(TOPUP_KEY);
      if (!saved || saved.amount !== amount) {
        saved = await withWallet('/api/donations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: card.content.nickname.slice(0, 40), amount, requestId: requestId() }) });
        writeJson(TOPUP_KEY, saved);
      }
      showQr(saved);
      say('pub-status', `Chuyển khoản ${money(saved.amount)} theo mã trên rồi bấm "Tôi đã chuyển khoản". Tiền về là thiệp tự xuất bản.`);
      startPolling();
    } catch (error) { say('pub-status', error.message, true); }
  }

  // Asks the server whether the transfer has landed. Runs every few seconds, when the owner
  // comes back from the bank app, and when they press "Tôi đã chuyển khoản".
  let checking = false, ticks = 0;
  async function checkPayment(manual) {
    if (checking || publishing) return;
    const saved = readJson(TOPUP_KEY);
    checking = true;
    if (manual) { $('paid').disabled = true; $('paid').textContent = 'Đang kiểm tra…'; }
    try {
      if (manual && saved?.code && !card?.transfer?.claimedMs) await reportTransfer(saved.code, true);
      if (manual || ++ticks % 5 === 0) {
        ({ card } = await own(`/api/thiep/cards/${code}`));
        if (card.status === 'published') {
          stopPolling();
          try { localStorage.removeItem(TOPUP_KEY); } catch (_) { /* private mode */ }
          render();
          $('share-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
      if (saved?.token) {
        const status = await withWallet('/api/donations/status', { headers: { 'X-Donation-Token': saved.token } });
        if (status.status !== 'paid') {
          if (manual) { say('pub-status', 'Chưa thấy tiền về. Ngân hàng có thể chậm 1–3 phút, trang vẫn tự kiểm tra và xuất bản ngay khi tiền tới. Quá 10 phút vẫn chưa được thì nhắn hỗ trợ qua Facebook bên dưới nhé.', true); $('support').classList.add('is-urgent'); }
          return;
        }
      }
      wallet = null; await loadWallet();
      if (wallet.balance >= card.price) {
        try { localStorage.removeItem(TOPUP_KEY); } catch (_) { /* private mode */ }
        say('pub-status', 'Đã nhận tiền! Đang xuất bản…');
        checking = false;
        return chargeAndPublish();
      }
      // A smaller transfer landed: ask for what is still missing.
      try { localStorage.removeItem(TOPUP_KEY); } catch (_) { /* private mode */ }
      say('pub-status', `Đã nhận tiền nhưng ví còn thiếu ${card.price - wallet.balance} xu. Bạn chuyển thêm theo mã mới nhé.`, true);
      checking = false;
      return startTopup();
    } catch (error) {
      if (manual) say('pub-status', error.message === 'Failed to fetch' ? 'Mất kết nối, bạn thử lại nhé.' : error.message, true);
    } finally {
      checking = false;
      if (manual) { $('paid').disabled = false; $('paid').textContent = 'Tôi đã chuyển khoản'; }
    }
  }
  function stopPolling() { clearInterval(polling); polling = 0; }
  function startPolling() { stopPolling(); polling = setInterval(() => checkPayment(false), 3000); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && polling) checkPayment(false); });
  window.addEventListener('focus', () => { if (polling) checkPayment(false); });

  /* ---------- wishes ---------- */
  async function loadWishes() {
    const box = $('wishes');
    try {
      const { wishes } = await own(`/api/thiep/cards/${code}/wishes`);
      ['yes', 'no', 'maybe'].forEach(k => { $(`n-${k}`).textContent = wishes.filter(w => w.attending === k).length; });
      if (!wishes.length) { box.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty', textContent: card.status === 'published' ? 'Chưa có lời chúc nào. Gửi link thiệp cho bạn bè nhé!' : 'Lời chúc sẽ hiện ở đây sau khi thiệp được xuất bản.' })); return; }
      box.replaceChildren(...wishes.map(w => {
        const item = document.createElement('article'); item.className = 'wish';
        const head = document.createElement('div'); head.className = 'wish-head';
        const who = document.createElement('b'); who.textContent = w.name;
        const at = document.createElement('time'); at.textContent = when(w.createdMs);
        head.append(who, at);
        const msg = document.createElement('p'); msg.textContent = w.message;
        const row = document.createElement('div'); row.className = 'row';
        if (ATTEND[w.attending]) { const tag = document.createElement('span'); tag.className = `tag ${w.attending}`; tag.textContent = ATTEND[w.attending]; row.append(tag); }
        const del = document.createElement('button'); del.type = 'button'; del.className = 'btn btn-ghost btn-sm'; del.textContent = 'Xoá';
        del.addEventListener('click', async () => {
          if (!confirm(`Xoá lời chúc của ${w.name}?`)) return;
          try { await own(`/api/thiep/cards/${code}/wishes/${encodeURIComponent(w.id)}`, { method: 'DELETE' }); loadWishes(); } catch (error) { alert(error.message); }
        });
        row.append(del);
        item.append(head, msg, row);
        return item;
      }));
    } catch (error) { box.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty', textContent: error.message })); }
  }
  async function downloadCsv() {
    const res = await fetch(`/api/thiep/cards/${code}/wishes.csv`, { headers: { 'X-Card-Token': token }, cache: 'no-store' });
    if (!res.ok) return alert('Chưa tải được, bạn thử lại nhé.');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `loi-chuc-${code}.csv` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- start ---------- */
  $('publish').addEventListener('click', openPay);
  $('pay-wallet').addEventListener('click', chargeAndPublish);
  $('paid').addEventListener('click', () => checkPayment(true));
  $('hardship-form').addEventListener('submit', async e => {
    e.preventDefault();
    $('hardship-send').disabled = true;
    try {
      ({ card } = await own(`/api/thiep/cards/${code}/hardship`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: $('hardship-text').value }) }));
      render();
      // The amount changed, so work out again whether the wallet covers it or a new transfer is needed.
      if (!$('pay').hidden) {
        stopPolling();
        if (wallet && wallet.balance >= card.price) { $('qr').hidden = true; $('pay-wallet').hidden = false; $('pay-wallet').textContent = `Dùng ${card.price} xu trong ví để xuất bản`; say('pub-status', ''); }
        else await startTopup();
      }
    } catch (error) { say('hardship-status', error.message, true); }
    finally { $('hardship-send').disabled = false; }
  });
  $('copy-share').addEventListener('click', e => copy($('share-url').value, e.currentTarget));
  $('guest-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('guest-name').value.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) { $('guest-name').focus(); return; }
    $('guest-url').value = `${location.origin}/thiep/${code}?to=${encodeURIComponent(name)}`;
    $('guest-out').hidden = false;
    $('guest-url').select();
  });
  $('guest-copy').addEventListener('click', e => copy($('guest-url').value, e.currentTarget));
  $('copy-manage').addEventListener('click', e => copy($('manage-url').value, e.currentTarget));
  $('native-share').addEventListener('click', () => navigator.share?.({ title: `${card.content.headline} · ${card.content.nickname}`, url: $('share-url').value }).catch(() => {}));
  $('refresh-wishes').addEventListener('click', loadWishes);
  $('csv').addEventListener('click', downloadCsv);
  $('email-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const result = await own(`/api/thiep/cards/${code}/email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('owner-email').value }) });
      say('email-status', result.ownerEmail
        ? (result.mailed === 'sent' ? 'Đã lưu và gửi link quản lý vào email của bạn.' : 'Đã lưu email. Link và lời chúc sẽ được gửi sau khi thiệp xuất bản.')
        : 'Đã xoá email.');
    } catch (error) { say('email-status', error.message, true); }
  });

  async function start() {
    if (!code || !token) { $('load-error').hidden = false; $('load-error').textContent = 'Link quản lý không đầy đủ. Bạn mở lại đúng link đã lưu nhé.'; $('title').textContent = 'Không mở được thiệp'; return; }
    try {
      try { config = { ...config, ...await api('/api/thiep/config') }; } catch (_) { /* defaults */ }
      ({ card } = await own(`/api/thiep/cards/${code}`));
      remember(); render(); loadWishes();
      if (card.status === 'draft') {
        // A transfer started earlier: go straight back to waiting for it.
        const pending = readJson(TOPUP_KEY);
        if (pending?.token && config.paymentsReady) {
          $('publish').hidden = true; $('pay').hidden = false;
          showQr(pending);
          loadWallet().catch(() => {});
          say('pub-status', 'Đang chờ tiền về cho lần chuyển khoản trước. Chuyển xong thì bấm "Tôi đã chuyển khoản".');
          startPolling();
          checkPayment(false);
        }
      }
    } catch (error) {
      $('load-error').hidden = false; $('load-error').textContent = error.message;
      $('title').textContent = 'Không mở được thiệp';
    }
  }
  start();
})();
