// Reproduces the cross-tab lock after an interrupted action; also checks care feedback.
async(page)=>{
  const context=await page.context().browser().newContext({viewport:{width:844,height:390},serviceWorkers:'block'}),checks=[],errors=[];
  try{
    const base='http://127.0.0.1:3101',wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json();
    await context.request.put(base+'/api/tea/profile',{headers:{'X-Wallet-Token':wallet.token},data:{nickname:'Care Test'}});
    await context.addInitScript(token=>{if(location.origin==='http://127.0.0.1:3101')localStorage.setItem('locly-game-wallet',token)},wallet.token);
    const first=await context.newPage(),second=await context.newPage();
    for(const live of [first,second]){live.on('pageerror',e=>errors.push(e.message));await live.goto(base+'/tra-da/farm');await live.waitForFunction(()=>document.querySelector('#gold').textContent==='120');await live.locator('[data-panel=shop]').click();}
    // Server receives the purchase, but the original tab never receives the response.
    await first.route('**/api/tea/farm/actions',async route=>{await route.fetch();await route.abort('failed');});
    await first.getByRole('button',{name:'Buy · 5 gold',exact:true}).click();await first.locator('#retry').waitFor();
    await second.locator('#retry').waitFor({timeout:3000});await first.close();
    await second.locator('#retry').click();await second.waitForFunction(()=>document.querySelector('#gold').textContent==='115');
    if(await second.getByRole('button',{name:'Buy · 5 gold',exact:true}).isDisabled())throw Error('Other tab is still locked');
    checks.push('recover closed tab once without reload or double charge');
    await second.locator('[data-panel=garden]').click();await second.getByRole('button',{name:'Plant Radish (7)',exact:true}).click();
    await second.locator('canvas[data-care-effect=plant]').waitFor();await second.waitForTimeout(900);
    await second.getByRole('button',{name:'Water',exact:true}).click();await second.locator('canvas[data-care-effect=water]').waitFor();
    await second.screenshot({path:'E:/blogger/output/farm-care-water.png'});checks.push('plant and water animate after acknowledgement');
    await second.locator('[data-panel=pond]').click();await second.getByRole('button',{name:'Add fish Guppy (2)',exact:true}).click();await second.getByRole('button',{name:'Feed',exact:true}).click();
    await second.locator('canvas[data-care-effect=feed]').waitFor();await second.screenshot({path:'E:/blogger/output/farm-care-feed.png'});checks.push('fish feeding visible');
    await context.request.post(base+'/__test/tea/advance',{data:{ms:121000}});await second.reload();await second.waitForFunction(()=>document.querySelector('#gold').textContent==='115');
    await second.emulateMedia({reducedMotion:'reduce'});await second.locator('[data-panel=pond]').click();await second.getByRole('button',{name:'Catch',exact:true}).click();
    await second.locator('canvas[data-care-effect=catch]').waitFor();await second.screenshot({path:'E:/blogger/output/farm-care-reduced.png'});checks.push('catch remains usable with reduced motion');
    await second.locator('[data-panel=garden]').click();await second.getByRole('button',{name:'Harvest',exact:true}).click();await second.locator('canvas[data-care-effect=harvest]').waitFor();
    const result=await(await context.request.get(base+'/api/tea/farm',{headers:{'X-Wallet-Token':wallet.token}})).json();
    if(result.farm.products.radish!==1||result.farm.products.guppy!==1)throw Error('Wrong harvest');
    if(errors.length)throw Error(errors.join('\n'));return{checks,errors};
  }finally{await context.close();}
}
