const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '../public/an-xin/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/an-xin/index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/an-xin/style.css'), 'utf8');

test('arcade page exposes five games, three difficulties, wallet backup and tea redemption', () => {
  for (const game of ['bowl', 'needle', 'heart', 'memory', 'order']) {
    assert.match(html, new RegExp(`data-game="${game}"`));
  }
  for (const difficulty of ['easy', 'medium', 'hard']) {
    assert.match(html, new RegExp(`data-difficulty="${difficulty}"`));
  }
  assert.match(html, /id="backup-wallet"/);
  assert.match(html, /id="import-form"/);
  assert.match(html, /id="redeem-form"/);
  assert.match(html, /100 xu/);
  assert.doesNotMatch(html, /speech|giọng đọc|lời chúc/i);
});

test('client sends wallet tokens in headers and asks the server to start and settle games', () => {
  assert.match(app, /headers\['X-Wallet-Token'\] = walletToken/);
  assert.match(app, /api\/game\/sessions/);
  assert.match(app, /api\/game\/sessions\/\$\{activeGame\.id\}\/action/);
  assert.match(app, /api\/game\/redemptions/);
  assert.doesNotMatch(app, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^)]*(balance|coin|score)/i);
});

test('motion preference removes decoration transitions without freezing game targets', () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(app, /requestAnimationFrame\(tick\)/);
  assert.match(app, /Math\.sin/);
});
