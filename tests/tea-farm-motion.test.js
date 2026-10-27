const test=require('node:test'),assert=require('node:assert/strict');
const {findPath,follow,clear}=require('../public/tea/farm-motion');
const plots=Array.from({length:12},(_,i)=>({x:130+i%4*110,y:290+Math.floor(i/4)*90}));
const blocked=(x,y)=>x<75||x>930||y<220||y>625||(x>365&&x<665&&y<224)||(x>648&&x<906&&y>225&&y<522)||plots.some(p=>Math.abs(x-p.x)<45&&Math.abs(y-p.y)<32);
test('diagonal approach does not clip a plot corner between path samples',()=>{
  for(const budget of [1,2.4,5.8]){const player={x:540,y:419},goal={x:460,y:333},path=findPath(player,goal,blocked);assert.ok(path.length);
    for(let frame=0;path.length&&frame<1000;frame++)assert.ok(follow(player,path,budget,blocked).travelled>0,'path stopped at '+JSON.stringify(player));
    assert.ok(Math.hypot(player.x-goal.x,player.y-goal.y)<.001);
  }
});
test('walking consumes the frame budget across waypoints without a pause or overshoot',()=>{
  const player={x:0,y:0},path=[{x:1,y:0},{x:2,y:0},{x:2,y:6}];
  const move=follow(player,path,5,()=>false);assert.equal(move.travelled,5);assert.deepEqual(player,{x:2,y:3});
  assert.equal(follow(player,path,5,()=>false).travelled,3);assert.deepEqual(player,{x:2,y:6});assert.equal(path.length,0);
});
test('tap paths reach every plot, pond bank and dock without crossing obstacles',()=>{
  for(const goal of [...plots.map(p=>({x:p.x,y:p.y+43})),{x:620,y:290},{x:620,y:470},{x:780,y:540},{x:920,y:300}]){
    const player={x:500,y:550},path=findPath(player,goal,blocked);assert.ok(path.length,JSON.stringify(goal));
    for(let frames=0;path.length&&frames<1000;frames++){
      const before={...player},moved=follow(player,path,145/60,blocked);assert.ok(moved.travelled>0);assert.ok(moved.travelled<=145/60+.001);assert.ok(clear(before,player,blocked));assert.ok(!blocked(player.x,player.y));
    }
    assert.ok(Math.hypot(player.x-goal.x,player.y-goal.y)<.001);
  }
});
test('free ground paths are direct; blocked taps and new obstacles do not teleport',()=>{
  assert.deepEqual(findPath({x:500,y:550},{x:800,y:550},blocked),[{x:800,y:550}]);
  assert.deepEqual(findPath({x:500,y:550},{x:700,y:400},blocked),[]);
  const player={x:0,y:0},path=[{x:100,y:0}];follow(player,path,100,(x)=>x>40);assert.deepEqual(player,{x:0,y:0});assert.equal(path.length,0);
});
