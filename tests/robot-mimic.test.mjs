import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../static/vendor/three.module.min.js';
import {planMimic,validMimicPlan,RABBIT_MIMIC} from '../static/js/robot-mimic.js';
import {createCompanionBot,poseCompanion} from '../static/js/companion-bot.js';

test('mimic translates supported requests and refuses unknown capabilities',()=>{
 for(const prompt of ['Imite um coelho','/mimic coelho','Pode imitar um coelhinho?','Finja ser um coelho'])assert.deepEqual(planMimic(prompt)?.plan,RABBIT_MIMIC);
 assert.equal(planMimic('Quem é Sato?'),null);
 assert.equal(planMimic('/mimic dragão').ok,false);
 assert.equal(planMimic('/mimic').ok,false);
 assert.equal(validMimicPlan({...RABBIT_MIMIC,duration:Infinity}),false);
});

test('rabbit uses the LED panel and morphing arms, then returns to neutral',()=>{
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillStyle:''})})};
 const cache=new Map(),art={geo(key,make){if(!cache.has(key))cache.set(key,make());return cache.get(key);},mesh(parent,geometry,material){const mesh=new T.Mesh(geometry,material);parent.add(mesh);return mesh;}};
 const rig=createCompanionBot(art);rig.gesture('rabbit',5.6);rig.face.drawing('rabbit',5.6);
 for(let i=0;i<90;i++)poseCompanion(rig,i/60,1/60);
 assert.equal(rig.visor.material.uniforms.uDrawing.value,1);
 for(const arm of rig.arms){assert.ok(arm.dir.y>.85);assert.ok(arm.mesh.scale.y>1.4);assert.ok(arm.mesh.morphTargetInfluences[0]<.15);}
 for(let i=90;i<380;i++)poseCompanion(rig,i/60,1/60);
 assert.equal(rig.visor.material.uniforms.uDrawing.value,0);
 for(const arm of rig.arms){assert.ok(arm.dir.y<.4);assert.ok(arm.mesh.scale.y<1.05);}
 delete globalThis.document;
});
