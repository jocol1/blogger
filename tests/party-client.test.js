const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../public/party/index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../public/party/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/party/style.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(__dirname, '../public/party/mobile.css'), 'utf8');
const drawingCss = fs.readFileSync(path.join(__dirname, '../public/party/drawing.css'), 'utf8');

test('party page clearly presents four games, free trial and paid room price', () => {
  assert.match(html, /Tòa án bạn thân/);
  assert.match(html, /Ai viết câu này/);
  assert.match(html, /Kẻ nằm vùng/);
  assert.match(html, /Vẽ chuyền tay/);
  assert.match(html, /1 trận miễn phí/);
  assert.match(html, /19 xu · 2 giờ/);
  assert.match(html, /3–10 người/);
  assert.match(html, /Thêm một bot/);
});

test('party client keeps wallet and player tokens in headers and supports invite links', () => {
  assert.match(app, /X-Wallet-Token/);
  assert.match(app, /X-Party-Token/);
  assert.match(app, /party\?room=/);
  assert.match(app, /setTimeout\(pollRoom, 2000\)/);
  assert.match(app, /canvas\.toDataURL\('image\/png'\)/);
  assert.match(app, /locly-party-sound/);
  assert.match(app, /locly-party-draft-/);
  assert.match(app, /pointerdown/);
  assert.match(app, /toBlob\(resolve, 'image\/webp'/);
  assert.match(app, /lastDrawingRenderKey === renderKey/);
  assert.match(app, /postAction\('add_bot'\)/);
  assert.match(app, /player\.isBot/);
});

test('party UI supports mobile and reduced motion', () => {
  assert.match(css, /@media\(max-width:680px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(mobileCss, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(mobileCss, /overflow-wrap: anywhere/);
  assert.match(drawingCss, /touch-action:none/);
  assert.match(drawingCss, /drawing-lightbox/);
});
