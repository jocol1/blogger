(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TeaFarmMotion=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
  function clear(a,b,blocked){const steps=Math.max(1,Math.ceil(distance(a,b)/3));for(let i=1;i<=steps;i++)if(blocked(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps))return false;return true;}
  function findPath(origin,target,blocked){
    const step=20,near=point=>{const cells=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const cell={x:(Math.round(point.x/step)+dx)*step,y:(Math.round(point.y/step)+dy)*step};if(!blocked(cell.x,cell.y)&&clear(point,cell,blocked))cells.push(cell);}return cells.sort((a,b)=>distance(point,a)-distance(point,b))[0];};
    if(blocked(target.x,target.y))return [];
    if(clear(origin,target,blocked))return [{...target}];
    const start=near(origin),end=near(target);if(!start||!end)return [];
    const key=p=>`${p.x},${p.y}`,queue=[start],prev=new Map([[key(start),null]]);let found;
    for(let n=0;n<queue.length&&n<2000;n++){
      const at=queue[n];if(key(at)===key(end)){found=at;break;}
      for(const [dx,dy] of [[step,0],[-step,0],[0,step],[0,-step]]){const next={x:at.x+dx,y:at.y+dy};if(!prev.has(key(next))&&!blocked(next.x,next.y)&&clear(at,next,blocked)){prev.set(key(next),at);queue.push(next);}}
    }
    if(!found)return [];
    const points=[target];while(found){points.push(found);found=prev.get(key(found));}points.reverse();
    const result=[];let anchor=origin,index=0;
    while(index<points.length){let last=points.length-1;while(last>index&&!clear(anchor,points[last],blocked))last--;result.push(points[last]);anchor=points[last];index=last+1;}
    return result;
  }
  function follow(player,path,budget,blocked){
    let travelled=0,dx=0,dy=0;
    while(path.length&&budget>0){const point=path[0],length=distance(player,point);if(length<.001){path.shift();continue;}
      const amount=Math.min(budget,length),next={x:player.x+(point.x-player.x)/length*amount,y:player.y+(point.y-player.y)/length*amount};
      if(!clear(player,next,blocked)){path.length=0;break;}
      dx=next.x-player.x;dy=next.y-player.y;Object.assign(player,next);travelled+=amount;budget-=amount;if(amount===length)path.shift();
    }
    return {travelled,dx,dy};
  }
  return {findPath,follow,clear};
});
