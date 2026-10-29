(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);

  const CONFETTI = ['#c2305b', '#efc9d1', '#eef1ee', '#f5b5c4', '#e8c88a', '#ffffff'];
  const PETALS = ['#eef1ee', '#efc9d1', '#f5b5c4', '#ffffff'];

  function drawPetal(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.r);
    ctx.globalAlpha = p.a;
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.s, p.s * 0.52 * (p.flip === undefined ? 1 : Math.max(0.15, Math.abs(Math.cos(p.flip)))), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  window.fx = { confetti() {}, trail() {} };
  if (reduce) return;

  /* ---- petals drifting down inside the hero ---- */
  const hero = document.getElementById('thiep');
  const heroCanvas = hero && hero.querySelector('.hero-petals');
  if (heroCanvas) {
    const ctx = heroCanvas.getContext('2d');
    let w = 0, h = 0, list = [], raf = 0, visible = true;
    const count = innerWidth < 700 ? 16 : 30;
    const make = fromTop => ({
      x: rand(0, w), y: fromTop ? rand(-40, -10) : rand(0, h),
      s: rand(5, 11), r: rand(0, 6.28), vr: rand(-0.02, 0.02),
      vy: rand(0.25, 0.75), vx: rand(-0.12, 0.12), ph: rand(0, 6.28),
      a: rand(0.35, 0.85), c: pick(PETALS), flip: rand(0, 6.28)
    });
    const size = () => {
      const r = hero.getBoundingClientRect(), d = dpr();
      w = r.width; h = r.height;
      heroCanvas.width = Math.round(w * d); heroCanvas.height = Math.round(h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of list) {
        p.y += p.vy; p.ph += 0.012; p.flip += 0.03;
        p.x += p.vx + Math.sin(p.ph) * 0.45; p.r += p.vr;
        if (p.y > h + 20 || p.x < -30 || p.x > w + 30) Object.assign(p, make(true));
        drawPetal(ctx, p);
      }
      raf = visible ? requestAnimationFrame(frame) : 0;
    };
    size();
    list = Array.from({ length: count }, () => make(false));
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    }).observe(hero);
    addEventListener('resize', size);
    raf = requestAnimationFrame(frame);
  }

  /* ---- confetti and cursor trail on one fixed canvas ---- */
  let fxCanvas = null, fctx = null, parts = [], fraf = 0;
  const ensure = () => {
    if (!fxCanvas) {
      fxCanvas = document.createElement('canvas');
      fxCanvas.className = 'fx';
      fxCanvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(fxCanvas);
      fctx = fxCanvas.getContext('2d');
      addEventListener('resize', fit);
    }
    fit();
  };
  function fit() {
    if (!fxCanvas) return;
    const d = dpr();
    fxCanvas.width = Math.round(innerWidth * d); fxCanvas.height = Math.round(innerHeight * d);
    fctx.setTransform(d, 0, 0, d, 0, 0);
  }
  function loop() {
    fctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.t < p.life && p.y < innerHeight + 40);
    for (const p of parts) {
      p.t++; p.vx *= p.drag; p.vy = p.vy * p.drag + p.g;
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.flip += 0.14;
      p.a = Math.min(1, (p.life - p.t) / 40);
      if (p.rect) {
        fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.r); fctx.globalAlpha = p.a; fctx.fillStyle = p.c;
        fctx.scale(1, Math.max(0.2, Math.abs(Math.cos(p.flip))));
        fctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); fctx.restore();
      } else drawPetal(fctx, p);
    }
    fraf = parts.length ? requestAnimationFrame(loop) : 0;
    if (!parts.length) fctx.clearRect(0, 0, innerWidth, innerHeight);
  }
  const start = () => { if (!fraf) fraf = requestAnimationFrame(loop); };

  window.fx.confetti = (x, y, n = 90) => {
    ensure();
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), v = rand(4, 13);
      parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.26, drag: 0.985,
        s: rand(5, 11), r: rand(0, 6.28), vr: rand(-0.25, 0.25), flip: rand(0, 6.28),
        c: pick(CONFETTI), a: 1, t: 0, life: rand(110, 190), rect: Math.random() < 0.45
      });
    }
    start();
  };
  window.fx.trail = (x, y) => {
    if (parts.length > 60) return;
    ensure();
    parts.push({
      x, y, vx: rand(-0.4, 0.4), vy: rand(0.2, 0.8), g: 0.015, drag: 0.99,
      s: rand(3, 6), r: rand(0, 6.28), vr: rand(-0.06, 0.06), flip: rand(0, 6.28),
      c: pick(PETALS), a: 1, t: 0, life: rand(40, 70), rect: false
    });
    start();
  };

  if (!fine) {
    const arch = document.querySelector('.invite-arch');
    if (arch) arch.addEventListener('click', e => window.fx.confetti(e.clientX, e.clientY, 60));
    return;
  }

  /* ---- fine pointers: card tilt, trail, magnetic buttons, arch burst ---- */
  const card = document.querySelector('.invite');
  const photo = document.querySelector('.hero-photo');
  let tx = 0, ty = 0, cx = 0, cy = 0, py = 0, tilting = 0;
  const applyPhoto = () => { photo.style.translate = `${(-cx * 26).toFixed(1)}px ${(-cy * 20 + py).toFixed(1)}px`; };
  const tiltFrame = () => {
    cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
    card.style.transform = `perspective(1100px) rotateY(${(cx * 8).toFixed(2)}deg) rotateX(${(-cy * 8).toFixed(2)}deg)`;
    applyPhoto();
    tilting = (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) ? requestAnimationFrame(tiltFrame) : 0;
  };
  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width - 0.5; ty = (e.clientY - r.top) / r.height - 0.5;
    if (!tilting) tilting = requestAnimationFrame(tiltFrame);
  });
  hero.addEventListener('pointerleave', () => { tx = ty = 0; if (!tilting) tilting = requestAnimationFrame(tiltFrame); });

  let lastTrail = 0, lx = 0, ly = 0;
  const onTrail = e => {
    const now = performance.now();
    if (now - lastTrail < 45 || Math.hypot(e.clientX - lx, e.clientY - ly) < 14) return;
    lastTrail = now; lx = e.clientX; ly = e.clientY;
    window.fx.trail(e.clientX, e.clientY);
  };
  hero.addEventListener('pointermove', onTrail);
  const reply = document.querySelector('.reply');
  if (reply) reply.addEventListener('pointermove', onTrail);

  document.querySelectorAll('.btn, .bar').forEach(b => {
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      b.style.translate = `${(dx * 0.1).toFixed(1)}px ${(dy * 0.25).toFixed(1)}px`;
    });
    b.addEventListener('pointerleave', () => { b.style.translate = ''; });
  });
  const arch = document.querySelector('.invite-arch');
  if (arch) arch.addEventListener('click', e => window.fx.confetti(e.clientX, e.clientY, 70));

  /* ---- scroll parallax ---- */
  const movers = [...document.querySelectorAll('[data-par]')];
  let sq = false;
  const onScroll = () => {
    if (sq) return;
    sq = true;
    requestAnimationFrame(() => {
      sq = false;
      py = Math.min(scrollY, innerHeight) * 0.25;
      applyPhoto();
      for (const el of movers) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) continue;
        const k = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
        el.style.translate = `0 ${(-k * Number(el.dataset.par)).toFixed(1)}px`;
      }
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
