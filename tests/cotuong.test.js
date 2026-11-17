const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createCotuongRouter, pikafishOptions, INITIAL_FEN } = require('../features/cotuong/routes');
const { parseFen, perft } = require('../features/cotuong/xq-rules');
const { parseInfoLine } = require('../features/cotuong/uci');

const index = path.join(__dirname, '../public/co-tuong/index.html');

async function start(options) {
  const app = express();
  const router = createCotuongRouter(options);
  app.use(router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const call = async (url, init) => fetch(`http://127.0.0.1:${port}${url}`, init);
  return { server, call, router };
}

test('the rules taken from D:/chess agree with xiangqi perft', () => {
  const startPos = parseFen(INITIAL_FEN);
  assert.equal(perft(startPos, 1), 44);
  assert.equal(perft(startPos, 2), 1920);
});

test('UCI info lines keep the score and the first move of the line', () => {
  assert.equal(parseInfoLine('info depth 9 score mate 3 pv a0a9')?.cp, 9997);
  assert.equal(parseInfoLine('info depth 12 multipv 2 score cp -17 pv b0c2 b9c7')?.uci, 'b0c2');
  assert.equal(parseInfoLine('bestmove h2e2'), null);
});

test('/co-tuong is a standalone page, not the tea café', async () => {
  assert.equal(fs.existsSync(index), true, 'export the Expo web build into public/co-tuong first');
  const html = fs.readFileSync(index, 'utf8');
  assert.match(html, /Cờ tướng/);
  assert.match(html, /\/co-tuong\//);
  assert.doesNotMatch(html, /tra-da/);

  const { server, call, router } = await start({
    engine: {
      analyse: async () => ({ candidates: [{ uci: 'h2e2', cp: 40 }], depth: 8 }),
      close() {},
    },
  });
  try {
    const home = await call('/co-tuong');
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /Cờ tướng/);
    assert.doesNotMatch(homeHtml, /xq\.offline/);
    const script = homeHtml.match(/\/co-tuong\/_expo\/static\/js\/web\/__common-[^"]+\.js/);
    assert.ok(script);
    const client = await call(script[0]);
    assert.equal(client.status, 200);
    assert.equal((await client.text()).includes('http://localhost:3001'), false);
    const gzipped = await new Promise((resolve, reject) => {
      http.get(
        { hostname: '127.0.0.1', port: server.address().port, path: script[0], headers: { 'Accept-Encoding': 'gzip' } },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              enc: res.headers['content-encoding'],
              cache: res.headers['cache-control'],
              bytes: Buffer.concat(chunks).length,
            }),
          );
        },
      ).on('error', reject);
    });
    assert.equal(gzipped.status, 200);
    assert.equal(gzipped.enc, 'gzip');
    assert.match(gzipped.cache, /immutable/);
    assert.ok(gzipped.bytes < 800_000, `gzipped JS should be well under 800KB, got ${gzipped.bytes}`);
    const bot = await call('/api/bot/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startFen: INITIAL_FEN, moves: [] }),
    });
    const body = await bot.json();
    assert.equal(bot.status, 200);
    assert.equal(body.candidates[0].uci, 'h2e2');
    assert.notEqual(body.candidates[0].uci, 'b2b9');
    const illegal = await call('/api/bot/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startFen: INITIAL_FEN, moves: ['h2h7'] }),
    });
    assert.equal(illegal.status, 400);
    const play = await call('/co-tuong/play');
    assert.equal(play.status, 200);
    assert.match(await play.text(), /<div id="root">/);
    const wasm = await call('/co-tuong/canvaskit.wasm');
    assert.equal(wasm.status, 200);
    const wasmRoot = await call('/canvaskit.wasm');
    assert.equal(wasmRoot.status, 200);
    const missing = await call('/co-tuong/no-such-file.js');
    assert.equal(missing.status, 404);
    const cafe = await call('/tra-da');
    assert.equal(cafe.status, 404);
  } finally {
    router.close();
    server.close();
  }
});

test('Pikafish plays a legal opening for the web client', { timeout: 30_000, skip: !pikafishOptions() }, async () => {
  const { server, call, router } = await start({ movetimeMs: 400 });
  try {
    const bot = await call('/api/bot/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startFen: INITIAL_FEN, moves: ['h2e2'] }),
    });
    const body = await bot.json();
    assert.equal(bot.status, 200);
    assert.match(body.candidates[0].uci, /^[a-i][0-9][a-i][0-9]$/);
    assert.notEqual(body.candidates[0].uci, 'b2b9');
    assert.ok(body.depth >= 1);
  } finally {
    router.close();
    server.close();
  }
});
