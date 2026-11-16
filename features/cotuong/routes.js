const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const { INITIAL_FEN, newGame, play } = require('./xq-rules');
const { UciEngine } = require('./uci');

const BASE = '/co-tuong';
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const DEFAULT_ENGINE = 'D:/engines/pikafish/Pikafish-Windows-x86-64-universal.exe';

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

function createCotuongRouter({ engine, movetimeMs } = {}) {
  const bot = engine !== undefined ? engine : openPikafish();
  const think = movetimeMs ?? positive(process.env.PIKAFISH_MOVETIME_MS, 1500);
  const router = express.Router();
  const dir = path.join(__dirname, '../../public/co-tuong');
  const index = path.join(dir, 'index.html');
  const page = (req, res, next) => {
    if (path.extname(req.path)) return next();
    if (!fs.existsSync(index)) {
      return res.status(503).type('text/plain').send('Cờ tướng chưa được xuất lên máy chủ.');
    }
    res.set({ 'Content-Security-Policy': CSP, 'Cache-Control': 'no-cache' });
    res.sendFile(index);
  };
  // The exported client calls http://localhost:3001. Serve it from this site instead.
  router.use(BASE, (req, res, next) => {
    if (!req.path.endsWith('.js')) return next();
    const file = path.resolve(dir, req.path.replace(/^[/\\]+/, ''));
    if (!file.startsWith(path.resolve(dir) + path.sep) || !fs.existsSync(file)) return next();
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('http://localhost:3001')) return next();
    res.type('js').set('Cache-Control', 'no-cache').send(text.replaceAll('http://localhost:3001', ''));
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

  router.use(BASE, express.static(dir, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
  router.get('/canvaskit.wasm', (req, res) => {
    const file = path.join(dir, 'canvaskit.wasm');
    if (!fs.existsSync(file)) return res.sendStatus(404);
    res.type('application/wasm').sendFile(file);
  });
  router.get(BASE, page);
  router.get(`${BASE}/*`, page);

  router.close = () => bot?.close?.();
  router.warm = () => (bot?.warm ? bot.warm() : Promise.resolve());
  process.on('exit', () => router.close());
  return router;
}

module.exports = { createCotuongRouter, pikafishOptions, BASE, INITIAL_FEN };
