import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../static/vendor/three.module.min.js';
import {GLTFLoader} from '../static/vendor/GLTFLoader.js';
import {createSatoAvatar,AVATAR_HEIGHT} from '../static/js/lab-avatar.js';
import {WALK_SPEED,RUN_SPEED} from '../static/js/lab-controls.js';
async function load(){const l=new GLTFLoader();l.register(p=>({name:'headless',beforeRoot(){p.loadTexture=async()=>null;}}));const b=await fs.readFile(new URL('../static/models/sato.glb',import.meta.url));return l.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const advance=(rig,seconds,options={})=>{for(let i=0;i<Math.ceil(seconds*60);i++)rig.update(1/60,options);};
test('refined mesh keeps 53 bones, 45 clips and required action phases',async()=>{
  const g=await load();g.scene.traverse(o=>{if(o.isSkinnedMesh)assert.equal(o.skeleton.bones.length,53);});assert.equal(g.animations.length,45);
  for(const name of ['Walk_Loop','Sprint_Loop','Jump_Start','Jump_Loop','Jump_Land','Punch_Jab','Punch_Cross'])assert.ok(g.animations.find(c=>c.name===`Rig|${name}`));
  for(const name of ['Sato_clean_face','Sato_nose','Sato_ear_-1','Sato_ear_1'])assert.ok(g.scene.getObjectByName(name));
});
test('walking stays walking; sprint requires explicit intent and returns smoothly',async()=>{
  const r=createSatoAvatar(await load());advance(r,1,{speed:WALK_SPEED});assert.ok(r.walk.getEffectiveWeight()>.99);assert.equal(r.run.getEffectiveWeight(),0);
  advance(r,1,{speed:RUN_SPEED,running:true});assert.ok(r.run.getEffectiveWeight()>.99);
  r.update(1/60,{speed:WALK_SPEED});assert.ok(r.run.getEffectiveWeight()>.5);advance(r,1,{speed:WALK_SPEED});assert.equal(r.run.getEffectiveWeight(),0);
});
test('jump lifts the character, lands once and excludes footsteps and repeated jumps',async()=>{
  const r=createSatoAvatar(await load());assert.equal(r.jump(),true);assert.equal(r.jump(),false);assert.equal(r.attack(),false);
  let height=0;const states=new Set(),events=[];
  for(let i=0;i<120;i++){r.update(1/60,{speed:0});height=Math.max(height,r.jumpHeight);states.add(r.actionState);events.push(...r.drainEvents());}
  assert.ok(height>1.6);assert.deepEqual([...states],['takeoff','air','landing','ground']);assert.equal(r.jumpHeight,0);
  assert.equal(events.filter(e=>e==='jump').length,1);assert.equal(events.filter(e=>e==='land').length,1);assert.ok(!events.includes('walk'));assert.ok(r.idle.getEffectiveWeight()>.99);
});
test('jump starts moving and emits its cue on the first frame',async()=>{
  const r=createSatoAvatar(await load());r.jump();assert.deepEqual(r.drainEvents(),['jump']);
  r.update(1/60);assert.ok(r.jumpHeight>.1);assert.equal(r.actionState,'takeoff');
});
test('punch is one shot, cannot interrupt a jump, and actions work with ambient motion paused',async()=>{
  const r=createSatoAvatar(await load());assert.equal(r.attack(),true);assert.equal(r.attack(),false);assert.equal(r.jump(),false);
  advance(r,1,{reduced:true});assert.equal(r.actionState,'ground');assert.deepEqual(r.drainEvents(),['punch']);
  assert.equal(r.jump(),true);advance(r,.5,{reduced:true});assert.ok(r.jumpHeight>.5);advance(r,1,{reduced:true});assert.equal(r.jumpHeight,0);
});
test('aiming sideways and backward keeps finite bone transforms; stopping restores neutral gait',async()=>{
  const r=createSatoAvatar(await load());advance(r,1,{speed:WALK_SPEED,travelAngle:Math.PI});assert.ok(r.walk.getEffectiveTimeScale()<0);
  advance(r,1,{speed:WALK_SPEED,travelAngle:Math.PI/2});r.root.updateMatrixWorld(true);r.root.traverse(o=>{if(o.isBone)assert.ok(o.matrixWorld.elements.every(Number.isFinite));});
  advance(r,1,{speed:0,reduced:true});assert.equal(r.walk.getEffectiveWeight(),0);assert.equal(r.idle.time,0);
  const height=new T.Box3().setFromObject(r.root).getSize(new T.Vector3()).y;assert.ok(Math.abs(height-AVATAR_HEIGHT)<.03);
});
test('footsteps follow gait and are absent while blocked or attacking',async()=>{
  const r=createSatoAvatar(await load());advance(r,2,{speed:WALK_SPEED});assert.ok(r.drainEvents().filter(e=>e==='walk').length>=2);
  advance(r,1,{speed:0});assert.deepEqual(r.drainEvents(),[]);r.attack();advance(r,.25,{speed:0});assert.deepEqual(r.drainEvents(),['punch']);
});
