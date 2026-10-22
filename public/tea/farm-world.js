(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TeaFarmWorld=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const width=2000,height=1400,maxPlots=24,maxPonds=12;
  const plotPos=i=>({x:130+(i%4)*110+(i>=12?1000:0),y:290+Math.floor(i%12/4)*90});
  const fishPos=i=>({x:720+(i%2)*110+(i>=6?685:0),y:290+Math.floor(i%6/2)*90+(i>=6?600:0)});
  const ponds=[{x:648,y:225,w:258,h:297},{x:1333,y:825,w:258,h:297}];
  const orchard=Array.from({length:8},(_,i)=>({x:220+(i%4)*160,y:920+Math.floor(i/4)*190}));
  const places=[
    {id:'home',en:'Home garden',vi:'Vườn nhà',x:540,y:550},
    {id:'east',en:'East fields',vi:'Ruộng phía đông',x:1540,y:540},
    {id:'pond',en:'Home pond',vi:'Ao nhà',x:620,y:400},
    {id:'lake',en:'South pond',vi:'Ao phía nam',x:1465,y:1140},
    {id:'orchard',en:'Orchard',vi:'Vườn cây',x:540,y:1220},
    {id:'market',en:'Farm market',vi:'Chợ nông trại',x:1730,y:540},
  ];
  const plots=Array.from({length:maxPlots},(_,i)=>plotPos(i));
  function blocked(x,y){return x<75||x>width-70||y<220||y>height-75||
    ponds.some(p=>x>p.x&&x<p.x+p.w&&y>p.y&&y<p.y+p.h)||
    plots.some(p=>Math.abs(x-p.x)<45&&Math.abs(y-p.y)<32)||
    orchard.some(p=>Math.abs(x-p.x)<17&&Math.abs(y-p.y)<16)||
    (x>1660&&x<1850&&y>330&&y<460)||
    (x>365&&x<665&&y<224);}
  return {width,height,maxPlots,maxPonds,plotPos,fishPos,blocked,ponds,places,orchard};
});
