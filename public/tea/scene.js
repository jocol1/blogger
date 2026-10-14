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
    // A modest sidewalk café right beside a Vietnamese neighborhood street.
    p(c,'#898173',0,0,960,640);
    for(let i=0;i<1000;i++){const x=rng(i,1)*960,y=rng(i,2)*640;p(c,i%3?'#938b7d':'#7d776d',x,y,4,2)}
    p(c,'#776451',12,66,936,492);p(c,'#c6b59a',18,68,924,482);p(c,'#b9a88e',24,74,912,470);
    for(let y=78;y<538;y+=28)for(let x=28;x<934;x+=44){const offset=(Math.floor(y/28)%2)*22;p(c,'#9d8b72',x-offset,y,42,26);p(c,rng(x,y)>.35?'#c7b59a':'#c0ae93',x-offset+2,y+2,38,22);p(c,'#d4c2a5',x-offset+4,y+2,32,2);if(rng(y,x)>.72)p(c,'#ad9a80',x-offset+10,y+17,12,2)}
    // The shop's awning shades the first row; the open pavement stays walkable.
    p(c,'#ad7654',26,303,908,10);p(c,'#e7d7bb',26,313,908,5);
    for(let x=34;x<936;x+=48){p(c,'#f0e1c7',x,315,28,2)}
    // Curb, gutter and road: tables sit on the pavement, feet almost at the street.
    p(c,'#61594f',0,544,960,16);p(c,'#ded2bb',0,544,960,6);p(c,'#a89a82',0,550,960,6);
    for(let x=8;x<960;x+=36){p(c,'#796f62',x,552,30,3);p(c,'#c3b8a3',x+2,553,24,1)}
    p(c,'#55534e',0,560,960,80);for(let i=0;i<700;i++){const x=rng(i,17)*960,y=560+rng(i,23)*80;p(c,i%4?'#5d5b55':'#66635d',x,y,4,2)}
    p(c,'#e8d8ae',102,596,116,4);p(c,'#e8d8ae',390,596,116,4);p(c,'#e8d8ae',678,596,116,4);
    // A low painted shopfront and a few pots replace the garden border.
    for(let x=20;x<960;x+=40){p(c,'#8d6650',x,0,36,54);p(c,'#b4805c',x+2,0,32,46);p(c,'#c69a70',x+4,5,24,34);p(c,'#705545',x+14,8,3,30);p(c,'#e1c39a',x+6,42,24,3)}
    for(const x of [38,922]){pot(c,x,104);p(c,'#6c7d70',x-8,86,18,14);p(c,'#aab89b',x-6,88,14,10)}
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
    // A striped plastic awning over the sidewalk tea stall.
    p(c,'#f1d6a8',340,140,284,8);for(let x=342;x<620;x+=28){p(c,(x-342)%56?'#d45d42':'#e8c980',x,148,26,14);p(c,'#a24b37',x,160,26,3)}
    p(c,'#665444',188,509,108,26);p(c,'#ead8b6',192,513,100,18);c.fillStyle='#654b39';c.font='bold 9px "Segoe UI",sans-serif';c.textAlign='center';c.fillText('TRÀ ĐÁ • VỈA HÈ',242,525);c.textAlign='left';
    for(const x of [314,644,802]){p(c,'#74905e',x,526,8,10);p(c,'#9baf70',x-4,522,14,4)}
  }
  buildGround();
  function chair(c,seat,table,highlight=false){
    const x=seat.x,y=seat.y,colors=['#447e9c','#c54e3e','#5c8b54','#d59b3f'],color=colors[(Number(seat.id.split('-').at(-1))-1)%colors.length];
    // Tiny Vietnamese sidewalk plastic stool: low legs, chunky seat, no dining-chair back.
    p(c,'#716657',x-10,y+8,22,4);p(c,'#5c554b',x-8,y+2,3,9);p(c,'#5c554b',x+6,y+2,3,9);
    p(c,'#263e43',x-13,y-3,28,8);p(c,color,x-12,y-5,26,8);p(c,'#e1c6a0',x-9,y-4,20,2);p(c,'#fff0cd',x-12,y-5,3,2);
    if(highlight){c.strokeStyle='#fff0a9';c.lineWidth=2;c.strokeRect(x-16,y-9,34,24)}
  }
  function table(c,table,nearestId){
    const {x,y,width:w,height:h}=table,occupied=table.seats.filter(s=>s.walletId).length;
    for(const seat of table.seats)chair(c,seat,table,seat.id===nearestId);
    // Short metal legs and a small, colorful plastic top like a sidewalk tea table.
    for(const [dx,dy] of [[-w/2+8,-h/2+7],[w/2-8,-h/2+7],[-w/2+8,h/2-5],[w/2-8,h/2-5]]){
      p(c,'#555149',x+dx-2,y+dy,4,h/2+9);p(c,'#84796a',x+dx-1,y+dy+2,2,h/2+6);
    }
    p(c,'#454038',x-w/2-3,y-h/2+1,w+8,h+8);p(c,'#c64f3d',x-w/2-2,y-h/2-2,w+4,h+5);
    p(c,table.capacity===8?'#52859b':table.capacity===4?'#4f875b':'#cd543f',x-w/2,y-h/2-4,w,h+2);
    p(c,'#e58a58',x-w/2+3,y-h/2-3,w-6,3);p(c,'#f0d9ad',x-w/2+5,y-h/2-1,w-10,2);
    for(let i=0;i<4;i++){const sx=x-w/2+8+rng(i,w)*(w-16),sy=y-h/2+6+rng(i,h)*(h-12);p(c,'#ffffff35',sx,sy,5,2)}
    // One tiny tea glass and a share plate make the tables read as tea-stall tables.
    glass(c,x-8,y+1,.38);p(c,'#756147',x+9,y+5,12,3);p(c,'#e8d8b4',x+8,y+2,14,4);p(c,'#ca8a4d',x+10,y,4,3);p(c,'#d79b55',x+15,y,4,3);
    c.fillStyle='#3f382f';c.font='bold 8px "Segoe UI",sans-serif';c.textAlign='center';c.fillText(`${occupied}/${table.capacity}`,x,y+h/2+16);c.textAlign='left';
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
