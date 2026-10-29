const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const M=require('../public/tea/movement'),prediction=require('../public/tea/prediction');
test('held-key autorepeat cannot restart movement after a control reset',()=>{
 const listeners={},element=()=>({style:{},classList:{add(){},remove(){}},append(){},setAttribute(){},querySelector(){return element();},hasPointerCapture(){return false;}});
 const context={window:{},TeaMotion:M,document:{createElement:element,body:{},addEventListener(){},querySelector(){return null;}},localStorage:{getItem(){return null;}},MutationObserver:class{observe(){}},addEventListener:(name,fn)=>{(listeners[name]||=[]).push(fn);},setTimeout(){}};
 vm.runInNewContext(fs.readFileSync('public/tea/walk-controls.js','utf8'),context);
 const keys=new Set(),controls=context.window.TeaWalkControls({canvas:{parentElement:element()},keys,allowed:()=>true,cancel(){},locale:()=> 'en'});
 const key=repeat=>listeners.keydown.forEach(fn=>fn({key:'w',repeat,target:{closest(){return null;}},preventDefault(){}}));
 key(false);assert.equal(controls.vector().y,-1);controls.reset();key(true);assert.equal(controls.vector().y,0);
 listeners.keyup.forEach(fn=>fn({key:'w'}));key(false);assert.equal(controls.vector().y,-1);
});
test('reconnect rebuilds remote poses from the authoritative snapshot even without new movement',()=>{
 const state={room:{tables:[]},guests:[{walletId:'me',x:100,y:550},{walletId:'other',x:200,y:550,facing:'right'}]};
 const context={window:{},TeaMotion:M,TeaPrediction:prediction,TeaWorld:{blocked:()=>false},TeaWalkControls:({cancel})=>({reset:cancel,zoom:1}),performance:{now:()=>1000}};
 vm.runInNewContext(fs.readFileSync('public/tea/cafe-walker.js','utf8'),context);
 const walker=context.window.TeaCafeWalker({canvas:{dataset:{}},keys:new Set(),state:()=>state,myId:()=> 'me',connected:()=>true,allowed:()=>true,locale:()=> 'en',send(){}});
 walker.snapshot(true);assert.equal(walker.pose(state.guests[1],1200).x,200);state.guests[1].x=500;walker.snapshot(true);const pose=walker.pose(state.guests[1],1500);assert.equal(pose.x,500);assert.equal(pose.facing,'right');
});
test('a full prediction queue still sends a stop to settle after a transport stall',()=>{
 const p=prediction(()=>false),packets=[];p.reset({x:0,y:0});for(let i=1;i<=40;i++){p.step({dx:1,dy:0,mode:'run',ms:50});packets.push(p.packet(i*50));}
 p.step({dx:0,dy:0,mode:'run',ms:0});const stop=p.packet(2050);assert.ok(stop,'Stop must survive a full queue');assert.equal(stop.samples[0].dx,0);
 for(let i=0;i<20;i++){p.step({dx:0,dy:0,mode:'run',ms:0});assert.equal(p.packet(2100+i*50),null);}assert.equal(p.pending.length,41);
 const {applyMovement}=require('../features/tea/movement'),server={socketId:'s',connected:true,x:0,y:0,moveAt:0};for(const packet of packets)applyMovement(server,packet,'s',2000,()=>false);
 const ack=applyMovement(server,stop,'s',2000,()=>false);p.ack(ack);assert.equal(p.pending.length,0);assert.equal(p.position.x,server.x);assert.equal(p.position.x,11.25);
});
