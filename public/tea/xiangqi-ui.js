// Café Xiangqi: lobby (rating, leaderboard) and the board. The server owns the game; this file draws it,
// shows legal moves with the shared rules, and plays optimistic moves that the server then confirms.
window.TeaXiangqiUI=function({box,api,t,id,update,toast,isVisible,myTable,invite,poll}){
 const X=window.TeaXiangqiRules,NS='http://www.w3.org/2000/svg',PREF='locly-xq-prefs';
 const PAD=56,CELL=100,VW=912,VH=1012,RAD=43;
 const GLYPH={K:'帥',A:'仕',B:'相',N:'傌',R:'俥',C:'炮',P:'兵',k:'將',a:'士',b:'象',n:'馬',r:'車',c:'砲',p:'卒'};
 const EMOJI={laugh:'😂',angry:'😤',clap:'👏',tea:'🍵',shock:'😱',think:'🤔'},PHRASES=['nice','scared','check','wait','luck','again'];
 const BOT_RATING={easy:800,medium:1200,hard:1600},HEAVY='RCNrcn';
 let game=null,me='',mode='',locale='',offset=0,refs={},fx=null,selected=null,targets=[],local=null,sending=false,dragging=null,dirty=false,slide=null,armed=null,dismissedId=null,starting=false,errorText='',paintKey='',flip=false;
 let fxMoves=0,soundedMoves=0,botTimer=0,board=null,tab='top',emoteOpen=false,overKey='',lobbyLoadedAt=0,prevId='',prefs={opponent:'bot',level:'medium'};
 const bubbles=new Map();
 try{Object.assign(prefs,JSON.parse(localStorage.getItem(PREF)||'{}'));}catch{}
 const savePrefs=()=>{try{localStorage.setItem(PREF,JSON.stringify(prefs));}catch{}};
 const el=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;parent?.append(n);return n;};
 const sv=(tag,attrs={},parent)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);parent?.append(n);return n;};
 const setText=(node,text)=>{if(node&&node.textContent!==text)node.textContent=text;};
 const msg=e=>{const k=e.code?t(e.code):'';return k&&k!==e.code?k:e.message;};
 const lang=()=>document.documentElement.lang==='vi'?'vi':'en';
 const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const blocked=()=>document.body.classList.contains('portrait-blocked')||document.hidden;
 const tierName=n=>t('xqTier'+n);
 const levelName=l=>t(l==='easy'?'xqEasy':l==='hard'?'xqHard':'xqMedium');
 const botName=()=>t('xqBot',{level:levelName(game.level)});
 const nowMs=()=>Date.now()+offset;
 const FONT='KaiTi,STKaiti,"Noto Serif CJK SC","Source Han Serif SC","Songti SC","Microsoft YaHei",SimSun,serif';

 // ---------- geometry ----------
 const xy=sq=>{const r=Math.floor(sq/9),c=sq%9;return[PAD+(flip?8-c:c)*CELL,PAD+(flip?9-r:r)*CELL];};
 const tf=sq=>{const[x,y]=xy(sq);return`translate(${x}px,${y}px)`;};
 function hit(e){
  const pt=refs.svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform(refs.svg.getScreenCTM().inverse());
  const dc=Math.round((p.x-PAD)/CELL),dr=Math.round((p.y-PAD)/CELL);
  if(dc<0||dc>8||dr<0||dr>9)return{sq:null,x:p.x,y:p.y};
  return{sq:(flip?9-dr:dr)*9+(flip?8-dc:dc),x:p.x,y:p.y};
 }

 // ---------- static board ----------
 function stops(parent,list){for(const[o,c,a]of list)sv('stop',{offset:o,'stop-color':c,...(a===undefined?{}:{'stop-opacity':a})},parent);}
 function buildBoard(svg){
  const defs=sv('defs',{},svg);
  stops(sv('radialGradient',{id:'xq-wood',cx:'.36',cy:'.3',r:'.95'},defs),[['0','#fff0cf'],['.55','#f1cd8e'],['1','#d29a55']]);
  stops(sv('linearGradient',{id:'xq-slab',x1:'0',y1:'0',x2:'1',y2:'1'},defs),[['0','#ebc07b'],['.5','#e0b066'],['1','#cc9650']]);
  const grain=sv('pattern',{id:'xq-grain',width:'912',height:'58',patternUnits:'userSpaceOnUse'},defs);
  [[8,.1,2],[19,.07,3],[27,.12,1.5],[38,.08,2.5],[49,.1,2]].forEach(([y,o,w])=>sv('path',{d:`M0 ${y}C200 ${y-5} 420 ${y+6} 912 ${y-2}`,stroke:'#7a4a1c','stroke-opacity':o,'stroke-width':w,fill:'none'},grain));
  stops(sv('radialGradient',{id:'xq-shade',cx:'.5',cy:'.5',r:'.75'},defs),[['.55','#000','0'],['1','#3b1d05','.34']]);
  stops(sv('radialGradient',{id:'xq-alert'},defs),[['0','#ff2a1a','.8'],['.6','#ff2a1a','.35'],['1','#ff2a1a','0']]);
  const arrow=sv('marker',{id:'xq-arrow',markerUnits:'userSpaceOnUse',markerWidth:'46',markerHeight:'46',refX:'30',refY:'23',orient:'auto'},defs);
  sv('path',{d:'M2 4L42 23 2 42 12 23Z',fill:'#ffcf3f',stroke:'#7a4a00','stroke-width':'3','stroke-linejoin':'round'},arrow);
  const slab={x:10,y:10,width:VW-20,height:VH-20,rx:20};
  sv('rect',{x:4,y:4,width:VW-8,height:VH-8,rx:26,fill:'#7b4a22'},svg);
  for(const fill of['url(#xq-slab)','url(#xq-grain)','url(#xq-shade)'])sv('rect',{...slab,fill},svg);
  sv('rect',{...slab,fill:'none',stroke:'#fff0c4','stroke-opacity':'.55','stroke-width':'3'},svg);
  const g=sv('g',{stroke:'#4b2c14','stroke-width':'3.2','stroke-linecap':'round',fill:'none'},svg),line=(a,b,c,d)=>sv('path',{d:`M${a} ${b}L${c} ${d}`},g);
  const X0=PAD,Y0=PAD,X1=PAD+8*CELL,Y1=PAD+9*CELL;
  sv('rect',{x:X0,y:Y0,width:X1-X0,height:Y1-Y0,'stroke-width':'6'},g);
  for(let r=1;r<9;r++)line(X0,Y0+r*CELL,X1,Y0+r*CELL);
  for(let c=1;c<8;c++){line(X0+c*CELL,Y0,X0+c*CELL,Y0+4*CELL);line(X0+c*CELL,Y0+5*CELL,X0+c*CELL,Y1);}
  for(const top of[0,7]){line(X0+3*CELL,Y0+top*CELL,X0+5*CELL,Y0+(top+2)*CELL);line(X0+5*CELL,Y0+top*CELL,X0+3*CELL,Y0+(top+2)*CELL);}
  const GAP=9,LEN=18;
  for(const[r,c]of[[2,1],[2,7],[7,1],[7,7],[3,0],[3,2],[3,4],[3,6],[3,8],[6,0],[6,2],[6,4],[6,6],[6,8]])for(const sx of[-1,1])for(const sy of[-1,1]){
   if((c===0&&sx===-1)||(c===8&&sx===1))continue;const x=X0+c*CELL,y=Y0+r*CELL;
   sv('path',{d:`M${x+sx*GAP} ${y+sy*(GAP+LEN)}V${y+sy*GAP}H${x+sx*(GAP+LEN)}`,'stroke-width':'2.6'},g);}
  refs.river=sv('g',{fill:'#5a3418','fill-opacity':'.85','font-family':FONT,'font-size':'60','font-weight':'700','text-anchor':'middle'},svg);
  sv('text',{x:PAD+190,y:PAD+4.5*CELL+21},refs.river).textContent='楚 河';sv('text',{x:PAD+610,y:PAD+4.5*CELL+21},refs.river).textContent='漢 界';
  refs.last=sv('g',{},svg);refs.pieces=sv('g',{},svg);refs.marks=sv('g',{'pointer-events':'none'},svg);refs.hintLayer=sv('g',{'pointer-events':'none'},svg);refs.fxLayer=sv('g',{'pointer-events':'none'},svg);
 }
 function pieceNode(ch,sq,own){
  const red=ch===ch.toUpperCase(),g=sv('g',{class:'xq-piece '+(red?'red':'black')+(own?' own':''),'data-sq':sq});g.style.transform=tf(sq);
  sv('circle',{cx:3,cy:6,r:RAD+2,fill:'#2b1606','fill-opacity':'.38'},g);
  sv('circle',{r:RAD,fill:'url(#xq-wood)',stroke:'#76451a','stroke-width':'3'},g);
  sv('circle',{r:RAD-8,fill:'none',stroke:red?'#b3241b':'#25201b','stroke-width':'2.4','stroke-opacity':'.9'},g);
  sv('text',{y:2,dy:'.35em','text-anchor':'middle','font-size':'54','font-weight':'800','font-family':FONT,fill:red?'#c4281c':'#1f1b17'},g).textContent=GLYPH[ch];
  return g;
 }

 // ---------- state helpers ----------
 const myColor=()=>game?.myColor||null;
 const myTurn=()=>Boolean(game&&game.status==='active'&&game.member&&myColor()===game.side);
 const shown=()=>local&&game.moves<=local.ply?{board:local.board,lastMove:local.lastMove}:{board:game.board,lastMove:game.lastMove};
 const interactive=()=>myTurn()&&!sending&&!blocked()&&!local&&mode==='game';
 function select(sq){selected=sq;targets=sq!=null&&interactive()&&X.sideOf(game.board[sq])===myColor()?X.movesFrom(game.board,sq):[];paintBoard(true);}

 // ---------- board painting ----------
 function paintBoard(force){
  if(!refs.svg||!game)return;
  if(dragging?.moved){dirty=true;return;}
  const s=shown();flip=myColor()==='black';
  const key=JSON.stringify([s.board,flip,selected,targets,game.hint,s.lastMove,game.check,game.side,game.id,myTurn()]);
  if(!force&&key===paintKey)return;paintKey=key;dirty=false;
  for(const layer of[refs.last,refs.pieces,refs.marks,refs.hintLayer])layer.replaceChildren();
  if(s.lastMove){const[x0,y0]=xy(s.lastMove.from),[x1,y1]=xy(s.lastMove.to);
   sv('rect',{x:x0-46,y:y0-46,width:92,height:92,rx:16,fill:'rgba(255,238,160,.2)',stroke:'rgba(255,230,120,.75)','stroke-width':3,'stroke-dasharray':'9 9'},refs.last);
   sv('rect',{x:x1-48,y:y1-48,width:96,height:96,rx:18,fill:'rgba(255,224,110,.34)',stroke:'rgba(255,214,80,.95)','stroke-width':4},refs.last);}
  if(game.check&&game.status==='active'){const king=s.board.indexOf(game.side==='red'?'K':'k');if(king>=0){const[x,y]=xy(king);sv('circle',{cx:x,cy:y,r:66,fill:'url(#xq-alert)',class:'xq-alarm'},refs.last);}}
  const turn=myTurn();
  for(let sq=0;sq<90;sq++)if(s.board[sq]!=='.')refs.pieces.append(pieceNode(s.board[sq],sq,turn&&X.sideOf(s.board[sq])===myColor()));
  if(selected!=null){const[x,y]=xy(selected);sv('circle',{cx:x,cy:y,r:52,fill:'none',stroke:'#ffe27a','stroke-width':6,class:'xq-select'},refs.marks);}
  for(const sq of targets){const[x,y]=xy(sq);
   if(game.board[sq]!=='.')sv('circle',{cx:x,cy:y,r:50,fill:'rgba(226,64,42,.14)',stroke:'#e2402a','stroke-width':7},refs.marks);
   else sv('circle',{cx:x,cy:y,r:17,fill:'rgba(30,120,70,.82)',stroke:'#e9ffe9','stroke-width':3.5},refs.marks);}
  if(game.hint){const a=xy(game.hint.from),b=xy(game.hint.to),len=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
   sv('circle',{cx:a[0],cy:a[1],r:52,fill:'none',stroke:'#ffcf3f','stroke-width':6,'stroke-dasharray':'12 8',class:'xq-hintline'},refs.hintLayer);
   sv('circle',{cx:b[0],cy:b[1],r:50,fill:'rgba(255,207,63,.25)',stroke:'#ffcf3f','stroke-width':7,class:'xq-hintline'},refs.hintLayer);
   sv('path',{d:`M${a[0]+(b[0]-a[0])/len*30} ${a[1]+(b[1]-a[1])/len*30}L${b[0]} ${b[1]}`,stroke:'#ffcf3f','stroke-width':12,'stroke-linecap':'round','marker-end':'url(#xq-arrow)',class:'xq-hintline'},refs.hintLayer);}
  if(slide){const node=refs.pieces.querySelector(`[data-sq="${slide.to}"]`);if(node&&!reduce())node.animate([{transform:tf(slide.from)},{transform:tf(slide.to)}],{duration:210,easing:'cubic-bezier(.2,.8,.3,1)'});slide=null;}
 }

 // ---------- input ----------
 function bindInput(svg){
  svg.addEventListener('pointerdown',e=>{
   if(!interactive())return;e.preventDefault();
   const{sq}=hit(e);if(sq==null)return;
   if(selected!=null&&targets.includes(sq)){commit(selected,sq);return;}
   if(X.sideOf(game.board[sq])!==myColor()){select(null);return;}
   const was=selected===sq;select(sq);
   dragging={sq,pointer:e.pointerId,x0:e.clientX,y0:e.clientY,moved:false,was,node:refs.pieces.querySelector(`[data-sq="${sq}"]`)};
   try{svg.setPointerCapture(e.pointerId);}catch{}
  });
  svg.addEventListener('pointermove',e=>{
   if(!dragging||e.pointerId!==dragging.pointer||!dragging.node)return;
   if(!dragging.moved){if(Math.hypot(e.clientX-dragging.x0,e.clientY-dragging.y0)<7)return;dragging.moved=true;refs.pieces.append(dragging.node);dragging.node.classList.add('dragging');}
   const{sq,x,y}=hit(e);dragging.node.style.transform=`translate(${x}px,${y}px) scale(1.14)`;
   refs.hover?.remove();refs.hover=null;
   if(sq!=null&&targets.includes(sq)){const[hx,hy]=xy(sq);refs.hover=sv('circle',{cx:hx,cy:hy,r:56,fill:'rgba(255,255,255,.2)',stroke:'#fff7c2','stroke-width':5},refs.marks);}
  });
  const release=(e,cancelled)=>{
   if(!dragging||e.pointerId!==dragging.pointer)return;
   const d=dragging;dragging=null;refs.hover?.remove();refs.hover=null;
   try{svg.releasePointerCapture(e.pointerId);}catch{}
   if(!d.moved){if(d.was)select(null);return;}
   d.node.classList.remove('dragging');
   const drop=cancelled?null:hit(e).sq;
   if(drop!=null&&targets.includes(drop)){commit(d.sq,drop);return;}
   d.node.style.transform=tf(d.sq); // slides back via the CSS transition
   setTimeout(()=>{if(dirty)paintBoard(true);},220);
  };
  svg.addEventListener('pointerup',e=>release(e,false));svg.addEventListener('pointercancel',e=>release(e,true));
 }
 function commit(from,to){
  const ply=game.moves,capture=game.board[to]!=='.';
  local={board:X.applyMove(game.board,from,to),lastMove:{from,to},ply};selected=null;targets=[];slide=null;
  soundedMoves=ply+1;fx.sound(capture?'capture':'move');fx.vibrate(capture?28:14);
  paintBoard(true);
  send({type:'move',from,to,ply}).then(ok=>{if(!ok){local=null;paintBoard(true);poll?.();}});
 }
 async function send(input){
  if(sending||!game)return false;sending=true;errorText='';paintInfo();
  try{
   const result=await api('/api/tea/games/xiangqi/action',{method:'POST',body:JSON.stringify({...input,gameId:game.id,requestId:id(),round:1}),signal:AbortSignal.timeout(12000)});
   sending=false;update(result.game);return true;
  }catch(e){errorText=msg(e);toast(errorText);return false;}
  finally{sending=false;paintInfo();}
 }
 async function sendEmote(code){
  emoteOpen=false;paintInfo();
  try{update((await api('/api/tea/games/xiangqi/action',{method:'POST',body:JSON.stringify({type:'emote',code,gameId:game.id,requestId:id(),round:1}),signal:AbortSignal.timeout(12000)})).game);}
  catch(e){toast(msg(e));}
 }
 document.addEventListener('pointerdown',e=>{if(!emoteOpen||!refs.emoteMenu)return;if(refs.emoteMenu.contains(e.target)||refs.emote?.contains(e.target))return;emoteOpen=false;paintInfo();},true);

 // ---------- game screen ----------
 function card(parent){
  const root=el('div',undefined,parent,'xq-card'),head=el('div',undefined,root,'xq-who');
  return{root,dot:el('i','',head,'xq-dot'),name:el('b','',head),flame:el('em','',head),sub:el('small','',root),cap:el('div',undefined,root,'xq-captured')};
 }
 function confirmed(name,needs,key,run){
  if(!needs){run();return;}
  if(armed?.name===name&&Date.now()<armed.until){armed=null;run();paintInfo();return;}
  armed={name,until:Date.now()+3200,key};paintInfo();
 }
 function mountGame(){
  box.replaceChildren();mode='game';refs={};locale=lang();paintKey='';overKey='';bubbles.clear();
  const shell=el('section',undefined,box,'xq-shell'),wrap=el('div',undefined,shell,'xq-boardwrap');refs.shell=shell;
  refs.svg=sv('svg',{viewBox:`0 0 ${VW} ${VH}`,class:'xq-board',role:'img','aria-label':t('xiangqiName')},wrap);buildBoard(refs.svg);bindInput(refs.svg);
  refs.bubbles=el('div',undefined,wrap,'xq-bubbles');refs.bubbles.setAttribute('aria-live','polite');
  refs.over=el('div',undefined,wrap,'xq-over');refs.over.hidden=true;
  fx=TeaXiangqiFx({stage:wrap,layer:refs.fxLayer});
  const panel=el('aside',undefined,shell,'xq-panel');
  refs.top=card(panel);
  refs.status=el('div',undefined,panel,'xq-status');refs.statusText=el('p','',refs.status);refs.clock=el('b','',refs.status,'xq-clock');refs.rated=el('small','',refs.status);
  refs.offer=el('div',undefined,panel,'xq-offer');refs.offer.hidden=true;refs.offerText=el('span','',refs.offer);
  refs.accept=el('button',t('xqAccept'),refs.offer,'primary');refs.decline=el('button',t('xqDecline'),refs.offer);
  refs.bottom=card(panel);
  const actions=el('div',undefined,panel,'xq-actions');
  const btn=(key,icon,label,fn)=>{const b=el('button',undefined,actions);b.type='button';b.dataset.xq=key;b.setAttribute('aria-label',label);b.title=label;el('i',icon,b);el('span',label,b);b.onclick=fn;refs[key]=b;};
  btn('undo','↶',t('xqUndo'),()=>confirmed('undo',game.opponent==='bot'&&game.rated,'xqConfirmUnrated',()=>send({type:'undo'})));
  btn('hint','💡',t('xqHint'),()=>confirmed('hint',game.rated,'xqConfirmUnrated',()=>send({type:'hint'})));
  btn('draw','🤝',t('xqDraw'),()=>send({type:'draw'}));
  btn('emote','😀',t('xqEmote'),()=>{emoteOpen=!emoteOpen;paintInfo();});
  btn('resign','🏳',t('xqResign'),()=>confirmed('resign',true,'xqConfirmResign',()=>send({type:'resign'})));
  btn('sound',fx.muted?'🔇':'🔊',t('xqSound'),()=>{fx.setMuted(!fx.muted);refs.sound.querySelector('i').textContent=fx.muted?'🔇':'🔊';fx.sound('move');});
  btn('back','⌂',t('xqBack'),()=>document.querySelector('.games-view .back-cafe')?.click());
  refs.accept.onclick=()=>send({type:game.drawOffer==='theirs'?'draw':'undo'});refs.decline.onclick=()=>send({type:'decline'});
  refs.emoteMenu=el('div',undefined,shell,'xq-emotes');refs.emoteMenu.hidden=true;el('b',t('xqEmoteTitle'),refs.emoteMenu);
  const grid=el('div',undefined,refs.emoteMenu);
  for(const[code,icon]of Object.entries(EMOJI)){const b=el('button',icon,grid,'xq-emo');b.type='button';b.setAttribute('aria-label',t('xqE_'+code));b.onclick=()=>sendEmote(code);}
  for(const code of PHRASES){const b=el('button',t('xqE_'+code),grid,'xq-phrase');b.type='button';b.onclick=()=>sendEmote(code);}
 }
 const sideName=color=>t(color==='red'?'xqRed':'xqBlack');
 function fillCard(c,color){
  const pid=game.colors[color],player=game.players.find(p=>p.id===pid),info=game.ratings?.[pid];
  setText(c.name,player?.bot?botName():player?.name||'—');c.dot.className='xq-dot '+color;c.dot.title=sideName(color);
  setText(c.flame,info&&info.streak>=3?'🔥'+info.streak:'');
  setText(c.sub,player?.bot?t('xqBotRating',{n:BOT_RATING[game.level]||1200}):info?`${tierName(info.tier||0)} · ${info.rating}`:'');
  c.root.classList.toggle('turn',game.status==='active'&&game.side===color);
  const won=game.captured[color==='red'?'black':'red'].join(''); // pieces this side has captured
  if(c.cap.dataset.k!==won){c.cap.dataset.k=won;c.cap.replaceChildren();for(const ch of won)el('span',GLYPH[ch],c.cap,ch===ch.toUpperCase()?'red':'black');}
 }
 function statusText(){
  if(armed&&Date.now()<armed.until)return t(armed.key);
  if(game.status!=='active')return'';
  if(sending)return t('xqSending');
  if(errorText)return errorText;
  if(!game.member)return t('xqWatching',{side:sideName(game.side)});
  if(game.drawOffer==='mine'||game.undoOffer==='mine')return t('xqOfferSent');
  if(game.hint&&myTurn())return t('xqHintShown');
  if(myTurn())return game.check?t('xqYourCheck'):t('xqYourTurn');
  if(game.opponent==='bot')return t('xqThinking');
  return t('xqWaitFor',{name:game.players.find(p=>p.id===game.colors[game.side])?.name||'…'});
 }
 function paintInfo(){
  if(!refs.shell?.isConnected||!game||mode!=='game')return;
  const g=game,active=g.status==='active',bot=g.opponent==='bot',live=g.member&&active,mine=myTurn();
  const topColor=myColor()==='black'?'red':'black';
  fillCard(refs.top,topColor);fillCard(refs.bottom,topColor==='red'?'black':'red');
  setText(refs.statusText,statusText());
  const left=Math.max(0,Math.ceil((g.deadline-nowMs())/1000));
  setText(refs.clock,active&&g.timed?`${left}s`:active?t('xqNoClock'):'');refs.clock.classList.toggle('low',active&&g.timed&&left<=10);
  setText(refs.rated,t(g.rated?'xqRated':'xqUnrated'));refs.rated.classList.toggle('off',!g.rated);
  const theirs=g.drawOffer==='theirs'?'xqDrawOffer':g.undoOffer==='theirs'?'xqUndoOffer':null;
  refs.offer.hidden=!(theirs&&live);if(theirs&&live)setText(refs.offerText,t(theirs,{name:g.players.find(p=>p.id!==me)?.name||'…'}));
  refs.undo.hidden=refs.resign.hidden=!g.member;refs.hint.hidden=!(g.member&&bot);refs.draw.hidden=!(g.member&&!bot);
  refs.undo.disabled=!live||sending||g.undosLeft<1||(bot?!(mine&&g.moves>=2):(mine||!g.moves||Boolean(g.undoOffer)));
  setText(refs.undo.querySelector('span'),`${t('xqUndo')} ${g.undosLeft}`);
  refs.hint.disabled=!live||sending||!mine||g.hintsLeft<1;setText(refs.hint.querySelector('span'),`${t('xqHint')} ${g.hintsLeft}`);
  refs.draw.disabled=!live||sending||Boolean(g.drawOffer);refs.resign.disabled=!live||sending;
  for(const name of['undo','hint','resign'])refs[name].classList.toggle('armed',armed?.name===name&&Date.now()<armed.until);
  refs.emoteMenu.hidden=!emoteOpen;refs.emote.classList.toggle('open',emoteOpen);
  paintBubbles();paintOver();
 }
 function paintBubbles(){
  const now=nowMs();
  for(const e of game.emotes||[]){
   const key=e.id+':'+e.at,age=Math.max(0,now-e.at);if(age>3800||bubbles.has(key))continue;
   const b=el('div',undefined,refs.bubbles,'xq-bubble'+(e.mine?' mine':''));el('small',e.name,b);
   if(EMOJI[e.code])el('span',EMOJI[e.code],b,'xq-big');else el('b',t('xqE_'+e.code),b);
   bubbles.set(key,b);setTimeout(()=>b.remove(),3800-age);
  }
 }
 function paintOver(){
  const g=game,over=g.status!=='active'&&g.id!==dismissedId;
  const key=over?[g.id,g.status,g.reason,JSON.stringify(g.ratingChange),lang()].join('|'):'';
  if(key===overKey)return;overKey=key;refs.over.hidden=!over;refs.over.replaceChildren();if(!over)return;
  const card=el('div',undefined,refs.over,'xq-result'),won=g.winnerIds.includes(me),draw=!g.winnerIds.length;
  if(g.last?.canceled)el('h3',t('gameCanceled'),card);
  else{
   const winner=g.players.find(p=>p.id===g.winnerIds[0]);
   el('h3',draw?t('xqDrawn'):!g.member?t('xqWinner',{name:winner?.bot?botName():winner?.name||'—'}):t(won?'xqWin':'xqLose'),card,draw?'draw':won?'win':g.member?'lose':'');
   if(g.reason)el('p',t('xqWhy_'+g.reason),card,'xq-why');
   const change=g.ratingChange?.[me];
   if(change){
    el('p',t('xqRatingChange',{before:change.before,after:change.after,delta:(change.delta>=0?'+':'')+change.delta}),card,'xq-delta '+(change.delta>=0?'up':'down'));
    if(change.streak>=2)el('p','🔥 '+t('xqStreakLine',{n:change.streak}),card,'xq-streak');
    if(change.tierUp)el('p','🏅 '+t('xqTierUp',{title:tierName(change.tier)}),card,'xq-tier');
   }else if(g.member)el('p',t('xqNoRating'),card,'xq-note');
  }
  const row=el('div',undefined,card,'xq-result-actions');
  if(g.member&&g.players[0].id===me)el('button',t('xqNewGame'),row,'primary').onclick=()=>startGame({opponent:g.opponent,level:g.level});
  el('button',t('xqLobby'),row).onclick=()=>{dismissedId=g.id;overKey='';selected=null;targets=[];local=null;renderLobby();};
 }

 // ---------- effects when a new server state arrives ----------
 function effects(value,prev){
  const lostOf=v=>v.captured.red.length+v.captured.black.length;
  if(!prev){fxMoves=soundedMoves=value.moves;slide=null;return;}
  if(value.moves<prev.moves)soundedMoves=value.moves; // a take-back
  if(value.moves>fxMoves&&value.lastMove){
   const fresh=value.moves>soundedMoves,captured=lostOf(value)>lostOf(prev),to=value.lastMove.to;
   if(fresh){fx.sound(captured?'capture':'move');fx.vibrate(captured?28:10);slide={from:value.lastMove.from,to};}
   if(captured){
    const lost=value.captured.red.length>prev.captured.red.length?value.captured.red.at(-1):value.captured.black.at(-1),[x,y]=xy(to),ghost=pieceNode(lost,to);
    ghost.style.transform='';fx.fling(ghost,x,y,Math.random()<.5?-1:1);fx.burst(x,y,HEAVY.includes(lost)?1.6:1);fx.shake(HEAVY.includes(lost)?1.2:.6);
   }
   if(value.status==='active'&&value.check){fx.sound('check');fx.stamp(t('xqCheck'),'check');}
   soundedMoves=Math.max(soundedMoves,value.moves);
  }
  if(prev.status==='active'&&value.status==='finished'&&!value.last?.canceled){
   const won=value.winnerIds.includes(me),draw=!value.winnerIds.length,mate=value.reason==='checkmate'||value.reason==='stalemate';
   if(mate){fx.stamp(t('xqMate'),'mate');fx.shake(1.6);}
   setTimeout(()=>{fx.sound(draw?'draw':won||!value.member?'win':'lose');if(won)fx.confetti();},mate?650:0);
  }
  fxMoves=value.moves;
 }
 function scheduleBotPoll(){
  clearTimeout(botTimer);
  if(mode!=='game'||game?.status!=='active'||myTurn()||!(game.opponent==='bot'||game.member))return;
  botTimer=setTimeout(()=>{if(isVisible())poll?.();scheduleBotPoll();},game.opponent==='bot'?800:900);
 }

 // ---------- lobby ----------
 async function loadBoard(){try{board=await api('/api/tea/xiangqi/leaderboard');lobbyLoadedAt=Date.now();if(mode==='lobby')paintLobbyData();}catch{}}
 const gainFor=level=>{const m=board?.me||{rating:1000,wins:0,losses:0,draws:0},k=m.wins+m.losses+m.draws<10?40:24;return Math.max(1,Math.round(k*(1-1/(1+10**((BOT_RATING[level]-m.rating)/400)))));};
 function renderLobby(){
  box.replaceChildren();mode='lobby';refs={};locale=lang();clearTimeout(botTimer);
  const root=el('section',undefined,box,'xq-lobby'),main=el('div',undefined,root,'xq-lobby-main'),head=el('div',undefined,main,'xq-lobby-head');refs.lobby=root;
  el('span','帥',head,'xq-seal');const titles=el('div',undefined,head);el('h3',t('xiangqiName'),titles);el('p',t('xiangqiRules'),titles);
  refs.meCard=el('div',undefined,main,'xq-me');
  const seated=myTable()?.seats.filter(s=>s.walletId).length||0,friendOk=seated>=2;
  if(!friendOk)prefs.opponent='bot';
  const modes=el('div',undefined,main,'xq-modes');
  for(const[key,label,icon]of[['bot',t('xqVsBot'),'🤖'],['friend',t('xqVsFriend'),'👥']]){
   const b=el('button',undefined,modes);b.type='button';b.dataset.opponent=key;el('i',icon,b);el('b',label,b);
   if(key==='friend'&&!friendOk){b.disabled=true;el('small',t('xqFriendNeed'),b);}
   b.classList.toggle('on',prefs.opponent===key);b.onclick=()=>{prefs.opponent=key;savePrefs();renderLobby();};
  }
  refs.levels=el('div',undefined,main,'xq-levels');refs.levels.hidden=prefs.opponent!=='bot';el('span',t('xqLevel'),refs.levels);
  for(const level of['easy','medium','hard']){
   const b=el('button',undefined,refs.levels);b.type='button';b.dataset.level=level;el('b',levelName(level),b);el('small','',b);b.classList.toggle('on',prefs.level===level);
   b.onclick=()=>{prefs.level=level;savePrefs();refs.levels.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));};
  }
  const row=el('div',undefined,main,'xq-start-row'),start=el('button',t('xqStart'),row,'primary');start.id='xq-start';start.disabled=!myTable()||starting;
  start.onclick=()=>startGame({opponent:prefs.opponent==='friend'&&friendOk?'friend':'bot',level:prefs.level});
  el('button',t('invitePlayers'),row).onclick=invite;
  if(!myTable())el('p',t('notSeated'),main,'xq-note');else if(prefs.opponent==='friend')el('p',t('hostStarts'),main,'xq-note');
  const side=el('div',undefined,root,'xq-lb'),tabs=el('div',undefined,side,'xq-tabs');
  for(const[key,label]of[['top',t('xqBoard')],['streak',t('xqStreaks')]]){
   const b=el('button',label,tabs);b.type='button';b.dataset.tab=key;b.classList.toggle('on',tab===key);
   b.onclick=()=>{tab=key;tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));paintLobbyData();};
  }
  refs.list=el('ol',undefined,side,'xq-list');
  paintLobbyData();if(!board||Date.now()-lobbyLoadedAt>8000)loadBoard();
 }
 function paintLobbyData(){
  if(!refs.meCard?.isConnected)return;
  const mine=board?.me;refs.meCard.replaceChildren();
  if(mine){
   el('b',tierName(mine.tier),refs.meCard,'xq-tier-name');el('span',`${t('xqRating')} ${mine.rating}`,refs.meCard,'xq-rating');
   el('span',(mine.streak>=3?'🔥 ':'')+t('xqStreak',{n:mine.streak})+(mine.bestStreak>mine.streak?' · '+t('xqBest',{n:mine.bestStreak}):''),refs.meCard);
   el('small',t('xqRecord',{w:mine.wins,l:mine.losses,d:mine.draws}),refs.meCard);
  }else el('small',t('xqLoading'),refs.meCard);
  refs.levels?.querySelectorAll('button').forEach(b=>{b.querySelector('small').textContent=t('xqGain',{n:gainFor(b.dataset.level)});});
  refs.list.replaceChildren();
  const rows=tab==='top'?board?.top:board?.streaks;
  if(!rows)el('li',t('xqLoading'),refs.list,'empty');
  else if(!rows.length)el('li',t('xqEmptyBoard'),refs.list,'empty');
  else rows.forEach((row,index)=>{
   const li=el('li',undefined,refs.list,row.me?'me':'');el('span',['🥇','🥈','🥉'][index]||String(index+1),li,'rank');
   const who=el('div',undefined,li);el('b',row.name,who);el('small',tierName(row.tier),who);
   el('em',tab==='top'?String(row.rating):(row.streak>=3?'🔥 ':'')+t('xqBest',{n:row.bestStreak}),li);
  });
 }
 async function startGame(opts){
  if(starting)return;starting=true;refs.lobby?.querySelector('#xq-start')?.setAttribute('disabled','');
  try{
   const data=await api('/api/tea/games',{method:'POST',body:JSON.stringify({key:'xiangqi',botCount:0,opponent:opts.opponent,level:opts.level,requestId:id()})});
   dismissedId=null;prefs.level=opts.level;savePrefs();board=null;update(data.game);
  }catch(e){toast(msg(e));if(mode==='lobby')renderLobby();}
  finally{starting=false;}
 }

 // ---------- entry points ----------
 function render(value,myId){
  me=myId;
  if(!value||(value.status!=='active'&&value.id===dismissedId)){game=value||null;renderLobby();return;}
  const prev=game&&game.id===value.id?game:null;
  game=value;offset=value.serverNow-Date.now();flip=value.myColor==='black';
  if(mode!=='game'||!refs.shell?.isConnected||locale!==lang())mountGame();
  if(prevId!==value.id){prevId=value.id;errorText='';armed=null;emoteOpen=false;local=null;selected=null;targets=[];}
  if(local&&value.moves>local.ply)local=null;
  effects(value,prev);
  if(value.status!=='active'){selected=null;targets=[];}else if(selected!=null&&!interactive())selected=null,targets=[];
  paintBoard(true);paintInfo();scheduleBotPoll();
 }
 function clear(){clearTimeout(botTimer);game=null;mode='';refs={};local=null;selected=null;targets=[];dragging=null;sending=false;paintKey='';overKey='';prevId='';dismissedId=null;bubbles.clear();}
 setInterval(()=>{if(isVisible()&&mode==='game')paintInfo();},250);
 return{render,clear};
};
