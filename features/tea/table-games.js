const crypto = require('node:crypto');

const KEYS = ['rps', 'memory', 'quiz', 'math', 'pattern'];
const RETIRED_KEYS = ['coin', 'highlow', 'dice', 'oanquan'];
const QUIZ = [
  { en:'Which planet is known as the Red Planet?', vi:'Hành tinh nào được gọi là hành tinh Đỏ?', enOptions:['Venus','Mars','Jupiter','Mercury'], viOptions:['Sao Kim','Sao Hỏa','Sao Mộc','Sao Thủy'], answer:1 },
  { en:'How many sides does a triangle have?', vi:'Một hình tam giác có bao nhiêu cạnh?', enOptions:['2','3','4','5'], viOptions:['2','3','4','5'], answer:1 },
  { en:'What is 7 × 8?', vi:'7 × 8 bằng bao nhiêu?', enOptions:['48','54','56','64'], viOptions:['48','54','56','64'], answer:2 },
  { en:'Which animal is famous for changing its colors?', vi:'Con vật nào nổi tiếng vì đổi màu?', enOptions:['Chameleon','Dolphin','Penguin','Rabbit'], viOptions:['Tắc kè hoa','Cá heo','Chim cánh cụt','Thỏ'], answer:0 },
  { en:'What do bees make?', vi:'Ong làm ra gì?', enOptions:['Milk','Honey','Bread','Rice'], viOptions:['Sữa','Mật ong','Bánh mì','Gạo'], answer:1 },
  { en:'Which one is not a primary color?', vi:'Màu nào không phải màu cơ bản?', enOptions:['Red','Blue','Yellow','Purple'], viOptions:['Đỏ','Xanh dương','Vàng','Tím'], answer:3 }
];
for (let n=7;n<=100;n++) {
  const a=(n*7)%31+2, b=(n*11)%17+2, answer=a+b, values=[answer,answer+2,answer-1,answer+5], shift=n%4;
  const options=values.slice(shift).concat(values.slice(0,shift));
  QUIZ.push({en:`Quick maths: what is ${a} + ${b}?`,vi:`Tính nhanh: ${a} + ${b} bằng bao nhiêu?`,enOptions:options.map(String),viOptions:options.map(String),answer:(4-shift)%4});
}
const MATH = [];
const PATTERN = [];
for (let n=0;n<100;n++) {
  const a=(n*13)%43+7, b=(n*17)%29+4, answer=a+b, values=[answer,answer+3,answer-2,answer+8], shift=n%4;
  MATH.push({en:`Mental maths: ${a} + ${b} = ?`,vi:`Tính nhẩm: ${a} + ${b} = ?`,enOptions:values.slice(shift).concat(values.slice(0,shift)).map(String),viOptions:values.slice(shift).concat(values.slice(0,shift)).map(String),answer:(4-shift)%4});
  const start=(n%8)+2, step=(n%6)+2, next=start+step*4, patternValues=[next,next+step,next-1,next+step*2], patternShift=(n+1)%4;
  PATTERN.push({en:`Find the next number: ${start}, ${start+step}, ${start+step*2}, ${start+step*3}, ?`,vi:`Tìm số tiếp theo: ${start}, ${start+step}, ${start+step*2}, ${start+step*3}, ?`,enOptions:patternValues.slice(patternShift).concat(patternValues.slice(0,patternShift)).map(String),viOptions:patternValues.slice(patternShift).concat(patternValues.slice(0,patternShift)).map(String),answer:(4-patternShift)%4});
}
const QUESTION_BANKS = { quiz: QUIZ, math: MATH, pattern: PATTERN };
const QUESTION_KEYS = Object.keys(QUESTION_BANKS);
const MEMORY_SYMBOLS = ['apple','orange','peach','lemon','pear','cherry'];
const REQUEST = /^[a-zA-Z0-9-]{12,80}$/;
const shuffle = values => { for (let i = values.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [values[i], values[j]] = [values[j], values[i]]; } return values; };
const fail = (status, message, code) => { throw Object.assign(new Error(message), { status, code, tableGameError: true }); };

function createTableGames({ db, now }) {
  const games = () => db.collection('tea_social_games');
  const attempts = () => db.collection('tea_social_actions');
  function view(game, walletId) {
    if (!game) return null;
    const base = { id:game.id, version:game.version||0, key:game.key, tableId:game.tableId, status:game.status, players:game.players.map(id=>({id,name:game.names[id],bot:id.startsWith('bot:'),score:game.scores[id]||0})), turn:game.players[game.turnIndex], deadline:game.deadline, winnerIds:game.winnerIds||[], serverNow:now(), round:game.round||1, last:game.last||null, member:game.players.includes(walletId) };
    if (['rps',...QUESTION_KEYS].includes(game.key)) {
      const answer=QUESTION_BANKS[game.key]?.[game.questionOrder[(game.round||1)-1]??0]||null;
      return {...base, submitted:game.players.filter(id=>game.choices[id]), myChoice:game.choices[walletId]??null, maxRounds:5, ...(answer?{question:{en:answer.en,vi:answer.vi,enOptions:answer.enOptions,viOptions:answer.viOptions}}:{})};
    }
    return {...base, tiles:game.tiles.map((symbol,index)=>({index,symbol:game.matched.includes(index)||(game.reveal||[]).includes(index)||game.status==='finished'?symbol:null,matched:game.matched.includes(index)})), revealUntil:game.revealUntil||null};
  }
  function advance(game, at=now()){game.turnIndex=(game.turnIndex+1)%game.players.length;game.deadline=at+15_000;game.first=[];}
  function finish(game){game.status='finished';const maximum=Math.max(...Object.values(game.scores));game.winnerIds=game.players.filter(id=>game.scores[id]===maximum);game.finishedAt=now();}
  function settleRps(game, at=now()){
    const signs=[...new Set(Object.values(game.choices).filter(sign=>sign!=='missed'))];let winning=signs.length===1&&Object.values(game.choices).includes('missed')?signs[0]:null;
    if(signs.length===2)winning=signs.includes('rock')&&signs.includes('scissors')?'rock':signs.includes('scissors')&&signs.includes('paper')?'scissors':'paper';
    const winners=winning?game.players.filter(id=>game.choices[id]===winning):[];for(const id of winners)game.scores[id]++;
    game.last={choices:{...game.choices},winnerIds:winners,round:game.round};game.choices={};game.round++;if(game.round>5)finish(game);else game.deadline=at+15_000;
  }
  function settleQuiz(game, at=now()){
      const question=QUESTION_BANKS[game.key][game.questionOrder[(game.round||1)-1]??0];const winners=game.players.filter(id=>game.choices[id]===question.answer);for(const id of winners)game.scores[id]++;
    game.last={winnerIds:winners,round:game.round,correctIndex:question.answer};game.choices={};game.round++;if(game.round>5)finish(game);else game.deadline=at+15_000;
  }
  function flip(game,id,index,at=now()){
    const picked=Array.isArray(game.first)?game.first.slice():game.first===null?[]:[game.first];
    picked.push(index);game.first=picked;game.reveal=picked.slice();game.botMemory||={};game.botMemory[index]=game.tiles[index];
    if(picked.length<3)return;
    const symbol=game.tiles[picked[0]],match=picked.every(tileIndex=>game.tiles[tileIndex]===symbol);
    if(match){game.matched.push(...picked);game.scores[id]++;game.last={playerId:id,match:true};game.first=[];game.reveal=[];if(game.matched.length===game.tiles.length)finish(game);else game.deadline=at+15_000;}
    else{game.last={playerId:id,match:false};game.revealUntil=at+1800;advance(game,at+1800);}
  }
  function progress(game){
    for(let guard=0;guard<80&&game.status==='active';guard++){
      if(game.revealUntil){if(now()<game.revealUntil)break;game.reveal=[];game.revealUntil=null;}
      const id=game.players[game.turnIndex];
      if(['rps',...QUESTION_KEYS].includes(game.key)){
        for(const bot of game.players.filter(value=>value.startsWith('bot:'))){if(game.choices[bot]!==undefined)continue;game.choices[bot]=game.key==='rps'?['rock','paper','scissors'][crypto.randomInt(3)]:QUESTION_BANKS[game.key][game.questionOrder[(game.round||1)-1]??0].answer;}
        if(game.players.every(value=>game.choices[value]!==undefined)){game.key==='rps'?settleRps(game):settleQuiz(game);continue;}
        if(now()>=game.deadline){for(const value of game.players)game.choices[value]??='missed';game.key==='rps'?settleRps(game,game.deadline):settleQuiz(game,game.deadline);continue;}break;
      }
      if(id.startsWith('bot:')){
        if(now()<(game.botReadyAt||0))break;const picked=Array.isArray(game.first)?game.first:(game.first===null?[]:[game.first]),free=game.tiles.map((_,i)=>i).filter(i=>!game.matched.includes(i)&&!picked.includes(i)),memory=game.botMemory||{};let selected=null;
        if(picked.length)selected=free.find(i=>memory[i]&&memory[i]===memory[picked[0]]);else selected=free.find(i=>memory[i]&&free.filter(j=>j!==i&&memory[j]===memory[i]).length>=2);
        if(free.length)flip(game,id,selected??free[crypto.randomInt(free.length)]);game.botReadyAt=now()+900;break;
      }
      if(now()>=game.deadline){const at=game.deadline;game.last={playerId:id,timeout:true};game.first=null;game.reveal=[];advance(game,at);continue;}break;
    }
  }
  async function current(tx,walletId,key){
    if(RETIRED_KEYS.includes(key))fail(410,'This table game has been removed.','game_removed');
    if(!KEYS.includes(key))fail(400,'Choose a valid table game.','bad_game');
    const room=await tx.get(db.collection('tea_rooms').doc('main'));const table=room.exists&&room.data().tables.find(item=>item.seats.some(seat=>seat.walletId===walletId));
    if(!table)fail(409,'Sit at a table to play.','not_seated');return {table,ref:games().doc(`${table.id}-${key}`)};
  }
  function checkPlayers(game,table){if(game.status==='active'&&game.players.some(id=>!id.startsWith('bot:')&&!table.seats.some(seat=>seat.walletId===id))){game.status='finished';game.winnerIds=[];game.last={canceled:true};game.finishedAt=now();}}
  return {
    async start(walletId,input){const key=input.key,requestId=input.requestId,botCount=Number(input.botCount||0);if(!REQUEST.test(requestId||'')||!Number.isInteger(botCount)||botCount<0||botCount>3)fail(400,'Invalid game request.','bad_request');
      return db.runTransaction(async tx=>{const {table,ref}=await current(tx,walletId,key),snap=await tx.get(ref);if(snap.exists&&snap.data().requestId===requestId&&snap.data().startedBy===walletId)return view(snap.data(),walletId);
        if(snap.exists&&snap.data().status==='active'){const game=snap.data();checkPlayers(game,table);progress(game);if(game.status==='active')fail(409,'This game is already running.','game_active');}
        if(table.ownerId!==walletId)fail(403,'The first guest at the table starts the game.','not_host');const humans=table.seats.filter(seat=>seat.walletId).map(seat=>seat.walletId);if(humans.length+botCount>8)fail(400,'A table game supports up to eight players.','bad_player_count');
        const players=[...humans,...Array.from({length:botCount},(_,i)=>`bot:${i+1}`)],names={};for(const id of humans){const profile=await tx.get(db.collection('tea_profiles').doc(id));names[id]=profile.exists?profile.data().nickname:'Guest';}players.filter(id=>id.startsWith('bot:')).forEach((id,i)=>{names[id]=`BOT ${i+1}`;});
        if(key==='rps'&&players.length<2)fail(400,'Add a bot or invite a friend for Rock Paper Scissors.','need_players');
        const game={id:crypto.randomUUID(),key,tableId:table.id,status:'active',requestId,startedBy:walletId,players,names,scores:Object.fromEntries(players.map(id=>[id,0])),turnIndex:0,deadline:now()+15_000,createdAt:now(),round:1,choices:{},questionOrder:QUESTION_BANKS[key]?shuffle([...Array(QUESTION_BANKS[key].length).keys()]).slice(0,5):[],tiles:key==='memory'?shuffle(MEMORY_SYMBOLS.flatMap(symbol=>[symbol,symbol,symbol])):[],matched:[],first:[],reveal:[],botReadyAt:now()+900};progress(game);tx.set(ref,game);return view(game,walletId);});
    },
    async state(walletId,key){return db.runTransaction(async tx=>{const {table,ref}=await current(tx,walletId,key),snap=await tx.get(ref);if(!snap.exists)return {game:null};const game=snap.data(),before=JSON.stringify(game);checkPlayers(game,table);progress(game);if(before!==JSON.stringify(game)){game.version=(game.version||0)+1;tx.set(ref,game);}return {game:view(game,walletId)};});},
    async action(walletId,input){if(!REQUEST.test(input.requestId||''))fail(400,'Invalid request.','bad_request');return db.runTransaction(async tx=>{const {table,ref}=await current(tx,walletId,input.key),snap=await tx.get(ref);if(!snap.exists)fail(404,'Start a game first.','game_missing');const game=snap.data();if(game.id!==input.gameId)fail(409,'That game has ended.','old_game');if(!game.players.includes(walletId))fail(403,'You are watching this game.','spectator');
      const attempt=attempts().doc(crypto.createHash('sha256').update(`${game.id}:${walletId}:${input.requestId}`).digest('hex')),prior=await tx.get(attempt);if(prior.exists)return prior.data().result;checkPlayers(game,table);progress(game);if(game.status!=='active')fail(409,'This game has ended.','game_finished');
      if(['rps',...QUESTION_KEYS].includes(game.key)){const choices=game.key==='rps'?['rock','paper','scissors']:[0,1,2,3];if(!choices.includes(input.choice))fail(400,'Choose one of the available options.','bad_choice');if(game.round!==input.round||game.choices[walletId])fail(409,'Wait for the next round.','already_played');game.choices[walletId]=input.choice;progress(game);}else{if(game.players[game.turnIndex]!==walletId||game.revealUntil)fail(409,'Wait for your turn.','not_turn');const picked=Array.isArray(game.first)?game.first:(game.first===null?[]:[game.first]),index=Number(input.index);if(!Number.isInteger(index)||index<0||index>=18||game.matched.includes(index)||picked.includes(index))fail(400,'Choose a hidden tile.','bad_tile');flip(game,walletId,index);game.botReadyAt=now()+900;progress(game);}
      game.version=(game.version||0)+1;const result=view(game,walletId);tx.set(ref,game);tx.create(attempt,{result,createdAt:now()});return result;});},
    async cancelAfterRestart(){for(const key of [...KEYS,...RETIRED_KEYS])for(let n=1;n<=8;n++){const ref=games().doc(`t${n}-${key}`);await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(snap.exists&&snap.data().status==='active')tx.update(ref,{status:'finished',winnerIds:[],last:{canceled:true,reason:RETIRED_KEYS.includes(key)?'game_retired':'server_restart'},finishedAt:now()});});}},
  };
}

module.exports={createTableGames,KEYS,RETIRED_KEYS,QUIZ,MATH,PATTERN};
