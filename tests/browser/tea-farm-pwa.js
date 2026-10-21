// Independent context: restore a farm, cache its public shell, then recover offline.
async(page)=>{
  const context=await page.context().browser().newContext({viewport:{width:844,height:390}});
  try{
    const base='http://127.0.0.1:3101',wallet=await(await context.request.post(base+'/api/game/wallets',{data:{}})).json();
    const headers={'X-Wallet-Token':wallet.token};
    await context.request.put(base+'/api/tea/profile',{headers,data:{nickname:'Restore Test'}});
    await context.request.post(base+'/api/tea/farm/actions',{headers,data:{type:'buy',item:'carrot',requestId:crypto.randomUUID()}});
    const farm=await context.newPage();await farm.goto(base+'/tra-da/farm');
    // Initial SW activation must not reload and close this dialog.
    await farm.locator('#wallet').click();await farm.locator('#restore-code').fill(wallet.token);await farm.locator('#restore').click();
    await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='108');
    await farm.evaluate(()=>navigator.serviceWorker.ready);await farm.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    const cache=await farm.evaluate(async()=>{const paths=[];for(const key of await caches.keys())for(const request of await(await caches.open(key)).keys())paths.push(new URL(request.url).pathname);return paths;});
    if(cache.some(path=>path.startsWith('/api/'))||!cache.includes('/tra-da/farm'))throw Error('Unexpected cache contents');
    await context.setOffline(true);await farm.reload();await farm.waitForFunction(()=>document.querySelector('#notice').classList.contains('error'));
    if(await farm.evaluate(()=>localStorage.getItem('locly-game-wallet'))!==wallet.token)throw Error('Wallet lost');
    await context.setOffline(false);await farm.locator('#retry').click();await farm.waitForFunction(()=>document.querySelector('#gold').textContent==='108');
    return{restored:true,offlineShell:true,walletPreserved:true,privateCacheEntries:0};
  }finally{await context.close();}
}
