const crypto = require('node:crypto');
const catalog=require('./fish-catalog');
const rules=require('../../public/tea/fishing-rules');
const BITE_WINDOW = 4500, REEL_WINDOW = 12000;
const FISH = ['perch','perch','perch','tilapia','tilapia','snakehead'];
function createRound(id, at, {version=1,randomInt=crypto.randomInt}={}) {
  const biteAt = at + randomInt(2500,5001);
  let prize=FISH[randomInt(0,FISH.length)];
  if(version===2){let ticket=randomInt(0,100);for(const [key,def]of Object.entries(catalog)){ticket-=def.weight;if(ticket<0){prize=key;break;}}}
  return { id, status:'waiting', castAt:at, biteAt, expiresAt:biteAt+BITE_WINDOW, prize,...(version===2?{version:2,...rules.tiers[catalog[prize].rarity],hits:0,misses:0,reelStep:0}:{}) };
}
function position(at, start) { return 1 - Math.abs(((Math.max(0,at-start)/1000)%2)-1); }
function finish(round, at, reason) { Object.assign(round,{status:'finished',finishedAt:at,reason}); }
function expire(farm, at) {
  if (farm.fishing && farm.fishing.status !== 'finished' && at > farm.fishing.expiresAt) {
    finish(farm.fishing,at,'escaped'); return true;
  }
  return false;
}
function publicRound(round) {
  if (!round) return null;
  const { prize, ...visible } = round;
  return visible;
}
function play(farm, input, at, fail) {
  const round = farm.fishing;
  if (input.type === 'castLine') {
    if (round && round.status !== 'finished') fail('fishing_active');
    if (round && at < round.finishedAt+3000) fail('fishing_cooldown');
    if(input.fishingVersion!==undefined&&input.fishingVersion!==2)fail('farm_bad_request',400);
    farm.fishing = createRound(input.requestId,at,{version:input.fishingVersion}); return;
  }
  if (!round || round.id !== input.roundId) fail('fishing_stale');
  if (round.status === 'finished') fail('fishing_finished');
  if (input.type === 'stopFishing') { finish(round,at,'stopped'); return; }
  if (input.type === 'hookFish') {
    if (round.status !== 'waiting') fail('fishing_stale');
    if (at < round.biteAt) { finish(round,at,'early'); return; }
    round.status='reeling'; round.reelAt=at+350; round.expiresAt=round.reelAt+REEL_WINDOW; return;
  }
  if (round.status !== 'reeling') fail('fishing_stale');
  if(round.version===2&&input.reelStep!==round.reelStep)fail('fishing_stale');
  if (at < round.reelAt) fail('fishing_not_ready');
  const hit = round.version===2?rules.hit(at,round):Math.abs(position(at,round.reelAt)-.5)<=.17;
  if(round.version===2){
    round.reelStep++;round.lastPull=hit?'hit':'miss';if(hit)round.hits++;else round.misses++;
    if(round.misses>=3){finish(round,at,'missed');return;}
    if(round.hits<round.required){round.reelAt=at+650;round.expiresAt=round.reelAt+REEL_WINDOW;return;}
  }else if (!hit) { finish(round,at,'missed'); return; }
  if ((farm.products[round.prize]||0)>=9999) fail('farm_inventory_full');
  farm.products[round.prize]=(farm.products[round.prize]||0)+1;
  farm.stats.angled=(farm.stats.angled||0)+1;
  farm.fishBook||={};farm.fishBook[round.prize]=Math.min(999999,(farm.fishBook[round.prize]||0)+1);
  round.caught=round.prize; finish(round,at,'caught');
}
module.exports={createRound,position,expire,publicRound,play};
