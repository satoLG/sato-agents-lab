import * as T from '../vendor/three.module.min.js';
import {createCompanionBot,poseCompanion} from './companion-bot.js';
import {createDeliveryChute} from './lab-chute.js';
import {updateNature} from './nature-motion.js';
import {createSceneArt} from './scene-art.js';
import {createHomeNavigation} from './home-navigation.js';
import {createPortal} from './home-portal.js';

const smooth=p=>{p=Math.max(0,Math.min(1,p));return p*p*(3-2*p);};
// Portal crossing: the rift sits GAP behind the companion and the next world's
// origin DEPTH behind it; times are seconds since the rift started to open.
const GAP=1.15,DEPTH=1.8,ENTER=.5,DIVE=1.25,ARRIVE=2,UP=new T.Vector3(0,1,0);

export async function createCompanionScene(container,{onProgress,onFrame,onArrival,onScenario,onExplore,onPortal}={}){
 // Nintendo 64 look: the scene draws into a small buffer (about 450 lines)
 // that CSS scales up with hard pixel edges. No MSAA, no device pixel ratio.
 // Sustained slow frames coarsen the pixels by up to two more steps.
 const renderer=new T.WebGLRenderer({antialias:false,alpha:true,powerPreference:'low-power'});
 let coarseness=0,qualityFrames=0,qualityElapsed=0;
 renderer.domElement.style.imageRendering='pixelated';renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
 container.append(renderer.domElement);onProgress?.(40,'Montando o robô…');
 const world=new T.Scene();renderer.setClearColor('#111b21',0);
 const hemisphere=new T.HemisphereLight('#e3f4ff','#536775',1.9);world.add(hemisphere);
 const key=new T.DirectionalLight('#fff3e5',3.4);key.position.set(-3,5,4);world.add(key);
 const fill=new T.DirectionalLight('#95ceff',2.2);fill.position.set(4,2,1);world.add(fill);
 const rim=new T.DirectionalLight('#79c6ff',3);rim.position.set(1,3,-4);world.add(rim);
 const camera=new T.PerspectiveCamera(42,1,.1,160),art=createSceneArt();
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 const rig=createCompanionBot(art,{reduced:()=>reducedMotion.matches});rig.root.name='sato-companion';rig.root.rotation.y=.12;rig.root.visible=false;world.add(rig.root);
 const chute=createDeliveryChute(world,art,{height:8,radius:1.08});chute.visible=false;
 const reduced=reducedMotion,sets=new Map(),pendingSets=new Map();
 let width=1,height=1,frame=0,last=0,time=0,speakingUntil=0,reaction=null,disposed=false,lookYaw=0,body,resizePending=true;
 let bufferWidth=0,bufferHeight=0,lookPitch=0,frontFov=42,transition=null;
 const portal=createPortal(world);
 const frontPosition=new T.Vector3(),frontTarget=new T.Vector3();
 let arrival=null,arrivalResolve,arrivalPromise,currentScenario='black',desiredScenario='black',scenarioRevision=0;
 container.dataset.scenario='black';container.dataset.arrival='waiting';
 const navigation=createHomeNavigation(container,rig,camera,{getEnvironment:()=>sets.get(currentScenario),onChange(active){reaction=null;lookYaw=lookPitch=0;resizePending=true;onExplore?.(active);}});
 const point=new T.Vector3(),bodyCorners=[];
 for(const x of [-1.05,1.05])for(const y of [.26,1.87])for(const z of [-.3,.65])bodyCorners.push(new T.Vector3(x,y,z));
 function project(x,y,z){point.set(x,y,z).applyMatrix4(rig.root.matrixWorld).project(camera);return {x:(point.x+1)*width/2,y:(1-point.y)*height/2};}
 function report(){rig.root.updateMatrixWorld(true);const corners=bodyCorners.map(v=>project(v.x,v.y,v.z)),xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);body={left:Math.max(0,Math.min(...xs)),top:Math.max(0,Math.min(...ys)),right:Math.min(width,Math.max(...xs)),bottom:Math.min(height,Math.max(...ys))};onFrame?.({head:project(0,1.78,.2),body,width,height});}
 function resize(){resizePending=true;}
 function applyResize(){
  resizePending=false;
  const bounds=container.getBoundingClientRect();width=Math.max(1,Math.round(bounds.width));height=Math.max(1,Math.round(bounds.height));
  // Framing depends only on the viewport, never on message or history height.
  const stageHeight=Math.max(height*.35,height-98),span=width<600?5.4:5.6,aspect=width/stageHeight,aim=span/2-.13;
  camera.fov=T.MathUtils.radToDeg(2*Math.atan(span/(2*Math.hypot(7,.6))));camera.aspect=aspect;
  frontFov=camera.fov;
  camera.setViewOffset(width,stageHeight,0,0,width,height);
  frontPosition.set(.45,aim+.6,7);frontTarget.set(0,aim,0);
  if(navigation.active){camera.clearViewOffset();camera.fov=55;camera.aspect=width/height;}else navigation.frameFront(frontPosition,frontTarget,.033,frontFov);
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const pixel=Math.min(5,Math.max(2,Math.round(height/480))+coarseness),columns=Math.ceil(width/pixel),lines=Math.ceil(height/pixel);
  if(bufferWidth!==columns||bufferHeight!==lines){renderer.setSize(columns,lines,false);bufferWidth=columns;bufferHeight=lines;}
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
   stage('fall');rig.face.mood('wide',.9);const p=(age-1.85)/.75;rig.root.position.y=3.05*(1-p*p);rig.root.rotation.z=-.25*p;rig.root.rotation.y=.12+.25*Math.sin(p*Math.PI);
   // Unfold only after the entire shell clears the mouth; never widen inside it.
   const clearance=smooth((3.05-(rig.root.position.y+1.84))/.65);
   rig.root.rotation.z=-.18*clearance;
   rig.gesture('tuck');
  }else if(age<3.35){
   stage('ouch');const p=smooth((age-2.6)/.75);rig.root.position.y=-.05;rig.hips.position.y=.42;rig.root.rotation.z=-.18*(1-p);rig.spine.rotation.x=.18;rig.face.mood('ouch',.8);rig.spine.rotation.z=-.13;
   rig.gesture('up');
   for(const leg of rig.legs){leg.upper.rotation.x=-.7;leg.lower.rotation.x=1.05;leg.ankle.rotation.x=-.35;}
  }else if(age<4.6){
   if(container.dataset.arrival!=='rise')rig.face.mood('happy',1.4);stage('rise');const p=smooth((age-3.35)/1.25),crouch=1-p;rig.root.position.y=-.05*crouch;rig.hips.position.y=.54-.12*crouch;rig.spine.rotation.x=.18*crouch;rig.spine.rotation.z=-.13*crouch;
   for(const leg of rig.legs){leg.upper.rotation.x=-.7*crouch;leg.lower.rotation.x=1.05*crouch;leg.ankle.rotation.x=-.35*crouch;}
   rig.gesture('sides');
  }else{arrival=null;chute.visible=false;stage('settled');arrivalResolve?.();return;}
  if(age>2.65)chute.position.y=3.05+5*smooth((age-2.65)/1.9);
 }
 function pose(dt){
  // While exploring, the LED eyes lead into the travel direction.
  const travel=navigation.active?{x:-Math.sin(navigation.travelAngle)*Math.min(1,navigation.speed/2.2),y:0}:null;
  poseCompanion(rig,reduced.matches?0:time,dt,{speed:navigation.speed,travelAngle:navigation.travelAngle,talk:time<speakingUntil,reduced:reduced.matches,travel});
  if(!navigation.active&&!navigation.returning)rig.root.rotation.y=navigation.facingYaw;
  rig.root.rotation.x=rig.root.rotation.z=0;rig.root.scale.setScalar(1);rig.head.rotation.z=0;
  if(arrival){arrivalPose();return;}
  const floor=sets.get(currentScenario)?.groundHeight?.(rig.root.position.x,rig.root.position.z)||0;
  rig.root.position.y=floor;
  if(!reduced.matches){rig.root.position.y+=Math.sin(time*1.65)*.045;if(navigation.speed<.01)rig.spine.rotation.z+=Math.sin(time*.8)*.025;}
  if(navigation.active)return;
  if(!reaction)return;
  const elapsed=time-reaction.at,p=Math.min(1,elapsed/reaction.duration),envelope=Math.sin(p*Math.PI);
  if(p>=1){reaction=null;container.dataset.reaction='idle';return;}
  if(reduced.matches){rig.spine.rotation.z=envelope*.08;return;}
  switch(reaction.kind){
   case 'wave':case 'hello':rig.spine.rotation.z=-.1*envelope;break;
   case 'boop':rig.root.position.y=envelope*.16;rig.spine.rotation.x=-.16*envelope;break;
   case 'dance':{
    // One complete body turn while both arms orbit the ball (see companion-bot).
    const turn=smooth(p),beat=Math.sin(elapsed*10);
    rig.root.rotation.y=navigation.facingYaw+turn*Math.PI*2;rig.hips.rotation.z=beat*.07*envelope;rig.root.position.y=Math.abs(beat)*.055*envelope;
    for(const leg of rig.legs){leg.upper.rotation.x=Math.sin(elapsed*10+leg.side)*.15*envelope;leg.ankle.rotation.x=-Math.max(0,beat*leg.side)*.18*envelope;}break;
   }
   case 'shy':rig.spine.rotation.z=.22*envelope;rig.spine.rotation.x=.1*envelope;break;
  }
 }
 // Lights, exposure and fog of each scenario; the crossing renders both.
 const looks={
  black:{sky:1.9,ground:'#536775',sun:'#fff3e5',key:3.4,fill:2.2,rim:3,exposure:1.2,fog:null},
  lab:{sky:1.4,ground:'#536775',sun:'#fff3e5',key:2.6,fill:.8,rim:1,exposure:1.1,fog:new T.FogExp2('#c0d2df',.017)},
  forest:{sky:1.15,ground:'#435a39',sun:'#ffe6ba',key:2.7,fill:.45,rim:.75,exposure:1.08,fog:new T.FogExp2('#a8c8cf',.068)},
 };
 function applyLook(kind){const look=looks[kind];hemisphere.intensity=look.sky;hemisphere.groundColor.set(look.ground);key.color.set(look.sun);key.intensity=look.key;fill.intensity=look.fill;rim.intensity=look.rim;renderer.toneMappingExposure=look.exposure;world.fog=look.fog;}
 const home=container.closest('#home');
 function portalStage(name){if(transition.stage===name)return;transition.stage=name;container.dataset.portal=name;onPortal?.(name,transition.to);}
 function updateScenario(dt){
  if(portal.flash>0)portal.flash=Math.max(0,portal.flash-dt/.4);
  if(transition){crossPortal();return;}
  if(currentScenario===desiredScenario)return;
  // Without motion, or before the companion has landed, the swap is instant.
  if(reduced.matches||!rig.root.visible){sets.get(currentScenario)?.setLevel(0);activateScenario(desiredScenario);sets.get(desiredScenario)?.setLevel(1);return;}
  if(arrival||navigation.active||navigation.returning)return;
  openPortal(desiredScenario);
 }
 // The rift opens behind the companion, as seen from the camera, and the next
 // world is parked so that its origin lies just beyond it.
 function openPortal(to){
  const next=sets.get(to),yaw=navigation.facingYaw-.12,start=rig.root.position.clone().setY(0),back=new T.Vector3(0,0,-1).applyAxisAngle(UP,yaw);
  const floorFrom=sets.get(currentScenario)?.groundHeight?.(start.x,start.z)||0,floorTo=next?.groundHeight?.(0,0)||0;
  transition={to,at:time,yaw,start,back,floorFrom,floorTo,camera:camera.position.clone(),stage:'',inNext:false,inFrom:true};
  portal.place(start.x+back.x*GAP,floorFrom+1.25,start.z+back.z*GAP,yaw);
  if(next){next.root.position.copy(start).addScaledVector(back,DEPTH);next.root.rotation.y=next.skybox.rotation.y=yaw;}
  reaction=null;container.dataset.reaction='idle';home.dataset.portal=to;portal.flash=.45;rig.face.mood('wide',ENTER+.2);rig.gesture('up',ENTER);portalStage('open');
 }
 function crossPortal(){
  const tr=transition,age=time-tr.at,opening=smooth(age/.55),enter=smooth((age-ENTER)/.85),dive=smooth((age-DIVE)/(ARRIVE-DIVE));
  if(age>=ARRIVE){arrivePortal();return;}
  if(age>=DIVE){if(tr.stage!=='dive'){rig.face.mood('happy',1.6);rig.gesture('up',ARRIVE-DIVE+.5);}portalStage('dive');}
  else if(age>=ENTER){if(tr.stage!=='enter')rig.gesture('tuck',DIVE-ENTER);portalStage('enter');}
  // A slit that overshoots as it tears open, then swallows the whole view.
  portal.set({open:dive>0?1+dive*dive*11:opening*(1+.12*Math.sin(opening*Math.PI)),time,tear:Math.max(1-opening*.8,dive)});
  const depth=DEPTH*enter,turn=Math.PI*(smooth((age-.12)/.45)+smooth((age-DIVE-.05)/.6));
  rig.root.position.set(tr.start.x+tr.back.x*depth,tr.floorFrom+(tr.floorTo-tr.floorFrom)*enter+Math.sin(time*1.65)*.045,tr.start.z+tr.back.z*depth);
  rig.root.rotation.y=navigation.facingYaw+turn;
  // Each world draws the companion while any part of it is on its side.
  tr.inNext=depth>GAP-.95;tr.inFrom=depth<GAP+.95;
  camera.position.copy(tr.camera).addScaledVector(tr.back,DEPTH*dive);camera.position.y+=(tr.floorTo-tr.floorFrom)*dive;camera.updateMatrixWorld(true);
 }
 function arrivePortal(){
  const tr=transition,next=sets.get(tr.to);sets.get(currentScenario)?.setLevel(0);
  if(next){next.root.position.set(0,0,0);next.root.rotation.y=next.skybox.rotation.y=0;}
  portalStage('arrive');transition=null;portal.group.visible=portal.eraser.visible=false;rig.root.visible=true;portal.flash=1;delete home.dataset.portal;
  activateScenario(tr.to);next?.setLevel(1);
 }
 // Two passes while a rift is open: the next world, then the current one
 // around the rift. The second pass is the frame's regular draw.
 function drawPortal(){
  renderer.autoClear=true;if(!transition)return;
  const tr=transition,from=sets.get(currentScenario),next=sets.get(tr.to);
  applyLook(tr.to);from?.setLevel(0);next?.setLevel(1);portal.group.visible=portal.eraser.visible=false;portal.glitch.visible=false;rig.root.visible=tr.inNext;
  renderer.render(world,camera);
  applyLook(currentScenario);next?.setLevel(0);from?.setLevel(1);portal.group.visible=true;portal.eraser.visible=currentScenario==='black';portal.glitch.visible=portal.flash>.001;rig.root.visible=tr.inFrom;
  renderer.autoClear=false;renderer.clearDepth();
 }
 function activateScenario(kind){navigation.setActive(false);navigation.resetFront();rig.root.position.set(0,0,0);rig.root.rotation.y=.12;currentScenario=kind;applyLook(kind);container.dataset.scenario=kind;home.dataset.scenario=kind;resizePending=true;onScenario?.(kind);}
 async function setScenario(kind,{immediate=false}={}){
  if(!['black','lab','forest'].includes(kind))throw new Error('Cenário inválido.');
  navigation.setActive(false);
  const revision=++scenarioRevision;
  if(kind!=='black'&&!sets.has(kind)){
   if(!pendingSets.has(kind))pendingSets.set(kind,(async()=>{
    const {createMiniEnvironment}=await import('./home-environments.js');if(disposed)return;
    const set=await createMiniEnvironment(kind,art);if(disposed){disposeSet(set);return;}world.add(set.root,set.skybox);
    // Compile against the destination's fog so the crossing does not stall.
    const fog=world.fog;world.fog=looks[kind].fog;const compiled=renderer.compileAsync(set.root,camera,world);world.fog=fog;
    await compiled;if(disposed){disposeSet(set);return;}sets.set(kind,set);
   })().finally(()=>pendingSets.delete(kind)));
   await pendingSets.get(kind);
  }
  if(disposed||revision!==scenarioRevision)return false;
  desiredScenario=kind;
  if(immediate&&!transition){sets.get(currentScenario)?.setLevel(0);activateScenario(kind);sets.get(kind)?.setLevel(1);renderer.render(world,camera);}
  return true;
 }
 function render(stamp){
  if(disposed)return;frame=requestAnimationFrame(render);if(document.hidden){last=stamp;return;}
  if(stamp-last<1000/30&&!resizePending)return;const dt=Math.min(.06,(stamp-last)/1000||.033);last=stamp;time+=dt;
  if(resizePending)applyResize();navigation.update(dt);pose(dt);updateScenario(dt);if(!transition)navigation.frameFront(frontPosition,frontTarget,dt,frontFov);updateNature(time,reduced.matches);sets.get(currentScenario)?.tick(reduced.matches?0:time);
  // Adapt fill resolution only after sustained slow frames, never the CSS size.
  qualityElapsed+=Math.min(.25,(stamp-(render.previousStamp||stamp))/1000);render.previousStamp=stamp;
  // The loop targets 30 fps; when 30 frames average under ~24 fps, make the
  // pixels one step coarser (twice at most) and keep checking.
  if(++qualityFrames>=30){if(qualityElapsed/qualityFrames>.042&&coarseness<2&&!transition){coarseness++;resizePending=true;}qualityFrames=0;qualityElapsed=0;}
  drawPortal();
  renderer.render(world,camera);report();
 }
 const reactionFaces={wave:['happy',1.6],hello:['happy',2.2],boop:['ouch',.45],dance:['happy',4.2],shy:['happy',1.8]};
 function react(kind='wave'){if(transition)return;const [face,duration]=reactionFaces[kind]||['happy',1.4];rig.face.mood(face,duration);if(kind==='boop')setTimeout(()=>{if(!disposed)rig.face.mood('wide',.7);},450);reaction={kind,at:time,duration:kind==='dance'?4.2:kind==='hello'?2.6:1.8};rig.gesture({wave:'wave',hello:'wave',boop:'front',dance:'dance',shy:'shy'}[kind]||'wave',reaction.duration);container.dataset.reaction=kind;}
 function look(event){if(navigation.active||event.target.closest('dialog'))return;const bounds=container.getBoundingClientRect(),head=project(0,1.2,.4);lookYaw=T.MathUtils.clamp((event.clientX-bounds.left-head.x)/Math.max(100,bounds.width*.4),-.3,.3);lookPitch=T.MathUtils.clamp((head.y-event.clientY+bounds.top)/Math.max(100,bounds.height*.4),-.3,.3);rig.face.look(lookYaw/.3,lookPitch/.3);}
 function disposeSet(set){for(const root of [set.root,set.skybox]){root.traverse(o=>{o.geometry?.dispose();for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});root.removeFromParent();}}
 const leave=()=>{lookYaw=lookPitch=0;rig.face.look(null);};home.addEventListener('pointermove',look);home.addEventListener('pointerdown',look);home.addEventListener('pointerleave',leave);
 onProgress?.(75,'Acendendo as luzes…');rig.root.visible=true;chute.visible=true;await renderer.compileAsync(world,camera);rig.root.visible=false;chute.visible=false;renderer.render(world,camera);report();frame=requestAnimationFrame(render);
 return {arrive,react,setScenario,resize,setExploring(value){if(arrival||transition||currentScenario!==desiredScenario)return false;return navigation.setActive(value);},get exploring(){return navigation.active;},speak(duration=2){speakingUntil=time+duration;},dispose(){
  disposed=true;arrivalResolve?.();cancelAnimationFrame(frame);observer.disconnect();navigation.dispose();home.removeEventListener('pointermove',look);home.removeEventListener('pointerdown',look);home.removeEventListener('pointerleave',leave);
  const geometries=new Set(),materials=new Set(),textures=new Set();world.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();
 }};
}
