// Run with Playwright against `node tests/preview.js`; uses fake wallets only.
async (page) => {
  const base='http://127.0.0.1:3101',context=await page.context().browser().newContext({viewport:{width:390,height:844}}),errors=[];
  let headers;
  try {
    const wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json();headers={'X-Wallet-Token':wallet.token};
    await context.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Minh <b>',language:'vi'}});
    await context.addInitScript(({token})=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi')},{token:wallet.token});
    const live=await context.newPage();live.on('pageerror',error=>errors.push(error.message));await live.goto(base+'/tra-da');
    await live.waitForFunction(()=>document.querySelector('#connection-dot')?.classList.contains('live'));
    await live.locator('#table-directory .table-spot').nth(4).click();await live.waitForFunction(()=>document.querySelector('#interact-button')?.dataset.seat?.startsWith('t5-'));
    const seat=await live.locator('#interact-button').getAttribute('data-seat');await context.request.post(base+'/api/tea/seats/'+seat,{headers,data:{}});
    await live.waitForFunction(()=>!document.querySelector('.menu-item').disabled);await live.locator('[data-tab=cards]').click();
    if(await live.locator('#card-game-switch').isVisible())await live.locator('#card-game-switch').click();await live.locator('[data-card-mode=color]').click();await live.locator('#bot-count').selectOption('2');await live.locator('#start-card').click();
    await live.waitForFunction(()=>document.querySelectorAll('#hand button').length===7);
    for(let round=0;round<5&&!await live.locator('#hand button:not(:disabled)').count();round++) {
      if(await live.locator('#draw-button').isEnabled())await live.locator('#draw-button').click();
      await live.waitForFunction(()=>document.querySelector('#hand button:not(:disabled)')||!document.querySelector('#draw-button').disabled);
    }
    const button=live.locator('#hand button:not(:disabled)').first();if(!await button.count())throw Error('No playable card reached');
    const cardId=await button.getAttribute('data-card-id'),oldTop=await live.locator('#top-card').getAttribute('data-cards'),source=await button.boundingBox();
    await live.evaluate(()=>{const target=document.querySelector('#top-card');window.playLog=[];new MutationObserver(()=>window.playLog.push({at:performance.now(),version:target.dataset.playVersion,flying:target.dataset.flying,cards:target.dataset.cards})).observe(target,{attributes:true,attributeFilter:['data-play-version','data-flying']})});
    await button.click();if(await live.locator('#color-picker').isVisible())await live.locator('#color-picker [data-color=red]').click();
    await live.waitForFunction(()=>document.querySelector('.card-flight'));
    const during=await live.evaluate(()=>({old:document.querySelector('#top-card').dataset.cards,left:parseFloat(document.querySelector('.card-flight').style.left),width:parseFloat(document.querySelector('.card-flight').style.width),disabled:document.querySelector('#draw-button').disabled}));
    if(during.old!==oldTop||!during.disabled)throw Error('Previous card changed before landing or action unlocked while flying');
    if(Math.abs(during.left+during.width/2-(source.x+source.width/2))>3)throw Error('Card did not originate from the chosen hand card');
    await live.waitForFunction(cardId=>document.querySelector('#top-card').dataset.cards===cardId,cardId);
    await live.screenshot({path:'E:/blogger/output/card-play-landed-mobile.png'});
    await live.waitForFunction(()=>window.playLog.some(row=>Number(row.flying)>=3),null,{timeout:12000});
    const timeline=await live.evaluate(()=>window.playLog),land=timeline.find(row=>row.version==='2'&&!row.flying),next=timeline.find(row=>Number(row.flying)>=3);
    if(!land||!next||next.at-land.at<1300)throw Error('Played card was covered before readable dwell');
    await context.request.delete(base+'/api/tea/seat',{headers});
    const regressions=await live.evaluate(async()=>{
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),target=document.createElement('div'),hand=document.createElement('div');
      Object.assign(target.style,{position:'fixed',top:'140px',left:'120px',width:'70px',height:'100px'});document.body.append(target,hand);
      const face=card=>{const node=document.createElement('span');node.className='playing-card red';node.textContent=card.value;return node};
      const playback=TeaCardPlayback({target,hand,playerSelector:'.missing',myId:()=> 'me',face,initialCards:game=>[game.top],onChange:()=>{}});
      const card=n=>({id:'test-'+n,color:'red',kind:'number',value:n}),state=(n,at=Date.now())=>({id:'test',version:n,serverNow:Date.now(),top:card(n),actionHistory:Array.from({length:n-1},(_,index)=>({version:index+2,playerId:'other',type:'play',cards:[card(index+2)],at}))});
      playback.update(state(1));playback.update(state(2));await wait(100);target.style.display='none';playback.update(state(3));await wait(500);
      const hiddenNewest=target.dataset.cards==='test-3';target.style.display='block';playback.update(state(4));await wait(100);playback.update(state(5,Date.now()-20000));await wait(500);
      const staleNewest=target.dataset.cards==='test-5';await wait(1400);playback.update(state(5));const duplicateQuiet=!target.dataset.flying;
      playback.clear();target.remove();hand.remove();return {hiddenNewest,staleNewest,duplicateQuiet};
    });
    if(Object.values(regressions).some(value=>!value))throw Error('Playback race regression: '+JSON.stringify(regressions));
    return {flightFromHand:true,oldCardUntilLanding:true,dwellMs:Math.round(next.at-land.at),...regressions,overflow:await live.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors};
  }finally{if(headers)await context.request.delete(base+'/api/tea/seat',{headers}).catch(()=>{});await context.close();}
}
