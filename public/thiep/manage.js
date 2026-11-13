(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const WALLET_KEY = 'locly-game-wallet';
  const LIST_KEY = 'locly-cards';
  const ATTEND = { yes: 'Sẽ đến', no: 'Không đến được', maybe: 'Chưa chắc' };
  const code = (location.pathname.match(/\/thiep\/([A-Za-z2-9]{8})\/quanly/) || [])[1]?.toUpperCase();
  const token = new URLSearchParams(location.hash.slice(1)).get('k');
  let card = null, config = { price: 29, paymentsReady: false }, wallet = null, walletToken = null, polling = 0, publishing = false;

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
    $('native-share').hidden = !navigator.share;
    $('manage-url').value = `${location.origin}/thiep/${code}/quanly#k=${token}`;
    $('owner-email').value = card.ownerEmail || '';
    $('price').textContent = money(config.price * 1000);
    $('publish').textContent = `Xuất bản · ${money(config.price * 1000)}`;
    if (card.status === 'disabled') { $('load-error').hidden = false; $('load-error').textContent = 'Thiệp này đã bị gỡ vì vi phạm điều khoản. Nếu bạn nghĩ có nhầm lẫn, hãy liên hệ quản trị.'; }
    pushPreview();
  }
  function remember() {
    const list = (readJson(LIST_KEY) || []).filter(x => x.code !== code);
    list.unshift({ code, token, name: card.content.nickname, createdMs: card.createdMs });
    writeJson(LIST_KEY, list.slice(0, 20));
  }

  /* ---------- wallet and publishing ---------- */
  async function loadWallet() {
    if (!config.paymentsReady) { $('wallet-balance').textContent = 'chưa bật'; return null; }
    if (walletToken) {
      try { wallet = await withWallet('/api/game/wallet'); } catch (_) { wallet = null; walletToken = null; }
    }
    if (!wallet) {
      const created = await api('/api/game/wallets', { method: 'POST' });
      walletToken = created.token; wallet = created;
      try { localStorage.setItem(WALLET_KEY, walletToken); } catch (_) { /* private mode */ }
    }
    $('wallet-balance').textContent = `${wallet.balance} xu`;
    return wallet;
  }
  async function publish() {
    if (publishing) return;
    publishing = true; $('publish').disabled = true;
    try {
      if (!config.paymentsReady) throw new Error('Thanh toán chưa được bật trên máy chủ này.');
      await loadWallet();
      if (wallet.balance < config.price) return startTopup();
      say('pub-status', 'Đang xuất bản…');
      const key = `locly-card-publish-${code}`;
      let attempt; try { attempt = localStorage.getItem(key); } catch (_) { attempt = null; }
      if (!attempt) { attempt = requestId(); try { localStorage.setItem(key, attempt); } catch (_) { /* private mode */ } }
      const body = await api(`/api/thiep/cards/${code}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: attempt }) }, { 'X-Card-Token': token, 'X-Wallet-Token': walletToken });
      try { localStorage.removeItem(key); localStorage.removeItem(`locly-card-topup-${code}`); } catch (_) { /* private mode */ }
      card = body.card; stopPolling(); $('qr').hidden = true;
      say('pub-status', '');
      render();
      $('share-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (error.status === 409 && /xu/.test(error.message)) return startTopup();
      say('pub-status', error.message, true);
    } finally { publishing = false; $('publish').disabled = false; }
  }
  async function startTopup() {
    try {
      const donationConfig = await api('/api/donations/config').catch(() => ({ ready: false }));
      if (!donationConfig.ready) throw new Error('Chuyển khoản đang tạm dừng, bạn thử lại sau nhé.');
      const missingXu = Math.max(1, config.price - (wallet?.balance || 0));
      const amount = Math.max(1000, missingXu * 1000 - (wallet?.remainder || 0));
      const key = `locly-card-topup-${code}`;
      let saved = readJson(key);
      if (!saved || saved.amount !== amount) {
        const created = await withWallet('/api/donations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: card.content.nickname.slice(0, 40), amount, requestId: requestId() }) });
        saved = created; writeJson(key, saved);
      }
      $('qr').hidden = false;
      $('qr-img').src = saved.qrUrl; $('qr-bank').textContent = saved.bank; $('qr-account').textContent = saved.account;
      $('qr-name').textContent = saved.accountName; $('qr-amount').textContent = money(saved.amount); $('qr-code').textContent = saved.code;
      say('pub-status', `Ví còn thiếu ${missingXu} xu. Chuyển khoản ${money(saved.amount)} theo mã bên dưới, tiền về là thiệp tự xuất bản.`);
      startPolling(saved.token);
    } catch (error) { say('pub-status', error.message, true); }
  }
  function stopPolling() { clearInterval(polling); polling = 0; }
  function startPolling(donationToken) {
    stopPolling();
    polling = setInterval(async () => {
      try {
        const status = await withWallet('/api/donations/status', { headers: { 'X-Donation-Token': donationToken } });
        if (status.status === 'paid') {
          stopPolling();
          try { localStorage.removeItem(`locly-card-topup-${code}`); } catch (_) { /* private mode */ }
          say('pub-status', 'Đã nhận tiền! Đang xuất bản…');
          wallet = null; await loadWallet(); publish();
        }
      } catch (_) { /* keep waiting through short network blips */ }
    }, 3000);
  }

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
  $('publish').addEventListener('click', publish);
  $('copy-share').addEventListener('click', e => copy($('share-url').value, e.currentTarget));
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
        loadWallet().catch(() => { $('wallet-balance').textContent = '—'; });
        const pending = readJson(`locly-card-topup-${code}`);
        if (pending?.token && config.paymentsReady) {
          $('qr').hidden = false; $('qr-img').src = pending.qrUrl; $('qr-bank').textContent = pending.bank; $('qr-account').textContent = pending.account;
          $('qr-name').textContent = pending.accountName; $('qr-amount').textContent = money(pending.amount); $('qr-code').textContent = pending.code;
          say('pub-status', 'Đang chờ tiền về cho lần chuyển khoản trước…');
          startPolling(pending.token);
        }
        if (!config.paymentsReady) say('pub-status', 'Thanh toán chưa được bật trên máy chủ này.', true);
      }
    } catch (error) {
      $('load-error').hidden = false; $('load-error').textContent = error.message;
      $('title').textContent = 'Không mở được thiệp';
    }
  }
  start();
})();
