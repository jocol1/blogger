const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {MemoryFirestore}=require('./helpers/memory-firestore');
const {createFarm,CATALOG}=require('../features/tea/farm');
const {position}=require('../features/tea/fishing');
function fixture(){let time=1800000000000;const db=new MemoryFirestore(),farm=createFarm({db,now:()=>time});return{db,farm,set:t=>{time=t},get now(){return time},send:input=>farm.action('alice',{requestId:crypto.randomUUID(),...input})};}
async function cast(f){return(await f.send({type:'castLine'})).farm.fishing;}
async function hook(f,r){f.set(r.biteAt+100);return(await f.send({type:'hookFish',roundId:r.id})).farm.fishing;}
test('free cast is unique under concurrency, hides prize and resumes after restart',async()=>{
  const f=fixture(),input={type:'castLine',requestId:crypto.randomUUID()};const rows=await Promise.all([f.send(input),f.send(input)]);
  assert.equal(rows[0].farm.fishing.id,rows[1].farm.fishing.id);assert.equal(rows[0].farm.gold,120);assert.equal('prize'in rows[0].farm.fishing,false);
  await assert.rejects(f.send({type:'castLine'}),e=>e.code==='fishing_active');
  const restarted=createFarm({db:f.db,now:()=>f.now});assert.deepEqual((await restarted.read('alice')).farm.fishing,rows[0].farm.fishing);
  assert.equal((await f.farm.read('bob')).farm.fishing,null);
  await assert.rejects(f.farm.action('bob',{type:'hookFish',roundId:rows[0].farm.fishing.id,requestId:crypto.randomUUID()}),e=>e.code==='fishing_stale');
});
test('hooking early fails, timeout persists once, stale rounds cannot affect new cast',async()=>{
  const f=fixture();let r=await cast(f);r=(await f.send({type:'hookFish',roundId:r.id})).farm.fishing;assert.equal(r.reason,'early');
  await assert.rejects(f.send({type:'castLine'}),e=>e.code==='fishing_cooldown');f.set(f.now+3000);const next=await cast(f);
  await assert.rejects(f.send({type:'hookFish',roundId:r.id}),e=>e.code==='fishing_stale');f.set(next.expiresAt+1);
  const first=await f.farm.read('alice'),second=await f.farm.read('alice');assert.equal(first.farm.fishing.reason,'escaped');assert.equal(second.farm.version,first.farm.version);assert.deepEqual(second.farm.products,{});
});
test('server checks reel timing, ignores claimed result and credits caught fish exactly once',async()=>{
  const f=fixture(),r=await hook(f,await cast(f));f.set(r.reelAt+500);assert.equal(position(f.now,r.reelAt),.5);
  const input={type:'reelFish',roundId:r.id,requestId:crypto.randomUUID(),win:false,gold:999999,item:undefined};
  const results=await Promise.all([f.send(input),f.send(input)]);const fish=results[0].farm.fishing.caught;
  assert.ok(['perch','tilapia','snakehead'].includes(fish));assert.equal(results[0].farm.products[fish],1);assert.equal(results[0].farm.stats.angled,1);assert.equal(results[0].farm.stats.fish,0);assert.equal(results[0].farm.gold,120);
  await assert.rejects(f.send({...input,requestId:crypto.randomUUID()}),e=>e.code==='fishing_finished');
  const sold=await f.send({type:'sell',item:fish});assert.equal(sold.farm.gold,120+CATALOG[fish].sell);
  await assert.rejects(f.send({type:'buy',item:fish}),e=>e.code==='farm_bad_item');
});
test('misses and expired reels never create fish even with a forged timestamp',async()=>{
  for(const late of [false,true]){const f=fixture(),r=await hook(f,await cast(f));f.set(late?r.expiresAt+1:r.reelAt+50);const result=await f.send({type:'reelFish',roundId:r.id,won:true,clientTime:r.reelAt+500});assert.equal(result.farm.fishing.reason,late?'escaped':'missed');assert.deepEqual(result.farm.products,{});}
});
test('database latency does not change the accepted reel timing',async()=>{
  const f=fixture(),r=await hook(f,await cast(f));f.set(r.reelAt+500);
  const transaction=f.db.runTransaction.bind(f.db);
  f.db.runTransaction=callback=>{f.set(f.now+400);return transaction(callback);};
  const result=await f.send({type:'reelFish',roundId:r.id});
  assert.equal(result.farm.fishing.reason,'caught');assert.equal(result.farm.stats.angled,1);
});
test('storage failure leaves round unsettled; successful retry and cancellation never duplicate rewards',async()=>{
  const f=fixture(),r=await hook(f,await cast(f));f.set(r.reelAt+500);const input={type:'reelFish',roundId:r.id,requestId:crypto.randomUUID()};f.db.failWrites=true;await assert.rejects(f.send(input));assert.equal((await f.farm.read('alice')).farm.fishing.status,'reeling');f.db.failWrites=false;assert.equal((await f.send(input)).farm.stats.angled,1);
  f.set(f.now+3000);const next=await cast(f),cancel={type:'stopFishing',roundId:next.id,requestId:crypto.randomUUID()};await Promise.all([f.send(cancel),f.send(cancel)]);assert.equal((await f.farm.read('alice')).farm.stats.angled,1);
});
test('old farms cannot claim new fishing quest without completing it',async()=>{
  const f=fixture();await f.farm.read('alice');await assert.rejects(f.send({type:'claim',quest:'angler'}),e=>e.code==='farm_quest_not_ready');
  for(let i=0;i<3;i++){const r=await hook(f,await cast(f));f.set(r.reelAt+500);await f.send({type:'reelFish',roundId:r.id});f.set(f.now+3000);}
  const result=await f.send({type:'claim',quest:'angler'});assert.equal(result.farm.gold,135);await assert.rejects(f.send({type:'claim',quest:'angler'}),e=>e.code==='farm_already_claimed');
});
