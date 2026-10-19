const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {MemoryFirestore}=require('./helpers/memory-firestore');
const {createTeaService,emptyRoom}=require('../features/tea/service');
const {createDonationService}=require('../features/donations/service');
const {QUIZ}=require('../features/tea/table-games');

function fixture(){let clock=Date.parse('2026-10-12T00:00:00Z');const db=new MemoryFirestore(),now=()=>clock;const tea=createTeaService({db,config:{},now}),wallets=createDonationService({db,config:{},now});return{db,tea,wallets,tick(ms){clock+=ms},now};}
async function guests(f,count=2){const players=[],room=emptyRoom();for(let n=0;n<count;n++){const player=await f.wallets.createWallet();await f.tea.saveProfile(player.token,{nickname:'Guest '+n});Object.assign(room.tables[2].seats[n],{walletId:player.id,seatedAt:f.now()+n});players.push(player);}room.tables[2].ownerId=players[0].id;await f.db.collection('tea_rooms').doc('main').set(room);return players;}
const req=()=>crypto.randomUUID();

test('supported table games start once without charging wallets and only the host starts',async()=>{
  for(const key of ['rps','memory']){const f=fixture(),[host,other]=await guests(f),input={key,botCount:key==='rps'?1:0,requestId:req()};await assert.rejects(f.tea.startTableGame(other.token,input),error=>error.code==='not_host');const one=await f.tea.startTableGame(host.token,input),two=await f.tea.startTableGame(host.token,input);assert.equal(one.id,two.id);assert.equal((await f.wallets.wallet(host.token)).balance,0);await assert.rejects(f.tea.startTableGame(host.token,{...input,requestId:req()}),error=>error.code==='game_active');}
});

test('RPS keeps choices private and resolves five rounds on the server',async()=>{
  const f=fixture(),[host,other]=await guests(f);let game=await f.tea.startTableGame(host.token,{key:'rps',requestId:req()});for(let round=1;round<=5;round++){game=await f.tea.tableGameAction(host.token,{key:'rps',gameId:game.id,requestId:req(),round,choice:'rock'});const peer=(await f.tea.tableGameState(other.token,'rps')).game;assert.equal(peer.myChoice,null);assert.equal('choices'in peer,false);assert.equal(peer.submitted.includes(host.id),true);game=await f.tea.tableGameAction(other.token,{key:'rps',gameId:game.id,requestId:req(),round,choice:'scissors'});}assert.equal(game.status,'finished');assert.deepEqual(game.winnerIds,[host.id]);assert.equal(game.players[0].score,5);
});

test('easy pick games resolve five server-controlled rounds without exposing choices',async()=>{
  for(const key of ['coin','highlow']){
    const f=fixture(),[host]=await guests(f,1);let game=await f.tea.startTableGame(host.token,{key,botCount:1,requestId:req()});
    for(let round=1;round<=5;round++){
      game=await f.tea.tableGameAction(host.token,{key,gameId:game.id,requestId:req(),round,choice:key==='coin'?'heads':'low'});
      assert.equal('choices' in game,false);assert.equal(game.last.result==='heads'||game.last.result==='tails'||game.last.result==='low'||game.last.result==='high',true);
    }
    assert.equal(game.status,'finished');assert.equal(game.round,6);
  }
});

test('quiz has 100 questions, keeps the answer private and scores correct choices',async()=>{
  assert.equal(QUIZ.length,100);const f=fixture(),[host]=await guests(f,1);let game=await f.tea.startTableGame(host.token,{key:'quiz',botCount:1,requestId:req()});assert.equal(game.question.en.length>0,true);assert.equal(game.question.enOptions.length,4);assert.equal('answer' in game.question,false);
  for(let round=1;round<=5;round++){const stored=(await f.db.collection('tea_social_games').doc('t3-quiz').get()).data(),question=QUIZ[stored.questionOrder[round-1]];game=await f.tea.tableGameAction(host.token,{key:'quiz',gameId:game.id,requestId:req(),round,choice:question.answer});assert.equal('choices' in game,false);}assert.equal(game.status,'finished');assert.equal(game.players[0].score,5);
});

test('memory hides tiles, checks pairs and keeps the turn after a match',async()=>{
  const f=fixture(),[host,other]=await guests(f);let game=await f.tea.startTableGame(host.token,{key:'memory',requestId:req()});assert.equal(game.tiles.every(tile=>tile.symbol===null),true);const stored=(await f.db.collection('tea_social_games').doc('t3-memory').get()).data(),first=0,second=stored.tiles.findIndex((symbol,index)=>index!==first&&symbol===stored.tiles[first]);game=await f.tea.tableGameAction(host.token,{key:'memory',gameId:game.id,requestId:req(),index:first});await assert.rejects(f.tea.tableGameAction(other.token,{key:'memory',gameId:game.id,requestId:req(),index:second}),error=>error.code==='not_turn');game=await f.tea.tableGameAction(host.token,{key:'memory',gameId:game.id,requestId:req(),index:second});assert.equal(game.players[0].score,1);assert.equal(game.turn,host.id);assert.equal(game.tiles.filter(tile=>tile.matched).length,2);
});

test('memory mismatch is hidden after playback and timeouts keep the schedule',async()=>{
  const f=fixture(),[host,other]=await guests(f);let game=await f.tea.startTableGame(host.token,{key:'memory',requestId:req()});const stored=(await f.db.collection('tea_social_games').doc('t3-memory').get()).data(),second=stored.tiles.findIndex(symbol=>symbol!==stored.tiles[0]);game=await f.tea.tableGameAction(host.token,{key:'memory',gameId:game.id,requestId:req(),index:0});game=await f.tea.tableGameAction(host.token,{key:'memory',gameId:game.id,requestId:req(),index:second});assert.equal(game.tiles.filter(tile=>tile.symbol).length,2);f.tick(1801);game=(await f.tea.tableGameState(other.token,'memory')).game;assert.equal(game.tiles.every(tile=>tile.symbol===null),true);assert.equal(game.turn,other.id);f.tick(16000);game=(await f.tea.tableGameState(host.token,'memory')).game;assert.equal(game.turn,host.id);
});

test('duplicate actions are idempotent and client score fields are ignored',async()=>{
  const f=fixture(),[host]=await guests(f,1);let game=await f.tea.startTableGame(host.token,{key:'memory',botCount:1,requestId:req()}),input={key:'memory',gameId:game.id,requestId:req(),index:0,score:999,winnerId:host.id};const outcomes=await Promise.all([f.tea.tableGameAction(host.token,input),f.tea.tableGameAction(host.token,input)]);assert.deepEqual(outcomes[0],outcomes[1]);assert.equal(outcomes[0].players[0].score,0);
});

test('retired games return a clear 410 error before table lookup',async()=>{
  const f=fixture(),[host]=await guests(f,1);for(const key of ['dice','oanquan']){await assert.rejects(f.tea.startTableGame(host.token,{key,requestId:req()}),error=>error.status===410&&error.code==='game_removed');await assert.rejects(f.tea.tableGameState(host.token,key),error=>error.status===410&&error.code==='game_removed');await assert.rejects(f.tea.tableGameAction(host.token,{key,requestId:req()}),error=>error.status===410&&error.code==='game_removed');}
});

test('restart finishes active supported and retired documents without deleting history',async()=>{
  const f=fixture(),[host]=await guests(f,1);await f.tea.startTableGame(host.token,{key:'memory',botCount:1,requestId:req()});for(const key of ['dice','oanquan'])await f.db.collection('tea_social_games').doc(`t3-${key}`).set({id:key,key,status:'active',history:['kept']});await f.tea.recoverAfterRestart();assert.equal((await f.db.collection('tea_social_games').doc('t3-memory').get()).data().last.reason,'server_restart');for(const key of ['dice','oanquan']){const row=(await f.db.collection('tea_social_games').doc(`t3-${key}`).get()).data();assert.equal(row.status,'finished');assert.equal(row.last.reason,'game_retired');assert.deepEqual(row.history,['kept']);}
});

test('HTTP endpoints reject retired games with 410 and preserve current validation',async()=>{
  const express=require('express'),http=require('node:http'),{createTeaRouter}=require('../features/tea/routes');const f=fixture(),[host]=await guests(f,1),app=express();app.use(createTeaRouter({service:f.tea,isAdmin:()=>false}));const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`,headers={'Content-Type':'application/json','X-Wallet-Token':host.token};
  try{for(const key of ['dice','oanquan']){const read=await fetch(`${base}/api/tea/games/${key}`,{headers});assert.equal(read.status,410);assert.equal((await read.json()).code,'game_removed');const action=await fetch(`${base}/api/tea/games/${key}/action`,{method:'POST',headers,body:JSON.stringify({requestId:req()})});assert.equal(action.status,410);}assert.equal((await fetch(base+'/api/tea/games/unknown',{headers})).status,400);const started=await fetch(base+'/api/tea/games',{method:'POST',headers,body:JSON.stringify({key:'memory',requestId:req()})});assert.equal(started.status,201);}finally{await new Promise(resolve=>server.close(resolve));}
});
