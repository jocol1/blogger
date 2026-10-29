(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TeaFishingRules=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const tiers={common:{required:2,width:.34,period:2200},uncommon:{required:2,width:.28,period:2000},rare:{required:3,width:.22,period:1900},legendary:{required:4,width:.18,period:1800}};
 const position=(at,start,period=2000)=>1-Math.abs(((Math.max(0,at-start)/(period/2))%2)-1);
 const hit=(at,round)=>Math.abs(position(at,round.reelAt,round.period)-.5)<=(round.width||.34)/2;
 return{tiers,position,hit};
});
