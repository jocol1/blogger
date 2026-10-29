(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DAY_START = new Date('2026-11-03T00:00:00+07:00').getTime();
  const DAY_END = DAY_START + 24 * 3600 * 1000;
  const pad = n => String(n).padStart(2, '0');
  const burst = (el, n) => {
    const r = el.getBoundingClientRect();
    if (window.fx) window.fx.confetti(r.left + r.width / 2, r.top + r.height / 2, n);
  };

  /* section entrances, staggered */
  const secItems = [];
  document.querySelectorAll('.sec').forEach(sec => {
    [...sec.children].forEach((el, i) => { el.style.setProperty('--d', `${i * 90}ms`); secItems.push(el); });
  });
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.1 });
    secItems.forEach(el => io.observe(el));
  } else secItems.forEach(el => el.classList.add('in'));

  /* countdown tiles, every second */
  const tiles = document.getElementById('tiles');
  const note = document.getElementById('tiles-note');
  const cells = Object.fromEntries([...tiles.querySelectorAll('b')].map(b => [b.dataset.u, b]));
  function set(u, v) {
    const el = cells[u];
    if (el.textContent === v) return;
    el.textContent = v;
    if (!reduce) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); }
  }
  function tick() {
    const now = Date.now();
    if (now >= DAY_START) {
      tiles.classList.add('is-day');
      tiles.textContent = now < DAY_END ? 'Hôm nay là sinh nhật Đan!' : 'Sinh nhật Đan vừa qua, cảm ơn mọi người!';
      note.textContent = 'Ngày 3 tháng 11';
      return false;
    }
    const left = Math.floor((DAY_START - now) / 1000);
    set('d', String(Math.floor(left / 86400)));
    set('h', pad(Math.floor(left % 86400 / 3600)));
    set('m', pad(Math.floor(left % 3600 / 60)));
    set('s', pad(left % 60));
    return true;
  }
  if (tick()) { const timer = setInterval(() => { if (!tick()) clearInterval(timer); }, 1000); }

  /* November 2026, weeks start on Monday */
  const grid = document.getElementById('cal-grid');
  const first = (new Date(2026, 10, 1).getDay() + 6) % 7;
  let html = '';
  for (let i = 0; i < first; i++) html += '<span></span>';
  for (let d = 1; d <= 30; d++) html += `<span${d === 3 ? ' class="is-bday"' : ''}>${d}</span>`;
  grid.insertAdjacentHTML('beforeend', html);

  /* add to calendar: a yearly all-day event */
  document.getElementById('add-cal').addEventListener('click', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//locly//sinh-nhat//VI', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:sinh-nhat-thao-dan-0311@locly',
      'DTSTAMP:20261029T000000Z',
      'DTSTART;VALUE=DATE:20261103', 'DTEND;VALUE=DATE:20261104',
      'RRULE:FREQ=YEARLY',
      'SUMMARY:Sinh nhật Thảo Đan 🎂',
      'DESCRIPTION:Nhớ gửi lời chúc mừng sinh nhật Nguyễn Quỳnh Thảo Đan nhé!',
      'BEGIN:VALARM', 'TRIGGER:-PT15H', 'ACTION:DISPLAY', 'DESCRIPTION:Mai là sinh nhật Thảo Đan', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'sinh-nhat-thao-dan.ics' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  /* sound: one shared audio context, made on first tap */
  let audio = null;
  const ac = () => {
    if (!audio) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; audio = new A(); }
    if (audio.state === 'suspended') audio.resume();
    return audio;
  };
  function pop() {
    const a = ac(); if (!a) return;
    const len = Math.floor(a.sampleRate * 0.12);
    const buf = a.createBuffer(1, len, a.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1800; g.gain.value = 0.5;
    src.buffer = buf; src.connect(f).connect(g).connect(a.destination); src.start();
  }

  /* balloon game */
  const WORDS = ['Chúc', 'mừng', 'sinh', 'nhật', 'Thảo', 'Đan!'];
  const COLORS = ['#ff8fb1', '#ffc94d', '#8fd9c0', '#b9a6ff', '#7cc4ff', '#ff9f7a'];
  const box = document.getElementById('balloons');
  const words = document.getElementById('words');
  const reset = document.getElementById('bb-reset');
  const shape = '<svg viewBox="0 0 80 132" aria-hidden="true"><path d="M40 4C18 4 4 22 4 44c0 26 22 46 36 50 14-4 36-24 36-50C76 22 62 4 40 4z" fill="currentColor"/><path d="M34 93h12l-6 8z" fill="currentColor"/><path d="M40 101c-7 8 7 15 0 27" fill="none" stroke="#9bb3c9" stroke-width="2" stroke-linecap="round"/><ellipse cx="26" cy="28" rx="7" ry="12" fill="#fff" opacity=".45"/></svg>';
  let found = 0;
  function build() {
    found = 0;
    box.innerHTML = WORDS.map((_, i) =>
      `<button class="balloon" type="button" aria-label="Bóp quả bóng màu ${['hồng', 'vàng', 'xanh lá', 'tím', 'xanh dương', 'cam'][i]}" style="--c:${COLORS[i]};--d:${(-i * 0.55).toFixed(2)}s">${shape}</button>`
    ).join('');
    words.innerHTML = WORDS.map(() => '<span class="slot">?</span>').join('');
    reset.hidden = true;
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('.balloon');
    if (!b || b.classList.contains('is-popped')) return;
    b.classList.add('is-popped');
    pop();
    burst(b, 18);
    const slot = words.children[found];
    slot.textContent = WORDS[found];
    slot.classList.add('is-on');
    found++;
    if (found === WORDS.length) {
      setTimeout(() => {
        burst(words, 140);
        words.insertAdjacentHTML('beforeend', '<span class="game-done" style="flex-basis:100%">Xong rồi! Giờ gửi lời chúc thật cho Đan nhé.</span>');
        reset.hidden = false;
      }, 300);
    }
  });
  reset.addEventListener('click', build);
  build();

  /* Happy Birthday melody, played with soft tones */
  const music = document.getElementById('music');
  const label = music.querySelector('.music-label');
  const N = { G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99 };
  const SONG = [
    ['G4', .75], ['G4', .25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2],
    ['G4', .75], ['G4', .25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2],
    ['G4', .75], ['G4', .25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2],
    ['F5', .75], ['F5', .25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 3]
  ];
  let playing = null;
  function stop() {
    if (playing) { playing.gain.gain.cancelScheduledValues(0); playing.gain.disconnect(); clearTimeout(playing.timer); playing = null; }
    music.setAttribute('aria-pressed', 'false');
    label.textContent = 'Bật nhạc';
  }
  function play() {
    const a = ac(); if (!a) return;
    const out = a.createGain(); out.gain.value = 0.22; out.connect(a.destination);
    const beat = 0.42;
    let t = a.currentTime + 0.08;
    for (const [note, len] of SONG) {
      const dur = len * beat;
      for (const [type, mul, vol] of [['triangle', 1, 1], ['sine', 2, 0.25]]) {
        const o = a.createOscillator(), g = a.createGain();
        o.type = type; o.frequency.value = N[note] * mul;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.2, dur * 0.95));
        o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
      }
      t += dur;
    }
    playing = { gain: out, timer: setTimeout(stop, (t - a.currentTime) * 1000 + 200) };
    music.setAttribute('aria-pressed', 'true');
    label.textContent = 'Đang hát…';
  }
  music.addEventListener('click', () => { if (playing) stop(); else play(); });

  /* wish suggestions fill the message box */
  const chips = document.getElementById('chips');
  const wishText = document.getElementById('wish-text');
  chips.addEventListener('click', e => {
    const c = e.target.closest('button');
    if (!c) return;
    chips.querySelectorAll('button').forEach(x => x.classList.toggle('is-picked', x === c));
    wishText.value = c.textContent;
    wishText.focus();
  });
})();
