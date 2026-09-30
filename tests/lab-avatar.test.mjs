import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../static/vendor/three.module.min.js';
import {GLTFLoader} from '../static/vendor/GLTFLoader.js';
import {createSatoAvatar,AVATAR_HEIGHT} from '../static/js/lab-avatar.js';

async function load(){
  const loader=new GLTFLoader();
  loader.register(parser=>({name:'headless-test',beforeRoot(){parser.loadTexture=async()=>null;}}));
  const b=await fs.readFile(new URL('../static/models/sato.glb',import.meta.url));
  return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
}

test('the replacement contains the Quaternius rig and required movement clips',async()=>{
  const gltf=await load();
  let skinned=0;gltf.scene.traverse(node=>{if(node.isSkinnedMesh){skinned++;assert.equal(node.skeleton.bones.length,53);}});assert.ok(skinned>0);
  const names=new Set(gltf.animations.map(clip=>clip.name));
  for(const name of ['Rig|Idle_Loop','Rig|Walk_Loop','Rig|Sprint_Loop','Rig|Jump_Loop'])assert.ok(names.has(name),`missing ${name}`);
  assert.ok(gltf.animations.length>=45);
});

test('the avatar exposes idle, walk, run and jump actions',async()=>{
  const rig=createSatoAvatar(await load());
  assert.equal(rig.idle.getEffectiveWeight(),1);assert.equal(rig.walk.getEffectiveWeight(),0);assert.equal(rig.run.getEffectiveWeight(),0);
  assert.equal(rig.jump(),true);rig.update(1/60,{speed:0});assert.ok(rig.jumpAction.getEffectiveWeight()>0);
  for(let i=0;i<180;i++)rig.update(1/60,{speed:0});assert.equal(rig.jumpAction.getEffectiveWeight(),0);
  for(let i=0;i<120;i++)rig.update(1/60,{speed:2.7});assert.ok(rig.run.getEffectiveWeight()>.25,'high speed should blend into run');
  for(let i=0;i<120;i++)rig.update(1/60,{speed:.8});assert.ok(rig.walk.getEffectiveWeight()>rig.run.getEffectiveWeight(),'low speed should prefer walk');
});

test('the model keeps avatar height normalization and reduced motion',async()=>{
  const rig=createSatoAvatar(await load());rig.root.scale.setScalar(1.12);
  const height=new T.Box3().setFromObject(rig.root).getSize(new T.Vector3()).y;assert.ok(Math.abs(height-AVATAR_HEIGHT*1.12)<.001);
  for(let i=0;i<120;i++)rig.update(1/60,{speed:2.7});rig.update(1/60,{speed:0,reduced:true});
  for(let i=0;i<120;i++)rig.update(1/60,{speed:0,reduced:true});
  assert.equal(rig.run.getEffectiveWeight(),0);assert.equal(rig.walk.getEffectiveWeight(),0);assert.equal(rig.idle.time,0);
});
