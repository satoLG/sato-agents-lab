import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../static/vendor/three.module.min.js';
import {createOrbCape} from '../static/js/orb-cape.js';
import {createOrbMotor} from '../static/js/orb-motor.js';

test('cloth has fixed collar pins, responds to motion and remains bounded through turns and jumps',()=>{
 const cape=createOrbCape();
 for(let i=0;i<450;i++)cape.update(1/60,{speed:i<150?0:i<300?.94:0,verticalSpeed:Math.sin(i*.1)*1.5,turn:Math.sin(i*.05)*3,power:i>350?1:0});
 for(let i=0;i<25;i++)assert.ok(cape.positions[i].distanceTo(cape.rest[i])<1e-10);
 let moved=0;cape.positions.forEach((p,i)=>{assert.ok(p.toArray().every(Number.isFinite));assert.ok(p.length()<1.5);moved=Math.max(moved,p.distanceTo(cape.rest[i]));});assert.ok(moved>.08);
 const frozen=cape.positions.map(p=>p.clone());cape.update(0,{speed:2});cape.positions.forEach((p,i)=>assert.deepEqual(p,frozen[i]));
 cape.reset();cape.positions.forEach((p,i)=>assert.deepEqual(p,cape.rest[i]));
});

test('run increases travel speed and stops without changing gravity or grounded support',()=>{
 const surface={sample:n=>({radius:2,point:n.clone().multiplyScalar(2),normal:n.clone(),waterRadius:1.9,surface:'rock',groundSurface:'rock'})};
 const walk=createOrbMotor(surface),run=createOrbMotor(surface);
 for(let i=0;i<120;i++){walk.update(1/120,{direction:walk.heading,amount:1});run.update(1/120,{direction:run.heading,amount:1,running:true});}
 assert.ok(run.velocity.length()>walk.velocity.length()*1.5);assert.equal(run.grounded,true);assert.ok(Math.abs(run.position.length()-2)<1e-10);
 run.stop();assert.equal(run.velocity.length(),0);
});
