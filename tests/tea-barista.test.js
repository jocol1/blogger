const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {MemoryFirestore}=require('./helpers/memory-firestore');
const {createTableGames}=require('../features/tea/table-games');
const {emptyRoom}=require('../features/tea/service');
async function fixture(count=1){let at=1800000000000;const db=new MemoryFirestore(),games=createTableGames({db,now:()=>at}),room=emptyRoom(),table=room.tables[2];for(let n=0;n<count;n++){table.seats[n].walletId='p'+n;await db.collection('tea_profiles').doc('p'+n).set({nickname:'Player '+n});}table.ownerId='p0';await db.collection('tea_rooms').doc('main').set(room);return{db,games,tick:ms=>at+=ms,read:async(id='p0')=>(await games.state(id,'barista')).game,start:()=>games.start('p0',{key:'barista',requestId:crypto.randomUUID()}),send:(g,id='p0',extra={})=>games.action(id,{key:'barista',gameId:g.id,round:g.round,requestId:crypto.randomUUID(),type:'serve',steps:g.recipe,...extra})};}
test('barista works solo, hides recipe after preview and completes five increasing rounds',async()=>{
 const f=await fixture();let game=await f.start();assert.equal(game.phase,'preview');assert.equal(game.recipe.length,3);assert.equal(game.ingredients.length,6);
 for(let round=1;round<=5;round++){const preview=game;assert.equal(game.recipe.length,[3,3,4,4,5][round-1]);await assert.rejects(f.send(preview),e=>e.code==='barista_not_mixing');f.tick(5000);game=await f.read();assert.equal(game.phase,'mixing');assert.equal(game.recipe,null);assert.equal('recipes'in game,false);game=await f.send(preview);assert.equal(game.phase,'result');assert.equal(game.players[0].score,round);assert.ok(game.results[0].correct);f.tick(3500);game=await f.read();}
 assert.equal(game.status,'finished');assert.deepEqual(game.winnerIds,['p0']);
});
test('peers mix privately, wrong order fails, duplicate requests and submissions cannot score twice',async()=>{
 const f=await fixture(2),g=await f.start();f.tick(5000);const req=crypto.randomUUID();await Promise.all([f.send(g,'p0',{requestId:req}),f.send(g,'p0',{requestId:req})]);const peer=await f.read('p1');assert.equal(peer.myMix,null);assert.equal(peer.results,null);assert.equal(peer.recipe,null);assert.equal(peer.players[0].score,0);
 await assert.rejects(f.send(g),e=>e.code==='barista_submitted');const result=await f.send(g,'p1',{steps:g.recipe.slice().reverse(),score:100});assert.equal(result.phase,'result');assert.equal(result.players[0].score,1);assert.equal(result.players[1].score,0);assert.equal(result.results[1].correct,false);
});
test('timeouts catch up from prior deadlines, stale actions cannot enter a new round',async()=>{
 const f=await fixture(),g=await f.start();f.tick(25000);let state=await f.read();assert.equal(state.phase,'result');assert.equal(state.results[0].correct,false);assert.equal(state.players[0].score,0);f.tick(3500);state=await f.read();assert.equal(state.round,2);
 await assert.rejects(f.send(g),e=>e.code==='barista_old_round');f.tick(5*28500);state=await f.read();assert.equal(state.status,'finished');assert.equal(state.round,5);assert.equal(state.players[0].score,0);
});
test('invalid mixes, unauthorized guests and failed writes leave scores unchanged',async()=>{
 const f=await fixture(2),g=await f.start();f.tick(5000);for(const steps of [[],null,'tea',['tea'],['bad','milk','ice'],Array(999).fill('tea')])await assert.rejects(f.send(g,'p0',{steps}),e=>e.code==='barista_bad_mix');
 await assert.rejects(f.send(g,'stranger'),e=>e.code==='not_seated');f.db.failWrites=true;await assert.rejects(f.send(g));f.db.failWrites=false;const state=await f.read();assert.equal(state.myMix,null);assert.equal(state.players[0].score,0);
});
test('only host starts, bots are rejected, server restart cancels without wallet writes',async()=>{
 const f=await fixture(2);await assert.rejects(f.games.start('p1',{key:'barista',requestId:crypto.randomUUID()}),e=>e.code==='not_host');await assert.rejects(f.games.start('p0',{key:'barista',botCount:1,requestId:crypto.randomUUID()}),e=>e.code==='barista_no_bots');await f.start();await f.games.cancelAfterRestart();assert.equal((await f.read()).last.reason,'server_restart');assert.ok([...f.db.rows.keys()].every(k=>!k.startsWith('game_wallets/')));
});
