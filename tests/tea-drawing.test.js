const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {MemoryFirestore}=require('./helpers/memory-firestore');
const {createTableGames}=require('../features/tea/table-games');
const {emptyRoom}=require('../features/tea/service');
const {WORDS}=require('../features/tea/drawing-game');
async function fixture(count=3){let time=1800000000000;const db=new MemoryFirestore(),service=createTableGames({db,now:()=>time}),room=emptyRoom();const table=room.tables.find(t=>t.seats.length>=count);for(let n=0;n<count;n++){table.seats[n].walletId='p'+n;await db.collection('tea_profiles').doc('p'+n).set({nickname:'Person '+n});}table.ownerId='p0';await db.collection('tea_rooms').doc('main').set(room);return{db,service,table,tick:n=>time+=n,start:()=>service.start('p0',{key:'drawing',requestId:crypto.randomUUID()}),send:(id,game,input)=>service.action(id,{key:'drawing',gameId:game.id,round:game.round,requestId:crypto.randomUUID(),...input})};}
const stroke={color:'#263e46',width:7,points:[[0,0],[300,180],[600,360]]};
test('drawing requires real seated players, protects secret and only host starts',async()=>{
 const one=await fixture(1);await assert.rejects(one.start(),e=>e.code==='drawing_need_players');
 const f=await fixture();await assert.rejects(f.service.start('p0',{key:'drawing',botCount:1,requestId:crypto.randomUUID()}),e=>e.code==='drawing_need_players');
 await assert.rejects(f.service.start('p1',{key:'drawing',requestId:crypto.randomUUID()}),e=>e.code==='not_host');const g=await f.start();assert.ok(g.prompt.en);const other=(await f.service.state('p1','drawing')).game;assert.equal(other.prompt,null);assert.equal('words'in other,false);
 await assert.rejects(f.service.state('outsider','drawing'),e=>e.code==='not_seated');
});
test('strokes persist for peers, validate bounds and only artist can draw; duplicate is harmless',async()=>{
 const f=await fixture(),g=await f.start(),input={type:'stroke',stroke,requestId:crypto.randomUUID()};
 await assert.rejects(f.send('p1',g,input),e=>e.code==='drawing_not_artist');await Promise.all([f.send('p0',g,input),f.send('p0',g,input)]);assert.equal((await f.service.state('p1','drawing')).game.strokes.length,1);
 const persisted=(await f.db.collection('tea_social_games').doc(f.table.id+'-drawing').get()).data();assert.deepEqual(persisted.strokes[0].points,[{x:0,y:0},{x:300,y:180},{x:600,y:360}]);
 function firestoreArrays(value){if(Array.isArray(value)){assert.ok(value.every(v=>!Array.isArray(v)),'Firestore cannot store nested arrays');value.forEach(firestoreArrays);}else if(value&&typeof value==='object')Object.values(value).forEach(firestoreArrays);}
 for(const value of f.db.rows.values())firestoreArrays(value);
 f.tick(101);for(const bad of [{...stroke,color:'url(secret)'},{...stroke,points:[[601,0]]},{...stroke,points:[[NaN,0]]},{...stroke,width:99},{...stroke,points:Array(101).fill([1,1])}])await assert.rejects(f.send('p0',g,{type:'stroke',stroke:bad}),e=>e.code==='drawing_bad_stroke');
 f.db.failWrites=true;await assert.rejects(f.send('p0',g,{type:'clear'}));f.db.failWrites=false;assert.equal((await f.service.state('p1','drawing')).game.strokes.length,1);await f.send('p0',g,{type:'clear'});assert.equal((await f.service.state('p1','drawing')).game.strokes.length,0);
});
test('wrong guesses are private and rate limited, correct guesses score both sides only once',async()=>{
 const f=await fixture(),g=await f.start();let wrong=await f.send('p1',g,{type:'guess',text:'definitely wrong'});assert.equal(wrong.feedback,'tryAgain');assert.equal((await f.service.state('p2','drawing')).game.feedback,null);
 await assert.rejects(f.send('p1',g,{type:'guess',text:g.prompt.en}),e=>e.code==='drawing_guess_rate');f.tick(2001);
 const input={type:'guess',text:g.prompt.vi.toUpperCase(),requestId:crypto.randomUUID(),score:999};const results=await Promise.all([f.send('p1',g,input),f.send('p1',g,input)]);assert.equal(results[0].players[0].score,1);assert.equal(results[0].players[1].score,1);assert.equal(results[0].prompt,null);
 await assert.rejects(f.send('p1',g,{type:'guess',text:g.prompt.en}),e=>e.code==='drawing_already_guessed');
 const reveal=await f.send('p2',g,{type:'guess',text:g.prompt.en});assert.equal(reveal.phase,'reveal');assert.deepEqual(reveal.prompt,g.prompt);assert.equal(reveal.players[0].score,2);
 f.tick(5000);const next=(await f.service.state('p1','drawing')).game;assert.equal(next.artist,'p1');assert.equal(next.round,2);assert.ok(next.prompt);assert.equal((await f.service.state('p0','drawing')).game.prompt,null);assert.equal(next.strokes.length,0);
 await assert.rejects(f.send('p0',g,{type:'stroke',stroke}),e=>e.code==='drawing_old_round');
});
test('round schedule catches up without extending deadlines and finishes all players',async()=>{
 const f=await fixture(8),g=await f.start();f.tick(60000);assert.equal((await f.service.state('p0','drawing')).game.phase,'reveal');f.tick(5000);assert.equal((await f.service.state('p1','drawing')).game.round,2);
 f.tick(7*65000);const end=(await f.service.state('p0','drawing')).game;assert.equal(end.status,'finished');assert.equal(end.round,8);assert.equal(end.players.length,8);
 assert.equal(new Set(WORDS.map(w=>w.en)).size,40);
});
test('late spectators cannot act, leaving cancels, and restart ends drawing games',async()=>{
 const f=await fixture(2),g=await f.start(),ref=f.db.collection('tea_rooms').doc('main'),room=(await ref.get()).data();room.tables.find(t=>t.id===f.table.id).seats.push({walletId:'late'});await ref.set(room);
 assert.equal((await f.service.state('late','drawing')).game.prompt,null);await assert.rejects(f.send('late',g,{type:'guess',text:g.prompt.en}),e=>e.code==='spectator');
 const r=(await ref.get()).data();r.tables.find(t=>t.id===f.table.id).seats[1].walletId=null;await ref.set(r);assert.equal((await f.service.state('p0','drawing')).game.status,'finished');
 const other=await fixture();await other.start();await other.service.cancelAfterRestart();assert.equal((await other.service.state('p0','drawing')).game.status,'finished');
});
