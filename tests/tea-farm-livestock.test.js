const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {MemoryFirestore}=require('./helpers/memory-firestore');
const {createFarm}=require('../features/tea/farm');
const world=require('../public/tea/farm-world');
function setup(){let clock=1800000000000;const db=new MemoryFirestore(),farm=createFarm({db,now:()=>clock});return{db,farm,tick:ms=>clock+=ms,send:input=>farm.action('owner',{requestId:crypto.randomUUID(),...input})};}
test('old saves gain empty pens without losing crops, gold or inventory',async()=>{
  const f=setup(),old=(await f.farm.read('owner')).farm;delete old.animals;old.gold=77;old.products.radish=3;await f.db.collection('tea_farms').doc('owner').set(old);
  const r=await f.farm.read('owner');assert.deepEqual(r.farm.animals,{chicken:[null,null],pig:[null,null]});assert.equal(r.farm.gold,77);assert.equal(r.farm.products.radish,3);
});
test('a chicken produces eggs repeatedly and collection retries never duplicate them',async()=>{
  const f=setup();let r=await f.send({type:'raiseAnimal',kind:'chicken',slot:0,purchase:true});assert.equal(r.farm.gold,100);
  let cycleId=r.farm.animals.chicken[0].cycleId;await f.send({type:'feedAnimal',kind:'chicken',slot:0,cycleId});
  await assert.rejects(f.send({type:'collectAnimal',kind:'chicken',slot:0,cycleId}),e=>e.code==='farm_not_ready');f.tick(180000);
  const input={type:'collectAnimal',kind:'chicken',slot:0,cycleId,requestId:crypto.randomUUID()};await Promise.all([f.send(input),f.send(input)]);
  r=await f.farm.read('owner');assert.equal(r.farm.products.egg,1);assert.equal(r.farm.animals.chicken[0].readyAt,null);assert.notEqual(r.farm.animals.chicken[0].cycleId,cycleId);
  await assert.rejects(f.send({type:'feedAnimal',kind:'chicken',slot:0,cycleId}),e=>e.code==='farm_stale_slot');cycleId=r.farm.animals.chicken[0].cycleId;
  await f.send({type:'feedAnimal',kind:'chicken',slot:0,cycleId});f.tick(180000);await f.send({type:'collectAnimal',kind:'chicken',slot:0,cycleId});assert.equal((await f.farm.read('owner')).farm.products.egg,2);
});
test('pig grows on server time, collection frees its slot, and sale uses farm gold',async()=>{
  const f=setup();await f.send({type:'buy',item:'pig'});let r=await f.send({type:'raiseAnimal',kind:'pig',slot:1});assert.equal(r.farm.gold,85);assert.equal(r.farm.seeds.pig,0);const cycleId=r.farm.animals.pig[1].cycleId;
  await f.send({type:'feedAnimal',kind:'pig',slot:1,cycleId});f.tick(600000);await f.send({type:'collectAnimal',kind:'pig',slot:1,cycleId});r=await f.send({type:'sell',item:'grownPig'});assert.equal(r.farm.gold,150);assert.equal(r.farm.animals.pig[1],null);
  assert.equal((await f.farm.read('other')).farm.products.grownPig,undefined);
});
test('concurrent adoption charges once and failed writes never charge or collect',async()=>{
  const f=setup(),input={type:'raiseAnimal',kind:'chicken',slot:0,purchase:true,requestId:crypto.randomUUID()};await Promise.all([f.send(input),f.send(input)]);
  await assert.rejects(f.send({...input,requestId:crypto.randomUUID()}),e=>e.code==='farm_slot_busy');assert.equal((await f.farm.read('owner')).farm.gold,100);
  f.db.failWrites=true;await assert.rejects(f.send({type:'raiseAnimal',kind:'pig',slot:0,purchase:true}));f.db.failWrites=false;const r=await f.farm.read('owner');assert.equal(r.farm.gold,100);assert.equal(r.farm.animals.pig[0],null);
  for(const input of [{type:'raiseAnimal',kind:'__proto__',slot:0},{type:'raiseAnimal',kind:'pig',slot:2},{type:'buy',item:'egg'},{type:'buy',item:'grownPig'}])await assert.rejects(f.send(input));
});
test('a station is interactable only when nearby, and selecting a distant station does not bypass distance',()=>{
  assert.equal(typeof world.nearest,'function','world must expose proximity interactions');
  const farm={plots:Array(6).fill(null),ponds:Array(2).fill(null)},target=world.targets(farm).find(t=>t.id==='garden:0');
  assert.equal(world.nearest({x:500,y:550},farm,target.id),null);
  assert.equal(world.nearest({x:130,y:333},farm,target.id).id,'garden:0');
  for(const target of world.targets(farm))assert.equal(world.blocked(target.x,target.y),false,target.id);
});
