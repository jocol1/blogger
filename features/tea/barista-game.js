const crypto = require('node:crypto');
const INGREDIENTS = [
  {id:'tea',en:'Tea',vi:'Trà',color:'#b77b3d'},
  {id:'coffee',en:'Coffee',vi:'Cà phê',color:'#6c4939'},
  {id:'milk',en:'Milk',vi:'Sữa',color:'#f2dfbc'},
  {id:'ice',en:'Ice',vi:'Đá',color:'#a6d9df'},
  {id:'syrup',en:'Syrup',vi:'Si rô',color:'#e39b91'},
  {id:'pearls',en:'Pearls',vi:'Trân châu',color:'#574957'},
];
const LENGTHS=[3,3,4,4,5];
function reset(game,at){game.phase='preview';game.deadline=at+5000;game.mixes={};}
function init(game,at){
  // Each order has a new sequence, so later rounds exercise memory rather than a fixed recipe.
  game.recipes=LENGTHS.map(length=>{const ids=INGREDIENTS.map(i=>i.id),steps=[];while(steps.length<length)steps.push(ids.splice(crypto.randomInt(ids.length),1)[0]);return{steps};});
  reset(game,at);
}
function settle(game,at){game.phase='result';game.deadline=at+3500;for(const id of game.players)if(game.mixes[id]?.correct)game.scores[id]++;}
function progress(game,at,finish){
  for(let n=0;n<20&&game.status==='active'&&at>=game.deadline;n++){
    const ended=game.deadline;
    if(game.phase==='preview'){game.phase='mixing';game.deadline=ended+20000;}
    else if(game.phase==='mixing')settle(game,ended);
    else if(game.round>=5)finish(game);
    else{game.round++;reset(game,ended);}
  }
}
function view(game,id){
  const steps=game.recipes[game.round-1].steps,reveal=game.phase!=='mixing'||game.status==='finished';
  return{phase:game.phase,maxRounds:5,ingredients:INGREDIENTS,recipe:reveal?steps:null,recipeLength:steps.length,
    submitted:game.players.filter(p=>game.mixes[p]),myMix:game.mixes[id]?.steps||null,
    results:game.phase==='result'||game.status==='finished'?game.players.map(p=>({id:p,correct:Boolean(game.mixes[p]?.correct)})):null};
}
function play(game,id,input,at,fail){
  if(input.round!==game.round)fail(409,'That order is over.','barista_old_round');
  if(game.phase!=='mixing')fail(409,'Wait until the recipe disappears.','barista_not_mixing');
  if(game.mixes[id])fail(409,'You have already served this order.','barista_submitted');
  const answer=game.recipes[game.round-1].steps,steps=input.steps;
  if(input.type!=='serve'||!Array.isArray(steps)||steps.length!==answer.length||steps.some(s=>!INGREDIENTS.some(i=>i.id===s)))fail(400,'Use the required number of ingredients.','barista_bad_mix');
  game.mixes[id]={steps:steps.slice(),correct:steps.every((s,i)=>s===answer[i])};
  if(game.players.every(p=>game.mixes[p]))settle(game,at);
}
module.exports={init,progress,view,play,INGREDIENTS};
