// Playwright entry point for the loopback-only fake-data preview.
async(page)=>{
  const base='http://127.0.0.1:3101',entries=[],browser=page.context().browser(),errors=[];let stage='join';
  async function join(name,width){
    const context=await browser.newContext({viewport:{width,height:width===568?320:900},hasTouch:width===568,serviceWorkers:'block'}),wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json(),headers={'X-Wallet-Token':wallet.token};
    const entry={context,headers,id:wallet.id};entries.push(entry);await context.request.put(base+'/api/tea/profile',{headers,data:{nickname:name,language:'vi',hair:entries.length,clothes:entries.length+1}});
    await context.addInitScript(token=>{
      localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi');
      Object.defineProperty(window,'io',{configurable:true,set(factory){
        const wrapped=function(...args){const socket=factory(...args),on=socket.on.bind(socket);window.__testSocket=socket;
          on('tea:ready',payload=>{window.__testState=payload.state;window.__testFight=payload.fight});on('tea:state',state=>window.__testState=state);on('tea:fight-state',payload=>window.__testFight=payload.fight);
          socket.on=(event,fn)=>{if(event==='tea:ready')window.__testReady=fn;return on(event,fn)};return socket;};Object.assign(wrapped,factory);Object.defineProperty(window,'io',{configurable:true,writable:true,value:wrapped});
      }});
    },wallet.token);
    const live=await context.newPage();entry.page=live;live.on('pageerror',error=>errors.push(error.message));await live.goto(base+'/tra-da');await live.waitForFunction(()=>document.querySelector('#connection-dot').classList.contains('live'));
    await (async()=>{
      const viewport=live.viewportSize();await live.setViewportSize({width:1440,height:1000});await live.waitForFunction(()=>document.querySelector('#cafe-canvas').width===960);
      const seat=await live.evaluate(async index=>{const state=await(await fetch('/api/tea/state',{headers:{'X-Wallet-Token':localStorage.getItem('locly-game-wallet')}})).json();return state.room.tables[index].seats.find(seat=>!seat.walletId)},4);
      if(!seat)throw Error('No free test chair');const bounds=await live.locator('#cafe-canvas').boundingBox();await live.locator('#cafe-canvas').click({position:{x:seat.x*bounds.width/960,y:seat.y*bounds.height/640}});
      await live.waitForFunction(prefix=>document.querySelector('#interact-button').dataset.seat?.startsWith(prefix),seat.id.split('-')[0]+'-');await live.setViewportSize(viewport);
    })();await live.waitForFunction(()=>document.querySelector('#interact-button').dataset.seat?.startsWith('t5-'));
    const seat=await live.locator('#interact-button').getAttribute('data-seat');await context.request.post(base+'/api/tea/seats/'+seat,{headers,data:{}});await live.waitForFunction(()=>!document.querySelector('.menu-item').disabled);await live.locator('[data-tab=table]').click();return entry;
  }
  const fight=entry=>entry.page.evaluate(()=>window.__testFight);
  try{
    const host=await join('Minh <b>',1280),guest=await join('Lan bánh bèo',568);
    await host.page.locator('#fight-opponent').selectOption(guest.id);await host.page.locator('#challenge-fight').click();await guest.page.locator('#fight-accept').click();
    await Promise.all(entries.map(entry=>entry.page.waitForFunction(()=>!document.querySelector('#brawl-stage').hidden&&!document.querySelector('dialog[open]'))));
    stage='countdown';const initial=await fight(host);if(initial.maxHealth!==20||initial.startsAt<=initial.serverNow)throw Error('Missing countdown or health');
    await host.page.bringToFront();await host.page.waitForFunction(()=>!document.querySelector('#brawl-punch').disabled);
    stage='remote miss';await host.page.keyboard.press('j');await host.page.waitForFunction(()=>window.__testFight?.actionHistory.length>0);const miss=await fight(host);if(miss.players.some(player=>player.health!==20)||miss.actionHistory.at(-1).hit)throw Error('Remote punch caused damage');
    stage='keyboard movement';await host.page.keyboard.down('d');await host.page.waitForFunction(id=>window.__testFight.players.find(player=>player.id===id).x>520,host.id);await host.page.keyboard.up('d');
    await host.page.keyboard.press('j');await host.page.waitForFunction(id=>window.__testFight.players.find(player=>player.id===id).health===18,guest.id);
    const close=await fight(host);if(Math.hypot(close.players[0].x-close.players[1].x,close.players[0].y-close.players[1].y)<44)throw Error('Fighters overlapped');
    stage='mobile multi touch';await guest.page.bringToFront();const stick=await guest.page.locator('#brawl-stick').boundingBox(),kick=await guest.page.locator('#brawl-kick').boundingBox();
    await guest.page.mouse.move(stick.x+stick.width/2,stick.y+stick.height/2);await guest.page.mouse.down();await guest.page.mouse.move(stick.x+stick.width*.12,stick.y+stick.height/2);
    await guest.page.touchscreen.tap(kick.x+kick.width/2,kick.y+kick.height/2);await guest.page.waitForFunction(id=>window.__testFight.players.find(player=>player.id===id).health===17,host.id);await guest.page.mouse.up();
    stage='dash';await guest.page.keyboard.press('s');await guest.page.keyboard.down('s');await guest.page.keyboard.press('Shift');await guest.page.waitForFunction(()=>window.__testFight.actionHistory.some(action=>action.type==='dash'));
    await guest.page.waitForFunction(id=>window.__testFight.players.find(player=>player.id===id).y>300,guest.id);await guest.page.keyboard.up('s');
    await guest.page.screenshot({path:'E:/blogger/output/brawl-controlled-mobile.png',timeout:5000});await host.page.screenshot({path:'E:/blogger/output/brawl-controlled-desktop.png',timeout:5000});
    const phone=await guest.page.evaluate(()=>{const hud=document.querySelector('#fight-hud').getBoundingClientRect(),canvas=document.querySelector('#brawl-canvas').getBoundingClientRect(),controls=document.querySelector('#brawl-controls').getBoundingClientRect();return{hudBottom:hud.bottom,canvasTop:canvas.top,canvasBottom:canvas.bottom,controlsTop:controls.top,canvasHeight:canvas.height,buttons:[...document.querySelectorAll('.brawl-action-buttons button')].map(button=>{const r=button.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})}});if(phone.canvasTop<phone.hudBottom-1||phone.canvasBottom>phone.controlsTop+1||phone.canvasHeight<100||phone.buttons.some(visible=>!visible))throw Error('568x320 arena overlaps controls '+JSON.stringify(phone));
    await guest.page.setViewportSize({width:320,height:720});const compact=await guest.page.evaluate(()=>{const hud=document.querySelector('#fight-hud').getBoundingClientRect(),canvas=document.querySelector('#brawl-canvas').getBoundingClientRect(),controls=document.querySelector('#brawl-controls').getBoundingClientRect();return {separate:canvas.top>=hud.bottom-1&&canvas.bottom<=controls.top+1,overflow:document.documentElement.scrollWidth>innerWidth}});
    if(!compact.separate||compact.overflow)throw Error('Compact arena or controls overlap');await guest.page.screenshot({path:'E:/blogger/output/brawl-controlled-compact.png',timeout:5000});await guest.page.setViewportSize({width:568,height:320});
    await guest.page.setViewportSize({width:844,height:390});await guest.page.screenshot({path:'E:/blogger/output/brawl-controlled-landscape.png',timeout:5000});await guest.page.setViewportSize({width:568,height:320});
    stage='reload';await guest.page.reload();await guest.page.waitForFunction(()=>!document.querySelector('#brawl-stage').hidden&&document.querySelector('#connection-dot').classList.contains('live'));
    const restored=await fight(guest);if(restored.id!==initial.id)throw Error('Reload changed match');await guest.page.waitForFunction(()=>!document.querySelector('#brawl-punch').disabled);
    const beforeX=restored.players.find(player=>player.id===guest.id).x;await guest.page.keyboard.down('a');await guest.page.waitForFunction(({id,x})=>window.__testFight.players.find(player=>player.id===id).x<x-10,{id:guest.id,x:beforeX});await guest.page.keyboard.up('a');
    stage='blur stops';await guest.page.keyboard.down('s');await guest.page.evaluate(()=>dispatchEvent(new Event('blur')));
    const beforeStop=(await fight(guest)).players.find(player=>player.id===guest.id).y;await guest.page.waitForTimeout(400);const stopped=(await fight(guest)).players.find(player=>player.id===guest.id).y;if(stopped-beforeStop>8)throw Error('Blur left controls moving');await guest.page.evaluate(()=>dispatchEvent(new Event('focus')));
    stage='authoritative restart state';await guest.page.evaluate(id=>{const state=structuredClone(window.__testState);for(const table of state.room.tables)for(const seat of table.seats)seat.walletId=null;window.__testReady({walletId:id,state,fight:null})},guest.id);
    if(await guest.page.locator('#brawl-stage').isVisible())throw Error('Arena stuck after authoritative null fight');
    stage='forfeit';await host.page.bringToFront();host.page.once('dialog',dialog=>dialog.accept());await host.page.locator('#fight-forfeit').click();await host.page.waitForFunction(()=>!document.querySelector('#fight-hud-close').hidden);
    await host.page.locator('#fight-hud-close').click();if(await host.page.locator('#brawl-stage').isVisible())throw Error('Cannot return to cafe');
    const room=await(await host.context.request.get(base+'/api/tea/state',{headers:host.headers})).json();if(!room.room.tables.some(table=>table.seats.some(seat=>seat.walletId===host.id)))throw Error('Forfeit removed cafe chair');
    return {countdown:true,missWithoutDamage:true,keyboardMovement:true,punchDamage:2,mobileSimultaneousControls:true,kickDamage:3,dash:true,reloadSameMatch:true,blurStops:true,restartExitsArena:true,forfeitKeepsChair:true,mobileOverflow:await guest.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors};
  }catch(error){throw Error(stage+': '+error.message)}finally{for(const entry of entries){await entry.context.request.delete(base+'/api/tea/seat',{headers:entry.headers}).catch(()=>{});await entry.context.close()}}
}
