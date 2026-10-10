import * as T from '../vendor/three.module.min.js';
import {createSceneArt} from './scene-art.js';
import {createRigFactory,poseRig} from './lab-rigs.js';

// The same authoring geometry as home, before the runtime material batching.
// Bake joint transforms to portable glTF clips; no alternate robot design.
export function createCompanionModel(){
 const art=createSceneArt(),factory=createRigFactory(art);
 const rig=factory.robot({floating:true,batch:false}),scene=rig.root;scene.name='Companion';scene.rotation.y=0;
 const nodes=[];scene.traverse(n=>{nodes.push(n);});
 nodes.forEach((n,i)=>{n.name=`${n.name|| (n.isMesh?'mesh':'joint')}_${i}`;});
 const animations=[];
 for(const [name,speed,travelAngle] of [['Float_Idle',0,0],['Float_Forward',2.2,0],['Float_Backward',2.2,Math.PI],['Float_Left',2.2,-Math.PI/2],['Float_Right',2.2,Math.PI/2]]){
  const sample=factory.robot({floating:true,batch:false}),parts=[];sample.root.rotation.y=0;sample.root.traverse(n=>parts.push(n));
  const duration=2*Math.PI/1.65,frames=120,times=[],values=parts.map(()=>({position:[],quaternion:[],scale:[]}));
  // Settle the inertial bank before recording a repeating motion.
  for(let i=0;i<120;i++)poseRig(sample,0,1/60,{speed,travelAngle});
  for(let frame=0;frame<=frames;frame++){
   const t=duration*frame/frames;times.push(t);poseRig(sample,t,duration/frames,{speed,travelAngle});
   parts.forEach((n,i)=>{for(const property of ['position','quaternion','scale'])values[i][property].push(...n[property].toArray());});
  }
  const tracks=[];
  nodes.forEach((n,i)=>{for(const property of ['position','quaternion','scale']){
   const data=values[i][property],size=property==='quaternion'?4:3;
   // Static transforms stay in the node; export only animated channels.
   const rest=n[property].toArray();
   if(!data.some((v,j)=>Math.abs(v-data[j%size])>1e-6)&&!rest.some((v,j)=>Math.abs(v-data[j])>1e-6))continue;
   const Track=property==='quaternion'?T.QuaternionKeyframeTrack:T.VectorKeyframeTrack;
   tracks.push(new Track(`${n.name}.${property}`,times,data));
  }});
  animations.push(new T.AnimationClip(name,duration,tracks));
 }
 return {scene,animations};
}
