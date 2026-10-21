// Run against tests/preview.js only. Fake wallet, fake bank, controlled server clock.
async(page)=>{
  const base='http://127.0.0.1:3101',browser=page.context().browser();
  const context=await browser.newContext({viewport:{width:1280,height:850},hasTouch:true,serviceWorkers:'block'}),errors=[],checks=[];
  const check=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
  try{
    const wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json(),headers={'X-Wallet-Token':wallet.token};
    await context.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Mochi <b>',language:'vi',hair:1,clothes:2,shoes:0}});
    await context.addInitScript(token=>{if(location.origin==='http://127.0.0.1:3101'){localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi')}},wallet.token);
    const farm=await context.newPage();farm.on('pageerror',error=>errors.push(error.message));
    await farm.goto(base+'/tra-da');await farm.waitForFunction(()=>document.querySelector('#connection-dot').classList.contains('live'));
    await farm.locator('#farm-link').click();await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='120');
    check(await farm.locator('#owner').innerText()==='Mochi <b> · NÔNG TRẠI RIÊNG','nickname is rendered literally');
    check((await(await context.request.get(base+'/api/tea/state',{headers})).json()).guests.every(g=>g.walletId!==wallet.id),'farm player leaves shared cafe');
    await farm.getByRole('button',{name:'Gieo Củ cải (6)',exact:true}).click();await farm.getByRole('button',{name:'Tưới nước',exact:true}).click();
    await farm.waitForFunction(()=>Boolean(document.querySelector('.timer')));
    await farm.locator('[data-panel=pond]').click();await farm.getByRole('button',{name:'Thả cá Cá bảy màu (2)',exact:true}).click();await farm.getByRole('button',{name:'Cho ăn',exact:true}).click();
    await farm.waitForFunction(()=>Boolean(document.querySelector('.timer')));
    await farm.reload();await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='120');await farm.locator('[data-panel=pond]').click();
    check(await farm.getByRole('button',{name:'Bắt cá',exact:true}).isDisabled(),'reload preserves growing fish');
    const peer=await context.newPage();await peer.goto(base+'/tra-da/farm');await peer.waitForFunction(()=>document.querySelector('#gold').textContent==='120');
    await context.request.post(base+'/__test/tea/advance',{data:{ms:121000}});
    await farm.reload();await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='120');
    await farm.locator('[data-panel=garden]').click();await farm.getByRole('button',{name:'Thu hoạch',exact:true}).click();
    await farm.getByRole('button',{name:'Gieo Củ cải (5)',exact:true}).waitFor();
    await farm.locator('[data-panel=pond]').click();await farm.getByRole('button',{name:'Bắt cá',exact:true}).click();await farm.getByRole('button',{name:'Thả cá Cá bảy màu (1)',exact:true}).waitFor();
    await farm.locator('[data-panel=bag]').click();await farm.getByRole('button',{name:'Bán ×1 · 9 vàng',exact:true}).click();await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='129');
    await farm.getByRole('button',{name:'Bán ×1 · 18 vàng',exact:true}).click();await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='147');
    await farm.locator('[data-panel=quests]').click();await farm.getByRole('button',{name:'Nhận thưởng',exact:true}).first().click();await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='167');
    await farm.getByRole('button',{name:'Nhận thưởng',exact:true}).first().click();await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='192');
    await farm.locator('[data-panel=shop]').click();await farm.getByRole('button',{name:'Mua · 35 vàng',exact:true}).click();await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='157');
    await farm.locator('[data-panel=decorate]').click();await farm.getByRole('button',{name:'Đặt Bồn hoa',exact:true}).first().click();await farm.getByRole('button',{name:'Cất đi',exact:true}).waitFor();
    await farm.locator('[data-panel=garden]').click();await farm.getByRole('button',{name:'Thêm 2 luống · 120 vàng',exact:true}).click();await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='37');
    check(await farm.locator('.slots button').count()===8,'harvest, sell, rewards, decorate and upgrade persist');
    await peer.waitForFunction(()=>document.querySelector('#gold').textContent==='37',null,{timeout:15000});checks.push('second tab catches up');
    await farm.screenshot({path:'E:/blogger/output/farm-desktop.png'});
    for(const viewport of [{width:568,height:320},{width:740,height:360},{width:844,height:390},{width:1024,height:768}]){
      await farm.setViewportSize(viewport);await farm.locator('[data-panel=pond]').click();
      const measure=await farm.evaluate(()=>{const canvas=document.querySelector('canvas').getBoundingClientRect(),panel=document.querySelector('aside').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,overlap:canvas.right>panel.left+1,footer:[...document.querySelectorAll('footer button')].every(b=>{const r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth}),visible:canvas.width>200&&canvas.height>130};});
      check(!measure.overflow&&!measure.overlap&&measure.footer&&measure.visible,'landscape fits '+viewport.width+'x'+viewport.height);
      await farm.screenshot({path:`E:/blogger/output/farm-${viewport.width}.png`});
      await farm.locator('[data-panel=pond]').click();
    }
    await farm.setViewportSize({width:390,height:844});check(await farm.locator('#portrait').isVisible(),'portrait rotation guard');await farm.locator('#portrait-wallet').click();check(await farm.locator('#wallet-dialog').isVisible(),'backup available in portrait');check(await farm.locator('#wallet-code').inputValue()===wallet.token,'farm uses same backup code');await farm.locator('#close-wallet').click();
    await farm.setViewportSize({width:844,height:390});await farm.locator('#lang').click();check(await farm.locator('.brand strong').innerText()==='My little farm','English switch');
    // Abort a request after the server commits it: retry must reuse the same request id.
    let interrupted=false;await farm.route('**/api/tea/farm/actions',async route=>{if(!interrupted){interrupted=true;await route.fetch();await route.abort('failed');}else await route.continue();});
    await farm.locator('[data-panel=shop]').click();await farm.getByRole('button',{name:'Buy · 5 gold',exact:true}).click();await farm.locator('#retry').waitFor();await farm.reload();await farm.locator('#retry').waitFor();await farm.locator('#retry').click();await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='32');checks.push('lost response and reload retry charge once');
    await context.setOffline(true);await farm.reload({waitUntil:'domcontentloaded'}).catch(()=>{});await context.setOffline(false);await farm.goto(base+'/tra-da/farm');await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='32');
    check(await farm.evaluate(()=>localStorage.getItem('locly-game-wallet'))===wallet.token,'network error preserves wallet');
    await farm.locator('header .cafe-link').click();await farm.waitForFunction(()=>document.querySelector('#connection-dot').classList.contains('live'));checks.push('return to shared cafe');
    if(errors.length)throw Error(JSON.stringify({checks,errors}));checks.push('no uncaught browser errors');return{checks,errors};
  }finally{await context.close();}
}
