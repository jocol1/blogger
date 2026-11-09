// Table lobby: the first screen after "Mở bàn". One grid for every table game, who is here, and the chat drawer.
// It only routes into the existing game screens; nothing about how those games work lives here.
window.TeaHubUI=function({t,state,myId,myTable,open,challengeBusy=()=>false}){
 const $=s=>document.querySelector(s),LAST='locly-hub-last';
 const TILES=[
  {id:'xiangqi',type:'game',icon:'帥',name:'xiangqiName',tag:'xiangqiShort',group:'mind',cjk:true},
  {id:'quiz',type:'game',icon:'🧠',name:'quizName',tag:'quizShort',group:'mind'},
  {id:'math',type:'game',icon:'➗',name:'mathName',tag:'mathShort',group:'mind'},
  {id:'pattern',type:'game',icon:'🧩',name:'patternName',tag:'patternShort',group:'mind'},
  {id:'tienlen',type:'card',icon:'♠',name:'tlName',tag:'tlShort',group:'cards'},
  {id:'color',type:'card',icon:'🎴',name:'colorCards',tag:'hubTagColor',group:'cards'},
  {id:'baicao',type:'card',icon:'♣',name:'bcName',tag:'bcShort',group:'cards'},
  {id:'poker',type:'card',icon:'♦',name:'pkName',tag:'pkShort',group:'cards'},
  {id:'barista',type:'game',icon:'☕',name:'baristaName',tag:'baristaShort',group:'fun'},
  {id:'drawing',type:'game',icon:'🎨',name:'drawingName',tag:'drawingShort',group:'fun'},
  {id:'rps',type:'game',icon:'✌',name:'rpsName',tag:'rpsShort',group:'fun'},
  {id:'memory',type:'game',icon:'🍎',name:'memoryName',tag:'memoryShort',group:'fun'},
  {id:'brawl',type:'brawl',icon:'🥊',name:'pixelBrawl',tag:'hubTagBrawl',group:'fun'},
 ];
 const GROUPS=[['mind','hubGroupMind'],['cards','hubGroupCards'],['fun','hubGroupFun']];
 let built='',liveKey='',peopleKey='',unread=0;
 const el=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;parent?.append(n);return n;};
 const remember=id=>{try{localStorage.setItem(LAST,id);}catch{}};
 const last=()=>{try{return localStorage.getItem(LAST);}catch{return null;}};
 const tileOf=id=>TILES.find(tile=>tile.id===id);

 function launch(tile){
  if(!tile)return;
  if(tile.type!=='brawl')remember(tile.id);
  if(tile.type==='game')open.game(tile.id);else if(tile.type==='card')open.card(tile.id);else openChat(true,true);
 }
 function buildBody(){
  const body=$('#hub-body');if(!body)return;body.replaceChildren();
  const live=el('div',undefined,body,'hub-live');live.id='hub-live';live.hidden=true;
  for(const[group,label]of GROUPS){
   const section=el('section',undefined,body,'hub-group'),grid=el('div',undefined,section,'hub-grid');section.dataset.group=group;
   section.insertBefore(el('h3',t(label)),grid);
   for(const tile of TILES.filter(item=>item.group===group)){
    const b=el('button',undefined,grid,'hub-tile');b.type='button';b.dataset.tile=tile.id;b.dataset.group=group;
    el('span',tile.icon,b,'hub-icon'+(tile.cjk?' cjk':''));el('b',t(tile.name),b);el('small',t(tile.tag),b);
    b.onclick=()=>launch(tile);
   }
  }
 }
 function activity(){const table=myTable();return table?.activity||null;}
 function paintLive(){
  const box=$('#hub-live');if(!box)return;
  const act=activity(),tile=act&&tileOf(act.key),key=act?[act.key,act.players,act.names?.join('|')].join(':'):'';
  if(key===liveKey)return;liveKey=key;box.replaceChildren();box.hidden=!tile;
  document.querySelectorAll('.hub-tile.live').forEach(n=>{n.classList.remove('live');n.querySelector('.hub-live-tag')?.remove();});
  if(!tile)return;
  const seated=(myTable()?.seats||[]).some(s=>s.walletId===myId());
  el('span','▶',box,'hub-live-dot');el('b',`${t('hubPlayingNow')}: ${t(tile.name)}`,box);
  if(act.names?.length)el('span',act.names.join(' · '),box);else if(act.players)el('span',t('hubPlayers',{count:act.players}),box);
  el('button',t(seated?'hubJoin':'hubWatch'),box,'hub-live-go').onclick=()=>launch(tile);
  const node=document.querySelector(`.hub-tile[data-tile="${tile.id}"]`);
  if(node){node.classList.add('live');el('em','●',node,'hub-live-tag');}
 }
 function paintPeople(){
  const box=$('#hub-people'),table=myTable();if(!box||!table)return;
  const ids=table.seats.map(seat=>seat.walletId).filter(Boolean),guests=state()?.guests||[];
  const people=ids.map(id=>guests.find(g=>g.walletId===id)).filter(Boolean);
  const canChallenge=activity()?.key!=='xiangqi'&&!challengeBusy(),key=people.map(p=>[p.walletId,p.nickname,p.rank?.tier,p.rank?.streak].join(':')).join('|')+'#'+canChallenge+document.documentElement.lang;
  if(key===peopleKey)return;peopleKey=key;box.replaceChildren();
  for(const p of people){
   const chip=el('span',undefined,box,'hub-person'+(p.walletId===myId()?' me':''));chip.dataset.id=p.walletId;
   el('b',p.nickname||'Guest',chip);
   const title=p.rank&&p.rank.tier>=1?t('xqTier'+p.rank.tier):p.walletId===myId()?t('hubYou'):'';if(title)el('small',title,chip);
   if(p.rank?.streak>=3)el('em','🔥'+p.rank.streak,chip);
   if(p.walletId!==myId()){const go=el('button','⚔ '+t('hubChallenge'),chip,'hub-challenge');go.type='button';go.disabled=!canChallenge;go.onclick=()=>open.challenge(p.walletId);}
  }
 }
 function openChat(show,brawl=false){
  const drawer=$('#hub-chat');if(!drawer)return;drawer.hidden=!show;
  if(show){unread=0;paintBadge();const list=$('#chat-list');if(list)list.scrollTop=list.scrollHeight;if(brawl){const details=drawer.querySelector('.brawl-details');if(details)details.open=true;}}
 }
 function paintBadge(){const badge=$('#hub-chat-badge');if(!badge)return;badge.hidden=unread===0;badge.textContent=unread>9?'9+':String(unread);}
 function noteChat(){const drawer=$('#hub-chat');if(drawer?.hidden){unread++;paintBadge();}}
 function render(){
  if(!myTable()){return;}
  const sig=document.documentElement.lang;
  if(built!==sig||!$('#hub-body')?.children.length){built=sig;liveKey='';peopleKey='';buildBody();}
  paintPeople();paintLive();
 }
 function bind(){
  $('#hub-quick').onclick=()=>launch(tileOf(last())||tileOf('xiangqi'));
  $('#hub-chat-open').onclick=()=>openChat($('#hub-chat').hidden);
  $('#hub-chat-close').onclick=()=>openChat(false);
  $('#hub-menu').onclick=()=>open.menu();
 }
 bind();
 return{render,noteChat,closeChat:()=>openChat(false)};
};
