import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../static/vendor/three.module.min.js';
import {createOrbSato} from '../static/js/orb-sato.js';
import {createOrbMotor,ORB_DASH} from '../static/js/orb-motor.js';
import {createOrbWater} from '../static/js/orb-water.js';
import {createOrbPower,advanceProjectile} from '../static/js/orb-power.js';
import {powerDisplacement} from '../static/js/orb-power-field.js';
import {createCombatSettings} from '../static/js/orb-combat-settings.js';
import {createOrbDash} from '../static/js/orb-dash.js';
const surface={sample:n=>({radius:2,point:n.clone().multiplyScalar(2),normal:n.clone(),waterRadius:1.9,surface:'rock',groundSurface:'rock'})};
const pose={position:new T.Vector3(0,2,0),heading:new T.Vector3(0,0,1),normal:new T.Vector3(0,1,0),muzzlePosition:new T.Vector3(0,2.15,.04)};

test('dash anticipates, bursts, keeps radial support, rejects repeats and ends without a run toggle',()=>{
 const events=[],motor=createOrbMotor(surface,{onEvent:e=>events.push(e.type)});assert.equal(motor.dash(),true);assert.equal(motor.dash(),false);
 for(let i=0;i<10;i++)motor.update(1/120);assert.ok(motor.position.distanceTo(new T.Vector3(0,2,0))<.001);assert.equal(motor.jump(),false);
 for(let i=0;i<15;i++)motor.update(1/120);assert.ok(motor.velocity.length()>2.5);assert.ok(Math.abs(motor.position.length()-2)<1e-8);assert.equal(events.filter(e=>e==='dash').length,1);
 for(let i=0;i<150;i++)motor.update(1/120);assert.equal(motor.dashing,false);assert.ok(motor.velocity.length()<.001);assert.equal(motor.dash(),true);
 motor.stop();assert.equal(motor.dashing,false);assert.equal(motor.velocity.length(),0);
});
test('dash capsule does not tunnel through trunks or raised stone sides',()=>{
 for(const kind of ['trunk','rock']){
 const obstacles={sample:n=>{const s=surface.sample(n);if(kind==='rock'&&n.z>.12)s.radius=2.3;return s;},blockedByTrunk:p=>kind==='trunk'&&p.z>.2};
 const events=[],motor=createOrbMotor(obstacles,{onEvent:e=>events.push(e.type)});motor.dash();for(let i=0;i<100;i++)motor.update(1/120);
 assert.ok(motor.position.z<.25);assert.equal(events.filter(t=>t==='dash-impact').length,1);assert.equal(motor.grounded,true);
 }
});
test('gravity bends projectiles around the planet and conserves orbital energy',()=>{
 const p={position:new T.Vector3(0,2.2,0),velocity:new T.Vector3(0,0,Math.sqrt(4.8*2.2)),mu:4.8*2.2**2,age:0};
 const energy=()=>p.velocity.lengthSq()/2-p.mu/p.position.length(),e0=energy();let underside=false;
 for(let i=0;i<600;i++){advanceProjectile(p,1/120);if(p.position.y<0)underside=true;assert.ok(Math.abs(p.position.length()-2.2)<.001);}
 assert.ok(underside);assert.ok(Math.abs(energy()-e0)<.00001);
});
test('charge releases one detached shot, preserves launch pose, caps the pool and expires every visual',()=>{
 const water=createOrbWater(),events=[],power=createOrbPower(water,{onSound:e=>events.push(e.type)});assert.equal(power.begin(),true);assert.equal(power.begin(),false);
 for(let i=0;i<80;i++)power.update(1/60,pose);assert.equal(power.charge,1);assert.ok(powerDisplacement(pose.normal,water.uniforms)<-.35);
 power.release();power.update(0,pose);power.update(0,pose);power.update(1/60,pose);assert.equal(power.shots.filter(p=>p.active).length,1);const shot=power.shots.find(p=>p.active),start=shot.position.clone();
 const moved={...pose,muzzlePosition:new T.Vector3(20,20,20)};power.update(1/60,moved);assert.ok(shot.position.distanceTo(start)<.1);
 for(let i=0;i<720;i++)power.update(1/60,pose);assert.equal(power.active,false);assert.equal(power.shots.filter(p=>p.active).length,0);assert.equal(powerDisplacement(pose.normal,water.uniforms),0);
 for(let j=0;j<12;j++){power.begin();power.release();for(let i=0;i<40;i++)power.update(1/60,pose);}assert.ok(power.shots.filter(p=>p.active).length<=6);assert.equal(power.shots.length,6);
 power.cancel();assert.equal(power.active,false);assert.equal(water.uniforms.orbPowerWake.value,0);assert.ok(events.includes('charge-ready')&&events.includes('blast'));
 power.begin();power.release();power.update(1/60,{...pose,normal:new T.Vector3(0,0,1),heading:new T.Vector3(1,0,0)});assert.deepEqual(water.uniforms.orbPowerUp.value,new T.Vector3(0,0,1));
});
test('return flow oscillates in space and time while converging to the undisturbed surface',()=>{
 const water=createOrbWater(),power=createOrbPower(water);power.begin();for(let i=0;i<80;i++)power.update(1/60,pose);power.release();
 const n=new T.Vector3(.24,1,.1).normalize(),values=[];
 for(let i=0;i<180;i++){power.update(1/60,pose);values.push(powerDisplacement(n,water.uniforms));}
 let reversals=0;for(let i=2;i<values.length;i++)if((values[i]-values[i-1])*(values[i-1]-values[i-2])<0)reversals++;
 assert.ok(reversals>3);assert.ok(Math.max(...values)>.015);assert.ok(Math.min(...values)<-.015);
 for(let i=0;i<600;i++)power.update(1/60,pose);assert.equal(powerDisplacement(n,water.uniforms),0);
});
test('idle shifts weight and looks around, jump arms oppose, dash crouches before accelerating',()=>{
 const s=createOrbSato();s.wakeUp();for(let i=0;i<90;i++)s.update(1/60,{playing:true,time:i/60});
 const left=s.legs[0].knee.rotation.x,head=s.head.rotation.y;
 for(let i=0;i<90;i++)s.update(1/60,{playing:true,time:1.5+i/60});assert.ok(Math.abs(s.legs[0].knee.rotation.x-left)>.01);assert.ok(Math.abs(s.head.rotation.y-head)>.01);assert.ok(Math.abs(s.legs[0].knee.rotation.x-s.legs[1].knee.rotation.x)>.01);
 for(let i=0;i<12;i++)s.update(1/60,{playing:true,grounded:false,verticalSpeed:1,time:3+i/60});assert.ok(Math.abs(s.arms[0].joint.rotation.x-s.arms[1].joint.rotation.x)>.4);
 const before=s.body.position.y;for(let i=0;i<12;i++)s.update(1/120,{playing:true,dashAge:i/120});assert.ok(s.body.position.y<before-.06);assert.ok(s.legs[0].knee.rotation.x>.6);
 s.update(1/60,{playing:true,dashAge:ORB_DASH.windup+.05});assert.equal(s.root.userData.animation,'dash');
});
test('afterimage pool captures independent poses, expires and respects reduced motion',()=>{
 const s=createOrbSato(),fx=createOrbDash(s);s.root.position.set(0,2,0);fx.update(.04,{burst:true});const ghost=fx.group.children.find(c=>c.name==='sato-dash-afterimage'&&c.visible);assert.ok(ghost);s.root.position.z=1;assert.equal(ghost.position.z,0);
 fx.update(.3);assert.equal(fx.group.children.filter(c=>c.name==='sato-dash-afterimage'&&c.visible).length,0);fx.update(.04,{burst:true,reduced:true});assert.equal(fx.group.children.filter(c=>c.name==='sato-dash-afterimage'&&c.visible).length,0);
});
test('debug settings validate saved data and round trip all controls',()=>{
 const s=createCombatSettings();assert.equal(s.values.chargeTime,1.15);s.set('gravity',900);assert.equal(s.values.gravity,9);s.set('radius','no');assert.equal(s.values.radius,.08);s.set('coreColor','#ff1100');const copy=createCombatSettings();copy.apply(JSON.parse(s.export()));assert.deepEqual(copy.values,s.values);copy.reset();assert.equal(copy.values.gravity,4.8);
});
