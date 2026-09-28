import test from 'node:test';
import assert from 'node:assert/strict';
import {parcelDrop,groundHeight,FLOOR,CAMPUS_SCALE} from '../static/js/lab-campus.js';

test('walkable paving is a single level and the campus is thirty percent smaller',()=>{
  assert.equal(CAMPUS_SCALE,.7);
  for(const [x,z]of [[0,46],[0,29],[-8,24],[0,17],[0,-3],[19,-14]])assert.equal(groundHeight(x,z),FLOOR);
  assert.equal(groundHeight(40,46),.02);
});
test('parcel drop accelerates, bounces without penetrating the tray and settles on it',()=>{
  const a=parcelDrop(0).y,b=parcelDrop(.2).y,c=parcelDrop(.4).y;
  assert.ok(a>b&&b>c);assert.ok(b-c>a-b);
  for(let t=.5;t<3;t+=.01)assert.ok(parcelDrop(t).y>=.45);
  assert.ok(Math.abs(parcelDrop(.49999).y-parcelDrop(.5).y)<.001);
  assert.ok(Math.abs(parcelDrop(3).y-.45)<1e-6);
  assert.ok(parcelDrop(3).tilt<1e-6);
});
