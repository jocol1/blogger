const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Locly Tea manifest installs as a standalone landscape app',()=>{
  const manifest=JSON.parse(read('public/tea/manifest.webmanifest'));assert.equal(manifest.name,'Locly Tea');assert.equal(manifest.start_url,'/tra-da');assert.equal(manifest.scope,'/tra-da');assert.equal(manifest.display,'standalone');assert.equal(manifest.orientation,'landscape');assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'));assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
  for(const icon of manifest.icons)assert.ok(fs.statSync(path.join(root,'public/tea',icon.src.replace('/assets/tea/',''))).size>100);
});

test('service worker caches only the public café shell and waits for an explicit update',()=>{
  const worker=read('public/tea/sw.js');assert.match(worker,/locly-tea-v12/);assert.match(worker,/SKIP_WAITING/);assert.doesNotMatch(worker,/sync|BackgroundSync/i);assert.match(worker,/request\.method!=='GET'/);assert.match(worker,/startsWith\('\/api\/'\)/);assert.match(worker,/assets\/tea/);assert.doesNotMatch(worker,/api\/game|api\/tea\/|admin\/orders/);assert.doesNotMatch(worker,/skipWaiting\(\).*install/s);
});

test('tea page exposes install, rotation, offline, recovery and deferred update controls',()=>{
  const html=read('public/tea/index.html'),pwa=read('public/tea/pwa.js'),app=read('public/tea/app.js');for(const id of ['install-button','install-dialog','install-confirm','install-manual','rotate-overlay','offline-banner','update-banner','wallet-recovery','create-wallet','panel-close'])assert.match(html,new RegExp(`id="${id}"`));assert.match(html,/data-mini-game="quiz"/);assert.match(html,/data-mini-game="coin"/);assert.match(pwa,/beforeinstallprompt/);assert.match(pwa,/syncInstallControls/);assert.match(pwa,/navigator\.standalone/);assert.match(pwa,/teaCanReload/);assert.match(pwa,/controllerchange/);assert.match(app,/wallet_recovery_required/);assert.doesNotMatch(app,/removeItem\(WALLET_KEY\)/);assert.doesNotMatch(html,/data-mini-game="(?:dice|oanquan)"/);assert.doesNotMatch(html,/oanquan-ui|oanquan-playback/);
});

test('portrait mode pauses controls instead of rotating the interface',()=>{
  const css=read('public/tea/pwa.css'),app=read('public/tea/app.js'),brawl=read('public/tea/brawl-ui.js');assert.match(css,/orientation:portrait/);assert.doesNotMatch(css,/rotate\(90deg\).*cafe-shell/);assert.match(app,/tea:orientationchange/);assert.match(app,/padController\?\.reset/);assert.match(brawl,/portrait-blocked/);assert.match(brawl,/pause:release/);
});
