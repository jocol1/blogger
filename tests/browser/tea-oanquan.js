// Run on the loopback-only tests/preview.js fixture, never production.
async(page)=>{
  const base=new URL(page.url()).origin;
  if(!/^http:\/\/127\.0\.0\.1:310[1-9]$/.test(base))throw Error('Open the fake-data preview first.');
  const contexts=[],guests=[],errors=[],assert=(ok,message)=>{if(!ok)throw Error(message)};
  try{
    for(let i=0;i<2;i++){
      const context=await page.context().browser().newContext({viewport:i?{width:1200,height:900}:{width:320,height:740},reducedMotion:i?'reduce':'no-preference'});contexts.push(context);
      const wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json(),headers={'X-Wallet-Token':wallet.token};
      await context.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Sower '+i,language:'vi'}});
      await context.addInitScript(token=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi')},wallet.token);
      const live=await context.newPage();live.on('pageerror',e=>errors.push(e.message));await live.goto(base+'/tra-da');await live.waitForSelector('#connection-dot.live');
      await (async()=>{
      const viewport=live.viewportSize();await live.setViewportSize({width:1440,height:1000});await live.waitForFunction(()=>document.querySelector('#cafe-canvas').width===960);
      const seat=await live.evaluate(async index=>{const state=await(await fetch('/api/tea/state',{headers:{'X-Wallet-Token':localStorage.getItem('locly-game-wallet')}})).json();return state.room.tables[index].seats.find(seat=>!seat.walletId)},1);
      if(!seat)throw Error('No free test chair');const bounds=await live.locator('#cafe-canvas').boundingBox();await live.locator('#cafe-canvas').click({position:{x:seat.x*bounds.width/960,y:seat.y*bounds.height/640}});
      await live.waitForFunction(prefix=>document.querySelector('#interact-button').dataset.seat?.startsWith(prefix),seat.id.split('-')[0]+'-');await live.setViewportSize(viewport);
    })();await live.waitForFunction(()=>document.querySelector('#interact-button').dataset.seat?.startsWith('t2-'));
      const seat=await live.locator('#interact-button').getAttribute('data-seat');const seated=await context.request.post(base+'/api/tea/seats/'+seat,{headers,data:{}});assert(seated.ok(),'Could not sit');
      await live.waitForFunction(()=>document.querySelector('#interact-button').dataset.action==='leave');await live.locator('[data-tab=games]').click();await live.locator('[data-mini-game=oanquan]').click();
      guests.push({context,live,wallet,headers});
    }
    await guests[0].live.waitForFunction(()=>document.querySelector('#mini-bots')?.value==='0');await guests[0].live.locator('#mini-start').click();for(const g of guests)await g.live.waitForSelector('.oan-game');
    const views=[];for(const g of guests){const {game}=await(await g.context.request.get(base+'/api/tea/games/oanquan',{headers:g.headers})).json();g.game=game;
      const bottom=await g.live.locator('.oan-pit').evaluateAll(nodes=>nodes.filter(n=>n.style.gridRow==='2').map(n=>Number(n.dataset.pit)));assert(bottom.length===5&&bottom.every(p=>game.side===0?p<5:p>5&&p<11),'Your row is not at the bottom');views.push({side:game.side,bottom});
    }
    const actor=guests.find(g=>g.game.turn===g.wallet.id),peer=guests.find(g=>g!==actor);assert(actor,'Missing turn owner');
    await actor.live.locator('.oan-pit:not(:disabled)').first().click();assert(await actor.live.locator('[data-direction="1"]').isEnabled(),'Cannot choose a sowing direction');
    await actor.live.locator('[data-direction="1"]').click();await actor.live.waitForSelector('.oan-pit.stepping');await peer.live.waitForSelector('.oan-pit.stepping');
    assert(await actor.live.locator('.oan-pit:not(:disabled)').count()===0,'Board accepts a second move during playback');
    const first=await actor.live.locator('.oan-pit.stepping').getAttribute('data-pit');await actor.live.waitForFunction(pit=>document.querySelector('.oan-pit.stepping')?.dataset.pit!==pit,first);
    const {game:moving}=await(await actor.context.request.get(base+'/api/tea/games/oanquan',{headers:actor.headers})).json();assert(moving.playback.steps.filter(s=>s.type==='sow').length>=5,'No per-stone steps');
    const traceId=moving.playback.id;await peer.live.reload();await peer.live.waitForSelector('#connection-dot.live');await peer.live.locator('[data-tab=games]').click();await peer.live.locator('[data-mini-game=oanquan]').click();await peer.live.waitForSelector('.oan-game');
    const {game:restored}=await(await peer.context.request.get(base+'/api/tea/games/oanquan',{headers:peer.headers})).json();assert(restored.playback.id===traceId,'Reload replaced the move');
    for(const g of guests)assert(!await g.live.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Horizontal overflow');
    assert(errors.length===0,errors.join('; '));return {views,steps:moving.playback.steps.length,reloadedSameMove:true,errors};
  }catch(error){throw Error(error.message+' | '+(await Promise.all(guests.map(async g=>({toast:await g.live.locator('#toast').textContent(),stage:await g.live.locator('#mini-game-stage').textContent()})))).map(s=>JSON.stringify(s)).join('; '))}finally{for(const context of contexts)await context.close()}
}
