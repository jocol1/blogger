(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // start the intro once fonts are in, so the title does not jump
  const go = () => requestAnimationFrame(() => document.documentElement.classList.add('loaded'));
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1200))]).then(go); else go();

  // birthday: 3 Nov 2026, Vietnam time
  const DAY_START = new Date('2026-11-03T00:00:00+07:00').getTime();
  const DAY_END = DAY_START + 24 * 3600 * 1000;

  // countdown
  const main = document.getElementById('cd-main');
  const sub = document.getElementById('cd-sub');
  let first = true;
  function countUp(n, unit) {
    const t0 = performance.now() + 900, dur = 900;
    const step = now => {
      const k = Math.min(1, Math.max(0, (now - t0) / dur));
      main.textContent = 'Còn ' + Math.round(n * (1 - Math.pow(1 - k, 3))) + unit;
      if (k < 1) requestAnimationFrame(step); else document.getElementById('countdown').classList.add('is-pop');
    };
    main.textContent = 'Còn 0' + unit;
    requestAnimationFrame(step);
  }
  function tick() {
    const now = Date.now();
    if (now >= DAY_END) { main.textContent = 'Chúc mừng sinh nhật Đan'; sub.textContent = 'hẹn năm sau nhé'; return; }
    if (now >= DAY_START) { main.textContent = 'Hôm nay là sinh nhật Đan'; sub.textContent = 'gửi cho Đan một lời chúc nhé'; return; }
    const left = DAY_START - now;
    const d = Math.floor(left / 86400000);
    const h = Math.floor(left % 86400000 / 3600000);
    const unit = d > 0 ? ' ngày' : ' giờ', n = d > 0 ? d : h;
    if (first && !reduce && n > 1) countUp(n, unit); else main.textContent = 'Còn ' + n + unit;
    first = false;
    sub.textContent = 'đến sinh nhật Đan';
  }
  tick();
  setInterval(tick, 60000);

  // entrances, staggered per section
  const groups = [
    '.invite-note, .invite-date, .countdown, .invite-foot .link',
        '.about h2, .about-big, .about-text, .about-actions, .pic-tall, .pic-square',
    '.reply-lead, .reply-card',
    '.back-msg p, .back-addr'
  ];
  const targets = [];
  groups.forEach(sel => {
    document.querySelectorAll(sel).forEach((el, i) => {
      el.classList.add('rise');
      el.style.setProperty('--d', `${(sel === groups[0] ? 750 : 0) + Math.min(i, 6) * 90}ms`);
      targets.push(el);
    });
  });
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(el => io.observe(el));
  } else {
    targets.forEach(el => el.classList.add('in'));
  }

  // pinned story: swap photo and words as the section scrolls past
  const story = document.querySelector('.story');
  const photos = [...document.querySelectorAll('.story-photos > *')];
  const bloom = document.querySelector('.story-photos video');
  if (bloom && reduce) bloom.pause();
  const steps = [...document.querySelectorAll('.step')];
  steps.forEach(s => {
    const t = s.querySelector('.step-title');
    const words = t.textContent.trim().split(' ');
    t.setAttribute('aria-label', t.textContent.trim());
    t.innerHTML = words.map((w, i) => '<span class="w" aria-hidden="true" style="--i:' + i + '">' + w + '</span>').join(' ');
  });
  let current = 0;
  function show(i) {
    if (i === current) return;
    current = i;
    photos.forEach((p, k) => p.classList.toggle('is-on', k === i));
    steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
  }
  let queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const r = story.getBoundingClientRect();
      const span = r.height - innerHeight;
      if (span <= 0) return;
      const p = Math.min(0.999, Math.max(0, -r.top / span));
      show(Math.min(steps.length - 1, Math.floor(p * steps.length)));
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  // wish card: write the message, then share or copy it
  const form = document.getElementById('wish');
  const out = document.getElementById('reply-out');
  const text = document.getElementById('reply-text');
  const hint = document.getElementById('reply-hint');
  const copyBtn = document.getElementById('reply-copy');
  const nameInput = document.getElementById('wish-name');
  const wishInput = document.getElementById('wish-text');

  function compose() {
    const name = nameInput.value.trim();
    const wish = wishInput.value.trim() || 'Chúc Đan một sinh nhật thật vui và thật nhiều điều đẹp nhé!';
    return 'Chúc mừng sinh nhật Thảo Đan! ' + wish + (name ? ' — ' + name : '');
  }

  async function copy(value) {
    try { await navigator.clipboard.writeText(value); return true; } catch (_) { /* fall through */ }
    const area = document.createElement('textarea');
    area.value = value; area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.appendChild(area); area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    area.remove();
    return ok;
  }
  const copied = 'Đã sao chép. Dán vào Zalo hoặc tin nhắn gửi Đan nhé.';
  const manual = 'Bạn chọn đoạn trên, sao chép rồi gửi Đan nhé.';

  form.addEventListener('submit', async event => {
    event.preventDefault();
    out.hidden = false;
    if (!nameInput.value.trim()) { nameInput.focus(); text.textContent = 'Bạn cho Đan biết tên bạn nhé.'; hint.textContent = ''; return; }
    const message = compose();
    const b = document.getElementById('wish-send').getBoundingClientRect();
    window.fx && window.fx.confetti(b.left + b.width / 2, b.top + b.height / 2, 110);
    text.textContent = message;
    if (navigator.share) {
      try { await navigator.share({ text: message }); hint.textContent = 'Đã mở danh sách ứng dụng để bạn gửi cho Đan.'; return; } catch (err) { if (err && err.name === 'AbortError') { hint.textContent = ''; return; } }
    }
    hint.textContent = (await copy(message)) ? copied : manual;
  });
  copyBtn.addEventListener('click', async () => {
    hint.textContent = (await copy(text.textContent)) ? copied : manual;
  });

  if (Date.now() >= DAY_START && Date.now() < DAY_END) setTimeout(() => window.fx && window.fx.confetti(innerWidth / 2, innerHeight * 0.4, 140), 1800);
})();
