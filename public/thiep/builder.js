(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('builder');
  const LIST_KEY = 'locly-cards';
  const DRAFT_KEY = 'locly-card-builder';
  const PALETTE_NAMES = { green: 'Xanh lá', pink: 'Hồng', purple: 'Tím', blue: 'Xanh dương', yellow: 'Vàng', mono: 'Trắng đen', custom: 'Tự chọn' };
  let config = {
    price: 29,
    hardshipPrice: 19,
    palettes: {
      green: { bg: '#e3f5e8', card: '#fffdf6', accent: '#2e9e6e', ink: '#1f3d2e' }, pink: { bg: '#ffe9f0', card: '#fffafb', accent: '#d9487a', ink: '#4a2333' },
      purple: { bg: '#efe8ff', card: '#fdfbff', accent: '#7656dd', ink: '#2e2450' }, blue: { bg: '#e3f1ff', card: '#fbfdff', accent: '#2a78c8', ink: '#1d3350' },
      yellow: { bg: '#fff4d6', card: '#fffdf5', accent: '#c47f00', ink: '#3f2f0c' }, mono: { bg: '#efefef', card: '#ffffff', accent: '#222222', ink: '#151515' },
    },
  };
  const MODULES = ['info', 'countdown', 'calendar', 'wishes', 'music', 'cap'];
  let look = { palette: 'green', colors: { ...config.palettes.green }, font: 'cute', portrait: { type: 'icon', icon: 'cap' }, modules: Object.fromEntries(MODULES.map(m => [m, true])) };
  let venuePhotoId = null;
  let editing = null; // { code, token }
  let busy = false;
  const ready = new Set();

  /* ---------- small helpers ---------- */
  const say = (text, bad) => { $('save-status').textContent = text; $('save-status').classList.toggle('is-bad', Boolean(bad)); };
  const readJson = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } };
  const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* private mode */ } };
  const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const defaultDate = () => localDate(new Date(Date.now() + 14 * 86400_000));
  const isHttps = v => /^https:\/\//i.test(v || '');
  const money = xu => `${(xu * 1000).toLocaleString('vi-VN')}đ`;
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const lum = hex => { const [r, g, b] = rgb(hex).map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (editing) headers['X-Card-Token'] = editing.token;
    const res = await fetch(url, { ...options, headers, cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || 'Máy chủ đang bận, bạn thử lại nhé.'), { status: res.status });
    return body;
  }

  /* ---------- form <-> data ---------- */
  function readContent() {
    const value = name => (form.elements[name]?.value || '').trim();
    return {
      nickname: value('nickname'), fullName: value('fullName'), school: value('school'), major: value('major'),
      headline: value('headline'), invite: value('invite'), date: value('date'), start: value('start'), end: value('end'),
      venue: { name: value('venue.name'), address: value('venue.address'), mapUrl: value('venue.mapUrl'), photoId: venuePhotoId },
      parking: { name: value('parking.name'), address: value('parking.address'), mapUrl: value('parking.mapUrl') },
      contacts: [0, 1].map(i => ({ name: value(`contacts.${i}.name`), note: value(`contacts.${i}.note`), phone: value(`contacts.${i}.phone`) })),
    };
  }
  function fillForm(c) {
    const set = (name, v) => { if (form.elements[name]) form.elements[name].value = v || ''; };
    ['nickname', 'fullName', 'school', 'major', 'headline', 'invite', 'date', 'start', 'end'].forEach(k => set(k, c[k]));
    ['name', 'address', 'mapUrl'].forEach(k => { set(`venue.${k}`, c.venue?.[k]); set(`parking.${k}`, c.parking?.[k]); });
    [0, 1].forEach(i => ['name', 'note', 'phone'].forEach(k => set(`contacts.${i}.${k}`, c.contacts?.[i]?.[k])));
    venuePhotoId = c.venue?.photoId || null;
  }
  function fillLook(l) {
    look = { palette: l.palette || 'custom', colors: { ...l.colors }, font: l.font || 'cute', portrait: l.portrait || { type: 'icon', icon: 'cap' }, modules: { ...look.modules, ...(l.modules || {}) } };
  }

  // What the preview shows: the form as typed, with gentle fallbacks so it never looks broken.
  function previewCard() {
    const c = readContent();
    const okTime = t => /^\d{2}:\d{2}$/.test(t);
    const start = okTime(c.start) ? c.start : '08:00';
    return {
      code: editing?.code || '', status: 'draft',
      content: {
        ...c,
        nickname: c.nickname || 'Tên của bạn',
        headline: c.headline || 'Lễ tốt nghiệp',
        date: /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : defaultDate(),
        start, end: okTime(c.end) && c.end > start ? c.end : '',
        venue: { ...c.venue, mapUrl: isHttps(c.venue.mapUrl) ? c.venue.mapUrl : '' },
        parking: { ...c.parking, mapUrl: isHttps(c.parking.mapUrl) ? c.parking.mapUrl : '' },
        contacts: c.contacts.filter(p => p.name || p.phone),
      },
      look,
    };
  }
  const demoCard = () => ({
    code: '', status: 'draft',
    content: { nickname: 'Minh Anh', fullName: 'Trần Minh Anh', headline: 'Lễ tốt nghiệp', school: 'Trường Đại học của bạn', major: 'Ngành học của bạn', invite: '', date: defaultDate(), start: '08:30', end: '11:00',
      venue: { name: 'Hội trường A', address: 'Khuôn viên trường', mapUrl: '', photoId: null }, parking: { name: '', address: '', mapUrl: '' }, contacts: [{ name: 'Minh Anh', note: 'tân cử nhân', phone: '0900 000 000' }] },
    look: { palette: 'pink', colors: { ...config.palettes.pink }, font: 'cute', portrait: { type: 'icon', icon: 'bouquet' }, modules: Object.fromEntries(MODULES.map(m => [m, true])) },
  });

  let timer = 0;
  function changed() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      push();
      if (!editingFromLink) writeJson(DRAFT_KEY, { content: readContent(), look, editing });
    }, 150);
  }
  function push() {
    const frame = $('preview');
    if (ready.has(frame.contentWindow)) frame.contentWindow.postMessage({ type: 'card-preview', card: previewCard() }, location.origin);
  }
  // The frame may finish loading before this script listens, so also hook its load event.
  function hookFrame(frame, send) {
    if (!frame) return;
    const mark = () => { ready.add(frame.contentWindow); send(); };
    frame.addEventListener('load', mark);
    try { if (frame.contentDocument?.readyState === 'complete' && frame.contentWindow.location.pathname === '/thiep/xem-truoc') mark(); } catch (_) { /* not loaded yet */ }
  }
  hookFrame($('preview'), push);
  hookFrame($('demo-frame'), () => $('demo-frame').contentWindow.postMessage({ type: 'card-preview', card: demoCard() }, location.origin));
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.data?.type !== 'card-preview-ready') return;
    ready.add(event.source);
    if (event.source === $('preview').contentWindow) push();
    else if (event.source === $('demo-frame')?.contentWindow) event.source.postMessage({ type: 'card-preview', card: demoCard() }, location.origin);
  });

  /* ---------- look controls ---------- */
  function renderSwatches() {
    const box = $('swatches');
    box.replaceChildren(...[...Object.keys(config.palettes), 'custom'].map(key => {
      const label = document.createElement('label'); label.className = 'swatch';
      const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'palette', value: key, checked: look.palette === key });
      input.setAttribute('aria-label', PALETTE_NAMES[key] || key);
      const span = document.createElement('span');
      const dot = document.createElement('i');
      const colors = key === 'custom' ? look.colors : config.palettes[key];
      ['bg', 'card', 'accent', 'ink'].forEach(k => { const b = document.createElement('b'); b.style.background = colors[k]; dot.append(b); });
      span.append(dot, document.createTextNode(PALETTE_NAMES[key] || key));
      label.append(input, span);
      return label;
    }));
  }
  function syncColorInputs() {
    document.querySelectorAll('[data-color]').forEach(input => { input.value = look.colors[input.dataset.color]; });
    const textRatio = contrast(look.colors.ink, look.colors.card);
    const pageRatio = contrast(look.colors.ink, look.colors.bg);
    const warn = $('contrast-warn');
    warn.hidden = textRatio >= 4.5 && pageRatio >= 3;
    warn.textContent = `Màu chữ hơi khó đọc trên nền này (độ tương phản ${Math.min(textRatio, pageRatio).toFixed(1)}:1). Bạn chọn màu chữ đậm hơn hoặc nền nhạt hơn nhé.`;
  }
  function renderIcons() {
    const icons = window.CARD_ICONS || {};
    $('icons').replaceChildren(...Object.entries(icons).map(([key, icon]) => {
      const label = document.createElement('label'); label.className = 'icon-opt'; label.title = icon.label;
      const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'icon', value: key, checked: look.portrait.type === 'icon' && look.portrait.icon === key });
      input.setAttribute('aria-label', icon.label);
      const span = document.createElement('span'); span.innerHTML = icon.svg; // trusted, bundled artwork
      label.append(input, span);
      return label;
    }));
    // Icons use the card's colours in the preview; here a neutral set keeps them readable.
    $('icons').style.setProperty('--accent', look.colors.accent);
  }
  function renderPortrait() {
    const box = $('portrait-box');
    if (look.portrait.type === 'photo') {
      const img = document.createElement('img'); img.src = `/thiep/anh/${look.portrait.photoId}.webp`; img.alt = 'Ảnh đã tải lên';
      box.replaceChildren(img);
    } else {
      box.innerHTML = window.CARD_ICONS?.[look.portrait.icon]?.svg || '';
    }
    $('portrait-clear').hidden = look.portrait.type !== 'photo';
    document.querySelectorAll('#icons input').forEach(i => { i.checked = look.portrait.type === 'icon' && i.value === look.portrait.icon; });
    $('venue-clear').hidden = !venuePhotoId;
    $('venue-name').textContent = venuePhotoId ? 'Đã có ảnh địa điểm' : '';
  }
  function syncLookControls() {
    renderSwatches(); syncColorInputs(); renderPortrait();
    document.querySelectorAll('input[name="font"]').forEach(i => { i.checked = i.value === look.font; });
    document.querySelectorAll('[data-module]').forEach(i => { i.checked = look.modules[i.dataset.module] !== false; });
  }

  $('swatches').addEventListener('change', e => {
    if (e.target.name !== 'palette') return;
    look.palette = e.target.value;
    if (look.palette !== 'custom') look.colors = { ...config.palettes[look.palette] };
    syncColorInputs(); renderIcons(); renderPortrait(); changed();
  });
  document.querySelectorAll('[data-color]').forEach(input => input.addEventListener('input', () => {
    look.colors[input.dataset.color] = input.value.toLowerCase();
    look.palette = 'custom';
    document.querySelectorAll('input[name="palette"]').forEach(r => { r.checked = r.value === 'custom'; });
    syncColorInputs(); changed();
  }));
  document.querySelectorAll('input[name="font"]').forEach(i => i.addEventListener('change', () => { look.font = i.value; changed(); }));
  document.querySelectorAll('[data-module]').forEach(i => i.addEventListener('change', () => { look.modules[i.dataset.module] = i.checked; changed(); }));
  $('icons').addEventListener('change', e => { if (e.target.name === 'icon') { look.portrait = { type: 'icon', icon: e.target.value }; renderPortrait(); changed(); } });
  $('portrait-clear').addEventListener('click', () => { look.portrait = { type: 'icon', icon: 'cap' }; renderPortrait(); changed(); });
  $('venue-clear').addEventListener('click', () => { venuePhotoId = null; renderPortrait(); changed(); });
  form.addEventListener('input', e => { if (e.target.name && !['palette', 'icon', 'font'].includes(e.target.name)) { e.target.closest('.field')?.classList.remove('is-bad'); changed(); } });

  /* ---------- saving ---------- */
  function problem() {
    const c = readContent();
    const bad = name => { form.elements[name]?.closest('.field')?.classList.add('is-bad'); form.elements[name]?.focus(); };
    if (!c.nickname) { bad('nickname'); return 'Bạn nhập tên hiển thị trên thiệp nhé.'; }
    if (!c.date) { bad('date'); return 'Bạn chọn ngày tổ chức nhé.'; }
    if (!c.start) { bad('start'); return 'Bạn chọn giờ bắt đầu nhé.'; }
    if (c.end && c.end <= c.start) { bad('end'); return 'Giờ kết thúc phải sau giờ bắt đầu.'; }
    for (const name of ['venue.mapUrl', 'parking.mapUrl']) if (form.elements[name].value.trim() && !isHttps(form.elements[name].value.trim())) { bad(name); return 'Link bản đồ phải bắt đầu bằng https://'; }
    return '';
  }
  const payload = () => ({ content: { ...readContent(), contacts: readContent().contacts.filter(p => p.name || p.phone) }, look });
  function remember(card, token) {
    const list = (readJson(LIST_KEY) || []).filter(x => x.code !== card.code);
    list.unshift({ code: card.code, token, name: card.content.nickname, createdMs: card.createdMs || Date.now() });
    writeJson(LIST_KEY, list.slice(0, 20));
  }
  async function ensureSaved() {
    if (editing) return;
    const issue = problem();
    if (issue) throw new Error(issue);
    const body = await api('/api/thiep/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
    editing = { code: body.card.code, token: body.ownerToken };
    remember(body.card, body.ownerToken);
    writeJson(DRAFT_KEY, { content: readContent(), look, editing });
    showManageLink();
  }
  function showManageLink() {
    if (!editing) return;
    const link = $('open-manage');
    link.href = `/thiep/${editing.code}/quanly#k=${editing.token}`;
    link.hidden = false;
    $('save').textContent = 'Lưu thay đổi';
  }

  $('save').addEventListener('click', async () => {
    if (busy) return;
    const issue = problem();
    if (issue) return say(issue, true);
    busy = true; $('save').disabled = true; say('Đang lưu…');
    try {
      const firstTime = !editing;
      if (firstTime) await ensureSaved();
      else {
        const body = await api(`/api/thiep/cards/${editing.code}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
        remember(body.card, editing.token);
      }
      if (firstTime) { location.href = `/thiep/${editing.code}/quanly#k=${editing.token}`; return; }
      say(`Đã lưu lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (error) {
      say(error.message, true);
    } finally { busy = false; $('save').disabled = false; }
  });

  async function uploadFrom(input, apply) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return say('Ảnh tối đa 5 MB.', true);
    try {
      say('Đang tải ảnh…');
      await ensureSaved();
      const data = new FormData(); data.append('image', file);
      const body = await api(`/api/thiep/cards/${editing.code}/images`, { method: 'POST', body: data });
      apply(body.id);
      renderPortrait(); changed();
      say('Đã tải ảnh. Nhớ bấm Lưu thay đổi nhé.');
    } catch (error) { say(error.message, true); }
  }
  $('portrait-file').addEventListener('change', e => uploadFrom(e.target, imageId => { look.portrait = { type: 'photo', photoId: imageId }; }));
  $('venue-file').addEventListener('change', e => uploadFrom(e.target, imageId => { venuePhotoId = imageId; }));

  /* ---------- my cards ---------- */
  function renderMine() {
    const list = readJson(LIST_KEY) || [];
    $('mine-link').hidden = list.length === 0;
    $('thiep-cua-toi').hidden = list.length === 0;
    $('mycards').replaceChildren(...list.map(item => {
      const a = document.createElement('a');
      a.href = `/thiep/${item.code}/quanly#k=${item.token}`;
      const name = document.createElement('b'); name.textContent = item.name || item.code;
      const code = document.createElement('span'); code.className = 'hint'; code.textContent = item.code;
      a.append(name, code);
      return a;
    }));
  }

  /* ---------- start ---------- */
  let editingFromLink = false;
  async function start() {
    try { const remote = await api('/api/thiep/config'); config = { ...config, ...remote }; } catch (_) { /* fall back to built-in palettes */ }
    $('price-label').textContent = money(config.price);
    $('hardship-label').textContent = money(config.hardshipPrice);
    $('plan-price').textContent = money(config.price);
    $('plan-hardship').textContent = money(config.hardshipPrice);
    if (config.supportUrl) document.querySelectorAll('.support-link').forEach(a => { a.href = config.supportUrl; });
    renderIcons();
    const hash = new URLSearchParams(location.hash.slice(1));
    const code = hash.get('c'), token = hash.get('k');
    if (code && token) {
      editingFromLink = true;
      editing = { code, token };
      try {
        const { card } = await api(`/api/thiep/cards/${encodeURIComponent(code)}`);
        fillForm(card.content); fillLook(card.look);
        remember(card, token); showManageLink();
        say('Đang sửa thiệp đã lưu.');
        document.getElementById('tao').scrollIntoView();
      } catch (error) { editing = null; editingFromLink = false; say(error.message, true); }
    } else {
      const draft = readJson(DRAFT_KEY);
      if (draft?.content) { fillForm(draft.content); if (draft.look) fillLook(draft.look); if (draft.editing) { editing = draft.editing; showManageLink(); } }
      if (!form.elements.date.value) form.elements.date.value = defaultDate();
      if (!form.elements.start.value) form.elements.start.value = '08:00';
    }
    renderIcons(); syncLookControls(); renderMine(); push();
  }
  start();
})();
