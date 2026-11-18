/* The café in 3D: a toy-like Three.js scene laid over the same 960×640 world the server uses for collision.
   World (x, y) maps to X = (x-480)/40 and Z = (y-320)/40, with the ground at Y = 0. Everything is drawn locally. */
window.TeaScene3D=(()=>{
  'use strict';
  const api={supported:false,onPose:null,init:()=>false};
  if(typeof THREE==='undefined')return api;
  const U=1/40,PI=Math.PI,X=x=>(x-480)*U,Z=y=>(y-320)*U,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const rng=(x,y)=>{const n=Math.sin(x*12.9898+y*78.233)*43758.5453;return n-Math.floor(n)};
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const HAIR=['#211713','#523322','#8c562f','#c98b45','#e9c879','#792f30','#342b54','#1d1c1b'];
  const SHIRT=['#df6041','#517bb8','#5f914e','#e0ac36','#9d5fa6','#4c8d89','#e58a9a','#ded7c6'];
  const SHOES=['#31251f','#7c3a2c','#33405e','#eeeeea','#795a37','#263932'];
  const SEAT_COLORS=['#4f8fb0','#d4573f','#62a05a','#e2a43f'],SKIN='#f4c896',PANTS='#4d5853',INK='#3a2a24';
  const ACTIVITY={xiangqi:['帥','#3f8a5f'],quiz:['?','#3f8a5f'],math:['÷','#3f8a5f'],pattern:['◇','#3f8a5f'],tienlen:['♠','#4a78ad'],color:['▤','#4a78ad'],baicao:['♣','#4a78ad'],poker:['♦','#4a78ad'],barista:['☕','#c27a2f'],drawing:['✎','#c27a2f'],rps:['✌','#c27a2f'],memory:['▧','#c27a2f']};
  const RANK_COLORS=['#8d8d8d','#6fb36a','#e0b43f','#e08a3a','#d94f3d','#9b6bd1'];

  // ---------- shared materials and geometry (cached, never disposed) ----------
  const GRAD=(()=>{const t=new THREE.DataTexture(new Uint8Array([110,190,255]),3,1,THREE.RedFormat);t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t})();
  const mats=new Map(),geos=new Map();
  const cached=(map,key,make)=>{let v=map.get(key);if(!v){v=make();map.set(key,v)}return v};
  const mat=(color,o)=>cached(mats,'l'+color+(o?JSON.stringify(o):''),()=>new THREE.MeshLambertMaterial({color,...o}));
  const toon=color=>cached(mats,'t'+color,()=>new THREE.MeshToonMaterial({color,gradientMap:GRAD}));
  const OUTLINE=new THREE.MeshBasicMaterial({color:INK,side:THREE.BackSide});
  const BLOB=new THREE.MeshBasicMaterial({color:'#2d2418',transparent:true,opacity:.22,depthWrite:false});
  const box=(w,h,d)=>cached(geos,`b${w},${h},${d}`,()=>new THREE.BoxGeometry(w,h,d));
  const cyl=(rt,rb,h,s=16)=>cached(geos,`c${rt},${rb},${h},${s}`,()=>new THREE.CylinderGeometry(rt,rb,h,s));
  const sph=(r,s=18)=>cached(geos,`s${r},${s}`,()=>new THREE.SphereGeometry(r,s,Math.round(s*.7)));
  const cap=(r,l)=>cached(geos,`p${r},${l}`,()=>new THREE.CapsuleGeometry(r,l,4,12));
  const plane=(w,h)=>cached(geos,`q${w},${h}`,()=>new THREE.PlaneGeometry(w,h));
  const disc=r=>cached(geos,`d${r}`,()=>new THREE.CircleGeometry(r,24));
  const dome=(r,t)=>cached(geos,`h${r},${t}`,()=>new THREE.SphereGeometry(r,20,10,0,PI*2,0,t));
  function roundBox(w,h,d,r=.04){return cached(geos,`r${w},${h},${d},${r}`,()=>{
    r=Math.max(.004,Math.min(r,w/2.2,h/2.2,d/2.2));const sw=w-2*r,sh=h-2*r,k=Math.min(r,sw/2,sh/2),s=new THREE.Shape(),x=-sw/2,y=-sh/2;
    s.moveTo(x+k,y);s.lineTo(x+sw-k,y);s.quadraticCurveTo(x+sw,y,x+sw,y+k);s.lineTo(x+sw,y+sh-k);s.quadraticCurveTo(x+sw,y+sh,x+sw-k,y+sh);
    s.lineTo(x+k,y+sh);s.quadraticCurveTo(x,y+sh,x,y+sh-k);s.lineTo(x,y+k);s.quadraticCurveTo(x,y,x+k,y);
    const g=new THREE.ExtrudeGeometry(s,{depth:Math.max(.001,d-2*r),bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:2,curveSegments:3});g.center();return g;
  })}
  function mesh(g,m,x=0,y=0,z=0,parent=null,shadow=true){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);if(shadow){o.castShadow=true;o.receiveShadow=true}if(parent)parent.add(o);return o}
  function outline(m,s=1.07){const o=new THREE.Mesh(m.geometry,OUTLINE);o.position.copy(m.position);o.rotation.copy(m.rotation);o.scale.copy(m.scale).multiplyScalar(s);m.parent.add(o);return o}
  function canvasTex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
  function roundRect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()}
  const FONT='"Segoe UI",system-ui,sans-serif';
  function signTex(text,bg,fg,w=512,h=96){return canvasTex(w,h,(g)=>{g.fillStyle=bg;roundRect(g,0,0,w,h,18);g.fill();g.fillStyle=fg;g.font=`800 ${Math.round(h*.46)}px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.fillText(text,w/2,h/2+2)})}

  // ---------- faces ----------
  function faceTex(happy){return canvasTex(128,128,(g)=>{
    g.fillStyle='rgba(240,128,116,.5)';for(const x of [30,98]){g.beginPath();g.ellipse(x,86,12,7,0,0,PI*2);g.fill()}
    g.fillStyle='#2b211d';g.strokeStyle='#2b211d';g.lineCap='round';
    if(happy){g.lineWidth=7;for(const x of [44,84]){g.beginPath();g.arc(x,70,10,PI*1.1,PI*1.9);g.stroke()}}
    else for(const x of [44,84]){g.beginPath();g.ellipse(x,64,9,12,0,0,PI*2);g.fill();g.fillStyle='#fff';g.beginPath();g.arc(x+3,58,3.6,0,PI*2);g.fill();g.fillStyle='#2b211d'}
    g.strokeStyle='#8a3f31';g.lineWidth=4.5;g.beginPath();g.arc(64,84,happy?9:6,PI*.15,PI*.85);g.stroke();
  })}
  const FACE={open:new THREE.MeshBasicMaterial({map:faceTex(false),transparent:true,depthWrite:false}),happy:new THREE.MeshBasicMaterial({map:faceTex(true),transparent:true,depthWrite:false})};

  // ---------- chibi people ----------
  const styleOf=p=>({hair:p.hairColor||HAIR[p.hair||0]||HAIR[0],shirt:p.shirtColor||SHIRT[p.clothes||0]||SHIRT[0],shoes:SHOES[p.shoes||0]||SHOES[0],hat:(p.hair||0)%3===1});
  const signature=p=>{const s=styleOf(p);return`${s.hair}|${s.shirt}|${s.shoes}|${s.hat}`};
  function makeAvatar(profile,shadows=true){
    const s=styleOf(profile),root=new THREE.Group(),body=new THREE.Group();root.add(body);
    const blob=mesh(disc(.34),BLOB,0,.015,0,root,false);blob.rotation.x=-PI/2;blob.visible=!shadows;blob.renderOrder=1;
    const legs=[-1,1].map(side=>{const hip=new THREE.Group();hip.position.set(side*.085,.3,0);body.add(hip);mesh(cyl(.066,.06,.26,10),toon(PANTS),0,-.13,0,hip);const shoe=mesh(sph(1,12),toon(s.shoes),0,-.27,.03,hip);shoe.scale.set(.078,.058,.11);return hip});
    const torso=mesh(cap(.185,.17),toon(s.shirt),0,.53,0,body);outline(torso,1.09);
    mesh(cyl(.1,.12,.05,14),toon(SKIN),0,.79,0,body,false);
    const arms=[-1,1].map(side=>{const shoulder=new THREE.Group();shoulder.position.set(side*.215,.68,0);shoulder.rotation.z=side*.14;body.add(shoulder);mesh(cap(.056,.15),toon(s.shirt),0,-.12,0,shoulder);mesh(sph(.06,10),toon(SKIN),0,-.25,0,shoulder);return shoulder});
    const head=new THREE.Group();head.position.y=1.02;body.add(head);
    const skull=mesh(sph(.3,24),toon(SKIN),0,0,0,head);outline(skull,1.06);
    for(const side of [-1,1])mesh(sph(.06,10),toon(SKIN),side*.29,-.03,0,head,false);
    const face=mesh(plane(.36,.36),FACE.open,0,-.05,.305,head,false);
    const back=mesh(sph(.325,20),toon(s.hair),0,.035,-.05,head);back.scale.set(1,.86,1);outline(back,1.05);
    const fringe=mesh(dome(.318,PI*.25),toon(s.hair),0,0,0,head);fringe.rotation.x=.24;
    if(s.hat){const hat=mesh(cyl(.015,.4,.2,24),toon('#dcc78c'),0,.36,0,head);outline(hat,1.04);mesh(cyl(.3,.31,.02,24),toon('#b49a5c'),0,.27,0,head,false)}
    root.scale.setScalar(AVATAR_SCALE);
    return {root,body,legs,arms,head,face,blob,sig:signature(profile),hatTop:(s.hat?1.6:1.5)*AVATAR_SCALE,angle:0,held:null,heldKind:'',particles:null};
  }
  const AVATAR_SCALE=1.15,FACING={down:0,up:PI,right:PI/2,left:-PI/2};
  const turn=(from,to)=>{let d=(to-from)%(PI*2);if(d>PI)d-=PI*2;if(d<-PI)d+=PI*2;return d};
  // Moves arms and legs for walking, sitting and the "sip / bite" gesture. effect = {kind, elapsed} or null.
  function animate(a,{walking=false,stride=0,seated=false,effect=null,time=0,dt=.016,reduced=false,carrying=false}){
    const k=1-Math.exp(-dt*16),phase=stride/9,swing=walking&&!reduced?Math.sin(phase)*.75:0;
    for(let i=0;i<2;i++){const leg=a.legs[i],target=seated?-1.35:(i?-swing:swing);leg.rotation.x+=(target-leg.rotation.x)*k}
    a.body.position.y=seated?-.02:walking&&!reduced?Math.abs(Math.sin(phase))*.05:0;
    a.body.scale.y=reduced?1:1+Math.sin(time/620)*.012;
    let lift=0;
    if(effect){const p=Math.min(1,effect.elapsed/2200);lift=reduced?1:Math.min(1,p/.2)*Math.min(1,(1-p)/.2)}
    for(let i=0;i<2;i++){const arm=a.arms[i];let target=seated?-.45:(i?swing:-swing)*.8;if(carrying)target=-1.15;if(i===1&&effect)target=-.4-lift*1.9;arm.rotation.x+=(target-arm.rotation.x)*k}
    a.arms[1].rotation.z=effect?-.35*lift+.14:.14;
    a.face.material=effect&&lift>.7?FACE.happy:FACE.open;
    // The dish rides in the right hand while the gesture plays.
    if(effect&&effect.kind!==a.heldKind){if(a.held)a.held.removeFromParent();a.held=dish(effect.kind);a.held.position.set(0,-.3,.07);a.held.scale.setScalar(1.15);a.arms[1].add(a.held);a.heldKind=effect.kind}
    if(a.held)a.held.visible=Boolean(effect);
    if(effect&&!reduced){
      if(!a.particles){a.particles=[];for(let i=0;i<5;i++)a.particles.push(mesh(sph(.035,8),mat('#bde7db'),0,0,0,a.head,false))}
      const drink=Boolean(window.TeaMenu?.[effect.kind]?.drink),p=Math.min(1,effect.elapsed/2200);
      a.particles.forEach((m,i)=>{const q=(p*1.6+i*.17)%1;m.visible=true;m.material=mat(drink?'#bde7db':'#e6b76b');m.position.set((i%2?-1:1)*(.3+q*.3),.15+q*.45,.1)});
    }else if(a.particles)for(const m of a.particles)m.visible=false;
  }

  // ---------- food and drink ----------
  const GLASS=mat('#d6efe8',{transparent:true,opacity:.5});
  function dish(kind){
    const g=new THREE.Group();
    if(kind==='snack'||kind==='seeds'){
      mesh(cyl(.15,.12,.03,20),mat(kind==='seeds'?'#7fb3a9':'#ece6c3'),0,.015,0,g);
      if(kind==='snack')for(const [x,z,r] of [[-.05,.02,.2],[.05,.03,-.4],[0,-.05,.9]]){const b=mesh(roundBox(.09,.04,.06,.012),mat('#d9984a'),x,.05,z,g);b.rotation.y=r;mesh(box(.06,.008,.03),mat('#f1c16f'),x,.072,z,g,false).rotation.y=r}
      else for(let i=0;i<14;i++){const s=mesh(sph(.017,6),mat(i%3?'#3e382f':'#d4b888'),(rng(i,1)-.5)*.2,.04,(rng(i,2)-.5)*.16,g,false);s.scale.set(1,.6,1.6)}
      return g;
    }
    const liquid={tea:'#c49a3c',coffee:'#7a4e33',lemonade:'#d8d36a'}[kind]||'#c49a3c';
    mesh(cyl(.062,.052,.13,14),mat(liquid),0,.07,0,g,false);
    if(kind==='coffee')mesh(cyl(.062,.062,.03,14),mat('#ead4a8'),0,.12,0,g,false);
    for(const [x,z] of [[-.02,.015],[.022,-.01]])mesh(box(.04,.035,.04),mat('#f4fbf8',{transparent:true,opacity:.85}),x,.125,z,g,false);
    mesh(cyl(.072,.06,.18,16),GLASS,0,.09,0,g,false);
    const straw=mesh(cyl(.007,.007,.24,6),mat(kind==='coffee'?'#e9b75b':'#ea6f55'),.02,.17,0,g,false);straw.rotation.z=-.2;
    if(kind==='lemonade'){const l=mesh(cyl(.045,.045,.012,14),mat('#f2d64b'),-.06,.18,0,g,false);l.rotation.z=PI/2.4}
    return g;
  }

  // ---------- renderer, scene, lights ----------
  let renderer,scene,camera,hemi,sun,canvasEl,labelLayer,shadows=false,points=[];
  const glowMats=[];
  const glow=(color,base='#5b4a33')=>{const m=new THREE.MeshLambertMaterial({color:base,emissive:color,emissiveIntensity:.1});glowMats.push(m);return m};
  const world=new THREE.Group(),tableGroup=new THREE.Group(),people=new THREE.Group();
  let boardTex=null,boardMat=null,boardVersion=-1,tableKey='',seatRings=new Map(),tablesById=new Map(),seatTable=new Map();
  const avatars=new Map();let waiter=null,servedDish=null,servedKind='';
  const vehicles=[];

  function init(canvas){
    if(api.supported)return true;
    try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'})}catch{renderer=null;return false}
    canvasEl=canvas;shadows=!(innerWidth<760||innerHeight<430);
    renderer.shadowMap.enabled=shadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    scene=new THREE.Scene();scene.background=new THREE.Color('#cfe3e6');
    camera=new THREE.PerspectiveCamera(38,1,.1,220);
    hemi=new THREE.HemisphereLight('#ffffff','#bba98c',2.1);scene.add(hemi);
    sun=new THREE.DirectionalLight('#fff3df',2.3);sun.position.set(-7,20,11);sun.castShadow=shadows;
    if(shadows){sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-16,right:16,top:13,bottom:-13,near:1,far:60});sun.shadow.bias=-.0004;sun.shadow.normalBias=.03}
    scene.add(sun,sun.target);
    if(shadows)for(const [x,y,z] of [[X(511),2.1,Z(150)],[X(786),2.6,Z(120)],[X(205),3.4,Z(170)]]){const l=new THREE.PointLight('#ffcf8a',0,9,1.6);l.position.set(x,y,z);scene.add(l);points.push(l)}
    scene.add(world,tableGroup,people);
    buildStatic();buildVehicles();
    labelLayer=document.createElement('div');labelLayer.className='scene3d-labels';labelLayer.setAttribute('aria-hidden','true');canvas.after(labelLayer);
    document.body.classList.add('scene-3d');
    api.supported=true;return true;
  }

  // ---------- the street café ----------
  function buildStatic(){
    const ground=mesh(plane(90,70),mat('#a9a08c'),0,-.03,4,world,false);ground.rotation.x=-PI/2;ground.receiveShadow=true;
    // Tiled pavement where people walk.
    const pave=canvasTex(1386,795,(g)=>{g.scale(1.5,1.5);g.fillStyle='#a59378';g.fillRect(0,0,924,530);
      for(let y=0;y<530;y+=28)for(let x=-44;x<970;x+=44){const off=(Math.floor(y/28)%2)*22,tx=x+off,r=rng(tx,y);g.fillStyle=r>.7?'#cfbfa1':r>.35?'#c8b799':'#d3c4a8';roundRect(g,tx+1.5,y+1.5,41,25,5);g.fill();g.fillStyle='rgba(255,255,255,.14)';g.fillRect(tx+6,y+4,30,2);if(rng(y,tx)>.8){g.fillStyle='rgba(120,100,70,.18)';g.fillRect(tx+12,y+16,12,2)}}});
    const p=mesh(plane(924*U,530*U),new THREE.MeshLambertMaterial({map:pave}),X(480),.001,Z(333),world,false);p.rotation.x=-PI/2;p.receiveShadow=true;
    // Curb, gutter, road and the far curb.
    mesh(roundBox(30,.14,8*U+.1,.03),mat('#ddd1ba'),0,.06,Z(596),world);
    const road=mesh(plane(90,40*U+.3),mat('#5a5852'),0,.004,Z(620),world,false);road.rotation.x=-PI/2;road.receiveShadow=true;
    for(let x=-1400;x<2400;x+=288)mesh(box(116*U,.01,4*U),mat('#e8d8ae'),X(x+58),.012,Z(620),world,false);
    mesh(roundBox(90,.14,.3,.03),mat('#cfc2a8'),0,.06,Z(646),world);
    const far=mesh(plane(90,4),mat('#b8ad97'),0,.002,Z(646)+2.15,world,false);far.rotation.x=-PI/2;
    // Low hedges close the left and right sides of the pavement.
    for(const x of [9,951]){mesh(roundBox(14*U,.42,520*U,.08),mat('#8a6a4f'),X(x),.21,Z(333),world);mesh(roundBox(16*U,.32,516*U,.12),mat('#5f9150'),X(x),.55,Z(333),world);for(let y=90;y<590;y+=46)mesh(sph(.2,10),mat(y%92?'#6fa65a':'#e08aa0'),X(x)+(rng(x,y)-.5)*.1,.72,Z(y),world)}
    buildFacade();buildBoard();buildStall();buildProps();
  }
  function buildFacade(){
    const wallZ=Z(58);
    // A row of narrow Vietnamese tube houses behind the shop.
    const houses=[[0,250,'#efd3a2',6.4],[250,470,'#e9b9a2',7.2],[470,720,'#cfe1c6',6],[720,960,'#f3e2bf',6.8]];
    const panel=canvasTex(512,128,(g)=>{for(let x=0;x<512;x+=32){g.fillStyle=(x/32)%2?'#bb8862':'#c79b70';g.fillRect(x,0,32,128);g.fillStyle='#8a6248';g.fillRect(x,0,3,128)}g.fillStyle='rgba(255,255,255,.18)';g.fillRect(0,10,512,4)});
    panel.wrapS=THREE.RepeatWrapping;panel.repeat.set(5,1);
    for(const [x0,x1,color,h] of houses){
      const w=(x1-x0)*U,cx=X((x0+x1)/2);
      mesh(roundBox(w-.06,h,.7,.06),mat(color),cx,h/2,wallZ-.35,world);
      mesh(roundBox(w+.06,.22,.95,.05),mat('#8f6b55'),cx,h+.05,wallZ-.35,world);
      for(const fy of h>6.5?[3.35,5.15]:[3.4,5]){
        for(const s of [-1,1]){const wx=cx+s*w*.22;
          mesh(roundBox(1.06,1.18,.08,.03),mat('#fff6e6'),wx,fy,wallZ+.02,world);mesh(box(.86,.98,.06),mat('#56717b'),wx,fy,wallZ+.05,world,false);
          mesh(box(.04,.98,.07),mat('#fff6e6'),wx,fy,wallZ+.07,world,false);
          for(const t of [-1,1])mesh(roundBox(.3,1.12,.06,.02),mat('#5f8f6e'),wx+t*.7,fy,wallZ+.05,world);
        }
        mesh(roundBox(w*.8,.08,.5,.02),mat('#8a6a54'),cx,fy-.68,wallZ+.25,world);
        for(let i=0;i<9;i++)mesh(box(.03,.42,.03),mat('#4f3f34'),cx-w*.38+i*w*.095,fy-.45,wallZ+.48,world,false);
        mesh(box(w*.8,.04,.04),mat('#4f3f34'),cx,fy-.24,wallZ+.48,world,false);
      }
      mesh(roundBox(.6,.4,.32,.04),mat('#e8e6dc'),cx+w*.36,2.75,wallZ+.17,world);
    }
    // Wooden shopfront along the ground floor.
    mesh(roundBox(920*U,2.35,.16,.03),new THREE.MeshLambertMaterial({map:panel}),X(480),1.18,wallZ+.06,world);
    mesh(roundBox(924*U,.12,.32,.03),mat('#7d5a43'),X(480),2.38,wallZ+.1,world);
    for(const x of [690,900]){mesh(box(.12,.3,.12),mat('#4f3f34'),X(x),2.15,wallZ+.2,world);mesh(roundBox(.24,.3,.24,.05),glow('#ffcf7a','#f4e2b5'),X(x),1.95,wallZ+.24,world,false)}
  }
  function buildBoard(){
    const g=new THREE.Group();g.position.set(X(205),0,Z(104));g.rotation.x=-.2;world.add(g);
    for(const s of [-1,1]){mesh(roundBox(.16,4.2,.16,.04),mat('#5d4129'),s*4.48,2.1,-.08,g)}
    mesh(roundBox(9.3,3.72,.2,.06),mat('#6b4a2f'),0,2.36,-.02,g);
    boardTex=new THREE.CanvasTexture(window.TeaScene?.board||document.createElement('canvas'));boardTex.colorSpace=THREE.SRGBColorSpace;boardTex.anisotropy=8;
    boardMat=new THREE.MeshBasicMaterial({map:boardTex});
    mesh(plane(9.05,3.5),boardMat,0,2.36,.085,g,false);
  }
  function buildStall(){
    const wallZ=Z(58),cx=X(511),g=new THREE.Group();world.add(g);
    // Back shelf with jars of tea leaves.
    mesh(roundBox(5.3,1.95,.42,.04),mat('#b98a5b'),cx,1.0,wallZ+.27,g);
    for(const y of [.72,1.38])mesh(box(5.1,.06,.36),mat('#6e4f37'),cx,y,wallZ+.42,g,false);
    for(const [x,y,c] of [[-2,.9,'#4f7d70'],[-1.5,.9,'#c96a4a'],[-1,.9,'#4f7d70'],[1.1,.9,'#d6a64a'],[1.6,.9,'#4f7d70'],[2.05,.9,'#c96a4a'],[-1.8,1.56,'#d6a64a'],[-1.2,1.56,'#4f7d70'],[1.3,1.56,'#c96a4a'],[1.9,1.56,'#4f7d70']]){mesh(cyl(.13,.13,.28,12),mat(c),cx+x,y+.14,wallZ+.42,g);mesh(cyl(.14,.14,.05,12),mat('#f3dfa4'),cx+x,y+.3,wallZ+.42,g,false)}
    const sign=mesh(plane(2.6,.48),new THREE.MeshBasicMaterial({map:signTex('LOC LY • TEA','#fbdf98','#704c30')}),cx,1.62,wallZ+.5,g,false);sign.position.y=2.05;
    // Tiled roof over the stall.
    const roof=new THREE.Group();roof.position.set(cx,2.72,wallZ+.75);roof.rotation.x=.42;g.add(roof);
    mesh(roundBox(6.2,.14,1.7,.04),mat('#c8744a'),0,0,0,roof);
    for(let i=0;i<4;i++)mesh(cyl(.06,.06,6.2,8),mat('#a85d3a'),0,.08,-.62+i*.42,roof).rotation.z=PI/2;
    // Counter.
    mesh(roundBox(5.55,1.0,.82,.05),mat('#9a6d45'),cx,.5,Z(118),g);
    for(let i=0;i<7;i++)mesh(box(.05,.82,.02),mat('#7a5334'),cx-2.4+i*.8,.48,Z(118)+.42,g,false);
    mesh(roundBox(5.8,.09,.98,.03),mat('#d6a66d'),cx,1.04,Z(118),g);
    // Striped awning above the counter.
    const awning=new THREE.Group();awning.position.set(cx,2.05,Z(124));awning.rotation.x=.34;g.add(awning);
    for(let i=0;i<8;i++){const x=-2.8+i*.8;mesh(roundBox(.8,.05,1.05,.015),mat(i%2?'#f2e4c6':'#d65a40'),x+.4,0,0,awning);mesh(roundBox(.8,.2,.04,.015),mat(i%2?'#f2e4c6':'#d65a40'),x+.4,-.1,.52,awning)}
    for(const x of [-2.75,2.75])mesh(cyl(.04,.04,2.05,8),mat('#6e4f37'),cx+x,1.02,Z(131),g);
    for(const x of [-1.8,0,1.8]){mesh(cyl(.01,.01,.25,4),mat('#3d3128'),cx+x,1.9,Z(135),g,false);mesh(sph(.09,12),glow('#ffd88a','#f6e7c3'),cx+x,1.73,Z(135),g,false)}
    // Things on the counter.
    mesh(cyl(.25,.25,.6,18),mat('#d39b3c',{transparent:true,opacity:.82}),cx-1.6,1.38,Z(116),g);mesh(cyl(.26,.26,.06,18),mat('#466d63'),cx-1.6,1.7,Z(116),g);
    mesh(cyl(.2,.24,.46,18),mat('#4e7f72'),cx+1.7,1.31,Z(116),g);mesh(cyl(.21,.21,.05,18),mat('#e9dbb0'),cx+1.7,1.55,Z(116),g);
    for(const x of [-.5,-.2,.1]){const d=dish('tea');d.position.set(cx+x,1.09,Z(122));d.scale.setScalar(1.3);g.add(d)}
    const s=dish('snack');s.position.set(cx+.8,1.09,Z(120));s.scale.setScalar(1.6);g.add(s);
  }
  function buildProps(){
    // A lamp post, potted plants, a tree and a sandwich-board sign.
    const lx=X(786),lz=Z(112);mesh(cyl(.12,.16,.16,12),mat('#3e342a'),lx,.08,lz,world);mesh(cyl(.05,.05,2.6,10),mat('#4d4030'),lx,1.3,lz,world);mesh(roundBox(.34,.42,.34,.06),glow('#ffd27a','#f6e7c3'),lx,2.7,lz,world,false);mesh(cyl(.02,.26,.14,4),mat('#3e342a'),lx,2.98,lz,world).rotation.y=PI/4;
    pot(X(922),Z(110),1.1);pot(X(650),Z(96),.8);pot(X(398),Z(150),.7);
    tree(X(880),Z(74));
    for(const x of [314,644,802])flowers(X(x),Z(588));
    const a=new THREE.Group();a.position.set(X(242),0,Z(578));world.add(a);
    const face=new THREE.MeshLambertMaterial({map:signTex('TRÀ ĐÁ • VỈA HÈ','#efe0c0','#654b39',512,128)});
    for(const s of [-1,1]){const b=mesh(roundBox(1.5,.72,.05,.02),mat('#6b513d'),0,.44,s*.12,a);b.rotation.x=s*.22;if(s>0){const f=mesh(plane(1.38,.6),face,0,.44,.155,a,false);f.rotation.x=.22}}
    // String lights between short posts at the curb.
    const xs=[40,250,430,610,790,920],top=1.45;
    for(const x of xs){mesh(cyl(.04,.05,top,8),mat('#5e4c3c'),X(x),top/2,Z(592),world)}
    const pts=[];for(let i=0;i<xs.length-1;i++)for(let k=0;k<=12;k++){const t=k/12;pts.push(new THREE.Vector3(X(xs[i]+(xs[i+1]-xs[i])*t),top-Math.sin(t*PI)*.32,Z(592)))}
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#3d3128'})));
    const bulbs=[glow('#ffcf7a','#f3e2bd'),glow('#ff9a6a','#e9b19a'),glow('#ffe39a','#f3e6c0')];
    pts.forEach((p,i)=>{if(i%3===1)mesh(sph(.07,8),bulbs[i%9===1?0:i%2?1:2],p.x,p.y-.08,p.z,world,false)});
  }
  function pot(x,z,s=1){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);world.add(g);mesh(cyl(.3,.22,.45,16),mat('#b8714d'),0,.22,0,g);mesh(cyl(.32,.32,.07,16),mat('#d99566'),0,.45,0,g);for(const [dx,dy,dz,r] of [[0,.75,0,.32],[-.18,.62,.1,.22],[.18,.65,-.05,.24],[.05,.95,.05,.2]])mesh(sph(r,12),mat(r>.25?'#5a9a4d':'#78b25a'),dx,dy,dz,g)}
  function tree(x,z){const g=new THREE.Group();g.position.set(x,0,z);world.add(g);mesh(cyl(.13,.2,2.2,10),mat('#6b4a33'),0,1.1,0,g);for(const [dx,dy,dz,r,c] of [[0,2.7,0,.95,'#5d9a4a'],[-.6,2.3,.25,.65,'#6eab55'],[.6,2.4,-.1,.7,'#4f8a42'],[.1,3.3,.1,.6,'#86bb62']])mesh(sph(r,14),mat(c),dx,dy,dz,g)}
  function flowers(x,z){const g=new THREE.Group();g.position.set(x,0,z);world.add(g);mesh(roundBox(.5,.28,.3,.05),mat('#8d6a4f'),0,.14,0,g);for(let i=0;i<5;i++){mesh(sph(.08,8),mat(['#f07c8f','#ffd36b','#f6f0e4','#e86a5a','#b98be0'][i]),-.18+i*.09,.36+(i%2)*.05,(i%2?.05:-.04),g,false)}mesh(sph(.16,10),mat('#6aa457'),0,.3,0,g)}

  // ---------- tables and stools ----------
  function buildTables(tables){
    const key=tables.map(t=>`${t.id}:${t.x},${t.y},${t.capacity}`).join('|');if(key===tableKey)return;tableKey=key;
    tableGroup.clear();seatRings.clear();tablesById.clear();seatTable.clear();
    for(const t of tables){
      tablesById.set(t.id,t);const g=new THREE.Group();g.position.set(X(t.x),0,Z(t.y));tableGroup.add(g);
      const w=t.width*U,d=t.height*U,color=t.capacity===8?'#4f8fa8':t.capacity===4?'#55915f':'#d65842';
      mesh(roundBox(w+.06,.05,d+.06,.02),mat('#a8432f'),0,.5,0,g);
      mesh(roundBox(w,.07,d,.03),mat(color),0,.55,0,g);
      for(const [sx,sz] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const l=mesh(cyl(.025,.025,.5,8),mat('#6b665d'),sx*(w/2-.1),.25,sz*(d/2-.1),g);l.rotation.z=sx*.05}
      const tea=dish('tea');tea.position.set(-.2,.59,.02);g.add(tea);
      const snack=dish(t.capacity===8?'seeds':'snack');snack.position.set(.22,.59,.08);g.add(snack);
      for(const seat of t.seats){
        seatTable.set(seat.id,t);const n=Number(seat.id.split('-').at(-1))||1,s=new THREE.Group();s.position.set(X(seat.x),0,Z(seat.y));tableGroup.add(s);
        mesh(cyl(.16,.15,.07,16),mat(SEAT_COLORS[(n-1)%SEAT_COLORS.length]),0,.3,0,s);
        for(const [sx,sz] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const l=mesh(cyl(.02,.026,.28,6),mat(SEAT_COLORS[(n-1)%SEAT_COLORS.length]),sx*.09,.14,sz*.09,s,false);l.rotation.z=-sx*.12;l.rotation.x=sz*.12}
        const ring=mesh(cached(geos,'ring',()=>new THREE.TorusGeometry(.27,.03,8,32)),new THREE.MeshBasicMaterial({color:'#fff0a9'}),0,.03,0,s,false);ring.rotation.x=-PI/2;ring.visible=false;seatRings.set(seat.id,ring);
      }
    }
  }

  // ---------- traffic ----------
  function buildVehicles(){
    for(let lane=0;lane<2;lane++){
      const body=new THREE.MeshLambertMaterial({color:'#bb6049'}),scooter=new THREE.Group(),car=new THREE.Group();
      mesh(roundBox(1.1,.3,.36,.08),body,0,.4,0,scooter);mesh(roundBox(.46,.1,.3,.04),mat('#2f3436'),-.15,.6,0,scooter);mesh(roundBox(.12,.5,.3,.04),body,.42,.62,0,scooter);mesh(cyl(.015,.015,.5,6),mat('#2f3436'),.46,.9,0,scooter).rotation.x=PI/2;
      for(const x of [-.38,.4]){const w=mesh(cyl(.17,.17,.1,14),mat('#262f33'),x,.17,0,scooter);w.rotation.x=PI/2}
      const lightA=glow('#fff3b8','#f6efd4');mesh(sph(.07,10),lightA,.56,.68,0,scooter,false);
      mesh(cap(.14,.2),toon('#5a7d52'),-.14,.95,0,scooter);mesh(sph(.16,14),toon(SKIN),-.12,1.33,0,scooter);mesh(dome(.18,PI*.55),toon('#e7d9b5'),-.13,1.36,0,scooter);
      mesh(roundBox(1.95,.45,.82,.12),body,0,.42,0,car);mesh(roundBox(1.05,.4,.74,.1),mat('#cfd8cc'),-.1,.8,0,car);mesh(box(1.08,.28,.76),mat('#557f88'),-.1,.82,0,car,false);
      for(const [x,z] of [[-.62,.42],[.62,.42],[-.62,-.42],[.62,-.42]]){const w=mesh(cyl(.17,.17,.12,14),mat('#262f33'),x,.17,z,car);w.rotation.x=PI/2}
      const lightB=glow('#fff3b8','#f6efd4');for(const z of [-.26,.26]){mesh(box(.05,.1,.16),lightB,.98,.48,z,car,false);mesh(box(.05,.09,.14),mat('#c95740'),-.98,.48,z,car,false)}
      world.add(scooter,car);scooter.visible=car.visible=false;vehicles.push({body,scooter,car,lane});
    }
  }
  function updateTraffic(now,reduced){
    const cars=TeaAmbience.trafficAt(now,reduced);
    for(const v of vehicles){const c=cars.find(row=>(row.y>620?1:0)===v.lane);v.scooter.visible=Boolean(c&&c.scooter);v.car.visible=Boolean(c&&!c.scooter);if(!c)continue;const m=c.scooter?v.scooter:v.car;m.position.set(X(c.x),0,Z(c.y));m.rotation.y=c.direction===1?0:PI;v.body.color.set(c.color)}
  }

  // ---------- day and night ----------
  const C={dayBg:new THREE.Color('#cfe3e6'),nightBg:new THREE.Color('#1f2a48'),duskBg:new THREE.Color('#f2b98a'),white:new THREE.Color('#ffffff'),nightSky:new THREE.Color('#6d7fc0'),sun:new THREE.Color('#fff3df'),moon:new THREE.Color('#9fb2ea'),dusk:new THREE.Color('#ffae6e')};
  let lastLight='';
  function updateLighting(now){
    const {night,phase}=TeaAmbience.timeAt(now),key=night.toFixed(3)+phase;if(key===lastLight)return;lastLight=key;
    const dusk=phase==='dusk'||phase==='dawn'?Math.sin(night*PI):0;
    scene.background.copy(C.dayBg).lerp(C.nightBg,night).lerp(C.duskBg,dusk*.45);
    hemi.intensity=2.1-1.35*night;hemi.color.copy(C.white).lerp(C.nightSky,night);
    sun.intensity=2.3*(1-night)+.45*night;sun.color.copy(C.sun).lerp(C.moon,night).lerp(C.dusk,dusk*.6);
    for(const m of glowMats)m.emissiveIntensity=.12+night*1.6;
    for(const l of points)l.intensity=night*7;
    if(boardMat)boardMat.color.setScalar(1-night*.42);
  }

  // ---------- HTML labels over the canvas ----------
  const labels=new Map(),v3=new THREE.Vector3();let labelFrame=0,layerRect='';
  function label(key,cls,update){let l=labels.get(key);if(!l){const el=document.createElement('div');el.className='s3-label '+cls;labelLayer.append(el);l={el,sig:null,frame:0};labels.set(key,l)}l.frame=labelFrame;update(l);return l}
  function place(l,x,y,z,w,h){v3.set(x,y,z).project(camera);const hidden=v3.z>1||v3.x<-1.3||v3.x>1.3||v3.y<-1.3||v3.y>1.3;if(l.el.hidden!==hidden)l.el.hidden=hidden;if(!hidden)l.el.style.transform=`translate(${((v3.x+1)/2*w).toFixed(1)}px,${((1-v3.y)/2*h).toFixed(1)}px) translate(-50%,-100%)`}
  function nameLabel(l,guest,mine){
    const rank=guest.rank,tier=rank&&rank.tier>=1?Math.min(5,rank.tier):-1,fire=rank&&rank.streak>=3?'🔥'+rank.streak:'',sig=`${guest.nickname}|${mine}|${tier}|${fire}`;if(l.sig===sig)return;l.sig=sig;
    l.el.classList.toggle('mine',mine);l.el.replaceChildren();
    if(tier>=0){const dot=document.createElement('i');dot.style.background=RANK_COLORS[tier];l.el.append(dot)}
    const name=document.createElement('span');name.textContent=guest.nickname||'Guest';l.el.append(name);
    if(fire){const f=document.createElement('small');f.textContent=fire;l.el.append(f)}
  }
  const setText=(l,text)=>{if(l.sig!==text){l.sig=text;l.el.textContent=text}};

  // ---------- camera ----------
  const cam={x:0,z:2,dist:20,ready:false},TAN=Math.tan(19*PI/180),POLAR=.86;let size='';
  function updateCamera(rect,focus,zoom,dt,snap){
    const aspect=rect.width/Math.max(1,rect.height);if(camera.aspect!==aspect){camera.aspect=aspect;camera.updateProjectionMatrix()}
    const widthUnits=clamp(aspect*13,10,rect.height<480?15:21),dist=clamp(widthUnits/(2*TAN*aspect)/(zoom||1),9,36),visible=2*dist*TAN*aspect,maxX=Math.max(0,12.6-visible/2);
    const tx=clamp(X(focus.x),-maxX,maxX),tz=clamp(Z(focus.y),-3.6,3),k=snap||!cam.ready?1:1-Math.exp(-Math.min(.1,dt)*9);
    cam.x+=(tx-cam.x)*k;cam.z+=(tz-cam.z)*k;cam.dist+=(dist-cam.dist)*(cam.ready&&!snap?1-Math.exp(-Math.min(.1,dt)*7):1);cam.ready=true;
    camera.position.set(cam.x,.5+Math.cos(POLAR)*cam.dist,cam.z+Math.sin(POLAR)*cam.dist);camera.lookAt(cam.x,.5,cam.z);
    if(shadows){sun.position.set(cam.x-7,20,cam.z+11);sun.target.position.set(cam.x,0,cam.z)}
  }

  // ---------- one frame ----------
  const prevPos=new Map();
  function render(o){
    const {rect,state,guests=[],nearSeatId,myId,bubbles,showBubbles=true,consumption,orderData,now=Date.now(),time=performance.now(),dt=.016,zoom=1,focus,snap=false}=o;
    const reduced=reducedMotion.matches,dpr=Math.min(devicePixelRatio||1,shadows?2:1.5),w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height)),key=`${w}x${h}@${dpr}`;
    if(key!==size){size=key;renderer.setPixelRatio(dpr);renderer.setSize(w,h,false)}
    const lr=`${canvasEl.offsetLeft},${canvasEl.offsetTop},${w},${h}`;if(lr!==layerRect){layerRect=lr;Object.assign(labelLayer.style,{left:canvasEl.offsetLeft+'px',top:canvasEl.offsetTop+'px',width:w+'px',height:h+'px'})}
    buildTables(state?.room?.tables||window.TeaWorld?.TABLES||[]);
    if(window.TeaScene&&TeaScene.boardVersion!==boardVersion){boardVersion=TeaScene.boardVersion;boardTex.needsUpdate=true}
    updateLighting(now);updateTraffic(now,reduced);
    for(const [id,ring] of seatRings){ring.visible=id===nearSeatId;if(ring.visible)ring.scale.setScalar(1+Math.sin(time/180)*.08)}
    labelFrame++;
    // Tables: occupancy chip in front, activity tag above.
    for(const t of state?.room?.tables||[]){
      const occupied=t.seats.filter(s=>s.walletId).length;
      place(label('c:'+t.id,'s3-count',l=>setText(l,`${occupied}/${t.capacity}`)),X(t.x),0,Z(t.y)+t.height*U/2+.62,w,h);
      const def=t.activity&&ACTIVITY[t.activity.key];
      if(def)place(label('a:'+t.id,'s3-activity',l=>{const sig=def[0]+t.activity.players;if(l.sig!==sig){l.sig=sig;l.el.style.background=def[1];l.el.replaceChildren(document.createTextNode(`${def[0]} ${t.activity.players}`),document.createElement('b'))}}),X(t.x),1.25,Z(t.y),w,h);
    }
    // People.
    const seen=new Set();
    for(const g of guests){
      seen.add(g.walletId);let a=avatars.get(g.walletId);
      if(!a||a.sig!==signature(g)){if(a)a.root.removeFromParent();a=makeAvatar(g,shadows);avatars.set(g.walletId,a);people.add(a.root)}
      const seated=Boolean(g.seatId),table=seated&&seatTable.get(g.seatId);
      a.root.position.set(X(g.x),0,Z(g.y));
      let target=a.angle;const prev=prevPos.get(g.walletId);
      if(table)target=Math.atan2(table.x-g.x,table.y-g.y);
      else if(g.walking&&prev&&Math.hypot(g.x-prev.x,g.y-prev.y)>.2)target=Math.atan2(g.x-prev.x,g.y-prev.y);
      else if(!prev||g.facing!==prev.facing&&!g.walking)target=FACING[g.facing]??a.angle;
      prevPos.set(g.walletId,{x:g.x,y:g.y,facing:g.facing});
      a.angle+=turn(a.angle,target)*(prev?Math.min(1,dt*14):1);a.root.rotation.y=a.angle;
      const fx=consumption?.get(g.walletId),effect=fx&&time-fx.started<2200?{kind:fx.kind,elapsed:time-fx.started}:null;
      animate(a,{walking:Boolean(g.walking)&&!seated,stride:g.stride||0,seated,effect,time,dt,reduced});
      const mine=g.walletId===myId,top=a.hatTop-(seated?.06:0);
      place(label('n:'+g.walletId,'s3-name',l=>nameLabel(l,g,mine)),X(g.x),top+.12,Z(g.y),w,h);
      const bubble=showBubbles&&bubbles?.get(g.walletId);
      if(bubble&&Date.now()<bubble.until)place(label('b:'+g.walletId,'s3-bubble',l=>setText(l,bubble.text.slice(0,42))),X(g.x),top+.62,Z(g.y),w,h);
      api.onPose?.(g);
    }
    for(const [id,a] of avatars)if(!seen.has(id)){a.root.removeFromParent();avatars.delete(id);prevPos.delete(id)}
    // My served dish waits on the table in front of me.
    const me=guests.find(g=>g.walletId===myId),item=orderData?.item,meTable=me?.seatId&&seatTable.get(me.seatId);
    const showServed=Boolean(item&&item.status==='served'&&me&&meTable&&!consumption?.get(myId));
    if(showServed&&servedKind!==item.kind){if(servedDish)servedDish.removeFromParent();servedDish=dish(item.kind);servedDish.scale.setScalar(1.3);people.add(servedDish);servedKind=item.kind}
    if(servedDish){servedDish.visible=showServed;if(showServed)servedDish.position.set(X(me.x+(meTable.x-me.x)*.45),.59,Z(me.y+(meTable.y-me.y)*.45))}
    // The waiter walks the order from the counter to my seat.
    const delivering=item&&item.status==='delivering'&&me;
    if(delivering&&!waiter){waiter=makeAvatar({hair:1,clothes:7,shoes:0},shadows);const tray=new THREE.Group();tray.position.set(0,.62,.34);waiter.body.add(tray);mesh(roundBox(.46,.03,.32,.01),mat('#7b5a3e'),0,0,0,tray);waiter.trayDish=new THREE.Group();waiter.trayDish.position.y=.02;tray.add(waiter.trayDish);waiter.trayKind='';people.add(waiter.root)}
    if(waiter){waiter.root.visible=Boolean(delivering);if(delivering){
      if(waiter.trayKind!==item.kind){waiter.trayDish.clear();const d=dish(item.kind);d.scale.setScalar(1.3);waiter.trayDish.add(d);waiter.trayKind=item.kind}
      const remain=Math.max(0,(item.deliverAt-(o.serverNow??now))/2200),t=1-Math.min(1,remain),x=480+(me.x-480)*t,y=136+(me.y-136)*t;
      waiter.root.position.set(X(x),0,Z(y));waiter.angle=Math.atan2(me.x-480,me.y-136);waiter.root.rotation.y=waiter.angle;animate(waiter,{walking:t<1,stride:t*400,time,dt,reduced,carrying:true});
    }}
    for(const [k,l] of labels)if(l.frame!==labelFrame){l.el.remove();labels.delete(k)}
    updateCamera(rect,focus||me||{x:480,y:420},zoom,dt,snap);
    renderer.render(scene,camera);
  }

  function worldToScreen(x,y){const r=canvasEl.getBoundingClientRect();v3.set(X(x),0,Z(y)).project(camera);return{x:(v3.x+1)/2*r.width,y:(1-v3.y)/2*r.height}}
  const ray=new THREE.Raycaster(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3();
  function screenToWorld(px,py){const r=canvasEl.getBoundingClientRect();ray.setFromCamera({x:px/r.width*2-1,y:-(py/r.height*2-1)},camera);return ray.ray.intersectPlane(groundPlane,hit)?{x:hit.x/U+480,y:hit.z/U+320}:null}

  // ---------- small pictures for the menu, the character maker and the "sip" card ----------
  let snap=null;
  function snapper(){
    if(snap)return snap;const c=document.createElement('canvas'),r=new THREE.WebGLRenderer({canvas:c,antialias:true,alpha:true,preserveDrawingBuffer:true});
    const s=new THREE.Scene();s.add(new THREE.HemisphereLight('#ffffff','#bba98c',2.3));const d=new THREE.DirectionalLight('#fff3df',2);d.position.set(2,4,5);s.add(d);
    snap={renderer:r,scene:s,camera:new THREE.PerspectiveCamera(30,1,.05,50),holder:new THREE.Group(),avatars:new Map()};s.add(snap.holder);return snap;
  }
  function shoot(target,object,eye,look,background){
    if(!api.supported||!target)return;const S=snapper(),w=target.width,h=target.height;
    S.holder.clear();S.holder.add(object);S.renderer.setPixelRatio(1);S.renderer.setSize(w,h,false);S.camera.aspect=w/h;S.camera.updateProjectionMatrix();S.camera.position.set(...eye);S.camera.lookAt(...look);
    S.renderer.render(S.scene,S.camera);const c=target.getContext('2d');c.clearRect(0,0,w,h);if(background){c.fillStyle=background;c.fillRect(0,0,w,h)}c.drawImage(S.renderer.domElement,0,0,w,h);
  }
  function avatarSnapshot(target,profile,{background=null,seated=false,effect=null,time=performance.now()}={}){
    const S=snapper(),sig=signature(profile||{});let a=S.avatars.get(sig);if(!a){a=makeAvatar(profile||{},false);a.blob.visible=false;a.root.scale.setScalar(1);S.avatars.set(sig,a);if(S.avatars.size>12)S.avatars.delete(S.avatars.keys().next().value)}
    a.root.rotation.y=.42;for(let i=0;i<8;i++)animate(a,{seated,effect,time,dt:.05,reduced:reducedMotion.matches});
    shoot(target,a.root,seated?[0,1.1,2.9]:[0,1.15,3.3],[0,seated?.72:.78,0],background);
  }
  function dishSnapshot(target,kind){const d=dish(kind);d.rotation.y=.5;shoot(target,d,[0,.42,.82],[0,.09,0],null)}

  return Object.assign(api,{init,render,worldToScreen,screenToWorld,avatarSnapshot,dishSnapshot});
})();
