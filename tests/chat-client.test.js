const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../public/ai/index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../public/ai/app.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '../public/ai/admin.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/ai/style.css'), 'utf8');

test('chat page states the human service, price, duration, refund and image limits', () => {
  assert.match(html, /<strong>10<\/strong><span>xu \/ 60 phút<\/span>/);
  assert.match(html, /người hỗ trợ đọc và trả lời/i);
  assert.match(html, /tự hoàn 10 xu/i);
  assert.match(html, /tối đa 3 ảnh/i);
  assert.match(html, /capture="environment"/);
});

test('chat client uses the shared wallet header and server session APIs', () => {
  assert.match(app, /locly-game-wallet/);
  assert.match(app, /headers\['X-Wallet-Token'\] = walletToken/);
  assert.match(app, /api\/chat\/sessions/);
  assert.match(app, /setTimeout\(pollMessages, 2000\)/);
  assert.doesNotMatch(app, /openai|gemini|anthropic|speechSynthesis/i);
});

test('admin replies carry CSRF and optional sound is opt-in', () => {
  assert.match(admin, /'X-CSRF-Token': csrf/);
  assert.match(admin, /\$\('sound'\)\.checked/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
