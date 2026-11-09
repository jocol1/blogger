// Run against a fresh loopback-only tests/preview.js instance (port 3101); uses fake wallets and time.
// Works with a standalone Playwright context or the Playwright MCP page (it reuses the page it is given).
async(page)=>{
 const base='http://127.0.0.1:3101',c=page.context(),checks=[],errors=[];let headers;await page.setViewportSize({width:844,height:390});
 const out=name=>'E:/blogger/output/xiangqi-'+name+'.png';
 try{
  const w=await(await c.request.post(base+'/api/game/wallets',{data:{}})).json();headers={'X-Wallet-Token':w.token};
  await c.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Cờ thủ QA',language:'vi'}});
  await c.addInitScript(token=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi');localStorage.setItem('locly-xq-muted','1');},w.token);
  const p=page;p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto(base+'/tra-da');await p.waitForFunction(()=>Boolean(document.querySelector('#cafe-canvas').dataset.playerX)&&document.querySelector('#connection-dot').classList.contains('live'));
  // Spawn is random (x 90-190, y 560); chair t5-3 sits at (110,501) and must be within 96px, so nudge left/up until the server accepts.
  let seat;for(let n=0;n<40;n++){seat=await c.request.post(base+'/api/tea/seats/t5-3',{headers,data:{}});if(seat.ok())break;await p.keyboard.down(n%2?'w':'a');await p.waitForTimeout(110);await p.keyboard.up(n%2?'w':'a');await p.waitForTimeout(260);}
  if(!seat.ok())throw Error(await seat.text()+' at '+await p.evaluate(()=>JSON.stringify(document.querySelector('#cafe-canvas').dataset)));await p.waitForFunction(()=>!document.querySelector('.menu-item').disabled);
  const read=async()=>(await(await c.request.get(base+'/api/tea/games/xiangqi',{headers})).json()).game;
  const until=async(test,label,ms=9000)=>{const t=Date.now();while(Date.now()-t<ms){if(await test())return;await p.waitForTimeout(150);}throw Error('Timed out waiting for '+label);};
  const pos=sq=>p.evaluate(sq=>{const svg=document.querySelector('.xq-board'),flip=false,r=Math.floor(sq/9),col=sq%9,pt=svg.createSVGPoint();pt.x=56+(flip?8-col:col)*100;pt.y=56+(flip?9-r:r)*100;const m=pt.matrixTransform(svg.getScreenCTM());return{x:m.x,y:m.y};},sq);
  const fits=async label=>{let result;for(let attempt=0;attempt<15;attempt++){result=await measure();if(result.board&&result.corners&&result.buttons&&result.hscroll&&result.vscroll&&result.filled)return result;await p.waitForTimeout(120);}throw Error('Layout clipped at '+label+': '+JSON.stringify(result));};
  const measure=async()=>{
   const result=await p.evaluate(()=>{
    const vis=n=>n&&n.getClientRects().length>0,inside=n=>{const r=n.getBoundingClientRect();return r.left>=-0.5&&r.right<=innerWidth+0.5&&r.top>=-0.5&&r.bottom<=innerHeight+0.5;};
    const svg=document.querySelector('.xq-board'),corners=[0,8,81,89].map(sq=>document.querySelector('.xq-piece[data-sq="'+sq+'"]')),buttons=[...document.querySelectorAll('.xq-actions button')].filter(vis);
    return{board:inside(svg),corners:corners.every(n=>n&&inside(n)),buttons:buttons.every(inside),hscroll:document.documentElement.scrollWidth<=innerWidth,vscroll:document.documentElement.scrollHeight<=innerHeight+1,cell:Math.round(svg.getBoundingClientRect().height/1012*100*10)/10,filled:svg.getBoundingClientRect().height>=0.85*(innerHeight-(document.querySelector('.games-view .game-page-heading')?.getClientRects().length?document.querySelector('.games-view .game-page-heading').getBoundingClientRect().height:0))};
   });
   return result;
  };
  await p.locator('#context-button').click();await p.locator('.hub-tile[data-tile=xiangqi]').click();
  await p.locator('.xq-lobby').waitFor();await p.locator('#xq-start').waitFor();
  if(!(await p.locator('[data-opponent=friend]').isDisabled()))throw Error('Friend mode should be disabled when sitting alone');
  await p.waitForFunction(()=>document.querySelectorAll('.xq-list li').length>0);
  await p.screenshot({path:out('lobby')});checks.push('lobby: rating card, bot/friend choice (friend off when alone), empty leaderboard');
  await p.locator('[data-level=easy]').click();await p.locator('#xq-start').click();await p.locator('.xq-shell').waitFor();
  await p.waitForFunction(()=>document.querySelectorAll('.xq-piece').length===32);
  if(await p.locator('.games-view .game-page-heading').isVisible())throw Error('Phone landscape should give the whole height to the board');
  checks.push('game opens with 32 pieces; header hidden on phone landscape; layout '+JSON.stringify(await fits('844x390')));
  await p.screenshot({path:out('opening-844')});
  // tap, tap: central cannon
  const cannon=await pos(70);await p.mouse.click(cannon.x,cannon.y);
  const dots=await p.locator('.xq-board circle[fill^="rgba(30,120,70"]').count();if(dots<4)throw Error('Expected legal-move dots, saw '+dots);
  const target=await pos(67);await p.mouse.click(target.x,target.y);
  await p.waitForFunction(()=>document.querySelector('.xq-piece[data-sq="67"]'));
  if((await read()).moves<1)throw Error('Move was not recorded');
  await until(async()=>(await read()).moves>=2,'the bot reply');await p.waitForFunction(()=>/Lượt bạn/.test(document.querySelector('.xq-status p').textContent));
  checks.push('tap-tap move shows dots, plays optimistically, bot answers');
  // drag: soldier from (6,0) to (5,0)
  const horse=await pos(54),dest=await pos(45);
  await p.mouse.move(horse.x,horse.y);await p.mouse.down();await p.mouse.move((horse.x+dest.x)/2,(horse.y+dest.y)/2,{steps:4});await p.mouse.move(dest.x,dest.y,{steps:4});await p.mouse.up();
  await p.waitForFunction(()=>document.querySelector('.xq-piece[data-sq="45"]')&&!document.querySelector('.xq-piece[data-sq="54"]'));
  await until(async()=>(await read()).moves>=4,'the second bot reply');
  checks.push('drag-and-drop move accepted');
  // illegal drag snaps back
  await p.waitForFunction(()=>/Lượt bạn/.test(document.querySelector('.xq-status p').textContent));
  const rook=await pos(81),bad=await pos(40);await p.mouse.move(rook.x,rook.y);await p.mouse.down();await p.mouse.move(bad.x,bad.y,{steps:6});await p.mouse.up();await p.waitForTimeout(350);
  if(!await p.locator('.xq-piece[data-sq="81"]').count()||(await read()).moves!==4)throw Error('Illegal drag should snap back');
  checks.push('illegal drop snaps back without sending anything');
  // hint (needs a second tap), emote, take-back
  await p.locator('[data-xq=hint]').click();await p.locator('[data-xq=hint]').click();await p.locator('path.xq-hintline').waitFor({state:'attached'});
  if((await read()).rated!==false)throw Error('Hint should make the game unrated');
  await p.locator('[data-xq=emote]').click();await p.locator('.xq-phrase').first().click();await p.locator('.xq-bubble').first().waitFor();
  await p.screenshot({path:out('hint-emote-844')});checks.push('hint arrow (unrated) and table reaction bubble');
  await p.locator('[data-xq=undo]').click();await until(async()=>(await read()).moves===2,'take-back');
  await until(async()=>(await p.locator('.xq-piece').count())===[...(await read()).board].filter(ch=>ch!=='.').length,'board repaint after take-back');
  checks.push('take-back with the bot removes both moves');
  for(const size of [{width:568,height:320},{width:667,height:375},{width:844,height:390},{width:1280,height:800}]){
   await p.setViewportSize(size);await p.waitForTimeout(150);checks.push('fits '+size.width+'x'+size.height+' '+JSON.stringify(await fits(size.width+'x'+size.height)));await p.screenshot({path:out('game-'+size.width)});
  }
  await p.setViewportSize({width:844,height:390});
  await p.locator('[data-xq=resign]').click();await p.locator('[data-xq=resign]').click();await p.locator('.xq-result').waitFor();await p.waitForTimeout(450);
  await p.screenshot({path:out('result-844')});checks.push('resign shows the result card');
  await p.locator('.xq-result-actions button:not(.primary)').click();await p.locator('.hub-shell').waitFor();checks.push('result card returns to the table lobby');await p.locator('.hub-tile[data-tile=xiangqi]').click();await p.locator('.xq-lobby').waitFor();checks.push('reopening Cờ tướng shows its own lobby, not the old result');
  await p.locator('#xq-start').click();await p.locator('.xq-shell').waitFor();await p.waitForFunction(()=>document.querySelectorAll('.xq-piece').length===32);
  await p.locator('[data-xq=back]').click();if(await p.locator('.xq-shell').isVisible())throw Error('Cannot leave to the café');checks.push('back to café works');
  if(errors.length)throw Error(errors.join('\n'));return{checks,errors};
 }catch(error){await page.screenshot({path:out('failure')}).catch(()=>{});error.message+=' | status: '+await page.evaluate(()=>document.querySelector('.xq-status')?.innerText).catch(()=>'?')+' | ';error.message+=' | passed: '+checks.length+' ('+checks.slice(-1)+') errors: '+errors.join(' / ');throw error;}
 finally{if(headers)await c.request.delete(base+'/api/tea/seat',{headers}).catch(()=>{});}
}
