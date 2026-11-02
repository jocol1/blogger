const crypto = require('node:crypto');
const WORDS = [
  ['cat','con mèo'],['dog','con chó'],['fish','con cá'],['chicken','con gà'],['pig','con heo'],
  ['duck','con vịt'],['rabbit','con thỏ'],['butterfly','con bướm'],['snail','ốc sên'],['elephant','con voi'],
  ['cup','cái cốc'],['teapot','ấm trà'],['cake','bánh kem'],['ice cream','kem'],['banana','quả chuối'],
  ['apple','quả táo'],['carrot','củ cà rốt'],['watermelon','dưa hấu'],['egg','quả trứng'],['pizza','bánh pizza'],
  ['house','ngôi nhà'],['tree','cái cây'],['flower','bông hoa'],['sun','mặt trời'],['moon','mặt trăng'],
  ['star','ngôi sao'],['cloud','đám mây'],['rainbow','cầu vồng'],['mountain','ngọn núi'],['umbrella','cái ô'],
  ['bicycle','xe đạp'],['car','ô tô'],['boat','con thuyền'],['airplane','máy bay'],['train','tàu hỏa'],
  ['hat','cái mũ'],['shoe','chiếc giày'],['glasses','kính mắt'],['clock','đồng hồ'],['guitar','đàn ghi ta'],
].map(([en,vi])=>({en,vi}));
const COLORS=['#263e46','#d65c52','#4d83bc','#5d975e','#e4b749','#ffffff'];
const normalize = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
function init(game,at){
  const pool=WORDS.map((_,i)=>i);game.words=[];
  while(game.words.length<game.players.length)game.words.push(pool.splice(crypto.randomInt(pool.length),1)[0]);
  reset(game,at);
}
function reset(game,at){game.phase='drawing';game.deadline=at+60_000;game.strokes=[];game.guessed=[];game.guessTimes={};game.feedback={};game.strokeTimes={};}
function reveal(game,at){game.phase='reveal';game.deadline=at+5_000;}
function progress(game,at,finish){
  for(let i=0;i<20&&game.status==='active'&&at>=game.deadline;i++){
    const ended=game.deadline;
    if(game.phase==='drawing')reveal(game,ended);
    else if(game.round>=game.players.length)finish(game);
    else{game.round++;game.turnIndex++;reset(game,ended);}
  }
}
function view(game,id){
  const artist=game.players[game.turnIndex],word=WORDS[game.words[game.round-1]];
  return {phase:game.phase,artist,maxRounds:game.players.length,strokes:game.strokes,guessed:game.guessed,
    prompt:id===artist||game.phase==='reveal'||game.status==='finished'?word:null,
    feedback:game.feedback[id]||null,colors:COLORS,strokeLimit:100};
}
function play(game,id,input,at,fail){
  if(input.round!==game.round)fail(409,'This drawing round has ended.','drawing_old_round');
  if(game.phase!=='drawing')fail(409,'The answer is being revealed.','drawing_reveal');
  const artist=game.players[game.turnIndex];
  if(input.type==='stroke'||input.type==='clear'){
    if(id!==artist)fail(403,'Only the artist can draw.','drawing_not_artist');
    if(at-(game.strokeTimes[id]||0)<100)fail(429,'Draw a little more slowly.','drawing_rate');
    if(input.type==='clear')game.strokes=[];
    else{
      if(game.strokes.length>=100)fail(409,'Canvas is full. Clear it to keep drawing.','drawing_full');
      const s=input.stroke;
      if(!s||!COLORS.includes(s.color)||![3,7,14].includes(s.width)||!Array.isArray(s.points)||s.points.length<1||s.points.length>100||s.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isInteger)||p[0]<0||p[0]>600||p[1]<0||p[1]>360))fail(400,'Invalid drawing stroke.','drawing_bad_stroke');
      // Firestore does not support an array directly nested inside another array.
      game.strokes.push({color:s.color,width:s.width,points:s.points.map(([x,y])=>({x,y}))});
    }
    game.strokeTimes[id]=at;return;
  }
  if(input.type!=='guess'||typeof input.text!=='string'||!input.text.trim()||input.text.length>60)fail(400,'Enter a short guess.','drawing_bad_guess');
  if(id===artist)fail(403,'The artist cannot guess.','drawing_artist_guess');
  if(game.guessed.includes(id))fail(409,'You already guessed correctly.','drawing_already_guessed');
  if(at-(game.guessTimes[id]||0)<2000)fail(429,'Wait two seconds between guesses.','drawing_guess_rate');
  game.guessTimes[id]=at;
  const word=WORDS[game.words[game.round-1]],guess=normalize(input.text);
  const correct=[word.en,word.vi,word.vi.replace(/^(con |quả |củ |cái |chiếc |ngôi |bông |đám |ngọn )/,'')].some(w=>normalize(w)===guess);
  game.feedback[id]=correct?'correct':'tryAgain';
  if(correct){game.guessed.push(id);game.scores[id]++;game.scores[artist]++;if(game.guessed.length===game.players.length-1)reveal(game,at);}
}
module.exports={init,progress,view,play,WORDS,COLORS};
