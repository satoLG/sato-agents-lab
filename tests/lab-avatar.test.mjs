import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../static/vendor/three.module.min.js';
import {createSatoAvatar,JUMP_TIMING} from '../static/js/lab-avatar.js';
import {createRigFactory,poseRig} from '../static/js/lab-rigs.js';
import {createSceneArt} from '../static/js/scene-art.js';
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
const advance=(rig,seconds,options={})=>{for(let i=0;i<Math.ceil(seconds*60);i++)rig.update(1/60,options);};
test('playable robot shares companion geometry and has no legs or imported gait',()=>{
 const art=createSceneArt(),hero=createSatoAvatar(art),companion=createRigFactory(art).robot({floating:true});
 assert.equal(hero.floating,true);assert.equal(hero.legs.length,0);
 const hull=hero.root.getObjectByName('spherical-hull'),other=companion.root.getObjectByName('spherical-hull');assert.equal(hull.geometry,other.geometry);assert.equal(hull.material,other.material);
 assert.ok(hero.flux.length);assert.equal(hero.mixer,undefined);
});
test('thruster banks forward, backward and sideways without arm swing or footsteps',()=>{
 const r=createSatoAvatar();
 for(const [angle,pitch,bank]of [[0,1,0],[Math.PI,-1,0],[Math.PI/2,0,-1],[-Math.PI/2,0,1]]){
  advance(r,1,{speed:3,travelAngle:angle});
  assert.ok(Math.abs(r.spine.rotation.x-pitch*.23)<.005);assert.ok(Math.abs(r.spine.rotation.z-bank*.23)<.005);
  for(const arm of r.arms){assert.ok(Math.abs(arm.upper.rotation.x)<.001);assert.ok(Math.abs(arm.upper.rotation.z-arm.side*.2)<.001);}
  assert.equal(r.steps,0);assert.deepEqual(r.drainEvents(),[]);assert.equal(r.root.userData.animation,'hover');
 }
 advance(r,2,{speed:0});assert.ok(Math.abs(r.spine.rotation.x)<.001);assert.ok(Math.abs(r.spine.rotation.z)<.001);
});
test('boost lifts once, lands once, and preserves direct controls with ambient motion paused',()=>{
 const r=createSatoAvatar();assert.equal(r.jump(),true);assert.equal(r.jump(),false);assert.equal(r.attack(),false);
 let max=0;const states=new Set(),events=[];
 for(let i=0;i<120;i++){r.update(1/60,{reduced:true});max=Math.max(max,r.jumpHeight);states.add(r.actionState);events.push(...r.drainEvents());}
 assert.ok(max>JUMP_TIMING.height-.01);assert.deepEqual([...states],['takeoff','air','landing','ground']);assert.deepEqual(events,['jump','land']);assert.equal(r.jumpHeight,0);
 assert.equal(r.attack(),true);assert.equal(r.jump(),false);advance(r,1,{reduced:true});assert.equal(r.actionState,'ground');assert.deepEqual(r.drainEvents(),['punch']);
 r.jump();advance(r,.2);r.cancelActions();assert.equal(r.jumpHeight,0);assert.deepEqual(r.drainEvents(),[]);
});
test('floating rigs stay finite across reduced motion and changing directions',()=>{
 const r=createSatoAvatar();for(let i=0;i<500;i++)r.update(.016,{speed:i%7,travelAngle:i*.3,reduced:i>450});
 r.root.updateMatrixWorld(true);r.root.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
 assert.equal(r.gaitPhase,0);
});
