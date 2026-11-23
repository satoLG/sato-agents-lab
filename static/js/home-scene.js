import * as T from '../vendor/three.module.min.js';
import {createCompanionBot,poseCompanion} from './companion-bot.js';
import {createDeliveryChute} from './lab-chute.js';
import {updateNature} from './nature-motion.js';
import {createSceneArt} from './scene-art.js';
import {createHomeNavigation} from './home-navigation.js';
import {createPortal} from './home-portal.js';
import {validMimicPlan} from './robot-mimic.js';
import {createMimicPerformer} from './mimic-performer.js';

const smooth=p=>{p=Math.max(0,Math.min(1,p));return p*p*(3-2*p);};
// Portal crossing: the rift sits GAP behind the companion and the next world's
// origin DEPTH behind it; times are seconds since the rift started to open.
const GAP=1.15,DEPTH=1.8,ENTER=.5,DIVE=1.25,ARRIVE=2,UP=new T.Vector3(0,1,0);

export async function createCompanionScene(container,{onProgress,onFrame,onArrival,onScenario,onExplore,onPortal}={}){
 // Nintendo 64 era textures at close to native resolution: the buffer uses
 // up to 1.25 device pixels per CSS pixel and no MSAA. Sustained slow frames
 // shrink it by up to two more steps of 30%.
 const renderer=new T.WebGLRenderer({antialias:false,alpha:true,powerPreference:'low-power'});
 let coarseness=0,qualityFrames=0,qualityElapsed=0;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
 container.append(renderer.domElement);onProgress?.(40,'Montando o robô…');
 const world=new T.Scene();renderer.setClearColor('#111b21',0);
 const hemisphere=new T.HemisphereLight('#e3f4ff','#536775',1.9);world.add(hemisphere);
 const key=new T.DirectionalLight('#fff3e5',3.4);key.position.set(-3,5,4);world.add(key);
 const fill=new T.DirectionalLight('#95ceff',2.2);fill.position.set(4,2,1);world.add(fill);
 const rim=new T.DirectionalLight('#79c6ff',3);rim.position.set(1,3,-4);world.add(rim);
 const camera=new T.PerspectiveCamera(42,1,.1,160),art=createSceneArt();
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 const rig=createCompanionBot(art,{reduced:()=>reducedMotion.matches});rig.root.name='sato-companion';rig.root.rotation.y=.12;rig.root.visible=false;world.add(rig.root);
 const performer=createMimicPerformer(rig);
 const chute=createDeliveryChute(world,art,{height:8,radius:1.08});chute.visible=false;
 const reduced=reducedMotion,sets=new Map(),pendingSets=new Map();
 let width=1,height=1,frame=0,last=0,time=0,speakingUntil=0,reaction=null,disposed=false,lookYaw=0,body,resizePending=true;
 let bufferWidth=0,bufferHeight=0,lookPitch=0,frontFov=42,transition=null;
 // Once the rift covers the whole screen, a plane sweeps from it to the camera
 // and cuts away what is left of the world being left in front of it, so
 // nothing of it remains once the rift is gone. Before that, the next world
 // only shows inside the rift.
 // The plane stays installed (keeping everything when idle) so no program
 // ever recompiles for it mid-crossing.
 const sweep=new T.Plane(),sweepPoint=new T.Vector3(),keepAll=()=>sweep.set(T.Object3D.DEFAULT_UP,1e6);
 keepAll();renderer.clippingPlanes=[sweep];
 // While the rift grows, the ground between it and the camera, and whatever
 // stands there, gives way to the next world with it: the world being left is
 // clipped inside a prism from the rift toward the camera, as wide as the rift
 // seen from the camera. Every scenario material carries these planes from the
 // start (intersected, so only the prism is cut); idle, the top plane sits
 // far below the ground and nothing is clipped.
 renderer.localClippingEnabled=true;
 const reveal=[0,1,2,3,4].map(()=>new T.Plane()),revealShape=reveal.map(()=>new T.Plane()),revealIdle=()=>reveal[4].set(T.Object3D.DEFAULT_UP,1e6);
 revealIdle();
 const portal=createPortal(world);
 // Whether the rift already spans every screen corner, using the shader's own
 // ellipse (see home-portal.js) with room for its jitter and torn rows.
 const corner=new T.Vector3(),riftNormal=new T.Vector3(),ray=new T.Ray(),riftPlane=new T.Plane();
 function riftCoversScreen(open){
  const rx=1.22*Math.min(open*2.4,Math.max(1,open)),ry=1.66*(open<1?open*open:open);
  riftPlane.setFromNormalAndCoplanarPoint(riftNormal.set(0,0,1).applyQuaternion(portal.group.quaternion),portal.group.position);
  for(const [x,y] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
   ray.origin.copy(camera.position);ray.direction.set(x,y,.5).unproject(camera).sub(camera.position).normalize();
   if(!ray.intersectPlane(riftPlane,corner))return false;
   portal.group.worldToLocal(corner);
   if(Math.hypot((Math.abs(corner.x)+.4)/rx,(Math.abs(corner.y)+.15)/ry)>.85)return false;
  }
  return true;
 }
 // The prism: behind the camera-side face of the rift, in front of a plane
 // `tr.reveal` metres toward the camera, between the planes through the
 // camera and the rift's sides, and below its top.
 const revealPoint=new T.Vector3(),revealNormal=new T.Vector3(),revealSide=new T.Vector3();
 function shapeReveal(tr,open){
  const rift=portal.group.position,back=tr.back,depth=tr.reveal,eye=camera.position;
  const half=1.22*Math.min(open*2.4,Math.max(1,open)),top=1.66*(open<1?open*open:open);
  revealSide.set(back.z,0,-back.x);
  revealShape[0].setFromNormalAndCoplanarPoint(back,revealPoint.copy(rift).addScaledVector(back,.02));
  revealShape[1].setFromNormalAndCoplanarPoint(revealNormal.copy(back).negate(),revealPoint.copy(rift).addScaledVector(back,-depth));
  for(const [i,sign] of [[2,1],[3,-1]]){
   revealPoint.copy(rift).addScaledVector(revealSide,sign*half).sub(eye);
   revealNormal.crossVectors(revealPoint,UP).normalize();if(revealNormal.dot(revealSide)*sign<0)revealNormal.negate();
   revealShape[i].setFromNormalAndCoplanarPoint(revealNormal,eye);
  }
  revealShape[4].set(UP,-(rift.y+top));
  // The seam rides the front edge on the ground, as wide as the prism there.
  const span=revealPoint.copy(rift).sub(eye).dot(back),width=2*half*(span-depth)/span;
  tr.seam=!reduced.matches&&depth>.05&&width>.05;
  if(tr.seam){
   revealPoint.copy(rift).addScaledVector(back,-depth);
   const ground=sets.get(currentScenario)?.groundHeight?.(revealPoint.x,revealPoint.z)??tr.floorFrom;
   portal.edge(revealPoint.x,ground+.03,revealPoint.z,tr.yaw,width);
  }
 }
 // Nothing of the world being left writes depth where the ground gave way, so
 // its skybox would show there. Like the rift's mask, a depth-only floor at
 // the ground, kept to the prism, holds the next world in place.
 const revealKeep=reveal.map(()=>new T.Plane());
 const revealFloor=new T.Mesh(new T.PlaneGeometry(1,1).rotateX(-Math.PI/2),new T.MeshBasicMaterial({colorWrite:false,clippingPlanes:revealKeep}));
 revealFloor.name='portal-reveal-floor';revealFloor.renderOrder=-1000;revealFloor.frustumCulled=false;revealFloor.visible=false;world.add(revealFloor);
 // Each scenario already owns its materials (copied by its exterior fade), so
 // the companion and the chute never carry these planes.
 function prepareReveal(set){
  set.root.traverse(o=>{for(const m of [o.material].flat())if(m){m.clippingPlanes=reveal;m.clipIntersection=true;}});
 }
 const frontPosition=new T.Vector3(),frontTarget=new T.Vector3();
 // Entering or leaving exploration never cuts: the first frame repeats the
 // last one shown and the view glides to the new framing. The view offset is
 // a virtual canvas height (stage height in front view, the viewport while
 // exploring), so it interpolates with position, orientation and fov.
 const CAMERA_BLEND=.8,shot=()=>({position:new T.Vector3(),quaternion:new T.Quaternion(),fov:42,full:1});
 const shown=shot(),goal=shot(),blend={from:shot(),at:-1,restore:false};
 function project3(fov,full){camera.fov=fov;camera.aspect=width/full;if(Math.abs(full-height)<.5)camera.clearViewOffset();else camera.setViewOffset(width,full,0,0,width,height);camera.updateProjectionMatrix();}
 function capture(view){view.position.copy(camera.position);view.quaternion.copy(camera.quaternion);view.fov=camera.fov;view.full=camera.view?.enabled?camera.view.fullHeight:height;return view;}
 function apply(view){camera.position.copy(view.position);camera.quaternion.copy(view.quaternion);project3(view.fov,view.full);camera.updateMatrixWorld(true);}
 function blendCamera(){
  capture(goal);const p=blend.at<0||transition?1:smooth((time-blend.at)/CAMERA_BLEND);
  if(p>=1){blend.at=-1;capture(shown);return false;}
  const from=blend.from;
  camera.position.lerpVectors(from.position,goal.position,p);camera.quaternion.slerpQuaternions(from.quaternion,goal.quaternion,p);
  project3(from.fov+(goal.fov-from.fov)*p,from.full+(goal.full-from.full)*p);camera.updateMatrixWorld(true);capture(shown);return true;
 }
 let arrival=null,arrivalResolve,arrivalPromise,currentScenario='black',desiredScenario='black',scenarioRevision=0;
 container.dataset.scenario='black';container.dataset.arrival='waiting';
 const navigation=createHomeNavigation(container,rig,camera,{getEnvironment:()=>sets.get(currentScenario),onChange(active){stopMimic();reaction=null;lookYaw=lookPitch=0;resizePending=true;if(!reduced.matches&&!transition){blend.from.position.copy(shown.position);blend.from.quaternion.copy(shown.quaternion);blend.from.fov=shown.fov;blend.from.full=shown.full;blend.at=time;}onExplore?.(active);}});
 const point=new T.Vector3(),bodyCorners=[];
 for(const x of [-1.05,1.05])for(const y of [.26,1.87])for(const z of [-.3,.65])bodyCorners.push(new T.Vector3(x,y,z));
 function project(x,y,z){point.set(x,y,z).applyMatrix4(rig.root.matrixWorld).project(camera);return {x:(point.x+1)*width/2,y:(1-point.y)*height/2};}
 function report(){rig.root.updateMatrixWorld(true);const corners=bodyCorners.map(v=>project(v.x,v.y,v.z)),xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);body={left:Math.max(0,Math.min(...xs)),top:Math.max(0,Math.min(...ys)),right:Math.min(width,Math.max(...xs)),bottom:Math.min(height,Math.max(...ys))};onFrame?.({head:project(0,1.78,.2),speechAnchor:project(0,performer.active?2.6:1.78,.2),body,width,height});}
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
  const scale=Math.min(devicePixelRatio,1.25)*Math.pow(.7,coarseness),columns=Math.ceil(width*scale),lines=Math.ceil(height*scale);
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
  const imitation=performer.update(time,{reduced:reduced.matches});
  poseCompanion(rig,reduced.matches?0:time,dt,{speed:navigation.speed,travelAngle:navigation.travelAngle,talk:time<speakingUntil,reduced:reduced.matches,travel});
  if(!navigation.active&&!navigation.returning)rig.root.rotation.y=navigation.facingYaw;
  rig.root.rotation.x=rig.root.rotation.z=0;rig.root.scale.setScalar(1);rig.head.rotation.z=0;
  if(arrival){arrivalPose();return;}
  const floor=sets.get(currentScenario)?.groundHeight?.(rig.root.position.x,rig.root.position.z)||0;
  rig.root.position.y=floor;
  if(!reduced.matches){rig.root.position.y+=Math.sin(time*1.65)*.045;if(navigation.speed<.01)rig.spine.rotation.z+=Math.sin(time*.8)*.025;}
  if(navigation.active)return;
  if(imitation){rig.root.position.y=floor+imitation.lift;rig.root.rotation.x=imitation.pitch;rig.root.rotation.y=navigation.facingYaw+imitation.yaw;rig.root.rotation.z=imitation.roll;return;}
  if(!performer.active&&container.dataset.mimic==='playing'){container.dataset.mimic='idle';container.dataset.reaction='idle';}
  if(!reaction)return;
  const elapsed=time-reaction.at,p=Math.min(1,elapsed/reaction.duration),envelope=Math.sin(p*Math.PI);
  if(p>=1){stopMimic();reaction=null;container.dataset.reaction='idle';return;}
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
  transition={to,at:time,yaw,start,back,floorFrom,floorTo,camera:camera.position.clone(),stage:'',inNext:false,inFrom:true,coverAt:null};
  portal.place(start.x+back.x*GAP,floorFrom+1.25,start.z+back.z*GAP,yaw,floorFrom);
  if(next){next.root.position.copy(start).addScaledVector(back,DEPTH);next.root.rotation.y=next.skybox.rotation.y=yaw;}
  reaction=null;container.dataset.reaction='idle';home.dataset.portal=to;portal.flash=.45;rig.face.mood('wide',ENTER+.2);rig.gesture('up',ENTER);portalStage('open');
 }
 function crossPortal(){
  const tr=transition,age=time-tr.at,opening=smooth(age/.55),enter=smooth((age-ENTER)/.85),dive=smooth((age-DIVE)/(ARRIVE-DIVE));
  if(age>=ARRIVE){arrivePortal();return;}
  if(age>=DIVE){if(tr.stage!=='dive'){rig.face.mood('happy',1.6);rig.gesture('up',ARRIVE-DIVE+.5);}portalStage('dive');}
  else if(age>=ENTER){if(tr.stage!=='enter')rig.gesture('tuck',DIVE-ENTER);portalStage('enter');}
  // A slit that overshoots as it tears open, then swallows the whole view.
  const open=dive>0?1+dive*dive*11:opening*(1+.12*Math.sin(opening*Math.PI));
  portal.set({open,time,tear:Math.max(1-opening*.8,dive)});
  const depth=DEPTH*enter,turn=Math.PI*(smooth((age-.12)/.45)+smooth((age-DIVE-.05)/.6));
  rig.root.position.set(tr.start.x+tr.back.x*depth,tr.floorFrom+(tr.floorTo-tr.floorFrom)*enter+Math.sin(time*1.65)*.045,tr.start.z+tr.back.z*depth);
  rig.root.rotation.y=navigation.facingYaw+turn;
  // Each world draws the companion while any part of it is on its side.
  tr.inNext=depth>GAP-.95;tr.inFrom=depth<GAP+.95;
  camera.position.copy(tr.camera).addScaledVector(tr.back,DEPTH*dive);camera.position.y+=(tr.floorTo-tr.floorFrom)*dive;camera.updateMatrixWorld(true);
  // The cut waits until the rift fills the screen (or the very end, on an
  // unusually wide view), then reaches from just past it to beyond the camera.
  if(tr.coverAt===null&&age>=DIVE&&(riftCoversScreen(open)||age>=ARRIVE-.25))tr.coverAt=age;
  const rift=portal.group.position,reach=tr.camera.clone().sub(rift).dot(tr.back)*-1+1.5,cut=tr.coverAt===null?0:smooth((age-tr.coverAt)/Math.max(.12,ARRIVE-tr.coverAt-.02));
  tr.cut=cut;tr.sweepAt=rift.clone().addScaledVector(tr.back,.2-(reach+.2)*cut);
  // The ground gives way from the rift toward the camera while the rift
  // grows, reaching past the camera just before the arrival.
  tr.reveal=reach*smooth((age-ENTER)/(ARRIVE-.15-ENTER));tr.shape=revealShape;shapeReveal(tr,open);
 }
 function arrivePortal(){
  const tr=transition,next=sets.get(tr.to);sets.get(currentScenario)?.setLevel(0);
  if(next){next.root.position.set(0,0,0);next.root.rotation.y=next.skybox.rotation.y=0;}
  portalStage('arrive');transition=null;portal.group.visible=portal.eraser.visible=portal.seam.visible=revealFloor.visible=false;revealIdle();rig.root.visible=true;portal.flash=1;delete home.dataset.portal;
  activateScenario(tr.to);next?.setLevel(1);
 }
 // Two passes while a rift is open: the next world, then the current one
 // around the rift. The second pass is the frame's regular draw.
 function drawPortal(){
  renderer.autoClear=true;keepAll();revealIdle();if(!transition)return;
  const tr=transition,from=sets.get(currentScenario),next=sets.get(tr.to);
  applyLook(tr.to);from?.setLevel(0);next?.setLevel(1);portal.group.visible=portal.eraser.visible=false;portal.glitch.visible=portal.seam.visible=revealFloor.visible=false;rig.root.visible=tr.inNext;
  renderer.render(world,camera);
  applyLook(currentScenario);next?.setLevel(0);from?.setLevel(1);portal.group.visible=true;portal.eraser.visible=currentScenario==='black';portal.glitch.visible=portal.flash>.001;rig.root.visible=tr.inFrom;
  if(tr.reveal>0){
   reveal.forEach((plane,i)=>{plane.copy(revealShape[i]);revealKeep[i].copy(plane).negate();});
   revealFloor.position.set(portal.group.position.x,tr.floorFrom,portal.group.position.z);revealFloor.scale.set(80,1,80);
   revealFloor.visible=true;portal.seam.visible=tr.seam;
  }
  renderer.autoClear=false;renderer.clearDepth();if(tr.cut>0)sweep.setFromNormalAndCoplanarPoint(sweepPoint.copy(tr.back).negate(),tr.sweepAt);
 }
 function activateScenario(kind){navigation.setActive(false);navigation.resetFront();rig.root.position.set(0,0,0);rig.root.rotation.y=.12;currentScenario=kind;applyLook(kind);container.dataset.scenario=kind;home.dataset.scenario=kind;resizePending=true;onScenario?.(kind);}
 async function setScenario(kind,{immediate=false}={}){
  if(!['black','lab','forest'].includes(kind))throw new Error('Cenário inválido.');
  stopMimic();
  navigation.setActive(false);
  const revision=++scenarioRevision;
  if(kind!=='black'&&!sets.has(kind)){
   if(!pendingSets.has(kind))pendingSets.set(kind,(async()=>{
    const {createMiniEnvironment}=await import('./home-environments.js');if(disposed)return;
    const set=await createMiniEnvironment(kind,art);if(disposed){disposeSet(set);return;}prepareReveal(set);world.add(set.root,set.skybox);
    // Compile against the destination's fog so the crossing does not stall.
    const fog=world.fog;world.fog=looks[kind].fog;const compiled=renderer.compileAsync(set.root,camera,world);world.fog=fog;
    await compiled;if(disposed){disposeSet(set);return;}sets.set(kind,set);
   })().finally(()=>pendingSets.delete(kind)));
   // While the scenario loads the robot spins its arms like propellers.
   if(!reduced.matches&&!arrival&&!transition){rig.gesture('props',30);rig.face.mood('wide',30);}
   try{await pendingSets.get(kind);}finally{if(!transition){rig.gesture('sides');rig.face.mood('normal');}}
  }
  if(disposed||revision!==scenarioRevision)return false;
  desiredScenario=kind;
  if(immediate&&!transition){sets.get(currentScenario)?.setLevel(0);activateScenario(kind);sets.get(kind)?.setLevel(1);renderer.render(world,camera);}
  return true;
 }
 function render(stamp){
  if(disposed)return;frame=requestAnimationFrame(render);if(document.hidden){last=stamp;return;}
  if(stamp-last<1000/30&&!resizePending)return;const dt=Math.min(.06,(stamp-last)/1000||.033);last=stamp;time+=dt;
  // Navigation keeps steering its own camera; only the drawn frame blended.
  if(blend.restore){apply(goal);blend.restore=false;}
  if(resizePending)applyResize();navigation.update(dt);pose(dt);updateScenario(dt);if(!transition)navigation.frameFront(frontPosition,frontTarget,dt,frontFov);updateNature(time,reduced.matches);sets.get(currentScenario)?.tick(reduced.matches?0:time);
  // Adapt fill resolution only after sustained slow frames, never the CSS size.
  qualityElapsed+=Math.min(.25,(stamp-(render.previousStamp||stamp))/1000);render.previousStamp=stamp;
  // The loop targets 30 fps; when 30 frames average under ~24 fps, make the
  // pixels one step coarser (twice at most) and keep checking.
  if(++qualityFrames>=30){if(qualityElapsed/qualityFrames>.042&&coarseness<2&&!transition){coarseness++;resizePending=true;}qualityFrames=0;qualityElapsed=0;}
  blend.restore=blendCamera();
  drawPortal();
  renderer.render(world,camera);report();
 }
 const reactionFaces={wave:['happy',1.6],hello:['happy',2.2],boop:['ouch',.45],dance:['happy',4.2],shy:['happy',1.8]};
 function stopMimic(){const wasActive=performer.active;performer.stop();if(container.dataset.mimic==='playing'){container.dataset.mimic='idle';container.dataset.reaction='idle';}return wasActive;}
 function mimic(plan,options={}){
  if(disposed||arrival||transition)return {ok:false,answer:'Só um instante, estou terminando meu movimento. Tente de novo já já!'};
  if(!validMimicPlan(plan))return {ok:false,answer:'Não consegui interpretar os movimentos dessa imitação.'};
  navigation.setActive(false);reaction=null;performer.start(plan,time,options);speakingUntil=0;
  container.dataset.mimic='playing';container.dataset.reaction=plan.id;return {ok:true};
 }
 function react(kind='wave'){if(transition)return;stopMimic();const [face,duration]=reactionFaces[kind]||['happy',1.4];rig.face.mood(face,duration);if(kind==='boop')setTimeout(()=>{if(!disposed)rig.face.mood('wide',.7);},450);reaction={kind,at:time,duration:kind==='dance'?4.2:kind==='hello'?2.6:1.8};rig.gesture({wave:'wave',hello:'wave',boop:'front',dance:'dance',shy:'shy'}[kind]||'wave',reaction.duration);container.dataset.reaction=kind;}
 function look(event){if(navigation.active||event.target.closest('dialog'))return;const bounds=container.getBoundingClientRect(),head=project(0,1.2,.4);lookYaw=T.MathUtils.clamp((event.clientX-bounds.left-head.x)/Math.max(100,bounds.width*.4),-.3,.3);lookPitch=T.MathUtils.clamp((head.y-event.clientY+bounds.top)/Math.max(100,bounds.height*.4),-.3,.3);rig.face.look(lookYaw/.3,lookPitch/.3);}
 function disposeSet(set){for(const root of [set.root,set.skybox]){root.traverse(o=>{o.geometry?.dispose();for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});root.removeFromParent();}}
 const leave=()=>{lookYaw=lookPitch=0;rig.face.look(null);};home.addEventListener('pointermove',look);home.addEventListener('pointerdown',look);home.addEventListener('pointerleave',leave);
 onProgress?.(75,'Acendendo as luzes…');rig.root.visible=true;chute.visible=true;await renderer.compileAsync(world,camera);rig.root.visible=false;chute.visible=false;renderer.render(world,camera);report();frame=requestAnimationFrame(render);
 return {arrive,react,setScenario,mimic,stopMimic,resize,setExploring(value){if(arrival||transition||currentScenario!==desiredScenario)return false;return navigation.setActive(value);},get exploring(){return navigation.active;},speak(duration=2){speakingUntil=time+duration;},dispose(){
  stopMimic();rig.face.dispose();disposed=true;arrivalResolve?.();cancelAnimationFrame(frame);observer.disconnect();navigation.dispose();home.removeEventListener('pointermove',look);home.removeEventListener('pointerdown',look);home.removeEventListener('pointerleave',leave);
  const geometries=new Set(),materials=new Set(),textures=new Set();world.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();
 }};
}
