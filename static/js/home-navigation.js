import * as T from '../vendor/three.module.min.js';

// Sliding circle collision: both robot and camera remain inside the authored room.
export function allowedPosition(x,z,area,radius=.65){
 if(!area||x<area.minX+radius||x>area.maxX-radius||z<area.minZ+radius||z>area.maxZ-radius)return false;
 return !area.obstacles.some(o=>{
  if(o.radius)return Math.hypot(x-o.x,z-o.z)<o.radius+radius;
  const dx=Math.max(o.minX-x,0,x-o.maxX),dz=Math.max(o.minZ-z,0,z-o.maxZ);
  return dx*dx+dz*dz<radius*radius;
 });
}

export function createHomeNavigation(container,rig,camera,{getEnvironment,onChange}){
 const home=container.closest('#home'),stick=document.getElementById('home-joystick'),knob=stick.firstElementChild;
 const keys=new Set(),axis={x:0,y:0},pointers=new Map(),target=new T.Vector3(),desired=new T.Vector3(),front=new T.Vector3(),orbit=new T.Vector3();
 let active=false,yaw=Math.PI,viewYaw=0,pitch=.28,viewPitch=.28,speed=0,travelAngle=0,returning=false,stickPointer=null,frontYaw=0,boom=4.6;
 const listeners=[];
 const listen=(el,event,fn,options)=>{el.addEventListener(event,fn,options);listeners.push(()=>el.removeEventListener(event,fn,options));};
 const controls=()=>!document.querySelector('dialog[open]')&&home.dataset.history!=='true'&&!document.hidden&&!document.activeElement?.matches('input,textarea,[contenteditable=true]');
 const background=event=>!event.target.closest('button,a,input,textarea,dialog,#home-chat,#home-history,#home-speech');
 function reset(){keys.clear();pointers.clear();axis.x=axis.y=0;stickPointer=null;stick.hidden=true;knob.style.transform='';speed=0;container.dataset.moving='false';}
 function setActive(value){
  value=!!value&&!!getEnvironment();if(active===value)return active;
  active=value;reset();returning=!active;home.dataset.exploring=String(active);container.dataset.exploring=String(active);
  if(active){yaw=Math.atan2(camera.position.x-rig.root.position.x,camera.position.z-rig.root.position.z);viewYaw=yaw;pitch=viewPitch=.28;boom=Math.hypot(camera.position.x-rig.root.position.x,camera.position.z-rig.root.position.z);document.activeElement?.blur();}
  if(!active){
   const area=getEnvironment()?.navigation;
   frontYaw=0;
   if(area){
    // Find a clear view in front of the robot even when it stopped by a wall.
    let best=-Infinity;
    for(let i=0;i<16;i++){
     const angle=i*Math.PI/8,viewAngle=angle+Math.atan2(.45,7);let distance=0;
     for(let d=.2;d<=7.2;d+=.2){if(!allowedPosition(rig.root.position.x+Math.sin(viewAngle)*d,rig.root.position.z+Math.cos(viewAngle)*d,area,.25+.5*Math.min(1,d/1.5)))break;distance=d;}
     const score=distance-Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))*.3;
     if(score>best){best=score;frontYaw=angle;}
    }
   }
  }
  onChange?.(active);return active;
 }
 const editable=event=>event.target.closest('input,textarea,[contenteditable=true]');
 listen(window,'keydown',event=>{
  if(!active||editable(event))return;if(event.key==='Escape'){setActive(false);return;}
  if(!controls())return;const key=event.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){event.preventDefault();keys.add(key);}
 });
 listen(window,'keyup',event=>keys.delete(event.key.toLowerCase()));listen(window,'blur',reset);listen(document,'visibilitychange',reset);
 function joystick(event,p){
  const dx=event.clientX-p.x,dy=event.clientY-p.y,length=Math.hypot(dx,dy),scale=Math.min(1,38/Math.max(1,length));
  axis.x=dx*scale/38;axis.y=-dy*scale/38;knob.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;
 }
 listen(home,'pointerdown',event=>{
  if(!active||!controls()||!background(event)||event.button>0)return;
  event.preventDefault();const rect=home.getBoundingClientRect(),touch=event.pointerType!=='mouse';
  const p={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,stick:touch&&event.clientX-rect.left<rect.width*.4&&stickPointer===null};
  pointers.set(event.pointerId,p);home.setPointerCapture(event.pointerId);
  if(p.stick){stickPointer=event.pointerId;stick.style.left=`${p.x-rect.left}px`;stick.style.top=`${p.y-rect.top}px`;stick.hidden=false;joystick(event,p);}
 });
 listen(home,'pointermove',event=>{
  const p=pointers.get(event.pointerId);if(!active||!p||!controls())return;event.preventDefault();
  if(p.stick)joystick(event,p);else{yaw-=(event.clientX-p.lastX)*.006;pitch=T.MathUtils.clamp(pitch+(event.clientY-p.lastY)*.004,.08,.85);}
  p.lastX=event.clientX;p.lastY=event.clientY;
 });
 const release=event=>{pointers.delete(event.pointerId);if(stickPointer===event.pointerId){stickPointer=null;axis.x=axis.y=0;stick.hidden=true;knob.style.transform='';}};
 for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(home,event,release);
 listen(home,'contextmenu',event=>{if(active&&background(event))event.preventDefault();});
 function update(dt){
  const environment=getEnvironment();speed=0;
  if(active&&environment){
   const area=environment.navigation,a=controls()?axis.x+Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')):0;
   const b=controls()?axis.y+Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')):0;
   const magnitude=Math.min(1,Math.hypot(a,b)),normal=Math.max(1,Math.hypot(a,b));
   const dx=(Math.cos(yaw)*a-Math.sin(yaw)*b)/normal*2.5*dt,dz=(-Math.sin(yaw)*a-Math.cos(yaw)*b)/normal*2.5*dt;
   const oldX=rig.root.position.x,oldZ=rig.root.position.z;
   if(allowedPosition(oldX+dx,oldZ,area,.9))rig.root.position.x+=dx;
   if(allowedPosition(rig.root.position.x,oldZ+dz,area,.9))rig.root.position.z+=dz;
   speed=Math.hypot(rig.root.position.x-oldX,rig.root.position.z-oldZ)/dt;
   if(speed>.01){const heading=Math.atan2(rig.root.position.x-oldX,rig.root.position.z-oldZ),delta=Math.atan2(Math.sin(heading-rig.root.rotation.y),Math.cos(heading-rig.root.rotation.y));rig.root.rotation.y+=delta*(1-Math.exp(-dt*10));travelAngle=Math.atan2(Math.sin(heading-rig.root.rotation.y),Math.cos(heading-rig.root.rotation.y));}
   rig.root.position.y=environment.groundHeight?.(rig.root.position.x,rig.root.position.z)||0;
   target.copy(rig.root.position);target.y+=1.15;
   viewYaw+=Math.atan2(Math.sin(yaw-viewYaw),Math.cos(yaw-viewYaw))*(1-Math.exp(-dt*9));viewPitch+=(pitch-viewPitch)*(1-Math.exp(-dt*9));
   const distance=4.6;
   function clearance(angle){
    for(let d=.2;d<=distance;d+=.15)if(!allowedPosition(target.x+Math.sin(angle)*d*Math.cos(viewPitch),target.z+Math.cos(angle)*d*Math.cos(viewPitch),area,.22))return Math.max(0,d-.15);
    return distance;
   }
   // Never shorten through the robot. Near a wall, orbit toward the closest
   // clear angle instead, preserving enough room for the complete silhouette.
   let cameraYaw=viewYaw,safeDistance=clearance(cameraYaw);
   if(safeDistance<1.8){
    let found=false;
    for(let i=1;i<=8&&!found;i++)for(const side of [-1,1]){const angle=viewYaw+side*i*Math.PI/8,room=clearance(angle);if(room>=1.8){cameraYaw=angle;safeDistance=room;found=true;break;}}
   }
   boom=safeDistance<boom?safeDistance:boom+(safeDistance-boom)*(1-Math.exp(-dt*7));if(safeDistance>=1.8)boom=Math.max(1.8,boom);
   if(safeDistance<1.8){camera.position.set(target.x,target.y+3.1,target.z+.1);}else camera.position.set(target.x+Math.sin(cameraYaw)*boom*Math.cos(viewPitch),target.y+Math.sin(viewPitch)*boom,target.z+Math.cos(cameraYaw)*boom*Math.cos(viewPitch));
   camera.lookAt(target);camera.updateMatrixWorld(true);
   container.dataset.moving=String(magnitude>.02&&speed>.01);
  }else if(returning){
   const delta=Math.atan2(Math.sin(frontYaw+.12-rig.root.rotation.y),Math.cos(frontYaw+.12-rig.root.rotation.y));rig.root.rotation.y+=delta*(1-Math.exp(-dt*7));
  }
  return speed;
 }
 function frameFront(basePosition,baseTarget,dt,baseFov){
  if(active)return;
  // Framing follows ground translation, never the fall or hover animation.
  const floor=getEnvironment()?.groundHeight?.(rig.root.position.x,rig.root.position.z)||0;
  desired.set(rig.root.position.x,floor,rig.root.position.z);
  front.copy(basePosition).applyAxisAngle(T.Object3D.DEFAULT_UP,frontYaw).add(desired);target.copy(baseTarget).add(desired);
  const area=getEnvironment()?.navigation;
  if(area){
   orbit.copy(front).sub(target);let fraction=1;
   for(let f=.06;f<=1;f+=.02){if(!allowedPosition(target.x+orbit.x*f,target.z+orbit.z*f,area,.25+.5*Math.min(1,orbit.length()*f/1.5))){fraction=Math.max(.06,f-.02);break;}}
   front.copy(target).addScaledVector(orbit,fraction);
  }
  if(returning){
   const currentAngle=Math.atan2(camera.position.x-rig.root.position.x,camera.position.z-rig.root.position.z),goalAngle=Math.atan2(front.x-rig.root.position.x,front.z-rig.root.position.z);
   const angle=currentAngle+Math.atan2(Math.sin(goalAngle-currentAngle),Math.cos(goalAngle-currentAngle))*(1-Math.exp(-dt*5));
   const radius=Math.hypot(camera.position.x-rig.root.position.x,camera.position.z-rig.root.position.z),goalRadius=Math.hypot(front.x-rig.root.position.x,front.z-rig.root.position.z);
   const r=radius+(goalRadius-radius)*(1-Math.exp(-dt*5));camera.position.set(rig.root.position.x+Math.sin(angle)*r,camera.position.y+(front.y-camera.position.y)*(1-Math.exp(-dt*5)),rig.root.position.z+Math.cos(angle)*r);
   if(area){orbit.copy(camera.position).sub(target);for(let f=.08;f<=1;f+=.04)if(!allowedPosition(target.x+orbit.x*f,target.z+orbit.z*f,area,.22)){camera.position.copy(target).addScaledVector(orbit,Math.max(.08,f-.04));break;}}
   if(camera.position.distanceTo(front)<.015){returning=false;camera.position.copy(front);rig.root.rotation.y=frontYaw+.12;}
  }
  else camera.position.copy(front);
  // Preserve the companion's screen size when a corner requires a shorter boom.
  const fov=Math.min(120,T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(baseFov)/2)*basePosition.distanceTo(baseTarget)/Math.max(.5,camera.position.distanceTo(target)))));
  if(Math.abs(camera.fov-fov)>.001){camera.fov=fov;camera.updateProjectionMatrix();}
  camera.lookAt(target);camera.updateMatrixWorld(true);
 }
 return {setActive,get active(){return active;},get speed(){return speed;},get travelAngle(){return travelAngle;},get returning(){return returning;},get facingYaw(){return frontYaw+.12;},update,frameFront,reset,resetFront(){frontYaw=0;returning=false;},dispose(){reset();listeners.forEach(remove=>remove());}};
}
