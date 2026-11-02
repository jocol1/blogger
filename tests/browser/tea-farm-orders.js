async(page)=>{
 const base='http://127.0.0.1:3101',c=await page.context().browser().newContext({viewport:{width:844,height:390},hasTouch:true,serviceWorkers:'block'}),errors=[],checks=[];
 try{
  const w=await(await c.request.post(base+'/api/game/wallets',{data:{}})).json(),headers={'X-Wallet-Token':w.token};
  await c.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Village QA',language:'vi'}});
  const read=async()=>await(await c.request.get(base+'/api/tea/farm',{headers})).json();
  const act=async data=>{const r=await c.request.post(base+'/api/tea/farm/actions',{headers,data:{requestId:crypto.randomUUID(),...data}});if(!r.ok())throw Error(await r.text());return r.json();};
  const before=await read(),order=before.orders.rows[0];
  for(let slot=0;slot<order.quantity;slot++){await act({type:'hoe',slot});const row=await act({type:'plant',slot,item:order.item});await act({type:'water',slot,cycleId:row.farm.plots[slot].cycleId});}
  await c.request.post(base+'/__test/tea/advance',{data:{ms:61000}});
  const grown=await read();for(let slot=0;slot<order.quantity;slot++)await act({type:'harvest',slot,cycleId:grown.farm.plots[slot].cycleId});
  await c.addInitScript(token=>{localStorage.setItem('locly-game-wallet',token);localStorage.setItem('locly-tea-language','vi');},w.token);
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  async function board(){await p.goto(base+'/tra-da/farm');await p.waitForFunction(()=>document.querySelector('#gold').textContent==='120');if(await p.locator('#panel').isVisible())throw Error('Board opened on entry');await p.locator('#map-toggle').click();await p.locator('#map-destination').selectOption('board');await p.locator('#map-go').click();await p.locator('#interact').click();await p.locator('.order-card').first().waitFor();}
  await board();if(await p.locator('.order-card').count()!==3)throw Error('Missing orders');checks.push('board opens only after travelling and interacting');
  for(const viewport of [{width:568,height:320},{width:844,height:390},{width:1280,height:800}]){await p.setViewportSize(viewport);await p.locator('.order-card').first().locator('button').scrollIntoViewIfNeeded();const fit=await p.evaluate(()=>{const b=document.querySelector('.order-card button').getBoundingClientRect(),panel=document.querySelector('#panel').getBoundingClientRect(),close=document.querySelector('#close-panel').getBoundingClientRect();return b.x>=panel.x&&b.right<=innerWidth&&b.bottom<=innerHeight&&b.top>=close.bottom&&document.documentElement.scrollWidth===innerWidth;});if(!fit)throw Error('Clipped delivery control at '+viewport.width);await p.screenshot({path:'E:/blogger/output/orders-'+viewport.width+'.png'});}
  checks.push('delivery controls fit landscape phones and desktop; panel scroll stays inside');
  await p.setViewportSize({width:844,height:390});await p.locator('.order-card').first().locator('button').click();await p.waitForFunction(()=>document.querySelector('.order-card').classList.contains('delivered'));
  const delivered=await read();if(delivered.farm.gold!==120+order.reward||delivered.farm.products[order.item]!==0)throw Error('Wrong delivery balance');
  if(!await p.locator('.order-card').first().locator('button').isDisabled()||!await p.locator('.order-card').nth(1).locator('button').isDisabled())throw Error('Delivered or missing goods still enabled');
  await p.getByRole('button',{name:'Cột mốc',exact:true}).click();await p.getByRole('heading',{name:'Vụ rau đầu tiên'}).waitFor();await p.getByRole('button',{name:'Đơn hôm nay',exact:true}).click();
  checks.push('harvest → delivery removes goods and pays bonus; completed and missing orders disabled; old milestones accessible');
  await p.locator('#close-panel').click();if(await p.locator('#panel').isVisible())throw Error('Cannot return to farm');await p.locator('#interact').click();await p.locator('#lang').click();await p.getByRole('button',{name:'Daily requests',exact:true}).waitFor();checks.push('close returns to farm; English/Vietnamese board works');
  await p.reload();await p.waitForFunction(gold=>document.querySelector('#gold').textContent===String(gold),120+order.reward);const persisted=await read();if(!persisted.orders.rows[0].completed)throw Error('Lost delivered order on reload');
  await p.locator('#map-toggle').click();await p.locator('#map-destination').selectOption('board');await p.locator('#map-go').click();await p.locator('#interact').click();
  const current=await read();await c.request.post(base+'/__test/tea/advance',{data:{ms:current.orders.expiresAt-current.serverNow+1000}});
  await p.waitForFunction(old=>document.querySelector('.order-card')?.dataset.orderId!==old,order.id,{timeout:15000});
  if(await p.locator('.order-card.delivered').count())throw Error('Yesterday completion carried into new day');checks.push('open board rolls over at Vietnam midnight even without a farm version change');
  if(errors.length)throw Error(errors.join('\n'));return{checks,errors};
 }finally{await c.close();}
}
