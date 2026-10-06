import * as T from '../vendor/three.module.min.js';
import {createRigFactory,poseRig,setRigBlink} from './lab-rigs.js';
import {createDeliveryChute} from './lab-chute.js';

function robotArt(){
 const materials=new Map(),geometries=new Map();
 const geo=(key,make)=>{if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);};
 const mat=(color,metalness=.1,roughness=.55)=>{const key=`${color}:${metalness}:${roughness}`;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,metalness,roughness}));return materials.get(key);};
 const glow=color=>{const key=`glow:${color}`;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.8,roughness:.4}));return materials.get(key);};
 const material=color=>typeof color==='string'?mat(color):color;
 function mesh(parent,geometry,finish,x=0,y=0,z=0){const object=new T.Mesh(geometry,finish);object.position.set(x,y,z);parent.add(object);return object;}
 function box(parent,w,h,d,color,x=0,y=0,z=0){const m=mesh(parent,geo('box',()=>new T.BoxGeometry(1,1,1)),material(color),x,y,z);m.scale.set(w,h,d);return m;}
 function sphere(parent,r,color,x=0,y=0,z=0,scale=[1,1,1]){const m=mesh(parent,geo('sphere',()=>new T.SphereGeometry(1,24,16)),material(color),x,y,z);m.scale.set(r*scale[0],r*scale[1],r*scale[2]);return m;}
 function cylinder(parent,r,height,color,x=0,y=0,z=0,top=r){return mesh(parent,geo(`cyl:${r}:${top}:${height}`,()=>new T.CylinderGeometry(top,r,height,20)),material(color),x,y,z);}
 function ring(parent,r,width,color,x=0,y=0,z=0,floor=false){const m=mesh(parent,geo(`ring:${r}:${width}`,()=>new T.TorusGeometry(r,width,8,48)),material(color),x,y,z);if(floor)m.rotation.x=Math.PI/2;return m;}
 function rod(parent,a,b,width,color){const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start),m=cylinder(parent,width,delta.length(),color);m.position.copy(start.add(end).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;}
 return {box,sphere,cylinder,ring,rod,mesh,mat,glow,geo};
}
const smooth=p=>{p=Math.max(0,Math.min(1,p));return p*p*(3-2*p);};

export async function createCompanionScene(container,{onProgress,onFrame,onArrival,onScenario}={}){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
 container.append(renderer.domElement);onProgress?.(40,'Montando o robô…');
 const world=new T.Scene();world.background=new T.Color('#000');
 world.add(new T.HemisphereLight('#e3f4ff','#536775',1.9));
 const key=new T.DirectionalLight('#fff3e5',3.4);key.position.set(-3,5,4);world.add(key);
 const fill=new T.DirectionalLight('#95ceff',2.2);fill.position.set(4,2,1);world.add(fill);
 const rim=new T.DirectionalLight('#79c6ff',3);rim.position.set(1,3,-4);world.add(rim);
 const camera=new T.PerspectiveCamera(42,1,.1,160),art=robotArt();
 const rig=createRigFactory(art).robot({floating:true});rig.root.name='sato-companion';rig.root.rotation.y=.12;rig.root.visible=false;world.add(rig.root);
 const chute=createDeliveryChute(world,art,{height:8,radius:1.08});chute.visible=false;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),sets=new Map(),pendingSets=new Map();
 let width=1,height=1,frame=0,last=0,time=0,speakingUntil=0,reaction=null,disposed=false,lookYaw=0,body,resizePending=true;
 let bufferWidth=0,bufferHeight=0;
 let arrival=null,arrivalResolve,arrivalPromise,currentScenario='black',desiredScenario='black',level=0,scenarioRevision=0;
 container.dataset.scenario='black';container.dataset.arrival='waiting';
 const point=new T.Vector3(),bodyCorners=[];
 for(const x of [-1.05,1.05])for(const y of [.26,1.87])for(const z of [-.3,.65])bodyCorners.push(new T.Vector3(x,y,z));
 function project(x,y,z){point.set(x,y,z).applyMatrix4(rig.root.matrixWorld).project(camera);return {x:(point.x+1)*width/2,y:(1-point.y)*height/2};}
 function report(){rig.root.updateMatrixWorld(true);onFrame?.({head:project(0,1.78,.2),body,width,height});}
 function resize(){resizePending=true;}
 function applyResize(){
  resizePending=false;
  const bounds=container.getBoundingClientRect();width=Math.max(1,Math.round(bounds.width));height=Math.max(1,Math.round(bounds.height));
  // Reserve room through framing, while the skybox continues behind the input.
  const composer=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--composer-height'))||88;
  const stageHeight=Math.max(height*.35,height-composer-10),span=width<600?5.4:5.6,aspect=width/stageHeight,aim=span/2-.13;
  camera.fov=T.MathUtils.radToDeg(2*Math.atan(span/(2*Math.hypot(7,.6))));camera.aspect=aspect;
  camera.setViewOffset(width,stageHeight,0,0,width,height);
  camera.position.set(.45,aim+.6,7);camera.lookAt(0,aim,0);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  if(bufferWidth!==width||bufferHeight!==height){renderer.setSize(width,height,false);bufferWidth=width;bufferHeight=height;}
  const neutral=new T.Matrix4().makeRotationY(.12),corners=bodyCorners.map(v=>v.clone().applyMatrix4(neutral).project(camera)),xs=corners.map(p=>(p.x+1)*width/2),ys=corners.map(p=>(1-p.y)*height/2);
  body={left:Math.max(0,Math.min(...xs)),top:Math.max(0,Math.min(...ys)),right:Math.min(width,Math.max(...xs)),bottom:Math.min(height,Math.max(...ys))};report();
 }
 const observer=new ResizeObserver(resize);observer.observe(container);applyResize();
 function stage(name){if(container.dataset.arrival===name)return;container.dataset.arrival=name;onArrival?.(name);}
 function arrive(){
  if(arrivalPromise)return arrivalPromise;
  arrivalPromise=new Promise(resolve=>{arrivalResolve=resolve;});rig.root.visible=true;
  if(reduced.matches){stage('settled');arrivalResolve();return arrivalPromise;}
  arrival={at:time};chute.visible=true;stage('tube');return arrivalPromise;
 }
 function arrivalPose(){
  const age=time-arrival.at;chute.position.y=3.05+5*(1-smooth(age/1.85));
  if(age<1.85){rig.root.visible=false;return;}
  rig.root.visible=true;
  if(age<2.6){
   stage('fall');const p=(age-1.85)/.75;rig.root.position.y=3.05*(1-p*p);rig.root.rotation.z=-.25*p;rig.root.rotation.y=.12+.25*Math.sin(p*Math.PI);
   // Unfold only after the entire shell clears the mouth; never widen inside it.
   const clearance=smooth((3.05-(rig.root.position.y+1.84))/.65);
   rig.root.rotation.z=-.18*clearance;
   for(const arm of rig.arms){arm.upper.rotation.set(-.15*clearance,0,arm.side*(.025+.9*clearance));}
  }else if(age<3.35){
   stage('ouch');const p=smooth((age-2.6)/.75);rig.root.position.y=-.05;rig.hips.position.y=.42;rig.root.rotation.z=-.18*(1-p);rig.spine.rotation.x=.18;setRigBlink(rig,.8);rig.spine.rotation.z=-.13;
   for(const arm of rig.arms){arm.upper.rotation.x=-.7;arm.lower.rotation.x=-.5;}
   for(const leg of rig.legs){leg.upper.rotation.x=-.7;leg.lower.rotation.x=1.05;leg.ankle.rotation.x=-.35;}
  }else if(age<4.6){
   stage('rise');const p=smooth((age-3.35)/1.25),crouch=1-p;rig.root.position.y=-.05*crouch;rig.hips.position.y=.54-.12*crouch;rig.spine.rotation.x=.18*crouch;rig.spine.rotation.z=-.13*crouch;
   for(const leg of rig.legs){leg.upper.rotation.x=-.7*crouch;leg.lower.rotation.x=1.05*crouch;leg.ankle.rotation.x=-.35*crouch;}
   for(const arm of rig.arms){arm.upper.rotation.x=-.7*crouch;arm.lower.rotation.x=-.5*crouch;}
  }else{arrival=null;chute.visible=false;stage('settled');arrivalResolve?.();return;}
  if(age>2.65)chute.position.y=3.05+5*smooth((age-2.65)/1.9);
 }
 function pose(dt){
  poseRig(rig,reduced.matches?0:time,dt,{attention:1,talk:time<speakingUntil,lookYaw,reduced:reduced.matches});
  rig.root.rotation.set(0,.12,0);rig.root.position.y=0;rig.root.scale.setScalar(1);rig.head.rotation.z=0;
  if(arrival){arrivalPose();return;}
  if(!reduced.matches){rig.root.position.y=Math.sin(time*1.65)*.045;rig.spine.rotation.z+=Math.sin(time*.8)*.025;}
  if(!reaction)return;
  const elapsed=time-reaction.at,p=Math.min(1,elapsed/reaction.duration),envelope=Math.sin(p*Math.PI);
  if(p>=1){if(reaction.kind==='dance')for(const arm of rig.arms){arm.upper.rotation.x=0;if(arm.wrist)arm.wrist.rotation.y=0;}reaction=null;container.dataset.reaction='idle';return;}
  const right=rig.arms[1],left=rig.arms[0];
  if(reduced.matches){rig.spine.rotation.z=envelope*.08;return;}
  switch(reaction.kind){
   case 'wave':case 'hello':right.upper.rotation.z=1.95*envelope+.2;right.upper.rotation.x=-.35*envelope;right.lower.rotation.x=-.8*envelope;right.lower.rotation.z=Math.sin(elapsed*12)*.3*envelope;rig.spine.rotation.z=-.1*envelope;break;
   case 'boop':rig.root.position.y=envelope*.16;rig.spine.rotation.x=-.16*envelope;left.upper.rotation.z=-.8*envelope-.2;right.upper.rotation.z=.8*envelope+.2;break;
   case 'dance':{
    // One complete body turn and two shoulder windmills with eased starts/stops.
    const turn=smooth(p),beat=Math.sin(elapsed*10),spin=turn*Math.PI*4;
    rig.root.rotation.y=.12+turn*Math.PI*2;rig.hips.rotation.z=beat*.07*envelope;rig.root.position.y=Math.abs(beat)*.055*envelope;
    for(const arm of rig.arms){arm.upper.rotation.z=arm.side*(.2+1.05*envelope);arm.upper.rotation.x=spin*arm.side;arm.lower.rotation.x=-.28*envelope;arm.lower.rotation.z=Math.sin(elapsed*10+arm.side)*.12*envelope;if(arm.wrist)arm.wrist.rotation.y=Math.sin(elapsed*10)*.3*envelope;}
    for(const leg of rig.legs){leg.upper.rotation.x=Math.sin(elapsed*10+leg.side)*.15*envelope;leg.ankle.rotation.x=-Math.max(0,beat*leg.side)*.18*envelope;}break;
   }
   case 'shy':rig.spine.rotation.z=.22*envelope;rig.spine.rotation.x=.1*envelope;left.upper.rotation.x=-1.2*envelope;left.lower.rotation.x=-.65*envelope;right.upper.rotation.z=.4*envelope+.2;break;
  }
  if(reaction.kind==='boop'||reaction.kind==='shy')setRigBlink(rig,Math.sin(Math.min(1,p*3)*Math.PI));
 }
 function updateScenario(dt){
  const out=currentScenario!==desiredScenario;level=Math.max(0,Math.min(1,level+(out?-dt/ .28:dt/.48)));
  if(reduced.matches)level=out?0:1;
  sets.get(currentScenario)?.setLevel(level);
  if(out&&level===0){sets.get(currentScenario)?.setLevel(0);activateScenario(desiredScenario);}
 }
 function activateScenario(kind){currentScenario=kind;world.fog=kind==='black'?null:new T.FogExp2(kind==='forest'?'#aac8dd':'#d5e2ec',kind==='forest'?.031:.024);container.dataset.scenario=kind;container.closest('#home').dataset.scenario=kind;onScenario?.(kind);}
 async function setScenario(kind,{immediate=false}={}){
  if(!['black','lab','forest'].includes(kind))throw new Error('Cenário inválido.');
  const revision=++scenarioRevision;
  if(kind!=='black'&&!sets.has(kind)){
   if(!pendingSets.has(kind))pendingSets.set(kind,(async()=>{
    const {createMiniEnvironment}=await import('./home-environments.js');if(disposed)return;
    const set=await createMiniEnvironment(kind,art);if(disposed){disposeSet(set);return;}world.add(set.root,set.skybox);
    await renderer.compileAsync(set.root,camera,world);if(disposed){disposeSet(set);return;}sets.set(kind,set);
   })().finally(()=>pendingSets.delete(kind)));
   await pendingSets.get(kind);
  }
  if(disposed||revision!==scenarioRevision)return false;
  desiredScenario=kind;
  if(immediate){sets.get(currentScenario)?.setLevel(0);activateScenario(kind);level=1;sets.get(kind)?.setLevel(1);renderer.render(world,camera);}
  return true;
 }
 function render(stamp){
  if(disposed)return;frame=requestAnimationFrame(render);if(document.hidden){last=stamp;return;}
  if(stamp-last<1000/30&&!resizePending)return;const dt=Math.min(.06,(stamp-last)/1000||.033);last=stamp;time+=dt;
  if(resizePending)applyResize();pose(dt);updateScenario(dt);renderer.render(world,camera);report();
 }
 function react(kind='wave'){if(reaction?.kind==='dance')for(const arm of rig.arms){arm.upper.rotation.x=0;if(arm.wrist)arm.wrist.rotation.y=0;}reaction={kind,at:time,duration:kind==='dance'?4.2:kind==='hello'?2.6:1.8};container.dataset.reaction=kind;}
 function look(event){const bounds=container.getBoundingClientRect();lookYaw=Math.max(-.3,Math.min(.3,((event.clientX-bounds.left)/bounds.width-.5)*.5));}
 function disposeSet(set){for(const root of [set.root,set.skybox]){root.traverse(o=>{o.geometry?.dispose();for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});root.removeFromParent();}}
 const leave=()=>{lookYaw=0;};container.addEventListener('pointermove',look);container.addEventListener('pointerleave',leave);
 onProgress?.(75,'Acendendo as luzes…');rig.root.visible=true;chute.visible=true;await renderer.compileAsync(world,camera);rig.root.visible=false;chute.visible=false;renderer.render(world,camera);report();frame=requestAnimationFrame(render);
 return {arrive,react,setScenario,resize,speak(duration=2){speakingUntil=time+duration;},dispose(){
  disposed=true;arrivalResolve?.();cancelAnimationFrame(frame);observer.disconnect();container.removeEventListener('pointermove',look);container.removeEventListener('pointerleave',leave);
  const geometries=new Set(),materials=new Set(),textures=new Set();world.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();
 }};
}
