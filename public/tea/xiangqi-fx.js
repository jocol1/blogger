// Effects for café Xiangqi: synthesized sounds, capture bursts, the CHECK stamp and confetti.
// Everything is WAAPI on SVG/HTML nodes, no assets. Motion is skipped for prefers-reduced-motion.
window.TeaXiangqiFx=function({stage,layer}){
 const KEY='locly-xq-muted',reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 let ctx=null,muted=false,banner=null,overlay=null;
 try{muted=localStorage.getItem(KEY)==='1';}catch{}
 const NS='http://www.w3.org/2000/svg';
 function audio(){
  if(!ctx){const A=window.AudioContext||window.webkitAudioContext;if(!A)return null;try{ctx=new A();}catch{return null;}}
  if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  return ctx;
 }
 function tone(a,{freq,to,dur=.12,type='sine',vol=.18,at=0}){
  const t0=a.currentTime+at,osc=a.createOscillator(),gain=a.createGain();
  osc.type=type;osc.frequency.setValueAtTime(freq,t0);if(to)osc.frequency.exponentialRampToValueAtTime(to,t0+dur);
  gain.gain.setValueAtTime(0.0001,t0);gain.gain.exponentialRampToValueAtTime(vol,t0+.008);gain.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  osc.connect(gain).connect(a.destination);osc.start(t0);osc.stop(t0+dur+.02);
 }
 function knock(a,vol,at=0,pitch=1){ // a wooden "cạch": a noise burst plus a short falling thump
  const t0=a.currentTime+at,len=Math.floor(a.sampleRate*.05),buf=a.createBuffer(1,len,a.sampleRate),data=buf.getChannelData(0);
  for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);
  const src=a.createBufferSource(),filter=a.createBiquadFilter(),gain=a.createGain();
  src.buffer=buf;filter.type='bandpass';filter.frequency.value=1800*pitch;filter.Q.value=.9;gain.gain.value=vol;
  src.connect(filter).connect(gain).connect(a.destination);src.start(t0);
  tone(a,{freq:260*pitch,to:90*pitch,dur:.07,type:'triangle',vol:vol*.9,at});
 }
 function sound(kind){
  if(muted)return;const a=audio();if(!a)return;
  if(kind==='move')knock(a,.55);
  else if(kind==='capture'){knock(a,.9,0,.8);knock(a,.7,.07,1.1);}
  else if(kind==='check'){tone(a,{freq:110,to:70,dur:.22,type:'triangle',vol:.45});tone(a,{freq:110,to:70,dur:.25,type:'triangle',vol:.5,at:.2});}
  else if(kind==='win')[523,659,784,1047].forEach((f,i)=>tone(a,{freq:f,dur:.22,type:'triangle',vol:.2,at:i*.11}));
  else if(kind==='lose')[392,330,262].forEach((f,i)=>tone(a,{freq:f,dur:.3,type:'sine',vol:.18,at:i*.16}));
  else if(kind==='draw')[440,440].forEach((f,i)=>tone(a,{freq:f,dur:.2,vol:.15,at:i*.18}));
 }
 const vibrate=ms=>{try{navigator.vibrate?.(ms);}catch{}};
 function setMuted(value){muted=Boolean(value);try{localStorage.setItem(KEY,muted?'1':'0');}catch{}}
 function shake(power=1){if(reduce())return;stage.animate([{transform:'translate(0,0)'},{transform:`translate(${-5*power}px,${2*power}px)`},{transform:`translate(${5*power}px,${-3*power}px)`},{transform:`translate(${-3*power}px,${1*power}px)`},{transform:'translate(0,0)'}],{duration:300,easing:'ease-out'});}
 function stamp(text,kind='check'){
  if(!banner||!banner.isConnected){banner=document.createElement('div');banner.className='xq-banner';banner.setAttribute('aria-hidden','true');stage.append(banner);}
  banner.textContent=text;banner.dataset.kind=kind;banner.getAnimations().forEach(x=>x.cancel());
  const pose='translate(-50%,-50%) rotate(-7deg)',frames=reduce()?[{opacity:0},{opacity:1,offset:.15},{opacity:1,offset:.8},{opacity:0}]
   :[{opacity:0,transform:pose+' scale(2.4)'},{opacity:1,transform:pose+' scale(1)',offset:.16},{opacity:1,transform:pose+' scale(1.04)',offset:.7},{opacity:0,transform:pose+' scale(1.08)'}];
  banner.animate(frames,{duration:kind==='mate'?2000:1300,easing:'ease-out',fill:'both'});
  banner.style.visibility='visible';
 }
 function burst(x,y,power=1){ // wooden chips flying out of a capture
  if(reduce())return;
  for(let i=0;i<10*power;i++){
   const chip=document.createElementNS(NS,'rect'),w=7+Math.random()*7,h=4+Math.random()*4,angle=Math.random()*Math.PI*2,dist=50+Math.random()*90*power;
   chip.setAttribute('width',w);chip.setAttribute('height',h);chip.setAttribute('x',-w/2);chip.setAttribute('y',-h/2);chip.setAttribute('rx',1.5);chip.setAttribute('fill',['#c48a4a','#e5b878','#a2652d'][i%3]);chip.style.pointerEvents='none';
   layer.append(chip);
   const a=chip.animate([{transform:`translate(${x}px,${y}px) rotate(0deg)`,opacity:1},{transform:`translate(${x+Math.cos(angle)*dist}px,${y+Math.sin(angle)*dist+30}px) rotate(${Math.random()*720-360}deg)`,opacity:0}],{duration:420+Math.random()*320,easing:'cubic-bezier(.2,.7,.4,1)',fill:'forwards'});
   a.onfinish=()=>chip.remove();
  }
 }
 function fling(ghost,x,y,dir){ // the captured piece spins off the board
  layer.append(ghost);
  if(reduce()){ghost.remove();return;}
  const a=ghost.animate([{transform:`translate(${x}px,${y}px) rotate(0deg) scale(1)`,opacity:1},{transform:`translate(${x+dir*150}px,${y-110}px) rotate(${dir*540}deg) scale(.55)`,opacity:0}],{duration:620,easing:'cubic-bezier(.25,.6,.4,1)',fill:'forwards'});
  a.onfinish=()=>ghost.remove();
 }
 function confetti(){
  if(reduce())return;
  if(!overlay||!overlay.isConnected){overlay=document.createElement('div');overlay.className='xq-confetti';stage.append(overlay);}
  const colors=['#d94f3d','#f2c14e','#58a36f','#4a8fc4','#fff3d0'];
  for(let i=0;i<46;i++){
   const bit=document.createElement('i');bit.style.left=Math.random()*100+'%';bit.style.background=colors[i%colors.length];bit.style.width=6+Math.random()*6+'px';bit.style.height=9+Math.random()*8+'px';overlay.append(bit);
   const drift=(Math.random()-.5)*160,a=bit.animate([{transform:'translate(0,-20px) rotate(0deg)',opacity:1},{transform:`translate(${drift}px,${stage.clientHeight+30}px) rotate(${Math.random()*900}deg)`,opacity:.9}],{duration:1700+Math.random()*1600,delay:Math.random()*350,easing:'cubic-bezier(.3,.1,.6,1)',fill:'forwards'});
   a.onfinish=()=>bit.remove();
  }
 }
 return{sound,vibrate,setMuted,get muted(){return muted;},shake,stamp,burst,fling,confetti};
};
