const { spawn } = require('node:child_process');

const MATE_CP = 10_000;

function scoreOf(tokens) {
  const i = tokens.indexOf('score');
  if (i < 0) return null;
  const kind = tokens[i + 1];
  const value = Number(tokens[i + 2]);
  if (!Number.isFinite(value)) return null;
  if (kind === 'cp') return Math.round(value);
  if (kind === 'mate') return value > 0 ? MATE_CP - value : -MATE_CP - value;
  return null;
}

/** Reads one `info … multipv n … score … pv move …` line; null when the line has no move. */
function parseInfoLine(line) {
  if (!line.startsWith('info ')) return null;
  const tokens = line.split(/\s+/);
  const cp = scoreOf(tokens);
  const pv = tokens.indexOf('pv');
  if (cp === null || pv < 0 || !tokens[pv + 1]) return null;
  const depthAt = tokens.indexOf('depth');
  const multiAt = tokens.indexOf('multipv');
  return {
    multipv: multiAt >= 0 ? Number(tokens[multiAt + 1]) || 1 : 1,
    depth: depthAt >= 0 ? Number(tokens[depthAt + 1]) || 0 : 0,
    cp,
    uci: tokens[pv + 1],
  };
}

class EngineUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EngineUnavailableError';
  }
}

/**
 * Drives Pikafish over UCI. One search runs at a time. A hung or crashed process is killed
 * and started again on the next request.
 */
class UciEngine {
  constructor(options) {
    this.options = options;
    this.proc = null;
    this.starting = null;
    this.buffer = '';
    this.onLine = new Set();
    this.onFail = new Set();
    this.tail = Promise.resolve();
    this.waiting = 0;
    this.closed = false;
  }

  analyse(input) {
    if (this.closed) return Promise.reject(new EngineUnavailableError('Engine is closed'));
    if (this.waiting >= (this.options.maxQueue ?? 8)) return Promise.reject(new EngineUnavailableError('Engine is busy'));
    this.waiting += 1;
    const run = this.tail.then(() => this.search(input));
    this.tail = run.then(() => undefined, () => undefined);
    return run.finally(() => {
      this.waiting -= 1;
    });
  }

  warm() {
    return this.closed ? Promise.resolve() : this.start();
  }

  close() {
    this.closed = true;
    this.kill(new EngineUnavailableError('Engine is closed'));
  }

  send(command) {
    this.proc?.stdin.write(`${command}\n`);
  }

  kill(reason) {
    const proc = this.proc;
    this.proc = null;
    this.starting = null;
    this.buffer = '';
    for (const fail of [...this.onFail]) fail(reason);
    if (proc && !proc.killed) proc.kill();
  }

  waitFor(match, timeoutMs, what) {
    return new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        this.onLine.delete(handler);
        this.onFail.delete(fail);
      };
      const handler = (line) => {
        if (!match(line)) return;
        done();
        resolve(line);
      };
      const fail = (error) => {
        done();
        reject(error);
      };
      const timer = setTimeout(() => {
        done();
        reject(new EngineUnavailableError(`Engine did not answer (${what})`));
      }, timeoutMs);
      this.onLine.add(handler);
      this.onFail.add(fail);
    });
  }

  start() {
    this.starting ??= this.boot().catch((error) => {
      this.kill(error instanceof Error ? error : new Error(String(error)));
      throw error instanceof EngineUnavailableError ? error : new EngineUnavailableError(String(error));
    });
    return this.starting;
  }

  async boot() {
    const { command, args = [], cwd, evalFile, threads, hashMb, multiPv, startupTimeoutMs = 15_000 } = this.options;
    const proc = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      let nl;
      while ((nl = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (line) for (const handler of [...this.onLine]) handler(line);
      }
    });
    proc.stderr.resume();
    proc.stdin.on('error', () => undefined);
    proc.on('error', (error) => {
      if (this.proc === proc) this.kill(new EngineUnavailableError(`Engine failed to start: ${error.message}`));
    });
    proc.on('exit', () => {
      if (this.proc === proc) this.kill(new EngineUnavailableError('Engine exited'));
    });

    const uciok = this.waitFor((line) => line === 'uciok', startupTimeoutMs, 'uci');
    this.send('uci');
    await uciok;
    if (threads) this.send(`setoption name Threads value ${threads}`);
    if (hashMb) this.send(`setoption name Hash value ${hashMb}`);
    if (evalFile) this.send(`setoption name EvalFile value ${evalFile}`);
    this.send(`setoption name MultiPV value ${multiPv ?? 3}`);
    const ready = this.waitFor((line) => line === 'readyok', startupTimeoutMs, 'isready');
    this.send('isready');
    await ready;
  }

  async search({ startFen, moves, movetimeMs }) {
    await this.start();
    const lines = new Map();
    const finished = this.waitFor(
      (line) => {
        const info = parseInfoLine(line);
        if (info) {
          const prev = lines.get(info.multipv);
          if (!prev || info.depth >= prev.depth) lines.set(info.multipv, info);
        }
        return line.startsWith('bestmove');
      },
      movetimeMs + 4_000,
      'go',
    );
    this.send(`position fen ${startFen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`);
    this.send(`go movetime ${movetimeMs}`);
    let best;
    try {
      best = await finished;
    } catch (error) {
      this.kill(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
    const bestMove = best.split(/\s+/)[1];
    if (!bestMove || bestMove === '(none)' || bestMove === '0000') throw new EngineUnavailableError('No legal move');

    const ranked = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
    const candidates = ranked.map((line) => ({ uci: line.uci, cp: line.cp }));
    const at = candidates.findIndex((candidate) => candidate.uci === bestMove);
    if (at > 0) candidates.unshift(...candidates.splice(at, 1));
    if (at < 0) candidates.unshift({ uci: bestMove, cp: ranked[0]?.cp ?? 0 });
    return { candidates, depth: Math.max(0, ...ranked.map((line) => line.depth)) };
  }
}

module.exports = { parseInfoLine, UciEngine, EngineUnavailableError };
