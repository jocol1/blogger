#!/usr/bin/env node
/**
 * Installs the Pikafish xiangqi engine into ./engine so the /co-tuong bot can use it.
 * Run it as part of the build on the host (Render: Build Command `npm install && npm run install-engine`).
 *
 * The official Linux binary is built against a very new glibc (2.38) and will not start on hosts with an
 * older one (Render's Node image has 2.35). So the script:
 *   1. downloads the official release (network file + prebuilt binary) and keeps the binary if it runs here;
 *   2. otherwise compiles Pikafish from the same release's source on this machine (needs g++ and make).
 * The result is ./engine/pikafish plus ./engine/pikafish.nnue.
 *
 * Only runs on Linux x64 (use --force to override, --dir to choose the folder). The engine is optional:
 * any failure only prints a warning and the site still deploys with the built-in bot.
 *
 * Pikafish is GPL-3.0. Its network file has its own terms: no commercial use without permission.
 * The licence texts are kept next to the binary.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RELEASE = 'Pikafish-2026-09-06';
const BASE = `https://github.com/official-pikafish/Pikafish`;
const ASSET_URL = `${BASE}/releases/download/${RELEASE}/Pikafish.2026-09-06.7z`;
const SOURCE_URL = `${BASE}/archive/refs/tags/${RELEASE}.tar.gz`;
const PREBUILT = 'Pikafish-Linux-x86-64-universal';
const NETWORK = 'pikafish.nnue';
const FROM_ARCHIVE = [PREBUILT, NETWORK, 'Copying.txt', 'NNUE-License.md'];
const ENGINE = 'pikafish';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dirAt = args.indexOf('--dir');
const dest = path.resolve(dirAt >= 0 ? args[dirAt + 1] : path.join(__dirname, '..', 'engine'));

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const log = (message) => console.log(`[pikafish] ${message}`);

async function download(url, file) {
  log(`downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} for ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, bytes);
  log(`downloaded ${mb(bytes.length)}`);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) {
    const text = `${result.stderr || ''}${result.stdout || ''}`.trim();
    throw new Error(`${command} ${commandArgs[0] ?? ''} failed (code ${result.status}): ${text.slice(-600)}`);
  }
  return result;
}

/** True when the binary starts, loads the network and answers `isready` here. */
function works(binary) {
  const result = spawnSync(binary, [], {
    cwd: path.dirname(binary),
    input: 'uci\nisready\nquit\n',
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status === 0 && /readyok/.test(result.stdout || '')) return true;
  const why = result.error ? result.error.message : `${result.stderr || ''}`.trim().split('\n').pop();
  log(`${path.basename(binary)} does not run here: ${why || `exit ${result.status}`}`);
  return false;
}

/** The most capable instruction set this machine has, without going beyond it. */
function pickArch() {
  let flags = '';
  try {
    flags = fs.readFileSync('/proc/cpuinfo', 'utf8').match(/^flags\s*:(.*)$/m)?.[1] ?? '';
  } catch {
    /* not Linux, or unreadable */
  }
  const has = (flag) => new RegExp(`\\b${flag}\\b`).test(flags);
  if (has('avx2') && has('bmi2') && has('fma')) return 'x86-64-avx2';
  if (has('sse4_1') && has('popcnt')) return 'x86-64-sse41-popcnt';
  return 'x86-64';
}

function compile(work, networkFile) {
  for (const tool of ['make', 'g++']) {
    if (spawnSync(tool, ['--version'], { encoding: 'utf8' }).status !== 0) throw new Error(`${tool} is not installed, cannot compile`);
  }
  const tarball = path.join(work, 'source.tar.gz');
  return download(SOURCE_URL, tarball).then(() => {
    const out = path.join(work, 'source');
    fs.mkdirSync(out, { recursive: true });
    run('tar', ['-xzf', tarball, '-C', out, '--strip-components=1']);
    const src = path.join(out, 'src');
    // Some versions embed the network at compile time, so it has to be in src/.
    fs.copyFileSync(networkFile, path.join(src, NETWORK));
    const arch = pickArch();
    const jobs = Math.max(1, Math.min(2, os.cpus().length));
    log(`compiling for ${arch} with ${jobs} job(s); this takes a few minutes`);
    run('make', [`-j${jobs}`, 'build', `ARCH=${arch}`], { cwd: src, stdio: ['ignore', 'pipe', 'pipe'] });
    const built = path.join(src, 'pikafish');
    if (!fs.existsSync(built)) throw new Error('the build finished but produced no pikafish binary');
    return built;
  });
}

async function install() {
  if (!force && !(process.platform === 'linux' && process.arch === 'x64')) {
    log(`skipped: this is ${process.platform}/${process.arch}, the Linux x64 build is not used here`);
    return;
  }
  const target = path.join(dest, ENGINE);
  const network = path.join(dest, NETWORK);
  if (fs.existsSync(target) && fs.existsSync(network) && works(target)) {
    log(`already installed in ${dest}`);
    return;
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pikafish-'));
  try {
    const archive = path.join(work, 'release.7z');
    await download(ASSET_URL, archive);
    const sevenZip = require('7zip-bin').path7za;
    if (process.platform !== 'win32') fs.chmodSync(sevenZip, 0o755);
    const extracted = path.join(work, 'release');
    run(sevenZip, ['x', archive, `-o${extracted}`, '-y', ...FROM_ARCHIVE]);

    fs.mkdirSync(dest, { recursive: true });
    for (const name of [NETWORK, 'Copying.txt', 'NNUE-License.md']) {
      fs.copyFileSync(path.join(extracted, name), path.join(dest, name));
    }

    // 1. The official binary, when this machine's glibc is new enough for it.
    fs.copyFileSync(path.join(extracted, PREBUILT), target);
    fs.chmodSync(target, 0o755);
    if (works(target)) {
      log(`installed the official binary in ${dest}`);
      return;
    }

    // 2. Otherwise build it here, against this machine's own libraries.
    const built = await compile(work, network);
    fs.copyFileSync(built, target);
    fs.chmodSync(target, 0o755);
    if (!works(target)) throw new Error('the compiled binary does not run either');
    log(`installed a locally compiled binary in ${dest} (${mb(fs.statSync(target).size)})`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

install().catch((error) => {
  console.warn(`[pikafish] WARNING: engine not installed (${error.message}). The site still works with the built-in bot.`);
});
