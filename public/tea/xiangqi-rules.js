// Xiangqi rules and AI shared by the server (authoritative) and the browser (move hints).
// Board: 90-char string, index = row*9+col, row 0 is Black's back rank, row 9 is Red's.
// Uppercase = Red, lowercase = Black. K king, A advisor, B elephant, N horse, R chariot, C cannon, P soldier.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TeaXiangqiRules=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const START='rnbakabnr'+'.........'+'.c.....c.'+'p.p.p.p.p'+'.........'+'.........'+'P.P.P.P.P'+'.C.....C.'+'.........'+'RNBAKABNR';
 const RED='red',BLACK='black';
 const sideOf=p=>p==='.'||!p?null:p===p.toUpperCase()?RED:BLACK;
 const other=s=>s===RED?BLACK:RED;
 const ON=(r,c)=>r>=0&&r<10&&c>=0&&c<9;
 const inPalace=(r,c,s)=>c>=3&&c<=5&&(s===RED?r>=7:r<=2);
 const ownHalf=(r,s)=>s===RED?r>=5:r<=4;
 const ORTHO=[[-1,0],[1,0],[0,-1],[0,1]],DIAG=[[-1,-1],[-1,1],[1,-1],[1,1]];
 const HORSE=[[-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],[-1,-2,0,-1],[1,-2,0,-1],[-1,2,0,1],[1,2,0,1]];

 // Pseudo-legal moves for the piece on sq (ignores own-king safety). b is an array of chars.
 function pseudo(b,sq,out){
  const p=b[sq],s=sideOf(p),r=(sq/9)|0,c=sq%9,t=p.toUpperCase();
  const add=(rr,cc)=>{const to=rr*9+cc,q=b[to];if(q==='.'||sideOf(q)!==s)out.push(sq*90+to);};
  if(t==='R'||t==='C'){
   for(const [dr,dc] of ORTHO){let rr=r+dr,cc=c+dc,jumped=false;
    while(ON(rr,cc)){const q=b[rr*9+cc];
     if(!jumped){if(q==='.')out.push(sq*90+rr*9+cc);else{if(t==='R'){if(sideOf(q)!==s)out.push(sq*90+rr*9+cc);break;}jumped=true;}}
     else if(q!=='.'){if(sideOf(q)!==s)out.push(sq*90+rr*9+cc);break;}
     rr+=dr;cc+=dc;}}
  }else if(t==='N'){
   for(const [dr,dc,lr,lc] of HORSE){const rr=r+dr,cc=c+dc;if(ON(rr,cc)&&b[(r+lr)*9+c+lc]==='.')add(rr,cc);}
  }else if(t==='B'){
   for(const [dr,dc] of DIAG){const rr=r+2*dr,cc=c+2*dc;if(ON(rr,cc)&&ownHalf(rr,s)&&b[(r+dr)*9+c+dc]==='.')add(rr,cc);}
  }else if(t==='A'){
   for(const [dr,dc] of DIAG){const rr=r+dr,cc=c+dc;if(ON(rr,cc)&&inPalace(rr,cc,s))add(rr,cc);}
  }else if(t==='K'){
   for(const [dr,dc] of ORTHO){const rr=r+dr,cc=c+dc;if(ON(rr,cc)&&inPalace(rr,cc,s))add(rr,cc);}
  }else if(t==='P'){
   const f=s===RED?-1:1;if(ON(r+f,c))add(r+f,c);
   if(!ownHalf(r,s)){if(c>0)add(r,c-1);if(c<8)add(r,c+1);}
  }
 }
 const findKing=(b,s)=>b.indexOf(s===RED?'K':'k');
 // Is square sq (a king's square) attacked by side `by`? Includes the flying-general rule.
 function attacked(b,sq,by){
  const r=(sq/9)|0,c=sq%9,R=by===RED?'R':'r',C=by===RED?'C':'c',N=by===RED?'N':'n',P=by===RED?'P':'p',K=by===RED?'K':'k';
  for(const [dr,dc] of ORTHO){let rr=r+dr,cc=c+dc,screen=false;
   while(ON(rr,cc)){const q=b[rr*9+cc];
    if(q!=='.'){if(!screen){if(q===R||(q===K&&dc===0))return true;screen=true;}else{if(q===C)return true;break;}}
    rr+=dr;cc+=dc;}}
  for(const [dr,dc] of [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[1,-2],[-1,2],[1,2]]){
   const kr=r+dr,kc=c+dc;if(!ON(kr,kc)||b[kr*9+kc]!==N)continue;
   const lr=Math.abs(dr)===2?kr-Math.sign(dr):kr,lc=Math.abs(dr)===2?kc:kc-Math.sign(dc);
   if(b[lr*9+lc]==='.')return true;}
  // Soldiers: Red soldiers attack upward, Black downward; sideways only after crossing the river.
  const f=by===RED?1:-1;if(ON(r+f,c)&&b[(r+f)*9+c]===P)return true;
  for(const cc of [c-1,c+1])if(ON(r,cc)&&b[r*9+cc]===P&&!ownHalf(r,by))return true;
  return false;
 }
 const inCheckArr=(b,s)=>{const k=findKing(b,s);return k<0||attacked(b,k,other(s));};
 function legalArr(b,s){
  const raw=[],out=[];for(let sq=0;sq<90;sq++)if(b[sq]!=='.'&&sideOf(b[sq])===s)pseudo(b,sq,raw);
  for(const m of raw){const from=(m/90)|0,to=m%90,cap=b[to];b[to]=b[from];b[from]='.';if(!inCheckArr(b,s))out.push(m);b[from]=b[to];b[to]=cap;}
  return out;
 }
 const decode=m=>({from:(m/90)|0,to:m%90});
 function legalMoves(board,side){return legalArr(board.split(''),side).map(decode);}
 function movesFrom(board,sq){const s=sideOf(board[sq]);if(!s)return[];return legalMoves(board,s).filter(m=>m.from===sq).map(m=>m.to);}
 function isLegal(board,side,from,to){return Number.isInteger(from)&&Number.isInteger(to)&&from>=0&&from<90&&to>=0&&to<90&&sideOf(board[from])===side&&legalMoves(board,side).some(m=>m.from===from&&m.to===to);}
 function applyMove(board,from,to){const b=board.split('');b[to]=b[from];b[from]='.';return b.join('');}
 function inCheck(board,side){return inCheckArr(board.split(''),side);}
 // Side to move with no legal moves loses, whether in check (checkmate) or not (stalemate).
 function status(board,side){const b=board.split('');if(legalArr(b,side).length)return inCheckArr(b,side)?'check':'ok';return inCheckArr(b,side)?'checkmate':'stalemate';}

 // ---------- AI ----------
 const VALUE={K:0,A:200,B:200,N:420,R:900,C:450,P:100};
 const PST={};
 for(const t of 'KABNRCP'){PST[t]=new Int16Array(90);for(let sq=0;sq<90;sq++){
  const r=(sq/9)|0,c=sq%9,adv=9-r,center=4-Math.abs(c-4);let v=0; // from Red's point of view
  if(t==='P')v=r<=4?90+adv*8+center*10-(r===0?40:0):(r===6&&c===4?10:0);
  else if(t==='N')v=center*8+(r>=2&&r<=6?20:0)-(r===9?20:0)-(c===0||c===8?20:0);
  else if(t==='C')v=(c===4?20:0)+(r===7?10:0)+center*2;
  else if(t==='R')v=center*4+(r<=3?20:0)+(r===9&&(c===0||c===8)?-10:0);
  else if(t==='K')v=r===9?10:-10;
  else if(t==='A'||t==='B')v=(r===9||r===7)&&c===4?10:0;
  PST[t][sq]=v;}}
 function evaluate(b){let v=0;for(let sq=0;sq<90;sq++){const p=b[sq];if(p==='.')continue;const t=p.toUpperCase();if(p===t)v+=VALUE[t]+PST[t][sq];else v-=VALUE[t]+PST[t][89-sq];}return v;}
 const MATE=100000;
 function rng(seed){let h=1779033703^String(seed).length;for(const ch of String(seed)){h=Math.imul(h^ch.charCodeAt(0),3432918353);h=h<<13|h>>>19;}
  return()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);h^=h>>>16;return(h>>>0)/4294967296;};}
 const LEVELS={easy:{depth:1,noise:160,q:false,nodes:2000},medium:{depth:3,noise:12,q:true,nodes:14000},hard:{depth:4,noise:0,q:true,nodes:32000}};
 // Returns {from,to} for side, or null when there are no legal moves.
 function bestMove(board,side,opts={}){
  const cfg=LEVELS[opts.level]||LEVELS.medium,random=rng(opts.seed??board),nodeLimit=opts.nodeLimit||cfg.nodes,b=board.split('');
  let nodes=0,stop=false;
  const order=ms=>ms.map(m=>{const q=b[m%90];return[m,q==='.'?0:VALUE[q.toUpperCase()]*10-VALUE[b[(m/90)|0].toUpperCase()]/10+1];}).sort((x,y)=>y[1]-x[1]).map(x=>x[0]);
  function quiesce(s,alpha,beta,qd){
   nodes++;const stand=(s===RED?1:-1)*evaluate(b);if(stand>=beta)return stand;if(stand>alpha)alpha=stand;if(qd<=0||nodes>nodeLimit)return stand;
   const caps=[];for(let sq=0;sq<90;sq++)if(b[sq]!=='.'&&sideOf(b[sq])===s)pseudo(b,sq,caps);
   for(const m of order(caps.filter(m=>b[m%90]!=='.'))){const from=(m/90)|0,to=m%90,cap=b[to];if(cap.toUpperCase()==='K')return MATE;b[to]=b[from];b[from]='.';
    if(inCheckArr(b,s)){b[from]=b[to];b[to]=cap;continue;}
    const v=-quiesce(other(s),-beta,-alpha,qd-1);b[from]=b[to];b[to]=cap;if(v>=beta)return v;if(v>alpha)alpha=v;}
   return alpha;
  }
  function search(s,depth,alpha,beta,ply){
   if(nodes++>nodeLimit){stop=true;return 0;}
   const ms=legalArr(b,s);if(!ms.length)return -MATE+ply;
   if(depth<=0)return cfg.q?quiesce(s,alpha,beta,4):(s===RED?1:-1)*evaluate(b);
   let best=-Infinity;
   for(const m of order(ms)){const from=(m/90)|0,to=m%90,cap=b[to];b[to]=b[from];b[from]='.';const v=-search(other(s),depth-1,-beta,-alpha,ply+1);b[from]=b[to];b[to]=cap;
    if(stop)return 0;if(v>best)best=v;if(v>alpha)alpha=v;if(alpha>=beta)break;}
   return best;
  }
  const root=order(legalArr(b,side));if(!root.length)return null;
  let chosen=root[0];
  for(let depth=1;depth<=cfg.depth;depth++){
   const scored=[];let alpha=-Infinity;
   for(const m of root){const from=(m/90)|0,to=m%90,cap=b[to];b[to]=b[from];b[from]='.';
    // Full window at the root keeps every score comparable for the noisy easy/medium picks.
    const v=-search(other(side),depth-1,-Infinity,cfg.noise?Infinity:-alpha,1);b[from]=b[to];b[to]=cap;if(stop)break;scored.push([m,v]);if(v>alpha)alpha=v;}
   if(stop&&scored.length<root.length)break;
   if(cfg.noise){const noisy=scored.map(([m,v])=>[m,v+(random()*2-1)*cfg.noise]);noisy.sort((x,y)=>y[1]-x[1]);chosen=noisy[0][0];}
   else{scored.sort((x,y)=>y[1]-x[1]);chosen=scored[0][0];}
   // Put the best move first so the next, deeper iteration prunes harder.
   root.splice(root.indexOf(chosen),1);root.unshift(chosen);
  }
  return decode(chosen);
 }
 return{START,RED,BLACK,sideOf,other,legalMoves,movesFrom,isLegal,applyMove,inCheck,status,bestMove,evaluate:board=>evaluate(board.split(''))};
});
