// Run with the loopback fake-data preview; no real wallets or payments.
async(page)=>{
  const base='http://127.0.0.1:3101',context=await page.context().browser().newContext({viewport:{width:390,height:844},hasTouch:true}),errors=[],checks=[];
  let headers,stage='join';
  const assert=(condition,message)=>{if(!condition)throw Error(message)};
  try {
    const wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json();headers={'X-Wallet-Token':wallet.token};
    await context.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Mobile card fan',language:'vi'}});
    await context.addInitScript(token=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi')},wallet.token);
    const live=await context.newPage();live.on('pageerror',error=>errors.push(error.message));await live.goto(base+'/tra-da');
    await live.waitForFunction(()=>document.querySelector('#connection-dot').classList.contains('live'));
    await live.locator('#table-directory .table-spot').nth(4).click();await live.waitForFunction(()=>document.querySelector('#interact-button').dataset.seat?.startsWith('t5-'));
    const seat=await live.locator('#interact-button').getAttribute('data-seat');
    async function resize(width,height){
      await live.setViewportSize({width,height});await live.waitForFunction(()=>{const vv=visualViewport,bottom=vv?.scale===1?Math.min(innerHeight,vv.height+vv.offsetTop):innerHeight;return parseFloat(document.querySelector('#cafe-shell').style.getPropertyValue('--tea-visible-bottom'))===Math.round(bottom)});
    }
    async function measure(mode,selectors,label){
      const result=await live.evaluate(({mode,selectors})=>{
        const game=document.querySelector(mode),area=game.querySelector('.card-scroll-area'),bar=game.querySelector('.tl-actions,.classic-actions,.card-action-bar'),bounds=area.getBoundingClientRect(),actions=bar.getBoundingClientRect();
        const targets=[...game.querySelectorAll(selectors)].filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{id:el.id,inside:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,hit:hit===el||el.contains(hit),height:r.height}});
        const bottom=window.visualViewport?window.visualViewport.height+window.visualViewport.offsetTop:innerHeight;
        return{targets,barTop:actions.top,barBottom:actions.bottom,visibleBottom:bottom,scrollBottom:bounds.bottom,scrollTop:area.scrollTop,overflow:document.documentElement.scrollWidth>innerWidth};
      },{mode,selectors});
      assert(result.targets.length>0,label+' has no controls');
      assert(result.targets.every(target=>target.inside&&target.hit),label+' inaccessible control '+JSON.stringify(result.targets));
      assert(result.targets.every(target=>target.height>=44),label+' small touch target');
      assert(result.scrollBottom<=result.barTop+.5,label+' controls cover table');assert(!result.overflow,label+' horizontal overflow');checks.push({label,targets:result.targets.length});return result;
    }
    const modes=[
      {key:'tienlen',game:'#tl-game',bots:'#tl-bots',count:'3',start:'#tl-start',hand:'#tl-hand',controls:'.tl-actions button'},
      {key:'color',game:'#card-game',bots:'#bot-count',count:'2',start:'#start-card',hand:'#hand',controls:'.card-action-bar button'},
      {key:'baicao',game:'#bc-game',bots:'#bc-bots',count:'3',start:'#bc-start',hand:'#bc-hand',controls:'.classic-actions button,.classic-actions select'},
      {key:'poker',game:'#pk-game',bots:'#pk-bots',count:'3',start:'#pk-start',hand:'#pk-hand',controls:'.classic-actions button,.classic-actions select,.classic-actions input'}
    ];
    for(const mode of modes){
      stage=mode.key;await resize(390,844);
      await live.locator('[data-tab=cards]').click();await live.locator('[data-card-mode='+mode.key+']').click();
      const seated=await context.request.post(base+'/api/tea/seats/'+seat,{headers,data:{}});assert(seated.ok(),'could not reseat');await live.waitForFunction(()=>!document.querySelector('.menu-item').disabled);
      if(mode.key!=='color')assert(await live.locator('#'+({tienlen:'tienlen',baicao:'baicao',poker:'poker'}[mode.key])+'-mode > details').isVisible(),mode.key+' lobby rules disappeared');
      await live.locator(mode.bots).selectOption(mode.count);await live.locator(mode.start).click();await live.waitForFunction(selector=>document.querySelector(selector).children.length>0,mode.hand);
      for(const [width,height] of [[390,844],[360,740],[320,568],[844,390],[390,500]]){
        await resize(width,height);const label=mode.key+' '+width+'x'+height;
        const before=await measure(mode.game,mode.controls,label);
        await live.locator(mode.game+' .card-scroll-area').evaluate(el=>{el.scrollTop=el.scrollHeight});const after=await measure(mode.game,mode.controls,label+' scrolled');
        assert(Math.abs(before.barTop-after.barTop)<1,label+' controls moved on table scroll');
        // Any hand card remains reachable by scrolling only the table, never the controls.
        const cards=live.locator(mode.hand+' > *');for(let index=0;index<await cards.count();index++){
          await cards.nth(index).scrollIntoViewIfNeeded();const reachable=await cards.nth(index).evaluate(el=>{const r=el.getBoundingClientRect(),clip=el.closest('.card-scroll-area').getBoundingClientRect();return r.bottom>clip.top&&r.top<clip.bottom&&r.width>=24&&r.height>=33});assert(reachable,label+' hand card clipped');
        }
        await measure(mode.game,mode.controls,label+' hand reachable');
        await live.locator(mode.game+' .card-scroll-area').evaluate(el=>{el.scrollTop=0});
        if(width===390&&height===844)await live.screenshot({path:'E:/blogger/output/cards-mobile-'+mode.key+'.png'});
        if(width===320)await live.screenshot({path:'E:/blogger/output/cards-short-'+mode.key+'.png'});
      }
      await resize(320,568);
      const rules=live.locator(mode.game+' details');if(await rules.count()){
        await rules.locator('summary').click();await measure(mode.game,mode.controls,mode.key+' rules open');await rules.locator('summary').click();
      }
      await live.locator('#card-game-switch').click();await measure(mode.game,mode.controls,mode.key+' picker open');await live.locator('#card-game-switch').click();
      if(mode.key!=='color'){
        await resize(1280,900);await live.waitForFunction(selector=>document.querySelector(selector)?.parentElement?.parentElement?.id.endsWith('-mode'),mode.game+' ~ details > summary');
        const desktopRules=await live.locator(mode.game+' ~ details').boundingBox(),actions=await live.locator(mode.game+' .tl-actions,'+mode.game+' .classic-actions').boundingBox();assert(desktopRules.y>=actions.y+actions.height,'desktop rules moved above controls');
        await resize(320,568);
      }
      if(mode.key==='tienlen'){
        await live.locator('#tl-hand button').first().scrollIntoViewIfNeeded();await live.locator('#tl-hand button').first().tap();assert(await live.locator('#tl-hand [aria-pressed=true]').count()===1,'hand tap did not select');await live.locator('#tl-clear').tap();assert(await live.locator('#tl-hand [aria-pressed=true]').count()===0,'clear selection failed');
      }
      if(mode.key==='baicao'){
        await live.locator('#bc-reveal').tap();await live.waitForFunction(()=>!document.querySelector('#bc-rematch').hidden);await measure(mode.game,mode.controls,'baicao result/rematch');
        await live.locator('#bc-game .card-scroll-area').evaluate(el=>{el.scrollTop=el.scrollHeight});await live.locator('#bc-rematch').tap();await live.waitForFunction(()=>!document.querySelector('#bc-reveal').hidden);assert(await live.locator('#bc-game .card-scroll-area').evaluate(el=>el.scrollTop)===0,'rematch did not reset table');
      }
      if(mode.key==='poker'){
        await live.waitForFunction(()=>!document.querySelector('#pk-raise-button').disabled);await live.locator('#pk-raise').tap();await live.locator('#pk-raise').fill('100');await resize(390,500);await measure(mode.game,mode.controls,'poker keyboard height');
        // Chrome can resize only the visual viewport when its keyboard appears.
        await resize(390,844);await live.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:500});visualViewport.dispatchEvent(new Event('resize'))});
        const keyboard=await measure(mode.game,mode.controls,'poker visual viewport keyboard');assert(keyboard.barBottom<=keyboard.visibleBottom,'keyboard covers controls');
        await live.evaluate(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'))});
        assert(await live.locator('#pk-raise').inputValue()==='100','raise input lost');await Promise.all([live.waitForResponse(response=>response.url().endsWith('/card-games/poker/action')&&response.ok()),live.locator('#pk-raise-button').tap()]);
      }
      await context.request.delete(base+'/api/tea/seat',{headers});await live.waitForFunction(()=>document.querySelector('.menu-item').disabled);
    }
    assert(errors.length===0,errors.join('; '));return {checks:checks.length,modes:modes.map(mode=>mode.key),viewports:['390x844','360x740','320x568','844x390','390x500'],errors};
  }catch(error){throw Error(stage+': '+error.message)}finally{if(headers)await context.request.delete(base+'/api/tea/seat',{headers}).catch(()=>{});await context.close()}
}
