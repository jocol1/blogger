// Hold and release controls in Chromium using the local fake-data preview.
async(page)=>{
  const base='http://127.0.0.1:3101',context=await page.context().browser().newContext({viewport:{width:390,height:844},hasTouch:true}),errors=[];let headers;
  try{
    const wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json();headers={'X-Wallet-Token':wallet.token};await context.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Chrome touch',language:'vi'}});
    await context.addInitScript(token=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi')},wallet.token);const live=await context.newPage();live.on('pageerror',e=>errors.push(e.message));await live.goto(base+'/tra-da');await live.waitForFunction(()=>document.querySelector('#connection-dot').classList.contains('live'));
    const state=async()=>(await(await context.request.get(base+'/api/tea/state',{headers})).json()).guests.find(guest=>guest.walletId===wallet.id);
    const before=await state(),button=live.locator('.dpad [data-dir=left]'),rect=await button.boundingBox();await live.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await live.mouse.down();await live.waitForTimeout(1000);
    const menuBlocked=await button.evaluate(element=>!element.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))),during=await state();
    await live.mouse.move(250,200);await live.mouse.up();await live.waitForTimeout(150);const released=await state();await live.waitForTimeout(350);const settled=await state();
    if(before.x-during.x<5||Math.hypot(settled.x-released.x,settled.y-released.y)>2)throw Error('Hold did not move or release outside left movement stuck');
    const native=await live.evaluate(()=>({selection:document.getSelection().toString(),pad:getComputedStyle(document.querySelector('.dpad button')).userSelect,brawl:getComputedStyle(document.querySelector('#brawl-controls')).userSelect,arenaMenu:!document.querySelector('#brawl-canvas').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})),brawlMenu:!document.querySelector('#brawl-controls').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))}));
    await live.locator('#backup-button').click();const ordinaryCopyAllowed=await live.locator('#wallet-code').evaluate(element=>{element.focus();element.setSelectionRange(0,6);return element.selectionEnd-element.selectionStart===6&&element.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))});
    if(!menuBlocked||native.selection||native.pad!=='none'||native.brawl!=='none'||!native.arenaMenu||!native.brawlMenu||!ordinaryCopyAllowed)throw Error('Native control protection escaped its scope');
    return {holdMoves:true,releaseOutsideStops:true,menuBlocked:true,noSelectedControlText:true,brawlMenuBlocked:true,walletCopyStillAllowed:ordinaryCopyAllowed,errors};
  }finally{await context.close()}
}
