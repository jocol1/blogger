// Run against a fresh loopback-only tests/preview.js instance; uses fake wallets and time.
async(page)=>{
 const base='http://127.0.0.1:3101',c=await page.context().browser().newContext({viewport:{width:844,height:390},hasTouch:true,serviceWorkers:'block'}),checks=[],errors=[];let headers;
 try{
  const w=await(await c.request.post(base+'/api/game/wallets',{data:{}})).json();headers={'X-Wallet-Token':w.token};await c.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Barista QA <b>',language:'vi'}});await c.addInitScript(token=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi');},w.token);
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/tra-da');await p.waitForFunction(()=>Boolean(document.querySelector('#cafe-canvas').dataset.playerX)&&document.querySelector('#connection-dot').classList.contains('live'));
  await p.keyboard.down('d');await p.waitForFunction(()=>+document.querySelector('#cafe-canvas').dataset.playerX>=180);await p.keyboard.up('d');await p.keyboard.down('w');await p.waitForFunction(()=>+document.querySelector('#cafe-canvas').dataset.playerY<=505);await p.keyboard.up('w');await p.waitForTimeout(150);
  const seat=await c.request.post(base+'/api/tea/seats/t5-3',{headers,data:{}});if(!seat.ok())throw Error(await seat.text());await p.waitForFunction(()=>!document.querySelector('.menu-item').disabled);
  async function open(){await p.locator('#context-button').click();await p.locator('.hub-tile[data-tile=barista]').click();}
  const read=async()=>(await(await c.request.get(base+'/api/tea/games/barista',{headers})).json()).game;
  await open();await p.locator('#mini-start').waitFor();if(await p.locator('#mini-bots').isVisible()||await p.locator('#mini-start').isDisabled())throw Error('Solo lobby broken');await p.locator('#mini-start').click();await p.locator('.barista-shell').waitFor();
  let expectedScore=0;
  for(let round=1;round<=5;round++){
   const game=await read();if(game.round!==round||game.phase!=='preview')throw Error('Bad preview');if(!await p.locator('.barista-recipe').isVisible())throw Error('No recipe shown');
   await c.request.post(base+'/__test/tea/advance',{data:{ms:5000}});await p.locator('[data-mix=tea]').waitFor();await p.waitForFunction(()=>!document.querySelector('[data-mix=tea]').disabled);
   if((await read()).recipe!==null||await p.locator('.barista-recipe').isVisible())throw Error('Recipe still visible');
   const chosen=round===2?game.recipe.slice().reverse():game.recipe;
   await p.locator('[data-mix='+chosen[0]+']').click();await p.getByRole('button',{name:'Bỏ bước cuối',exact:true}).click();if(await p.locator('.barista-tray [data-ingredient="'+chosen[0]+'"]').count())throw Error('Undo failed');await p.locator('[data-mix='+chosen[0]+']').click();
   if(round===1){await p.waitForTimeout(1400);if(await p.locator('.barista-tray [data-ingredient="'+chosen[0]+'"]').count()!==1)throw Error('Poll erased mix');await p.reload();await p.waitForFunction(()=>document.querySelector('#connection-dot').classList.contains('live'));await open();await p.locator('.barista-tray [data-ingredient="'+chosen[0]+'"]').waitFor();checks.push('solo starts, hidden recipe, undo, poll and reload preserve unfinished drink');}
   for(const ingredient of chosen.slice(1))await p.locator('[data-mix='+ingredient+']').click();
   if(round===1)for(const size of [{width:568,height:320},{width:844,height:390},{width:1280,height:800}]){await p.setViewportSize(size);await p.waitForTimeout(80);const fit=await p.evaluate(()=>{const shell=document.querySelector('.barista-shell').getBoundingClientRect(),buttons=[...document.querySelectorAll('.barista-ingredients button,.barista-actions button:not([hidden])')].filter(n=>n.getClientRects().length);return shell.bottom<=innerHeight+1&&buttons.every(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})&&document.documentElement.scrollWidth===innerWidth;});if(!fit)throw Error('Controls clipped at '+size.width);await p.screenshot({path:'E:/blogger/output/barista-'+size.width+'.png'});}await p.setViewportSize({width:844,height:390});
   await p.getByRole('button',{name:'Giao ly',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('.barista-recipe').hidden&&document.querySelector('.barista-ingredients').hidden);const result=await read();if(round!==2)expectedScore++;if(result.players[0].score!==expectedScore||result.phase!=='result')throw Error('Wrong score/result');
   await c.request.post(base+'/__test/tea/advance',{data:{ms:3500}});if(round<5)await p.waitForFunction(round=>document.querySelector('.barista-head h3').textContent.endsWith((round+1)+'/5'),round);else await p.locator('.barista-again').waitFor();
  }
  if((await read()).status!=='finished'||expectedScore!==4)throw Error('Shift did not finish');checks.push('five rounds, one wrong drink, correct 4/5 result; mobile and desktop controls all visible');
  await p.locator('.games-view .back-cafe').click();if(await p.locator('.barista-shell').isVisible())throw Error('Cannot return to cafe');checks.push('Back to cafe works');
  if(errors.length)throw Error(errors.join('\n'));return{checks,errors};
 }finally{if(headers)await c.request.delete(base+'/api/tea/seat',{headers}).catch(()=>{});await c.close();}
}
