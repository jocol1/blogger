// Preview-only wallet and clock; no real transactions.
async(page)=>{
  const base='http://127.0.0.1:3101',context=await page.context().browser().newContext({viewport:{width:844,height:390},serviceWorkers:'block'}),checks=[],errors=[];
  const check=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  try{
    const wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json(),headers={'X-Wallet-Token':wallet.token};
    await context.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Explorer',hair:1,clothes:5,shoes:0}});
    await context.addInitScript(token=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi');},wallet.token);
    const f=await context.newPage();f.on('pageerror',e=>errors.push(e.message));await f.goto(base+'/tra-da/farm');await f.waitForFunction(()=>document.querySelector('#gold').textContent==='120');
    for(let slot=1;slot<=2;slot++){await f.getByRole('button',{name:`Luống ${slot}`,exact:true}).click();await f.getByRole('button',{name:`Gieo Củ cải (${7-slot})`,exact:true}).click();await f.getByRole('button',{name:'Tưới nước',exact:true}).waitFor();}
    await f.getByRole('button',{name:'Tưới tất cả (2)',exact:true}).click();await f.waitForFunction(()=>!document.querySelector('#panel-content').textContent.includes('Tưới tất cả'));
    const cared=await(await context.request.get(base+'/api/tea/farm',{headers})).json();check(cared.farm.plots.slice(0,2).every(row=>Number.isFinite(row.readyAt)),'water all writes both plots');
    await context.request.post(base+'/__test/tea/advance',{data:{ms:61000}});await f.reload();await f.waitForFunction(()=>document.querySelector('#gold').textContent==='120');await f.locator('[data-panel=garden]').click();
    await f.getByRole('button',{name:'Thu hoạch chín (2)',exact:true}).click();await f.waitForFunction(()=>!document.querySelector('#panel-content').textContent.includes('Thu hoạch chín'));
    await f.locator('[data-panel=bag]').click();f.once('dialog',dialog=>dialog.accept());await f.getByRole('button',{name:'Bán cả giỏ · 18 vàng',exact:true}).click();await f.waitForFunction(()=>document.querySelector('#gold').textContent==='138');checks.push('bulk harvest then confirmed basket sale');
    await f.evaluate(()=>{const draw=TeaFarmAvatar;window.TeaFarmAvatar=(...args)=>{window.avatarPosition={x:args[1],y:args[2]};draw(...args);};});
    for(const place of ['home','east','lake','orchard','market']){
      await f.locator('#map-toggle').click();await f.locator('#map-destination').selectOption(place);await f.locator('#map-go').click();
      await f.waitForFunction(id=>{const p=TeaFarmWorld.places.find(p=>p.id===id);return window.avatarPosition?.x===p.x&&window.avatarPosition?.y===p.y;},place);
      await f.screenshot({path:`E:/blogger/output/farm-zone-${place}.png`});
    }
    checks.push('fast travel reaches all new areas');
    const tapWorld=async(x,y)=>{await f.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const point=await f.evaluate(({x,y})=>{const canvas=document.querySelector('#farm-canvas'),r=canvas.getBoundingClientRect(),m=canvas.getContext('2d').getTransform(),dpr=Math.min(devicePixelRatio||1,2);return{x:r.left+(m.a*x+m.c*y+m.e)/dpr,y:r.top+(m.b*x+m.d*y+m.f)/dpr};},{x,y});await f.mouse.click(point.x,point.y);};
    await tapWorld(1740,390);await f.getByRole('button',{name:'Mua · 5 vàng',exact:true}).waitFor();await f.locator('#close-panel').click();
    await tapWorld(1815,510);await f.waitForFunction(()=>document.querySelector('#panel-title').textContent==='Giỏ đồ');await f.locator('#close-panel').click();checks.push('market counter and shipping box open their tools');
    await f.locator('#run-toggle').click();check(await f.locator('#run-toggle').getAttribute('aria-pressed')==='true','running toggle');
    for(const viewport of [{width:568,height:320},{width:844,height:390},{width:1024,height:768}]){
      await f.setViewportSize(viewport);await f.locator('#map-toggle').click();
      check(await f.locator('#map-go').evaluate(el=>{const r=el.getBoundingClientRect(),p=document.querySelector('#panel-content').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom&&document.documentElement.scrollWidth<=innerWidth;}),'map travel fits '+viewport.width);
      await f.screenshot({path:`E:/blogger/output/farm-map-${viewport.width}.png`});await f.locator('#close-panel').click();
    }
    await f.setViewportSize({width:844,height:390});await f.locator('#map-toggle').click();await f.locator('#map-destination').selectOption('lake');await f.locator('#map-go').click();
    // Fishing can be opened at the new destination without any paid upgrade.
    await tapWorld(1480,1135);await f.locator('#fishing-action').click();await f.waitForFunction(()=>document.querySelector('#fishing-action').dataset.phase==='waiting');await f.locator('.fishing-stop').click();checks.push('south dock opens free fishing');
    check(errors.length===0,'no uncaught browser errors');return{checks,errors};
  }finally{await context.close();}
}
