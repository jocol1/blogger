// Run against a fresh loopback-only tests/preview.js instance (port 3101); uses fake wallets and time.
// Works with a standalone Playwright context or the Playwright MCP page (it reuses the page it is given).
async(page)=>{
 const base='http://127.0.0.1:3101',c=page.context(),checks=[],errors=[];let headers;await page.setViewportSize({width:844,height:390});
 const out=name=>'E:/blogger/output/hub-'+name+'.png';
 try{
  await page.goto(base+'/tra-da');await page.waitForTimeout(1200);for(let n=0;n<3;n++){try{await page.evaluate(async()=>{for(const r of await navigator.serviceWorker?.getRegistrations?.()||[])await r.unregister();for(const k of await caches.keys())await caches.delete(k);});break;}catch{await page.waitForTimeout(600);}}
  const w=await(await c.request.post(base+'/api/game/wallets',{data:{}})).json();headers={'X-Wallet-Token':w.token};
  await c.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Khách Hub',language:'vi'}});
  await c.addInitScript(token=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi');localStorage.removeItem('locly-hub-last');},w.token);
  const p=page;p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto(base+'/tra-da');
  // A freshly registered service worker claims the page and pwa.js reloads it once; let that happen before the test starts.
  await p.waitForFunction(()=>navigator.serviceWorker.controller,null,{timeout:15000}).catch(()=>{});await p.waitForTimeout(2200);
  await p.waitForFunction(()=>Boolean(document.querySelector('#cafe-canvas').dataset.playerX)&&document.querySelector('#connection-dot').classList.contains('live'));
  let seat;for(let n=0;n<40;n++){seat=await c.request.post(base+'/api/tea/seats/t5-3',{headers,data:{}});if(seat.ok())break;await p.keyboard.down(n%2?'w':'a');await p.waitForTimeout(110);await p.keyboard.up(n%2?'w':'a');await p.waitForTimeout(260);}
  if(!seat.ok())throw Error(await seat.text());await p.waitForFunction(()=>!document.querySelector('.menu-item').disabled);
  const until=async(test,label,ms=9000)=>{const t=Date.now();while(Date.now()-t<ms){if(await test())return;await p.waitForTimeout(150);}throw Error('Timed out waiting for '+label);};
  const measure=()=>p.evaluate(()=>{
   const vis=n=>n&&n.getClientRects().length>0,inside=n=>{const r=n.getBoundingClientRect();return r.left>=-0.5&&r.right<=innerWidth+0.5&&r.top>=-0.5&&r.bottom<=innerHeight+0.5;};
   const bar=[...document.querySelectorAll('.hub-actions button')].filter(vis),tiles=[...document.querySelectorAll('.hub-tile')].filter(vis);
   const body=document.querySelector('#hub-body');
   return{bar:bar.every(inside),tiles:tiles.length,tilesFit:tiles.every(n=>{const r=n.getBoundingClientRect();return r.left>=-0.5&&r.right<=innerWidth+0.5;}),hscroll:document.documentElement.scrollWidth<=innerWidth,bodyOverflow:body.scrollHeight-body.clientHeight,tileH:Math.round(tiles[0].getBoundingClientRect().height)};
  });
  const fits=async label=>{let r;for(let i=0;i<15;i++){r=await measure();if(r.bar&&r.tilesFit&&r.hscroll&&r.tiles===13)return r;await p.waitForTimeout(120);}throw Error('Hub clipped at '+label+': '+JSON.stringify(r));};

  // --- open the lobby
  await p.locator('#context-button').click();await p.locator('.hub-shell').waitFor();
  await p.waitForFunction(()=>document.querySelectorAll('.hub-tile').length===13&&document.querySelector('.hub-person.me'));
  const title=await p.locator('#table-name').innerText();if(!/Bàn 5/.test(title))throw Error('Table title wrong: '+title);
  checks.push('Mở bàn opens the lobby: 13 game tiles, me in the people row, '+title+' '+JSON.stringify(await fits('844x390')));
  await p.screenshot({path:out('lobby-844')});

  // --- chat drawer
  await p.evaluate(()=>{window.__log=[];const d=document.querySelector('#hub-chat');new MutationObserver(()=>window.__log.push(['hidden',performance.now()|0,d.hidden])).observe(d,{attributes:true,attributeFilter:['hidden']});document.addEventListener('click',e=>window.__log.push(['click',performance.now()|0,e.target.id||e.target.className]),true);});
  await p.locator('#hub-chat-open').click();await p.locator('#hub-chat').waitFor();
  await p.locator('#chat-input').fill('Xin chào cả bàn');await p.locator('#chat-form button').click();await p.locator('#chat-list .message',{hasText:'Xin chào cả bàn'}).waitFor();
  await p.screenshot({path:out('chat-844')});await p.locator('#hub-chat-close').click();if(await p.locator('#hub-chat').isVisible())throw Error('Chat drawer did not close');
  checks.push('chat drawer opens, sends and closes');

  // --- every game opens and gets you back to the lobby
  await p.locator('.hub-tile[data-tile=xiangqi]').click();await p.locator('.xq-lobby').waitFor();
  if(await p.locator('.hub-shell').isVisible())throw Error('Lobby should be hidden inside a game');
  await p.locator('.games-view .back-hub').click();await p.locator('.hub-shell').waitFor();
  checks.push('Cờ tướng tile opens the xiangqi lobby; ← Sảnh bàn returns');
  await p.locator('.hub-tile[data-tile=quiz]').click();await p.locator('#mini-game-stage .mini-lobby').waitFor();await p.locator('.games-view .back-hub').click();await p.locator('.hub-shell').waitFor();
  await p.locator('.hub-tile[data-tile=tienlen]').click();await p.locator('#tl-lobby').waitFor();
  if(!(await p.locator('.cards-view.active').count()))throw Error('Cards view not active');
  await p.screenshot({path:out('tienlen-844')});await p.locator('.cards-view .back-hub').click();await p.locator('.hub-shell').waitFor();
  checks.push('mini game and card game tiles open their games and come back');
  await p.locator('.hub-tile[data-tile=poker]').click();await p.locator('.cards-view.active').waitFor();await p.locator('#card-game-switch').waitFor({state:'attached'});await p.locator('.cards-view .back-hub').click();await p.locator('.hub-shell').waitFor();

  // --- quick play remembers the last game
  await p.locator('#hub-quick').click();await p.waitForFunction(()=>document.querySelector('#pk-lobby, #pokers-lobby, .cards-view.active'));
  if(!(await p.locator('.cards-view.active').count()))throw Error('Quick play should reopen the last game (poker)');
  await p.locator('.cards-view .back-hub').click();await p.locator('.hub-shell').waitFor();checks.push('quick play reopens the last game');

  // --- brawl tile opens the drawer with the challenge picker
  await p.locator('.hub-tile[data-tile=brawl]').click();await p.locator('#hub-chat').waitFor();
  if(!await p.locator('.brawl-details').evaluate(n=>n.open))throw Error('Brawl picker should be expanded');await p.locator('#hub-chat-close').click();
  checks.push('brawl tile opens the challenge picker');

  // --- order menu and back
  await p.locator('#hub-menu').click();await p.locator('.menu-grid').waitFor();await p.locator('.panel-tabs [data-tab=table]').click();await p.locator('.hub-shell').waitFor();
  checks.push('Gọi món and back to the lobby');

  // --- a running game shows on the lobby and drops you straight into it
  const started=await c.request.post(base+'/api/tea/games',{headers,data:{key:'xiangqi',botCount:0,opponent:'bot',level:'easy',requestId:'hub-test-'+Date.now()+'-abcdef'}});if(!started.ok())throw Error(await started.text());
  await p.locator('#hub-live').waitFor();const liveText=await p.locator('#hub-live').innerText();if(!/Cờ tướng/.test(liveText)||!/Khách Hub/.test(liveText))throw Error('Live banner wrong: '+liveText);
  if(!(await p.locator('.hub-tile[data-tile=xiangqi].live').count()))throw Error('Xiangqi tile should be marked live');
  await p.screenshot({path:out('lobby-live')});
  await p.locator('.hub-live-go').click();await p.locator('.xq-shell').waitFor();await p.locator('[data-xq=back]').click();await p.locator('.hub-shell').waitFor();
  checks.push('running game: live banner with names, tile marked, one tap drops into the board');

  // --- sizes
  for(const size of [{width:568,height:320},{width:667,height:375},{width:844,height:390},{width:1280,height:800}]){
   await p.setViewportSize(size);await p.waitForTimeout(150);checks.push('lobby fits '+size.width+'x'+size.height+' '+JSON.stringify(await fits(size.width+'x'+size.height)));await p.screenshot({path:out('lobby-'+size.width)});
  }
  await p.setViewportSize({width:844,height:390});
  await p.locator('.hub-actions .back-cafe').click();await until(async()=>!(await p.locator('.hub-shell').isVisible()),'leaving to the café');
  await p.waitForTimeout(700);await p.screenshot({path:out('cafe-pill')});checks.push('Về quán closes the lobby');
  if(errors.length)throw Error(errors.join('\n'));return{checks,errors};
 }catch(error){await page.screenshot({path:out('failure')}).catch(()=>{});error.message+=' | log: '+await page.evaluate(()=>JSON.stringify(window.__log||[])).catch(()=>'?')+' | passed: '+checks.length+' ('+checks.slice(-1)+') errors: '+errors.join(' / ');throw error;}
 finally{if(headers)await c.request.delete(base+'/api/tea/seat',{headers}).catch(()=>{});}
}
