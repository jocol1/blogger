window.TeaFarmRanch={
  scenery(c,p,locale){
    for(const [left,kind] of [[810,'chicken'],[1080,'pig']]){
      p(c,'#8c7750',left,735,235,130);p(c,kind==='chicken'?'#c8b67a':'#b99979',left+7,742,221,116);
      p(c,'#9d7950',left+15,709,75,61);p(c,'#d9bb82',left+20,715,65,49);p(c,kind==='chicken'?'#8b6245':'#7e8980',left+6,700,95,17);
      p(c,'#5b513c',left+40,741,23,25);p(c,'#dbc99a',left+112,763,54,9);
      for(let x=left;x<=left+235;x+=23){p(c,'#e5cc94',x,824,5,42);p(c,'#b49664',x,846,24,4);}
      p(c,'#aa895c',left,735,235,5);p(c,'#dfc28b',left+1,828,234,5);
      p(c,'#566e65',left+153,839,50,11);p(c,'#b0c7a5',left+156,838,44,4);
      c.font='bold 12px system-ui';c.textAlign='center';c.fillStyle='#455d40';c.fillText(locale==='vi'?(kind==='chicken'?'CHUỒNG GÀ':'CHUỒNG HEO'):(kind==='chicken'?'CHICKENS':'PIGS'),left+132,729);
    }
    p(c,'#d0be8c',550,880,780,25);
  },
  item(c,p,item,time=0){
    const bob=time?Math.sin(time/230)*1.2:0;c.save();c.translate(0,bob);
    if(item==='egg'){p(c,'#b3a381',-8,8,17,3);p(c,'#e8dbb7',-7,-7,14,16);p(c,'#fff5d8',-5,-11,10,18);p(c,'#fffbed',-3,-10,4,5);}
    else if(item==='chicken'){
      p(c,'#8b7448',-10,9,22,3);p(c,'#d8933b',-5,6,3,7);p(c,'#d8933b',5,6,3,7);p(c,'#c5b68d',-11,-4,23,13);p(c,'#fff1ce',-10,-8,21,14);p(c,'#e8d6a6',-7,-2,10,8);p(c,'#fff4d9',7,-17,10,15);p(c,'#b75c46',10,-21,5,6);p(c,'#d39b45',17,-11,6,4);p(c,'#37453a',12,-13,2,3);p(c,'#e4cc99',-15,-11,6,8);
    }else{
      p(c,'#9b7b61',-20,10,40,4);p(c,'#af7770',-15,7,6,8);p(c,'#af7770',9,7,6,8);p(c,'#c78b83',-22,-10,43,21);p(c,'#e8b0a1',-20,-12,39,20);p(c,'#f0c0ac',-15,-10,24,8);p(c,'#d9958c',14,-5,14,13);p(c,'#eeafa1',19,-2,10,7);p(c,'#976a66',22,0,2,3);p(c,'#976a66',26,0,2,3);p(c,'#d29086',10,-17,7,9);p(c,'#37453a',16,-8,2,3);p(c,'#bb8378',-26,-7,6,4);
    }c.restore();
  }
};
