import * as T from '../vendor/three.module.min.js';
export const FLOOR=.06;
export const DECK_HEIGHT=1.86;
export const WALL_HEIGHT=16;
export const ZONES={
 gateway:{x:-7,z:19.9,color:'#64cfff',number:'00',name:'GATEWAY',area:'GATEWAY',icon:'log-in',sign:[-13,19.2]},
 vm:{x:-21,z:10,color:'#64cfff',number:'01',name:'VM',area:'INFRA',icon:'server',sign:[-25,5]},
 hermes:{x:0,z:-3,color:'#64cfff',number:'02',name:'HERMES',area:'CORE',icon:'cpu',sign:[-4.8,-7]},
 models:{x:-24,z:-21,color:'#64cfff',number:'03',name:'PROVIDERS',area:'INTEGRATIONS',icon:'cloud',sign:[-29,-24]},
 mcp:{x:-13,z:-21,color:'#64cfff',number:'04',name:'MCP',area:'INTEGRATIONS',icon:'plug',sign:[-17,-27]},
 memory:{x:12,z:-22,color:'#64cfff',number:'05',name:'MEMORY',area:'DATA',icon:'database',sign:[8.5,-28]},
 rag:{x:24,z:-22,color:'#64cfff',number:'06',name:'RAG',area:'DATA',icon:'network',sign:[27,-28]},
 cron:{x:23,z:10,color:'#64cfff',number:'07',name:'EVENTS',area:'EVENTS',icon:'clock',sign:[18,5]},
};
export const AREAS=[
 {name:'INTEGRATIONS',x:-19,z:-21,w:24,d:16},
 {name:'DATA',x:19,z:-20,w:25,d:20},
 {name:'INFRA',x:-21,z:10,w:14,d:12},
 {name:'EVENTS',x:23,z:10,w:15,d:12},
];
export const slotsFor=id=>id==='gateway'?[[0,-.9]]:id==='rag'?[[0,7.8],[-5.8,5.5],[5.8,5.5],[0,10]]:[[0,2],[-3.5,1.8],[3.5,1.8],[0,4.3]];
// Two flights of four risers with a generous intermediate landing.
export const CORE_STEPS=Array.from({length:8},(_,i)=>({w:20-i*.8-(i>=4?.8:0),d:17-i*.8-(i>=4?.8:0),h:(i+1)*.24,r:1.2}));
export function inRounded(x,z,w,d,r){return Math.hypot(Math.max(0,Math.abs(x)-(w/2-r)),Math.max(0,Math.abs(z)-(d/2-r)))<=r;}
export function coreHeight(x,z){let height=0;for(const s of CORE_STEPS)if(inRounded(x,z-ZONES.hermes.z,s.w,s.d,s.r))height=s.h;return height;}
export function roundedShape(w,d,r){
 const s=new T.Shape(),x=-w/2,y=-d/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
// The same orthogonal footprint drives deck meshes, railings and navigation.
export const DECKS=[
 ...AREAS,
 {name:'CORE',x:0,z:-3,w:22,d:19},
 {name:'SPINE',x:0,z:-5,w:6,d:34},
 {name:'NORTH LINK',x:0,z:-21,w:39,d:5},
 {name:'SOUTH LINK',x:1,z:10,w:44,d:5},
 {name:'WEST LINK',x:-21,z:-5.5,w:5,d:31},
 {name:'EAST LINK',x:23,z:-5.5,w:5,d:31},
 {name:'TRIAGE',x:-27,z:2,w:8,d:8},
 {name:'TRIAGE LINK',x:-22,z:2,w:8,d:4},
 {name:'ENTRY',x:0,z:14,w:6,d:8},
];
export const ENERGY_ROUTES=[
 [[0,-3],[0,-21],[-24,-21]],[[0,-3],[0,-21],[24,-21]],
 [[0,-3],[0,10],[-21,10]],[[0,-3],[0,10],[23,10]],
 [[-21,10],[-21,-21]],[[23,10],[23,-21]],
 [[0,10],[0,17]],
];
const contains=(a,x,z)=>Math.abs(x-a.x)<=a.w/2+1e-7&&Math.abs(z-a.z)<=a.d/2+1e-7;
export function onDeck(x,z,radius=0){
 const samples=radius?[[0,0],[-radius,0],[radius,0],[0,-radius],[0,radius],[-radius*.71,-radius*.71],[radius*.71,-radius*.71],[-radius*.71,radius*.71],[radius*.71,radius*.71]]:[[0,0]];
 return samples.every(([dx,dz])=>(radius>0&&z<=18&&z+dz>=18&&Math.abs(x+dx)<=3)||DECKS.some(a=>contains(a,x+dx,z+dz)));
}
export function deckHeight(x,z){
 if(!onDeck(x,z))return null;
 if(Math.abs(x)<=3&&z>12)return FLOOR+(DECK_HEIGHT-FLOOR)*Math.max(0,(18-z)/6);
 return DECK_HEIGHT+coreHeight(x,z);
}
// Split union boundaries into straight spans; shared edges never get a railing.
export function deckEdges(){
 const result=[],seen=new Set();
 for(const a of DECKS)for(const side of [-1,1])for(const axis of ['x','z']){
  const horizontal=axis==='z',length=horizontal?a.w:a.d,fixed=(horizontal?a.z:a.x)+side*(horizontal?a.d:a.w)/2,start=(horizontal?a.x:a.z)-length/2;
  const n=Math.ceil(length/.25);let run=null;
  for(let i=0;i<=n;i++){
   const u=start+i*length/n,mid=u+length/n/2;
   const outside=i<n&&!DECKS.some(b=>contains(b,horizontal?mid:fixed+side*.02,horizontal?fixed+side*.02:mid));
   // Entry meets the reception at z=18: keep the doorway open.
   const open=horizontal&&fixed===18&&Math.abs(mid)<3.01;
   if(outside&&!open&&run===null)run=u;
   if((!outside||open||i===n)&&run!==null){const key=[axis,fixed,run,u].join(':');if(!seen.has(key)){result.push({axis,fixed,start:run,end:u,side});seen.add(key);}run=null;}
  }
 }
 return result;
}
export function createAreaFloors(hall,{mesh,mat,textPlane,box,rod,glow},obstacles=[]){
 const steel=mat('#455963',.65,.38),deck=mat('#a7b6bc',.6,.44),rail=mat('#b4c3c7',.78,.27),edge=glow('#63cfe3');
 // A grid of disjoint cells eliminates overlapping platform planes at junctions.
 const xs=[...new Set(DECKS.flatMap(a=>[a.x-a.w/2,a.x+a.w/2]))].sort((a,b)=>a-b);
 const zs=[...new Set(DECKS.flatMap(a=>[a.z-a.d/2,a.z+a.d/2]).concat([12,18]))].sort((a,b)=>a-b);
 for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++){
  const x=(xs[i-1]+xs[i])/2,z=(zs[j-1]+zs[j])/2,w=xs[i]-xs[i-1],d=zs[j]-zs[j-1];if(!onDeck(x,z))continue;
  const h0=deckHeight(x,zs[j-1]),h1=deckHeight(x,zs[j]);
  // CORE steps have their own geometry, resting on the common base deck.
  const top=z>=12&&Math.abs(x)<3?(h0+h1)/2:DECK_HEIGHT;
  const tile=box(hall,w,.24,d,deck,x,top-.12,z);tile.name='raised-platform';
  if(z>12&&Math.abs(x)<3){tile.rotation.x=-Math.atan((h1-h0)/d);tile.scale.z=d/Math.cos(tile.rotation.x);}
  tile.userData.walkable=true;
 }
 for(const {axis,fixed,start,end}of deckEdges()){
  const horizontal=axis==='z',length=end-start,x=horizontal?(start+end)/2:fixed,z=horizontal?fixed:(start+end)/2;
  box(hall,horizontal?length:.14,.23,horizontal?.14:length,steel,x,DECK_HEIGHT-.12,z);
  const count=Math.max(1,Math.ceil(length/2.4));
  for(let i=0;i<=count;i++){
   const u=start+length*i/count,px=horizontal?u:fixed,pz=horizontal?fixed:u,y=deckHeight(px,pz)??DECK_HEIGHT;
   box(hall,.09,1.02,.09,rail,px,y+.51,pz);
   if(i<count){const v=start+length*(i+1)/count,qx=horizontal?v:fixed,qz=horizontal?fixed:v,qy=deckHeight(qx,qz)??DECK_HEIGHT;
    for(const height of [.48,1.02])rod(hall,[px,y+height,pz],[qx,qy+height,qz],.043,rail);
    rod(hall,[px,y+.1,pz],[qx,qy+.1,qz],.026,edge);
   }
  }
  // Footprint filtering also protects small edges without hundreds of colliders.
 }
 for(const a of AREAS){
  textPlane(hall,a.name,a.w*.48,.6,a.x,DECK_HEIGHT+.028,a.z+a.d/2-.6,{color:'#76cfff',background:'#23323c',floor:true,size:115});
  for(const dx of [-a.w/2+1,a.w/2-1])for(const dz of [-a.d/2+1,a.d/2-1]){
   box(hall,.2,DECK_HEIGHT+.25,.2,steel,a.x+dx,(DECK_HEIGHT-.25)/2,a.z+dz);
   box(hall,.55,.18,.55,steel,a.x+dx,-.17,a.z+dz);
  }
 }
 for(const [i,s]of CORE_STEPS.entries()){
  const g=new T.ExtrudeGeometry(roundedShape(s.w,s.d,s.r),{depth:.24,bevelEnabled:false,curveSegments:12});g.rotateX(-Math.PI/2);
  const slab=mesh(hall,g,mat(i===7?'#d1dce1':'#87959c',.45,.4),0,DECK_HEIGHT+s.h-.24,ZONES.hermes.z);slab.name=`core-step-${i+1}`;slab.userData.walkable=true;
 }
 obstacles.walkable=(x,z,r)=>z>=18||onDeck(x,z,r+.08);
}
export function createEnergyLines(hall,groundAt){
 const routes=ENERGY_ROUTES;
 const points=[];routes.forEach((route,routeId)=>{let distance=0;for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(length/.58);for(let j=0;j<n;j++){const f=j/n,x=T.MathUtils.lerp(a[0],b[0],f),z=T.MathUtils.lerp(a[1],b[1],f);points.push({x,z,y:groundAt(x,z)+.052,d:distance+f*length,route:routeId});}distance+=length;}});
 const material=new T.MeshBasicMaterial({color:'#ffffff',toneMapped:false});const dots=new T.InstancedMesh(new T.SphereGeometry(1,8,5),material,points.length),dummy=new T.Object3D(),color=new T.Color();
 points.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.scale.set(.12,.035,.12);dummy.updateMatrix();dots.setMatrixAt(i,dummy.matrix);dots.setColorAt(i,color.set('#1498d0'));});dots.name='blue-energy-routes';dots.userData.dynamic=true;hall.add(dots);let previous=-1;
 return {nearbyPulse(position,t){
   let nearest=null,distance=4;
   for(const p of points){const phase=((p.d-t*3.2+p.route*2)%9+9)%9;if(phase>=1.5)continue;const d=Math.hypot(p.x-position.x,p.z-position.z);if(d<distance){nearest=p;distance=d;}}
   return nearest;
 },tick(t){if(t-previous<.05)return;previous=t;points.forEach((p,i)=>{const phase=((p.d-t*3.2+p.route*2)%9+9)%9;dots.setColorAt(i,color.set(phase<1.5?'#c7f7ff':phase<2.5?'#56dfff':'#1684b2'));});dots.instanceColor.needsUpdate=true;}};
}
