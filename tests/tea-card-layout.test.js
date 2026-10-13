const test = require('node:test');
const assert = require('node:assert/strict');
const { seats, sortTienLen, sortColor } = require('../public/tea/card-table-layout');
test('table layout puts each viewer below and every other participant on the other edges', () => {
  for(let count=2;count<=8;count++) for(let viewer=0;viewer<count;viewer++) {
    const ids=Array.from({length:count},(_,i)=>'player-'+i),rows=seats(ids,ids[viewer]);
    assert.equal(rows.find(row=>row.id===ids[viewer]).edge,'bottom');
    assert.equal(new Set(rows.map(row=>row.id)).size,count);
    assert.equal(rows.filter(row=>row.edge==='bottom').length,1);
    if(count===2)assert.equal(rows.find(row=>row.id!==ids[viewer]).edge,'top');
    if(count===4)assert.deepEqual(new Set(rows.map(row=>row.edge)),new Set(['top','left','right','bottom']));
  }
});
test('grouping pairs preserves every Tiến lên card and sorts within each group without mutating the hand', () => {
  const cards=[{id:'a',rank:9,suit:3},{id:'b',rank:3,suit:0},{id:'c',rank:9,suit:0},{id:'d',rank:5,suit:1}],before=structuredClone(cards);
  assert.deepEqual(sortTienLen(cards,true).map(card=>card.id),['c','a','b','d']);
  assert.deepEqual(sortTienLen(cards,false).map(card=>card.id),['b','d','c','a']);assert.deepEqual(cards,before);
});
test('color sorting preserves IDs and original deal order is always recoverable', () => {
  const cards=[{id:'a',color:'blue',kind:'number',value:5},{id:'b',color:'red',kind:'draw2'},{id:'c',color:'red',kind:'number',value:2}];
  assert.deepEqual(sortColor(cards).map(card=>card.id),['c','b','a']);assert.deepEqual(sortColor(cards,false),cards);
});
