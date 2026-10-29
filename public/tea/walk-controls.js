/* Shared keyboard, touch stick and device-local view preferences. */
window.TeaWalkControls=({canvas,keys,allowed,cancel,locale})=>{
  const world=canvas.parentElement,stick=document.createElement('div'),thumb=document.createElement('i'),bar=document.createElement('div');
  stick.className='walk-stick';stick.setAttribute('role','group');stick.setAttribute('aria-label','Movement joystick');stick.append(thumb);
  bar.className='walk-toolbar';bar.innerHTML='<button type="button" class="walk-speed" aria-pressed="false"></button><select aria-label="Camera zoom"><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option></select>';
  world.append(stick,bar);const button=bar.querySelector('button'),select=bar.querySelector('select');let pointer=null,axis={x:0,y:0},walking=false,zoom=1,lastLanguage;
  try{const saved=Number(localStorage.getItem('locly-world-zoom'));if([.75,1,1.25].includes(saved))zoom=saved;}catch{}
  select.value=String(zoom);
  function labels(){const vi=locale()==='vi';if(lastLanguage===vi)return;lastLanguage=vi;button.textContent=vi?'Đi bộ':'Walk';button.title=vi?'Giữ Shift để đi bộ tạm thời':'Hold Shift to walk temporarily';select.setAttribute('aria-label',vi?'Thu phóng camera':'Camera zoom');}
  function release(){const id=pointer;pointer=null;axis={x:0,y:0};thumb.style.transform='translate(0px,0px)';stick.classList.remove('held');if(id!==null&&stick.hasPointerCapture(id))stick.releasePointerCapture(id);}
  function reset(){keys.clear();release();cancel();}
  function update(e){if(e.pointerId!==pointer)return;const r=stick.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,n=Math.hypot(x,y),radius=r.width*.31;const angle=Math.round(Math.atan2(y,x)/(Math.PI/4))*Math.PI/4;axis=n<radius*.2?{x:0,y:0}:TeaMotion.vector(Math.round(Math.cos(angle)),Math.round(Math.sin(angle)));const amount=Math.min(n,radius);thumb.style.transform=`translate(${n?x/n*amount:0}px,${n?y/n*amount:0}px)`;}
  stick.onpointerdown=e=>{e.preventDefault();if(pointer!==null||!allowed())return;cancel();pointer=e.pointerId;stick.setPointerCapture(pointer);stick.classList.add('held');update(e);};
  stick.onpointermove=update;stick.onpointerup=stick.onpointercancel=e=>{if(e.pointerId===pointer)release();};stick.onlostpointercapture=release;stick.oncontextmenu=e=>e.preventDefault();
  button.onclick=()=>{reset();walking=!walking;button.setAttribute('aria-pressed',String(walking));};
  select.onchange=()=>{reset();zoom=Number(select.value);try{localStorage.setItem('locly-world-zoom',String(zoom));}catch{}};
  const movementKeys=['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'];
  addEventListener('keydown',e=>{const key=e.key.toLowerCase();if(!movementKeys.includes(key)||e.target.closest('input,textarea,select,dialog')||!allowed())return;e.preventDefault();if(e.repeat&&!keys.has(key))return;keys.add(key);if(key!=='shift')cancel();});
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  for(const event of ['blur','pagehide','resize','tea:orientationchange'])addEventListener(event,reset);
  document.addEventListener('visibilitychange',reset);
  new MutationObserver(()=>{if(document.querySelector('dialog[open]'))reset();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  addEventListener('storage',e=>{if(e.key==='locly-world-zoom'&&[.75,1,1.25].includes(Number(e.newValue))){zoom=Number(e.newValue);select.value=String(zoom);}});
  labels();
  return {reset,get zoom(){return zoom;},get mode(){return walking||keys.has('shift')?'walk':'run';},vector(){labels();if(!allowed()){reset();return{x:0,y:0};}const x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0),y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0);return x||y?TeaMotion.vector(x,y):axis;},reject(x,y){const mark=document.createElement('span');mark.className='walk-blocked';mark.textContent='×';mark.style.left=x+'px';mark.style.top=y+'px';world.append(mark);setTimeout(()=>mark.remove(),700);}};
};
