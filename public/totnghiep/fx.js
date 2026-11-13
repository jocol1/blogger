(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const COLORS = ['#ff6f9c', '#ff8fb1', '#ffc94d', '#8fd9c0', '#b9a6ff', '#ffd6e2'];

  let canvas = null, ctx = null, parts = [], raf = 0;

  function fit() {
    const d = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * d);
    canvas.height = Math.round(innerHeight * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  function ensure() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'fx';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    fit();
    addEventListener('resize', fit);
  }

  function heart(s) {
    ctx.beginPath();
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(-s, -s * 0.35, -s * 0.45, -s, 0, -s * 0.45);
    ctx.bezierCurveTo(s * 0.45, -s, s, -s * 0.35, 0, s * 0.35);
    ctx.fill();
  }

  function frame() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.t < p.life && p.y < innerHeight + 40);
    for (const p of parts) {
      p.t++;
      p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.24;
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.flip += 0.15;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.globalAlpha = Math.min(1, (p.life - p.t) / 35);
      ctx.fillStyle = p.c;
      if (p.kind === 'heart') heart(p.s);
      else if (p.kind === 'dot') { ctx.beginPath(); ctx.arc(0, 0, p.s / 2.4, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.scale(1, Math.max(0.2, Math.abs(Math.cos(p.flip)))); ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
      ctx.restore();
    }
    raf = parts.length ? requestAnimationFrame(frame) : 0;
    if (!parts.length) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  function confetti(x, y, n = 100) {
    if (reduce) return;
    ensure();
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.92, -Math.PI * 0.08), v = rand(5, 13);
      const roll = Math.random();
      parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        s: rand(7, 13), r: rand(0, 6.28), vr: rand(-0.2, 0.2), flip: rand(0, 6.28),
        c: pick(COLORS), t: 0, life: rand(120, 200),
        kind: roll < 0.3 ? 'heart' : roll < 0.55 ? 'dot' : 'rect'
      });
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }

  window.fx = { confetti };
})();
