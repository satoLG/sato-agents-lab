// Coordinates are projected screen rectangles, so this also works after orbit/zoom.
const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
export function placeInteraction(anchor,objects,width,height,viewport){
 const margin=12,gap=18,minTop=80,maxBottom=viewport.height-100;
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(Math.max(lo,hi),v));
 const candidates=[
  {x:anchor.x,y:anchor.top-height-gap,side:'above'},
  {x:anchor.x,y:anchor.bottom+gap,side:'below'},
  {x:anchor.left-width/2-gap,y:anchor.bottom-height,side:'left'},
  {x:anchor.right+width/2+gap,y:anchor.bottom-height,side:'right'},
 ];
 // Add the clear edges of the target when its projection covers both avatar anchors.
 for(const o of objects)candidates.push({x:anchor.x,y:o.bottom+gap,side:'below'},{x:anchor.x,y:o.top-height-gap,side:'above'});
 return candidates.map((p,i)=>{
  const x=clamp(p.x,width/2+margin,viewport.width-width/2-margin),y=clamp(p.y,minTop,maxBottom-height),rect={left:x-width/2,right:x+width/2,top:y,bottom:y+height};
  const score=objects.reduce((sum,o)=>sum+overlap(rect,o),0)*1000+overlap(rect,anchor)*100+Math.hypot(x-anchor.x,y-(anchor.top-height-gap))+(p.side==='left'||p.side==='right'?400:0)+i*.01;
  return {...p,x,y,score};
 }).sort((a,b)=>a.score-b.score)[0];
}
