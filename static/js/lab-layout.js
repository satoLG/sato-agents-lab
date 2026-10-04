import * as T from '../vendor/three.module.min.js';
export const FLOOR=.06;
export const DECK_HEIGHT=1.86;
export const WALL_HEIGHT=16;
// Every cell is 2 m. Floor footprints and the rear wall share this coordinate system.
export const GRID_CELL=2;
export const BUILDING={halfWidth:40,north:-43,front:33,partition:18};
export const GRID_FOOTPRINTS={
 number:{x:-4.5,z:-4,w:2,d:1,wall:[0,0,2,3]},
 monitors:{x:-2.5,z:-4,w:5,d:1,wall:[2,0,5,3]},
 history:{x:2.5,z:-4,w:2,d:1,wall:[7,0,2,3]},
 bench:{x:-2.5,z:-3,w:5,d:1},
 equipment:{x:-2,z:0,w:4,d:4},
};
export const EQUIPMENT_FOOTPRINTS={
 vm:{x:-2,z:.5,w:4,d:3},models:{x:-1.5,z:.5,w:3,d:3},
 mcp:{x:-1.5,z:.5,w:3,d:3},memory:{x:-1.5,z:1,w:3,d:2},
 rag:{x:-2,z:0,w:4,d:4},hermes:{x:-1,z:1,w:2,d:2},
 cron:{x:-2,z:1.5,w:4,d:1},
};
export const PROVIDER_SERVICE_FOOTPRINT={x:-9,z:1.5,w:8,d:2,minHeight:5};
export function gridPlacement(zone,footprint){
 const f=typeof footprint==='string'?GRID_FOOTPRINTS[footprint]:footprint;
 return {x:zone.x+(f.x+f.w/2)*GRID_CELL,z:zone.z+(f.z+f.d/2)*GRID_CELL,w:f.w*GRID_CELL,d:f.d*GRID_CELL,cells:{...f}};
}
const zone=(x,z,number,name,area,icon)=>({x,z,color:'#64cfff',number,name,area,icon,sign:[x-7,z-7]});
export const ZONES={
 gateway:zone(-14,22,'00','GATEWAY','GATEWAY','log-in'),
 vm:zone(-28,8,'01','VM','INFRA','server'),
 hermes:zone(0,-4,'02','HERMES','CORE','cpu'),
 models:zone(-28,-32,'03','PROVIDERS','INTEGRATIONS','cloud'),
 mcp:zone(-10,-32,'04','MCP','INTEGRATIONS','plug'),
 memory:zone(10,-32,'05','MEMORY','DATA','database'),
 rag:zone(28,-32,'06','RAG','DATA','network'),
 cron:zone(28,8,'07','EVENTS','EVENTS','clock'),
};
ZONES.gateway.sign=[-21,18.5];
export const AREAS=[
 {name:'INTEGRATIONS',x:-19,z:-30,w:36,d:22},
 {name:'DATA',x:19,z:-30,w:36,d:22},
 {name:'INFRA',x:-28,z:7,w:20,d:20},
 {name:'EVENTS',x:28,z:7,w:20,d:20},
];
export const slotsFor=id=>id==='gateway'?[[0,-.9]]:[[0,-3.4],[-2.8,-3.4],[2.8,-3.4],[0,-1.2]];
// Two flights of four risers with a generous intermediate landing.
export const CORE_STEPS=Array.from({length:8},(_,i)=>({w:28-i*.8-(i>=4?.8:0),d:26-i*.8-(i>=4?.8:0),h:(i+1)*.24,r:1.2}));
export function inRounded(x,z,w,d,r){return Math.hypot(Math.max(0,Math.abs(x)-(w/2-r)),Math.max(0,Math.abs(z)-(d/2-r)))<=r;}
export function coreHeight(x,z){let height=0;for(const s of CORE_STEPS)if(inRounded(x,z-ZONES.hermes.z,s.w,s.d,s.r))height=s.h;return height;}
export function roundedShape(w,d,r){
 const s=new T.Shape(),x=-w/2,y=-d/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
// The same orthogonal footprint drives deck meshes, railings and navigation.
export const DECKS=[
 ...AREAS,
 {name:'CORE',x:0,z:-4,w:30,d:28},
 {name:'SPINE',x:0,z:-13,w:6,d:50},
 {name:'NORTH LINK',x:0,z:-30,w:58,d:6},
 {name:'SOUTH LINK',x:0,z:8,w:58,d:6},
 {name:'WEST LINK',x:-28,z:-12,w:6,d:40},
 {name:'EAST LINK',x:28,z:-12,w:6,d:40},
 {name:'TRIAGE',x:-35,z:-7,w:9,d:8},
 {name:'TRIAGE LINK',x:-30,z:-7,w:10,d:4},
 {name:'ENTRY',x:0,z:14,w:6,d:8},
];
export const ENERGY_ROUTES=[
 [[0,-4],[0,-30],[-28,-30]],[[0,-4],[0,-30],[28,-30]],
 [[0,-4],[0,8],[-28,8]],[[0,-4],[0,8],[28,8]],
 [[-28,8],[-28,-32]],[[28,8],[28,-32]],[[0,8],[0,17]],
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
