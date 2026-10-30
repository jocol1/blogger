window.TeaFarmHands=({world,state,nearby,locale,t,name,stop,available,now})=>{
 let tool='hoe',crop='radish',fish='guppy',stamp='',restored=false;const keys=['hoe','seed','water','feed','collect','inspect'],storageKey='locly-farm-tools';
 const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify({tool,crop,fish}));}catch{}};
 const belt=document.createElement('div');belt.className='farm-belt';belt.setAttribute('role','toolbar');
 const caption=document.createElement('div');caption.className='farm-tool-caption';
 const selectedLabel=document.createElement('span'),context=document.createElement('span'),progress=document.createElement('progress');context.className='farm-nearby-status';progress.max=1;caption.append(selectedLabel,context,progress);
 const picker=document.createElement('section');picker.className='seed-picker';picker.hidden=true;picker.setAttribute('aria-label','Seeds');
 world.append(belt,caption,picker);const buttons=[];
 const currentSeed=()=>nearby()?.panel==='pond'?fish:crop;
 function close(){picker.hidden=true;}
 function select(key){if(!available()||!keys.includes(key))return;stop();tool=key;save();close();stamp='';refresh();}
 function choose(category){if(!available()||!state())return;stop();tool='seed';picker.replaceChildren();const head=document.createElement('header'),title=document.createElement('strong'),exit=document.createElement('button');title.textContent=t(category==='fish'?'chooseFish':'chooseSeed');exit.textContent='×';exit.setAttribute('aria-label',t('close'));exit.onclick=close;head.append(title,exit);picker.append(head);const choices=document.createElement('div');choices.className='seed-choices';picker.append(choices);
  for(const [item,def]of Object.entries(state().catalog)){if(def.type!==category)continue;const b=document.createElement('button'),qty=state().farm.seeds[item]||0;b.textContent=`${name(item)} · ${qty}`;b.disabled=!qty;b.onclick=()=>{if(!available())return;if(category==='fish')fish=item;else crop=item;save();close();stamp='';refresh();};choices.append(b);}
  const hint=document.createElement('p');hint.textContent=t('buyAtMarket');picker.append(hint);picker.hidden=false;stamp='';refresh();
 }
 keys.forEach((key,index)=>{const b=document.createElement('button');b.type='button';b.dataset.farmTool=key;const icon=document.createElement('canvas');icon.width=48;icon.height=48;TeaFarmTools.icon(icon.getContext('2d'),key);const shortcut=document.createElement('kbd');shortcut.textContent=index+1;b.append(icon,shortcut);b.onclick=()=>{if(key==='seed'&&tool==='seed')choose(nearby()?.panel==='pond'?'fish':'crop');else select(key);};belt.append(b);buttons.push(b);});
 function refresh(hidden=false){belt.hidden=caption.hidden=hidden;if(hidden)close();const data=state();if(data&&!restored){restored=true;let saved;try{saved=JSON.parse(localStorage.getItem(storageKey));}catch{}({tool,crop,fish}=TeaFarmTools.preferences(saved,data.catalog));}
  const target=nearby(),status=data?TeaFarmTools.status(data.farm,data.catalog,target,now()):null,seed=currentSeed(),sig=[data?.farm.version,locale(),tool,seed,available(),hidden,target?.id,status?.key,status?.seconds].join(':');if(stamp===sig)return;stamp=sig;belt.setAttribute('aria-label',t('tools'));
  buttons.forEach((b,i)=>{const label=t('tool_'+keys[i]);b.title=`${i+1} · ${label}`;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',String(tool===keys[i]));b.disabled=!available();});
  selectedLabel.textContent=tool==='seed'?`${t('tool_seed')} · ${name(seed)} ×${data?.farm.seeds[seed]||0}`:t('tool_'+tool);
  context.hidden=!status;progress.hidden=status?.key!=='growingStatus';
  if(status){const timer=status.seconds?` · ${Math.floor(status.seconds/60)}:${String(status.seconds%60).padStart(2,'0')}`:'';context.textContent=`${status.item?name(status.item)+' · ':''}${t(status.key)}${timer}`;context.title=context.textContent;context.dataset.state=status.key;progress.value=status.progress;progress.setAttribute('aria-label',context.textContent);}
 }
 addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,dialog')||!available())return;if(keys[Number(e.key)-1]){e.preventDefault();select(keys[Number(e.key)-1]);}else if(e.key==='Escape')close();});
 for(const event of ['blur','resize','pagehide'])addEventListener(event,close);document.addEventListener('visibilitychange',close);
 return{get tool(){return tool;},get seed(){return currentSeed();},get choosing(){return !picker.hidden;},select,choose,close,refresh};
};
