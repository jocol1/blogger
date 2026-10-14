window.TeaOanUI=function({box,t,myId,action,start}){
  let game=null,offset=0,selected=null,pending=false,root=null,revision='',painted='';
  let board,turn,clock,topLabel,bottomLabel,stepText,heldText,result,directions,scoreTop,scoreBottom;
  const pits=new Map();
  const el=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls||'';if(text)node.textContent=text;return node};
  function build(){
    root=el('section','oan-game');const heading=el('div','mini-scorebar');clock=el('b');heading.append(el('h3','',t('oanquanName')),clock);
    turn=el('p','oan-turn');turn.setAttribute('role','status');
    topLabel=el('div','oan-side-label');bottomLabel=el('div','oan-side-label own-side');scoreTop=el('span');scoreBottom=el('span');
    board=el('div','mini-board oan-board');board.setAttribute('aria-label',t('oanquanName'));pits.clear();
    const positions=TeaOanPlayback.layout(game.side);
    function pit(index,col,row,quan=false){
      const button=el('button','oan-pit'+(quan?' quan':''));button.type='button';button.dataset.pit=index;button.style.gridColumn=String(col);button.style.gridRow=row;
      button.append(el('small','oan-pit-label',quan?t('oanQuanShort'):String(positions.bottom.includes(index)?positions.bottom.indexOf(index)+1:positions.top.indexOf(index)+1)),el('span','oan-stones'),el('b'));
      button.onclick=()=>{selected=index;painted='';paint()};board.append(button);pits.set(index,button);
    }
    pit(positions.left,1,'1 / 3',true);pit(positions.right,7,'1 / 3',true);
    positions.top.forEach((index,i)=>pit(index,i+2,'1'));positions.bottom.forEach((index,i)=>pit(index,i+2,'2'));
    directions=el('div','oan-directions');for(const [direction,key] of [[-1,'oanGoLeft'],[1,'oanGoRight']]){
      const button=el('button','',t(key));button.type='button';button.dataset.direction=direction;
      button.onclick=async()=>{if(selected===null||pending)return;pending=true;painted='';paint();try{await action({pit:selected,direction})}finally{pending=false;painted='';paint()}};directions.append(button);
    }
    const explanation=el('div','oan-explanation');stepText=el('p','oan-step');stepText.setAttribute('role','status');heldText=el('b','oan-held');explanation.append(stepText,heldText);
    result=el('div','mini-result');const rules=el('details','oan-rules');rules.append(el('summary','',t('oanHow')),el('p','',t('oanquanRules')));
    root.append(heading,turn,topLabel,board,bottomLabel,explanation,directions,result,rules);box.replaceChildren(root);painted='';
  }
  function paint(){
    if(!game||!root?.isConnected)return;
    const now=Date.now()+offset,state=TeaOanPlayback.frame(game,now),positions=TeaOanPlayback.layout(game.side),mine=game.turn===myId()&&game.member,active=game.status==='active';
    clock.textContent=state.playing?t('oanWatching'):active?t('secondsLeft',{seconds:Math.max(0,Math.ceil((game.deadline-now)/1000))}):t('gameEnded');
    const signature=JSON.stringify([revision,state.index,state.playing,selected,pending,document.documentElement.lang]);if(signature===painted)return;painted=signature;
    const mover=state.playing?game.playback.playerId:game.turn,moverName=game.players.find(p=>p.id===mover)?.name||'';
    turn.textContent=state.playing?t('oanMoving',{name:moverName}):!active?t('gameEnded'):mine?t('oanYourTurn'):t('theirTurn',{name:moverName});
    turn.classList.toggle('your-turn',mine&&!state.playing&&active);
    function label(node,side,score){const player=game.players[side];node.replaceChildren();const name=el('b','',(game.side===side?t('oanYou'):t('oanOpponent'))+' · '+(player.bot?'BOT · ':'')+player.name);score.textContent=t('points',{score:state.scores[player.id]||0});node.append(name,score);node.classList.toggle('moving',active&&player.id===mover||state.playing&&player.id===mover);if(player.id===mover&&(active||state.playing))node.append(el('strong','',state.playing?t('oanSowing'):t('oanToPlay')))}
    label(topLabel,1-positions.bottomSide,scoreTop);label(bottomLabel,positions.bottomSide,scoreBottom);
    for(const [index,button] of pits){
      const own=game.member&&positions.bottom.includes(index),quan=index===5||index===11,count=state.pits[index],hasQuan=quan&&state.quan?.[index===5?0:1];
      button.disabled=!active||state.playing||pending||!mine||!own||count===0;
      button.classList.toggle('mine',own);button.classList.toggle('selected',selected===index&&!state.playing);button.classList.toggle('stepping',state.playing&&state.step?.pit===index);button.classList.toggle('capturing',state.playing&&state.step?.pit===index&&state.step.type==='capture');
      button.setAttribute('aria-pressed',String(selected===index));button.setAttribute('aria-label',quan?t('oanQuan')+': '+count:t('oanPit',{number:(own?positions.bottom:positions.top).indexOf(index)+1,count}));
      button.querySelector('b').textContent=String(count);const stones=button.querySelector('.oan-stones');stones.replaceChildren();
      for(let i=0;i<Math.min(count,20);i++){const stone=el('i',hasQuan&&i===0?'quan-stone':'');stones.append(stone)}
      if(state.playing&&state.step?.pit===index&&state.step.type==='sow')stones.lastElementChild?.classList.add('dropping');
    }
    directions.hidden=!active||!game.member;for(const button of directions.children)button.disabled=!mine||state.playing||pending||selected===null;
    if(state.playing){const step=state.step;stepText.textContent=step?t('oanStep_'+step.type,{count:step.type==='capture'?step.points:step.type==='pickup'?step.held:step.count}):t('oanWatching');heldText.textContent=t('oanHeld',{count:state.held})}
    else{heldText.textContent='';stepText.textContent=!active?t('gameEnded'):pending?t('oanSending'):!mine?t('oanWait'):selected===null?t('oanChoose'):t('oanSelected',{number:positions.bottom.indexOf(selected)+1,count:state.pits[selected]});}
    result.hidden=active||state.playing;result.replaceChildren();if(!result.hidden){result.append(el('b','',game.last?.canceled?t('gameCanceled'):game.winnerIds.includes(myId())?t('youWon'):t('winners',{names:game.players.filter(p=>game.winnerIds.includes(p.id)).map(p=>p.name).join(', ')})));const again=el('button','primary',t('playAgain'));again.onclick=start;result.append(again)}
  }
  setInterval(paint,80);
  return {render(value){const next=value.id+':'+(value.version||0);if(next!==revision)selected=null;revision=next;game=value;offset=value.serverNow-Date.now();build();paint()}};
};
