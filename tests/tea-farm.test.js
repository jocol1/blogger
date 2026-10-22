const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { MemoryFirestore } = require('./helpers/memory-firestore');
const { createDonationService } = require('../features/donations/service');
const { createTeaService, emptyRoom } = require('../features/tea/service');
const { createTeaRouter } = require('../features/tea/routes');
const { CATALOG } = require('../features/tea/farm');

async function fixture() {
  let clock = 1_800_000_000_000;
  const db = new MemoryFirestore(), now = () => clock, tea = createTeaService({ db, config: {}, now });
  const wallets = createDonationService({ db, config: {}, now });
  const a = await wallets.createWallet(), b = await wallets.createWallet();
  await tea.saveProfile(a.token, { nickname: 'Gardener' }); await tea.saveProfile(b.token, { nickname: 'Neighbour' });
  const send = (input, token = a.token) => tea.farmAction(token, { requestId: crypto.randomUUID(), ...input });
  return { db, tea, wallets, a, b, send, now, tick: ms => { clock += ms; } };
}
const code = expected => error => error.code === expected;

test('farm is private to wallet, starter grant is once, paid wallet is untouched', async () => {
  const f = await fixture();
  const first = await f.tea.enterFarm(f.a.token); assert.equal(first.farm.gold, 120); assert.equal(first.farm.plots.length, 6);
  await f.send({ type: 'buy', item: 'carrot', quantity: 2, ownerId: f.b.id, gold: 999999 });
  const [a,b] = await Promise.all([f.tea.farmState(f.a.token), f.tea.farmState(f.b.token)]);
  assert.equal(a.farm.gold, 96); assert.equal(b.farm.gold, 120); assert.equal(b.farm.seeds.carrot, undefined);
  assert.equal((await f.tea.enterFarm(f.a.token)).farm.gold, 96);
  assert.equal((await f.wallets.wallet(f.a.token)).balance, 0);
  assert.equal(JSON.stringify(await f.tea.publicState()).includes('seeds'), false);
});

test('all crop and fish types require care, mature offline and can be harvested and sold', async () => {
  for (const [item, def] of Object.entries(CATALOG).filter(([,d]) => ['crop','fish'].includes(d.type))) {
    const f = await fixture(), fish = def.type === 'fish';
    await f.send({ type: 'buy', item });
    const planted = await f.send({ type: fish ? 'stock' : 'plant', item, slot: 0 });
    const cycleId = planted.farm[fish ? 'ponds' : 'plots'][0].cycleId;
    const harvest = { type: fish ? 'catch' : 'harvest', slot: 0, cycleId };
    f.tick(9_000_000); await assert.rejects(f.send(harvest), code('farm_not_ready'));
    await f.send({ type: fish ? 'feed' : 'water', slot: 0, cycleId });
    await assert.rejects(f.send(harvest), code('farm_not_ready'));
    f.tick(def.seconds * 1000);
    // Recreate the service to prove no in-memory growth state is required.
    const restarted = createTeaService({ db: f.db, config: {}, now: f.now });
    const result = await restarted.farmAction(f.a.token, { ...harvest, requestId: crypto.randomUUID() });
    assert.equal(result.farm.products[item], 1); assert.equal(result.farm[fish ? 'ponds' : 'plots'][0], null);
    const sold = await f.send({ type: 'sell', item }); assert.equal(sold.farm.gold, 120 - def.price + def.sell);
  }
});

test('concurrent purchases cannot overspend; duplicate request cannot double charge', async () => {
  const f = await fixture(), requestId = crypto.randomUUID(), input = { requestId, type: 'buy', item: 'corn', quantity: 2 };
  const results = await Promise.all(Array.from({ length: 8 }, () => f.send(input)));
  results.forEach(r => assert.equal(r.farm.gold, 40));
  assert.equal((await f.tea.farmState(f.a.token)).farm.seeds.corn, 2);
  const race = await Promise.allSettled([f.send({ type:'buy',item:'corn' }),f.send({ type:'buy',item:'corn' })]);
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await f.tea.farmState(f.a.token)).farm.gold, 0);
  await assert.rejects(f.send({ ...input, item:'carrot' }), code('farm_request_conflict'));
});

test('repeated or concurrent harvest cannot duplicate products, even with new request ids', async () => {
  const f = await fixture(), p = await f.send({ type:'plant', item:'radish', slot:0 }), cycleId = p.farm.plots[0].cycleId;
  await f.send({ type:'water',slot:0,cycleId }); f.tick(60_000);
  const input = { type:'harvest',slot:0,cycleId,requestId:crypto.randomUUID() };
  await Promise.all([f.send(input),f.send(input)]);
  await assert.rejects(f.send({ ...input, requestId:crypto.randomUUID() }), code('farm_stale_slot'));
  const next = await f.send({ type:'plant',item:'radish',slot:0 });
  await assert.rejects(f.send({ type:'water',slot:0,cycleId }), code('farm_stale_slot'));
  assert.equal(next.farm.products.radish, 1);
});

test('quest rewards, upgrades and decoration placement are persistent and idempotent', async () => {
  const f = await fixture(); let result = await f.send({ type:'plant',item:'radish',slot:0 }); const cycleId = result.farm.plots[0].cycleId;
  await f.send({ type:'water',slot:0,cycleId });f.tick(60_000);await f.send({ type:'harvest',slot:0,cycleId });
  const claim = { type:'claim',quest:'firstCrop',requestId:crypto.randomUUID() };
  await Promise.all([f.send(claim),f.send(claim)]);
  await assert.rejects(f.send({ ...claim,requestId:crypto.randomUUID() }),code('farm_already_claimed'));
  assert.equal((await f.tea.farmState(f.a.token)).farm.gold,140);
  await f.send({ type:'buy',item:'flowers' });
  await f.send({ type:'decorate',item:'flowers',slot:0 });
  result = await f.send({ type:'decorate',item:'flowers',slot:2 });
  assert.deepEqual(result.farm.placed,[null,null,'flowers',null]);
  await assert.rejects(f.send({ type:'decorate',item:'lantern',slot:1 }),code('farm_bad_item'));
  result = await f.send({ type:'upgradePond' });assert.equal(result.farm.ponds.length,4);assert.equal(result.farm.gold,5);
  await assert.rejects(f.send({ type:'upgradePlots' }),code('farm_not_enough_gold'));
});

test('bounds, malformed input and unavailable storage cannot change farm', async () => {
  const f = await fixture();await f.tea.farmState(f.a.token);
  for(const input of [{type:'buy',item:'__proto__'},{type:'buy',item:'radish',quantity:-1},{type:'buy',item:'radish',quantity:1.5},{type:'buy',item:'radish',quantity:100},{type:'plant',item:'guppy',slot:0},{type:'plant',item:'radish',slot:6},{type:'gold',gold:999}]) await assert.rejects(f.send(input));
  await assert.rejects(f.tea.farmAction(f.a.token,{type:'buy',item:'radish'}),code('farm_bad_request'));
  const before=(await f.tea.farmState(f.a.token)).farm;f.db.failWrites=true;
  const input={type:'buy',item:'carrot',requestId:crypto.randomUUID()};await assert.rejects(f.send(input));
  assert.deepEqual((await f.tea.farmState(f.a.token)).farm,before);f.db.failWrites=false;
  assert.equal((await f.send(input)).farm.gold,108);
  await assert.rejects(f.tea.farmState('bad'),code('bad_wallet'));
  await assert.rejects(createTeaService({db:null,config:{}}).farmState(f.a.token),code('storage_unavailable'));
});

test('switching to farm releases shared cafe seat and presence, transferring table owner', async () => {
  const f = await fixture(), room=emptyRoom(), table=room.tables[0];
  Object.assign(table.seats[0],{walletId:f.a.id,seatedAt:1});Object.assign(table.seats[1],{walletId:f.b.id,seatedAt:2});table.ownerId=f.a.id;
  await f.db.collection('tea_rooms').doc('main').set(room);
  let disconnected=false;const socket={id:'farm-test',data:{},join(){},leave(){},emit(){},disconnect(){disconnected=true;}};
  await f.tea.connect(f.a.token,socket);await f.tea.enterFarm(f.a.token);
  const shared=await f.tea.publicState();assert.equal(shared.guests.length,0);assert.equal(shared.room.tables[0].seats[0].walletId,null);assert.equal(shared.room.tables[0].ownerId,f.b.id);assert.equal(disconnected,true);
});

test('HTTP farm routes require header auth, never cache private data, and report write failures', async t => {
  const f=await fixture(),app=express();app.use(createTeaRouter({service:f.tea}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/api/tea/farm')).status,401);
  assert.equal((await fetch(base+'/api/tea/farm?token='+f.a.token)).status,401);
  const response=await fetch(base+'/api/tea/farm',{headers:{'X-Wallet-Token':f.a.token}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(base+'/tra-da/farm')).status,200);
  f.db.failWrites=true;
  const failed=await fetch(base+'/api/tea/farm/actions',{method:'POST',headers:{'X-Wallet-Token':f.a.token,'Content-Type':'application/json'},body:JSON.stringify({type:'buy',item:'radish',requestId:crypto.randomUUID()})});
  assert.equal(failed.status,503);assert.equal((await f.tea.farmState(f.a.token)).farm.gold,120);
});
