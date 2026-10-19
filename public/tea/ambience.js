/* Café ambience follows the same Vietnam clock for every visitor. */
(function(root){
  const HOUR=3_600_000,DAY=24*HOUR;
  const clamp=value=>Math.max(0,Math.min(1,value));
  const smooth=value=>{const t=clamp(value);return t*t*(3-2*t)};
  function timeAt(now){
    const local=((now+7*HOUR)%DAY+DAY)%DAY,hour=local/HOUR;
    const night=hour<5||hour>=20?1:hour<7?1-smooth((hour-5)/2):hour<18?0:smooth((hour-18)/2);
    const phase=hour<5||hour>=20?'night':hour<7?'dawn':hour<18?'day':'dusk';
    const pad=n=>String(n).padStart(2,'0');
    return {night,phase,clock:`${pad(Math.floor(hour))}:${pad(Math.floor(local/60000)%60)}:${pad(Math.floor(local/1000)%60)}`};
  }
  function trafficAt(now,reduced=false){
    if(reduced)return [];
    const cars=[];
    for(let lane=0;lane<2;lane++){
      const cycle=lane?37000:29000,shift=lane?13500:0,t=now+shift,slot=Math.floor(t/cycle),elapsed=((t%cycle)+cycle)%cycle,duration=lane?8500:7500;
      if(elapsed>=duration)continue;
      const fraction=elapsed/duration,direction=lane?-1:1;
      cars.push({x:direction===1?-90+fraction*1140:1050-fraction*1140,y:lane?622:578,direction,color:['#bb6049','#67979a','#d3b157','#6b85b2'][((slot+lane)%4+4)%4],scooter:slot%3!==0});
    }
    return cars;
  }
  function rect(c,color,x,y,w,h){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h)}
  function vehicles(c,now,reduced){
    const {night}=timeAt(now);
    for(const car of trafficAt(now,reduced)){
      c.save();c.translate(Math.round(car.x/2)*2,car.y);c.scale(car.direction,1);
      if(night>.1){c.fillStyle=`rgba(255,238,169,${night*.2})`;c.beginPath();c.moveTo(22,-5);c.lineTo(100,-17);c.lineTo(100,17);c.lineTo(22,5);c.fill()}
      rect(c,'#373e40',-28,9,58,5);
      if(car.scooter){
        rect(c,'#252e32',-20,-9,10,5);rect(c,'#252e32',-20,7,10,5);rect(c,'#252e32',16,-9,10,5);rect(c,'#252e32',16,7,10,5);
        rect(c,car.color,-24,-6,49,14);rect(c,'#eee0be',20,-4,7,10);rect(c,'#45463c',-11,-4,22,10);rect(c,'#526b4d',-6,-12,15,17);
        rect(c,'#e4af78',6,-6,13,4);rect(c,'#ddc49e',-4,-15,12,8);rect(c,'#f1dfb6',-2,-16,8,3);
      }else{
        rect(c,'#262f33',-27,-16,14,6);rect(c,'#262f33',15,-16,14,6);rect(c,'#262f33',-27,12,14,6);rect(c,'#262f33',15,12,14,6);
        rect(c,'#38413d',-38,-13,78,28);rect(c,car.color,-36,-12,74,26);rect(c,'#d1d7c7',-14,-12,34,26);rect(c,'#527d85',10,-10,10,22);rect(c,'#517a81',-16,-10,8,22);rect(c,car.color,-7,-11,16,24);
        rect(c,'#fff0b6',34,-10,6,6);rect(c,'#fff0b6',34,6,6,6);rect(c,'#c95740',-38,-10,4,6);rect(c,'#c95740',-38,6,4,6);
      }c.restore();
    }
  }
  let shade;
  function lighting(c,now){
    const {night,phase}=timeAt(now);
    if(phase==='dusk'||phase==='dawn'){c.fillStyle=`rgba(231,152,81,${.09*Math.sin(night*Math.PI)})`;c.fillRect(0,0,960,640)}
    if(night<=0)return;
    if(!shade){
      shade=document.createElement('canvas');shade.width=960;shade.height=640;const s=shade.getContext('2d');s.fillStyle='#101b39';s.fillRect(0,0,960,640);s.globalCompositeOperation='destination-out';
      for(const [x,y,r] of [[196,88,130],[792,88,130],[480,145,165],[160,470,110],[740,475,110]]){const glow=s.createRadialGradient(x,y,8,x,y,r);glow.addColorStop(0,'rgba(0,0,0,.9)');glow.addColorStop(1,'rgba(0,0,0,0)');s.fillStyle=glow;s.fillRect(x-r,y-r,r*2,r*2)}
    }
    c.save();c.globalAlpha=night*.64;c.drawImage(shade,0,0);c.globalAlpha=night;
    for(const [x,y] of [[196,65],[792,65],[390,155],[474,155],[558,155]]){rect(c,'#ffe2a0',x-4,y-4,8,10);rect(c,'#fff5cb',x-2,y-2,4,5)}
    // Warm strings of lanterns along the pavement, steady rather than flashing.
    for(const x of [70,250,430,610,790,910]){rect(c,'#5e4c3c',x,515,2,25);rect(c,'#d8ac65',x-4,510,10,10);rect(c,'#ffedb0',x-2,510,6,7)}
    c.restore();
  }
  const api={timeAt,trafficAt,vehicles,lighting};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.TeaAmbience=api;
})(typeof window!=='undefined'?window:globalThis);
