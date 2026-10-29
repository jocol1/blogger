(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./movement'));else root.TeaPrediction=factory(root.TeaMotion);})(typeof globalThis!=='undefined'?globalThis:this,M=>blocked=>{
  let position={x:0,y:0},pending=[],samples=[],seq=0,ack=0,lastSend=-Infinity,correction={x:0,y:0};
  return{get position(){return position;},get pending(){return pending;},
    reset(p,keepSequence=false){position={x:p.x,y:p.y};pending=[];samples=[];correction={x:0,y:0};if(!keepSequence){seq=0;ack=0;}else ack=seq;lastSend=-Infinity;},
    step(input){
      if(pending.length>=40){
        // Keep one stop acknowledgement available even when prediction is suspended.
        const last=samples.at(-1)||pending.at(-1)?.samples.at(-1);
        if(input.dx||input.dy||last&& !last.dx&&!last.dy)return{distance:0};
      }
      samples.push({...input});return M.step(position,input,input.ms/1000,blocked);
    },
    packet(at){if(at-lastSend<50||!samples.length)return null;const packet={v:2,seq:++seq,samples};samples=[];pending.push(packet);lastSend=at;return packet;},
    ack(message){if(!Number.isSafeInteger(message.ack)||message.ack<=ack||message.ack>seq)return;ack=message.ack;const previous={...position};pending=pending.filter(p=>p.seq>ack);position=M.replay(message,pending,ack,blocked);for(const sample of samples)M.step(position,sample,sample.ms/1000,blocked);const x=previous.x-position.x,y=previous.y-position.y;if(Math.hypot(x,y)>64){correction={x:0,y:0};}else{correction.x+=x;correction.y+=y;}},
    visual(dt,reduced){const ease=reduced?0:Math.exp(-18*dt);correction.x*=ease;correction.y*=ease;const p={x:position.x+correction.x,y:position.y+correction.y};return blocked(p.x,p.y)?{...position}:p;}
  };
});
