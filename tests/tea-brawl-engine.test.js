const test = require('node:test');
const assert = require('node:assert/strict');
const brawl = require('../features/tea/brawl');

function match() {
  const row = brawl.createChallenge({ tableId: 't1', challengerId: 'a', targetId: 'b', names: { a: 'A <b>', b: 'B' }, at: 1000 });
  brawl.accept(row, 1000);
  return row;
}
function control(row, who, at, values = {}) {
  const seq = row.fighters[who].inputSeq + 1;
  return brawl.input(row, who, { seq, dx: 0, dy: 0, ...values }, at);
}
function nearby(row, distance = 60) { row.fighters.a.x = 400; row.fighters.b.x = 400 + distance; }

test('consented arena starts separated with a three-second countdown and a 45-second deadline', () => {
  const row = match(), view = brawl.view(row, 1000);
  assert.equal(view.maxHealth, 20); assert.deepEqual(view.arena, { width: 800, height: 520, playBounds: { xMin: 44, xMax: 756, yMin: 120, yMax: 460 } });
  assert.equal(view.startsAt, 4000); assert.equal(view.endsAt, 49000);
  assert.deepEqual(view.players.map(player => [player.x, player.y, player.health]), [[220, 260, 20], [580, 260, 20]]);
  control(row, 'a', 1100, { dx: 1 }); brawl.step(row, 1350); assert.equal(row.fighters.a.x, 220);
  assert.throws(() => control(row, 'a', 1500, { action: 'punch', requestId: 'countdown-punch-01' }), error => error.code === 'fight_countdown');
  assert.equal(row.actionHistory.length, 0);
});

test('server normalizes movement and input expiry stops stuck controls after 250 ms', () => {
  const row = match(); control(row, 'a', 4000, { dx: 999999, dy: 999999, x: 799, y: 1, speed: 9999 });
  brawl.step(row, 4100); assert.ok(Math.abs(Math.hypot(row.fighters.a.x - 220, row.fighters.a.y - 260) - 17.5) < .001);
  brawl.step(row, 4250); const x = row.fighters.a.x, y = row.fighters.a.y;
  brawl.step(row, 4700); assert.equal(row.fighters.a.x, x); assert.equal(row.fighters.a.y, y);
  assert.ok(Math.abs(Math.hypot(x - 220, y - 260) - 43.75) < .001);
});

test('spam cannot add movement and stale input cannot change direction or execute an attack', () => {
  const row = match(); control(row, 'a', 4000, { dx: 1 });
  for (let seq = 1; seq < 100; seq++) brawl.input(row, 'a', { seq, dx: 1, dy: 0 }, 4000);
  assert.equal(row.fighters.a.x, 220);
  const before = row.version;
  assert.equal(brawl.input(row, 'a', { seq: 0, dx: -1, dy: 0, action: 'punch', requestId: 'stale-attack-0001' }, 4000), false);
  assert.equal(row.version, before); assert.equal(row.actionHistory.length, 0); assert.equal(row.fighters.a.dx, 1);
});

test('bounds and body collision are enforced even through a dash', () => {
  const row = match(); row.fighters.a.x = 45; row.fighters.a.y = 121;
  control(row, 'a', 4000, { dx: -1, dy: -1, action: 'dash', requestId: 'boundary-dash-001' }); brawl.step(row, 4250);
  assert.equal(row.fighters.a.x, brawl.PLAY_BOUNDS.xMin); assert.equal(row.fighters.a.y, brawl.PLAY_BOUNDS.yMin);
  nearby(row, 60); row.fighters.a.y = row.fighters.b.y = 260;
  control(row, 'a', 6000, { dx: 1, action: 'dash', requestId: 'collision-dash-01' }); brawl.step(row, 6250);
  assert.ok(row.fighters.b.x - row.fighters.a.x >= brawl.RADIUS * 2);
});

test('attacks miss remotely or when facing away, and forged damage never changes the rules', () => {
  const row = match(); control(row, 'a', 4000, { action: 'punch', requestId: 'remote-attack-001', damage: 9999 });
  assert.equal(row.fighters.b.health, 20); assert.equal(row.actionHistory.at(-1).hit, false);
  nearby(row); control(row, 'a', 4500, { dx: -1, action: 'kick', requestId: 'backward-kick-001' });
  assert.equal(row.fighters.b.health, 20); assert.equal(row.actionHistory.at(-1).hit, false);
  brawl.step(row, 5400); nearby(row);
  control(row, 'a', 5400, { dx: 1, action: 'punch', requestId: 'forward-punch-001', damage: 9999 });
  assert.equal(row.fighters.b.health, 18); assert.equal(row.actionHistory.at(-1).targetId, 'b');
});

test('punch and kick share an authoritative cooldown; kicks have a longer reach', () => {
  const row = match(); nearby(row, 80);
  control(row, 'a', 4000, { action: 'punch', requestId: 'range-punch-0001' }); assert.equal(row.fighters.b.health, 20);
  assert.throws(() => control(row, 'a', 4200, { action: 'kick', requestId: 'early-kick-00001' }), error => error.code === 'hit_rate');
  control(row, 'a', 4450, { action: 'kick', requestId: 'range-kick-00001' }); assert.equal(row.fighters.b.health, 17);
  assert.throws(() => brawl.punch(row, 'a', { requestId: 'legacy-early-001' }, 4900), error => error.code === 'hit_rate');
  brawl.punch(row, 'a', { requestId: 'legacy-range-001' }, 5300); assert.equal(row.fighters.b.health, 17);
});

test('action IDs deduplicate retries and a short dash provides a brief dodge', () => {
  const row = match(); nearby(row);
  control(row, 'b', 4000, { action: 'dash', requestId: 'dodge-dash-00001' });
  control(row, 'a', 4000, { action: 'punch', requestId: 'dodge-punch-0001' }); assert.equal(row.fighters.b.health, 20);
  const count = row.actionHistory.length;
  control(row, 'a', 4000, { action: 'punch', requestId: 'dodge-punch-0001' }); assert.equal(row.actionHistory.length, count);
  assert.throws(() => control(row, 'b', 4300, { action: 'dash', requestId: 'too-early-dash01' }), error => error.code === 'dash_rate');
  control(row, 'a', 4500, { action: 'punch', requestId: 'after-dodge-0001' }); assert.equal(row.fighters.b.health, 18);
});

test('KO and timeout are server decisions, completed winning requests remain idempotent', () => {
  const row = match(); nearby(row); let last;
  for (let hit = 0; hit < 10; hit++) { last = { requestId: `knockout-punch-${String(hit).padStart(2, '0')}`, damage: 0, winnerId: 'b' }; brawl.punch(row, 'a', last, 4000 + hit * 450); }
  assert.equal(row.status, 'finished'); assert.equal(row.reason, 'knockout'); assert.equal(row.winnerId, 'a');
  const version = row.version; assert.equal(brawl.punch(row, 'a', last, 8100), false); assert.equal(row.version, version);
  const draw = match(); brawl.step(draw, draw.endsAt); assert.equal(draw.reason, 'draw'); assert.equal(draw.winnerId, null);
  const timed = match(); nearby(timed); brawl.punch(timed, 'a', { requestId: 'timeout-punch-01' }, 4000); brawl.step(timed, timed.endsAt);
  assert.equal(timed.reason, 'time'); assert.equal(timed.winnerId, 'a');
});

test('only fighters can control, malformed inputs never enter simulation and history remains bounded', () => {
  const row = match();
  assert.throws(() => control(row, 'a', 4000, { dx: Infinity }), error => error.code === 'bad_fight_input');
  assert.throws(() => brawl.input(row, 'outsider', { seq: 0, dx: 1, dy: 0 }, 4000), error => error.code === 'not_fighter');
  assert.throws(() => control(row, 'a', 4000, { action: 'teleport', requestId: 'forged-action-01' }), error => error.code === 'bad_fight_input');
  for (let index = 0; index < 30; index++) control(row, 'a', 4000 + index * 450, { action: 'punch', requestId: `missed-punch-${String(index).padStart(4, '0')}` });
  assert.equal(row.actionHistory.length, 20); assert.equal(brawl.view(row, 18000).players[0].name, 'A <b>');
  assert.equal('dx' in brawl.view(row, 18000).players[0], false);
});
