// Run against the loopback fake-data preview. No real wallets or payments.
async(page)=>{
  const base='http://127.0.0.1:3101',browser=page.context().browser(),entries=[],errors=[];let stage='join';
  async function join(name,width){
    const context=await browser.newContext({viewport:{width,height:width===390?844:900},hasTouch:width===390}),wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json(),headers={'X-Wallet-Token':wallet.token};
    const entry={context,headers,id:wallet.id};entries.push(entry);await context.request.put(base+'/api/tea/profile',{headers,data:{nickname:name,language:'vi'}});
    await context.addInitScript(token=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi')},wallet.token);
    const live=await context.newPage();entry.page=live;live.on('pageerror',error=>errors.push(error.message));await live.goto(base+'/tra-da');await live.waitForFunction(()=>document.querySelector('#connection-dot').classList.contains('live'));
    await live.locator('#table-directory .table-spot').nth(4).click();await live.waitForFunction(()=>document.querySelector('#interact-button').dataset.seat?.startsWith('t5-'));
    const seat=await live.locator('#interact-button').getAttribute('data-seat');await context.request.post(base+'/api/tea/seats/'+seat,{headers,data:{}});await live.waitForFunction(()=>!document.querySelector('.menu-item').disabled);await live.locator('[data-tab=cards]').click();await live.locator('[data-card-mode=poker]').click();return entry;
  }
  const state=async entry=>(await(await entry.context.request.get(base+'/api/tea/card-games/poker/current',{headers:entry.headers})).json()).game;
  async function mutations(entry){
    await entry.page.evaluate(()=>{window.__pokerMutations={boardAdded:0,boardRemoved:0,handAdded:0,playersAttrs:0,controlAttrs:0,resultAdded:0,resultRemoved:0};const metrics=window.__pokerMutations;
      for(const [selector,label] of [['#pk-board','board'],['#pk-hand','hand'],['#pk-players','players'],['#pk-controls','control'],['#pk-results','result']])new MutationObserver(records=>{for(const record of records){if(record.type==='attributes'&&metrics[label+'Attrs']!==undefined)metrics[label+'Attrs']++;if(record.type==='childList'){if(metrics[label+'Added']!==undefined)metrics[label+'Added']+=record.addedNodes.length;if(metrics[label+'Removed']!==undefined)metrics[label+'Removed']+=record.removedNodes.length}}}).observe(document.querySelector(selector),{subtree:true,attributes:true,childList:true});
    });await entry.page.waitForTimeout(3600);return entry.page.evaluate(()=>window.__pokerMutations);
  }
  async function click(entry,selector){const [response]=await Promise.all([entry.page.waitForResponse(result=>result.url().endsWith('/card-games/poker/action')&&result.request().method()==='POST'),entry.page.locator(selector).click()]);if(!response.ok())throw Error(await response.text());return response.json()}
  try{
    const host=await join('Minh <b>',1280),guest=await join('Lan',390);await host.page.locator('#pk-bots').selectOption('0');await host.page.locator('#pk-start').click();await Promise.all(entries.map(entry=>entry.page.waitForFunction(()=>document.querySelectorAll('#pk-hand .classic-card').length===2)));
    stage='idle measurements';const idle=await mutations(guest),before=await state(host),actor=entries.find(entry=>entry.id===before.turn),other=entries.find(entry=>entry!==actor);
    await actor.page.locator('#pk-raise').fill('100');const stableInput=await actor.page.locator('#pk-raise').inputValue()==='100';await click(actor,'#pk-raise-button');await other.page.waitForFunction(()=>!document.querySelector('#pk-call').disabled);
    await other.page.evaluate(()=>{window.__boardNodes=[...document.querySelector('#pk-board').children]});await click(other,'#pk-call');await other.page.waitForFunction(()=>document.querySelectorAll('#pk-board [data-card-id]').length===3);
    const slotsKept=await other.page.evaluate(()=>window.__boardNodes.every((node,index)=>document.querySelector('#pk-board').children[index]===node));
    stage='finished measurements';await guest.context.request.delete(base+'/api/tea/seat',{headers:guest.headers});await host.page.waitForFunction(()=>!document.querySelector('#pk-rematch').hidden);const finished=await mutations(host);
    stage='bots';await host.page.locator('#pk-rematch-bots').selectOption('3');await host.page.locator('#pk-rematch').click();await host.page.waitForFunction(()=>document.querySelectorAll('#pk-players .classic-player').length===4);
    await host.page.waitForFunction(()=>!document.querySelector('#pk-check').disabled||!document.querySelector('#pk-call').disabled);
    const prior=await state(host),selector=prior.canCheck?'#pk-check':'#pk-call';let posts=0;host.page.on('request',request=>{if(request.url().endsWith('/card-games/poker/action'))posts++});const began=Date.now(),after=await click(host,selector),latencyMs=Date.now()-began;
    const ownActionVisible=after.lastAction?.playerId===host.id;
    await host.page.screenshot({path:'E:/blogger/output/poker-smooth-desktop.png',timeout:5000});await host.page.setViewportSize({width:390,height:844});await host.page.screenshot({path:'E:/blogger/output/poker-smooth-mobile.png',timeout:5000});
    return {idle,finished,slotsKept,stableInput,actionsPerResponse:after.version-prior.version,ownActionVisible,latencyMs,posts,overflow:await host.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors};
  }catch(error){throw Error(stage+': '+error.message)}finally{for(const entry of entries){await entry.context.request.delete(base+'/api/tea/seat',{headers:entry.headers}).catch(()=>{});await entry.context.close()}}
}
