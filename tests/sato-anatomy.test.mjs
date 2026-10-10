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
 const hand=g.scene.getObjectByName('Sato_articulated_hands'),points=[];
 for(const mesh of meshes(hand)){
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
 const g=await load(),footwear=['14','16','35','48'].map(id=>g.scene.getObjectByName(`tripo_part_${id}`));
 g.scene.updateMatrixWorld(true);
 const legs=['L','R'].map(side=>['thigh','shin','foot'].map(part=>g.scene.getObjectByName(`DEF-${part}${side}`)));
 const lengths=legs.map(leg=>[0,1].map(i=>leg[i].getWorldPosition(new T.Vector3()).distanceTo(leg[i+1].getWorldPosition(new T.Vector3()))));
 const trousers=g.scene.getObjectByName('tripo_part_3');
 const sample=[...footwear.flatMap(mesh=>Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>[mesh,i])),...Array.from({length:trousers.geometry.attributes.position.count},(_,i)=>i).filter(i=>trousers.geometry.attributes.position.getY(i)<.10).map(i=>[trousers,i])];
 for(const name of ['Idle_Loop','Walk_Loop','Sprint_Loop','Crouch_Fwd_Loop','Jump_Start','Jump_Land','Punch_Jab','Punch_Cross','Pistol_Idle_Loop','Pistol_Shoot','Sword_Idle','Sword_Attack']){
  const animation=play(g,`Rig|${name}`),steps=Math.ceil(animation.clip.duration*120);let lowest=Infinity;
  for(let i=0;i<=steps;i++){
   animation.at(animation.clip.duration*i/steps);for(const [mesh,k]of sample)lowest=Math.min(lowest,vertex(mesh,k).y);
   legs.forEach((leg,side)=>[0,1].forEach(j=>assert.ok(Math.abs(leg[j].getWorldPosition(new T.Vector3()).distanceTo(leg[j+1].getWorldPosition(new T.Vector3()))-lengths[side][j])<1e-5,'Contact correction must preserve leg lengths')));
  }
  animation.stop();assert.ok(lowest>=-.0001,`${name} penetrates the floor by ${-lowest}`);
 }
});

test('mouth has an aperture with teeth in front of its recessed cavity',async()=>{
 const g=await load();g.scene.updateMatrixWorld(true);
 const teeth=g.scene.getObjectByName('Sato_teeth'),cavity=g.scene.getObjectByName('Sato_smile'),head=g.scene.getObjectByName('Sato_clean_face');
 for(const mesh of [...meshes(head),teeth,cavity]){mesh.material.side=T.DoubleSide;mesh.skeleton.update();}
 const ray=new T.Raycaster(new T.Vector3(0,.763,.25),new T.Vector3(0,0,-1));
 const t=ray.intersectObject(teeth)[0],c=ray.intersectObject(cavity)[0];assert.ok(t);assert.ok(c);
 assert.ok(t.point.z-c.point.z>.005,'Teeth/cavity need a depth gap');
 const h=ray.intersectObject(head,true).find(hit=>hit.point.z>0);assert.equal(h,undefined,'Skin must not cover the mouth');
});

test('nape hair is above the neck and bound only to the head; beard stops behind the ears',async()=>{
 const g=await load();let hairVertices=0;
 for(const id of [1,7,9,12,13,15,21,22,23,25,27,33,40,41,46]){
  const root=g.scene.getObjectByName(`tripo_part_${id}`);if(!root)continue;
  for(const mesh of meshes(root)){
   const {position,skinIndex,skinWeight}=mesh.geometry.attributes;hairVertices+=position.count;
   for(let i=0;i<position.count;i++){
    assert.ok(position.getY(i)>=.8269);
    for(let c=0;c<4;c++)if(skinWeight.getComponent(i,c)>0)assert.equal(mesh.skeleton.bones[skinIndex.getComponent(i,c)].name,'DEF-head');
   }
  }
 }
 assert.ok(hairVertices>100);
 for(const mesh of meshes(g.scene.getObjectByName('Sato_clean_face')))if(mesh.material.name.includes('beard')){
  const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)assert.ok(p.getZ(i)>-.025||p.getY(i)<.77);
 }
});
