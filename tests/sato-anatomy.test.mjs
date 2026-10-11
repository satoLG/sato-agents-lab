import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../static/vendor/three.module.min.js';
import {GLTFLoader} from '../static/vendor/GLTFLoader.js';

async function load(){
 const b=await fs.readFile(new URL('../static/models/sato.glb',import.meta.url)),loader=new GLTFLoader();
 loader.register(p=>({name:'headless',beforeRoot(){p.loadTexture=async()=>null;}}));
 return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
}
function play(g,name){
 const mixer=new T.AnimationMixer(g.scene),clip=g.animations.find(c=>c.name===name);assert.ok(clip,name);
 const action=mixer.clipAction(clip).setLoop(T.LoopOnce,1).play();action.clampWhenFinished=true;
 return {clip,at(time){action.time=time;mixer.update(0);g.scene.updateMatrixWorld(true);g.scene.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.update();});},stop(){mixer.stopAllAction();}};
}
function meshes(root){const out=[];root.traverse(n=>{if(n.isSkinnedMesh)out.push(n);});return out;}
function vertex(mesh,index){const v=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,index);mesh.applyBoneTransform(index,v);return v.applyMatrix4(mesh.matrixWorld);}
function fingertip(g,name){
 const points=[];
 for(const mesh of meshes(g.scene).filter(m=>m.name.startsWith('Sato_arm_hand_'))){
  const index=mesh.skeleton.bones.findIndex(b=>b.name===name),{skinIndex,skinWeight,position}=mesh.geometry.attributes;
  for(let i=0;i<position.count;i++)if([0,1,2,3].some(c=>skinIndex.getComponent(i,c)===index&&skinWeight.getComponent(i,c)>.9))points.push(vertex(mesh,i));
 }
 assert.ok(points.length,`No skin on ${name}`);return points.reduce((a,b)=>a.add(b),new T.Vector3()).multiplyScalar(1/points.length);
}

test('all ten fingers deform, return open and keep the wrist fixed',async()=>{
 const g=await load(),animation=play(g,'Hands_Open_Close'),wrist=g.scene.getObjectByName('DEF-handR');
 const names=['L','R'].flatMap(s=>['index','middle','ring','pinky','thumb'].map(f=>f==='thumb'?`DEF-thumb03${s}`:`DEF-f_${f}03${s}`));
 animation.at(0);const open=names.map(n=>fingertip(g,n)),origin=wrist.getWorldPosition(new T.Vector3());
 animation.at(.8);const closed=names.map(n=>fingertip(g,n));
 assert.ok(wrist.getWorldPosition(new T.Vector3()).distanceTo(origin)<1e-7);
 animation.at(1.6);const reopened=names.map(n=>fingertip(g,n));
 names.forEach((name,i)=>{assert.ok(open[i].distanceTo(closed[i])>.005,`${name} must bend`);assert.ok(open[i].distanceTo(reopened[i])<1e-6,`${name} must reopen`);});
});

test('punches and sword close the fingers; pistol retains a distinct trigger finger',async()=>{
 const g=await load(),index=g.scene.getObjectByName('DEF-f_index01R'),middle=g.scene.getObjectByName('DEF-f_middle01R');
 let a=play(g,'Rig|Idle_Loop');a.at(0);const open=index.quaternion.clone(),middleOpen=middle.quaternion.clone();a.stop();
 for(const name of ['Punch_Enter','Punch_Jab','Punch_Cross','Sword_Idle','Sword_Attack','Sword_Attack_RM']){
  a=play(g,`Rig|${name}`);a.at(a.clip.duration*.45);assert.ok(index.quaternion.angleTo(open)>.8,`${name} needs a grip`);a.stop();
 }
 a=play(g,'Rig|Pistol_Idle_Loop');a.at(.2);
 assert.ok(index.quaternion.angleTo(open)<.25);assert.ok(middle.quaternion.angleTo(middleOpen)>.8);
});

test('resized soles and trouser cuffs stay above the floor through grounded motion',async()=>{
 const g=await load(),footwear=['L','R'].flatMap(side=>meshes(g.scene.getObjectByName(`Sato_sneaker_${side}`)));
 g.scene.updateMatrixWorld(true);
 const legs=['L','R'].map(side=>['thigh','shin','foot'].map(part=>g.scene.getObjectByName(`DEF-${part}${side}`)));
 const lengths=legs.map(leg=>[0,1].map(i=>leg[i].getWorldPosition(new T.Vector3()).distanceTo(leg[i+1].getWorldPosition(new T.Vector3()))));
 const trousers=meshes(g.scene.getObjectByName('Sato_trousers'));
 const sample=[...footwear.flatMap(mesh=>Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>[mesh,i])),...trousers.flatMap(mesh=>Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i).filter(i=>mesh.geometry.attributes.position.getY(i)<.10).map(i=>[mesh,i]))];
 for(const name of ['Idle_Loop','Walk_Loop','Sprint_Loop','Crouch_Fwd_Loop','Jump_Start','Jump_Land','Punch_Jab','Punch_Cross','Pistol_Idle_Loop','Pistol_Shoot','Sword_Idle','Sword_Attack']){
  const animation=play(g,`Rig|${name}`),steps=Math.ceil(animation.clip.duration*120);let lowest=Infinity;
  for(let i=0;i<=steps;i++){
   animation.at(animation.clip.duration*i/steps);for(const [mesh,k]of sample)lowest=Math.min(lowest,vertex(mesh,k).y);
   legs.forEach((leg,side)=>[0,1].forEach(j=>assert.ok(Math.abs(leg[j].getWorldPosition(new T.Vector3()).distanceTo(leg[j+1].getWorldPosition(new T.Vector3()))-lengths[side][j])<1e-5,'Contact correction must preserve leg lengths')));
  }
  animation.stop();assert.ok(lowest>=-.0001,`${name} penetrates the floor by ${-lowest}`);
 }
});

test('painted face has a closed surface, a defined jaw and a narrower chin',async()=>{
 const g=await load(),parts=meshes(g.scene.getObjectByName('Sato_clean_face'));
 const positions=parts.flatMap(m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(m.geometry.attributes.position,i)));
 const chin=positions.filter(p=>p.y<.75&&p.y>.725&&p.z>.070),neck=positions.filter(p=>Math.abs(p.y-.693)<.001),corner=positions.filter(p=>Math.abs(p.x)>.055&&Math.abs(p.z)<.020&&p.y<.78);
 assert.ok(chin.length&&corner.length,'The chin and mandibular corners need distinct geometry');
 assert.ok(Math.max(...chin.map(p=>p.z))-Math.max(...neck.map(p=>p.z))>.045,'The chin must project in front of the neck in profile');
 assert.ok(Math.min(...corner.map(p=>p.y))-Math.min(...chin.map(p=>p.y))>.018,'The jawline must rise from the chin toward the ear');
 assert.ok(Math.max(...positions.filter(p=>Math.abs(p.y-.826)<.001).map(p=>Math.abs(p.x)))>Math.max(...chin.map(p=>Math.abs(p.x)))*1.5,'The chin must remain narrower than the cheeks');
 assert.ok(positions.some(p=>p.y<.68),'The neck is part of the head surface');
 const painted=parts.find(m=>m.material.name.includes('painted anime'));
 assert.ok(painted?.geometry.attributes.uv);
 const p=painted.geometry.attributes.position,u=painted.geometry.attributes.uv;
 for(let i=0;i<p.count;i++)assert.ok(Math.abs(u.getY(i)-(1-(p.getY(i)-.70)/.25))<1e-5,'glTF face UVs must preserve the painted orientation');
});

test('filled nape covers the rear skull and follows only the head',async()=>{
 const g=await load();let hairVertices=0,lowest=Infinity,highest=-Infinity;
 for(const name of ['Sato_hair_cap']){
  const root=g.scene.getObjectByName(name);assert.ok(root);
  for(const mesh of meshes(root)){
   const {position,skinIndex,skinWeight}=mesh.geometry.attributes;hairVertices+=position.count;
   for(let i=0;i<position.count;i++){
    lowest=Math.min(lowest,position.getY(i));highest=Math.max(highest,position.getY(i));
    for(let c=0;c<4;c++)if(skinWeight.getComponent(i,c)>0)assert.equal(mesh.skeleton.bones[skinIndex.getComponent(i,c)].name,'DEF-head');
   }
  }
 }
 assert.ok(hairVertices>100);
 assert.ok(lowest>.730&&lowest<.750,'Short hair must follow the nape while clearing the shoulders');assert.ok(highest>.945&&highest<.980,'Spikes must stay short and close to the skull');
 const cap=meshes(g.scene.getObjectByName('Sato_hair_cap'));
 const rear=cap.flatMap(m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(m.geometry.attributes.position,i))).filter(p=>p.z<-.04&&p.y<.8);
 assert.ok(rear.length>25,'The rear hair must have a filled volume');
});
