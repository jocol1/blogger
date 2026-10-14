const test=require('node:test'),assert=require('node:assert/strict');
const {boardSlots,publicActions,actionCursor}=require('../public/tea/classic-cards-ui');
test('Poker keeps five stable slot keys as flop, turn and river are revealed',()=>{
  const cards=Array.from({length:5},(_,i)=>({id:'card-'+i}));
  for(const count of [0,3,4,5]){const slots=boardSlots(cards.slice(0,count));assert.equal(slots.length,5);assert.deepEqual(slots.map(slot=>slot.index),[0,1,2,3,4]);assert.equal(slots.filter(slot=>slot.card).length,count)}
  assert.deepEqual(boardSlots(cards.slice(0,3)).slice(0,3),boardSlots(cards).slice(0,3));
});
test('latest action does not erase the public board snapshot at the same version',()=>{
  const actions=publicActions({actionHistory:[{version:2,playerId:'a',stage:'flop',board:[{id:'public'}],amount:20}],lastAction:{version:2,playerId:'a',type:'call',amount:20}});
  assert.equal(actions.length,1);assert.equal(actions[0].stage,'flop');assert.deepEqual(actions[0].board,[{id:'public'}]);assert.equal(actions[0].type,'call');
});
test('Poker cursor skips old history on reload and deduplicates retries and delayed responses',()=>{
  const cursor=actionCursor(),action=version=>({version,playerId:'a',type:'check'});assert.deepEqual(cursor.read({id:'one',version:4,actionHistory:[action(2),action(3),action(4)]}),[]);
  const next={id:'one',version:6,actionHistory:[action(6),action(4),action(5)]};assert.deepEqual(cursor.read(next).map(action=>action.version),[5,6]);assert.deepEqual(cursor.read(next),[]);assert.deepEqual(cursor.read({id:'one',version:5,actionHistory:[action(5)]}),[]);assert.deepEqual(cursor.read({id:'two',version:1}),[]);
});
