import * as T from '../vendor/three.module.min.js';
import {createRigFactory,poseRig} from './lab-rigs.js';

// The companion uses the lab's robot rig; it loads no campus, avatar or HDR map.
function robotArt(){
 const materials=new Map(),geometries=new Map();
 const geo=(key,make)=>{if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);};
 const mat=(color,metalness=.1,roughness=.55)=>{const key=`${color}:${metalness}:${roughness}`;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,metalness,roughness}));return materials.get(key);};
 const glow=color=>{const key=`glow:${color}`;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.8,roughness:.4}));return materials.get(key);};
 const material=color=>typeof color==='string'?mat(color):color;
 function mesh(parent,geometry,finish,x=0,y=0,z=0){const object=new T.Mesh(geometry,finish);object.position.set(x,y,z);parent.add(object);return object;}
 function box(parent,w,h,d,color,x=0,y=0,z=0){const m=mesh(parent,geo('box',()=>new T.BoxGeometry(1,1,1)),material(color),x,y,z);m.scale.set(w,h,d);return m;}
 function sphere(parent,r,color,x=0,y=0,z=0,scale=[1,1,1]){const m=mesh(parent,geo('sphere',()=>new T.SphereGeometry(1,32,24)),material(color),x,y,z);m.scale.set(r*scale[0],r*scale[1],r*scale[2]);return m;}
 function cylinder(parent,r,height,color,x=0,y=0,z=0,top=r){return mesh(parent,geo(`cyl:${r}:${top}:${height}`,()=>new T.CylinderGeometry(top,r,height,24)),material(color),x,y,z);}
 function ring(parent,r,width,color,x=0,y=0,z=0,floor=false){const m=mesh(parent,geo(`ring:${r}:${width}`,()=>new T.TorusGeometry(r,width,8,64)),material(color),x,y,z);if(floor)m.rotation.x=Math.PI/2;return m;}
 function rod(parent,a,b,width,color){const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start),m=cylinder(parent,width,delta.length(),color);m.position.copy(start.add(end).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;}
 return {box,sphere,cylinder,ring,rod,mesh,mat,glow,geo};
}

export async function createCompanionScene(container,{onProgress,onFrame}={}){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
 container.append(renderer.domElement);onProgress?.(40,'Montando o robô…');
 const world=new T.Scene();world.background=new T.Color('#000');
 world.add(new T.HemisphereLight('#e3f4ff','#536775',2.1));
 const key=new T.DirectionalLight('#fff3e5',4.2);key.position.set(-3,5,4);world.add(key);
 const fill=new T.DirectionalLight('#95ceff',2.8);fill.position.set(4,2,1);world.add(fill);
 const rim=new T.DirectionalLight('#79c6ff',3.8);rim.position.set(1,3,-4);world.add(rim);
 const camera=new T.OrthographicCamera(-3,3,3,-3,.1,30);camera.position.set(2.5,2.3,7);camera.lookAt(0,1.38,0);
 const rig=createRigFactory(robotArt()).robot();rig.root.name='sato-companion';rig.root.rotation.y=.12;world.add(rig.root);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let width=1,height=1,frame=0,last=0,time=0,speakingUntil=0,reaction=null,disposed=false,lookYaw=0,body;
 const point=new T.Vector3(),bodyCorners=[];
 for(const x of [-1.05,1.05])for(const y of [0,2.08])for(const z of [-.3,.65])bodyCorners.push(new T.Vector3(x,y,z));
 function project(x,y,z){point.set(x,y,z).applyMatrix4(rig.root.matrixWorld).project(camera);return {x:(point.x+1)*width/2,y:(1-point.y)*height/2};}
 function report(){
  rig.root.updateMatrixWorld(true);
  onFrame?.({head:project(0,1.88,.2),body,width,height});
 }
 function resize(){
  ({width,height}=container.getBoundingClientRect());width=Math.max(1,width);height=Math.max(1,height);
  const span=width<600?4.8:5.2,aspect=width/height;
  camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
  renderer.setSize(width,height,false);
  // Keep the touch target stable while the visible robot bounces and dances.
  const neutral=new T.Matrix4().makeRotationY(.12),corners=bodyCorners.map(v=>v.clone().applyMatrix4(neutral).project(camera)),xs=corners.map(p=>(p.x+1)*width/2),ys=corners.map(p=>(1-p.y)*height/2);
  body={left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)};report();
 }
 const observer=new ResizeObserver(resize);observer.observe(container);resize();
 function pose(dt){
  const talking=time<speakingUntil;
  poseRig(rig,reduced.matches?0:time,dt,{attention:1,talk:talking,lookYaw,reduced:reduced.matches});
  rig.root.rotation.y=.12;rig.root.position.y=0;rig.root.scale.setScalar(1);
  if(!reduced.matches){rig.root.position.y=Math.sin(time*1.8)*.012;rig.head.rotation.z=Math.sin(time*.8)*.06;}
  if(!reaction)return;
  const elapsed=time-reaction.at,p=Math.min(1,elapsed/reaction.duration),envelope=Math.sin(p*Math.PI);
  if(p>=1){reaction=null;container.dataset.reaction='idle';return;}
  const right=rig.arms[1],left=rig.arms[0];
  if(reduced.matches){rig.head.rotation.z=envelope*.08;return;}
  switch(reaction.kind){
   case 'wave':case 'hello':
    right.upper.rotation.z=1.95*envelope+.2;right.upper.rotation.x=-.35*envelope;right.lower.rotation.x=-.8*envelope;right.lower.rotation.z=Math.sin(elapsed*12)*.3*envelope;rig.head.rotation.z=-.1*envelope;break;
   case 'boop':
    rig.root.position.y=Math.sin(p*Math.PI)*.16;rig.root.scale.set(1+.035*envelope,1-.025*envelope,1+.035*envelope);rig.head.rotation.x=-.16*envelope;left.upper.rotation.z=-.8*envelope-.2;right.upper.rotation.z=.8*envelope+.2;break;
   case 'dance':
    rig.root.rotation.y=.12+Math.sin(elapsed*6)*.22*envelope;rig.hips.rotation.z=Math.sin(elapsed*8)*.1*envelope;rig.root.position.y=Math.abs(Math.sin(elapsed*8))*.07*envelope;for(const arm of rig.arms){arm.upper.rotation.z=arm.side*(.2+.9*envelope);arm.lower.rotation.x=-.5*envelope;arm.upper.rotation.x=Math.sin(elapsed*8+arm.side)*.3*envelope;}break;
   case 'shy':
    rig.head.rotation.z=.22*envelope;rig.head.rotation.x=.1*envelope;left.upper.rotation.x=-1.2*envelope;left.lower.rotation.x=-.65*envelope;right.upper.rotation.z=.4*envelope+.2;break;
  }
  if(reaction.kind==='boop'||reaction.kind==='shy'){
   const blink=Math.sin(Math.min(1,p*3)*Math.PI);rig.pupil.scale.y=Math.max(.08,1-blink);for(const {mesh,side}of rig.lids)mesh.position.y=side*.2*(1-blink);
  }
 }
 function render(stamp){
  if(disposed)return;frame=requestAnimationFrame(render);if(document.hidden){last=stamp;return;}
  if(stamp-last<1000/40)return;const dt=Math.min(.05,(stamp-last)/1000||.025);last=stamp;time+=dt;pose(dt);renderer.render(world,camera);report();
 }
 function react(kind='wave'){reaction={kind,at:time,duration:kind==='dance'?2.5:kind==='hello'?2.6:1.8};container.dataset.reaction=kind;}
 function look(event){const bounds=container.getBoundingClientRect();lookYaw=Math.max(-.3,Math.min(.3,((event.clientX-bounds.left)/bounds.width-.5)*.5));}
 container.addEventListener('pointermove',look);container.addEventListener('pointerleave',()=>{lookYaw=0;});
 onProgress?.(75,'Acendendo as luzes…');
 await renderer.compileAsync(world,camera);pose(.025);renderer.render(world,camera);report();
 frame=requestAnimationFrame(render);
 return {react,speak(duration=2){speakingUntil=time+duration;},dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();container.removeEventListener('pointermove',look);const geometries=new Set(),materials=new Set(),textures=new Set();world.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);if(m.map)textures.add(m.map);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();}};
}
