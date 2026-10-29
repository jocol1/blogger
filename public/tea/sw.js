const CACHE='locly-tea-v35';
const SHELL=['/tra-da','/tra-da.webmanifest','/assets/tea/style.css','/assets/tea/courtyard.css','/assets/tea/cafe-context.css','/assets/tea/games.css','/assets/tea/pwa.css','/assets/tea/cards-mobile.css','/assets/tea/cards-fullscreen.css','/assets/tea/cards-skin.css','/assets/tea/all-games-fullscreen.css','/assets/tea/world.js','/assets/tea/menu.js','/assets/tea/scene.js','/assets/tea/touch-controls.js','/assets/tea/games-ui.js','/assets/tea/game-words.js','/assets/tea/pwa-words.js','/assets/tea/app.js','/assets/tea/pwa.js','/assets/tea/icons/icon-192.png','/assets/tea/icons/icon-512.png','/assets/tea/icons/icon-maskable-512.png'];
SHELL.push('/tra-da/farm','/assets/tea/farm.css','/assets/tea/farm-outbox.js','/assets/tea/farm-world.js','/assets/tea/farm-expansion.js','/assets/tea/farm-ranch.js','/assets/tea/farm-motion.js','/assets/tea/farm-avatar.js','/assets/tea/farm.js');
SHELL.push('/assets/tea/movement.js','/assets/tea/walk-controls.js','/assets/tea/walk-controls.css','/assets/tea/prediction.js','/assets/tea/cafe-walker.js');
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('locly-tea-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==location.origin)return;
  if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/tra-da/admin')||url.pathname.startsWith('/socket.io/'))return;
  const path=url.pathname==='/tra-da/'?'/tra-da':url.pathname;if(!SHELL.includes(path)&&!path.startsWith('/assets/tea/'))return;
  event.respondWith(caches.match(path).then(cached=>cached||fetch(request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(path,response.clone()));return response;})).catch(()=>caches.match('/tra-da')));
});
