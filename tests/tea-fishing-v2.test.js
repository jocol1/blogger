const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {MemoryFirestore}=require('./helpers/memory-firestore');
const {createFarm,CATALOG}=require('../features/tea/farm');
const fishing=require('../features/tea/fishing');
function fixture(){let time=1800000000000;const db=new MemoryFirestore(),farm=createFarm({db,now:()=>time});return{db,farm,set:t=>time=t,get now(){return time},send:input=>farm.action('alice',{requestId:crypto.randomUUID(),...input})};}
async function hooked(f){let r=(await f.send({type:'castLine',fishingVersion:2})).farm.fishing;f.set(r.biteAt+50);return(await f.send({type:'hookFish',roundId:r.id})).farm.fishing;}
async function pull(f,r,hit=true,extra={}){f.set(r.reelAt+(hit?r.period/4:10));return f.send({type:'reelFish',roundId:r.id,reelStep:r.reelStep,...extra});}
test('v2 requires multiple server judged pulls; replayed step and request cannot award twice',async()=>{
 const f=fixture();let r=await hooked(f);assert.equal(r.version,2);assert.ok(r.required>=2);assert.equal(r.hits,0);
 const first={type:'reelFish',roundId:r.id,reelStep:r.reelStep,requestId:crypto.randomUUID()};f.set(r.reelAt+r.period/4);
 const results=await Promise.all([f.send(first),f.send(first)]);r=results[0].farm.fishing;assert.equal(r.hits,1);assert.deepEqual(results[0].farm.products,{});
 await assert.rejects(f.send({...first,requestId:crypto.randomUUID()}),e=>e.code==='fishing_stale');
 while(r.status!=='finished')r=(await pull(f,r)).farm.fishing;
 const row=(await f.farm.read('alice')).farm;assert.equal(row.products[r.caught],1);assert.equal(row.fishBook[r.caught],1);assert.equal(row.gold,120);
 await f.send({type:'sell',item:r.caught});assert.equal((await f.farm.read('alice')).farm.fishBook[r.caught],1);
});
test('v2 allows two missed pulls and fails on third without awarding fish',async()=>{
 const f=fixture();let r=await hooked(f);for(let i=1;i<=3;i++){r=(await pull(f,r,false)).farm.fishing;assert.equal(r.misses,i);assert.equal(r.status,i===3?'finished':'reeling');}assert.equal(r.reason,'missed');assert.deepEqual((await f.farm.read('alice')).farm.products,{});
});
test('v2 reload, forged fields, missing step, timeout and storage failure are safe',async()=>{
 const f=fixture();let r=await hooked(f);assert.equal((await createFarm({db:f.db,now:()=>f.now}).read('alice')).farm.fishing.reelStep,0);
 await assert.rejects(f.send({type:'reelFish',roundId:r.id}),e=>e.code==='fishing_stale');
 const attempt={type:'reelFish',roundId:r.id,reelStep:0,requestId:crypto.randomUUID(),hits:999,prize:'arowana',won:true};
 f.set(r.reelAt+r.period/4);f.db.failWrites=true;await assert.rejects(f.send(attempt));f.db.failWrites=false;
 r=(await f.send(attempt)).farm.fishing;assert.equal(r.hits,1);assert.equal(r.caught,undefined);assert.equal('prize'in r,false);
 f.set(r.expiresAt+1);const expired=(await f.farm.read('alice')).farm;assert.equal(expired.fishing.reason,'escaped');assert.deepEqual(expired.products,{});
});
test('all twelve species can be selected and have sellable distinct art with rarity rules',()=>{
 const species=Object.entries(CATALOG).filter(([,v])=>v.type==='caught');assert.equal(species.length,12);
 for(const [key,def] of species){const r=fishing.createRound('test',0,{version:2,randomInt:(min,max)=>max===100?species.slice(0,species.findIndex(([id])=>id===key)).reduce((n,[,v])=>n+v.weight,0):min});assert.equal(r.prize,key);assert.ok(def.sell>0);assert.ok(def.shape);assert.ok(r.required>=2&&r.required<=4);}
});
test('all rarity tiers need their configured pulls and only final pull grants the species',()=>{
 const species=Object.entries(CATALOG).filter(([,v])=>v.type==='caught');let ticket=0;
 for(const [key,def]of species){const r=fishing.createRound('test',0,{version:2,randomInt:(min,max)=>max===100?ticket:min}),farm={fishing:r,products:{},stats:{}};ticket+=def.weight;
  const fail=code=>{throw Error(code);};fishing.play(farm,{type:'hookFish',roundId:r.id},r.biteAt,fail);
  for(let i=0;i<r.required;i++){fishing.play(farm,{type:'reelFish',roundId:r.id,reelStep:i,prize:'forged',hits:999},r.reelAt+r.period/4,fail);assert.equal(farm.products[key]||0,i===r.required-1?1:0);}
  assert.equal(r.caught,key);assert.equal(farm.fishBook[key],1);
 }
 assert.equal(ticket,100);
});
test('v2 action id cannot be reused for a different pull step or cast version',async()=>{
 const f=fixture(),id=crypto.randomUUID();await f.send({type:'castLine',fishingVersion:2,requestId:id});
 await assert.rejects(f.send({type:'castLine',requestId:id}),e=>e.code==='farm_request_conflict');
 const r=(await f.farm.read('alice')).farm.fishing;f.set(r.biteAt);const h=(await f.send({type:'hookFish',roundId:r.id})).farm.fishing;
 const input={type:'reelFish',roundId:h.id,reelStep:0,requestId:crypto.randomUUID()};f.set(h.reelAt+h.period/4);await f.send(input);
 await assert.rejects(f.send({...input,reelStep:1}),e=>e.code==='farm_request_conflict');
});
