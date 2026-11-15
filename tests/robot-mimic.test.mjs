import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../static/vendor/three.module.min.js';
import {planMimic,validMimicPlan,RABBIT_MIMIC} from '../static/js/robot-mimic.js';
import {compileMimicPlan,MIMIC_PRESETS,MIMIC_LIBRARY} from '../static/js/mimic-contract.js';
import {createMimicPerformer,rasterizeDrawing} from '../static/js/mimic-performer.js';
import {createCompanionBot,poseCompanion} from '../static/js/companion-bot.js';

function rig(){
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillStyle:''})})};
 const cache=new Map(),art={geo(key,make){if(!cache.has(key))cache.set(key,make());return cache.get(key);},mesh(parent,geometry,material){const mesh=new T.Mesh(geometry,material);parent.add(mesh);return mesh;}};
 const result=createCompanionBot(art);delete globalThis.document;return result;
}

test('known requests are instant; novel requests are delegated to the tool planner',()=>{
 for(const prompt of ['Imite um coelho','/mimic coelho','Pode imitar um coelhinho?','Sato, você consegue imitar um coelho?','Finja ser um coelho'])assert.deepEqual(planMimic(prompt)?.plan,RABBIT_MIMIC);
 assert.equal(planMimic('/mimic parar').stop,true);assert.equal(planMimic('/mimic 😡').target,'😡');assert.equal(planMimic('Quem é Sato?'),null);assert.equal(planMimic('/mimic dragão').needsPlanning,true);assert.equal(planMimic('/mimic').ok,false);
 assert.equal(validMimicPlan(RABBIT_MIMIC),true);
});

test('all curated application presets are valid, exact aliases are local and modifiers go to the model',()=>{
 assert.equal(Object.keys(MIMIC_PRESETS).length,16);
 for(const [key,entry]of Object.entries(MIMIC_LIBRARY)){
  const preset=MIMIC_PRESETS[key];assert.ok(validMimicPlan(preset),key);
  for(const alias of entry.aliases)assert.deepEqual(planMimic(`/mimic ${alias}`).plan,preset);
  const compiled=compileMimicPlan(preset);assert.equal(compiled.frames.length,2);
  const robot=rig(),performer=createMimicPerformer(robot);performer.start(preset,0);performer.update(1,{reduced:true});poseCompanion(robot,0,.1,{reduced:true});
  assert.ok(robot.arms.every(arm=>Number.isFinite(arm.mesh.scale.x)&&Number.isFinite(arm.dir.y)),key);performer.stop();robot.face.dispose();
 }
 assert.equal(planMimic('/mimic pássaro bravo').needsPlanning,true);assert.equal(planMimic('/mimic carro de corrida').needsPlanning,true);
 const copy=planMimic('/mimic gato').plan;copy.duration=999;assert.notEqual(planMimic('/mimic gato').plan.duration,999);
});

test('the contract rejects unknown tools, nonfinite/extreme values, bad times and drawings',()=>{
 for(const mutate of [p=>p.frames[0].calls[0].name='execute_code',p=>p.duration=Infinity,p=>p.duration=999,p=>p.frames[0].at=.1,p=>p.frames[1].at=0,p=>p.frames[0].calls[1].arguments.position=[0,0,0],p=>p.drawings[0][0].center[1]=25,p=>p.frames[0].calls[0].arguments.drawing=3,p=>p.extra='arbitrary']){
  const plan=structuredClone(RABBIT_MIMIC);mutate(plan);assert.equal(validMimicPlan(plan),false);assert.throws(()=>compileMimicPlan(plan));
 }
});

test('tool calls compile into persistent visor/arm/body poses and bounded LED pixels',()=>{
 const plan=compileMimicPlan(RABBIT_MIMIC);assert.equal(plan.frames[1].drawing,0);assert.equal(plan.frames[1].arms.length,2);
 const pixels=rasterizeDrawing(RABBIT_MIMIC.drawings[0]);assert.equal(pixels.length,34*19*4);assert.ok(pixels.some((v,i)=>i%4===0&&v<128));assert.ok(pixels.some((v,i)=>i%4===0&&v>128));
});

test('partial calls preserve previous fields and apply in frame order',()=>{
 const plan=structuredClone(RABBIT_MIMIC);
 plan.frames[1].calls=[{name:'arm_pose',arguments:{side:'left',width:1.4}},{name:'body_pose',arguments:{lift:.2}},{name:'body_pose',arguments:{yaw:.3}}];
 const compiled=compileMimicPlan(plan),[first,last]=compiled.frames;
 assert.equal(last.arms[0].width,1.4);assert.deepEqual(last.arms[0].position,first.arms[0].position);assert.deepEqual(last.arms[1],first.arms[1]);
 assert.equal(last.body.lift,.2);assert.equal(last.body.yaw,.3);assert.equal(last.body.pitch,first.body.pitch);
});

test('the generic performer draws, morphs and returns to neutral without replaying completion',()=>{
 const robot=rig(),performer=createMimicPerformer(robot),states=[];performer.start(RABBIT_MIMIC,0,{onState:state=>states.push(state)});
 for(let i=0;i<90;i++){performer.update(i/60);poseCompanion(robot,i/60,1/60);}
 assert.equal(robot.visor.material.uniforms.uDrawing.value,1);
 for(const arm of robot.arms){assert.ok(arm.dir.y>.85);assert.ok(arm.mesh.scale.y>1.4);assert.ok(arm.mesh.morphTargetInfluences[0]<.15);}
 assert.ok(robot.visor.material.uniforms.uMimicFrom.value.image.data.some((v,i)=>i%4===0&&v<128));
 for(let i=90;i<390;i++){performer.update(i/60);poseCompanion(robot,i/60,1/60);}
 assert.equal(robot.visor.material.uniforms.uDrawing.value,0);assert.deepEqual(states,['started','completed']);
 for(const arm of robot.arms){assert.ok(arm.dir.y<.4);assert.ok(arm.mesh.scale.y<1.05);}
 performer.stop();assert.deepEqual(states,['started','completed']);robot.face.dispose();
});

test('reduced motion holds a readable pose and cancellation restores the same rig',()=>{
 const robot=rig(),performer=createMimicPerformer(robot),states=[];performer.start(RABBIT_MIMIC,0,{onState:state=>states.push(state)});
 const poses=[.5,1.2,2.1].map(time=>{const body=performer.update(time,{reduced:true});poseCompanion(robot,0,.06,{reduced:true});return body;});
 assert.deepEqual(poses,[{lift:0,pitch:0,yaw:0,roll:0},{lift:0,pitch:0,yaw:0,roll:0},{lift:0,pitch:0,yaw:0,roll:0}]);
 performer.stop();assert.equal(performer.active,false);assert.deepEqual(states,['started','cancelled']);assert.equal(robot.visor.material.uniforms.uDrawing.value,0);robot.face.dispose();
});
