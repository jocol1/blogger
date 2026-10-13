const test=require('node:test');
const assert=require('node:assert/strict');
const {actionCursor}=require('../public/tea/card-playback');
const play=(version,type='play')=>({version,type,playerId:'guest',cards:[{id:'tl-'+version,rank:version,suit:0}],at:version*2000});

test('loading an existing round establishes a baseline without replaying old cards',()=>{
  const cursor=actionCursor();assert.deepEqual(cursor.read({id:'one',version:4,actionHistory:[play(2),play(3),play(4)]}),{fresh:true,actions:[]});
  assert.deepEqual(cursor.read({id:'one',version:4,actionHistory:[play(2),play(3),play(4)]}).actions,[]);
});
test('missed polls queue every newer action in stable order exactly once',()=>{
  const cursor=actionCursor();cursor.read({id:'one',version:1});
  const game={id:'one',version:4,actionHistory:[play(4),play(2),play(3,'pass')]};
  assert.deepEqual(cursor.read(game).actions.map(action=>action.version),[2,3,4]);
  assert.deepEqual(cursor.read(game).actions,[]);
  assert.deepEqual(cursor.read({...game,version:2,actionHistory:[play(2)]}).actions,[]);
});
test('retried action response followed by poll does not animate twice',()=>{
  const cursor=actionCursor();cursor.read({id:'one',version:1});
  const response={id:'one',version:2,actionHistory:[play(2)]};
  assert.equal(cursor.read(response).actions.length,1);
  assert.equal(cursor.read(response).actions.length,0);
  assert.deepEqual(cursor.read({...response,version:3,actionHistory:[play(2),play(3)]}).actions.map(action=>action.version),[3]);
});
test('rematch starts a fresh cursor and leaving clears the old round',()=>{
  const cursor=actionCursor();cursor.read({id:'one',version:20});
  assert.equal(cursor.read({id:'two',version:1}).fresh,true);
  assert.equal(cursor.read({id:'two',version:2,actionHistory:[play(2)]}).actions.length,1);
  cursor.reset();assert.equal(cursor.read({id:'two',version:2,actionHistory:[play(2)]}).fresh,true);
});
test('lastAction fallback supports rounds stored before action history was introduced',()=>{
  const cursor=actionCursor();cursor.read({id:'old',version:7});
  assert.equal(cursor.read({id:'old',version:8,lastAction:play(8)}).actions[0].version,8);
  assert.equal(cursor.read({id:'old',version:8,lastAction:play(8)}).actions.length,0);
});
