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
    {id:'barn',en:'Chicken & pig pens',vi:'Chuồng gà · heo',x:980,y:890},
  ];
  function blocked(x,y){return x<75||x>width-70||y<220||y>height-75||
    ponds.some(p=>x>p.x&&x<p.x+p.w&&y>p.y&&y<p.y+p.h)||
    orchard.some(p=>Math.abs(x-p.x)<17&&Math.abs(y-p.y)<16)||
    (x>1080&&x<1315&&y>710&&y<865)||
    (x>1660&&x<1850&&y>330&&y<460)||
    (x>365&&x<665&&y<224);}
  const clock=()=>typeof performance!=='undefined'?performance.now():Date.now();
  const roam=(slot,time)=>{const s=time/1000,a=s/11+slot*3.1,b=s/3.7+slot,c=s/8.3+slot*1.9,d=s/2.9+slot*2;return{x:925+Math.sin(a)*95+Math.sin(b)*14,y:805+Math.sin(c)*38+Math.sin(d)*5,dx:Math.cos(a)*95/11+Math.cos(b)*14/3.7};};
  const chickenMood=(slot,time=clock())=>{const m=roam(slot,time);return{flip:m.dx<0,peck:Math.abs(m.dx)<2.5};};
  const animalPos=(kind,slot,time=clock())=>{if(kind==='chicken'){const m=roam(slot,time);return{x:m.x,y:m.y};}return{x:1145+slot*110,y:810};};
  function targets(farm){
    const result=[],now=clock();
    (farm?.plots||[]).forEach((_,slot)=>{const p=plotPos(slot);result.push({id:`garden:${slot}`,panel:'garden',slot,x:p.x,y:p.y+43,look:p,hit:{x:p.x-48,y:p.y-36,w:96,h:72}});});
    (farm?.ponds||[]).forEach((_,slot)=>{const p=fishPos(slot);result.push({id:`pond:${slot}`,panel:'pond',slot,x:620+(slot>=6?685:0),y:p.y,look:p,hit:{x:p.x-52,y:p.y-42,w:104,h:84}});});
    for(const kind of ['chicken','pig'])for(let slot=0;slot<2;slot++){const p=animalPos(kind,slot,now),free=kind==='chicken';result.push({id:`${kind}:${slot}`,panel:kind,slot,x:p.x,y:free?p.y+34:890,look:p,hit:free?{x:p.x-40,y:p.y-40,w:80,h:85}:{x:p.x-50,y:730,w:100,h:135}});}
    for(let site=0;site<2;site++)result.push({id:`fishing:${site}`,panel:'fishing',site,x:780+685*site,y:540+600*site,look:{x:780+685*site,y:420+600*site},hit:{x:738+685*site,y:468+600*site,w:102,h:90}});
    result.push(
      {id:'shop',panel:'shop',x:1730,y:500,hit:{x:1640,y:300,w:230,h:180}},
      {id:'bag',panel:'bag',x:1815,y:550,hit:{x:1770,y:480,w:90,h:85}},
      {id:'quests',panel:'quests',x:650,y:850,hit:{x:590,y:740,w:120,h:110}},
      {id:'decorate',panel:'decorate',x:520,y:235,hit:{x:390,y:90,w:250,h:120}}
    );return result;
  }
  function nearest(player,farm,preferred){const near=targets(farm).filter(t=>Math.hypot(t.x-player.x,t.y-player.y)<=56);return near.find(t=>t.id===preferred)||near.sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0]||null;}
  function hitAt(x,y,farm){return targets(farm).find(t=>x>=t.hit.x&&x<=t.hit.x+t.hit.w&&y>=t.hit.y&&y<=t.hit.y+t.hit.h)||null;}
  return {width,height,maxPlots,maxPonds,plotPos,fishPos,blocked,ponds,places,orchard,animalPos,chickenMood,targets,nearest,hitAt};
});
