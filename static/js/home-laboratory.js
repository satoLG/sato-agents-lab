import * as T from '../vendor/three.module.min.js';

// The laboratory backdrop is only the tiled test chamber: floor, ceiling and
// four checkered walls. Each surface repeats one 32-pixel texture of 2x2
// panels with hard texels, so a panel is a metre wide and visibly chunky.
function panelTexture(base,seam,light){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d'),tone=new T.Color();let seed=41;
 const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const u=x%16,w=y%16,edge=u===0||w===0,bevel=u===1||w===1;
  tone.set(edge?seam:bevel?light:base).offsetHSL(0,0,(Math.floor(random()*4)-1.5)*(edge?.01:.016));
  ctx.fillStyle=`#${tone.getHexString()}`;ctx.fillRect(x,y,1,1);
 }
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.magFilter=T.NearestFilter;map.minFilter=T.LinearMipmapLinearFilter;return map;
}
export function createHomeLaboratory(root,art){
 const {box}=art,wallMap=panelTexture('#c5ccce','#586368','#e2e6e6'),floorMap=panelTexture('#99a2a6','#454f55','#b4bcbf');
 // Metres of surface per texture repeat: two panels across each 2 m.
 const surface=(map,width,height,tint)=>{const tiled=map.clone();tiled.repeat.set(width/2,height/2);return new T.MeshLambertMaterial({map:tiled,color:tint});};
 box(root,18,.12,20,surface(floorMap,18,20,'#dfe6ea'),0,-.13,0).name='test-chamber-floor';
 box(root,18,.14,20,surface(wallMap,18,20,'#aeb9be'),0,5.42,0).name='test-chamber-ceiling';
 for(const [x,z,w,d] of [[0,-10,18,.3],[0,10,18,.3],[-9,0,.3,20],[9,0,.3,20]]){
  const wall=box(root,w,5.4,d,surface(wallMap,Math.max(w,d),5.4,'#ccd6da'),x,2.57,z);wall.name='test-chamber-wall';
 }
 return {navigation:{minX:-8.8,maxX:8.8,minZ:-9.8,maxZ:9.8,obstacles:[]},groundHeight:()=>0};
}
