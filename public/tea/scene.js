/* Original pixel artwork, drawn locally; no external game assets. */
window.TeaScene = (() => {
  const p=(c,color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(Math.round(x/2)*2,Math.round(y/2)*2,Math.round(w/2)*2,Math.round(h/2)*2)};
  const rng=(x,y)=>{const n=Math.sin(x*12.9898+y*78.233)*43758.5453;return n-Math.floor(n)};
  const layer=document.createElement('canvas');layer.width=960;layer.height=640;
  const c=layer.getContext('2d');c.imageSmoothingEnabled=false;
  function shrub(c,x,y,size=1){
    c.save();c.translate(x,y);c.scale(size,size);
    p(c,'#476446',-26,10,58,12);p(c,'#25482f',-22,-18,48,36);p(c,'#3b6a3d',-30,-12,62,26);
    p(c,'#589346',-20,-24,42,34);p(c,'#78ad52',-14,-28,28,20);
    for(let i=0;i<16;i++){const x=Math.floor(rng(i,3)*44)-22,y=Math.floor(rng(i,5)*30)-24;p(c,i%3?'#8cbd5f':'#42713c',x,y,6,4)}c.restore();
  }
  function tree(c,x,y,size=1){
    c.save();c.translate(x,y);c.scale(size,size);p(c,'#496844',-28,18,72,18);
    p(c,'#583e2b',-6,-16,14,48);p(c,'#87603c',-2,-8,6,36);p(c,'#b28c55',0,2,2,20);
    const bands=[[-88,14],[-82,26],[-72,38],[-60,47],[-46,52],[-30,44],[-18,28]];
    for(let i=0;i<bands.length;i++){const [by,width]=bands[i];p(c,'#315631',-width,by,width*2,16);p(c,i<3?'#8cb45a':i<5?'#6d9e46':'#4e7e39',-width+4,by+2,width*2-8,12)}
    for(let i=0;i<55;i++){const bx=Math.floor(rng(i,6)*80)-40,by=Math.floor(rng(i,9)*62)-78;if(Math.abs(bx)>(by<-70?26:44))continue;p(c,i%4?'#82ad4d':'#a7c56c',bx,by,6+i%3*2,4)}
    p(c,'#aac971',-6,-84,22,6);p(c,'#b6ce7c',-2,-82,8,2);c.restore();
  }
  function flower(c,x,y,color){p(c,'#4b713d',x,y,2,10);p(c,'#668940',x-4,y+4,8,2);p(c,color,x-4,y-4,10,6);p(c,color,x-2,y-6,6,10);p(c,'#ffe6a3',x,y-2,2,2)}
  function pot(c,x,y){p(c,'#815140',x-12,y,24,20);p(c,'#b16f4d',x-10,y,20,16);p(c,'#d79564',x-14,y-4,28,6);shrub(c,x,y-6,.45)}
  function glass(c,x,y,scale=1){
    c.save();c.translate(x,y);c.scale(scale,scale);p(c,'#66543b',-9,9,20,4);p(c,'#526d63',-8,-15,16,24);p(c,'#b1ddd0',-6,-14,12,22);p(c,'#e1efcf',-4,-12,8,18);p(c,'#ab9b47',-4,-4,8,10);p(c,'#eeeac0',-3,-10,4,4);p(c,'#f9f7d6',1,-7,3,4);p(c,'#658663',5,-20,2,26);p(c,'#edf4d5',-8,-16,16,2);c.restore();
  }
  function snack(c,x,y,scale=1){
    c.save();c.translate(x,y);c.scale(scale,scale);p(c,'#715844',-21,10,44,6);p(c,'#91a68e',-24,0,48,12);p(c,'#e9e4b9',-20,-2,40,10);
    for(const [bx,by] of [[-12,-10],[3,-10],[-4,-20]]){p(c,'#97532e',bx-7,by,16,10);p(c,'#d9984a',bx-7,by-2,14,8);p(c,'#f1bd6e',bx-5,by-4,10,6);p(c,'#aa6435',bx,by,3,2)}c.restore();
  }
  function buildGround(){
    p(c,'#78a95d',0,0,960,640);
    for(let i=0;i<800;i++){const x=rng(i,1)*960,y=rng(i,2)*640;p(c,i%3?'#83b367':'#60924d',x,y,4,2)}
    // Raised brick courtyard with edging and little worn tiles.
    p(c,'#536644',14,70,932,548);p(c,'#775c40',18,68,924,544);p(c,'#e2c89a',24,74,912,530);
    for(let y=80;y<604;y+=24)for(let x=28;x<934;x+=32){const offset=(Math.floor(y/24)%2)*16;p(c,'#c9a874',x-offset,y,30,22);p(c,rng(x,y)>.4?'#d8b985':'#d3b17c',x-offset+2,y,28,18);p(c,'#e5c99b',x-offset+3,y,24,2);if(rng(y,x)>.74)p(c,'#bfa16b',x-offset+8,y+12,10,2)}
    // Main horizontal aisle, slightly lighter than the table patios.
    p(c,'#e2cca0',26,312,908,46);for(let x=30;x<936;x+=48){p(c,'#ceb184',x,332,36,2);p(c,'#f0d9ad',x+10,316,20,2)}
    // Garden borders stay outside the walking area.
    for(let x=20;x<960;x+=34){p(c,'#31573a',x,0,30,38);p(c,'#518243',x+2,0,26,30);p(c,'#70a34f',x+4,2,12,8)}
    for(let x=12;x<960;x+=64){p(c,'#69523b',x,614,8,26);p(c,'#ac8150',x+2,614,4,24)}p(c,'#b6905f',0,620,960,6);p(c,'#775c3c',0,628,960,4);
    for(let i=0;i<30;i++)flower(c,28+i*31,632,['#f3d16c','#e6a7a3','#b8d9ea'][i%3]);
    // Trees frame the café and lanterns warm the entrance.
    tree(c,70,54,.8);tree(c,890,50,.84);tree(c,230,40,.62);tree(c,740,34,.65);
    pot(c,30,102);pot(c,930,102);pot(c,278,110);pot(c,674,108);
    for(const x of [190,786]){p(c,'#5a4532',x,56,6,58);p(c,'#7a583b',x-8,106,22,6);p(c,'#4d4030',x-12,48,28,6);p(c,'#be8e45',x-8,54,20,26);p(c,'#fae49b',x-4,56,12,20);p(c,'#fff5bf',x,60,4,10)}
    // Tea stall: shelves, tile roof, wooden boards, checkered awning.
    p(c,'#836347',342,22,280,124);p(c,'#583f30',350,30,264,102);p(c,'#bd905f',358,36,248,88);
    for(let x=364;x<604;x+=22){p(c,'#ad7b4e',x,38,2,82);p(c,'#d5a96e',x+2,40,2,76)}
    p(c,'#5e4734',366,60,236,6);p(c,'#5e4734',366,86,236,6);
    for(const x of [372,398,556,578]){p(c,'#466d63',x,68,14,18);p(c,'#c3d4ae',x+2,70,10,12);p(c,'#f3dfa4',x,66,14,4)}
    p(c,'#41362a',434,68,104,18);p(c,'#fbdf98',438,70,96,14);c.fillStyle='#704c30';c.font='bold 10px "Segoe UI",sans-serif';c.textAlign='center';c.fillText('LOC LY • TEA',486,81);c.textAlign='left';
    p(c,'#4d3b2d',340,22,286,8);for(let row=0;row<3;row++)for(let x=340;x<622;x+=24){p(c,'#764832',x,row*6+4,26,8);p(c,row%2?'#bc764b':'#d08953',x+2,row*6+4,22,4)}
    for(let x=342;x<622;x+=28){p(c,(x-342)%56?'#ead5a3':'#729164',x,92,28,18);p(c,(x-342)%56?'#cfb785':'#506d46',x,110,28,4)}
    p(c,'#523c2d',350,114,264,24);p(c,'#996d44',356,114,252,20);p(c,'#bc8e57',358,116,248,4);for(let x=360;x<608;x+=32)p(c,'#785334',x,122,2,12);
    glass(c,380,110,.6);snack(c,566,105,.62);p(c,'#557261',406,94,18,20);p(c,'#a6c6aa',408,96,14,14);p(c,'#3e544b',408,90,14,6);p(c,'#7c8d6b',424,98,6,4);
    // Welcome sign and soft grass at the entrance.
    p(c,'#7e5b3b',222,569,8,36);p(c,'#684a33',188,558,78,30);p(c,'#e8cf99',192,562,70,22);c.fillStyle='#76553c';c.font='bold 10px "Segoe UI",sans-serif';c.textAlign='center';c.fillText('COME ON IN',227,577);c.textAlign='left';
    for(const x of [307,584,792]){p(c,'#bdd494',x,590,10,4);p(c,'#91ae70',x+4,584,2,10)}
  }
  buildGround();
  function chair(c,seat,table,highlight=false){
    const x=seat.x,y=seat.y,vertical=Math.abs(y-table.y)>40;
    p(c,'#967b51',x-15,y+10,32,10);
    p(c,'#664f35',x-13,y-12,28,24);p(c,'#ba7b4c',x-11,y-10,24,22);p(c,'#dfa56a',x-9,y-10,20,4);
    if(vertical){const by=y<table.y?y-24:y+9;p(c,'#654a33',x-16,by,34,14);p(c,'#b97448',x-14,by+2,30,8);p(c,'#dfa26a',x-12,by+2,26,2);for(const sx of [-9,7])p(c,'#714a32',x+sx,by+2,2,8)}
    else {const bx=x<table.x?x-19:x+12;p(c,'#684d35',bx,y-18,8,40);p(c,'#c48852',bx+2,y-16,4,34)}
    p(c,'#63462f',x-12,y+11,4,10);p(c,'#63462f',x+10,y+11,4,10);p(c,'#ce9259',x-11,y+11,2,8);
    if(highlight){c.strokeStyle='#ffefaf';c.lineWidth=2;c.strokeRect(x-21,y-27,44,50)}
    if(!seat.walletId){p(c,'#496846',x-4,y-2,10,8);p(c,'#c1d591',x-2,y,6,2)}
  }
  function table(c,table,nearestId){
    const {x,y,width:w,height:h}=table;for(const seat of table.seats)chair(c,seat,table,seat.id===nearestId);
    p(c,'#b39060',x-w/2-6,y+h/2+6,w+20,12);p(c,'#664b31',x-w/2+9,y+h/2-4,8,18);p(c,'#664b31',x+w/2-15,y+h/2-4,8,18);
    p(c,'#654932',x-w/2-4,y-h/2-4,w+8,h+8);p(c,'#ad7746',x-w/2-2,y-h/2-2,w+4,h+4);p(c,'#d6a166',x-w/2,y-h/2-2,w,h-2);
    for(let i=12;i<h-4;i+=16){p(c,'#b98551',x-w/2+2,y-h/2+i,w-4,2);p(c,'#e1b37a',x-w/2+4,y-h/2+i+2,w-8,2)}
    for(let i=0;i<5;i++){const sx=x-w/2+10+rng(i,w)*(w-20),sy=y-h/2+8+rng(i,h)*(h-20);p(c,'#c38d54',sx,sy,10,2)}
    // Every table is laid with a tiny flower jar and coaster.
    p(c,'#b98850',x-8,y-18,18,12);p(c,'#658b71',x-4,y-30,8,16);p(c,'#b4d2b1',x-2,y-28,4,12);flower(c,x,y-32,'#f0d483');
    p(c,'#eacb91',x+w/2-23,y-h/2+7,18,11);c.fillStyle='#825d37';c.font='bold 8px "Segoe UI",sans-serif';c.fillText('#'+table.id.slice(1),x+w/2-21,y-h/2+16);
    p(c,'#714f35',x-21,y+6,42,18);p(c,'#f7dfaa',x-19,y+6,38,14);c.fillStyle='#765230';c.font='bold 10px "Segoe UI",sans-serif';c.textAlign='center';c.fillText(`${table.seats.filter(s=>s.walletId).length}/${table.capacity}`,x,y+17);c.textAlign='left';
  }
  function avatar(c,x,y,avatar,scale=1,seated=false,walking=false,time=0){
    c.save();c.translate(Math.round(x/2)*2,Math.round(y/2)*2);c.scale(scale,scale);
    const hair=avatar.hairColor||['#302622','#674533','#aa693e','#d6a453','#edcc7a','#a14948','#554671','#202829'][avatar.hair||0];
    const shirt=avatar.shirtColor||['#bd664c','#637fab','#6f945b','#d3a745','#9b77a5','#60998e','#d38d92','#e3d9b7'][avatar.clothes||0];
    const shoes=['#473d36','#924f37','#4b5876','#efebd9','#946740','#365c47'][avatar.shoes||0],swing=walking?Math.round(Math.sin(time/100))*2:0;
    p(c,'#9b8156',-13,12,28,8);p(c,'#483b31',-8,2,16,seated?10:14);p(c,'#676b62',-6,4,5,seated?7:12);p(c,'#727368',3,4,5,seated?7:12);
    p(c,shoes,-8,13+swing,8,4);p(c,shoes,3,13-swing,8,4);if(seated){p(c,shoes,-12,7,8,4);p(c,shoes,7,7,8,4)}
    p(c,'#594337',-9,-14,20,20);p(c,shirt,-7,-14,16,19);p(c,shirt,-12,-10,6,13);p(c,shirt,8,-10,6,13);p(c,'#e7ad79',-12,0,4,5);p(c,'#e7ad79',10,0,4,5);
    p(c,'#ead4a0',-1,-13,4,15);p(c,'#a18c5d',-1,-3,4,2);p(c,'#2d3430',-7,-15,16,4);
    p(c,'#795038',-8,-32,18,20);p(c,'#e2a575',-7,-30,16,18);p(c,'#f1c38b',-5,-29,12,14);p(c,'#d09262',-10,-24,4,6);p(c,'#d09262',9,-24,3,6);
    p(c,hair,-9,-34,20,8);p(c,hair,-10,-29,5,10);p(c,hair,7,-28,4,8);p(c,hair,-7,-35,15,2);
    p(c,'#513a2e',-4,-23,2,4);p(c,'#513a2e',4,-23,2,4);p(c,'#c77962',-6,-18,3,2);p(c,'#c77962',6,-18,3,2);p(c,'#a76549',0,-16,3,2);
    if((avatar.hair||0)%3===1){p(c,'#a9af65',-10,-35,22,4);p(c,'#c9c88b',-8,-39,16,6);p(c,'#717d4e',-8,-35,16,2)}
    c.restore();
  }
  function menu(canvas,kind){if(!canvas)return;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,80,80);kind==='tea'?glass(c,40,48,1.8):snack(c,40,48,1.35)}
  return {ground:layer,table,avatar,glass,snack,menu};
})();
