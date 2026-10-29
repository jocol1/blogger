window.TeaCafeWalker=({canvas,keys,state,myId,connected,allowed,locale,send})=>{
  const blocked=(x,y)=>TeaWorld.blocked(x,y,state()?.room?.tables||[]),prediction=TeaPrediction(blocked),remote=new Map();
  let path=[],ready=false,seat,wasMoving=false,lastFrame=0,facing='down',stride=0,walking=false,display={x:480,y:540},cameraReady=false;
  const camera={x:0,y:0,scale:1},controls=TeaWalkControls({canvas,keys,locale,allowed:()=>connected()&&allowed()&&!seat,cancel:()=>{path=[];}});
  function reset(guest,reconnect=false){controls.reset();ready=Boolean(guest);seat=guest?.seatId||null;wasMoving=false;walking=false;lastFrame=0;if(guest){prediction.reset(guest,!reconnect);display={x:guest.x,y:guest.y};facing=guest.facing||facing;}cameraReady=false;}
  function snapshot(reconnect=false){const guest=state()?.guests.find(g=>g.walletId===myId());if(reconnect)remote.clear();if(reconnect||!ready||seat!==(guest?.seatId||null))reset(guest,reconnect);const ids=new Set();for(const g of state()?.guests||[]){ids.add(g.walletId);const r=remote.get(g.walletId);if(!r||r.seat!==g.seatId)remote.set(g.walletId,{seat:g.seatId,rows:[{...g,at:performance.now(),vx:0,vy:0}],stride:0,facing:g.facing||'down',display:{x:g.x,y:g.y}});}for(const id of remote.keys())if(!ids.has(id))remote.delete(id);}
  function receive(move){if(move.walletId===myId()){if(ready&&!seat)prediction.ack(move);return;}let r=remote.get(move.walletId);if(!r)return;const at=performance.now(),last=r.rows.at(-1),seconds=Math.max(.016,(at-last.at)/1000);r.rows.push({...move,at,vx:move.vx??(move.x-last.x)/seconds,vy:move.vy??(move.y-last.y)/seconds});if(r.rows.length>8)r.rows.shift();if(move.facing)r.facing=move.facing;}
  function tick(time){const dt=lastFrame?Math.min(.05,Math.max(0,(time-lastFrame)/1000)):0;lastFrame=time;if(!ready)return;if(!connected()){controls.reset();walking=false;return;}if(!allowed())controls.reset();
    const v=controls.vector();let input={dx:v.x,dy:v.y,ms:dt*1000,mode:controls.mode};
    if(v.x||v.y)path=[];
    const moving=Boolean(input.dx||input.dy||path.length)&&!seat&&allowed();if(!moving){input.dx=0;input.dy=0;}
    walking=false;if(dt&&(moving||wasMoving)){const moved=path.length&&moving?TeaMotion.follow(prediction.position,path,controls.mode,dt,blocked,sample=>prediction.step(sample)):prediction.step(input);walking=moved.distance>.001;stride+=moved.distance||0;if(moving&&moved.facing)facing=moved.facing;}
    const packet=prediction.packet(time);if(packet)send(packet);
    wasMoving=moving;display=prediction.visual(dt,matchMedia('(prefers-reduced-motion: reduce)').matches);
    canvas.dataset.playerX=display.x.toFixed(2);canvas.dataset.playerY=display.y.toFixed(2);
  }
  function pose(g,time){if(g.walletId===myId())return{...g,...display,facing,stride,walking};const r=remote.get(g.walletId);if(!r||g.seatId)return g;const at=time-75,rows=r.rows;let p=rows[0];for(let i=1;i<rows.length;i++){if(rows[i].at>=at){const a=rows[i-1],b=rows[i],t=Math.max(0,Math.min(1,(at-a.at)/(b.at-a.at||1)));p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};break;}p=TeaMotion.remote(rows[i],at,blocked);}const distance=Math.hypot(p.x-r.display.x,p.y-r.display.y);if(distance>.01&&!rows.at(-1).facing)r.facing=Math.abs(p.x-r.display.x)>Math.abs(p.y-r.display.y)?p.x>r.display.x?'right':'left':p.y>r.display.y?'down':'up';r.stride+=distance;r.display=p;return{...g,...p,facing:r.facing,stride:r.stride,walking:distance>.01};}
  return {controls,tick,snapshot,receive,reset:()=>reset(null,true),pose,
    walkTo(destination){if(!ready||seat||!connected()||!allowed())return false;controls.reset();path=TeaFarmMotion.findPath(prediction.position,destination,blocked);return path.length>0;},
    view(rect,dt,reduced){TeaMotion.camera(camera,display,rect,{width:960,height:640},controls.zoom,dt,!cameraReady||reduced);cameraReady=true;return{scale:camera.scale,tx:-camera.x*camera.scale,ty:-camera.y*camera.scale};}
  };
};
