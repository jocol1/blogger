window.TeaDrawingUI=function({box,api,t,id,update,again}){
 let game,me,root,canvas,ctx,tools,form,input,status,title,scores,queue=[],sending=false,failed=false,activeStroke=null,pointer=null,color='#263e46',width=7,identity='',observer,session=0,language='',errorMessage='';
 const node=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;parent?.append(n);return n;};
 const portrait=()=>matchMedia('(orientation:portrait) and (max-width:700px)').matches;
 const canDraw=(clear=false)=>root?.getClientRects().length&&game?.status==='active'&&game.phase==='drawing'&&game.artist===me&&!failed&&queue.length<8&&(clear||game.strokes.length+queue.filter(q=>q.type==='stroke').length<game.strokeLimit)&&!portrait()&&!document.hidden;
 function drawStroke(s){ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.lineWidth=s.width;ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();s.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));if(s.points.length===1){ctx.arc(s.points[0][0],s.points[0][1],s.width/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}
 function paint(){if(!ctx)return;ctx.fillStyle='#fff';ctx.fillRect(0,0,600,360);for(const s of game?.strokes||[])drawStroke(s);for(const q of queue)if(q.type==='clear'){ctx.fillStyle='#fff';ctx.fillRect(0,0,600,360);}else if(q.type==='stroke')drawStroke(q.stroke);if(activeStroke)drawStroke(activeStroke);}
 function statusText(){status.textContent=failed?t('drawingRetryHint'):sending||queue.length?t('drawingSaving'):errorMessage||(game?.artist===me&&game.strokes.length>=game.strokeLimit?t('drawingFull'):game?.feedback?t(game.feedback==='correct'?'drawingCorrect':'drawingTryAgain'):t(game?.artist===me?'drawingPenHint':'drawingGuessHint'));}
 async function flush(){if(sending||failed||!queue.length)return;const request=queue[0],generation=session;sending=true;statusText();try{
   const result=await api('/api/tea/games/drawing/action',{method:'POST',body:JSON.stringify(request),signal:AbortSignal.timeout(12000)});
   if(generation!==session)return;queue.shift();update(result.game);
  }catch(error){if(generation!==session)return;if(error.status&&error.status<500&&error.status!==429){queue.shift();errorMessage=error.message;}else failed=true;
  }finally{if(generation===session){sending=false;paint();statusText();root.querySelector('.draw-retry').hidden=!failed;if(queue.length&&!failed)setTimeout(flush,130);}}
 }
 function enqueue(data){errorMessage='';queue.push({...data,key:'drawing',gameId:game.id,round:game.round,requestId:id()});flush();}
 function stop(){activeStroke=null;pointer=null;paint();}
 function point(event){const r=canvas.getBoundingClientRect();return[Math.max(0,Math.min(600,Math.round((event.clientX-r.left)*600/r.width))),Math.max(0,Math.min(360,Math.round((event.clientY-r.top)*360/r.height)))];}
 function mount(){
  observer?.disconnect();box.replaceChildren();root=node('section',undefined,box,'draw-shell');
  const head=node('div',undefined,root,'draw-head');title=node('strong','',head);const clock=node('b','',head);clock.id='mini-clock';
  scores=node('div','',root,'draw-scores');tools=node('div',undefined,root,'draw-tools');
  for(const [i,c]of ['#263e46','#d65c52','#4d83bc','#5d975e','#e4b749','#ffffff'].entries()){const b=node('button','',tools,'draw-color');b.type='button';b.style.background=c;b.setAttribute('aria-label',t('drawingColor'+i));b.setAttribute('aria-pressed',String(c===color));b.onclick=()=>{color=c;tools.querySelectorAll('.draw-color').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));};}
  const size=node('select',undefined,tools);size.setAttribute('aria-label',t('drawingSize'));for(const w of [3,7,14]){const option=node('option',String(w)+' px',size);option.value=w;}size.value=width;size.onchange=()=>width=Number(size.value);
  const clear=node('button',t('drawingClear'),tools);clear.type='button';clear.onclick=()=>{if(canDraw(true)&&confirm(t('drawingClearConfirm')))enqueue({type:'clear'});};
  const paper=node('div',undefined,root,'draw-paper');canvas=node('canvas',undefined,paper);canvas.width=600;canvas.height=360;canvas.setAttribute('aria-label',t('drawingCanvas'));ctx=canvas.getContext('2d');
  observer=new ResizeObserver(()=>{const w=paper.clientWidth,h=paper.clientHeight,scale=Math.min(w/600,h/360);canvas.style.width=Math.max(0,600*scale)+'px';canvas.style.height=Math.max(0,360*scale)+'px';});observer.observe(paper);
  canvas.onpointerdown=e=>{if(!canDraw()||pointer!==null)return;e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);activeStroke={color,width,points:[point(e)]};paint();};
  canvas.onpointermove=e=>{if(e.pointerId!==pointer||!activeStroke)return;if(!canDraw()){stop();return;}const p=point(e),last=activeStroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])<2)return;activeStroke.points.push(p);if(activeStroke.points.length>100)activeStroke.points=activeStroke.points.filter((_,i)=>i%2===0||i===100);paint();};
  canvas.onpointerup=e=>{if(e.pointerId!==pointer||!activeStroke)return;const stroke=activeStroke;stop();if(canDraw())enqueue({type:'stroke',stroke});paint();};canvas.onpointercancel=stop;canvas.onlostpointercapture=stop;
  form=node('form',undefined,root,'draw-guess');input=node('input',undefined,form);input.maxLength=60;input.autocomplete='off';input.placeholder=t('drawingGuessHint');input.setAttribute('aria-label',t('drawingGuessHint'));const send=node('button',t('drawingGuess'),form);send.type='submit';
  form.onsubmit=e=>{e.preventDefault();if(!input.value.trim()||sending||queue.length||failed||game.status!=='active'||game.phase!=='drawing'||game.artist===me||!game.member||game.guessed.includes(me)||portrait())return;enqueue({type:'guess',text:input.value});input.value='';};
  const foot=node('div',undefined,root,'draw-foot');status=node('span','',foot);status.setAttribute('role','status');const retry=node('button',t('drawingRetry'),foot,'draw-retry');retry.hidden=true;retry.onclick=()=>{failed=false;flush();};const restart=node('button',t('playAgain'),foot,'draw-again');restart.hidden=true;restart.onclick=again;
 }
 function render(value,myId){
  game=value;me=myId;const next=game.id+':'+game.round;
    if(next!==identity){identity=next;session++;queue=[];sending=failed=false;errorMessage='';stop();}
  const nextLanguage=document.documentElement.lang;if(!root?.isConnected||language!==nextLanguage){const draft=input?.value||'';mount();input.value=draft;language=nextLanguage;}
  if(game.phase!=='drawing'||game.status!=='active'){stop();queue=[];failed=false;root.querySelector('.draw-retry').hidden=true;}
  const locale=document.documentElement.lang==='vi'?'vi':'en',artist=game.players.find(p=>p.id===game.artist)?.name||'';
  title.textContent=game.last?.canceled?t('gameCanceled'):game.status==='finished'?t('winners',{names:game.players.filter(p=>game.winnerIds.includes(p.id)).map(p=>p.name).join(', ')}):game.prompt?`${t(game.phase==='reveal'?'drawingAnswer':'drawingWord')}: ${game.prompt[locale]}`:t('drawingArtist',{name:artist});
  scores.textContent=`${Math.min(game.round,game.maxRounds)}/${game.maxRounds} · `+game.players.map(p=>`${p.name}: ${p.score}${game.guessed.includes(p.id)?' ✓':''}`).join(' · ');
  tools.hidden=game.artist!==me||game.status!=='active'||game.phase!=='drawing';form.hidden=game.artist===me||game.status!=='active'||game.phase!=='drawing'||!game.member||game.guessed.includes(me);
  root.querySelector('.draw-again').hidden=game.status==='active';statusText();paint();
 }
 function clear(){session++;identity='';queue=[];sending=failed=false;stop();observer?.disconnect();root=null;}
 window.addEventListener('blur',stop);document.addEventListener('visibilitychange',stop);window.addEventListener('resize',stop);
 return{render,clear};
};
