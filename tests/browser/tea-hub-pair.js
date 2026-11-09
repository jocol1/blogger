// Two real players in one browser context (different wallets per page): challenge, accept, play a move, react, resign.
// Run against a fresh loopback-only tests/preview.js instance (port 3101). Works with the Playwright MCP page.
async(page)=>{
 const base='http://127.0.0.1:3101',c=page.context(),checks=[],errors=[],out=name=>'E:/blogger/output/pair-'+name+'.png';
 const A=page;let B,headersA,headersB;
 await A.setViewportSize({width:844,height:390});
 try{
  // --- clean service worker state once, then let the fresh worker claim the page (it reloads once)
  await A.goto(base+'/tra-da');await A.waitForTimeout(1200);for(let n=0;n<3;n++){try{await A.evaluate(async()=>{for(const r of await navigator.serviceWorker?.getRegistrations?.()||[])await r.unregister();for(const k of await caches.keys())await caches.delete(k);});break;}catch{await A.waitForTimeout(600);}}
  const wallet=async name=>{const w=await(await c.request.post(base+'/api/game/wallets',{data:{}})).json(),headers={'X-Wallet-Token':w.token};await c.request.put(base+'/api/tea/profile',{headers,data:{nickname:name,language:'vi'}});return{token:w.token,headers};};
  const wa=await wallet('Anh Đỏ'),wb=await wallet('Chị Đen');headersA=wa.headers;headersB=wb.headers;
  const setup=(token)=>page=>page.addInitScript(t=>{localStorage.setItem('locly-game-wallet',t);localStorage.setItem('locly-tea-language','vi');localStorage.setItem('locly-xq-muted','1');},token);
  await setup(wa.token)(A);
  A.on('pageerror',e=>errors.push('A: '+e.message));
  await A.goto(base+'/tra-da');await A.waitForFunction(()=>navigator.serviceWorker.controller,null,{timeout:15000}).catch(()=>{});await A.waitForTimeout(2200);
  await A.waitForFunction(()=>Boolean(document.querySelector('#cafe-canvas').dataset.playerX)&&document.querySelector('#connection-dot').classList.contains('live'));
  const sit=async(page,headers,chair)=>{let seat;for(let n=0;n<60;n++){seat=await c.request.post(base+'/api/tea/seats/'+chair,{headers,data:{}});if(seat.ok())return;await page.bringToFront();await page.keyboard.down(n%3===0?'w':n%3===1?'d':'a');await page.waitForTimeout(110);await page.keyboard.up(n%3===0?'w':n%3===1?'d':'a');await page.waitForTimeout(260);}throw Error('Could not sit at '+chair+': '+await seat.text());};
  await sit(A,headersA,'t5-3');await A.waitForFunction(()=>!document.querySelector('.menu-item').disabled);

  B=await c.newPage();await B.setViewportSize({width:844,height:390});B.on('pageerror',e=>errors.push('B: '+e.message));
  await setup(wb.token)(B);await B.goto(base+'/tra-da');await B.waitForFunction(()=>Boolean(document.querySelector('#cafe-canvas').dataset.playerX)&&document.querySelector('#connection-dot').classList.contains('live'));
  await sit(B,headersB,'t5-2');await B.waitForFunction(()=>!document.querySelector('.menu-item').disabled);
  const until=async(page,test,label,ms=12000)=>{const t=Date.now();while(Date.now()-t<ms){if(await page.evaluate(test).catch(()=>false))return;await page.waitForTimeout(150);}throw Error('Timed out waiting for '+label);};

  // --- A opens the lobby and sees B with a challenge button
  await A.bringToFront();await A.locator('#context-button').click();await A.locator('.hub-shell').waitFor();
  await A.locator('.hub-person:not(.me) .hub-challenge').waitFor();const chipText=await A.locator('.hub-person:not(.me)').innerText();if(!/Chị Đen/.test(chipText))throw Error('B missing from the people row: '+chipText);
  checks.push('lobby lists the other player with a Thách cờ button');
  await A.screenshot({path:out('A-lobby')});

  // --- A challenges, B gets the dialog
  await A.locator('.hub-person:not(.me) .hub-challenge').click();
  await B.bringToFront();await B.waitForFunction(()=>document.querySelector('#challenge-dialog').open,null,{timeout:8000});
  const title=await B.locator('#challenge-title').innerText();if(!/Anh Đỏ/.test(title))throw Error('Challenge dialog title: '+title);
  await B.screenshot({path:out('B-dialog')});checks.push('challenged player sees the dialog naming the challenger');
  if(!await A.locator('.hub-person:not(.me) .hub-challenge').isDisabled())throw Error('Challenge button should be disabled while one is pending');

  // --- B accepts: both land in the board, A is red and moves first
  await B.locator('#challenge-accept').click();
  await Promise.all([A.locator('.xq-shell').waitFor({timeout:10000}),B.locator('.xq-shell').waitFor({timeout:10000})]);
  await until(A,()=>document.querySelectorAll('.xq-piece').length===32,'A board');await until(B,()=>document.querySelectorAll('.xq-piece').length===32,'B board');
  await until(A,()=>/Lượt bạn/.test(document.querySelector('.xq-status p').textContent),'A to move');
  await until(B,()=>/Đợi/.test(document.querySelector('.xq-status p').textContent),'B waiting');
  if(!/\d+s/.test(await A.locator('.xq-clock').innerText()))throw Error('Friend games show a clock');
  checks.push('accepting starts a game for both: A red to move, B waiting, 60 s clock');

  // --- A plays the central cannon, B sees it and is flipped to the Black side
  const pos=async(page,sq,flip)=>page.evaluate(([sq,flip])=>{const svg=document.querySelector('.xq-board'),r=Math.floor(sq/9),col=sq%9,pt=svg.createSVGPoint();pt.x=56+(flip?8-col:col)*100;pt.y=56+(flip?9-r:r)*100;const m=pt.matrixTransform(svg.getScreenCTM());return{x:m.x,y:m.y};},[sq,flip]);
  await A.bringToFront();const from=await pos(A,70,false);await A.mouse.click(from.x,from.y);const to=await pos(A,67,false);await A.mouse.click(to.x,to.y);
  await until(B,()=>Boolean(document.querySelector('.xq-piece[data-sq="67"]'))&&/Lượt bạn/.test(document.querySelector('.xq-status p').textContent),'B sees the move and gets the turn',12000);
  const redRookTop=await B.evaluate(()=>document.querySelector('.xq-piece[data-sq="81"]').getBoundingClientRect().y);if(redRookTop>100)throw Error('Black should see Red\'s pieces at the top');
  await B.screenshot({path:out('B-board')});checks.push('A\'s move reaches B, B sees the flipped board and gets the turn');

  // --- B reacts, A sees the bubble
  await B.bringToFront();await B.locator('[data-xq=emote]').click();await B.locator('.xq-phrase').first().click();
  await A.bringToFront();await A.locator('.xq-bubble').first().waitFor({timeout:8000});checks.push('reaction from B shows on A');

  // --- A resigns, both see the result
  await A.locator('[data-xq=resign]').click();await A.locator('[data-xq=resign]').click();
  await A.locator('.xq-result').waitFor({timeout:8000});await B.locator('.xq-result').waitFor({timeout:8000});
  const ra=await A.locator('.xq-result h3').innerText(),rb=await B.locator('.xq-result h3').innerText();if(!/thua/.test(ra)||!/thắng/.test(rb))throw Error('Results: '+ra+' / '+rb);
  await B.waitForTimeout(450);await B.screenshot({path:out('B-result')});checks.push('resign: A sees defeat, B sees victory');

  // --- the café shows no running game afterwards
  await A.locator('.xq-result-actions button:not(.primary)').click();await A.locator('.hub-shell').waitFor();
  await until(A,()=>!document.querySelector('.hub-tile.live'),'live tag cleared');checks.push('lobby clears the live tag once the game ends');
  if(errors.length)throw Error(errors.join('\n'));return{checks,errors};
 }catch(error){await A.screenshot({path:out('failure-A')}).catch(()=>{});await B?.screenshot({path:out('failure-B')}).catch(()=>{});error.message+=' | passed: '+checks.length+' ('+checks.slice(-1)+') errors: '+errors.join(' / ');throw error;}
 finally{for(const h of [headersA,headersB])if(h)await c.request.delete(base+'/api/tea/seat',{headers:h}).catch(()=>{});if(B)await B.close().catch(()=>{});}
}
