(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TeaMotion=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const speed=mode=>mode==='walk'?145:225;
  function vector(dx,dy){dx=Number.isFinite(dx)?dx:0;dy=Number.isFinite(dy)?dy:0;const n=Math.hypot(dx,dy);return n?{x:dx/n,y:dy/n}:{x:0,y:0};}
  function step(p,input,seconds,blocked){
    const v=vector(input.dx,input.dy),start={x:p.x,y:p.y};let distance=speed(input.mode)*Math.max(0,Math.min(1,seconds));if(Number.isFinite(input.distance))distance=Math.min(distance,Math.max(0,input.distance));
    const count=Math.max(1,Math.ceil(distance/2)),dx=v.x*distance/count,dy=v.y*distance/count;
    for(let i=0;i<count;i++){if(!blocked(p.x+dx,p.y+dy)){p.x+=dx;p.y+=dy;}else{if(dx&&!blocked(p.x+dx,p.y))p.x+=dx;if(dy&&!blocked(p.x,p.y+dy))p.y+=dy;}}
    const x=p.x-start.x,y=p.y-start.y;return{dx:x,dy:y,distance:Math.hypot(x,y),facing:Math.abs(v.x)>Math.abs(v.y)?v.x<0?'left':'right':v.y<0?'up':'down'};
  }
  function camera(c,p,viewport,world,zoom,dt,snap=false){
    const w=viewport.width/zoom,h=viewport.height/zoom,clamp=(v,max)=>max<0?max/2:Math.max(0,Math.min(max,v));
    const x=clamp(p.x-w/2,world.width-w),y=clamp(p.y-h/2,world.height-h),ease=snap?1:1-Math.exp(-12*Math.min(.1,dt));
    c.x=clamp(c.x+(x-c.x)*ease,world.width-w);c.y=clamp(c.y+(y-c.y)*ease,world.height-h);c.scale=zoom;return c;
  }
  function follow(p,path,mode,seconds,blocked,apply=input=>step(p,input,input.ms/1000,blocked)){
    let remaining=Math.max(0,Math.min(.05,seconds)),distance=0,facing='down';
    while(path.length&&remaining>.000001){const dx=path[0].x-p.x,dy=path[0].y-p.y,length=Math.hypot(dx,dy);if(length<.001){path.shift();continue;}
      const dt=Math.min(remaining,length/speed(mode)),moved=apply({dx,dy,mode,ms:dt*1000,distance:length});distance+=moved.distance||0;facing=moved.facing||facing;remaining-=dt;
      if(Math.hypot(path[0].x-p.x,path[0].y-p.y)<.001)path.shift();else if(!moved.distance){path.length=0;break;}
    }
    return{distance,facing};
  }
  function replay(position,pending,ack,blocked){const p={x:position.x,y:position.y};for(const entry of pending)if(entry.seq>ack)for(const input of entry.samples||[entry])step(p,input,input.ms/1000,blocked);return p;}
  function remote(sample,at,blocked){const p={x:sample.x,y:sample.y},ms=Math.max(0,Math.min(150,at-sample.at)),v=Math.hypot(sample.vx||0,sample.vy||0);if(v)step(p,{dx:sample.vx,dy:sample.vy,mode:'run',distance:v*ms/1000},ms/1000,blocked);return p;}
  return{speed,vector,step,follow,camera,replay,remote};
});
