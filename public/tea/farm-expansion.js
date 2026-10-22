window.TeaFarmExpansion=(c,p,tree,world,locale)=>{
  // Connected paths, an original little market and a quiet orchard.
  p(c,'#b4b477',920,520,950,42);p(c,'#d0be8c',920,528,950,25);
  p(c,'#b4b477',490,620,110,630);p(c,'#d0be8c',500,620,90,630);
  p(c,'#b4b477',1600,540,55,710);p(c,'#d0be8c',1608,540,39,710);
  p(c,'#b4b477',100,1200,1760,40);p(c,'#d0be8c',100,1207,1760,26);
  p(c,'#d0be8c',1310,1130,335,30);
  for(let i=0;i<90;i++)p(c,'#bea97b',950+(i*73)%890,533+(i%3)*5,7,3);
  // The south pond matches the first pond's scale, rather than shrinking the scene.
  c.save();c.translate(685,600);
  p(c,'#6d8a59',648,231,256,286);p(c,'#b3b891',652,237,246,270);p(c,'#4f8585',663,247,225,253);p(c,'#639e9c',673,254,205,236);p(c,'#77b0a5',680,262,188,223);
  for(let i=0;i<12;i++){p(c,'#9ac6b0',680+(i*31)%170,270+(i*53)%210,19,3);p(c,'#4b8154',657+(i%2)*237,255+i*17,4,17);}c.restore();
  // Market awning, produce crates, counter and shipping box.
  p(c,'#8c744e',1655,450,205,15);p(c,'#b48b58',1670,370,175,82);p(c,'#dcc28c',1676,375,163,70);
  p(c,'#684d37',1660,335,8,119);p(c,'#684d37',1843,335,8,119);
  for(let i=0;i<8;i++){p(c,i%2?'#f3dfac':'#628e7c',1650+i*26,320,26,36);p(c,i%2?'#d8c491':'#497a69',1650+i*26,353,26,8);}
  for(let i=0;i<3;i++){p(c,'#987247',1685+i*48,396,40,30);p(c,'#c39a60',1688+i*48,400,34,23);for(let j=0;j<3;j++)p(c,['#d07856','#a4b76b','#e1bd64'][i],1691+i*48+j*10,392,8,11);}
  p(c,'#755b40',1785,484,60,44);p(c,'#b78e59',1788,487,54,36);p(c,'#e5d29a',1797,495,36,14);p(c,'#627f5d',1809,499,12,6);
  for(const pos of world.orchard){tree(c,pos.x,pos.y,1.05);for(const [dx,dy]of[[-16,-25],[15,-32],[4,-8]]){p(c,'#b95741',pos.x+dx,pos.y+dy,7,8);p(c,'#e48c60',pos.x+dx+1,pos.y+dy,3,3);}}
  p(c,'#b49163',760,1195,64,10);p(c,'#74563e',766,1205,7,14);p(c,'#74563e',811,1205,7,14);
  // Bulletin board opens tasks; each sign has a visible interaction label.
  p(c,'#806143',616,779,6,57);p(c,'#b38c5d',600,754,100,65);p(c,'#e8d6a9',606,760,88,52);
  for(let i=0;i<3;i++){p(c,'#fff3d0',612+i*25,769,20,29);p(c,'#a39773',615+i*25,776,14,2);}
  const sign=(x,y,en,vi)=>{p(c,'#785c40',x-3,y,6,32);p(c,'#d6bb85',x-66,y-19,132,23);c.font='bold 11px system-ui';c.textAlign='center';c.fillStyle='#385440';c.fillText(locale==='vi'?vi:en,x,y-3);};
  sign(1230,580,'EAST FIELDS','RUỘNG PHÍA ĐÔNG');sign(1180,1160,'SOUTH POND →','AO PHÍA NAM →');sign(330,1235,'ORCHARD','VƯỜN CÂY');sign(1750,470,'SHOP','CỬA HÀNG');sign(1815,559,'SELL BASKET','BÁN NÔNG SẢN');sign(650,850,'TASKS','NHIỆM VỤ');
  for(let x=80;x<1950;x+=80){tree(c,x,1370,.7);if(x>1000)tree(c,x,60,.9);}
  for(let y=120;y<1300;y+=95)tree(c,1960,y,.8);
};
