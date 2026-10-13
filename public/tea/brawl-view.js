(function(root){
  function cameraFrame(players,width,height){
    if(!players.length)return null;
    // Include head labels, hit stars and feet, not only the seating coordinates.
    const left=Math.min(...players.map(p=>p.x))-85,right=Math.max(...players.map(p=>p.x))+85;
    const top=Math.min(...players.map(p=>p.y))-105,bottom=Math.max(...players.map(p=>p.y))+42;
    const spanX=Math.max(260,right-left),spanY=Math.max(200,bottom-top);
    const scale=Math.min(3,(width-36)/spanX,(height-36)/spanY);
    return {scale,tx:width/2-(left+right)/2*scale,ty:height/2-(top+bottom)/2*scale};
  }
  const api={cameraFrame};if(typeof module!=='undefined')module.exports=api;else root.TeaBrawlView=api;
})(typeof window!=='undefined'?window:globalThis);
