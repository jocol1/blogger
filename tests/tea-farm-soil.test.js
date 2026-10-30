const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {MemoryFirestore}=require('./helpers/memory-firestore');const {createFarm}=require('../features/tea/farm');
function fixture(){let time=1800000000000;const db=new MemoryFirestore(),farm=createFarm({db,now:()=>time});return{db,farm,tick:n=>time+=n,send:input=>farm.action('owner',{requestId:crypto.randomUUID(),...input})};}
test('hoe precedes planting, costs nothing and survives harvest and restart',async()=>{
 const f=fixture();await assert.rejects(f.send({type:'plant',item:'radish',slot:0}),e=>e.code==='farm_untilled');
 const h=await f.send({type:'hoe',slot:0});assert.equal(h.farm.tilled[0],true);assert.equal(h.farm.gold,120);assert.equal(h.farm.seeds.radish,6);
 const p=await f.send({type:'plant',item:'radish',slot:0}),cycleId=p.farm.plots[0].cycleId;
 await assert.rejects(f.send({type:'hoe',slot:0}),e=>e.code==='farm_slot_busy');await f.send({type:'water',slot:0,cycleId});f.tick(60000);await f.send({type:'harvest',slot:0,cycleId});
 const next=await f.send({type:'plant',item:'radish',slot:0});assert.equal(next.farm.seeds.radish,4);assert.equal(next.farm.products.radish,1);assert.equal((await createFarm({db:f.db}).read('owner')).farm.tilled[0],true);
});
test('hoe concurrent replay applies once; invalid slots and storage failure cannot change soil',async()=>{
 const f=fixture(),input={type:'hoe',slot:1,requestId:crypto.randomUUID()};const r=await Promise.all([f.send(input),f.send(input)]);assert.equal(r[0].farm.version,r[1].farm.version);
 await assert.rejects(f.send({type:'hoe',slot:1}),e=>e.code==='farm_already_tilled');for(const slot of [-1,6,1.5,'1'])await assert.rejects(f.send({type:'hoe',slot}));
 f.db.failWrites=true;await assert.rejects(f.send({type:'hoe',slot:0}));f.db.failWrites=false;assert.equal((await f.farm.read('owner')).farm.tilled[0],false);
});
test('old crops and their timers survive lazy soil migration exactly once',async()=>{
 const f=fixture(),old=(await f.farm.read('owner')).farm;delete old.tilled;old.plots[2]={item:'radish',cycleId:'existing-crop',plantedAt:100,readyAt:999999};old.gold=86;old.seeds.radish=3;
 await f.db.collection('tea_farms').doc('owner').set(old);const a=await f.farm.read('owner'),b=await f.farm.read('owner');assert.deepEqual(a.farm.plots,old.plots);assert.equal(a.farm.gold,86);assert.equal(a.farm.seeds.radish,3);assert.deepEqual(a.farm.tilled,[false,false,true,false,false,false]);assert.equal(a.farm.version,b.farm.version);
});
test('small tiles select the cell in front in all four directions, not a remembered neighbour',()=>{
 const world=require('../public/tea/farm-world'),tools=require('../public/tea/farm-tools'),farm={plots:Array(6).fill(null),tilled:Array(6).fill(false),ponds:[],animals:{}},at=world.plotPos(1);
 for(const [facing,dx,dy]of [['up',0,28],['down',0,-28],['left',28,0],['right',-28,0]])assert.equal(world.nearest({x:at.x+dx,y:at.y+dy},farm,'garden:0',facing).slot,1);
 const target={panel:'garden',slot:1};assert.equal(tools.resolve(farm,{},target,'seed','radish',0).suggest,'hoe');assert.deepEqual(tools.resolve(farm,{},target,'hoe','radish',0).action,{type:'hoe',slot:1});farm.tilled[1]=true;assert.equal(tools.resolve(farm,{},target,'hoe','radish',0).suggest,'seed');assert.equal(world.targets(farm)[0].hit.w,40);
});
test('expanding the garden adds untilled tiles and cannot affect another wallet',async()=>{
 const f=fixture();await f.send({type:'hoe',slot:0});const r=await f.send({type:'upgradePlots'});assert.equal(r.farm.plots.length,8);assert.deepEqual(r.farm.tilled,[true,false,false,false,false,false,false,false]);assert.equal(r.farm.gold,0);assert.equal((await f.farm.read('neighbour')).farm.tilled[0],false);
});
