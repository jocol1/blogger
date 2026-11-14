(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);
  const boot = JSON.parse($('card-data').textContent || '{}');
  const preview = boot.mode === 'preview';
  let card = boot.card || null;
  // A personal link (?to=Minh%20Anh) greets one guest by name.
  const guest = boot.card?.invite?.name || (new URLSearchParams(location.search).get('to') || '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const NOTE_COLORS = ['#fff6c8', '#ffe1ea', '#dff3e6', '#e3ecff', '#f1e6ff', '#ffe9d6'];

  const FONTS = {
    cute: { href: 'family=Baloo+2:wght@600;700;800&family=Pacifico&family=Quicksand:wght@500;600;700', display: "'Baloo 2', system-ui, sans-serif", body: "'Quicksand', 'Segoe UI', sans-serif", script: "'Pacifico', cursive" },
    elegant: { href: 'family=Playfair+Display:wght@600;700;800&family=Be+Vietnam+Pro:wght@400;500;600;700&family=Dancing+Script:wght@600;700', display: "'Playfair Display', Georgia, serif", body: "'Be Vietnam Pro', 'Segoe UI', sans-serif", script: "'Dancing Script', cursive" },
    modern: { href: 'family=Be+Vietnam+Pro:wght@400;500;600;700;800', display: "'Be Vietnam Pro', 'Segoe UI', sans-serif", body: "'Be Vietnam Pro', 'Segoe UI', sans-serif", script: "'Be Vietnam Pro', 'Segoe UI', sans-serif" },
  };
  const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const pad = n => String(n).padStart(2, '0');

  /* ---------- colours ---------- */
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const toHex = parts => `#${parts.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lum = hex => { const [r, g, b] = rgb(hex).map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const textOn = hex => (contrast(hex, '#ffffff') >= contrast(hex, '#111111') ? '#ffffff' : '#111111');
  const fontsLoaded = new Set();

  function applyTheme(look) {
    const c = look.colors;
    const root = document.documentElement.style;
    const [r, g, b] = rgb(c.accent);
    const tokens = {
      '--bg': c.bg, '--bg-dot': mix(c.bg, c.ink, 0.08), '--card': c.card,
      '--accent': c.accent, '--accent-deep': mix(c.accent, '#000000', 0.22), '--accent-soft': mix(c.accent, '#ffffff', 0.86), '--accent-softer': mix(c.accent, '#ffffff', 0.94),
      '--accent-ink': textOn(c.accent), '--ink': c.ink, '--muted': mix(c.ink, c.card, 0.24), '--line': mix(c.accent, '#ffffff', 0.68),
      '--sec-a': mix(c.accent, '#ffffff', 0.93), '--sec-a-dot': mix(c.accent, '#ffffff', 0.84), '--sec-b': c.bg, '--sec-b-dot': mix(c.bg, c.ink, 0.08),
      '--shadow': `rgba(${r}, ${g}, ${b}, .22)`,
    };
    for (const [key, value] of Object.entries(tokens)) root.setProperty(key, value);
    const font = FONTS[look.font] || FONTS.cute;
    root.setProperty('--f-display', font.display); root.setProperty('--f-body', font.body); root.setProperty('--f-script', font.script);
    if (!fontsLoaded.has(font.href) && !document.querySelector(`link[data-font="${look.font}"]`)) {
      fontsLoaded.add(font.href);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${font.href}&display=swap`;
      document.head.appendChild(link);
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.bg);
  }

  /* ---------- dates (all in Vietnam time) ---------- */
  const parts = d => d.split('-').map(Number);
  const instant = (dateStr, timeStr) => new Date(`${dateStr}T${timeStr}:00+07:00`).getTime();
  const weekday = dateStr => { const [y, m, d] = parts(dateStr); return WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]; };
  const startMs = () => instant(card.content.date, card.content.start);
  const endMs = () => (card.content.end ? instant(card.content.date, card.content.end) : startMs() + 2 * 3600_000);
  const timeRange = c => (c.end ? `${c.start} – ${c.end}` : c.start);

  /* ---------- helpers ---------- */
  const get = (obj, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), obj);
  const show = (el, on) => { if (el) el.hidden = !on; };
  const telHref = phone => `tel:${phone.replace(/[^\d+]/g, '')}`;
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
  const burst = (node, n) => { const r = node.getBoundingClientRect(); window.fx?.confetti(r.left + r.width / 2, r.top + r.height / 2, n); };

  function decorate() {
    const spots = [[6, 12, 26], [88, 9, 22], [14, 72, 20], [80, 64, 30], [46, 4, 18], [94, 38, 18], [3, 42, 20], [70, 90, 22]];
    const glyphs = ['★', '★', '♥', '✦', '✦', '♥', '★', '♥'];
    $('deco').replaceChildren(...spots.map(([x, y, s], i) => {
      const span = el('span', null, glyphs[i]);
      span.style.left = `${x}%`; span.style.top = `${y}%`; span.style.fontSize = `${s}px`; span.style.animationDelay = `${-i * 0.8}s`;
      return span;
    }));
  }

  /* ---------- render ---------- */
  function render() {
    if (!card) return;
    const c = card.content;
    const m = card.look.modules;
    applyTheme(card.look);
    document.querySelectorAll('[data-text]').forEach(node => {
      const value = get(c, node.dataset.text) || '';
      node.textContent = value;
      if (node.id !== 'name') show(node, Boolean(value));
    });
    const name = $('name');
    name.setAttribute('aria-label', c.nickname);
    name.replaceChildren(...Array.from(c.nickname.normalize('NFC')).map((ch, i) => {
      if (ch === ' ') return document.createTextNode(' ');
      const span = el('span', 'ch', ch); span.setAttribute('aria-hidden', 'true'); span.style.setProperty('--i', i); return span;
    }));

    const [y, mo, d] = parts(c.date);
    const who = c.fullName || c.nickname;
    $('invite').textContent = c.invite || `${who} trân trọng kính mời bạn đến chung vui ngày tốt nghiệp`;
    $('date-label').textContent = `${weekday(c.date)}, ${d} tháng ${mo}`;
    $('time-label').textContent = timeRange(c);
    document.title = `${c.headline} · ${c.nickname}`;

    const portrait = $('portrait');
    if (card.look.portrait.type === 'photo') {
      portrait.classList.remove('is-icon');
      const img = el('img'); img.src = `/thiep/anh/${card.look.portrait.photoId}.webp`; img.alt = `Ảnh của ${c.nickname}`; img.fetchPriority = 'high'; img.decoding = 'async';
      portrait.replaceChildren(img);
    } else {
      portrait.classList.add('is-icon');
      portrait.innerHTML = (window.CARD_ICONS?.[card.look.portrait.icon] || window.CARD_ICONS?.cap)?.svg || '';
    }
    show($('cap'), m.cap); show($('hint'), m.cap);
    const heroBtn = $('hero-btn');
    if (m.info) { heroBtn.href = '#thong-tin'; heroBtn.textContent = 'Xem thông tin buổi lễ'; }
    else if (m.wishes) { heroBtn.href = '#loi-chuc'; heroBtn.textContent = 'Gửi lời chúc'; }
    show(heroBtn, m.info || m.wishes);

    // Info cards.
    show($('thong-tin'), m.info);
    const hasVenue = Boolean(c.venue.name || c.venue.address);
    show($('venue-card'), hasVenue);
    const map = $('venue-map');
    show(map, Boolean(c.venue.mapUrl)); if (c.venue.mapUrl) map.href = c.venue.mapUrl;
    const vPhoto = $('venue-photo');
    if (c.venue.photoId) { vPhoto.loading = 'lazy'; vPhoto.decoding = 'async'; vPhoto.src = `/thiep/anh/${c.venue.photoId}.webp`; vPhoto.alt = c.venue.name || 'Ảnh địa điểm'; }
    show(vPhoto, Boolean(c.venue.photoId));
    $('venue-card').classList.toggle('no-photo', !c.venue.photoId);
    $('info-time').textContent = timeRange(c);
    $('info-date').textContent = `${weekday(c.date)}, ngày ${d} tháng ${mo} năm ${y}`;
    const hasParking = Boolean(c.parking.name || c.parking.address);
    show($('parking-card'), hasParking);
    const pmap = $('parking-map');
    show(pmap, Boolean(c.parking.mapUrl)); if (c.parking.mapUrl) pmap.href = c.parking.mapUrl;
    $('contacts').replaceChildren(...c.contacts.map(person => {
      const row = el('div', 'call');
      const text = el('p');
      text.append(el('b', null, person.name || person.phone), el('span', null, [person.note, person.phone].filter(Boolean).join(' · ')));
      row.append(text);
      if (person.phone) { const a = el('a', 'btn btn-sm', 'Gọi'); a.href = telHref(person.phone); a.setAttribute('aria-label', `Gọi ${person.name || person.phone}`); row.append(a); }
      return row;
    }));
    show($('contact-card'), c.contacts.length > 0);
    const small = [true, hasParking, c.contacts.length > 0].filter(Boolean).length;
    document.querySelector('.info').dataset.cols = String(small);

    // Countdown, calendar, wishes, music.
    const forGuest = $('for-guest');
    forGuest.textContent = guest ? `Thân gửi ${guest}` : '';
    show(forGuest, Boolean(guest));
    const note = card.invite?.message || '';
    show($('guest-note'), Boolean(note));
    $('guest-note-text').textContent = note;
    $('guest-note-from').textContent = `— ${c.nickname}`;
    renderAlbum(c, m);
    show($('dem-nguoc'), m.countdown);
    $('tiles-note').textContent = `Tính đến ${c.start} ngày ${d} tháng ${mo}`;
    show($('lich'), m.calendar);
    $('cal-month').textContent = `Tháng ${mo} · ${y}`;
    $('cal').setAttribute('aria-label', `Lịch tháng ${mo} năm ${y}, ngày ${d} được khoanh tròn`);
    $('cal-title').textContent = `Khoanh tròn ngày ${d} nhé`;
    $('cal-text').textContent = `${weekday(c.date)}, ${timeRange(c)}${c.venue.name ? ` tại ${c.venue.name}` : ''}. Thêm vào lịch điện thoại để bạn không quên nhé.`;
    const grid = $('cal-grid');
    const heads = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(h => el('b', null, h));
    const first = (new Date(Date.UTC(y, mo - 1, 1, 12)).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(el('span'));
    for (let i = 1; i <= days; i++) cells.push(el('span', i === d ? 'is-day' : null, String(i)));
    grid.replaceChildren(...heads, ...cells);

    show($('loi-chuc'), m.wishes);
    loadWall();
    $('wish-sub').textContent = `Viết vài dòng thật dễ thương, ${c.nickname} sẽ vui lắm đó!`;
    const chips = [`Chúc mừng ${c.nickname} đã tốt nghiệp, giỏi quá đi!`, `Chúc ${c.nickname} bước vào đời thật rực rỡ và thành công!`, `Chúc ${c.nickname} luôn tự tin, mở ra thật nhiều điều mới!`, `Tự hào về ${c.nickname} lắm!`];
    $('chips').replaceChildren(...chips.map(text => { const b = el('button', null, text); b.type = 'button'; return b; }));
    show($('music'), m.music);

    $('foot-line').textContent = `Chúc mừng ${c.nickname} tốt nghiệp ♥ ${pad(d)}.${pad(mo)}`;
    const foot = $('foot-contact');
    foot.replaceChildren();
    c.contacts.filter(p => p.phone).forEach((p, i) => {
      if (i) foot.append(document.createTextNode(' · '));
      const a = el('a', null, p.phone); a.href = telHref(p.phone);
      foot.append(a, document.createTextNode(p.name ? ` (${p.name})` : ''));
    });
    show(foot, c.contacts.some(p => p.phone));
    tick();
  }

  /* ---------- countdown ---------- */
  function setTile(u, v) {
    const node = document.querySelector(`#tiles b[data-u="${u}"]`);
    if (!node || node.textContent === v) return;
    node.textContent = v;
    if (!reduce) { node.classList.remove('tick'); void node.offsetWidth; node.classList.add('tick'); }
  }
  function tick() {
    if (!card) return;
    const now = Date.now();
    const tiles = $('tiles');
    const hero = $('countdown');
    if (now >= endMs()) {
      hero.textContent = `Cảm ơn mọi người đã đến chung vui với ${card.content.nickname}!`;
      tiles.classList.add('is-day'); tiles.dataset.text = 'Buổi lễ đã diễn ra, cảm ơn mọi người!';
      tiles.textContent = tiles.dataset.text;
      return;
    }
    if (now >= startMs()) {
      hero.replaceChildren(el('strong', null, 'Buổi lễ đang diễn ra!'));
      tiles.classList.add('is-day'); tiles.textContent = 'Buổi lễ đang diễn ra!';
      return;
    }
    if (tiles.classList.contains('is-day')) {
      tiles.classList.remove('is-day');
      tiles.replaceChildren(...['d', 'h', 'm', 's'].map((u, i) => { const t = el('div', 'tile'); const b = el('b', null, '0'); b.dataset.u = u; t.append(b, el('span', null, ['ngày', 'giờ', 'phút', 'giây'][i])); return t; }));
    }
    const left = Math.floor((startMs() - now) / 1000);
    const days = Math.floor(left / 86400);
    setTile('d', String(days)); setTile('h', pad(Math.floor(left % 86400 / 3600))); setTile('m', pad(Math.floor(left % 3600 / 60))); setTile('s', pad(left % 60));
    hero.replaceChildren(document.createTextNode(days > 0 ? 'Còn ' : 'Chỉ còn '), el('strong', null, days > 0 ? `${days} ngày` : `${Math.floor(left / 3600)} giờ`), document.createTextNode(' nữa thôi!'));
  }

  /* ---------- calendar file ---------- */
  const icsText = value => String(value || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsTime = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const slug = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'thiep';
  function downloadIcs() {
    const c = card.content;
    const where = [c.venue.name, c.venue.address].filter(Boolean).join(', ');
    const notes = [`${c.fullName || c.nickname} mời bạn đến chung vui ngày tốt nghiệp.`, c.parking.name || c.parking.address ? `Gửi xe: ${[c.parking.name, c.parking.address].filter(Boolean).join(', ')}` : '', location.href.split('#')[0]].filter(Boolean).join('\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//locly//thiep-tot-nghiep//VI', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${card.code || 'xem-truoc'}-${c.date}@locly`, `DTSTAMP:${icsTime(Date.now())}`, `DTSTART:${icsTime(startMs())}`, `DTEND:${icsTime(endMs())}`,
      `SUMMARY:${icsText(`${c.headline} ${c.nickname}`)}`, ...(where ? [`LOCATION:${icsText(where)}`] : []), `DESCRIPTION:${icsText(notes)}`,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`Mai là ${c.headline.toLowerCase()} của ${c.nickname}`)}`, 'END:VALARM',
      'BEGIN:VALARM', 'TRIGGER:-PT90M', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`${c.start} ${c.headline.toLowerCase()} của ${c.nickname}`)}`, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${slug(c.headline)}-${slug(c.nickname)}.ics` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- music (Ode to Joy) ---------- */
  let audio = null, playing = null;
  const N = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99 };
  const SONG = [['E5', 1], ['E5', 1], ['F5', 1], ['G5', 1], ['G5', 1], ['F5', 1], ['E5', 1], ['D5', 1], ['C5', 1], ['C5', 1], ['D5', 1], ['E5', 1], ['E5', 1.5], ['D5', 0.5], ['D5', 2],
    ['E5', 1], ['E5', 1], ['F5', 1], ['G5', 1], ['G5', 1], ['F5', 1], ['E5', 1], ['D5', 1], ['C5', 1], ['C5', 1], ['D5', 1], ['E5', 1], ['D5', 1.5], ['C5', 0.5], ['C5', 2]];
  function stopMusic() {
    if (playing) { playing.gain.disconnect(); clearTimeout(playing.timer); playing = null; }
    $('music').setAttribute('aria-pressed', 'false'); $('music').querySelector('.music-label').textContent = 'Bật nhạc';
  }
  function playMusic() {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    audio ||= new A(); if (audio.state === 'suspended') audio.resume();
    const out = audio.createGain(); out.gain.value = 0.22; out.connect(audio.destination);
    let t = audio.currentTime + 0.08;
    for (const [note, len] of SONG) {
      const dur = len * 0.42;
      for (const [type, mul, vol] of [['triangle', 1, 1], ['sine', 2, 0.25]]) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = type; o.frequency.value = N[note] * mul;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.2, dur * 0.95));
        o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
      }
      t += dur;
    }
    playing = { gain: out, timer: setTimeout(stopMusic, (t - audio.currentTime) * 1000 + 200) };
    $('music').setAttribute('aria-pressed', 'true'); $('music').querySelector('.music-label').textContent = 'Đang phát…';
  }

  /* ---------- wishes ---------- */
  function wireWishes() {
    const form = $('wish'), status = $('wish-status'), send = $('wish-send');
    const say = (text, bad) => { status.textContent = text; status.classList.toggle('is-bad', Boolean(bad)); };
    $('chips').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $('chips').querySelectorAll('button').forEach(x => x.classList.toggle('is-picked', x === b));
      $('wish-text').value = b.textContent; $('wish-text').focus();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const name = $('wish-name').value.trim(), message = $('wish-text').value.trim(), attending = $('wish-attend').value;
      if (!name) { $('wish-name').focus(); return say('Bạn cho biết tên bạn nhé!', true); }
      if (!attending) { $('wish-attend').focus(); return say('Bạn chọn đến, không đến hay chưa chắc nhé!', true); }
      if (!message) { $('wish-text').focus(); return say('Bạn viết vài chữ chúc mừng nhé!', true); }
      if (preview) return say('Đây là bản xem trước nên lời chúc chưa được gửi.');
      send.disabled = true; say('Đang gửi…');
      try {
        const res = await fetch(`/api/thiep/cards/${encodeURIComponent(card.code)}/wishes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, message, attending, website: $('wish-website').value }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Chưa gửi được, bạn thử lại nhé.');
        const c = card.content;
        $('thanks-text').textContent = {
          yes: `Cảm ơn bạn đã chúc mừng ${c.nickname}. Hẹn gặp bạn lúc ${c.start} ngày ${parts(c.date)[2]}/${parts(c.date)[1]} nhé!`,
          no: `Cảm ơn bạn đã chúc mừng ${c.nickname}. Tiếc là bạn không đến được, ${c.nickname} vẫn rất vui vì bạn nhớ.`,
          maybe: `Cảm ơn bạn đã chúc mừng ${c.nickname}. Khi nào chắc chắn, bạn nhắn ${c.nickname} một tiếng nhé!`,
        }[attending];
        say(''); form.hidden = true; $('wish-thanks').hidden = false; burst($('wish-thanks'), 150);
        wallStamp = 0; loadWall();
      } catch (error) {
        say(error.message === 'Failed to fetch' ? 'Mất kết nối rồi, bạn thử lại nhé.' : error.message, true);
      } finally { send.disabled = false; }
    });
    $('wish-again').addEventListener('click', () => {
      $('wish-text').value = ''; $('wish-attend').value = '';
      $('wish-thanks').hidden = true; form.hidden = false; $('wish-text').focus();
    });
  }

  /* ---------- album ---------- */
  function renderAlbum(c, m) {
    const photos = Array.isArray(c.album) ? c.album : [];
    show($('album'), m.album !== false && photos.length > 0);
    const grid = $('album-grid');
    grid.dataset.count = String(photos.length);
    grid.replaceChildren(...photos.map((photoId, i) => {
      const button = el('button', 'polaroid'); button.type = 'button';
      button.setAttribute('aria-label', `Xem ảnh ${i + 1}`);
      const img = el('img'); img.loading = 'lazy'; img.decoding = 'async'; img.alt = `Ảnh kỷ niệm ${i + 1} của ${c.nickname}`;
      img.src = `/thiep/anh/${photoId}.webp`;
      button.append(img);
      button.addEventListener('click', () => openPhoto(img.src, img.alt));
      return button;
    }));
  }
  function openPhoto(src, alt) {
    const box = $('lightbox');
    $('lightbox-img').src = src; $('lightbox-img').alt = alt;
    if (box.showModal) box.showModal(); else window.open(src, '_blank', 'noopener');
  }

  /* ---------- wish wall ---------- */
  let wallStamp = 0;
  const SAMPLE_WALL = [
    { name: 'Minh Anh', message: 'Chúc mừng tân cử nhân! Bao năm cố gắng đã đơm hoa rồi nè.' },
    { name: 'Lan', message: 'Tự hào về bạn lắm. Hẹn gặp ở buổi lễ nha!' },
    { name: 'Hùng', message: 'Chúc bạn bước vào đời thật vững vàng và rực rỡ.' },
  ];
  async function loadWall() {
    const wall = $('wall');
    if (!card || card.look.modules.wall === false || card.look.modules.wishes === false) { show(wall, false); return; }
    if (Date.now() - wallStamp < 15_000) return;
    wallStamp = Date.now();
    let wishes = SAMPLE_WALL;
    if (!preview) {
      try {
        const res = await fetch(`/api/thiep/cards/${encodeURIComponent(card.code)}/wall`);
        wishes = res.ok ? (await res.json()).wishes || [] : [];
      } catch (_) { wishes = []; }
    }
    show(wall, wishes.length > 0);
    $('notes').replaceChildren(...wishes.map((w, i) => {
      const note = el('article', 'note');
      note.style.setProperty('--note', NOTE_COLORS[i % NOTE_COLORS.length]);
      note.style.setProperty('--tilt', `${((i * 37) % 5) - 2}deg`);
      note.style.setProperty('--i', i);
      note.append(el('p', null, w.message), el('b', null, w.name));
      if (w.createdMs) note.append(el('small', null, new Date(w.createdMs).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })));
      return note;
    }));
  }

  /* ---------- envelope ---------- */
  function showEnvelope(onOpen) {
    const stage = $('envelope');
    const c = card.content;
    const [, mo, d] = parts(c.date);
    $('env-to').textContent = guest ? `Gửi ${guest}` : 'Bạn có một thiệp mời';
    $('env-guest').textContent = `Gửi ${guest}`;
    $('env-guest').hidden = !guest;
    $('env-title').textContent = `${c.headline} · ${c.nickname}`;
    $('env-date').textContent = `${weekday(c.date)}, ${d}/${mo}`;
    stage.hidden = false;
    // Seal pops with confetti, flap opens, the letter slides out, then flies at the guest while
    // the card rises behind it. The tap counts as a gesture, so the music may start right away.
    const open = () => {
      if (stage.classList.contains('is-opening')) return;
      stage.classList.add('is-opening');
      if (card.look.modules.music !== false) playMusic();
      if (!reduce) burst($('env-open'), 70);
      try { sessionStorage.setItem(`thiep-mo-${card.code}`, '1'); } catch (_) { /* private mode */ }
      setTimeout(() => { stage.classList.add('is-zoom', 'is-done'); onOpen(); }, reduce ? 150 : 1250);
      setTimeout(() => { stage.hidden = true; }, reduce ? 300 : 2200);
    };
    $('env-open').addEventListener('click', open);
    $('envelope-box').addEventListener('click', e => { if (e.target.closest('.env-letter, .env-front, .env-flap')) open(); });
    $('env-open').focus({ preventScroll: true });
  }

  /* ---------- boot ---------- */
  function wireOnce() {
    decorate();
    let tossing = false;
    $('cap').addEventListener('click', () => {
      if (tossing) return; tossing = true;
      const cap = $('cap'), hint = $('hint');
      cap.classList.remove('is-tossed'); void cap.offsetWidth; cap.classList.add('is-tossed');
      hint.classList.add('is-yay'); hint.textContent = 'Tung mũ nào! Chúc mừng tân cử nhân!';
      setTimeout(() => burst(cap, 130), reduce ? 0 : 550);
      setTimeout(() => { tossing = false; hint.classList.remove('is-yay'); hint.textContent = 'Chạm vào chiếc mũ để tung lại nhé'; }, reduce ? 800 : 1700);
    });
    $('add-cal').addEventListener('click', downloadIcs);
    $('music').addEventListener('click', () => (playing ? stopMusic() : playMusic()));
    $('lightbox-close').addEventListener('click', () => $('lightbox').close());
    $('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightbox').close(); });
    if (guest) $('wish-name').value = guest;
    wireWishes();
    setInterval(tick, 1000);
    if ('IntersectionObserver' in window && !reduce) {
      const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.1 });
      document.querySelectorAll('.sec > *, .wish-card').forEach(node => { node.classList.add('js-reveal'); io.observe(node); });
    }
  }

  function start() {
    wireOnce();
    if (preview) {
      const note = el('div', 'preview-note', 'Bản xem trước'); document.body.appendChild(note);
      window.addEventListener('message', event => {
        if (event.origin !== location.origin || event.data?.type !== 'card-preview' || !event.data.card) return;
        const first = !card;
        card = event.data.card;
        render();
        $('app').hidden = false;
        if (first && !reduce) document.body.classList.add('anim');
      });
      window.parent?.postMessage({ type: 'card-preview-ready' }, location.origin);
      return;
    }
    if (!card) return;
    render();
    const reveal = () => {
      $('app').hidden = false;
      if (!reduce) document.body.classList.add('anim');
      setTimeout(() => burst($('cap'), 140), reduce ? 0 : 700);
    };
    let opened = false;
    try { opened = sessionStorage.getItem(`thiep-mo-${card.code}`) === '1'; } catch (_) { opened = false; }
    if (card.look.modules.envelope !== false && !opened) showEnvelope(reveal);
    else { $('app').hidden = false; if (!reduce) document.body.classList.add('anim'); }
    if (Date.now() >= startMs() && Date.now() < endMs()) setTimeout(() => burst($('cap'), 160), 1800);
  }
  start();
})();
