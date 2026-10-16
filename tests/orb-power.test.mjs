import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../static/vendor/three.module.min.js';
import {createOrbCape} from '../static/js/orb-cape.js';
import {createOrbSato} from '../static/js/orb-sato.js';
import {createOrbMotor} from '../static/js/orb-motor.js';
import {createOrbWater} from '../static/js/orb-water.js';
import {createOrbPower} from '../static/js/orb-power.js';
import {powerDisplacement} from '../static/js/orb-power-field.js';

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

test('articulated knees and elbows animate and left palm braces the firing forearm',()=>{
 const s=createOrbSato();s.wakeUp();let min=Infinity,max=-Infinity;
 for(let i=0;i<180;i++){s.update(1/60,{playing:true,speed:.94,running:true,time:i/60});min=Math.min(min,s.legs[0].knee.rotation.x);max=Math.max(max,s.legs[0].knee.rotation.x);}
 assert.ok(max-min>.6);
 for(let i=0;i<90;i++)s.update(1/60,{playing:true,charge:1});s.root.updateMatrixWorld(true);
 const left=s.arms.find(a=>a.side<0),right=s.arms.find(a=>a.side>0),palm=left.wrist.localToWorld(new T.Vector3(0,-.075,0));
 const forearm=new T.Line3(right.elbow.getWorldPosition(new T.Vector3()),right.wrist.getWorldPosition(new T.Vector3()));
 assert.ok(palm.distanceTo(forearm.closestPointToPoint(palm,true,new T.Vector3()))<.025);
 assert.equal(s.root.userData.animation,'charge');
 for(let i=0;i<120;i++)s.update(1/60,{playing:true});
 assert.ok(Math.abs(left.elbow.rotation.y)<.00001&&Math.abs(left.elbow.rotation.z)<.00001,'the braced pose releases back to the normal elbow axis');
});

test('charged beam parts water, raises side banks and restores it after release or cancellation',()=>{
 const water=createOrbWater(),power=createOrbPower(water),up=new T.Vector3(0,1,0),forward=new T.Vector3(0,0,1);
 const pose={position:up.clone().multiplyScalar(1.84),heading:forward,normal:up,muzzlePosition:new T.Vector3(0,1.97,.04)};
 assert.equal(power.begin(),true);assert.equal(power.begin(),false);
 for(let i=0;i<80;i++)power.update(1/60,pose);assert.equal(power.charge,1);assert.ok(powerDisplacement(up,water.uniforms)<-.4);
 power.release();for(let i=0;i<30;i++)power.update(1/60,pose);assert.equal(power.state,'firing');
 const channel=new T.Vector3(0,Math.cos(.4),Math.sin(.4)),bank=channel.clone().add(new T.Vector3(.17,0,0)).normalize();
 assert.ok(powerDisplacement(channel,water.uniforms)<-.5);assert.ok(powerDisplacement(bank,water.uniforms)>.03);
 for(let i=0;i<240;i++)power.update(1/60,pose);assert.equal(power.state,'idle');assert.equal(powerDisplacement(channel,water.uniforms),0);
 power.begin();power.update(.05,pose);power.cancel();assert.equal(power.state,'idle');assert.equal(water.uniforms.orbPowerCharge.value,0);assert.equal(power.group.visible,false);
 power.begin();for(let i=0;i<185;i++)power.update(1/60,pose);assert.equal(power.state,'firing','holding cannot charge forever');
 power.cancel();power.begin();power.release();const quickPose={...pose,normal:new T.Vector3(0,0,1),heading:new T.Vector3(1,0,0)};power.update(1/60,quickPose);
 assert.deepEqual(water.uniforms.orbPowerUp.value,quickPose.normal);assert.deepEqual(water.uniforms.orbPowerForward.value,quickPose.heading);
});
