const M=require('../../public/tea/movement');
function applyMovement(player,input,socketId,at,blocked){
  if(socketId!==player.socketId||!player.connected||player.seatId||!Number.isSafeInteger(input.seq)||input.seq<1||input.seq<=(player.moveSeq||0))return null;
  const rows=input.samples;if(!Array.isArray(rows)||!rows.length||rows.length>24)return null;
  if(rows.some(r=>!r||!Number.isFinite(r.dx)||!Number.isFinite(r.dy)||!Number.isFinite(r.ms)||r.ms<0||r.ms>50||!['run','walk'].includes(r.mode)||(r.distance!==undefined&&(!Number.isFinite(r.distance)||r.distance<0))))return null;
  if(rows.reduce((sum,r)=>sum+r.ms,0)>150)return null;
  const stop=rows.every(r=>!r.dx&&!r.dy);if(!stop&&at-(player.moveReceivedAt??-Infinity)<16)return null;
  let budget=Math.min(150,(player.moveBudget||0)+Math.max(0,at-(player.moveAt??at)));
  let last={dx:0,dy:0,distance:0},duration=0;
  for(const row of rows){const ms=Math.min(budget,row.ms);budget-=ms;last=M.step(player,row,ms/1000,blocked);duration=ms;if(row.dx||row.dy)player.facing=last.facing;}
  Object.assign(player,{moveProtocol:2,moveSeq:input.seq,moveAt:at,moveReceivedAt:at,moveBudget:budget,movedAt:at});
  const walking=last.distance>.001,ratio=duration?1000/duration:0;
  return{v:2,walletId:player.walletId,ack:input.seq,x:player.x,y:player.y,facing:player.facing||'down',walking,vx:last.dx*ratio,vy:last.dy*ratio,serverNow:at};
}
module.exports={applyMovement};
