// Observe actual rendered character positions, using an isolated preview wallet.
async(page)=>{
  const context=await page.context().browser().newContext({viewport:{width:844,height:390},serviceWorkers:'block'}),base='http://127.0.0.1:3101',checks=[];
  const check=(yes,message)=>{if(!yes)throw Error(message);checks.push(message);};
  try{
    const wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json();
    await context.request.put(base+'/api/tea/profile',{headers:{'X-Wallet-Token':wallet.token},data:{nickname:'Garden Walk',hair:1,clothes:5,shoes:0}});
    await context.addInitScript(token=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi');},wallet.token);
    const f=await context.newPage(),errors=[];f.on('pageerror',e=>errors.push(e.message));await f.goto(base+'/tra-da/farm');await f.waitForFunction(()=>document.querySelector('#gold').textContent==='120');
    await f.evaluate(()=>{window.motionFrames=[];const draw=TeaFarmAvatar;window.TeaFarmAvatar=(...args)=>{window.motionFrames.push({x:args[1],y:args[2],direction:args[4],walking:args[6],at:performance.now()});if(window.motionFrames.length>1000)window.motionFrames.shift();draw(...args);};});
    await f.getByRole('button',{name:'Luống 4',exact:true}).click();
    await f.waitForFunction(()=>{const p=window.motionFrames.at(-1);return p&&Math.hypot(p.x-460,p.y-333)<1;});
    const walk=await f.evaluate(()=>{const frames=window.motionFrames,stops=frames.slice(1,-2).filter((p,i)=>Math.hypot(p.x-460,p.y-333)>5&&Math.hypot(p.x-frames[i].x,p.y-frames[i].y)<.01);return {stops:stops.length,directions:[...new Set(frames.filter(p=>p.walking).map(p=>p.direction))]};});
    check(walk.stops===0,'tap walking does not stop between waypoints');check(walk.directions.length>=2,'character faces the changing route');
    let held=false;await f.route('**/api/tea/farm/actions',async route=>{if(!held){held=true;await new Promise(resolve=>setTimeout(resolve,400));}await route.continue();});
    await f.evaluate(()=>window.seedButton=document.querySelector('.choices button'));
    await f.getByRole('button',{name:'Gieo Củ cải (6)',exact:true}).click();
    check(await f.evaluate(()=>document.querySelector('.choices button')===window.seedButton&&window.seedButton.disabled),'planting preserves its button while request is pending');
    await f.getByRole('button',{name:'Tưới nước',exact:true}).click();await f.locator('canvas[data-care-effect=water]').waitFor();await f.screenshot({path:'E:/blogger/output/farm-fluid-water.png'});
    await f.setViewportSize({width:568,height:320});
    check(await f.getByRole('button',{name:'Thu hoạch',exact:true}).evaluate(el=>{const a=el.getBoundingClientRect(),b=document.querySelector('#panel-content').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom;}),'harvest button visible without scrolling at 568x320');
    await f.screenshot({path:'E:/blogger/output/farm-fluid-568.png'});await f.setViewportSize({width:844,height:390});
    await f.locator('[data-panel=pond]').click();await f.getByRole('button',{name:'Thả cá Cá bảy màu (2)',exact:true}).click();await f.getByRole('button',{name:'Cho ăn',exact:true}).click();
    await f.locator('canvas[data-care-effect=feed]').waitFor();await f.screenshot({path:'E:/blogger/output/farm-fluid-feed.png'});
    await f.waitForFunction(()=>{const p=window.motionFrames.at(-1);return p&&Math.hypot(p.x-620,p.y-290)<1;});
    checks.push('route reaches pond bank and care feedback is visible');
    await f.locator('#close-panel').click();await f.locator('#farm-canvas').focus();
    await f.keyboard.down('ArrowDown');await f.waitForFunction(()=>window.motionFrames.at(-1)?.direction==='down');await f.keyboard.up('ArrowDown');
    await f.evaluate(()=>{window.stoppedAt=window.motionFrames.at(-1);});await f.waitForTimeout(150);
    check(await f.evaluate(()=>Math.hypot(window.motionFrames.at(-1).x-window.stoppedAt.x,window.motionFrames.at(-1).y-window.stoppedAt.y)<.01),'keyboard release stops movement');
    await f.keyboard.down('ArrowDown');await f.setViewportSize({width:390,height:844});await f.keyboard.up('ArrowDown');await f.locator('#portrait').waitFor();await f.setViewportSize({width:844,height:390});
    await f.evaluate(()=>window.stoppedAt=window.motionFrames.at(-1));await f.waitForTimeout(150);check(await f.evaluate(()=>Math.hypot(window.motionFrames.at(-1).x-window.stoppedAt.x,window.motionFrames.at(-1).y-window.stoppedAt.y)<.01),'rotation clears held movement');
    check(!errors.length,'no browser errors');return{checks};
  }finally{await context.close();}
}
