const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../public/tea/farm-outbox');
function storage() {
  const rows = new Map();
  return { get length() { return rows.size; }, key: i => [...rows.keys()][i], getItem: key => rows.get(key) || null,
    setItem: (key,value) => rows.set(key,value), removeItem: key => rows.delete(key) };
}
const a={type:'buy',item:'radish',requestId:'request-00000001'},b={type:'buy',item:'carrot',requestId:'request-00000002'};
test('two tabs keep independent requests and acknowledgement removes only its own request',()=>{
  const s=storage(),tabA=create(s,'wallet-a'),tabB=create(s,'wallet-a');
  tabA.save(a);tabB.save(b);tabA.remove(a.requestId);
  assert.deepEqual(tabB.first(),b);assert.deepEqual(create(s,'wallet-a').first(),b);
  tabA.remove(a.requestId);assert.deepEqual(tabB.first(),b);
  tabB.remove(b.requestId);assert.equal(tabA.first(),null);
});
test('outbox preserves id on reload, duplicate save, and legacy upgrade without early acknowledgement',()=>{
  const s=storage(),legacy='locly-farm-pending-wallet-a';s.setItem(legacy,JSON.stringify(a));
  const queue=create(s,'wallet-a');assert.deepEqual(queue.first(),a);
  assert.ok(s.getItem(legacy),'older tab must still see its unconfirmed operation');
  queue.save(a);assert.deepEqual(create(s,'wallet-a').first(),a);
  queue.remove(a.requestId);assert.equal(queue.first(),null);assert.equal(s.getItem(legacy),null);
});
test('wallet queues stay separate and malformed or failed writes do not discard valid requests',()=>{
  const s=storage(),one=create(s,'one'),two=create(s,'two');one.save(a);two.save(b);one.remove(a.requestId);assert.deepEqual(two.first(),b);
  s.setItem('locly-farm-pending-two:broken','bad JSON');assert.deepEqual(two.first(),b);
  assert.throws(()=>two.save({...a,requestId:'bad'}));
  const legacy='locly-farm-pending-old';s.setItem(legacy,JSON.stringify(a));s.setItem=()=>{throw Error('Storage quota');};
  assert.throws(()=>create(s,'old').first());assert.equal(JSON.parse(s.getItem(legacy)).requestId,a.requestId);
});
