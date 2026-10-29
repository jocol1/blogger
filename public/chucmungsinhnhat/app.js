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

  // birthday: 3 Nov 2026, Vietnam time
  const DAY_START = new Date('2026-11-03T00:00:00+07:00').getTime();
  const DAY_END = DAY_START + 24 * 3600 * 1000;
  const countdown = document.getElementById('countdown');
  function tick() {
    const now = Date.now();
    if (now >= DAY_END) { countdown.innerHTML = 'Cảm ơn mọi người đã chúc mừng Đan!'; return; }
    if (now >= DAY_START) { countdown.innerHTML = '<strong>Hôm nay là sinh nhật Đan!</strong>'; return; }
    const left = DAY_START - now;
    const d = Math.floor(left / 86400000);
    const h = Math.floor(left % 86400000 / 3600000);
    countdown.innerHTML = d > 0
      ? `Còn <strong>${d} ngày</strong> nữa thôi!`
      : `Chỉ còn <strong>${h} giờ</strong> nữa thôi!`;
  }
  tick();
  setInterval(tick, 60000);

  // the cake: tap to blow out the candles, tap again to light them
  const cake = document.getElementById('cake');
  const hint = document.getElementById('hint');
  cake.addEventListener('click', () => {
    const blown = cake.classList.toggle('is-blown');
    cake.setAttribute('aria-label', blown ? 'Thắp lại nến' : 'Thổi nến trên bánh kem');
    hint.classList.toggle('is-yay', blown);
    hint.textContent = blown ? 'Yeah! Đan ước một điều thật xinh nhé!' : 'Chạm vào bánh để thổi nến nhé';
    if (blown) burst(cake, 120);
  });

  // wish card rises in when reached
  const wishCard = document.querySelector('.wish-card');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { wishCard.classList.add('in'); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(wishCard);
  } else wishCard.classList.add('in');

  // wish: write the message, then share or copy it
  const form = document.getElementById('wish');
  const out = document.getElementById('wish-out');
  const result = document.getElementById('wish-result');
  const wishHint = document.getElementById('wish-hint');
  const nameInput = document.getElementById('wish-name');
  const wishInput = document.getElementById('wish-text');
  const copied = 'Đã sao chép! Dán vào Zalo hoặc Messenger gửi Đan nhé.';
  const manual = 'Bạn chọn đoạn trên, sao chép rồi gửi Đan nhé.';

  function compose() {
    const who = nameInput.value.trim();
    const wish = wishInput.value.trim() || 'Chúc Đan tuổi mới thật vui, thật xinh và thật nhiều điều may mắn!';
    return `Chúc mừng sinh nhật Thảo Đan! ${wish}${who ? ' — ' + who : ''}`;
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

  form.addEventListener('submit', async event => {
    event.preventDefault();
    out.hidden = false;
    if (!nameInput.value.trim()) {
      nameInput.focus();
      result.textContent = 'Bạn cho Đan biết tên bạn nhé!';
      wishHint.textContent = '';
      return;
    }
    const message = compose();
    result.textContent = message;
    burst(document.getElementById('wish-send'), 120);
    if (navigator.share) {
      try { await navigator.share({ text: message }); wishHint.textContent = 'Đã mở danh sách ứng dụng để bạn gửi cho Đan.'; return; }
      catch (err) { if (err && err.name === 'AbortError') { wishHint.textContent = ''; return; } }
    }
    wishHint.textContent = (await copy(message)) ? copied : manual;
  });
  document.getElementById('wish-copy').addEventListener('click', async () => {
    wishHint.textContent = (await copy(result.textContent)) ? copied : manual;
  });

  // on the day itself, celebrate as soon as the card opens
  if (Date.now() >= DAY_START && Date.now() < DAY_END) setTimeout(() => burst(cake, 160), 1800);
})();
