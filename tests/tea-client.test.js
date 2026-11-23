const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../public/tea/index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/tea/style.css'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '../public/tea/app.js'), 'utf8');

test('pixel café exposes bilingual character, menu, table chat and card controls', () => {
  for (const marker of ['cafe-canvas','profile-dialog','wallet-dialog','qr-dialog','chat-form','start-card','Iced tea','Trà đá']) assert.match(`${html}${js}`, new RegExp(marker));
  assert.match(html, /Vietnamese bank transfer only/); assert.match(html, /socket\.io\/socket\.io\.js/);
});

test('café draws in 3D from a same-origin Three.js and falls back to the pixel scene', () => {
  const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map(match => match[1]);
  const three = scripts.indexOf('/assets/tea/vendor/three.min.js'), scene = scripts.indexOf('/assets/tea/scene3d.js'), app = scripts.indexOf('/assets/tea/app.js');
  assert.ok(three >= 0 && three < scene && scene < app, 'three.min.js, then scene3d.js, then app.js');
  assert.match(js, /use3D = Boolean\(window\.TeaScene3D\?\.init\(canvas\)\)/); assert.match(js, /ctx = use3D \? null : canvas\.getContext\('2d'\)/);
  const scene3d = fs.readFileSync(path.join(__dirname, '../public/tea/scene3d.js'), 'utf8');
  assert.match(scene3d, /name\.textContent=guest\.nickname/); assert.doesNotMatch(scene3d, /innerHTML/);
});

test('tea client keeps wallet authentication out of URLs and renders chat as text', () => {
  assert.match(js, /'X-Wallet-Token': token/); assert.match(js, /socket=io\(\{auth:\{token\}\}\)/); assert.match(js, /text\.textContent=message\.text/);
  assert.doesNotMatch(js, /[?&]token=/);
});

test('mobile café follows the player view and keeps the activity panel usable', () => {
  assert.match(css, /@media\(max-width:900px\)/); assert.match(css, /position:fixed/); assert.match(css, /touch-action:none/); assert.match(css, /image-rendering:pixelated/);
});

test('table chat drawer sits at page level so every table game can open it', () => {
  const room = html.slice(html.indexOf('id="table-room"'), html.indexOf('</section>', html.indexOf('id="table-room"')));
  assert.doesNotMatch(room, /id="hub-chat"/, 'the drawer must not live inside the lobby, which games hide');
  assert.match(html, /<aside class="hub-chat" id="hub-chat"/); assert.match(html, /id="game-chat-fab"[^>]*data-open-chat/);
  const hub = fs.readFileSync(path.join(__dirname, '../public/tea/hub-ui.js'), 'utf8');
  assert.match(hub, /querySelectorAll\('\[data-open-chat\]'\)/); assert.match(hub, /classList\.toggle\('chat-open'/);
});
