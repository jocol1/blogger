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

test('tea client keeps wallet authentication out of URLs and renders chat as text', () => {
  assert.match(js, /'X-Wallet-Token': token/); assert.match(js, /socket=io\(\{auth:\{token\}\}\)/); assert.match(js, /text\.textContent=message\.text/);
  assert.doesNotMatch(js, /[?&]token=/);
});

test('mobile café follows the player view and keeps the activity panel usable', () => {
  assert.match(css, /@media\(max-width:900px\)/); assert.match(css, /position:fixed/); assert.match(css, /touch-action:none/); assert.match(css, /image-rendering:pixelated/);
});
