const test=require('node:test');const assert=require('node:assert/strict');
const {cameraFrame}=require('../public/tea/brawl-view');const {TABLES}=require('../public/tea/world');

test('brawl camera keeps both fighters, names and hit effects inside landscape and portrait canvases',()=>{
  for(const [width,height] of [[960,640],[1260,640],[420,640],[720,640]])for(const table of TABLES){
    for(const one of table.seats)for(const two of table.seats){
      const camera=cameraFrame([one,two],width,height);
      for(const player of [one,two])for(const [dx,dy] of [[-85,-105],[85,-105],[-85,42],[85,42]]){
        const x=(player.x+dx)*camera.scale+camera.tx,y=(player.y+dy)*camera.scale+camera.ty;
        assert.ok(x>=0&&x<=width&&y>=0&&y<=height,`${width}×${height} ${one.id}/${two.id}`);
      }
    }
  }
});
test('brawl camera safely handles a fighter disconnecting and an empty scene',()=>{
  assert.equal(cameraFrame([],420,640),null);const frame=cameraFrame([{x:48,y:225}],420,640);assert.ok(frame.scale>0);assert.ok(Number.isFinite(frame.tx)&&Number.isFinite(frame.ty));
});
