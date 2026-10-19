const test=require('node:test');
const assert=require('node:assert/strict');
const {timeAt,trafficAt}=require('../public/tea/ambience');
const at=time=>Date.parse(`2026-10-14T${time}+07:00`);
test('cafe clock always shows Vietnam time including the midnight rollover',()=>{
  assert.equal(timeAt(at('23:59:59')).clock,'23:59:59');
  assert.equal(timeAt(at('23:59:59')+1000).clock,'00:00:00');
  assert.equal(timeAt(Date.parse('2026-10-14T03:15:20Z')).clock,'10:15:20');
});
test('lighting smoothly changes at dawn and dusk without changing the clock speed',()=>{
  assert.equal(timeAt(at('04:59:59')).night,1);assert.equal(timeAt(at('07:00:00')).night,0);
  assert.equal(timeAt(at('12:00:00')).phase,'day');assert.equal(timeAt(at('18:00:00')).night,0);
  assert.equal(timeAt(at('19:00:00')).night,.5);assert.equal(timeAt(at('20:00:00')).night,1);
  assert.equal(timeAt(at('06:00:00')).night,.5);
  assert.ok(Math.abs(timeAt(at('20:00:00')).night-timeAt(at('19:59:59')).night)<.001);
});
test('traffic moves both ways only on the road with quiet gaps and no reduced-motion animation',()=>{
  let east=false,west=false,quiet=false;
  for(let time=0;time<120000;time+=100){const cars=trafficAt(time);assert.ok(cars.length<=2);if(!cars.length)quiet=true;for(const car of cars){assert.ok(car.y>=578&&car.y<=622);assert.ok(car.x>=-90&&car.x<=1050);if(car.direction===1)east=true;else west=true}}
  assert.ok(east&&west&&quiet);assert.ok(trafficAt(100)[0].x>trafficAt(0)[0].x);
  assert.deepEqual(trafficAt(at('12:00:00'),true),[]);assert.deepEqual(trafficAt(0),trafficAt(0));
});
