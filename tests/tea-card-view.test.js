const test=require('node:test');const assert=require('node:assert/strict');const {playable,acceptsView}=require('../public/tea/card-view');
test('highlighted cards follow color, number, action symbol and wild-card rules',()=>{
  const game={activeColor:'red',top:{color:'red',kind:'number',value:5}};
  assert.equal(playable({color:'red',kind:'number',value:9},game),true);
  assert.equal(playable({color:'blue',kind:'number',value:5},game),true);
  assert.equal(playable({color:'blue',kind:'number',value:4},game),false);
  assert.equal(playable({color:'green',kind:'wild'},game),true);
  assert.equal(playable({color:'blue',kind:'draw2'},{activeColor:'red',top:{color:'red',kind:'draw2'}}),true);
  assert.equal(playable({color:'blue',kind:'skip'},{activeColor:'red',top:{color:'red',kind:'draw2'}}),false);
  assert.equal(playable({color:'blue',kind:'number',value:5},{activeColor:'green',top:{color:'wild',kind:'wild'}}),false);
  assert.equal(playable({color:'green',kind:'number',value:5},{activeColor:'green',top:{color:'wild',kind:'wild'}}),true);
});
test('older card snapshots cannot replace a newer result',()=>{
  assert.equal(acceptsView({id:'one',version:7},{id:'one',version:6}),false);
  assert.equal(acceptsView({id:'one',version:7},{id:'one',version:7}),true);
  assert.equal(acceptsView({id:'one',version:7},{id:'two',version:1}),true);
});
