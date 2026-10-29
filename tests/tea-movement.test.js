const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../public/tea/movement');
test('run/walk distance is frame independent and diagonals are normalized',()=>{
  for(const hz of [30,60,120])for(const mode of ['run','walk'])for(const [dx,dy]of [[1,0],[1,1]]){const p={x:0,y:0};for(let i=0;i<hz;i++)M.step(p,{dx,dy,mode},1/hz,()=>false);assert.ok(Math.abs(Math.hypot(p.x,p.y)-(mode==='run'?225:145))<.001);}
});
test('collision slides along a wall but never reverses or crosses thin obstacles',()=>{
  const wall=(x,y)=>x>=20&&x<=25,p={x:0,y:0};M.step(p,{dx:1,dy:1,mode:'run'},1,wall);assert.ok(p.x<20&&p.y>100);const y=p.y;M.step(p,{dx:1,dy:0,mode:'run'},1,wall);assert.equal(p.y,y);assert.ok(p.x<20);
});
test('tap walking consumes leftover frame time across waypoints at 30/60/120 FPS',()=>{
 for(const hz of [30,60,120]){const p={x:0,y:0},path=Array.from({length:300},(_,i)=>({x:(i+1)*2,y:0}));for(let i=0;i<hz;i++)M.follow(p,path,'run',1/hz,()=>false);assert.ok(Math.abs(p.x-225)<.001);}
});
test('camera preserves zoom, clamps edges and centers a map smaller than the viewport',()=>{
  const c={x:0,y:0};M.camera(c,{x:900,y:600},{width:568,height:320},{width:960,height:640},1,1,true);assert.equal(c.x,392);assert.equal(c.y,320);
  M.camera(c,{x:10,y:10},{width:1280,height:900},{width:960,height:640},1,1,true);assert.equal(c.x,-160);assert.equal(c.y,-130);
  c.x=700;c.y=600;M.camera(c,{x:900,y:600},{width:1280,height:900},{width:960,height:640},1,.016);assert.equal(c.x,-160);assert.equal(c.y,-130);
});
test('reconciliation replays only pending input and remote extrapolation stops at 150ms',()=>{
  const p=M.replay({x:10,y:20},[{seq:1,dx:1,dy:0,mode:'run',ms:50},{seq:2,dx:0,dy:1,mode:'walk',ms:50}],1,()=>false);assert.deepEqual(p,{x:10,y:27.25});
  const r=M.remote({x:10,y:20,vx:225,vy:0,at:1000},2000,()=>false);assert.ok(Math.abs(r.x-43.75)<.001);
});
test('shared path follower reaches café chairs and every farm station without clipping',()=>{
 const route=require('../public/tea/farm-motion'),cafe=require('../public/tea/world'),farm=require('../public/tea/farm-world');
 for(const [origin,goals,blocked]of [[{x:100,y:550},cafe.TABLES.flatMap(t=>t.seats),(x,y)=>cafe.blocked(x,y)],[{x:500,y:550},farm.targets({plots:Array(24).fill(null),ponds:Array(12).fill(null)}),farm.blocked]])for(const goal of goals){
  const p={...origin},path=route.findPath(p,goal,blocked);assert.ok(path.length,'No path to '+goal.id);for(let i=0;path.length&&i<2000;i++){M.follow(p,path,'run',1/60,blocked);assert.ok(!blocked(p.x,p.y));}assert.ok(Math.hypot(p.x-goal.x,p.y-goal.y)<.01,'Stopped before '+goal.id);
 }
});
