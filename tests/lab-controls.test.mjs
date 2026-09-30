import test from 'node:test';
import assert from 'node:assert/strict';
import {stickVector,movementIntent,WALK_SPEED,RUN_SPEED} from '../static/js/lab-controls.js';
import {distanceGain,spatialMix} from '../static/js/lab-audio.js';
test('analog dead zone, partial movement and diagonal keyboard speeds',()=>{
 assert.deepEqual(stickVector(.03,.02),{x:0,y:0});const half=stickVector(.55,0);assert.ok(half.x>.4&&half.x<.6);
 const diagonal=movementIntent(new Set(['w','d']),{x:0,y:0},0);assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z)-1)<1e-8);assert.equal(diagonal.running,false);
 assert.equal(movementIntent(new Set(['w','shift']),{x:0,y:0},0).running,true);assert.ok(RUN_SPEED>WALK_SPEED*2);
});
test('movement follows camera rotation while analog magnitude stays proportional',()=>{
 const forward=movementIntent(new Set(['w']),{x:0,y:0},Math.PI/2);assert.ok(forward.x<-.99);assert.ok(Math.abs(forward.z)<1e-8);
 const partial=movementIntent(new Set(),{x:.3,y:0},0);assert.equal(partial.strength,.3);assert.equal(partial.x,.3);
});
test('audio is silent beyond the source radius and fades continuously',()=>{
 assert.equal(distanceGain(0,10),1);assert.equal(distanceGain(5,10),.25);assert.equal(distanceGain(10,10),0);assert.equal(distanceGain(100,10),0);
 assert.ok(distanceGain(2,10)>distanceGain(3,10));assert.deepEqual(spatialMix({x:0,z:0},null),{gain:1,pan:0});
});
test('stereo panning follows camera orientation around the player',()=>{
 const p={x:4,z:0};assert.equal(spatialMix({x:0,z:0,yaw:0},p).pan,1);assert.ok(spatialMix({x:0,z:0,yaw:Math.PI},p).pan<-.99);
 assert.equal(spatialMix({x:0,z:0}, {x:20,z:0},6).gain,0);
});
