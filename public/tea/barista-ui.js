window.TeaBaristaUI=function({box,api,t,id,update,again,isVisible}){
 const KEY='locly-barista-draft';let game,me,root,title,message,recipe,tray,cup,ingredients,serve,undo,empty,retry,score,clock,steps=[],pending=null,busy=false,error='',identity='',locale='',offset=0,generation=0,paintKey='';
 const el=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;parent?.append(n);return n;};
 const name=key=>game.ingredients.find(i=>i.id===key)?.[document.documentElement.lang==='vi'?'vi':'en']||key;
 const expired=()=>Date.now()+offset>=game.deadline;
 const allowed=()=>game?.status==='active'&&game.phase==='mixing'&&game.member&&!game.submitted.includes(me)&&!busy&&!pending&&!expired()&&!document.hidden&&!document.body.classList.contains('portrait-blocked');
 function save(){try{sessionStorage.setItem(KEY,JSON.stringify({gameId:game.id,playerId:me,round:game.round,steps,pending}));}catch{}}
 function restore(){steps=[];pending=null;try{const saved=JSON.parse(sessionStorage.getItem(KEY)||'null');if(saved?.gameId===game.id&&saved.playerId===me&&saved.round===game.round&&Array.isArray(saved.steps)&&saved.steps.length<=game.recipeLength&&saved.steps.every(s=>game.ingredients.some(i=>i.id===s))){steps=saved.steps;const p=saved.pending;if(p?.gameId===game.id&&p.round===game.round&&p.type==='serve'&&typeof p.requestId==='string'&&Array.isArray(p.steps)&&p.steps.length===game.recipeLength&&p.steps.every(s=>game.ingredients.some(i=>i.id===s)))pending=p;}}catch{}}
 function icon(canvas,key){const c=canvas.getContext('2d'),p=(color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};c.clearRect(0,0,48,48);c.imageSmoothingEnabled=false;
  if(key==='ice'){p('#488b9e',9,10,25,27);p('#a8dbe5',12,12,22,22);p('#e0f6ee',14,14,8,4);p('#6eb5c5',26,28,7,7);}
  else if(key==='pearls'){for(const [x,y]of [[13,17],[27,17],[20,30]]){p('#403948',x-5,y-5,12,12);p('#716074',x-3,y-4,4,3);}}
  else if(key==='milk'||key==='syrup'){p('#536b67',12,13,24,27);p(key==='milk'?'#f1dfbb':'#e39b91',15,16,18,21);p('#657f7a',16,6,16,8);p('#f9efce',18,23,12,8);}
  else{p('#4b635b',8,17,29,19);p(key==='tea'?'#c38d4c':'#795442',11,20,23,13);p('#4b635b',36,20,6,12);p('#e6dec1',13,9,3,6);p('#e6dec1',24,6,3,9);p('#4b635b',7,37,33,3);}}
 function chip(parent,key,index){const n=el('div',undefined,parent,'barista-chip');n.dataset.ingredient=key||'';el('small',index+1,n);if(key){const c=el('canvas',undefined,n);c.width=c.height=48;icon(c,key);el('b',name(key),n);}else el('b','?',n);return n;}
 function drawCup(){const c=cup.getContext('2d'),p=(color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};c.clearRect(0,0,200,220);c.imageSmoothingEnabled=false;p('#b5c0ad',24,199,152,9);p('#526e64',47,45,106,150);p('#f8f4dc',54,51,92,136);p('#526e64',147,70,28,85);p('#eee9d8',154,79,14,66);steps.forEach((key,i)=>{const item=game.ingredients.find(v=>v.id===key);p(item.color,58,160-i*23,84,22);if(key==='pearls')for(let x=65;x<138;x+=19)p('#362d35',x,166-i*23,8,8);if(key==='ice')for(let x=65;x<138;x+=22)p('#e4f7f3',x,164-i*23,13,13);});p('#526e64',43,41,114,9);p('#fff9e6',61,58,7,115);p('#788f7f',77,192,49,4);}
 function mount(){box.replaceChildren();root=el('section',undefined,box,'barista-shell');const head=el('div',undefined,root,'barista-head');title=el('h3',t('baristaName'),head);clock=el('b','',head);clock.id='mini-clock';score=el('div','',root,'barista-score');message=el('p','',root,'barista-message');message.setAttribute('role','status');
  const bench=el('div',undefined,root,'barista-bench'),left=el('div',undefined,bench,'barista-drink');cup=el('canvas',undefined,left);cup.width=200;cup.height=220;cup.setAttribute('aria-label',t('baristaCup'));el('b',t('baristaCup'),left);
  const right=el('div',undefined,bench,'barista-work');recipe=el('div',undefined,right,'barista-recipe');recipe.setAttribute('aria-label',t('baristaRecipe'));tray=el('div',undefined,right,'barista-tray');tray.setAttribute('aria-label',t('baristaTray'));ingredients=el('div',undefined,right,'barista-ingredients');
  for(const item of game.ingredients){const b=el('button',undefined,ingredients);b.type='button';b.dataset.mix=item.id;const c=el('canvas',undefined,b);c.width=c.height=48;icon(c,item.id);el('span',name(item.id),b);b.onclick=()=>{if(!allowed()||steps.length>=game.recipeLength)return;steps.push(item.id);error='';save();paint();};}
  const actions=el('div',undefined,root,'barista-actions');undo=el('button',t('baristaUndo'),actions);undo.onclick=()=>{if(allowed()){steps.pop();save();paint();}};empty=el('button',t('baristaClear'),actions);empty.onclick=()=>{if(allowed()){steps=[];save();paint();}};serve=el('button',t('baristaServe'),actions);serve.className='primary';serve.onclick=send;retry=el('button',t('baristaRetry'),actions);retry.onclick=send;const next=el('button',t('playAgain'),actions,'barista-again');next.hidden=true;next.onclick=again;
 }
 function paint(){if(!root?.isConnected||!game)return;const remaining=Math.max(0,Math.ceil((game.deadline-(Date.now()+offset))/1000));clock.textContent=game.status==='active'?t('secondsLeft',{seconds:remaining}):'';
  const finished=game.status!=='active',submitted=game.submitted.includes(me),revealed=game.phase==='result'||finished,showRecipe=(game.phase==='preview'&&!expired())||revealed;
  const result=game.results?.find(r=>r.id===me),mine=game.players.find(p=>p.id===me);
  title.textContent=finished?t('baristaFinal'):`${t('baristaName')} · ${game.round}/5`;
  score.textContent=finished?t('baristaResult',{score:mine?.score||0}):game.players.map(p=>`${p.name}: ${p.score}${game.submitted.includes(p.id)?' ✓':''}`).join(' · ');
  message.textContent=game.last?.canceled?t('gameCanceled'):!game.member?t('spectator'):busy?t('baristaSending'):pending?t('baristaUncertain'):error||(finished?t('baristaResult',{score:mine?.score||0}):game.phase==='result'?t(result?.correct?'baristaCorrect':'baristaWrong'):expired()?t('baristaNext'):game.phase==='preview'?t('baristaPreview'):submitted?t('baristaWaiting'):t('baristaMixing'));
  const nextKey=JSON.stringify([steps,showRecipe,game.recipe,game.round,locale]);if(paintKey!==nextKey){paintKey=nextKey;recipe.replaceChildren();if(showRecipe)game.recipe?.forEach((key,i)=>chip(recipe,key,i));tray.replaceChildren();for(let i=0;i<game.recipeLength;i++)chip(tray,steps[i],i);drawCup();}
  recipe.hidden=!showRecipe;tray.hidden=game.phase==='preview'&&!expired();ingredients.hidden=game.phase!=='mixing'||submitted||finished;
  ingredients.querySelectorAll('button').forEach(b=>b.disabled=!allowed()||steps.length>=game.recipeLength);undo.disabled=empty.disabled=!allowed()||!steps.length;serve.disabled=!allowed()||steps.length!==game.recipeLength;
  undo.hidden=empty.hidden=serve.hidden=finished||game.phase!=='mixing'||submitted||Boolean(pending);retry.hidden=!pending||finished||submitted;retry.disabled=busy||expired();root.querySelector('.barista-again').hidden=!finished;
 }
 async function send(){if(busy||!game.member||expired()||game.phase!=='mixing'||game.status!=='active'||game.submitted.includes(me)||document.body.classList.contains('portrait-blocked'))return;if(!pending){if(steps.length!==game.recipeLength)return;pending={type:'serve',steps:steps.slice(),gameId:game.id,round:game.round,requestId:id()};save();}busy=true;error='';const current=generation,request=pending;paint();try{
   const result=await api('/api/tea/games/barista/action',{method:'POST',body:JSON.stringify(request),signal:AbortSignal.timeout(12000)});if(current!==generation)return;pending=null;save();update(result.game);
  }catch(e){if(current!==generation)return;if(e.status&&e.status<500){pending=null;error=t(e.code);save();}}
  finally{if(current===generation){busy=false;paint();}}
 }
 function render(value,myId){game=value;me=myId;offset=value.serverNow-Date.now();const next=game.id+':'+game.round+':'+me;if(identity!==next){identity=next;generation++;busy=false;error='';restore();paintKey='';}
  const nextLocale=document.documentElement.lang;if(!root?.isConnected||locale!==nextLocale){locale=nextLocale;mount();paintKey='';}
  if(game.myMix){steps=game.myMix.slice();pending=null;save();}if(game.status!=='active'||game.phase==='result'){pending=null;save();}paint();
 }
 function clear(){generation++;identity='';busy=false;pending=null;steps=[];root=null;paintKey='';}
 setInterval(()=>{if(isVisible())paint();},100);
 return{render,clear};
};
