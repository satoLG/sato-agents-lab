import * as T from '../vendor/three.module.min.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {WALK_SPEED,RUN_SPEED} from './lab-controls.js';

export const AVATAR_HEIGHT=2.45;
export const JUMP_TIMING={start:.09,air:.88,land:.14,height:1.65};
export async function loadSatoAvatar(){
  return createSatoAvatar(await new GLTFLoader().loadAsync(new URL('../models/sato.glb',import.meta.url).href));
}

export function createSatoAvatar({scene,animations}){
  const required=name=>{const c=animations.find(a=>a.name===`Rig|${name}`);if(!c)throw new Error(`Sato precisa do clipe ${name}.`);return c;};
  const root=new T.Group();root.name='Sato';root.rotation.y=.65;
  const mixer=new T.AnimationMixer(scene);
  const idleClip=required('Idle_Loop'),walkClip=required('Walk_Loop'),runClip=required('Sprint_Loop');
  const idle=mixer.clipAction(idleClip).play();
  const walk=mixer.clipAction(walkClip).play().setEffectiveWeight(0);
  const run=mixer.clipAction(runClip).play().setEffectiveWeight(0);
  // Jump height belongs to the controller. Keep hip translation at its rest height
  // so a baked takeoff cannot add a second jump or move the character through walls.
  const neutralHip=idleClip.tracks.find(t=>/hips.*\.position$/.test(t.name));
  function action(name,seconds){
    // Skip the long crouched anticipation in the source takeoff; use its push-off.
    const source=required(name);
    const c=name==='Jump_Start'?T.AnimationUtils.subclip(source,name,Math.floor(source.duration*30*.42),Math.ceil(source.duration*30),30):source.clone();
    if(name.startsWith('Jump_'))for(const t of c.tracks){
      if(/hips.*\.position$/.test(t.name))for(let i=0;i<t.values.length;i+=3){
        t.values[i]=neutralHip?.values[0]??t.values[0];
        t.values[i+1]=neutralHip?.values[1]??t.values[1];
        t.values[i+2]=neutralHip?.values[2]??t.values[2];
      }
    }
    const a=mixer.clipAction(c).setLoop(T.LoopOnce,1);a.clampWhenFinished=true;
    a.setEffectiveTimeScale(c.duration/seconds);return a;
  }
  const jumpStart=action('Jump_Start',JUMP_TIMING.start),jumpAir=action('Jump_Loop',JUMP_TIMING.air),jumpLand=action('Jump_Land',JUMP_TIMING.land);
  const punches=[action('Punch_Jab',.34),action('Punch_Cross',.4)];
  const specials=[jumpStart,jumpAir,jumpLand,...punches],weights=new Map(specials.map(a=>[a,0]));
  const hips=scene.getObjectByName('DEF-hips'),spine=scene.getObjectByName('DEF-spine001');
  const savedHip=new T.Quaternion(),savedSpine=new T.Quaternion(),parentRotation=new T.Quaternion(),turn=new T.Quaternion(),up=new T.Vector3(0,1,0);
  let steered=false,specialWeight=0;
  function worldTurn(bone,angle){if(!bone)return;bone.parent.getWorldQuaternion(parentRotation);turn.setFromAxisAngle(up,angle);turn.premultiply(parentRotation.clone().invert()).multiply(parentRotation);bone.quaternion.premultiply(turn);bone.updateWorldMatrix(false,true);}
  mixer.update(0);scene.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(scene),scale=AVATAR_HEIGHT/(bounds.max.y-bounds.min.y);
  const model=new T.Group();model.scale.setScalar(scale);model.position.y=-bounds.min.y*scale;model.add(scene);root.add(model);
  scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.isSkinnedMesh)o.frustumCulled=false;}});
  let blend=0,runBlend=0,phase='ground',phaseTime=0,flightTime=0,current=null,punchIndex=0,height=0,footPhase=0;
  const events=[];
  function begin(next,a){phase=next;phaseTime=0;current=a;if(a)a.reset().play();}
  function finish(){current=null;phase='ground';phaseTime=0;height=0;}
  return {
    type:'sato',root,model,mixer,idle,walk,run,jumpAction:jumpStart,
    get actionState(){return phase;},get jumpHeight(){return height;},
    get grounded(){return phase==='ground'||phase==='attack';},
    get attacking(){return phase==='attack';},
    get transitioning(){return blend>0&&blend<1||runBlend>0&&runBlend<1||phase!=='ground'||specialWeight>.0001;},
    drainEvents(){return events.splice(0);},
    jump(){if(phase!=='ground')return false;flightTime=0;begin('takeoff',jumpStart);events.push('jump');return true;},
    attack(){if(phase!=='ground')return false;begin('attack',punches[punchIndex++%2]);events.push('punch');return true;},
    cancelActions(){finish();for(const a of specials){a.stop();weights.set(a,0);}specialWeight=0;events.length=0;},
    update(dt,{speed=0,running=false,travelAngle=0,reduced=false}={}){
      dt=Math.min(.1,Math.max(0,dt));
      if(steered){hips.quaternion.copy(savedHip);spine.quaternion.copy(savedSpine);steered=false;}
      // Direct actions remain available with ambient motion paused.
      phaseTime+=dt;
      if(phase==='takeoff'||phase==='air'){
        flightTime+=dt;const t=Math.min(1,flightTime/JUMP_TIMING.air);height=4*JUMP_TIMING.height*t*(1-t);
        if(t===1){height=0;begin('landing',jumpLand);events.push('land');}
        else if(phase==='takeoff'&&phaseTime>=JUMP_TIMING.start)begin('air',jumpAir);
      }else if(phase==='landing'&&phaseTime>=JUMP_TIMING.land)finish();
      else if(phase==='attack'&&phaseTime>=current.getClip().duration/current.getEffectiveTimeScale())finish();
      const moving=!reduced&&speed>.03;
      const target=moving?1:0,runTarget=moving&&running?1:0;
      blend=T.MathUtils.damp(blend,target,12,dt);runBlend=T.MathUtils.damp(runBlend,runTarget,12,dt);
      if(Math.abs(blend-target)<.0001)blend=target;if(Math.abs(runBlend-runTarget)<.0001)runBlend=runTarget;
      // A full-body action owns the pose; idle must not dilute jumps or punches.
      specialWeight=0;for(const a of specials){let weight=T.MathUtils.damp(weights.get(a),a===current?1:0,35,dt);if(weight<.0001)weight=0;weights.set(a,weight);specialWeight+=weight;}
      const locomotion=Math.max(0,1-specialWeight);
      idle.setEffectiveWeight((1-blend)*locomotion);walk.setEffectiveWeight(blend*(1-runBlend)*locomotion);run.setEffectiveWeight(blend*runBlend*locomotion);
      for(const a of specials){a.setEffectiveWeight(weights.get(a));if(a!==current&&!weights.get(a))a.stop();}
      const backward=Math.abs(travelAngle)>Math.PI/2;
      const gaitDirection=backward?-1:1;
      walk.setEffectiveTimeScale(gaitDirection*T.MathUtils.clamp(speed/WALK_SPEED,.2,1.5));
      run.setEffectiveTimeScale(gaitDirection*T.MathUtils.clamp(speed/RUN_SPEED,.2,1.5));
      if(reduced&&!current&&!specialWeight){idle.time=0;mixer.update(0);}else mixer.update(dt);
      // Aim stays independent of travel: hips turn into the stride while the upper
      // torso counter-turns toward the reticle. Backward travel reverses the gait.
      if(moving&&!current&&hips&&spine){
        savedHip.copy(hips.quaternion);savedSpine.copy(spine.quaternion);
        const angle=T.MathUtils.clamp(backward?travelAngle-Math.sign(travelAngle)*Math.PI:travelAngle,-1.1,1.1);
        scene.updateMatrixWorld(true);worldTurn(hips,angle);worldTurn(spine,-angle);steered=true;
      }
      if(moving&&!current){
        // Two contacts per gait cycle; running uses its shorter native clip.
        const cycle=running?runClip:walkClip,nominal=running?RUN_SPEED:WALK_SPEED;
        const previous=footPhase;footPhase+=dt*Math.max(.2,speed/nominal)*2/cycle.duration;
        if(Math.floor(footPhase)>Math.floor(previous))events.push(running?'run':'walk');
      }else footPhase=0;
    },
  };
}
