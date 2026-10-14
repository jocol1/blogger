window.TeaCardsUI=function({api,t,id,myId,myTable}){
  const $=selector=>document.querySelector(selector);let game=null,meta={},busy=false,fetching=false,generation=0,wild=null,retry=null,startRequest=null,errorText='',botsTouched=false,groupedHand=true;
  const setText=(element,value)=>{if(element.textContent!==value)element.textContent=value};
  const member=()=>Boolean(game&&(game.member??game.players.some(p=>p.id===myId())));
  const myTurn=()=>Boolean(game?.status==='active'&&member()&&game.turn===myId());
  const label=card=>card.kind==='wild'?'★':card.kind==='skip'?'⊘':card.kind==='draw2'?'+2':String(card.value);
  function face(card){const element=document.createElement('span');element.className='playing-card '+card.color;element.textContent=label(card);return element}
  const playback=TeaCardPlayback({target:$('#top-card'),hand:$('#hand'),playerSelector:'#card-players .card-player',myId,face,initialCards:value=>value?.top?[value.top]:[],onChange:()=>render()});
  const paused=()=>Boolean(game&&(playback.busy()||Date.now()+(game.serverNow-(game.receivedAt||Date.now()))<Number(game.nextActionAt||0)));let lastPaused=false;
  function update(value,metadata={}){
    if(!myTable()||(value&&value.tableId!==myTable().id))return clear();if(!TeaCardView.acceptsView(game,value))return;
    if(value?.status!=='active'&&value&&!(value.member??value.players.some(p=>p.id===myId())))value=null;
    if(startRequest&&value?.status==='active'){startRequest=null;errorText=''}
    if(game?.id!==value?.id||game?.version!==value?.version)wild=null;
    playback.update(value);game=value;meta=metadata;if(wild&&(!myTurn()||!game.hand.some(card=>card.id===wild.id)))wild=null;render();
  }
  function clear(){generation++;game=null;meta={};wild=null;retry=null;startRequest=null;errorText='';playback.clear();render()}
  function render(){
    const table=myTable(),seated=Boolean(table);if(game&&game.tableId!==table?.id)return clear();if(!seated){game=null;wild=null;retry=null}
    $('#cards-empty').hidden=Boolean(game);$('#card-game').hidden=!game;$('#cards-seat-warning').hidden=seated;
    const humans=table?.seats.filter(s=>s.walletId).length||0,host=meta.hostId||table?.ownerId,otherGame=meta.activeCardGame||game?.activeCardGame||(meta.tienLenActive||game?.tienLenActive?'tienlen':null),otherBusy=Boolean(otherGame&&otherGame!=='color'),canStart=seated&&host===myId()&&humans<=4&&!otherBusy;
    const bots=$('#bot-count'),maximum=Math.min(2,Math.max(0,4-humans));for(const option of bots.options)option.disabled=Number(option.value)>maximum;
    bots.disabled=busy||Boolean(startRequest);
    if(!botsTouched)bots.value=humans===1?'1':'0';else if(Number(bots.value)>maximum)bots.value=String(maximum);
    $('#start-card').disabled=busy||!canStart||humans+Number(bots.value)<2;
    setText($('#start-card'),startRequest&&!busy?t('retryCard'):t('startGame'));
    setText($('#cards-lobby-status'),errorText||(!seated?t('cardWait'):otherBusy?t('cardModeBusy',{name:t({tienlen:'tlName',color:'colorCards',baicao:'bcName',poker:'pkName'}[otherGame])}):humans>4?t('cardsTooMany'):!canStart?t('cardsHostWait'):t('cardsReady')));$('#cards-lobby-status').classList.toggle('error',Boolean(errorText));
    $('#new-card').disabled=busy||paused()||!canStart;
    setText($('#new-card'),startRequest&&!busy?t('retryCard'):t('startGame'));
    if(!game){$('#color-picker').hidden=true;return}setText($('#sort-color-hand'),t(groupedHand?'sortDealt':'sortColor'));$('#sort-color-hand').disabled=busy||Boolean(retry);
    const positions=new Map(CardTableLayout.seats(game.players,myId()).map(row=>[row.id,row.edge]));const players=$('#card-players');players.replaceChildren();for(const player of game.players){const row=document.createElement('div');row.className='card-player'+(game.turn===player.id&&game.status==='active'?' turn':'');row.dataset.edge=positions.get(player.id);row.dataset.playerId=player.id;row.textContent=(player.id===myId()?t('cardSeatYou')+' · ':'')+(player.bot?'🤖 ':'')+player.name+' · '+player.cards;players.append(row)}
    const hand=$('#hand'),existing=new Map([...hand.children].map(button=>[button.dataset.cardId,button])),seen=new Set();
    for(const [index,card] of CardTableLayout.sortColor(game.hand,groupedHand).entries()){
      let button=existing.get(card.id);if(!button){button=document.createElement('button');button.type='button';button.dataset.cardId=card.id;hand.append(button)}seen.add(card.id);if(hand.children[index]!==button)hand.insertBefore(button,hand.children[index]||null);
      const legal=TeaCardView.playable(card,game),fullLabel=card.kind==='wild'?t('chooseColor'):t(card.color+'Color')+' · '+(card.kind==='number'?card.value:t(card.kind==='skip'?'skipCard':'drawTwoCard'));
      button.className='playing-card '+card.color+(myTurn()&&legal?' playable':'')+(wild?.id===card.id?' selected-wild':'');setText(button,label(card));button.disabled=busy||Boolean(retry)||paused()||!myTurn()||!legal;button.setAttribute('aria-label',fullLabel);button.title=legal?fullLabel:t('cardDoesNotMatch');button.onclick=()=>play(card);
    }
    for(const [cardId,button] of existing)if(!seen.has(cardId))button.remove();
    const current=game.players.find(p=>p.id===game.turn);let turn=member()?(myTurn()?t('yourTurn'):t('theirTurn',{name:current?.name||'…'})):t('spectator');
    if(game.status!=='active')turn=game.reason?t('gameCanceled'):game.winnerId===myId()?t('youWon'):game.winnerId?t('botWon',{name:game.players.find(p=>p.id===game.winnerId)?.name||'Someone'}):t('gameEnded');
    setText($('#turn-label'),game.status==='active'&&paused()?t('cardPlaybackHold'):turn);setText($('#active-color'),t(game.activeColor+'Color'));$('#active-color').dataset.color=game.activeColor;
    $('#draw-button').hidden=game.status!=='active';$('#draw-button').disabled=busy||Boolean(retry)||paused()||!myTurn();$('#draw-pile').disabled=busy||Boolean(retry)||paused()||!myTurn();$('#new-card').hidden=game.status==='active';
    $('#color-picker').hidden=!wild;for(const button of $('#color-picker').querySelectorAll('[data-color]')){button.disabled=busy||Boolean(retry);button.setAttribute('aria-label',t(button.dataset.color+'Color'));button.title=t(button.dataset.color+'Color')}
    $('#card-retry').hidden=!retry;$('#card-retry').disabled=busy;
    const count=game.hand.filter(card=>TeaCardView.playable(card,game)).length;
    setText($('#card-feedback'),busy?t('cardsSending'):errorText||(!member()?t('spectator'):game.status!=='active'?t('cardsFinished'):paused()?t('cardPlaybackHold'):wild?t('chooseColor'):myTurn()?(count?t('playableCards',{count}):t('cardsMustDraw')):t('cardsWaitTurn')));
    $('#card-feedback').classList.toggle('error',Boolean(errorText));clock();
  }
  function clock(){const holding=paused();if(holding!==lastPaused){lastPaused=holding;render();return}const skew=game&&Number.isFinite(game.receivedAt)?game.serverNow-game.receivedAt:0;setText($('#card-clock'),game?.status==='active'&&!holding?t('secondsLeft',{seconds:Math.max(0,Math.ceil((game.turnEndsAt-(Date.now()+skew))/1000))}):'')}
  async function refresh(){
    if(!myTable())return clear();if(busy||fetching)return;fetching=true;const revision=generation;
    try{const data=await api('/api/tea/cards/current');if(revision===generation&&!busy){if(data.game)data.game.receivedAt=Date.now();if(errorText===t('cardsConnection'))errorText='';update(data.game,data)}}catch(error){errorText=t('cardsConnection');render()}finally{fetching=false}
  }
  async function send(payload){
    if(busy)return;busy=true;generation++;errorText='';render();
    try{const value=await api('/api/tea/cards/action',{method:'POST',body:JSON.stringify(payload)});value.receivedAt=Date.now();retry=null;wild=null;update(value)}
    catch(error){
      const transient=!error.status||error.status>=500;retry=transient?payload:null;
      const codes={turn_not_ready:'cardPlaybackHold',invalid_card:'cardDoesNotMatch',not_turn:'cardsWaitTurn',stale_game:'cardsChanged',stale_game_version:'cardsChanged',color_required:'chooseColor',not_seated:'cardWait',not_player:'spectator',game_finished:'cardsFinished',spectator:'spectator'};
      errorText=t(transient?'cardsRetry':codes[error.code]||'cardsActionFailed');if(!transient)wild=null;
    }finally{busy=false;render();if(!retry)refresh()}
  }
  function action(input){if(busy||retry||!myTurn()||paused())return;send({...input,gameId:game.id,expectedVersion:game.version||0,requestId:id()})}
  function play(card){if(!myTurn()||busy||retry||paused()||!TeaCardView.playable(card,game))return;if(card.kind==='wild'){wild=card;errorText='';render();$('#color-picker [data-color]').focus({preventScroll:true});return}action({action:'play',cardId:card.id})}
  async function start(){
    if(busy)return;startRequest ||= {botCount:Number($('#bot-count').value),requestId:id()};busy=true;generation++;errorText='';render();
    try{const value=await api('/api/tea/cards',{method:'POST',body:JSON.stringify(startRequest)});startRequest=null;value.receivedAt=Date.now();update(value);document.querySelector('.cards-view').scrollTop=0;document.querySelector('#card-game .card-scroll-area').scrollTop=0}
    catch(error){const transient=!error.status||error.status>=500;if(!transient)startRequest=null;errorText=t(transient?'cardsRetry':error.code==='not_host'?'cardsHostWait':error.code==='bad_player_count'?'cardsNeedPlayers':'cardsActionFailed')}
    finally{busy=false;render()}
  }
  $('#sort-color-hand').onclick=()=>{groupedHand=!groupedHand;render()};$('#bot-count').onchange=()=>{botsTouched=true;render()};$('#start-card').onclick=start;$('#new-card').onclick=start;$('#draw-button').onclick=()=>action({action:'draw'});$('#draw-pile').onclick=()=>action({action:'draw'});
  $('#card-retry').onclick=()=>{if(retry)send(retry)};$('#cancel-wild').onclick=()=>{wild=null;render()};
  for(const button of $('#color-picker').querySelectorAll('[data-color]'))button.onclick=()=>{if(wild)action({action:'play',cardId:wild.id,color:button.dataset.color})};
  setInterval(clock,200);render();return {render,refresh,clock,clear};
};
