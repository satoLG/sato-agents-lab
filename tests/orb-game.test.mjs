import {createCoreGeometry} from '../static/js/orb-core-surface.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../static/vendor/three.module.min.js';
import {createOrbSato} from '../static/js/orb-sato.js';
import {terrainGeometry,addIslandRocks,coastRadius,terrainHeight} from '../static/js/orb-island.js';
import {createOrbWater} from '../static/js/orb-water.js';
import {createOrbSurface,seaSurfaceRadius,coastContactRatio,coreSurfaceRadius} from '../static/js/orb-surface.js';
import {createOrbMotor,ORB_MOTOR} from '../static/js/orb-motor.js';
import {createOrbTrails} from '../static/js/orb-trails.js';


// The existing companion factory creates its legacy optic halo before the orb
// removes that mechanical assembly. Match its headless authoring fixture.
globalThis.document??={createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};

function fixture(trunks=[]) {
 const world=new T.Group(),land=new T.Mesh(terrainGeometry(),new T.MeshBasicMaterial({side:T.DoubleSide}));world.add(land);
 const rocks=addIslandRocks(world),water=createOrbWater();water.uniforms.orbMoonDirection.value.set(1,0,0);
 const surface=createOrbSurface({land,rocks,trunks,water}),events=[],motor=createOrbMotor(surface,{onEvent:e=>events.push(e)});
 return {world,land,rocks,water,surface,motor,events};
}

test('orb adapts the original Sato hull, eye and flippers with short legs and a spherical display',()=>{
 const s=createOrbSato();assert.equal(s.legs.length,2);assert.equal(s.arms.length,2);assert.equal(s.antenna.position.x,0);
 let eye=0;const forbidden=[];s.root.traverse(o=>{if(o.name==='sato-single-eye')eye++;if(/battery|emitter|seam|shutter|magnetic/.test(o.name))forbidden.push(o.name);});
 assert.equal(eye,1);assert.deepEqual(forbidden,[]);
 const arm=s.arms[0].joint.children[0].geometry,leg=s.legs[0].joint.children[0].geometry;arm.computeBoundingBox();leg.computeBoundingBox();
 assert.equal(leg,arm,'legs must share the adapted flipper geometry');
 assert.ok((leg.boundingBox.max.y-leg.boundingBox.min.y)*s.legs[0].joint.scale.y<arm.boundingBox.max.y-arm.boundingBox.min.y);
 assert.ok(s.root.getObjectByName('spherical-hull'),'must preserve the original companion hull');
 const display=s.display.geometry;
 for(let i=0;i<display.attributes.position.count;i++){const p=new T.Vector3().fromBufferAttribute(display.attributes.position,i);assert.ok(Math.abs(p.length()-.542)<1e-6,'display must follow the spherical shell');}
 assert.equal(s.root.userData.animation,'sleep');assert.equal(s.faceUniforms.sleep.value,1);
 const restingScale=s.body.scale.y;s.update(.05,{time:1});assert.notEqual(s.body.scale.y,restingScale,'sleep must breathe');
 s.wakeUp();assert.equal(s.waking,true);s.bounce(2.5);const scales=[],armScales=[],legScales=[];
 for(let i=0;i<120;i++){s.update(1/60,{time:i/60,speed:.58,playing:true,grounded:i<30||i>70,verticalSpeed:1});scales.push(s.body.scale.y);armScales.push(s.arms[0].joint.scale.y);legScales.push(s.legs[0].joint.scale.y);s.root.updateMatrixWorld(true);s.root.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));}
 assert.ok(Math.max(...scales)-Math.min(...scales)>.05);assert.ok(s.root.position.length()===0,'visual animation cannot move the physics root');
 assert.ok(Math.max(...armScales)-Math.min(...armScales)>.08);assert.ok(Math.max(...legScales)-Math.min(...legScales)>.08);
 assert.ok(s.antenna.position.z>.15);assert.ok(s.antenna.getObjectByName('sato-curled-antenna'));
 assert.equal(s.waking,false);assert.ok(s.faceUniforms.sleep.value<.001,'wake must reopen the original iris');
 s.update(.05,{time:4.37,playing:true});assert.ok(s.faceUniforms.blink.value>.8,'blink stays inside the screen shader');
 s.rest();for(let i=0;i<40;i++)s.update(.05,{time:5+i*.05});assert.equal(s.root.userData.animation,'sleep');
 s.wakeUp();s.doubleJump();s.update(.016,{playing:true,reduced:true});
 assert.equal(s.waking,false);assert.equal(s.faceUniforms.sleep.value,0);assert.equal(s.model.rotation.y,0);
});

test('coastal swash stays small but moves the waterline back and forth',()=>{
 for(let i=0;i<16;i++){
  const angle=i*Math.PI/8,values=Array.from({length:90},(_,j)=>coastContactRatio(angle,j*.3));
  assert.ok(Math.max(...values)-Math.min(...values)>.025);assert.ok(Math.min(...values)>.897&&Math.max(...values)<.943);
 }
});

test('radial gravity carries Sato over the underside and around an entire planet',()=>{
 const {motor,surface,events}=fixture();let lowest=1,travel=0,previous=motor.up.clone(),maxError=0;
 for(let i=0;i<1900;i++){
  motor.update(1/60,{direction:motor.heading.clone(),amount:1,time:i/60});lowest=Math.min(lowest,motor.up.y);travel+=Math.acos(T.MathUtils.clamp(previous.dot(motor.up),-1,1));previous.copy(motor.up);
  assert.ok(Math.abs(motor.up.length()-1)<1e-10);assert.ok(Math.abs(motor.up.dot(motor.heading))<1e-8);
  if(motor.grounded)maxError=Math.max(maxError,Math.abs(motor.position.length()-surface.sample(motor.up,i/60).radius));
 }
 assert.ok(lowest<-.999);assert.ok(travel>Math.PI*2);assert.ok(maxError<1e-7);
 const surfaces=new Set(events.filter(e=>e.type==='step').map(e=>e.surface));for(const surface of ['grass','sand','water'])assert.ok(surfaces.has(surface));
});

test('jump and double jump are ballistic, reject a third jump and reset only on landing',()=>{
 const {motor,events}=fixture(),floor=motor.position.length();assert.equal(motor.jump(),true);
 for(let i=0;i<10;i++)motor.update(1/60);
 assert.equal(motor.jump(),true);assert.equal(motor.jumps,2);assert.equal(motor.jump(),false);
 let peak=0;for(let i=0;i<120;i++){motor.update(1/60);peak=Math.max(peak,motor.position.length()-floor);}
 assert.ok(peak>.30&&peak<.5);assert.equal(motor.grounded,true);assert.equal(motor.jumps,0);assert.equal(events.filter(e=>e.type==='land').length,1);assert.equal(motor.jump(),true);
});

test('outer stepping stones protrude through every tested coastal tide',()=>{
 const {rocks,surface,water}=fixture(),matrix=new T.Matrix4(),center=new T.Vector3();
 for(let i=0;i<3;i++){
  rocks[2].getMatrixAt(i,matrix);center.setFromMatrixPosition(matrix).normalize();
  for(const time of [0,8,20,60,140,250])for(const moon of [[1,0,0],[0,1,0],[0,-1,0]]){
   water.uniforms.orbMoonDirection.value.set(...moon);const top=surface.sample(center,time);
   assert.equal(top.surface,'rock');assert.ok(top.radius-seaSurfaceRadius(center,time,water.uniforms.orbMoonDirection.value)>.025);
  }
 }
});

test('stone side blocks walking, but a jump can land on its actual polygon surface',()=>{
 const {motor,rocks,events}=fixture(),matrix=new T.Matrix4(),center=new T.Vector3();rocks[2].getMatrixAt(0,matrix);center.setFromMatrixPosition(matrix).normalize();
 const tangent=new T.Vector3().crossVectors(center,new T.Vector3(0,1,0)).normalize(),start=center.clone().addScaledVector(tangent,-.22/2.17).normalize();motor.place(start);
 for(let i=0;i<100;i++)motor.update(1/120,{direction:tangent,amount:1});
 const stopped=motor.up.clone();assert.ok(stopped.distanceTo(center)>.025,'cannot walk through the rock side');
 motor.jump();let landed=false;
 for(let i=0;i<200;i++){
  const direction=center.clone().addScaledVector(motor.up,-center.dot(motor.up));const distance=direction.length()*motor.position.length();
  motor.update(1/120,{direction,amount:distance>.02?1:0});if(motor.grounded&&motor.support.surface==='rock'){landed=true;break;}
 }
 assert.ok(landed,'jump must settle on the visible rock triangles');assert.ok(events.some(e=>e.type==='land'&&e.surface==='rock'));
});

test('Sato capsule cannot walk through a tree trunk',()=>{
 const {motor}=fixture([{x:0,z:.2,y:2.14,height:.9,radius:.02}]);
 for(let i=0;i<100;i++)motor.update(1/60,{direction:new T.Vector3(0,0,1),amount:1});
 const clearance=.2-motor.position.z;
 assert.ok(clearance>=ORB_MOTOR.radius+.02-.002);assert.ok(clearance<ORB_MOTOR.radius+.02+.012);
});

test('short legs can step over the small island pebbles when leaving the spawn',()=>{
 const {motor}=fixture();
 for(let a=0;a<Math.PI*2;a+=Math.PI/8){
  motor.place(new T.Vector3(0,1,0));const start=motor.position.clone(),direction=new T.Vector3(Math.sin(a),0,Math.cos(a));
  for(let i=0;i<40;i++)motor.update(1/120,{direction,amount:1});
  assert.ok(motor.position.distanceTo(start)>.08,`spawn must be walkable at angle ${a}`);
 }
});

test('sand footprints and foam particles use bounded pools and water ripples expire',()=>{
 const water=createOrbWater(),trails=createOrbTrails(water),base={point:new T.Vector3(0,2.12,0),normal:new T.Vector3(0,1,0),up:new T.Vector3(0,1,0),heading:new T.Vector3(0,0,1)};
 for(let i=0;i<150;i++)trails.emit({...base,type:'step',surface:'sand'});
 assert.equal(trails.footprintTotal,150);assert.equal(trails.footprints.count,96);assert.equal(trails.activeParticles,0);
 for(let i=0;i<20;i++)trails.emit({...base,type:i%2?'jump':'land',surface:'water'});
 assert.ok(trails.activeParticles>0&&trails.activeParticles<=240);assert.equal(water.uniforms.orbRippleCenters.value.length,8);
 trails.update(.016,.016);for(let i=0;i<trails.particles.count;i++){const m=new T.Matrix4();trails.particles.getMatrixAt(i,m);assert.ok(m.elements.every(Number.isFinite));}
 trails.update(3,3);assert.equal(trails.activeParticles,0);assert.equal(trails.particles.visible,false);
});

test('water never supports the body: feet stay on the solid floor as tides change',()=>{
 const {motor,surface,water,events}=fixture();motor.place(new T.Vector3(0,0,1));
 const floor=motor.position.length();assert.ok(Math.abs(floor-coreSurfaceRadius(motor.up))<1e-7);
 for(const time of [0,5,15,30]){motor.update(1/60,{time});assert.ok(Math.abs(motor.position.length()-floor)<1e-7);assert.ok(motor.waterDepth>.12);assert.equal(motor.support.surface,'water');assert.equal(motor.support.groundSurface,'rock');}
 for(let i=0;i<60;i++)motor.update(1/120,{direction:motor.heading.clone(),amount:1});
 assert.ok(events.some(e=>e.type==='step'&&e.surface==='water'&&e.waterDepth>.12));
 const depthBefore=motor.waterDepth;motor.jump();assert.equal(events.at(-1).surface,'water');
 for(let i=0;i<30;i++)motor.update(1/120);
 assert.ok(motor.waterDepth<depthBefore-.16,'jump lifts the body through the water');motor.jump();
 assert.equal(events.at(-1).surface,motor.waterDepth>.008?'water':'rock','wet audio follows actual immersion, not the floor material');
});

test('deeper immersion produces more foam, emitted at sea level rather than on the seabed',()=>{
 const base={type:'jump',surface:'water',point:new T.Vector3(0,1.84,0),waterRadius:2.05,normal:new T.Vector3(0,1,0),up:new T.Vector3(0,1,0),heading:new T.Vector3(0,0,1)};
 const shallow=createOrbTrails(createOrbWater()),deep=createOrbTrails(createOrbWater());
 shallow.emit({...base,waterDepth:.02});deep.emit({...base,waterDepth:.25});
 assert.ok(deep.activeParticles>shallow.activeParticles*2);deep.update(.001,.001);
 const matrix=new T.Matrix4(),position=new T.Vector3();deep.particles.getMatrixAt(0,matrix);position.setFromMatrixPosition(matrix);assert.ok(position.y>2.05,'splash must start at the water surface');
});

test('offshore stones are separated from the beach and have broad radial flat tops',()=>{
 const {rocks,surface}=fixture(),matrix=new T.Matrix4(),center=new T.Vector3();
 for(let i=0;i<3;i++){
  rocks[2].getMatrixAt(i,matrix);center.setFromMatrixPosition(matrix);
  assert.ok(Math.hypot(center.x,center.z)/coastRadius(Math.atan2(center.z,center.x))>1.25);
  const up=center.clone().normalize(),tangent=new T.Vector3().crossVectors(up,new T.Vector3(0,1,0)).normalize();
  const top=surface.sample(up),side=surface.sample(up.clone().addScaledVector(tangent,.035));
  assert.equal(top.groundSurface,'rock');assert.equal(side.groundSurface,'rock');assert.ok(top.normal.dot(up)>.99);assert.ok(Math.abs(top.radius-side.radius)<.012);
 }
});

test('constant-time seafloor collision matches the actual rendered core triangles',()=>{
 const mesh=new T.Mesh(createCoreGeometry(),new T.MeshBasicMaterial()),ray=new T.Raycaster();mesh.updateMatrixWorld();
 for(let i=0;i<180;i++){
  const n=new T.Vector3(Math.cos(i*2.399),Math.sin(i*.89),Math.sin(i*2.399)).normalize();ray.set(n.clone().multiplyScalar(3),n.clone().negate());
  const hit=ray.intersectObject(mesh)[0];assert.ok(hit);assert.ok(Math.abs(coreSurfaceRadius(n)-hit.point.length())<1e-6);
 }
 mesh.geometry.dispose();mesh.material.dispose();
});

test('offshore boulders have bases buried in the seabed, not suspended above it',()=>{
 const {rocks}=fixture(),matrix=new T.Matrix4(),point=new T.Vector3();
 for(let i=0;i<3;i++){
  rocks[2].getMatrixAt(i,matrix);let penetration=Infinity;
  const p=rocks[2].geometry.attributes.position;
  for(let j=0;j<p.count;j++){
   point.fromBufferAttribute(p,j).applyMatrix4(matrix);const n=point.clone().normalize();
   const floor=Math.max(coreSurfaceRadius(n),Math.hypot(point.x,terrainHeight(point.x,point.z),point.z));
   penetration=Math.min(penetration,point.length()-floor);
  }
  assert.ok(penetration<-.015,'a solid base must reach below the rendered ground');
 }
});
