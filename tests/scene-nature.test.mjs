import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../static/vendor/three.module.min.js';
import {createForestTerrain,forestWaterProfile,FOREST_WATER_HEIGHT} from '../static/js/home-forest.js';
import {waterRibbon} from '../static/js/scene-water.js';
import {createFoliageCloud} from '../static/js/folio-foliage.js';

test('lake and creek remain above the actual interpolated terrain triangles',()=>{
 const geometry=createForestTerrain(),ground=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide})),ray=new T.Raycaster();
 ground.updateMatrixWorld();
 for(let z=-1.5;z>=-30;z-=.43){
  const {center,width}=forestWaterProfile(z);
  for(const ratio of [-.95,-.5,0,.5,.95]){
   ray.set(new T.Vector3(center+width*ratio,2,z),new T.Vector3(0,-1,0));const hit=ray.intersectObject(ground)[0];
   assert.ok(hit,`missing ground at ${z}`);assert.ok(hit.point.y<FOREST_WATER_HEIGHT-.005,`buried water at ${z}, ${ratio}: ${hit.point.y}`);
  }
 }
 geometry.dispose();ground.material.dispose();
});

test('water contour widths remain in world units in both ribbon orientations',()=>{
 for(const axis of ['x','z']){
  const g=waterRibbon({axis,start:-8,end:8,height:.15,profile:t=>({center:Math.sin(t),width:1.2+.3*Math.cos(t)})});
  const p=g.attributes.position,uv=g.attributes.uv,w=g.attributes.waterWidth;
  assert.equal(p.count,w.count);assert.equal(p.count,uv.count);
  for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i)+p.getZ(i)));assert.ok(Math.abs(p.getY(i)-.15)<1e-7);assert.ok(w.getX(i)>.89);}
  g.dispose();
 }
});

test('foliage is the reference leaf-card cloud with radial normals, not a solid crown',()=>{
 for(const count of [20,80]){
  const g=createFoliageCloud(count),n=g.attributes.normal;
  assert.equal(g.attributes.position.count,count*4);assert.equal(g.index.count,count*6);
  for(let i=0;i<n.count;i++)assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-6);
  g.dispose();
 }
});

test('orb intro camera matches the loading circle in portrait and landscape',async()=>{
 const {sphereDistanceForDiameter}=await import('../static/js/orb-camera.js');
 const geometry=new T.SphereGeometry(2.05,144,96),position=geometry.attributes.position;
 const direction=new T.Vector3(4.4,4.25,9.8).normalize(),point=new T.Vector3();
 for(const [width,height,diameter,fov] of [[1100,850,136,36],[390,844,120,46],[1920,1080,144,36],[844,390,120,36]]){
  const camera=new T.PerspectiveCamera(fov,width/height,.05,300);
  camera.position.copy(direction).multiplyScalar(sphereDistanceForDiameter(2.05,height,diameter,fov));camera.lookAt(0,0,0);camera.updateMatrixWorld();
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i).project(camera);minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);}
  assert.ok(Math.abs((maxX-minX)*width/2-diameter)<.3,'globe width must match the circle');
  assert.ok(Math.abs((maxY-minY)*height/2-diameter)<.3,'globe height must match the circle');
  assert.ok(Math.abs((maxX+minX)*width/4)<.2&&Math.abs((maxY+minY)*height/4)<.2,'globe must be centered behind the circle');
 }
 geometry.dispose();
});
