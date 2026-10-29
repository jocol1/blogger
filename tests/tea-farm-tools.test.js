const {test}=require('node:test'),assert=require('node:assert/strict');
const tools=require('../public/tea/farm-tools');
const catalog={radish:{type:'crop',seconds:60},guppy:{type:'fish',seconds:120}},farm={plots:[null],ponds:[null],animals:{chicken:[null,null],pig:[null,null]},seeds:{radish:2,guppy:1}};
test('direct tools choose the exact plot, inventory item and current cycle',()=>{
 const f=structuredClone(farm),target={panel:'garden',slot:0};assert.deepEqual(tools.resolve(f,catalog,target,'seed','radish',100).action,{type:'plant',item:'radish',slot:0});
 f.plots[0]={item:'radish',cycleId:'a',readyAt:null};assert.equal(tools.resolve(f,catalog,target,'seed','radish',100).suggest,'water');assert.deepEqual(tools.resolve(f,catalog,target,'water','radish',100).action,{type:'water',slot:0,cycleId:'a'});
 f.plots[0].readyAt=200;assert.equal(tools.resolve(f,catalog,target,'collect','radish',100).action,undefined);assert.equal(tools.resolve(f,catalog,target,'collect','radish',200).action.type,'harvest');
});
test('animal tools never buy without confirmation and distinguish feeding, petting and collection',()=>{
 const f=structuredClone(farm),target={panel:'chicken',slot:0};assert.equal(tools.resolve(f,catalog,target,'seed','radish',100).open,true);
 f.animals.chicken[0]={cycleId:'bird',readyAt:null};assert.equal(tools.resolve(f,catalog,target,'feed','radish',100).action.type,'feedAnimal');assert.equal(tools.resolve(f,catalog,target,'inspect','radish',100).pet,true);
 f.animals.chicken[0].readyAt=90;assert.equal(tools.resolve(f,catalog,target,'collect','radish',100).action.cycleId,'bird');
});
test('empty inventory, wrong seed category and invalid targets cannot produce a planting action',()=>{
 assert.equal(tools.resolve(farm,catalog,{panel:'garden',slot:0},'seed','guppy',100).choose,'crop');assert.equal(tools.resolve(farm,catalog,null,'water','radish',100).action,undefined);
 const f=structuredClone(farm);f.seeds.radish=0;assert.equal(tools.resolve(f,catalog,{panel:'garden',slot:0},'seed','radish',100).choose,'crop');
});
test('crops have distinct seed, sprout, leaf, flowering and ripe stages',()=>{
 assert.equal(tools.stage({readyAt:null},60,0),0);assert.equal(tools.stage({readyAt:60000},60,0),1);assert.equal(tools.stage({readyAt:60000},60,30000),2);assert.equal(tools.stage({readyAt:60000},60,50000),3);assert.equal(tools.stage({readyAt:60000},60,60000),4);
});
test('nearby status distinguishes empty, thirsty, growing and ripe without changing farm state',()=>{
 const f=structuredClone(farm),target={panel:'garden',slot:0};
 assert.equal(tools.status(f,catalog,target,0).key,'empty');
 f.plots[0]={item:'radish',readyAt:null};assert.equal(tools.status(f,catalog,target,0).key,'careStatus');
 f.plots[0].readyAt=60000;const before=JSON.stringify(f);
 assert.deepEqual(tools.status(f,catalog,target,30000),{item:'radish',key:'growingStatus',seconds:30,progress:.5});
 assert.equal(tools.status(f,catalog,target,60000).key,'readyStatus');assert.equal(JSON.stringify(f),before);
 assert.equal(tools.status(f,catalog,{panel:'shop'},0),null);
});
test('saved tools tolerate corrupt or removed choices and receipt ignores losses',()=>{
 assert.deepEqual(tools.preferences({tool:'invalid',crop:'guppy',fish:'radish'},catalog),{tool:'seed',crop:'radish',fish:'guppy'});
 assert.equal(tools.preferences({tool:'collect',crop:'radish',fish:'guppy'},catalog).tool,'collect');
 assert.deepEqual(tools.receipt({radish:3,egg:1},{radish:4,egg:1}),[{item:'radish',quantity:1}]);
 assert.deepEqual(tools.receipt({radish:3},{radish:3}),[]);
 assert.deepEqual(tools.receipt({radish:3},{radish:0}),[]);
});
