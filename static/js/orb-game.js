import * as T from '../vendor/three.module.min.js';
import {createOrbSato} from './orb-sato.js';
import {createOrbMotor} from './orb-motor.js';
import {createOrbSurface} from './orb-surface.js';
import {createOrbTrails} from './orb-trails.js';
import {createOrbCameraOcclusion} from './orb-camera-occlusion.js';

export function createOrbGame({world,island,water,camera,occluders=[],canvas,container,controls,reducedMotion=false,onActivate=()=>{},onExit=()=>{},onContact=()=>{}}) {
  const avatar=createOrbSato(),trails=createOrbTrails(water);
  const antennaTip=avatar.antenna.getObjectByName('antenna-tip');
  const occlusion=createOrbCameraOcclusion([island.trees,...island.rocks,...occluders]);
  const surface=createOrbSurface({land:island.land,rocks:island.rocks,trunks:island.trunks,water});
  const motor=createOrbMotor(surface,{onEvent:event=>{
    trails.emit(event);onContact(event);
    if(event.type==='jump'){avatar.bounce(event.double?-1.9:-1.5);if(event.double)avatar.doubleJump();}
    if(event.type==='land')avatar.bounce(Math.min(3.5,event.impact*1.6));
  }});
  world.add(avatar.root,trails.group);
  const invite=document.getElementById('orb-sato-invite'),hud=document.getElementById('orb-play-controls'),exit=document.getElementById('orb-walk-exit'),jumpButton=document.getElementById('orb-jump'),stick=document.getElementById('orb-stick'),knob=document.getElementById('orb-stick-knob');
  const keys=new Set(),touch=new T.Vector2(),back=new T.Vector3(4.4,0,9.8).normalize(),viewBack=new T.Vector3(),lastUp=motor.up.clone(),cameraTarget=new T.Vector3(),target=new T.Vector3(),desiredCamera=new T.Vector3(),right=new T.Vector3(),direction=new T.Vector3(),frame=new T.Matrix4(),transport=new T.Quaternion();
  motor.heading.copy(back);let playing=false,enabled=false,seconds=0,cameraDistance=2.15,pitch=.64,pointer=null,stickPointer=null,lastMode='';
  const pointers=new Map();let pinchDistance=0;
  const removers=[];
  function listen(node,type,fn,options){node.addEventListener(type,fn,options);removers.push(()=>node.removeEventListener(type,fn,options));}
  function clearInput(){keys.clear();touch.set(0,0);motor.stop();pointers.clear();pinchDistance=0;pointer=null;stickPointer=null;knob.style.transform='translate(0,0)';}
  function setMode(next) {
    if(next===playing||next&&!enabled)return;
    playing=next;clearInput();hud.hidden=!playing;invite.hidden=true;container.dataset.mode=playing?'walk':'orbit';
    if(playing){onActivate();controls.enabled=false;cameraTarget.copy(controls.target);back.copy(camera.position).sub(motor.position).addScaledVector(motor.up,-camera.position.clone().sub(motor.position).dot(motor.up));if(back.lengthSq()<.01)back.set(0,0,1);back.normalize();viewBack.copy(back);lastUp.copy(motor.up);avatar.wakeUp();}
    else {avatar.rest();camera.up.set(0,1,0);controls.target.copy(motor.position);controls.enabled=true;onExit();}
    container.focus({preventScroll:true});document.getElementById('orb-status').textContent=playing?'Controlando Sato. WASD ou setas para andar. Espaço ou botão Pular: pulo duplo. Escape para voltar à órbita.':'Explorando a órbita. Clique no Sato para caminhar novamente.';
  }
  function screenPosition() {
    camera.updateMatrixWorld();
    const center=avatar.root.localToWorld(new T.Vector3(0,.12,0)),view=center.clone().project(camera),bounds=container.getBoundingClientRect();
    const tip=antennaTip.getWorldPosition(new T.Vector3()).project(camera);
    const visible=enabled&&!playing&&view.z>-1&&view.z<1&&Math.abs(view.x)<.95&&Math.abs(view.y)<.95&&motor.up.dot(camera.position.clone().sub(motor.position))>.05;
    return {x:(view.x+1)*bounds.width/2,y:(1-view.y)*bounds.height/2,iconX:T.MathUtils.clamp((tip.x+1)*bounds.width/2,24,bounds.width-24),iconY:T.MathUtils.clamp((1-tip.y)*bounds.height/2-32,24,bounds.height-24),visible};
  }
  listen(invite,'click',()=>setMode(true));listen(exit,'click',()=>setMode(false));
  // Pointerdown works for a second finger while the first holds the stick;
  // touch-generated compatibility clicks must not consume the second jump.
  const jump=()=>{if(playing&&!avatar.waking)motor.jump();};
  listen(jumpButton,'pointerdown',event=>{if(playing){event.preventDefault();jump();}});
  listen(jumpButton,'click',event=>{if(playing&&event.detail===0)jump();});
  listen(window,'keydown',event=>{
    if(!enabled||event.ctrlKey||event.metaKey||event.altKey)return;
    if(!playing){if((event.code==='KeyE'||event.code==='Enter')&&event.target===container){event.preventDefault();setMode(true);}return;}
    if(event.code==='Escape'){event.preventDefault();setMode(false);return;}
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();keys.add(event.code);}
    if(event.code==='Space'&&(!event.target.closest?.('button')||event.target===jumpButton)){event.preventDefault();if(!event.repeat)jump();}
  });
  listen(window,'keyup',event=>keys.delete(event.code));listen(window,'blur',clearInput);
  listen(document,'visibilitychange',()=>{if(document.hidden)clearInput();});
  const zoomBy=factor=>{cameraDistance=T.MathUtils.clamp(cameraDistance*factor,1.25,4.2);};
  const pinchSpan=()=>{const [a,b]=[...pointers.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;};
  listen(canvas,'pointerdown',event=>{
    if(!enabled)return;
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};
    if(playing){pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});pinchDistance=pinchSpan();canvas.setPointerCapture(event.pointerId);}
  });
  listen(canvas,'pointermove',event=>{
    if(!playing||!pointers.has(event.pointerId))return;
    const previous=pointers.get(event.pointerId),dx=event.clientX-previous.x,dy=event.clientY-previous.y;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size>1){const span=pinchSpan();if(pinchDistance>0&&span>0)zoomBy(pinchDistance/span);pinchDistance=span;return;}
    back.copy(viewBack).applyAxisAngle(motor.up,-dx*.006);viewBack.copy(back);
    pitch=T.MathUtils.clamp(pitch+dy*.004,.35,1.12);
  });
  function pointerEnd(event) {
    pointers.delete(event.pointerId);pinchDistance=pinchSpan();
    if(!pointer||pointer.id!==event.pointerId)return;
    if(!playing&&event.type!=='pointercancel'&&Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY)<7) {
      const rect=canvas.getBoundingClientRect(),screen=screenPosition();
      if(screen.visible&&Math.hypot(event.clientX-rect.left-screen.x,event.clientY-rect.top-screen.y)<28)setMode(true);
    }
    pointer=null;
  }
  listen(canvas,'pointerup',pointerEnd);listen(canvas,'pointercancel',pointerEnd);
  listen(canvas,'wheel',event=>{if(playing){event.preventDefault();zoomBy(Math.exp(event.deltaY*.001));}},{passive:false});
  function moveStick(event) {
    if(event.pointerId!==stickPointer)return;
    const bounds=stick.getBoundingClientRect(),x=(event.clientX-bounds.x-bounds.width/2)/34,y=(event.clientY-bounds.y-bounds.height/2)/34;
    touch.set(x,-y);if(touch.length()>1)touch.normalize();if(touch.length()<.12)touch.set(0,0);
    knob.style.transform=`translate(${touch.x*30}px,${-touch.y*30}px)`;
  }
  listen(stick,'pointerdown',event=>{if(!playing)return;event.preventDefault();stickPointer=event.pointerId;stick.setPointerCapture(event.pointerId);moveStick(event);});
  listen(stick,'pointermove',moveStick);
  const releaseStick=event=>{if(event.pointerId===stickPointer){stickPointer=null;touch.set(0,0);knob.style.transform='translate(0,0)';}};
  listen(stick,'pointerup',releaseStick);listen(stick,'pointercancel',releaseStick);
  function update(dt,{time=0,animate=true}={}) {
    const settling=avatar.settling;
    if(playing||animate||!motor.grounded||settling)seconds+=dt;
    transport.setFromUnitVectors(lastUp,motor.up);back.applyQuaternion(transport).addScaledVector(motor.up,-back.dot(motor.up)).normalize();viewBack.applyQuaternion(transport).addScaledVector(motor.up,-viewBack.dot(motor.up)).normalize();lastUp.copy(motor.up);
    right.crossVectors(motor.up,back).normalize();
    const x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
    const y=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)+touch.y;
    const amount=playing&&!avatar.waking?Math.min(1,Math.hypot(x,y)):0;direction.copy(right).multiplyScalar(x).addScaledVector(back,-y);if(direction.lengthSq()>0)direction.normalize();
    if(playing||!motor.grounded)motor.update(dt,{direction,amount,time});
    avatar.root.position.copy(motor.position);right.crossVectors(motor.up,motor.heading).normalize();frame.makeBasis(right,motor.up,motor.heading);avatar.root.quaternion.setFromRotationMatrix(frame);
    avatar.root.userData.orbFoamExclude=motor.waterDepth<=.008;
    avatar.update(playing||animate||settling?dt:0,{time:seconds,speed:playing?motor.velocity.length():0,grounded:motor.grounded,verticalSpeed:motor.verticalSpeed,playing,reduced:reducedMotion});
    trails.update(playing||animate||settling?dt:0,seconds);
    if(playing) {
      target.copy(motor.position).addScaledVector(motor.up,.15);cameraTarget.lerp(target,reducedMotion?1:1-Math.exp(-dt*12));
      // Transport the view around the planet without chasing Sato's facing.
      // Turning/reversing changes only the character, never the camera azimuth.
      viewBack.copy(back);
      desiredCamera.copy(cameraTarget).addScaledVector(viewBack,Math.cos(pitch)*cameraDistance).addScaledVector(motor.up,Math.sin(pitch)*cameraDistance);
      const cameraUp=desiredCamera.clone().normalize(),ground=surface.sample(cameraUp,time),safeRadius=Math.max(ground.radius,ground.waterRadius)+.12;
      if(desiredCamera.length()<safeRadius)desiredCamera.setLength(safeRadius);
      camera.position.lerp(desiredCamera,reducedMotion?1:1-Math.exp(-dt*6));camera.up.lerp(motor.up,reducedMotion?1:1-Math.exp(-dt*10)).normalize();camera.lookAt(cameraTarget);camera.updateMatrixWorld();
      const mode=`${motor.support.surface}-${motor.jumps}`;
      if(mode!==lastMode){jumpButton.dataset.jumps=String(motor.jumps);jumpButton.setAttribute('aria-label',motor.jumps===0?'Pular. Pulo duplo disponível.':motor.jumps===1?'Pular novamente. Segundo pulo disponível.':'Pular ao aterrissar.');container.dataset.surface=motor.support.surface;lastMode=mode;}
    } else {
      const screen=screenPosition();invite.hidden=!screen.visible;if(screen.visible)invite.style.transform=`translate(${screen.iconX}px,${screen.iconY}px) translate(-50%,-50%)`;
    }
    occlusion.update(camera.position,cameraTarget,playing,dt);
    return playing||!motor.grounded||avatar.settling;
  }
  update(0,{animate:false});
  return {avatar,motor,surface,trails,occlusion,get cameraDistance(){return cameraDistance;},update,setMode,screenPosition,get playing(){return playing;},setEnabled(value){enabled=value;},dispose(){clearInput();for(const remove of removers)remove();hud.hidden=true;invite.hidden=true;delete container.dataset.mode;}};
}
