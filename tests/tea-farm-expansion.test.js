const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {MemoryFirestore}=require('./helpers/memory-firestore');
const {createFarm}=require('../features/tea/farm');
const world=require('../public/tea/farm-world'),motion=require('../public/tea/farm-motion');
function fixture(){let time=1800000000000;const db=new MemoryFirestore(),farm=createFarm({db,now:()=>time});return{db,farm,tick:ms=>time+=ms,send:input=>farm.action('farmer',{requestId:crypto.randomUUID(),...input})};}
async function planted(f,fish=false){const rows=[];for(let slot=0;slot<2;slot++){if(!fish)await f.send({type:'hoe',slot});const r=await f.send({type:fish?'stock':'plant',item:fish?'guppy':'radish',slot});rows.push({slot,cycleId:r.farm[fish?'ponds':'plots'][slot].cycleId});}return rows;}
test('expanded world has four times the area and connected routes to all zones and working slots',()=>{
  assert.equal(world.width*world.height,1000*700*4);
  const places=[...world.places,...Array.from({length:24},(_,i)=>{const p=world.plotPos(i);return{x:p.x,y:p.y+43};}),...Array.from({length:12},(_,i)=>({x:620+(i>=6?685:0),y:world.fishPos(i).y}))];
  for(const place of places){assert.equal(world.blocked(place.x,place.y),false,JSON.stringify(place));const player={x:500,y:550},path=motion.findPath(player,place,world.blocked);assert.ok(path.length,JSON.stringify(place));for(let i=0;path.length&&i<5000;i++)assert.ok(motion.follow(player,path,4,world.blocked).travelled>0);assert.ok(Math.hypot(player.x-place.x,player.y-place.y)<.01,JSON.stringify(place));}
});
test('bulk care and collection are atomic, private and exactly once under simultaneous retries',async()=>{
  for(const fish of [false,true]){const f=fixture(),targets=await planted(f,fish),care={type:fish?'feedAll':'waterAll',targets,requestId:crypto.randomUUID()};await Promise.all([f.send(care),f.send(care)]);f.tick(121000);
    const collect={type:fish?'catchAll':'harvestAll',targets,requestId:crypto.randomUUID()};const [r]=await Promise.all([f.send(collect),f.send(collect)]);assert.equal(r.farm.products[fish?'guppy':'radish'],2);assert.equal(r.farm.stats[fish?'fish':'crops'],2);
    assert.deepEqual((await f.farm.read('other')).farm.products,{});
    await assert.rejects(f.send({...collect,requestId:crypto.randomUUID()}),e=>e.code==='farm_stale_slot');
  }
});
test('invalid or stale batch cannot partially care for plots, or harvest immature crops',async()=>{
  const f=fixture(),targets=await planted(f);
  await assert.rejects(f.send({type:'waterAll',targets:[targets[0],{slot:1,cycleId:'stale-cycle'}]}),e=>e.code==='farm_stale_slot');
  assert.equal((await f.farm.read('farmer')).farm.plots[0].readyAt,null);
  for(const invalid of [[],[targets[0],targets[0]],null,[{slot:24,cycleId:'bad'}]])await assert.rejects(f.send({type:'waterAll',targets:invalid}));
  await f.send({type:'waterAll',targets});await assert.rejects(f.send({type:'harvestAll',targets}),e=>e.code==='farm_not_ready');
  f.db.failWrites=true;f.tick(61000);await assert.rejects(f.send({type:'harvestAll',targets}));f.db.failWrites=false;assert.deepEqual((await f.farm.read('farmer')).farm.products,{});
});
test('selling a basket uses server prices and a snapshot, never sells twice or partially',async()=>{
  const f=fixture(),targets=await planted(f);await f.send({type:'waterAll',targets});f.tick(61000);await f.send({type:'harvestAll',targets});
  await assert.rejects(f.send({type:'sellAll',sale:[{item:'radish',quantity:1},{item:'koi',quantity:1}]}),e=>e.code==='farm_no_product');assert.equal((await f.farm.read('farmer')).farm.products.radish,2);
  const sale={type:'sellAll',sale:[{item:'radish',quantity:2,price:999}],requestId:crypto.randomUUID()};await Promise.all([f.send(sale),f.send(sale)]);const r=await f.farm.read('farmer');assert.equal(r.farm.gold,138);assert.equal(r.farm.products.radish,0);assert.equal(r.farm.stats.sold,2);
  for(const rows of [[{item:'__proto__',quantity:1}],[{item:'radish',quantity:-1}],[{item:'radish',quantity:1},{item:'radish',quantity:1}]])await assert.rejects(f.send({type:'sellAll',sale:rows}));
});
test('existing farm saves expand to 24 plots and 12 fish slots without replacing old crops',async()=>{
  const f=fixture(),targets=await planted(f);const ref=f.db.collection('tea_farms').doc('farmer'),r=(await ref.get()).data();r.gold=100000;await ref.set(r);
  for(let i=0;i<9;i++)await f.send({type:'upgradePlots'});for(let i=0;i<5;i++)await f.send({type:'upgradePond'});
  const result=await f.farm.read('farmer');assert.equal(result.farm.plots.length,24);assert.equal(result.farm.ponds.length,12);assert.equal(result.farm.plots[0].cycleId,targets[0].cycleId);
  await assert.rejects(f.send({type:'upgradePlots'}),e=>e.code==='farm_max_level');await assert.rejects(f.send({type:'upgradePond'}),e=>e.code==='farm_max_level');
});
