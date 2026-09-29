import test from 'node:test';
import assert from 'node:assert/strict';
import {parcelDrop,groundHeight,FLOOR,CAMPUS_SCALE} from '../static/js/lab-campus.js';

test('walkable paving is a single level and the campus is thirty percent smaller',()=>{
  assert.equal(CAMPUS_SCALE,.7);
  for(const [x,z]of [[0,46],[0,29],[-8,24],[0,17],[19,-14]])assert.equal(groundHeight(x,z),FLOOR);
  assert.equal(groundHeight(40,46),.1);
});
test('parcel drop accelerates, bounces without penetrating the tray and settles on it',()=>{
  const a=parcelDrop(0).y,b=parcelDrop(.2).y,c=parcelDrop(.4).y;
  assert.ok(a>b&&b>c);assert.ok(b-c>a-b);
  for(let t=.5;t<3;t+=.01)assert.ok(parcelDrop(t).y>=.45);
  assert.ok(Math.abs(parcelDrop(.49999).y-parcelDrop(.5).y)<.001);
  assert.ok(Math.abs(parcelDrop(3).y-.45)<1e-6);
  assert.ok(parcelDrop(3).tilt<1e-6);
});


test('forest height field is flat beneath roads and irregular outside the clearing',async()=>{
  const {terrainHeight,pavementHeight}=await import('../static/js/lab-landscape.js');
  for(const [x,z] of [[0,46],[-50,13],[0,76],[32,-31]])assert.equal(terrainHeight(x,z),.02);
  assert.equal(pavementHeight(0,46),.06);assert.equal(pavementHeight(45,46),.035);
  const heights=[terrainHeight(-95,-85),terrainHeight(-88,-85),terrainHeight(80,100)];
  assert.ok(heights.every(h=>h>.5));assert.ok(new Set(heights).size===3);
  assert.ok(Math.abs(terrainHeight(80.001,100)-terrainHeight(80,100))<.01);
});


test('CORE has two flights with a wider landing and matching walking heights',async()=>{
  const {CORE_STEPS,coreHeight}=await import('../static/js/lab-layout.js');
  assert.equal(CORE_STEPS.length,8);
  assert.equal(groundHeight(0,-3),FLOOR+1.92);
  assert.equal(coreHeight(11,-3),0);
  assert.ok(CORE_STEPS[3].w-CORE_STEPS[4].w>CORE_STEPS[2].w-CORE_STEPS[3].w);
  for(const s of CORE_STEPS)assert.ok(Math.abs(coreHeight(s.w/2-.01,-3)-s.h)<1e-8);
  assert.equal(coreHeight(10,-3+8.5),0); // Rounded corner is outside the step.
});


test('numbered pillars do not overlap worker slots and stand fully on their level',async()=>{
  const {ZONES,slotsFor}=await import('../static/js/lab-layout.js');
  for(const zone of Object.values(ZONES)){
    const [x,z]=zone.sign,y=groundHeight(x,z);
    for(const dx of [-1.375,1.375])for(const dz of [-.22,.22])assert.equal(groundHeight(x+dx,z+dz),y,zone.name);
    for(const [id,other]of Object.entries(ZONES))for(const [dx,dz]of slotsFor(id)){
      const awayX=Math.max(0,Math.abs(other.x+dx-x)-1.375),awayZ=Math.max(0,Math.abs(other.z+dz-z)-.3);
      assert.ok(Math.hypot(awayX,awayZ)>.7,`${zone.name} blocks ${id}`);
    }
  }
});
