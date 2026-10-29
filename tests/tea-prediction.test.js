const {test}=require('node:test');const assert=require('node:assert/strict');
const create=require('../public/tea/prediction');
test('prediction responds before ack, replays only pending input, and preserves immediate motion while correcting',()=>{
  const p=create(()=>false);p.reset({x:0,y:0});p.step({dx:1,dy:0,mode:'run',ms:50});const first=p.packet(50);assert.equal(p.position.x,11.25);p.step({dx:1,dy:0,mode:'run',ms:50});p.packet(100);
  p.ack({x:10,y:0,ack:first.seq},120);assert.equal(p.position.x,21.25);assert.equal(p.pending.length,1);p.ack({x:0,y:0,ack:0},121);assert.equal(p.position.x,21.25);
  p.reset({x:300,y:200});assert.equal(p.pending.length,0);assert.equal(p.packet(130),null);assert.deepEqual(p.position,{x:300,y:200});
});
test('prediction limits send rate and suspends unacknowledged movement after two seconds',()=>{
 const p=create(()=>false);p.reset({x:0,y:0});for(let i=1;i<=60;i++){p.step({dx:1,dy:0,mode:'run',ms:50});p.packet(i*50);}assert.ok(p.pending.length<=40);assert.ok(p.position.x<=450);assert.equal(p.packet(3001),null);
});
