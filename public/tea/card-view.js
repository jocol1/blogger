(function(root){
  function playable(card,game){
    if(!card||!game?.top)return false;
    return card.kind==='wild'||card.color===game.activeColor||(card.kind==='number'&&game.top.kind==='number'&&card.value===game.top.value)||(card.kind!=='number'&&card.kind===game.top.kind);
  }
  function acceptsView(current,next){return !current||!next||current.id!==next.id||(next.version||0)>=(current.version||0)}
  const api={playable,acceptsView};if(typeof module!=='undefined')module.exports=api;else root.TeaCardView=api;
})(typeof window!=='undefined'?window:globalThis);
