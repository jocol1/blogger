window.TeaTienLenUI=function({api,t,id,myId,myTable}){
  const $=selector=>document.querySelector(selector),view=window.TeaTienLenView,suits=['♠','♣','♦','♥'];
  let game=null,meta={},busy=false,fetching=false,generation=0,selected=new Set(),retry=null,startRequest=null,errorKey='',botsTouched=false;
  const text=(element,value)=>{if(element.textContent!==value)element.textContent=value};
  const member=()=>Boolean(game&&(game.member??game.players.some(p=>p.id===myId())));
  const ownTurn=()=>Boolean(game?.status==='active'&&member()&&game.turn===myId());
  const rank=card=>({11:'J',12:'Q',13:'K',14:'A',15:'2'}[card.rank]||String(card.rank));
  const cardLabel=card=>rank(card)+' '+t('tlSuit'+card.suit);
  const selectedCards=()=>game?.hand.filter(card=>selected.has(card.id))||[];
  function face(card,button=false){
    const element=document.createElement(button?'button':'span');if(button){element.type='button';element.dataset.cardId=card.id;}
    element.className='tl-card'+(card.suit>=2?' red':'');element.setAttribute('aria-label',cardLabel(card));element.title=cardLabel(card);
    const corner=document.createElement('span'),center=document.createElement('span'),bottom=document.createElement('span');corner.className='tl-card-corner';corner.textContent=rank(card)+suits[card.suit];center.className='tl-card-symbol';center.textContent=suits[card.suit];bottom.className='tl-card-corner bottom';bottom.textContent=rank(card)+suits[card.suit];element.append(corner,center,bottom);return element;
  }
  function update(value,metadata={}){
    if(!myTable()||(value&&value.tableId!==myTable().id))return clear();if(!view.acceptsView(game,value))return;
    if(value&&value.status!=='active'&&!(value.member??value.players.some(p=>p.id===myId())))value=null;
    if(game?.id!==value?.id)selected.clear();game=value;meta=metadata;
    if(value?.status==='active'&&startRequest){startRequest=null;errorKey=''}
    const remaining=new Set(game?.hand.map(card=>card.id)||[]);for(const cardId of selected)if(!remaining.has(cardId))selected.delete(cardId);
    if(game?.status!=='active')selected.clear();render();
  }
  function clear(){generation++;game=null;meta={};selected.clear();retry=null;startRequest=null;errorKey='';render()}
  function render(){
    const table=myTable(),seated=Boolean(table);if(game&&game.tableId!==table?.id)return clear();if(!seated){game=null;selected.clear();retry=null;startRequest=null}
    $('#tl-lobby').hidden=Boolean(game);$('#tl-game').hidden=!game;
    const humans=table?.seats.filter(seat=>seat.walletId).length||0,host=meta.hostId||game?.hostId||table?.ownerId,colorBusy=Boolean(meta.cardGameActive||game?.cardGameActive),canStart=seated&&host===myId()&&humans<=4&&meta.canStart!==false&&game?.canStart!==false&&!colorBusy,bots=$('#tl-bots'),maximum=Math.min(3,Math.max(0,4-humans));
    for(const option of bots.options)option.disabled=Number(option.value)>maximum;
    bots.disabled=busy||Boolean(startRequest);if(!botsTouched)bots.value=humans===1?'1':'0';else if(Number(bots.value)>maximum)bots.value=String(maximum);
    $('#tl-start').disabled=busy||!canStart||humans+Number(bots.value)<2;$('#tl-rematch').disabled=busy||!canStart||Boolean(retry);
    text($('#tl-start'),startRequest&&!busy?t('retryCard'):t('startGame'));text($('#tl-rematch'),startRequest&&!busy?t('retryCard'):t('playAgain'));
    text($('#tl-lobby-status'),errorKey?t(errorKey):!seated?t('cardWait'):colorBusy?t('tlColorBusy'):humans>4?t('tlTooMany'):!canStart?t('cardsHostWait'):humans+Number(bots.value)<2?t('cardsNeedPlayers'):t('tlReady'));$('#tl-lobby-status').classList.toggle('error',Boolean(errorKey));
    if(!game)return;
    const players=$('#tl-players');players.replaceChildren();for(const player of game.players){
      const row=document.createElement('div'),name=document.createElement('b'),count=document.createElement('span'),badge=document.createElement('small');row.className='tl-player'+(game.status==='active'&&game.turn===player.id?' turn':'')+(player.id===myId()?' mine':'');
      name.textContent=(player.bot?'🤖 ':'')+player.name;name.title=player.name;count.textContent=t('tlCardsLeft',{count:player.cards});badge.textContent=game.winnerId===player.id?t('tlWinner'):(game.passed||[]).includes(player.id)?t('tlPassed'):game.status==='active'&&game.turn===player.id?t('tlPlaying'):player.id===myId()?t('tlYou'):player.bot?t('tlBot'):'';row.append(name,count,badge);players.append(row);
    }
    const top=$('#tl-top'),topKey=(game.top?.cards||[]).map(card=>card.id).join(',');if(top.dataset.cards!==topKey){top.replaceChildren();for(const card of [...(game.top?.cards||[])].sort(view.order))top.append(face(card));top.dataset.cards=topKey}
    top.classList.toggle('empty',!game.top);if(!game.top&&!top.children.length){const empty=document.createElement('span');empty.className='tl-empty-trick';empty.textContent='♠ ♥ ♣ ♦';top.append(empty)}
    const set=game.top?.cards?.length?view.classify(game.top.cards):null;text($('#tl-trick-label'),set?t('tlSet'+set.kind,{count:set.length}):t('tlNewTrick'));
    const player=game.players.find(p=>p.id===game.turn),winner=game.players.find(p=>p.id===game.winnerId);
    text($('#tl-turn-label'),game.status!=='active'?game.reason?t('gameCanceled'):winner?t('winners',{names:winner.name}):t('gameEnded'):member()?ownTurn()?t('yourTurn'):t('theirTurn',{name:player?.name||'…'}):t('spectator'));
    const last=game.lastAction,author=game.players.find(p=>p.id===last?.playerId);text($('#tl-last-action'),last?t(last.type==='pass'?'tlLastPass':last.type==='timeout_pass'?'tlLastTimeoutPass':last.type==='timeout_play'?'tlLastTimeoutPlay':'tlLastPlay',{name:author?.name||'…',count:last.cards?.length||0}):game.openingCardId?t('tlOpening'):t('tlSelectHelp'));
    const hand=$('#tl-hand'),existing=new Map([...hand.children].map(button=>[button.dataset.cardId,button])),cards=[...game.hand].sort(view.order),seen=new Set();
    cards.forEach((card,index)=>{
      let button=existing.get(card.id);if(!button)button=face(card,true);if(hand.children[index]!==button)hand.insertBefore(button,hand.children[index]||null);seen.add(card.id);
      button.classList.toggle('selected',selected.has(card.id));button.classList.toggle('opening',game.openingCardId===card.id);button.disabled=busy||Boolean(retry)||!member()||game.status!=='active';button.setAttribute('aria-label',cardLabel(card));button.title=cardLabel(card);button.setAttribute('aria-pressed',String(selected.has(card.id)));button.onclick=()=>{if(button.disabled)return;selected.has(card.id)?selected.delete(card.id):selected.add(card.id);errorKey='';render()};
    });for(const [cardId,button] of existing)if(!seen.has(cardId))button.remove();
    const chosen=selectedCards(),combo=view.classify(chosen),canPlay=view.legal(chosen,game,myId()),locked=busy||Boolean(retry)||game.status!=='active'||!member();
    text($('#tl-selected-count'),chosen.length?t('tlSelected',{count:chosen.length})+(combo?' · '+t('tlSet'+combo.kind,{count:combo.length}):''):t('tlSelectHelp'));$('#tl-play').disabled=locked||!canPlay;$('#tl-pass').disabled=locked||!ownTurn()||!game.top||Boolean(game.openingCardId);
    $('#tl-clear').disabled=locked||!selected.size;$('#tl-hint').disabled=locked;$('#tl-retry').hidden=!retry;$('#tl-retry').disabled=busy;$('#tl-rematch').hidden=game.status==='active';
    for(const control of ['#tl-play','#tl-pass','#tl-clear','#tl-hint'])$(control).hidden=game.status!=='active'||Boolean(retry);
    const openingMissing=game.openingCardId&&chosen.length&&!chosen.some(card=>card.id===game.openingCardId);
    const message=busy?'cardsSending':errorKey||(!member()?'spectator':game.status!=='active'?'cardsFinished':retry?'cardsRetry':!chosen.length?ownTurn()?'tlSelectHelp':'tlWaitSelect':openingMissing?'tlOpening':!combo?'tlInvalidSet':canPlay?game.turn!==myId()?'tlInterrupt':'tlCanPlay':!ownTurn()?'tlWaitSelect':'tlNotStrong');
    text($('#tl-feedback'),t(message));$('#tl-feedback').classList.toggle('error',Boolean(errorKey));$('#tl-feedback').classList.toggle('legal',canPlay&&!errorKey&&!busy);clock();
  }
  function clock(){const skew=game&&Number.isFinite(game.receivedAt)?game.serverNow-game.receivedAt:0;text($('#tl-clock'),game?.status==='active'?t('secondsLeft',{seconds:Math.max(0,Math.ceil((game.turnEndsAt-(Date.now()+skew))/1000))}):'')}
  async function refresh(){
    if(!myTable())return clear();if(busy||fetching)return;fetching=true;const revision=generation;
    try{const data=await api('/api/tea/tienlen/current');if(revision===generation&&!busy){if(data.game)data.game.receivedAt=Date.now();if(errorKey==='cardsConnection')errorKey='';update(data.game,data)}}catch(error){if(revision===generation){errorKey='cardsConnection';render()}}finally{fetching=false}
  }
  async function send(payload){
    if(busy)return;busy=true;generation++;errorKey='';render();
    try{const value=await api('/api/tea/tienlen/action',{method:'POST',body:JSON.stringify(payload)});value.receivedAt=Date.now();retry=null;selected.clear();update(value)}
    catch(error){
      const transient=!error.status||error.status>=500;retry=transient?payload:null;
      const codes={invalid_cards:'tlInvalidSet',invalid_combination:'tlInvalidSet',invalid_combo:'tlInvalidSet',invalid_play:'tlNotStrong',not_stronger:'tlNotStrong',cannot_beat:'tlNotStrong',opening_card_required:'tlOpening',must_open:'tlOpening',cannot_pass:'tlCannotPass',not_turn:'tlWaitSelect',already_passed:'tlPassedWait',stale_game:'cardsChanged',stale_game_version:'cardsChanged',not_seated:'cardWait',not_player:'spectator',game_finished:'cardsFinished',spectator:'spectator'};
      errorKey=transient?'cardsRetry':error.code==='invalid_combination'&&view.classify(selectedCards())?'tlNotStrong':codes[error.code]||'cardsActionFailed';
    }finally{busy=false;render();if(!retry)refresh()}
  }
  function action(type){if(busy||retry||!game)return;const cards=selectedCards();if(type==='play'&&!view.legal(cards,game,myId()))return;if(type==='pass'&&(!ownTurn()||!game.top||game.openingCardId))return;send({action:type,cardIds:type==='play'?cards.map(card=>card.id):[],gameId:game.id,expectedVersion:game.version||1,requestId:id()})}
  async function start(){
    if(busy)return;startRequest||={botCount:Number($('#tl-bots').value),requestId:id()};busy=true;generation++;errorKey='';render();
    try{const value=await api('/api/tea/tienlen',{method:'POST',body:JSON.stringify(startRequest)});value.receivedAt=Date.now();startRequest=null;retry=null;update(value)}
    catch(error){const transient=!error.status||error.status>=500;if(!transient)startRequest=null;errorKey=transient?'cardsRetry':error.code==='not_host'?'cardsHostWait':error.code==='bad_player_count'?'cardsNeedPlayers':['card_busy','game_busy','table_busy','game_active'].includes(error.code)?'tlGameBusy':'cardsActionFailed'}finally{busy=false;render()}
  }
  $('#tl-bots').onchange=()=>{botsTouched=true;render()};$('#tl-start').onclick=start;$('#tl-rematch').onclick=start;$('#tl-play').onclick=()=>action('play');$('#tl-pass').onclick=()=>action('pass');$('#tl-retry').onclick=()=>{if(retry)send(retry)};
  $('#tl-clear').onclick=()=>{selected.clear();errorKey='';render()};$('#tl-hint').onclick=()=>{if(busy||retry||!game)return;const hint=view.moves(game.hand,game,myId())[0];selected=new Set(hint?.map(card=>card.id)||[]);errorKey=hint?'':'tlNoMove';render()};
  render();return {render,refresh,clock,clear};
};
