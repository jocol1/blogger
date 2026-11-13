(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const burst = (el, n) => {
    const r = el.getBoundingClientRect();
    if (window.fx) window.fx.confetti(r.left + r.width / 2, r.top + r.height / 2, n);
  };

  // pop the name in letter by letter
  const name = document.getElementById('name');
  const text = name.textContent.normalize('NFC');
  name.setAttribute('aria-label', text);
  name.innerHTML = Array.from(text).map((ch, i) =>
    ch === ' ' ? ' ' : `<span class="ch" aria-hidden="true" style="--i:${i}">${ch}</span>`
  ).join('');

  // start the intro once fonts are in, so nothing jumps
  const go = () => { void document.body.offsetWidth; document.documentElement.classList.add('loaded'); };
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1200))]).then(go);
  else go();

  // graduation: 8 Dec 2026, Vietnam time
  const DAY_START = new Date('2026-12-08T11:30:00+07:00').getTime();
  const DAY_END = new Date('2026-12-08T13:00:00+07:00').getTime();
  const countdown = document.getElementById('countdown');
  function tick() {
    const now = Date.now();
    if (now >= DAY_END) { countdown.innerHTML = 'Cảm ơn mọi người đã đến chung vui với Đan!'; return; }
    if (now >= DAY_START) { countdown.innerHTML = '<strong>Lễ tốt nghiệp đang diễn ra!</strong>'; return; }
    const left = DAY_START - now;
    const d = Math.floor(left / 86400000);
    const h = Math.floor(left % 86400000 / 3600000);
    countdown.innerHTML = d > 0
      ? `Còn <strong>${d} ngày</strong> nữa thôi!`
      : `Chỉ còn <strong>${h} giờ</strong> nữa thôi!`;
  }
  tick();
  setInterval(tick, 60000);

  // the cap: tap to toss it in the air
  const cake = document.getElementById('cap');
  const hint = document.getElementById('hint');
  let tossing = false;
  cake.addEventListener('click', () => {
    if (tossing) return;
    tossing = true;
    cake.classList.remove('is-tossed'); void cake.offsetWidth; cake.classList.add('is-tossed');
    hint.classList.add('is-yay');
    hint.textContent = 'Tung mũ nào! Chúc mừng tân cử nhân!';
    setTimeout(() => burst(cake, 130), reduce ? 0 : 550);
    setTimeout(() => { tossing = false; hint.classList.remove('is-yay'); hint.textContent = 'Chạm vào mũ để tung lại nhé'; }, reduce ? 800 : 1700);
  });

  // wish card rises in when reached
  const wishCard = document.querySelector('.wish-card');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { wishCard.classList.add('in'); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(wishCard);
  } else wishCard.classList.add('in');

  // wish: send it to the server, which saves it and mails it to Đan
  const form = document.getElementById('wish');
  const status = document.getElementById('wish-status');
  const thanks = document.getElementById('wish-thanks');
  const sendBtn = document.getElementById('wish-send');
  const nameInput = document.getElementById('wish-name');
  const wishInput = document.getElementById('wish-text');
  const say = (text, bad) => { status.textContent = text; status.classList.toggle('is-bad', Boolean(bad)); };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const message = wishInput.value.trim();
    if (!name) { nameInput.focus(); say('Bạn cho Đan biết tên bạn nhé!', true); return; }
    if (!message) { wishInput.focus(); say('Bạn viết vài chữ chúc Đan nhé!', true); return; }
    sendBtn.disabled = true;
    say('Đang gửi cho Đan…');
    try {
      const res = await fetch('/api/totnghiep/wishes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message, website: document.getElementById('wish-website').value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Chưa gửi được lúc này, bạn thử lại nhé.');
      say('');
      form.hidden = true;
      thanks.hidden = false;
      burst(thanks, 150);
    } catch (error) {
      say(error.message === 'Failed to fetch' ? 'Mất kết nối rồi, bạn thử lại nhé.' : error.message, true);
    } finally {
      sendBtn.disabled = false;
    }
  });
  document.getElementById('wish-again').addEventListener('click', () => {
    wishInput.value = '';
    document.querySelectorAll('#chips button').forEach(c => c.classList.remove('is-picked'));
    thanks.hidden = true;
    form.hidden = false;
    wishInput.focus();
  });

  // on the day itself, celebrate as soon as the card opens
  if (Date.now() >= DAY_START && Date.now() < DAY_END) setTimeout(() => burst(cake, 160), 1800);
})();
