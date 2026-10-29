(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TeaFarmTools=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const stage=(row,seconds,now)=>row.readyAt===null?0:row.readyAt<=now?4:1+Math.min(2,Math.floor(Math.max(0,1-(row.readyAt-now)/(seconds*1000))*3));
 function resolve(farm,catalog,target,tool,seed,now){
  if(!target)return{label:'findPatch'};const {panel,slot}=target,animal=['chicken','pig'].includes(panel),fish=panel==='pond',garden=panel==='garden';
  if(!animal&&!fish&&!garden)return{open:true,label:'interact'};
  const row=animal?farm.animals?.[panel]?.[slot]:(fish?farm.ponds:farm.plots)?.[slot];
  if(tool==='inspect')return animal&&row?{pet:true,label:'pet'}:{open:true,label:'inspect'};
  if(!row){
   if(animal)return{open:true,label:'adopt'};
   if(tool!=='seed')return{suggest:'seed',label:'selectSeed'};
   const category=fish?'fish':'crop';if(catalog[seed]?.type!==category||!(farm.seeds[seed]>0))return{choose:category,label:fish?'chooseFish':'chooseSeed'};
   return{action:{type:fish?'stock':'plant',item:seed,slot},label:fish?'stock':'plant'};
  }
  const needed=row.readyAt===null?(garden?'water':'feed'):row.readyAt<=now?'collect':null;
  if(!needed)return{label:'growingStatus',waiting:true};
  if(tool!==needed)return{suggest:needed,label:needed==='collect'?'selectBasket':needed==='water'?'selectWater':'selectFeed'};
  const type=needed==='collect'?(animal?'collectAnimal':fish?'catch':'harvest'):(animal?'feedAnimal':needed);
  return{action:{type,slot,cycleId:row.cycleId,...(animal?{kind:panel}:{})},label:needed==='collect'?(animal?panel==='chicken'?'collectEgg':'collectPig':type):needed};
 }
 function icon(c,key,x=24,y=26,size=1){c.save();c.translate(x,y);c.scale(size,size);const p=(color,x,y,w,h)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  if(key==='water'){p('#3e676b',-13,-7,22,18);p('#8dbeb7',-11,-5,18,13);p('#527e80',8,-5,14,5);p('#9ed7d5',19,-3,5,7);p('#456c70',-18,-4,5,11);p('#e4eee0',-7,-9,9,3);}
  else if(key==='seed'){p('#8c6846',-12,-14,24,29);p('#d3bc83',-10,-12,20,25);p('#f2dfb1',-10,-11,20,5);p('#628343',-2,-4,3,13);p('#83a153',-8,-5,7,4);p('#4d763e',1,-8,8,5);}
  else if(key==='feed'){p('#92734e',-14,-7,28,22);p('#dac18b',-11,-10,22,22);p('#e1ac4f',-13,-14,26,8);for(let i=0;i<5;i++)p('#f4db8d',-9+i*4,-15+(i%2)*3,3,3);p('#94774d',-6,-1,12,3);}
  else if(key==='collect'){p('#745836',-13,-8,4,13);p('#745836',9,-8,4,13);p('#745836',-9,-12,18,4);p('#b88b54',-16,1,32,16);p('#e1ba76',-18,-2,36,5);for(let i=0;i<5;i++)p('#d3aa66',-12+i*6,4,3,10);}
  else{p('#c18b65',-9,-6,18,21);p('#edc49a',-7,-9,15,22);for(let i=0;i<4;i++)p('#edc49a',-8+i*5,-17+(i%2)*2,4,17);p('#d6a77f',-15,-1,7,10);}
  c.restore();
 }
 // Smooth deterministic wander with a resting interval, confined to each animal's half-pen.
 function animalPose(kind,slot,time,reduced){const phase=(time/1000+slot*3.7+(kind==='pig'?2:0))%12,t=phase<8?phase/8:1,s=t*t*(3-2*t),angle=s*Math.PI*2;return{x:reduced?0:Math.sin(angle)*24,y:reduced?0:(Math.cos(angle)-1)*13,flip:phase<4,peck:!reduced&&phase>=8};}
 return{resolve,stage,icon,animalPose};
});
