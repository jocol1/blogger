// Run with tests/preview.js. Uses a separate test wallet; no real payments.
async(page)=>{
  const base='http://127.0.0.1:3101',context=await page.context().browser().newContext({viewport:{width:844,height:390},hasTouch:true,serviceWorkers:'block'}),checks=[],errors=[];
  const check=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  try{
    const wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json(),headers={'X-Wallet-Token':wallet.token};
    await context.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Fishing QA',language:'vi',hair:1,clothes:2,shoes:0}});
    await context.addInitScript(token=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi');},wallet.token);
    const farm=await context.newPage();farm.on('pageerror',error=>errors.push(error.message));
    await farm.goto(base+'/tra-da/farm');await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='120');
    await farm.locator('[data-panel=pond]').click();await farm.locator('#fishing-switch').click();
    await farm.evaluate(()=>{window.originalFishingButton=document.querySelector('#fishing-action');window.originalFishingMeter=document.querySelector('#fishing-meter');});
    let delayed=false;await farm.route('**/api/tea/farm/actions',async route=>{if(!delayed){delayed=true;await new Promise(resolve=>setTimeout(resolve,500));}await route.continue();});
    await farm.locator('#fishing-action').click();
    await farm.waitForFunction(()=>document.querySelector('#fishing-action').textContent==='Đang xử lý…');
    check(await farm.locator('#fishing-action').isDisabled(),'pending action has immediate disabled feedback');
    await farm.waitForFunction(()=>document.querySelector('#fishing-status').textContent.includes('Chờ phao'));
    await farm.waitForFunction(()=>document.querySelector('#fishing-action').dataset.phase==='waiting');
    check(await farm.evaluate(()=>window.originalFishingButton===document.querySelector('#fishing-action')&&window.originalFishingMeter===document.querySelector('#fishing-meter')),'cast acknowledgement preserves controls and meter');
    const initial=await(await context.request.get(base+'/api/tea/farm',{headers})).json();
    check(initial.farm.fishing.status==='waiting'&&!('prize' in initial.farm.fishing),'cast persisted without revealing prize');
    await farm.reload();await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='120');
    await farm.locator('[data-panel=pond]').click();await farm.locator('#fishing-switch').click();
    const restored=await(await context.request.get(base+'/api/tea/farm',{headers})).json();check(restored.farm.fishing.id===initial.farm.fishing.id,'reload resumes same cast');
    await farm.waitForFunction(()=>document.querySelector('#fishing-action')?.textContent==='Giật cần!'&&!document.querySelector('#fishing-action').disabled,null,{timeout:10000});
    await farm.evaluate(()=>{window.originalFishingButton=document.querySelector('#fishing-action');window.originalFishingMeter=document.querySelector('#fishing-meter');window.waitingButtonTop=document.querySelector('#fishing-action').getBoundingClientRect().top;});
    await farm.locator('#fishing-action').click();await farm.waitForFunction(()=>document.querySelector('#fishing-action').dataset.phase==='reeling');
    check(await farm.evaluate(()=>window.originalFishingButton===document.querySelector('#fishing-action')&&window.originalFishingMeter===document.querySelector('#fishing-meter')&&Math.abs(window.waitingButtonTop-document.querySelector('#fishing-action').getBoundingClientRect().top)<1),'hook changes neither control identity nor position');
    await farm.screenshot({path:'E:/blogger/output/fishing-reeling.png'});
    await farm.setViewportSize({width:568,height:320});
    check(await farm.locator('.fishing-stop').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('#panel-content').getBoundingClientRect().bottom),'reeling and cancel controls fit smallest landscape');
    check(await farm.locator('#panel-content').evaluate(el=>el.scrollHeight<=el.clientHeight),'smallest fishing panel needs no scrolling');
    await farm.emulateMedia({reducedMotion:'reduce'});
    await farm.waitForFunction(()=>!document.querySelector('#fishing-action').disabled);
    const firstMeter=await farm.locator('#fishing-meter').evaluate(el=>el.toDataURL());
    await farm.waitForTimeout(120);
    check(firstMeter!==await farm.locator('#fishing-meter').evaluate(el=>el.toDataURL()),'reduced motion keeps timing marker moving');
    await farm.evaluate(async()=>{
      const response=await fetch('/api/tea/farm',{headers:{'X-Wallet-Token':localStorage.getItem('locly-game-wallet')}}),state=await response.json(),offset=state.serverNow-Date.now(),start=state.farm.fishing.reelAt;
      await new Promise(resolve=>{function tick(){const p=1-Math.abs(((Math.max(0,Date.now()+offset-start)/1000)%2)-1),button=document.querySelector('#fishing-action');if(p>.44&&p<.54&&!button.disabled){button.click();resolve();}else requestAnimationFrame(tick);}tick();});
    });
    await farm.waitForFunction(()=>document.querySelector('#fishing-status')?.textContent.startsWith('Đã vào giỏ:'));
    const caught=await(await context.request.get(base+'/api/tea/farm',{headers})).json();
    check(caught.farm.products[caught.farm.fishing.caught]===1&&caught.farm.gold===120,'successful timing adds fish, not gold or paid coins');
    await farm.screenshot({path:'E:/blogger/output/fishing-caught.png'});
    for(const viewport of [{width:568,height:320},{width:740,height:360},{width:844,height:390},{width:1024,height:768}]){
      await farm.setViewportSize(viewport);
      const fit=await farm.evaluate(()=>{const button=document.querySelector('#fishing-action').getBoundingClientRect(),panel=document.querySelector('#panel-content').getBoundingClientRect(),world=document.querySelector('#farm-canvas').getBoundingClientRect();return button.top>=panel.top&&button.bottom<=panel.bottom&&button.right<=innerWidth&&world.right<=document.querySelector('aside').getBoundingClientRect().left+1&&document.documentElement.scrollWidth<=innerWidth;});
      check(fit,'visible fishing control and unobscured world '+viewport.width+'x'+viewport.height);
      await farm.screenshot({path:`E:/blogger/output/fishing-${viewport.width}.png`});
    }
    await farm.setViewportSize({width:844,height:390});await farm.locator('[data-panel=bag]').click();await farm.getByRole('button',{name:`Bán ×1 · ${caught.catalog[caught.farm.fishing.caught].sell} vàng`,exact:true}).click();
    await farm.waitForFunction(gold=>Number(document.querySelector('#gold').textContent)===gold,120+caught.catalog[caught.farm.fishing.caught].sell);checks.push('caught fish can be sold for farm gold');
    await farm.locator('[data-panel=pond]').click();await farm.locator('#fishing-switch').click();
    await farm.waitForFunction(()=>!document.querySelector('#fishing-action').disabled);await farm.locator('#fishing-action').click();
    await farm.locator('.fishing-stop').click();await farm.waitForFunction(()=>document.querySelector('#fishing-status')?.textContent==='Đã cất cần.');checks.push('put rod away without penalty');
    await farm.locator('header .cafe-link').click();await farm.waitForFunction(()=>document.querySelector('#connection-dot').classList.contains('live'));checks.push('return to cafe');
    check(errors.length===0,'no uncaught errors');return{checks,errors};
  }finally{await context.close();}
}
