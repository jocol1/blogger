(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DAY_START = new Date('2026-12-08T11:30:00+07:00').getTime();
  const DAY_END = new Date('2026-12-08T13:00:00+07:00').getTime();
  const pad = n => String(n).padStart(2, '0');

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
      tiles.textContent = now < DAY_END ? 'Lễ tốt nghiệp đang diễn ra!' : 'Lễ tốt nghiệp đã diễn ra, cảm ơn mọi người đã chung vui!';
      note.textContent = 'Thứ Ba, 8 tháng 12 · 11:30 – 13:00';
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

  /* December 2026, weeks start on Monday */
  const grid = document.getElementById('cal-grid');
  const first = (new Date(2026, 11, 1).getDay() + 6) % 7;
  let html = '';
  for (let i = 0; i < first; i++) html += '<span></span>';
  for (let d = 1; d <= 31; d++) html += `<span${d === 8 ? ' class="is-bday"' : ''}>${d}</span>`;
  grid.insertAdjacentHTML('beforeend', html);

  /* add to calendar: an all-day event */
  document.getElementById('add-cal').addEventListener('click', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//locly//sinh-nhat//VI', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:tot-nghiep-thao-dan-0812@locly',
      'DTSTAMP:20261029T000000Z',
      'DTSTART:20261208T043000Z', 'DTEND:20261208T060000Z',
      'SUMMARY:Lễ tốt nghiệp Thảo Đan 🎓',
      'LOCATION:Sân tòa Thiên Lý\\, Trường Đại học Nông Lâm\\, khu phố 9\\, phường Linh Xuân\\, Thủ Đức\\, TP. Hồ Chí Minh',
      'DESCRIPTION:Chung vui lễ tốt nghiệp đại học của Nguyễn Quỳnh Thảo Đan. Bãi giữ xe: 60V Linh Trung\\, Linh Xuân (Bãi giữ xe Sinh viên Nông Lâm số 1).',
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Mai là lễ tốt nghiệp của Thảo Đan', 'END:VALARM',
      'BEGIN:VALARM', 'TRIGGER:-PT90M', 'ACTION:DISPLAY', 'DESCRIPTION:11:30 lễ tốt nghiệp của Thảo Đan, nhớ xuất phát nhé', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'tot-nghiep-thao-dan.ics' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  /* sound: one audio context, made on the first tap */
  let audio = null;
  const ac = () => {
    if (!audio) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; audio = new A(); }
    if (audio.state === 'suspended') audio.resume();
    return audio;
  };
  /* Ode to Joy, played with soft tones */
  const music = document.getElementById('music');
  const label = music.querySelector('.music-label');
  const N = { G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99 };
  const SONG = [
    ['E5', 1], ['E5', 1], ['F5', 1], ['G5', 1], ['G5', 1], ['F5', 1], ['E5', 1], ['D5', 1],
    ['C5', 1], ['C5', 1], ['D5', 1], ['E5', 1], ['E5', 1.5], ['D5', .5], ['D5', 2],
    ['E5', 1], ['E5', 1], ['F5', 1], ['G5', 1], ['G5', 1], ['F5', 1], ['E5', 1], ['D5', 1],
    ['C5', 1], ['C5', 1], ['D5', 1], ['E5', 1], ['D5', 1.5], ['C5', .5], ['C5', 2]
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
    label.textContent = 'Đang phát…';
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
