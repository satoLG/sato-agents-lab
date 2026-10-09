import {createRigFactory,poseRig} from './lab-rigs.js';
import {createSceneArt} from './scene-art.js';

export const AVATAR_HEIGHT=1.87;
export const JUMP_TIMING={start:.09,air:.88,land:.14,height:1.65};
export async function loadSatoAvatar(){return createSatoAvatar();}

// The playable Sato uses exactly the companion's hull, optic, arms and thruster.
export function createSatoAvatar(art=createSceneArt()){
 const rig=createRigFactory(art).robot({floating:true});
 rig.root.name='sato-companion';
 let phase='ground',phaseTime=0,flightTime=0,height=0,time=0;
 const events=[];
 function finish(){phase='ground';phaseTime=0;height=0;}
 return Object.defineProperties(Object.assign(rig,{
  model:rig.root,
  drainEvents(){return events.splice(0);},
  jump(){if(phase!=='ground')return false;phase='takeoff';phaseTime=flightTime=0;events.push('jump');return true;},
  attack(){if(phase!=='ground')return false;phase='attack';phaseTime=0;events.push('punch');return true;},
  cancelActions(){finish();events.length=0;},
  update(dt,{speed=0,travelAngle=0,reduced=false}={}){
   dt=Math.min(.1,Math.max(0,dt));phaseTime+=dt;if(!reduced)time+=dt;
   if(phase==='takeoff'||phase==='air'){
    flightTime+=dt;const t=Math.min(1,flightTime/JUMP_TIMING.air);height=4*JUMP_TIMING.height*t*(1-t);
    if(t===1){height=0;phase='landing';phaseTime=0;events.push('land');}
    else if(phase==='takeoff'&&phaseTime>=JUMP_TIMING.start){phase='air';phaseTime=0;}
   }else if(phase==='landing'&&phaseTime>=JUMP_TIMING.land||phase==='attack'&&phaseTime>=.4)finish();
   poseRig(rig,time,dt,{speed,travelAngle,reduced});
   if(phase==='attack')rig.arms[1].upper.rotation.x=-Math.sin(phaseTime/.4*Math.PI)*1.2;
  },
 }),{
  actionState:{get:()=>phase},jumpHeight:{get:()=>height},
  grounded:{get:()=>phase==='ground'||phase==='attack'},attacking:{get:()=>phase==='attack'},
  transitioning:{get:()=>rig.move>.0001||phase!=='ground'},
 });
}
