(function(root){
  function layout(side){
    const rotate=side===1?6:0,at=index=>(index+rotate)%12;
    return {bottom:[0,1,2,3,4].map(at),top:[10,9,8,7,6].map(at),left:at(11),right:at(5),bottomSide:side===1?1:0};
  }
  function frame(game,now){
    const playback=game.playback;
    if(!playback||game.last?.canceled||now>=playback.endsAt)return {pits:game.pits,quan:game.quan,scores:Object.fromEntries(game.players.map(p=>[p.id,p.score])),playing:false,step:null,index:-1,held:0};
    const state={pits:[...playback.before.pits],quan:[...playback.before.quan],scores:{...playback.before.scores},playing:true,step:null,index:-1,held:0};
    for(const [index,step] of playback.steps.entries()){
      if(step.at>now-playback.startedAt)break;
      state.pits[step.pit]=step.count;
      if(step.quan)state.quan=[...step.quan];
      if(step.playerId&&Number.isFinite(step.score))state.scores[step.playerId]=step.score;
      if(Number.isFinite(step.held))state.held=step.held;
      state.step=step;state.index=index;
    }
    return state;
  }
  const api={layout,frame};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.TeaOanPlayback=api;
})(typeof window!=='undefined'?window:globalThis);
