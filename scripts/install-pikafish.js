#!/usr/bin/env node
/**
 * Downloads the Pikafish xiangqi engine into ./engine so the /co-tuong bot can use it.
 * Run it as part of the build on the host (Render: Build Command `npm install && npm run install-engine`).
 *
 * - Only runs on Linux x64 (what the hosts use); elsewhere it does nothing. Use --force to override.
 * - The engine is optional: any failure only prints a warning and the site still deploys, with the
 *   built-in bot as the fallback.
 * - Pikafish is GPL-3.0. Its network file (pikafish.nnue) has its own terms: no commercial use without
 *   permission. The licence texts are kept next to the binary.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RELEASE = 'Pikafish-2026-09-06';
const ASSET = 'Pikafish.2026-09-06.7z';
const URL = `https://github.com/official-pikafish/Pikafish/releases/download/${RELEASE}/${ASSET}`;
const BINARY = 'Pikafish-Linux-x86-64-universal';
const NETWORK = 'pikafish.nnue';
const KEEP = [BINARY, NETWORK, 'Copying.txt', 'NNUE-License.md'];

const args = process.argv.slice(2);
const force = args.includes('--force');
const dirAt = args.indexOf('--dir');
const dest = path.resolve(dirAt >= 0 ? args[dirAt + 1] : path.join(__dirname, '..', 'engine'));

function mb(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

async function install() {
  if (!force && !(process.platform === 'linux' && process.arch === 'x64')) {
    console.log(`[pikafish] skipped: this is ${process.platform}/${process.arch}, the Linux x64 build is not used here`);
    return;
  }
  if ([BINARY, NETWORK].every((name) => fs.existsSync(path.join(dest, name)))) {
    console.log(`[pikafish] already installed in ${dest}`);
    return;
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pikafish-'));
  try {
    console.log(`[pikafish] downloading ${URL}`);
    const res = await fetch(URL, { redirect: 'follow' });
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const archive = path.join(work, ASSET);
    const bytes = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(archive, bytes);
    console.log(`[pikafish] downloaded ${mb(bytes.length)}`);

    const sevenZip = require('7zip-bin').path7za;
    if (process.platform !== 'win32') fs.chmodSync(sevenZip, 0o755);
    const out = path.join(work, 'out');
    const run = spawnSync(sevenZip, ['x', archive, `-o${out}`, '-y', ...KEEP], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`extract failed: ${(run.stderr || run.stdout || '').trim().slice(-300)}`);

    fs.mkdirSync(dest, { recursive: true });
    for (const name of KEEP) {
      const from = path.join(out, name);
      if (!fs.existsSync(from)) throw new Error(`${name} is missing from the archive`);
      fs.copyFileSync(from, path.join(dest, name));
    }
    if (process.platform !== 'win32') fs.chmodSync(path.join(dest, BINARY), 0o755);
    const size = KEEP.map((n) => fs.statSync(path.join(dest, n)).size).reduce((a, b) => a + b, 0);
    console.log(`[pikafish] installed in ${dest} (${mb(size)})`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

install().catch((error) => {
  console.warn(`[pikafish] WARNING: engine not installed (${error.message}). The site still works with the built-in bot.`);
});
