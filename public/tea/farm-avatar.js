// Original four-direction farm character. Café artwork is kept independent.
window.TeaFarmAvatar=(c,x,y,profile,direction,stride,walking,reduced,working=false)=>{
  const p=(color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  const hair=profile.hairColor||['#302622','#674533','#aa693e','#d6a453','#edcc7a','#a14948','#554671','#202829'][profile.hair||0];
  const shirt=profile.shirtColor||['#bd664c','#637fab','#6f945b','#d3a745','#9b77a5','#60998e','#d38d92','#e3d9b7'][profile.clothes||0];
  const shoes=['#473d36','#924f37','#4b5876','#efebd9','#946740','#365c47'][profile.shoes||0];
  const swing=walking&&!reduced?Math.round(Math.sin(stride/8)*3):0,bob=walking&&!reduced?Math.abs(swing)*.35:0;
  c.save();c.translate(x,y);c.scale(1.15,1.15);
  c.globalAlpha=.24;c.fillStyle='#314d34';c.beginPath();c.ellipse(0,13,13,4,0,0,Math.PI*2);c.fill();c.globalAlpha=1;
  c.translate(0,-bob+(working&&!reduced?1:0));if(direction==='left')c.scale(-1,1);
  const side=direction==='left'||direction==='right';
  p('#46504a',-7,1,14,12);p('#707b69',-6,3,5,10);p('#626e5e',2,3,5,10);
  p(shoes,-7,12+swing,6,4);p(shoes,2,12-swing,7,4);
  p('#334c3a',-9,-15,18,19);p(shirt,-8,-14,16,17);p('#dee1b9',-7,1,14,2);
  p(shirt,side?-4:-12,-12+swing,side?7:5,12);p('#e7b481',side?-3:-12,swing,4,5);
  if(!side){p(shirt,8,-12-swing,5,12);p('#e7b481',9,-swing,4,5);}
  p('#795038',-9,-32,18,18);p('#f1c38b',-8,-30,16,15);
  p(hair,-10,-33,20,7);p(hair,-10,-28,4,12);
  if(direction==='up'){p(hair,-9,-28,18,13);p('#ead4a0',-3,-15,6,2);p('#d6d6a3',-6,-10,12,2);}
  else if(side){p(hair,-8,-28,10,9);p('#f1c38b',8,-23,4,5);p('#3b3530',5,-25,2,3);p('#d58f6a',5,-19,3,2);}
  else{p(hair,6,-28,4,8);p('#3b3530',-5,-25,2,3);p('#3b3530',3,-25,2,3);p('#d58f6a',-7,-20,3,2);p('#d58f6a',5,-20,3,2);p('#ac7955',-1,-17,3,1);p('#ead4a0',-1,-12,3,12);}
  if((profile.hair||0)%3===1){p('#a9af65',-11,-34,22,4);p('#c9c88b',-8,-39,16,6);p('#717d4e',-8,-34,16,2);}
  c.restore();
};
