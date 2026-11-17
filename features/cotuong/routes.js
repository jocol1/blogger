const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const express = require('express');

const { INITIAL_FEN, newGame, play } = require('./xq-rules');
const { UciEngine } = require('./uci');
const { mountAccounts } = require('./accounts');

const BASE = '/co-tuong';
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const DEFAULT_ENGINE = 'D:/engines/pikafish/Pikafish-Windows-x86-64-universal.exe';
const GZIP_TYPES = {
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
const HASHED = /[.-][a-f0-9]{8,}\.(?:js|css)$/i;

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Pikafish on this machine. `PIKAFISH_PATH` overrides the known install. */
function pikafishOptions() {
  const command = process.env.PIKAFISH_PATH || DEFAULT_ENGINE;
  if (!command || !fs.existsSync(command)) return null;
  const nnue = process.env.PIKAFISH_NNUE || path.join(path.dirname(command), 'pikafish.nnue');
  return {
    command,
    cwd: path.dirname(command),
    evalFile: fs.existsSync(nnue) ? nnue : undefined,
    threads: positive(process.env.PIKAFISH_THREADS, 2),
    hashMb: positive(process.env.PIKAFISH_HASH_MB, 128),
  };
}

function openPikafish() {
  const options = pikafishOptions();
  return options ? new UciEngine(options) : null;
}

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

const ACCOUNT_PREFIXES = ['/api/auth', '/api/me', '/api/matches', '/api/players'];

/** The chess page only talks to this site. Account routes are answered by the xiangqi API. */
function accountProxy(accountApi) {
  return (req, res, next) => {
    const pathOnly = req.originalUrl.split('?')[0];
    const matched = ACCOUNT_PREFIXES.some((prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`));
    if (!matched) return next();
    let target;
    try {
      target = new URL(req.originalUrl, accountApi);
    } catch {
      return fail(res, 503, 'INTERNAL', 'Account server is not configured');
    }
    const headers = { ...req.headers, host: target.host };
    delete headers.connection;
    const upstream = http.request(target, { method: req.method, headers, timeout: 15_000 }, (incoming) => {
      res.status(incoming.statusCode || 502);
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (value === undefined || key === 'transfer-encoding' || key === 'connection') continue;
        res.setHeader(key, value);
      }
      incoming.pipe(res);
    });
    const down = () => {
      if (!res.headersSent) fail(res, 503, 'INTERNAL', 'Account server is down');
    };
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', down);
    req.pipe(upstream);
  };
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(abs, out);
    else out.push(abs);
  }
  return out;
}

/** Patch the Expo export so API calls hit this site, then gzip once at boot. */
function loadTextAssets(dir) {
  const assets = new Map();
  for (const abs of walkFiles(dir)) {
    const ext = path.extname(abs);
    const type = GZIP_TYPES[ext];
    if (!type) continue;
    let buf = fs.readFileSync(abs);
    if (ext === '.js') {
      const text = buf.toString('utf8');
      if (text.includes('http://localhost:3001')) buf = Buffer.from(text.replaceAll('http://localhost:3001', ''));
    }
    const rel = `/${path.relative(dir, abs).replaceAll('\\', '/')}`;
    assets.set(rel, { type, raw: buf, gzip: zlib.gzipSync(buf, { level: 6 }) });
  }
  return assets;
}

function sendAsset(req, res, asset, cache) {
  const gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  res.set({
    'Content-Type': asset.type,
    'Cache-Control': cache,
    Vary: 'Accept-Encoding',
    ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.send(gzip ? asset.gzip : asset.raw);
}

function createCotuongRouter({ engine, movetimeMs, accountApi, db, secret } = {}) {
  const bot = engine !== undefined ? engine : openPikafish();
  const think = movetimeMs ?? positive(process.env.PIKAFISH_MOVETIME_MS, 400);
  const router = express.Router();
  if (typeof accountApi === 'string' && accountApi) router.use(accountProxy(accountApi));
  else mountAccounts(router, { db, secret });
  const dir = path.join(__dirname, '../../public/co-tuong');
  const assets = loadTextAssets(dir);
  const page = (req, res, next) => {
    if (path.extname(req.path)) return next();
    const asset = assets.get('/index.html');
    if (!asset) {
      return res.status(503).type('text/plain').send('Cờ tướng chưa được xuất lên máy chủ.');
    }
    res.set({ 'Content-Security-Policy': CSP });
    sendAsset(req, res, asset, 'no-cache');
  };

  router.use(BASE, (req, res, next) => {
    const asset = assets.get(req.path);
    if (!asset) return next();
    sendAsset(req, res, asset, HASHED.test(req.path) ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
  });

  router.get('/api/bot/status', (req, res) => {
    res.json({ available: Boolean(bot) });
  });

  router.post('/api/bot/move', express.json({ limit: '8kb' }), async (req, res) => {
    const fen = req.body?.startFen;
    const moves = req.body?.moves ?? [];
    const ok = typeof fen === 'string' && fen.length >= 10 && fen.length <= 120
      && Array.isArray(moves) && moves.length <= 400
      && moves.every((move) => typeof move === 'string' && /^[a-i][0-9][a-i][0-9]$/.test(move));
    if (!ok) return fail(res, 400, 'VALIDATION_FAILED', 'startFen and moves are not a game');
    if (!bot) return fail(res, 503, 'ENGINE_UNAVAILABLE', 'No engine is configured');

    let game;
    try {
      game = newGame(fen);
    } catch {
      return fail(res, 400, 'VALIDATION_FAILED', 'startFen is not a valid position');
    }
    for (const move of moves) {
      const next = play(game, move);
      if (!next.ok) return fail(res, 400, 'VALIDATION_FAILED', `Illegal move ${move}`);
      game = next.state;
    }
    if (game.result) return fail(res, 400, 'VALIDATION_FAILED', 'The game is over');

    try {
      const answer = await bot.analyse({ startFen: fen, moves, movetimeMs: think });
      res.json(answer);
    } catch (error) {
      console.error('Pikafish failed:', error.message);
      fail(res, 503, 'ENGINE_UNAVAILABLE', 'The engine could not answer');
    }
  });

  router.use(BASE, express.static(dir, { index: false, maxAge: '7d' }));
  router.get('/canvaskit.wasm', (req, res) => {
    const file = path.join(dir, 'canvaskit.wasm');
    if (!fs.existsSync(file)) return res.sendStatus(404);
    res.type('application/wasm').set('Cache-Control', 'public, max-age=604800').sendFile(file);
  });
  router.get(BASE, page);
  router.get(`${BASE}/*`, page);

  router.close = () => bot?.close?.();
  router.warm = () => (bot?.warm ? bot.warm() : Promise.resolve());
  process.on('exit', () => router.close());
  return router;
}

module.exports = { createCotuongRouter, pikafishOptions, BASE, INITIAL_FEN };
