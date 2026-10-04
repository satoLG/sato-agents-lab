import test from 'node:test';
import assert from 'node:assert/strict';
import {ZONES,GRID_FOOTPRINTS,gridPlacement,GRID_CELL,onDeck} from '../static/js/lab-layout.js';
import {roomVisibility,conveyorPoint,BELT_LENGTH} from '../static/js/lab-campus.js';
import {placeInteraction} from '../static/js/lab-prompt.js';
import {findPath,canStand} from '../static/js/lab-navigation.js';
import {indicatorCards} from '../static/js/lab-monitors.js';
const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2&&Math.abs(a.z-b.z)<(a.d+b.d)/2;
test('grid reservations keep each panel, desk and equipment bay disjoint and walkable',()=>{
 assert.equal(GRID_CELL,2);
 for(const [id,zone]of Object.entries(ZONES).filter(([id])=>id!=='gateway')){
  const footprints=Object.keys(GRID_FOOTPRINTS).map(key=>gridPlacement(zone,key));
  for(const [i,a]of footprints.entries()){
   for(const b of footprints.slice(i+1))assert.equal(overlaps(a,b),false,`${id}: ${JSON.stringify(a.cells)} overlaps ${JSON.stringify(b.cells)}`);
   for(const dx of [-a.w/2,a.w/2])for(const dz of [-a.d/2,a.d/2])assert.ok(onDeck(a.x+dx,a.z+dz),`${id} outside deck`);
  }
 }
});
test('opaque wall proximity never reveals another room; portal corridors do',()=>{
 for(const p of [{x:39,z:26},{x:-39,z:17},{x:20,z:32}]){const v=roomVisibility(p);assert.equal(v.exterior,1);assert.equal(v.hall,p.z<18?1:0);}
 for(const p of [{x:41,z:0},{x:25,z:34},{x:0,z:-44}])assert.equal(roomVisibility(p).exterior,0);
 assert.equal(roomVisibility({x:0,z:11}).hall,1);
 assert.ok(roomVisibility({x:0,z:18}).hall>0&&roomVisibility({x:0,z:18}).hall<1);
 assert.ok(roomVisibility({x:0,z:35}).exterior>0&&roomVisibility({x:0,z:35}).exterior<1);
 assert.ok(roomVisibility({x:0,z:32}).exterior>0&&roomVisibility({x:0,z:32}).exterior<1);
});
test('belt curve and packet route have continuous position and tangent through both corners',()=>{
 for(const joint of [14,14+Math.PI]){
  const a=conveyorPoint(joint-1e-5),b=conveyorPoint(joint+1e-5);
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<3e-5);assert.ok(Math.abs(a.angle-b.angle)<1e-5);
 }
 for(let d=0;d<BELT_LENGTH-.01;d+=.05){const a=conveyorPoint(d),b=conveyorPoint(d+.01);assert.ok(Math.abs(Math.hypot(a.x-b.x,a.z-b.z)-.01)<1e-6);}
 const end=conveyorPoint(BELT_LENGTH);assert.equal(end.x,-38);assert.ok(Math.abs(end.z+5)<1e-10);
});
test('interaction prompt chooses below the avatar when the object occupies the upper anchor',()=>{
 const anchor={x:200,top:300,bottom:390,left:180,right:220},object={left:100,right:300,top:80,bottom:340};
 const p=placeInteraction(anchor,[object],160,44,{width:390,height:844});assert.equal(p.side,'below');assert.ok(p.y>=object.bottom);assert.ok(p.x-80>=12&&p.x+80<=378);
 const upper=placeInteraction(anchor,[{left:100,right:300,top:395,bottom:700}],160,44,{width:390,height:844});assert.equal(upper.side,'above');assert.ok(upper.y+44<395);
});
test('VM monitors use real disk usage and CPU process readings, preserving zero and missing data',()=>{
 const cards=indicatorCards('vm',{vm:{data:{cpu:{total:0},memory:{total:4096,used_percent:52},filesystems:[{mount:'/',used_percent:76}],top_processes:[{command:'hermes',pid:'42',cpu:12.5}],uptime_seconds:3600}}});
 assert.equal(cards.find(c=>c.title==='CPU').progress,0);assert.equal(cards.find(c=>c.title==='RAM').progress,52);assert.equal(cards.find(c=>c.title==='DISCO').progress,76);assert.match(cards.find(c=>c.title==='PROCESSOS').lines[0],/hermes.*12.5% CPU/);
 assert.deepEqual(indicatorCards('vm',{}),[]);
});

test('clicking the center of a large equipment bay resolves to its accessible edge',()=>{
 const boxes=[{x:0,z:0,w:6.4,d:6.4}],path=findPath({x:0,z:10},{x:0,z:0},boxes,[]);
 assert.ok(path.length);assert.ok(canStand(path.at(-1).x,path.at(-1).z,boxes,[]));assert.ok(Math.hypot(path.at(-1).x,path.at(-1).z)<5);
});
