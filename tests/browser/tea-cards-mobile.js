// Run with the loopback fake-data preview; uses no real wallets or payments.
async(page)=>{
  const base='http://127.0.0.1:3101',browser=page.context().browser(),results=[];
  const modes=[
    {key:'tienlen',game:'#tl-game',bots:'#tl-bots',count:'3',start:'#tl-start',hand:'#tl-hand',cards:'#tl-hand button',action:'#tl-play',table:0},
    {key:'color',game:'#card-game',bots:'#bot-count',count:'2',start:'#start-card',hand:'#hand',cards:'#hand button',action:'#draw-button',table:0},
    {key:'baicao',game:'#bc-game',bots:'#bc-bots',count:'3',start:'#bc-start',hand:'#bc-hand',cards:'#bc-hand .classic-card',action:'#bc-reveal',table:0},
    {key:'poker',game:'#pk-game',bots:'#pk-bots',count:'3',start:'#pk-start',hand:'#pk-hand',cards:'#pk-hand .classic-card',action:'#pk-fold',table:0}
  ];
  for(const mode of modes){
    const context=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true,serviceWorkers:'block'}),errors=[];
    let headers,live,stage='wallet';
    try{
      const wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json();headers={'X-Wallet-Token':wallet.token};
      const language=mode.key==='poker'?'en':'vi';
      await context.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Nguyễn Minh Khánh An',language}});
      await context.addInitScript(({token,language})=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language',language)},{token:wallet.token,language});
      stage='load';live=await context.newPage();live.on('pageerror',error=>errors.push(error.message));await live.goto(base+'/tra-da');
      await live.waitForFunction(()=>document.querySelector('#connection-dot').classList.contains('live'));
      stage='chair';const seat=await live.evaluate(async index=>{const token=localStorage.getItem('locly-game-wallet'),state=await(await fetch('/api/tea/state',{headers:{'X-Wallet-Token':token}})).json();return state.room.tables[index].seats.find(seat=>!seat.walletId)},mode.table);
      if(!seat)throw Error(mode.key+' no free seat');
      await live.waitForFunction(()=>document.querySelector('#cafe-canvas')?.width===960);
      const bounds=await live.locator('#cafe-canvas').boundingBox();if(!bounds)throw Error(mode.key+' canvas hidden');await live.locator('#cafe-canvas').click({position:{x:seat.x*bounds.width/960,y:seat.y*bounds.height/640}});
      await live.waitForFunction(prefix=>document.querySelector('#interact-button').dataset.seat?.startsWith(prefix),seat.id.split('-')[0]+'-');
      const chair=await live.locator('#interact-button').getAttribute('data-seat');
      const seated=await context.request.post(base+'/api/tea/seats/'+chair,{headers,data:{}});if(!seated.ok())throw Error(mode.key+' could not sit');
      await live.waitForFunction(()=>!document.querySelector('.menu-item').disabled);
      stage='start';await live.locator('#context-button').click();await live.locator('[data-tab=cards]').click();await live.locator('[data-card-mode='+mode.key+']').click();
      await live.locator(mode.bots).selectOption(mode.count);await live.locator(mode.start).click();
      await live.waitForFunction(selector=>document.querySelector(selector)?.children.length>0,mode.hand);
      for(const [width,height] of [[480,270],[568,320],[740,360],[844,390],[1024,600]]){
        stage=width+'x'+height;await live.setViewportSize({width,height});
        await live.waitForFunction(()=>{const vv=visualViewport,bottom=vv?.scale===1?Math.min(innerHeight,vv.height+vv.offsetTop):innerHeight;return document.body.classList.contains('card-fullscreen')&&parseFloat(document.querySelector('#cafe-shell').style.getPropertyValue('--tea-visible-bottom'))===Math.round(bottom)});
        await live.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
        const layout=await live.evaluate(({game,hand,action})=>{
          const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}};
          const dock=rect(game+' .card-hand-dock'),board=rect(game+' .card-scroll-area'),bar=rect(game+' .tl-actions,'+game+' .classic-actions,'+game+' .card-action-bar'),card=rect(hand+' > :first-child'),button=rect(action),hit=document.elementFromPoint(button.x+button.w/2,button.y+button.h/2);
          const area=document.querySelector(game+' .card-scroll-area'),h=document.querySelector(hand);
          const clipped=[...area.querySelectorAll('.tl-player,.card-player,.classic-player,.tl-turn,.tl-center>p,.deck-block,.turn-sign,.classic-turn,.classic-results,#tl-top,#top-card,#pk-board,#pk-pot,#pk-stage,#pk-last-action')].filter(el=>el.getClientRects().length).filter(el=>{const r=el.getBoundingClientRect();return r.top<board.y-2||r.bottom>board.bottom+2||r.left<board.x-2||r.right>board.x+board.w+2}).map(el=>el.id||el.className);
          const handClipped=[...h.children].some(el=>{const r=el.getBoundingClientRect();return r.top<dock.y-1||r.bottom>dock.bottom+1||r.left<dock.x||r.right>dock.x+dock.w});
          return{dock,board,bar,card,button,clipped,handClipped,handScroll:h.scrollWidth>h.clientWidth+1||h.scrollHeight>h.clientHeight+1,hit:hit===document.querySelector(action)||document.querySelector(action).contains(hit),topbar:getComputedStyle(document.querySelector('.topbar')).display,overflow:document.documentElement.scrollWidth>innerWidth};
        },mode);
        if(layout.clipped.length||layout.handClipped||layout.handScroll||layout.topbar!=='none'||layout.board.bottom>layout.dock.y+1||layout.dock.bottom>layout.bar.y+1||layout.card.y<layout.dock.y||layout.card.bottom>layout.dock.bottom+1||layout.bar.bottom>height+1||layout.overflow||!layout.hit)throw Error(mode.key+' '+width+'x'+height+' layout '+JSON.stringify(layout));
        const first=live.locator(mode.cards).first();
        if(mode.key==='tienlen'){await first.tap();if(await live.locator('#tl-hand [aria-pressed=true]').count()!==1)throw Error('tienlen tap failed');await live.locator('#tl-clear').tap();}
        await live.screenshot({path:'E:/blogger/output/cards-fullscreen-'+mode.key+'-'+width+'.png'});
        results.push({mode:mode.key,size:width+'x'+height,boardHeight:Math.round(layout.board.h),handHeight:Math.round(layout.dock.h)});
      }
      if(mode.key==='baicao'){
        stage='reveal';await live.locator('#bc-reveal').tap();await live.waitForFunction(()=>!document.querySelector('#bc-results').hidden);
        for(const [width,height] of [[480,270],[568,320],[844,390]]){
          await live.setViewportSize({width,height});await live.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
          const fits=await live.locator('#bc-game .card-scroll-area').evaluate(area=>{const bounds=area.getBoundingClientRect();return [...area.querySelectorAll('.classic-player,.classic-results,.classic-player-cards .classic-card')].filter(el=>el.getClientRects().length).every(el=>{const r=el.getBoundingClientRect();return r.top>=bounds.top-2&&r.bottom<=bounds.bottom+2})});
          if(!fits)throw Error('revealed cards clipped at '+width);await live.screenshot({path:'E:/blogger/output/cards-fullscreen-baicao-reveal-'+width+'.png'});
        }
      }
      stage='rotate';await live.setViewportSize({width:390,height:844});await live.waitForFunction(()=>!document.body.classList.contains('card-fullscreen'));
      if(!(await live.locator(mode.hand).evaluate(el=>!!el.closest('.card-scroll-area'))))throw Error(mode.key+' hand did not restore on portrait');
      await live.setViewportSize({width:1280,height:900});await live.waitForFunction(()=>!document.body.classList.contains('card-fullscreen'));
      await live.screenshot({path:'E:/blogger/output/cards-desktop-'+mode.key+'.png'});
      await live.setViewportSize({width:740,height:360});await live.waitForFunction(()=>document.body.classList.contains('card-fullscreen'));
      await live.locator('.cards-view .back-cafe').click();await live.waitForFunction(()=>!document.body.classList.contains('card-fullscreen'));
      if(errors.length)throw Error(mode.key+' page errors '+errors.join('; '));
    }catch(error){if(live)await live.screenshot({path:'E:/blogger/output/cards-mobile-failure.png'});throw Error(mode.key+' '+stage+': '+error.message)}finally{if(headers)await context.request.delete(base+'/api/tea/seat',{headers}).catch(()=>{});await context.close()}
  }
  return results;
}
