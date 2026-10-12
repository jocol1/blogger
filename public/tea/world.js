/* Shared geometry keeps the painted furniture and server collision in agreement. */
(function (root) {
  const layout = [
    ['t1',110,225,2], ['t2',335,225,4], ['t3',650,225,8], ['t4',864,225,2],
    ['t5',110,445,4], ['t6',415,445,8], ['t7',690,445,2], ['t8',860,445,4],
  ];
  const TABLES = layout.map(([id,x,y,capacity]) => {
    const offsets = capacity===2 ? [[-62,0],[62,0]] : capacity===4 ? [[0,-66],[72,0],[0,66],[-72,0]] : [[-46,-66],[46,-66],[92,-24],[92,24],[46,66],[-46,66],[-92,24],[-92,-24]];
    return {id,x,y,capacity,size:capacity===2?'small':capacity===4?'medium':'large',width:capacity===8?142:capacity===4?96:72,height:capacity===8?76:capacity===4?74:62,seats:offsets.map(([dx,dy],i)=>({id:`${id}-${i+1}`,x:x+dx,y:y+dy}))};
  });
  function blocked(x,y,tables=TABLES) {
    return x<26||x>934||y<76||y>606||(x>350&&x<610&&y<135)||tables.some(t=>Math.abs(x-t.x)<t.width/2+19&&Math.abs(y-t.y)<t.height/2+17);
  }
  function clearLine(a,b,tables) {
    const steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/6);
    for(let i=1;i<=steps;i++)if(blocked(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps,tables))return false;
    return true;
  }
  function findPath(start,end,tables=TABLES) {
    if(blocked(end.x,end.y,tables))return [];
    if(clearLine(start,end,tables))return [end];
    const step=16,cols=60,rows=40,nearest=point=>{
      let best=null,distance=Infinity;
      for(let y=5;y<38;y++)for(let x=2;x<59;x++){const p={x:x*step,y:y*step};if(blocked(p.x,p.y,tables)||!clearLine(point,p,tables))continue;const d=Math.hypot(p.x-point.x,p.y-point.y);if(d<distance){best=y*cols+x;distance=d}}
      return best;
    };
    const first=nearest(start),last=nearest(end);if(first===null||last===null)return [];
    const queue=[first],parents=new Map([[first,null]]),point=id=>({x:(id%cols)*step,y:Math.floor(id/cols)*step});
    for(let i=0;i<queue.length&&!parents.has(last);i++){
      const id=queue[i],p=point(id),x=id%cols,y=Math.floor(id/cols);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
        const nx=x+dx,ny=y+dy,next=ny*cols+nx;if(nx<0||nx>=cols||ny<0||ny>=rows||parents.has(next)||!clearLine(p,point(next),tables))continue;
        parents.set(next,id);queue.push(next);
      }
    }
    if(!parents.has(last))return [];
    const path=[end];for(let id=last;id!==null;id=parents.get(id))path.unshift(point(id));
    const simplified=[];let anchor=start;
    for(let i=0;i<path.length;){let next=i;while(next+1<path.length&&clearLine(anchor,path[next+1],tables))next++;simplified.push(path[next]);anchor=path[next];i=next+1}
    return simplified;
  }
  const api={TABLES,blocked,findPath,clearLine};if(typeof module!=='undefined')module.exports=api;else root.TeaWorld=api;
})(typeof window!=='undefined'?window:globalThis);
