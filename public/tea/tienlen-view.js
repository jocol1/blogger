(function(root){
  'use strict';
  const order=(a,b)=>a.rank-b.rank||a.suit-b.suit;
  const high=card=>card.rank*4+card.suit;
  function classify(input){
    if(!Array.isArray(input)||!input.length||input.length>13)return null;
    if(input.some(c=>!c||typeof c.id!=='string'||!Number.isInteger(c.rank)||c.rank<3||c.rank>15||!Number.isInteger(c.suit)||c.suit<0||c.suit>3))return null;
    const cards=[...input].sort(order),n=cards.length,unique=new Set(cards.map(c=>`${c.rank}:${c.suit}`));if(unique.size!==n||new Set(cards.map(c=>c.id)).size!==n)return null;
    const ranks=[...new Set(cards.map(c=>c.rank))],value=high(cards[n-1]);let kind=null;
    if(n===1)kind='single';
    else if(ranks.length===1&&n<=4)kind=n===2?'pair':n===3?'triple':'four';
    else if(n>=3&&ranks.length===n&&ranks.at(-1)<15&&ranks.every((rank,i)=>!i||rank===ranks[i-1]+1))kind='straight';
    else if((n===6||n===8)&&ranks.length===n/2&&ranks.at(-1)<15&&ranks.every((rank,i)=>(!i||rank===ranks[i-1]+1)&&cards.filter(c=>c.rank===rank).length===2))kind=n===6?'pairs3':'pairs4';
    return kind?{kind,high:value,rank:cards[n-1].rank,suit:cards[n-1].suit,length:n}:null;
  }
  const combination=value=>Array.isArray(value)?classify(value):value?.cards?classify(value.cards):value;
  function beats(candidate,previous){
    const next=combination(candidate),top=combination(previous);if(!next)return false;if(!top)return !previous;
    if(next.kind===top.kind&&next.length===top.length)return next.kind==='four'?next.rank>top.rank:next.high>top.high;
    const twos=(top.kind==='single'||top.kind==='pair')&&top.rank===15;
    if(next.kind==='pairs3')return top.kind==='single'&&top.rank===15;
    if(next.kind==='four')return twos||top.kind==='pairs3';
    if(next.kind==='pairs4')return twos||top.kind==='pairs3'||top.kind==='four';
    return false;
  }
  function legal(cards,game,playerId){
    if(!game||game.status!=='active'||!game.players.some(p=>p.id===playerId))return false;
    const candidate=classify(cards),top=game.top?.cards?.length?classify(game.top.cards):null;if(!candidate)return false;
    if(game.openingCardId&&!cards.some(c=>c.id===game.openingCardId))return false;
    if(game.turn!==playerId)return candidate.kind==='pairs4'&&Boolean(top)&&beats(candidate,top);
    if((game.passed||[]).includes(playerId))return candidate.kind==='pairs4'&&Boolean(top)&&beats(candidate,top);
    return beats(candidate,top);
  }
  function moves(hand,game,playerId){
    if(!Array.isArray(hand)||hand.length>13)return [];
    const result=[];for(let mask=1;mask<2**hand.length;mask++){const cards=hand.filter((c,i)=>mask&(1<<i));if(legal(cards,game,playerId))result.push(cards)}
    return result.sort((a,b)=>{
      const one=classify(a),two=classify(b);if(!game.top)return b.length-a.length||one.high-two.high;
      const top=combination(game.top);return Number(one.kind!==top.kind)-Number(two.kind!==top.kind)||one.high-two.high||a.length-b.length;
    });
  }
  function acceptsView(current,next){return !current||!next||current.id!==next.id||(next.version||0)>=(current.version||0)}
  const api={order,classify,beats,legal,moves,acceptsView};if(typeof module!=='undefined')module.exports=api;else root.TeaTienLenView=api;
})(typeof window!=='undefined'?window:globalThis);
