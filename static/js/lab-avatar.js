import * as T from '../vendor/three.module.min.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';

export const AVATAR_HEIGHT=2.45;
export async function loadSatoAvatar(){
  const gltf=await new GLTFLoader().loadAsync(new URL('../models/sato.glb',import.meta.url).href);
  return createSatoAvatar(gltf);
}

export function createSatoAvatar({scene,animations,parser}){
  const clip=(...names)=>animations.find(animation=>names.includes(animation.name));
  const idleClip=clip('Idle','Rig|Idle_Loop');
  const walkClip=clip('Walk','Rig|Walk_Loop');
  const runClip=clip('Run','Rig|Sprint_Loop');
  const jumpClip=clip('Jump','Rig|Jump_Loop');
  if(!idleClip||!walkClip||!runClip||!jumpClip)throw new Error('Sato precisa dos clipes Idle, Walk, Run e Jump.');
  const root=new T.Group();root.name='Sato';root.rotation.y=.65;
  const mixer=new T.AnimationMixer(scene);
  const idle=mixer.clipAction(idleClip).play();
  const walk=mixer.clipAction(walkClip).play().setEffectiveWeight(0);
  const run=mixer.clipAction(runClip).play().setEffectiveWeight(0);
  const jumpAction=mixer.clipAction(jumpClip).setLoop(T.LoopOnce,1);jumpAction.clampWhenFinished=true;
  const blinkClip=animations.find(clip=>clip.name==='Blink');
  const blink=blinkClip?mixer.clipAction(blinkClip).play():null;
  mixer.update(0);scene.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(scene);
  const scale=AVATAR_HEIGHT/(bounds.max.y-bounds.min.y);
  const model=new T.Group();model.scale.setScalar(scale);
  model.position.y=-bounds.min.y*scale;model.add(scene);root.add(model);
  scene.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;if(object.isSkinnedMesh)object.frustumCulled=false;}});
  const cycleDistance=parser?.json.extras?.sato?.walkCycleDistance ?? .56;
  let blend=0,runBlend=0,jumping=false;
  return {
    type:'sato',root,model,mixer,idle,walk,run,jumpAction,blink,
    get transitioning(){return blend>0&&blend<1||runBlend>0&&runBlend<1||jumping;},
    jump(){if(jumping)return false;jumping=true;jumpAction.reset().play();return true;},
    update(dt,{speed=0,reduced=false}={}){
      if(jumping&&reduced){jumpAction.stop();jumping=false;}
      // Speed is measured after collision resolution, in world units per second.
      // Both actions keep their phase, so quick input reversals never restart a pose.
      const target=reduced||jumping?0:T.MathUtils.smoothstep(speed,0,.7);
      const runTarget=reduced||jumping?0:T.MathUtils.smoothstep(speed,2.0,2.7);
      blend=T.MathUtils.damp(blend,target,target>blend?9:11,dt);
      runBlend=T.MathUtils.damp(runBlend,runTarget,runTarget>runBlend?9:11,dt);
      if(Math.abs(blend-target)<.0001)blend=target;
      if(Math.abs(runBlend-runTarget)<.0001)runBlend=runTarget;
      idle.setEffectiveWeight(1-blend);walk.setEffectiveWeight(blend*(1-runBlend));run.setEffectiveWeight(blend*runBlend);
      jumpAction.setEffectiveWeight(jumping?1:0);
      const worldScale=scale*root.scale.x;
      walk.setEffectiveTimeScale(Math.max(.15,speed*walkClip.duration/(cycleDistance*worldScale)));
      run.setEffectiveTimeScale(Math.max(.15,speed*runClip.duration/(cycleDistance*1.65*worldScale)));
      if(reduced){
        // Settle to one neutral frame without continuing ambient animation.
        idle.time=0;if(blink)blink.time=0;mixer.update(0);
      }else mixer.update(dt);
      if(jumping&&jumpAction.time>=jumpClip.duration-.0001){jumpAction.stop();jumping=false;}
    },
  };
}
