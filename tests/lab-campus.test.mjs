import test from 'node:test';
import assert from 'node:assert/strict';
import {DECK_HEIGHT,onDeck,deckHeight,DECKS,ENERGY_ROUTES,deckEdges} from '../static/js/lab-layout.js';
import {findPath,clearSegment,moveWithCollision} from '../static/js/lab-navigation.js';
import {parcelDrop,groundHeight,FLOOR,CAMPUS_SCALE} from '../static/js/lab-campus.js';

test('reception stays level while the entry ramps onto the decks and the campus is thirty percent smaller',()=>{
  assert.equal(CAMPUS_SCALE,.7);
  for(const [x,z]of [[0,46],[0,29],[-8,24]])assert.equal(groundHeight(x,z),FLOOR);
  assert.equal(groundHeight(40,46),.1);
  assert.equal(groundHeight(19,-14),DECK_HEIGHT);
  assert.ok(groundHeight(0,17)>FLOOR&&groundHeight(0,17)<DECK_HEIGHT);
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
  assert.equal(groundHeight(0,-3),DECK_HEIGHT+1.92);
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

test('every sector is reachable from reception along the protected raised footprint',()=>{
 const boxes=[];boxes.walkable=(x,z,r)=>z>=18||onDeck(x,z,r+.08);
 for(const goal of [{x:-21,z:10},{x:23,z:10},{x:0,z:-3},{x:-24,z:-21},{x:-13,z:-21},{x:12,z:-22},{x:24,z:-12}]){
  const start={x:0,z:24},path=findPath(start,goal,boxes,[]);assert.ok(path.length,JSON.stringify(goal));
  let prev=start;for(const p of path){assert.ok(clearSegment(prev,p,boxes,[]));prev=p;}
 }
 const next=moveWithCollision({x:0,z:-15},9,0,boxes,[]);assert.ok(next.x<3);assert.ok(onDeck(next.x,next.z,.32));
});
test('energy uses only straight orthogonal spans on a deck and railings leave entry open',()=>{
 for(const route of ENERGY_ROUTES)for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i];assert.ok(a[0]===b[0]||a[1]===b[1]);
  for(let j=0;j<=50;j++)assert.ok(onDeck(a[0]+(b[0]-a[0])*j/50,a[1]+(b[1]-a[1])*j/50));
 }
 assert.ok(deckEdges().length>10);assert.ok(!deckEdges().some(e=>e.axis==='z'&&e.fixed===18&&e.start<3&&e.end> -3));
 assert.equal(deckHeight(6,-14),null);
});
