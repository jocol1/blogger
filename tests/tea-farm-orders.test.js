const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createFarm, CATALOG } = require('../features/tea/farm');
function fixture() {
  let at = Date.parse('2026-11-02T12:00:00Z');
  const db = new MemoryFirestore(), farm = createFarm({ db, now: () => at });
  return { db, farm, clock: value => { at = value; }, send: input => farm.action('owner', { requestId: crypto.randomUUID(), ...input }),
    async stocked() { const row = await farm.read('owner');for (const order of row.orders.rows) row.farm.products[order.item] = order.quantity + 5;await db.collection('tea_farms').doc('owner').set(row.farm);return row; } };
}
test('daily board has three accessible rotating requests, stable across reads and restart', async () => {
  const f = fixture(), a = await f.farm.read('owner'), b = await f.farm.read('owner');
  assert.deepEqual(a.orders,b.orders);assert.equal(a.orders.rows.length,3);
  for (const row of a.orders.rows) {assert.ok(CATALOG[row.item]);assert.equal(row.reward,Math.ceil(CATALOG[row.item].sell*row.quantity*1.5));assert.equal(row.completed,false);}
  assert.deepEqual((await createFarm({db:f.db,now:()=>a.serverNow}).read('owner')).orders,a.orders);
  f.clock(a.orders.expiresAt);const next=await f.farm.read('owner');assert.equal(next.orders.day,a.orders.day+1);assert.notDeepEqual(next.orders.rows.map(o=>o.quantity+o.item),a.orders.rows.map(o=>o.quantity+o.item));
  assert.equal(new Date(a.orders.expiresAt).toISOString(),'2026-11-02T17:00:00.000Z');
});
test('delivery atomically consumes produce and pays server reward only once for concurrent requests',async()=>{
  const f=fixture(),a=await f.stocked(),o=a.orders.rows[0],input={type:'deliverOrder',orderId:o.id,requestId:crypto.randomUUID(),reward:999999,quantity:0};
  await Promise.all([f.send(input),f.send(input)]);let b=await f.farm.read('owner');
  assert.equal(b.farm.gold,a.farm.gold+o.reward);assert.equal(b.farm.products[o.item],5);assert.equal(b.farm.stats.deliveries,1);assert.equal(b.orders.rows[0].completed,true);
  await assert.rejects(f.send({...input,requestId:crypto.randomUUID()}),e=>e.code==='farm_order_delivered');
  await assert.rejects(f.send({...input,orderId:a.orders.rows[1].id}),e=>e.code==='farm_request_conflict');
  const c=await Promise.allSettled([f.send({type:'deliverOrder',orderId:a.orders.rows[1].id}),f.send({type:'deliverOrder',orderId:a.orders.rows[1].id})]);assert.equal(c.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await f.farm.read('owner')).farm.stats.deliveries,2);
});
test('missing produce, forged orders and storage errors never pay or remove goods',async()=>{
  const f=fixture(),a=await f.farm.read('owner');await assert.rejects(f.send({type:'deliverOrder',orderId:a.orders.rows[0].id}),e=>e.code==='farm_order_missing');
  for(const orderId of [undefined,'fake',0,{},a.orders.day+'-3'])await assert.rejects(f.send({type:'deliverOrder',orderId}));
  const b=await f.stocked();f.db.failWrites=true;await assert.rejects(f.send({type:'deliverOrder',orderId:b.orders.rows[0].id}));f.db.failWrites=false;assert.deepEqual((await f.farm.read('owner')).farm,b.farm);
});
test('midnight expires unfulfilled orders, permits new deliveries, and keeps replay safe',async()=>{
  const f=fixture(),a=await f.stocked(),input={type:'deliverOrder',orderId:a.orders.rows[0].id,requestId:crypto.randomUUID()};await f.send(input);
  f.clock(a.orders.expiresAt);await assert.rejects(f.send({type:'deliverOrder',orderId:a.orders.rows[1].id}),e=>e.code==='farm_order_expired');
  const next=await f.stocked();assert.ok(next.orders.rows.every(o=>!o.completed));await f.send({type:'deliverOrder',orderId:next.orders.rows[0].id});const before=(await f.farm.read('owner')).farm;
  await f.send(input);assert.deepEqual((await f.farm.read('owner')).farm,before);assert.equal(before.stats.deliveries,2);
});
test('orders are private per farm and do not mutate paid wallets or existing milestones',async()=>{
  const f=fixture(),a=await f.stocked();await f.db.collection('game_wallets').doc('owner').set({coins:10});
  await f.send({type:'deliverOrder',orderId:a.orders.rows[0].id});const other=await f.farm.read('other');assert.ok(other.orders.rows.every(o=>!o.completed));assert.equal(other.farm.gold,120);
  assert.deepEqual((await f.db.collection('game_wallets').doc('owner').get()).data(),{coins:10});assert.deepEqual((await f.farm.read('owner')).farm.claimed,[]);
});
