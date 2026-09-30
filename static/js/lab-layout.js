import * as T from '../vendor/three.module.min.js';
export const FLOOR=.06;
export const ZONES={
 gateway:{x:-18,z:25,color:'#64cfff',number:'00',name:'GATEWAY',area:'GATEWAY',icon:'log-in',sign:[-24.5,26.6]},
 vm:{x:-21,z:10,color:'#64cfff',number:'01',name:'VM',area:'INFRA',icon:'server',sign:[-25,5]},
 hermes:{x:0,z:-3,color:'#64cfff',number:'02',name:'HERMES',area:'CORE',icon:'cpu',sign:[-4.8,-7]},
 models:{x:-24,z:-21,color:'#64cfff',number:'03',name:'PROVIDERS',area:'INTEGRATIONS',icon:'cloud',sign:[-29,-24]},
 mcp:{x:-13,z:-21,color:'#64cfff',number:'04',name:'MCP',area:'INTEGRATIONS',icon:'plug',sign:[-17,-27]},
 memory:{x:12,z:-22,color:'#64cfff',number:'05',name:'MEMORY',area:'DATA',icon:'database',sign:[8.5,-28]},
 rag:{x:24,z:-22,color:'#64cfff',number:'06',name:'RAG',area:'DATA',icon:'network',sign:[27,-28]},
 cron:{x:23,z:10,color:'#64cfff',number:'07',name:'CRON',area:'SCHEDULE',icon:'clock',sign:[18,5]},
};
export const AREAS=[
 {name:'INTEGRATIONS',x:-19,z:-21,w:24,d:16},
 {name:'DATA',x:19.5,z:-21,w:24,d:18},
 {name:'INFRA',x:-21,z:10,w:14,d:12},
 {name:'SCHEDULE',x:23,z:10,w:15,d:12},
];
export const slotsFor=id=>id==='gateway'?[[0,-1.8]]:id==='rag'?[[0,7.8],[-5.8,5.5],[5.8,5.5],[0,10]]:[[0,2],[-3.5,1.8],[3.5,1.8],[0,4.3]];
// Two flights of four risers with a generous intermediate landing.
export const CORE_STEPS=Array.from({length:8},(_,i)=>({w:20-i*.8-(i>=4?.8:0),d:17-i*.8-(i>=4?.8:0),h:(i+1)*.24,r:1.2}));
export function inRounded(x,z,w,d,r){return Math.hypot(Math.max(0,Math.abs(x)-(w/2-r)),Math.max(0,Math.abs(z)-(d/2-r)))<=r;}
export function coreHeight(x,z){let height=0;for(const s of CORE_STEPS)if(inRounded(x,z-ZONES.hermes.z,s.w,s.d,s.r))height=s.h;return height;}
export function roundedShape(w,d,r){
 const s=new T.Shape(),x=-w/2,y=-d/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
export function createAreaFloors(hall,{mesh,mat,textPlane}){
 for(const a of AREAS){
  const border=roundedShape(a.w,a.d,1.25);border.holes.push(new T.Path(roundedShape(a.w-.2,a.d-.2,1.15).getPoints(12)));
  const g=new T.ShapeGeometry(border,12);g.rotateX(-Math.PI/2);mesh(hall,g,mat('#457c96'),a.x,FLOOR+.025,a.z,false);
  // The interior remains the tiled room floor; no overlapping second floor plane.
  textPlane(hall,a.name,a.w*.48,.6,a.x,FLOOR+.035,a.z+a.d/2-.6,{color:'#76cfff',background:'#23323c',floor:true,size:115});
 }
 for(const [i,s]of CORE_STEPS.entries()){
  const g=new T.ExtrudeGeometry(roundedShape(s.w,s.d,s.r),{depth:.24,bevelEnabled:false,curveSegments:12});g.rotateX(-Math.PI/2);
  const slab=mesh(hall,g,mat(i===7?'#d1dce1':'#87959c'),0,FLOOR+s.h-.24,ZONES.hermes.z);slab.name=`core-step-${i+1}`;slab.userData.walkable=true;
  // Full risers below the next nested slab; the landing is wider after step four.
 }
}
export function createEnergyLines(hall,groundAt){
 const routes=[[[0,-3],[-8,-3],[-19,-12],[-19,-17]],[[0,-3],[8,-3],[19.5,-12],[19.5,-17]],[[0,-3],[-10,6],[-16,7]],[[0,-3],[10,6],[18,7]],[[0,-3],[-12,2],[-22,2]]];
 const points=[];routes.forEach((route,routeId)=>{let distance=0;for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(length/.58);for(let j=0;j<n;j++){const f=j/n,x=T.MathUtils.lerp(a[0],b[0],f),z=T.MathUtils.lerp(a[1],b[1],f);points.push({x,z,y:groundAt(x,z)+.052,d:distance+f*length,route:routeId});}distance+=length;}});
 const material=new T.MeshBasicMaterial({color:'#ffffff',toneMapped:false});const dots=new T.InstancedMesh(new T.SphereGeometry(1,8,5),material,points.length),dummy=new T.Object3D(),color=new T.Color();
 points.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.scale.set(.12,.035,.12);dummy.updateMatrix();dots.setMatrixAt(i,dummy.matrix);dots.setColorAt(i,color.set('#1498d0'));});dots.name='blue-energy-routes';dots.userData.dynamic=true;hall.add(dots);let previous=-1;
 return {nearbyPulse(position,t){
   let nearest=null,distance=4;
   for(const p of points){const phase=((p.d-t*3.2+p.route*2)%9+9)%9;if(phase>=1.5)continue;const d=Math.hypot(p.x-position.x,p.z-position.z);if(d<distance){nearest=p;distance=d;}}
   return nearest;
 },tick(t){if(t-previous<.05)return;previous=t;points.forEach((p,i)=>{const phase=((p.d-t*3.2+p.route*2)%9+9)%9;dots.setColorAt(i,color.set(phase<1.5?'#c7f7ff':phase<2.5?'#56dfff':'#1684b2'));});dots.instanceColor.needsUpdate=true;}};
}
