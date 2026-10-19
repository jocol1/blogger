/* Original canvas artwork and controls; the server alone resolves movement and hits. */
(function(root){
  'use strict';
  const ACTIONS=['punch','kick','dash'];
  const KEY_MOVES={KeyW:[0,-1],ArrowUp:[0,-1],KeyS:[0,1],ArrowDown:[0,1],KeyA:[-1,0],ArrowLeft:[-1,0],KeyD:[1,0],ArrowRight:[1,0]};
  const KEY_ACTIONS={KeyJ:'punch',Space:'punch',KeyK:'kick',ShiftLeft:'dash',ShiftRight:'dash'};
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
  const nameOf=player=>String(player?.name||player?.nickname||'Guest');
  root.TeaBrawlUI=function({canvas,controls,myId,t,send,connected=()=>true,avatars=()=>[],onMessage=()=>{}}){
    const ctx=canvas.getContext('2d'),reduced=root.matchMedia('(prefers-reduced-motion: reduce)');
    const stick=controls.querySelector('#brawl-stick'),knob=stick?.querySelector('.brawl-stick-knob');
    const buttons=Object.fromEntries(ACTIONS.map(action=>[action,controls.querySelector('#brawl-'+action)]));
    const keys=new Set(),heldPointers=new Map(),seenEffects=new Set(),effects=[],positions=new Map();
    let fight=null,fightId=null,offset=0,seq=0,lastSent=-Infinity,lastHeartbeat=-Infinity,lastRender=performance.now();
    let axis={x:0,y:0},stickPointer=null,queued=[],mustStop=false,lastVector={x:0,y:0},focused=true,camera=null;
    let resizeWidth=0,resizeHeight=0,animationFrame=0,wasPlayable=false;
    const background=document.createElement('canvas');background.width=800;background.height=520;
    paintFloor(background.getContext('2d'));
    const words=(key,fallback,params={})=>{const value=t(key,params);return value&&value!==key?value:fallback};
    const serverTime=()=>Date.now()+offset;
    const players=()=>fight?.players||fight?.fighters||[];
    const me=()=>players().find(player=>(player.id||player.walletId)===myId());
    const editing=()=>Boolean(document.activeElement?.closest('input,textarea,select,[contenteditable="true"]'));
    const blocked=()=>!focused||document.hidden||editing()||document.body.classList.contains('portrait-blocked')||Boolean(document.querySelector('dialog[open]'));
    const playable=()=>Boolean(fight?.status==='active'&&connected()&&!blocked()&&serverTime()>=fight.startsAt&&serverTime()<fight.endsAt);
    const ownId=player=>player.id||player.walletId;
    function paintFloor(c){
      c.imageSmoothingEnabled=false;c.fillStyle='#4f6341';c.fillRect(0,0,800,520);
      c.fillStyle='#7a8350';c.fillRect(16,18,768,486);c.fillStyle='#a38759';c.fillRect(26,32,748,466);
      for(let y=38;y<492;y+=26)for(let x=32;x<770;x+=40){
        const n=(x*13+y*7)%17;c.fillStyle=['#c7a56b','#d1af77','#cdb078','#c5a169'][n%4];c.fillRect(x,y,38,24);
        c.fillStyle='#dec28b';c.fillRect(x+2,y+1,34,2);if(n<6){c.fillStyle='#bb965f';c.fillRect(x+11,y+17,12,2)}
      }
      c.fillStyle='#dbbd7d';c.fillRect(94,86,612,350);c.fillStyle='#ceb079';c.fillRect(102,94,596,334);
      for(let y=104;y<424;y+=20)for(let x=112;x<690;x+=20){c.fillStyle=((x+y)/20)%2?'#d1b57e':'#d5b985';c.fillRect(x,y,18,18)}
      c.strokeStyle='#e7cd97';c.lineWidth=4;c.strokeRect(118,110,564,294);
      c.strokeStyle='#c29e61';c.lineWidth=3;c.beginPath();c.arc(400,260,76,0,Math.PI*2);c.stroke();
      c.fillStyle='#c29e61';c.fillRect(396,225,8,70);c.fillRect(365,256,70,8);
      // Wooden rails stay at the perimeter; the fighting floor has no hidden obstacles.
      for(const y of [18,494]){c.fillStyle='#503c2d';c.fillRect(10,y,780,10);c.fillStyle='#ad8050';c.fillRect(10,y-4,780,8);c.fillStyle='#d4a874';c.fillRect(10,y-4,780,2)}
      for(const x of [14,774]){c.fillStyle='#563b29';c.fillRect(x,14,12,498);c.fillStyle='#b88b56';c.fillRect(x,14,8,498)}
      for(const x of [18,204,392,580,766])for(const y of [18,488]){c.fillStyle='#60432b';c.fillRect(x-7,y-10,22,26);c.fillStyle='#ceac72';c.fillRect(x-4,y-13,16,8)}
      c.fillStyle='#637b4b';c.fillRect(54,45,47,28);c.fillRect(700,451,43,31);c.fillStyle='#87a263';c.fillRect(61,41,33,23);c.fillRect(708,445,26,24);
      c.fillStyle='#384f36';c.fillRect(60,66,35,5);c.fillRect(706,474,35,5);
      c.fillStyle='#805531';c.fillRect(632,39,62,17);c.fillStyle='#ffdf91';c.fillRect(635,41,56,12);
      c.fillStyle='#76573a';c.font='700 9px "Segoe UI",Arial,sans-serif';c.textAlign='center';c.fillText('LOC LY',663,51);
    }
    function setKnob(){if(knob)knob.style.transform=`translate(${axis.x*25}px,${axis.y*25}px)`}
    function release(sendStop=true){
      keys.clear();heldPointers.clear();queued=[];axis={x:0,y:0};setKnob();
      if(stickPointer!==null&&stick?.hasPointerCapture(stickPointer))try{stick.releasePointerCapture(stickPointer)}catch{}
      stickPointer=null;stick?.classList.remove('dragging');for(const button of Object.values(buttons))button?.classList.remove('pressed');
      if(sendStop&&fight?.status==='active')mustStop=true;
    }
    function queue(action){if(playable()&&queued.length<2)queued.push(action)}
    function cooldown(action,now){const player=me();return Math.max(0,finite(action==='dash'?player?.dashReadyAt:player?.attackReadyAt)-now)}
    function inputTick(){
      const tick=performance.now();if(tick-lastSent<50)return;
      if(mustStop){mustStop=false;if(fight?.status==='active'&&connected()){
        const input={fightId:fight.id,seq:++seq,dx:0,dy:0};if(send(input)!==false){lastSent=tick;lastVector={x:0,y:0};lastHeartbeat=tick}
      }return}
      if(!playable()){if(wasPlayable)release();wasPlayable=false;return}wasPlayable=true;
      let dx=axis.x,dy=axis.y;for(const key of keys){const direction=KEY_MOVES[key];if(direction){dx+=direction[0];dy+=direction[1]}}
      const length=Math.hypot(dx,dy);if(length>1){dx/=length;dy/=length}dx=Math.round(dx*1000)/1000;dy=Math.round(dy*1000)/1000;
      const now=serverTime();let action=queued.shift();
      if(!action){const held=[...heldPointers.values(),...keys].map(value=>KEY_ACTIONS[value]||value);action=held.find(value=>value!=='dash'&&ACTIONS.includes(value)&&cooldown(value,now)===0)}
      if(action&&cooldown(action,now)>0)action=null;
      // Keep motion alive, while idle heartbeats are less frequent than the 20 Hz ceiling.
      if(!action&&dx===lastVector.x&&dy===lastVector.y&&!dx&&!dy&&tick-lastHeartbeat<200)return;
      const input={fightId:fight.id,seq:++seq,dx,dy};if(action){input.action=action;input.requestId=crypto.randomUUID()}
      if(send(input)!==false){lastSent=tick;lastHeartbeat=tick;lastVector={x:dx,y:dy}}
    }
    function pointerAxis(event){
      const rect=stick.getBoundingClientRect(),x=(event.clientX-rect.left-rect.width/2)/(rect.width*.37),y=(event.clientY-rect.top-rect.height/2)/(rect.height*.37),length=Math.hypot(x,y);
      axis={x:length>1?x/length:x,y:length>1?y/length:y};setKnob();
    }
    if(stick){
      stick.tabIndex=0;stick.setAttribute('aria-label',words('brawlMove','Move'));
      stick.addEventListener('pointerdown',event=>{if(!playable()||stickPointer!==null)return;event.preventDefault();stickPointer=event.pointerId;stick.setPointerCapture(event.pointerId);stick.classList.add('dragging');pointerAxis(event)});
      stick.addEventListener('pointermove',event=>{if(event.pointerId===stickPointer){event.preventDefault();pointerAxis(event)}});
      const end=event=>{if(event.pointerId!==stickPointer)return;axis={x:0,y:0};stickPointer=null;setKnob();stick.classList.remove('dragging')};
      stick.addEventListener('pointerup',end);stick.addEventListener('pointercancel',end);stick.addEventListener('lostpointercapture',end);
    }
    for(const action of ACTIONS){const button=buttons[action];if(!button)continue;
      button.addEventListener('pointerdown',event=>{if(!playable())return;event.preventDefault();button.setPointerCapture(event.pointerId);heldPointers.set(event.pointerId,action);button.classList.add('pressed');queue(action)});
      const end=event=>{heldPointers.delete(event.pointerId);if(![...heldPointers.values()].includes(action))button.classList.remove('pressed')};
      button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);
      button.addEventListener('click',event=>{if(event.detail===0)queue(action)});
    }
    root.addEventListener('keydown',event=>{
      if(!fight||(!KEY_MOVES[event.code]&&!KEY_ACTIONS[event.code])||blocked())return;
      event.preventDefault();if(!playable())return;
      if(!keys.has(event.code)&&KEY_ACTIONS[event.code])queue(KEY_ACTIONS[event.code]);keys.add(event.code);
    });
    root.addEventListener('keyup',event=>{if(keys.has(event.code)){event.preventDefault();keys.delete(event.code)}});
    root.addEventListener('blur',()=>{focused=false;release()});root.addEventListener('focus',()=>{focused=true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)release()});
    document.addEventListener('focusin',()=>{if(editing())release()});
    const timer=setInterval(inputTick,25);
    function update(next){
      if(!next){clear();return}const first=next.id!==fightId;
      if(!first&&fight&&finite(next.version)<finite(fight.version))return;
      if(first){release();fightId=next.id;seq=0;positions.clear();seenEffects.clear();effects.length=0;camera=null;mustStop=false;lastSent=-Infinity;lastVector={x:0,y:0}}
      const stamp=performance.now();if(Number.isFinite(next.serverNow))offset=next.serverNow-Date.now();fight=next;
      for(const player of players()){
        const id=ownId(player),old=positions.get(id),at=interpolated(old,stamp);
        const x=finite(player.x,old?.toX??400),y=finite(player.y,old?.toY??260);
        positions.set(id,{fromX:first?x:at.x,fromY:first?y:at.y,toX:x,toY:y,stamp,duration:first?0:100});
      }
      seq=Math.max(seq,finite(me()?.inputSeq));const now=serverTime();
      for(const action of next.actionHistory||[]){const actionId=action.id||`${action.playerId}:${action.at}:${action.type}`;if(seenEffects.has(actionId))continue;seenEffects.add(actionId);
        if(now-action.at>650||action.at>now+150)continue;const player=players().find(p=>ownId(p)===action.playerId);if(!player)continue;
        effects.push({...action,id:actionId,x:finite(player.x),y:finite(player.y),fx:finite(player.facingX,1),fy:finite(player.facingY),created:stamp});
      }
      if(seenEffects.size>160){const latest=[...seenEffects].slice(-80);seenEffects.clear();latest.forEach(id=>seenEffects.add(id))}
      if(next.status!=='active'||!connected())release();canvas.setAttribute('aria-label',players().map(nameOf).join(' vs ')+' — '+words('brawlControlsHint','Move and time your punches.'));
    }
    function interpolated(row,stamp){if(!row)return{x:400,y:260};const amount=clamp((stamp-row.stamp)/Math.max(1,row.duration),0,1);return{x:row.fromX+(row.toX-row.fromX)*amount,y:row.fromY+(row.toY-row.fromY)*amount}}
    function drawFighter(player,point,time){
      const id=ownId(player),mine=id===myId(),now=serverTime(),hit=finite(player.hitUntil)>now;
      const avatar=avatars().find(row=>(row.walletId||row.id)===id)||player;
      const moving=positions.get(id),walking=Boolean(moving&&Math.hypot(moving.toX-moving.fromX,moving.toY-moving.fromY)>1);
      const fx=finite(player.facingX,id===ownId(players()[0])?1:-1),fy=finite(player.facingY),angle=Math.atan2(fy,fx),px=point.x,py=point.y;
      ctx.save();ctx.globalAlpha=.24;ctx.fillStyle=mine?'#34666a':'#943e34';ctx.beginPath();ctx.ellipse(px,py+19,33,13,0,0,Math.PI*2);ctx.fill();ctx.restore();
      // The floor marker keeps identity and facing visible, including for color blindness.
      ctx.strokeStyle=mine?'#e5f3dd':'#f9d299';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(px,py+18,31,12,0,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle=mine?'#527c74':'#a36844';ctx.beginPath();ctx.moveTo(px+Math.cos(angle)*40,py+13+Math.sin(angle)*24);ctx.lineTo(px+Math.cos(angle+.55)*30,py+13+Math.sin(angle+.55)*18);ctx.lineTo(px+Math.cos(angle-.55)*30,py+13+Math.sin(angle-.55)*18);ctx.closePath();ctx.fill();
      if(!reduced.matches&&finite(player.dashUntil)>now){ctx.save();ctx.globalAlpha=.3;for(let i=1;i<=3;i++){ctx.fillStyle=mine?'#e6f1c3':'#ffe0a2';ctx.fillRect(px-fx*i*14-18,py-fy*i*14-36,34,32)}ctx.restore()}
      ctx.save();if(hit&&!reduced.matches&&Math.floor(time/55)%2)ctx.globalAlpha=.5;
      if(root.TeaScene?.avatar)root.TeaScene.avatar(ctx,px,py,avatar,1.9,false,walking,time);
      else{ctx.fillStyle=mine?'#6e9e7a':'#bd7052';ctx.fillRect(px-22,py-51,44,53);ctx.fillStyle='#f1c08c';ctx.fillRect(px-17,py-82,34,31)}
      ctx.restore();
      // A small glove shows which way the fighter is pointing without replacing cosmetics.
      const gloveX=px+Math.cos(angle)*25,gloveY=py-9+Math.sin(angle)*18;ctx.fillStyle='#553b2c';ctx.fillRect(gloveX-9,gloveY-8,18,16);ctx.fillStyle=mine?'#87b2a1':'#da9671';ctx.fillRect(gloveX-7,gloveY-6,14,11);ctx.fillStyle='#f4d3a0';ctx.fillRect(gloveX-5,gloveY-6,10,3);
      const name=nameOf(player);ctx.font='700 17px "Segoe UI",Arial,sans-serif';ctx.textAlign='center';
      let label=name;while(ctx.measureText(label).width>170&&label.length>2)label=label.slice(0,-2)+'…';
      const width=Math.max(44,ctx.measureText(label).width+20);ctx.fillStyle=mine?'#365c48':'#694d39';ctx.fillRect(px-width/2,py-116,width,26);ctx.fillStyle='#fff0ca';ctx.fillText(label,px,py-97);
      if(mine){ctx.fillStyle='#fff0ca';ctx.font='700 10px "Segoe UI",sans-serif';ctx.fillText(words('brawlYou','YOU'),px,py+47)}
      if(hit){ctx.fillStyle='#fff5a2';ctx.font='900 24px "Segoe UI",sans-serif';ctx.fillText('✦',px+29,py-67)}
    }
    function drawEffect(effect,time){
      const age=(time-effect.created)/650;if(age>1)return;const attacker=players().find(p=>ownId(p)===effect.playerId);if(!attacker)return;
      const point=interpolated(positions.get(effect.playerId),time),angle=Math.atan2(effect.fy,effect.fx),reach=effect.type==='kick'?91:67;
      if(effect.type==='dash')return;const target=effect.targetId&&positions.get(effect.targetId),to=target?interpolated(target,time):null;
      ctx.save();const intensity=1-age;ctx.globalAlpha=reduced.matches?intensity:Math.min(1,intensity*1.4);
      ctx.strokeStyle=effect.hit?'#fff2ad':'#f8e8c3';ctx.lineWidth=effect.type==='kick'?11:8;
      ctx.beginPath();ctx.arc(effect.x,effect.y-10,reach,angle-.7,angle+.7);ctx.stroke();
      const x=effect.x+Math.cos(angle)*reach,y=effect.y-10+Math.sin(angle)*reach;
      ctx.fillStyle=effect.type==='kick'?'#78543a':'#d67b52';ctx.fillRect(x-12,y-9,24,18);ctx.fillStyle='#f0c18c';ctx.fillRect(x-9,y-7,16,5);
      const label=effect.hit?words('brawlHit','HIT!'):words('brawlMiss','MISS');
      ctx.font='900 18px "Segoe UI",Arial,sans-serif';ctx.textAlign='center';const labelX=effect.hit&&to?to.x:point.x,labelY=(effect.hit&&to?to.y:point.y)-133-(reduced.matches?0:age*18);
      ctx.lineWidth=5;ctx.strokeStyle='#704a2d';ctx.strokeText(label,labelX,labelY);ctx.fillStyle=effect.hit?'#fff2a1':'#fff1d5';ctx.fillText(label,labelX,labelY);ctx.restore();
    }
    function drawMessage(text,detail,width,height){
      // A ribbon above the floor; the center and both fighters remain unobstructed.
      ctx.font='900 22px "Segoe UI",Arial,sans-serif';ctx.textAlign='center';const w=Math.min(width-16,Math.max(120,ctx.measureText(text).width+34));
      ctx.fillStyle='#3b5135ed';ctx.fillRect((width-w)/2,9,w,38);ctx.fillStyle='#ffebad';ctx.fillText(text,width/2,35);
      if(detail){ctx.font='600 12px "Segoe UI",Arial,sans-serif';ctx.fillStyle='#fbefcd';ctx.fillText(detail,width/2,62)}
    }
    function render(time=performance.now(),schedule=true){
      if(schedule)animationFrame=requestAnimationFrame(render);if(!fight||!players().length||canvas.closest('[hidden]'))return;
      const rect=canvas.getBoundingClientRect(),width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));if(width<10||height<10)return;
      const dpr=Math.min(2,root.devicePixelRatio||1);if(width!==resizeWidth||height!==resizeHeight){resizeWidth=width;resizeHeight=height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr)}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,width,height);ctx.fillStyle='#4f6341';ctx.fillRect(0,0,width,height);
      const points=players().map(player=>({...interpolated(positions.get(ownId(player)),time),player}));
      const left=Math.min(...points.map(point=>point.x)),right=Math.max(...points.map(point=>point.x)),top=Math.min(...points.map(point=>point.y)),bottom=Math.max(...points.map(point=>point.y));
      const target={x:clamp((left+right)/2,200,600),y:clamp((top+bottom)/2-32,150,350)};
      // Frame the name and hit text above the sprite, and the identity tag below its feet.
      target.spanX=Math.max(530,2*Math.max(target.x-left+115,right+115-target.x));
      target.spanY=Math.max(340,2*Math.max(target.y-top+180,bottom+64-target.y));
      const scale=Math.min(width/target.spanX,height/target.spanY),targetScale=Math.min(1.8,scale);const dt=Math.min(50,time-lastRender);lastRender=time;
      if(!camera||reduced.matches)camera={x:target.x,y:target.y,scale:targetScale};else{const ease=1-Math.exp(-dt/115);camera.x+=(target.x-camera.x)*ease;camera.y+=(target.y-camera.y)*ease;camera.scale+=(targetScale-camera.scale)*ease}
      camera.scale=Math.min(camera.scale,width/(2*Math.max(camera.x-left+115,right+115-camera.x)),height/(2*Math.max(camera.y-top+180,bottom+64-camera.y)));
      ctx.save();ctx.translate(width/2-camera.x*camera.scale,height/2-camera.y*camera.scale);ctx.scale(camera.scale,camera.scale);ctx.drawImage(background,0,0);
      points.sort((a,b)=>a.y-b.y).forEach(point=>drawFighter(point.player,point,time));for(const effect of effects)drawEffect(effect,time);ctx.restore();
      while(effects.length&&time-effects[0].created>700)effects.shift();
      const now=serverTime();if(!connected())drawMessage(words('brawlOffline','Reconnecting…'),' ',width,height);
      else if(fight.status==='active'&&now<fight.startsAt){const seconds=Math.max(1,Math.ceil((fight.startsAt-now)/1000));drawMessage(String(seconds),words('brawlReady','Get ready!',{seconds}),width,height)}
      else if(fight.status==='finished')drawMessage(words('brawlResult','Round finished'),' ',width,height);
      else if(fight.status==='active'&&now-fight.startsAt<650)drawMessage(words('brawlFightStart','FIGHT!'),' ',width,height);
      const touchUi=innerWidth<=900,help=document.getElementById('brawl-help'),instruction=words(touchUi?'brawlTouchHint':'brawlControlsHint','Move and time your attacks.');if(help&&help.textContent!==instruction)help.textContent=instruction;stick?.setAttribute('aria-label',words('brawlMove','Move'));
      controls.classList.toggle('offline',!connected());const available=playable();for(const action of ACTIONS){const button=buttons[action];if(!button)continue;const remaining=cooldown(action,now),total=action==='dash'?1800:action==='kick'?850:450;
        const hint=button.querySelector('small'),hintText=touchUi?words('brawl'+action[0].toUpperCase()+action.slice(1)+'Info',action):{punch:'J / SPACE',kick:'K',dash:'SHIFT'}[action];if(hint&&hint.textContent!==hintText)hint.textContent=hintText;
        button.disabled=!available;button.classList.toggle('cooling',remaining>0);button.style.setProperty('--cooldown',clamp(remaining/total*100,0,100)+'%');
        button.classList.toggle('pressed',[...heldPointers.values()].includes(action)||[...keys].some(key=>KEY_ACTIONS[key]===action));
        button.setAttribute('aria-label',words('brawl'+action[0].toUpperCase()+action.slice(1),action)+(remaining>0?' ('+(remaining/1000).toFixed(1)+'s)':''));
      }
    }
    function clear(){release();fight=null;fightId=null;positions.clear();effects.length=0;seenEffects.clear();camera=null;wasPlayable=false;mustStop=false;for(const button of Object.values(buttons))if(button){button.disabled=true;button.style.setProperty('--cooldown','0%')}}
    animationFrame=requestAnimationFrame(render);
    return{update,clear,pause:release,render:()=>render(performance.now(),false),destroy(){clear();clearInterval(timer);cancelAnimationFrame(animationFrame)}};
  };
})(window);
