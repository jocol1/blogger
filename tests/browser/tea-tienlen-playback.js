// Fake-data preview only. Two browsers exercise plays, pass, stacking and recovery.
async (page)=>{
  const base='http://127.0.0.1:3101',browser=page.context().browser(),entries=[],errors=[];
  async function join(name,width){
    const context=await browser.newContext({viewport:{width,height:900}}),wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json(),headers={'X-Wallet-Token':wallet.token};
    const entry={context,headers,id:wallet.id};entries.push(entry);
    await context.request.put(base+'/api/tea/profile',{headers,data:{nickname:name,language:'vi'}});
    await context.addInitScript(token=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi')},wallet.token);
    entry.page=await context.newPage();entry.page.on('pageerror',e=>errors.push(e.message));await entry.page.goto(base+'/tra-da');
    await entry.page.waitForFunction(()=>document.querySelector('#connection-dot').classList.contains('live'));
    await (async()=>{
      const viewport=entry.page.viewportSize();await entry.page.setViewportSize({width:1440,height:1000});await entry.page.waitForTimeout(250);
      const seat=await entry.page.evaluate(async index=>{const state=await(await fetch('/api/tea/state',{headers:{'X-Wallet-Token':localStorage.getItem('locly-game-wallet')}})).json();return state.room.tables[index].seats.find(seat=>!seat.walletId)},4);
      if(!seat)throw Error('No free test chair');const bounds=await entry.page.locator('#cafe-canvas').boundingBox(),view=JSON.parse(await entry.page.locator('#cafe-canvas').getAttribute('data-view'));await entry.page.locator('#cafe-canvas').click({position:{x:seat.x*view.scale+view.tx,y:seat.y*view.scale+view.ty}});
      await entry.page.waitForFunction(prefix=>document.querySelector('#interact-button').dataset.seat?.startsWith(prefix),seat.id.split('-')[0]+'-');await entry.page.setViewportSize(viewport);
    })();await entry.page.waitForFunction(()=>document.querySelector('#interact-button').dataset.seat?.startsWith('t5-'));
    const seat=await entry.page.locator('#interact-button').getAttribute('data-seat');await context.request.post(base+'/api/tea/seats/'+seat,{headers,data:{}});
    await entry.page.waitForFunction(()=>!document.querySelector('.menu-item').disabled);await entry.page.locator('[data-tab=cards]').click();return entry;
  }
  const state=async entry=>(await(await entry.context.request.get(base+'/api/tea/tienlen/current',{headers:entry.headers})).json()).game;
  let stage='join';try{
    const host=await join('Minh',1280),guest=await join('Lan',390);await host.page.locator('#tl-bots').selectOption('0');await host.page.locator('#tl-start').click();
    await Promise.all(entries.map(entry=>entry.page.waitForFunction(()=>document.querySelectorAll('#tl-hand button').length===13)));
    stage='first play';const first=await state(host),leader=entries.find(entry=>entry.id===first.turn),follower=entries.find(entry=>entry!==leader),before=await state(leader);
    const selected=await leader.page.evaluate(({game,id})=>TeaTienLenView.moves(game.hand,game,id).sort((a,b)=>b.length-a.length)[0].map(card=>card.id),{game:before,id:leader.id});
    for(const card of selected)await leader.page.locator('#tl-hand [data-card-id="'+card+'"]').click();
    await leader.page.locator('#tl-play').click();await leader.page.waitForFunction(()=>document.querySelectorAll('.card-flight').length>0);
    const flyCount=await leader.page.locator('.card-flight').count();if(flyCount!==selected.length)throw Error('Not every confirmed card flew');
    await Promise.all(entries.map(entry=>entry.page.waitForFunction(cards=>document.querySelector('#tl-top').dataset.cards.split(',').sort().join(',')===cards,selected.slice().sort().join(','))));
    stage='pass';await follower.page.waitForFunction(()=>!document.querySelector('#tl-pass').disabled);await follower.page.locator('#tl-pass').click();
    await leader.page.waitForFunction(()=>document.querySelector('#tl-trick-label').textContent.includes('giữ bài cũ'));
    const retained=await leader.page.locator('#tl-top').getAttribute('data-cards');if(retained.split(',').sort().join(',')!==selected.slice().sort().join(','))throw Error('Pass removed the preceding play');
    stage='second play';await leader.page.waitForFunction(()=>!document.querySelector('#tl-feedback').textContent.includes('sắp tới lượt'));await leader.page.locator('#tl-hint').click();await leader.page.locator('#tl-play').click();
    await leader.page.waitForFunction(()=>document.querySelector('#tl-top .card-pile-layer.previous')&&document.querySelector('#tl-top').dataset.playVersion==='4');
    stage='reload';await guest.page.reload();await guest.page.waitForFunction(()=>document.querySelector('#connection-dot').classList.contains('live'));await guest.page.locator('[data-tab=cards]').click();await guest.page.waitForFunction(()=>document.querySelector('#tl-top').dataset.playVersion==='4');
    const noReplay=await guest.page.locator('.card-flight').count()===0;
    await guest.page.emulateMedia({reducedMotion:'reduce'});
    const reduced=await guest.page.evaluate(()=>{
      const target=document.createElement('div'),hand=document.createElement('div');Object.assign(target.style,{position:'fixed',top:'100px',width:'50px',height:'80px'});document.body.append(target,hand);
      const face=card=>{const node=document.createElement('span');node.className='playing-card blue';node.textContent=card.value;return node};const playback=TeaCardPlayback({target,hand,playerSelector:'.missing',myId:()=> 'me',face,initialCards:()=>[],onChange:()=>{}});
      playback.update({id:'reduced',version:1});playback.update({id:'reduced',version:2,serverNow:Date.now(),actionHistory:[{version:2,type:'play',playerId:'me',cards:[{id:'test',value:7}],at:Date.now()}]});
      const result={noFlight:!document.querySelector('.card-flight'),landed:target.dataset.cards==='test',held:playback.busy()};playback.clear();target.remove();hand.remove();return result;
    });
    if(!noReplay||Object.values(reduced).some(value=>!value))throw Error('Reload or reduced-motion behavior failed');
    return {twoClients:true,confirmedCards:flyCount,passKeepsPile:true,nextPlayCoversPile:true,reloadWithoutReplay:noReplay,reducedMotion:reduced,errors};
  }catch(error){throw Error(stage+': '+error.message)}finally{for(const entry of entries){await entry.context.request.delete(base+'/api/tea/seat',{headers:entry.headers}).catch(()=>{});await entry.context.close()}}
}
