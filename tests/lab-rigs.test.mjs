import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../static/vendor/three.module.min.js';
import {createRigFactory,poseRig,setRigBlink} from '../static/js/lab-rigs.js';

function robotFactory(){
 const geometries=new Map(),materials=new Map();
 const geo=(key,make)=>{if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);};
 const mat=(color,metalness=.1,roughness=.55)=>{const key=`${color}:${metalness}:${roughness}`;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,metalness,roughness}));return materials.get(key);};
 const glow=color=>mat(color);
 const mesh=(parent,geometry,material,x=0,y=0,z=0)=>{const m=new T.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;};
 const finish=color=>typeof color==='string'?mat(color):color;
 const box=(parent,w,h,d,color,x=0,y=0,z=0)=>{const m=mesh(parent,geo('box',()=>new T.BoxGeometry(1,1,1)),finish(color),x,y,z);m.scale.set(w,h,d);return m;};
 const sphere=(parent,r,color,x=0,y=0,z=0,scale=[1,1,1])=>{const m=mesh(parent,geo('sphere',()=>new T.SphereGeometry(1,24,16)),finish(color),x,y,z);m.scale.set(r*scale[0],r*scale[1],r*scale[2]);return m;};
 const cylinder=(parent,r,height,color,x=0,y=0,z=0,top=r)=>mesh(parent,geo(`cyl:${r}:${top}:${height}`,()=>new T.CylinderGeometry(top,r,height,24)),finish(color),x,y,z);
 const ring=(parent,r,width,color,x=0,y=0,z=0,floor=false)=>{const m=mesh(parent,geo(`ring:${r}:${width}`,()=>new T.TorusGeometry(r,width,8,64)),finish(color),x,y,z);if(floor)m.rotation.x=Math.PI/2;return m;};
 const rod=(parent,a,b,width,color)=>{const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start),m=cylinder(parent,width,delta.length(),color);m.position.copy(start.add(end).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;};
 return createRigFactory({box,sphere,cylinder,ring,rod,mesh,mat,glow,geo});
}

// The production halo is a cached CanvasTexture; these tests exercise the real
// Three geometry and bones without needing a browser's canvas implementation.
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};

test('camera shutter stays inside its white socket and closes the optic',()=>{
 const rig=robotFactory().robot();rig.root.rotation.y=0;rig.root.updateMatrixWorld(true);
 const ray=new T.Raycaster(),direction=new T.Vector3(0,0,-1),leaves=rig.lids.map(lid=>lid.mesh);
 const blocked=(x,y)=>{ray.set(rig.head.localToWorld(new T.Vector3(x,.015+y,2)),direction);return ray.intersectObjects(leaves,false).length>0;};
 assert.equal(leaves.length,6);assert.equal(blocked(0,0),false);
 for(let i=0;i<32;i++){const a=i*Math.PI/16;assert.equal(blocked(Math.cos(a)*.135,Math.sin(a)*.135),false);}
 for(const amount of [0,.5,1]){
  setRigBlink(rig,amount);rig.root.updateMatrixWorld(true);
  for(const lid of leaves){
   const vertices=lid.geometry.getAttribute('position');
   for(let i=0;i<vertices.count;i++){const p=new T.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(lid.matrix);assert.ok(Math.hypot(p.x,p.y-.015)<.313);}
  }
 }
 assert.equal(blocked(0,0),true);
 for(let i=0;i<32;i++){const a=i*Math.PI/16;assert.equal(blocked(Math.cos(a)*.13,Math.sin(a)*.13),true,`closed shutter angle ${a}`);}
 const socket=rig.head.getObjectByName('optic-white-socket');assert.ok(socket);
 // Any part of a shutter outside the lens aperture must sit behind white shell.
 setRigBlink(rig,0);rig.root.updateMatrixWorld(true);
 for(let i=0;i<40;i++)for(const radius of [.19,.23,.27,.3]){
  const a=i*Math.PI/20;ray.set(rig.head.localToWorld(new T.Vector3(Math.cos(a)*radius,.015+Math.sin(a)*radius,2)),direction);
  const hits=ray.intersectObjects([socket,...leaves],false);assert.equal(hits[0]?.object,socket);
 }
 assert.equal(rig.pupil.getObjectByName('optic-radial-marks').geometry.getAttribute('position').count,32*6);
});

test('jointed hands and toes survive batching and reuse meshes through animation',()=>{
 const factory=robotFactory();
 for(const core of [false,true]){
  const rig=factory.robot({core});
  for(const arm of rig.arms){
   assert.equal(arm.wrist.parent,arm.lower);assert.equal(arm.fingers.length,3);
   for(const finger of arm.fingers){assert.equal(finger.tip.parent,finger.root);assert.equal(finger.root.children.filter(o=>o.isMesh).length,1);assert.equal(finger.tip.children.filter(o=>o.isMesh).length,1);}
  }
  for(const leg of rig.legs)assert.equal(leg.toe.parent,leg.ankle);
  const before=[];rig.root.traverse(o=>{if(o.isMesh)before.push([o,o.geometry,o.material]);});
  for(let t=0;t<18;t+=.04)poseRig(rig,t,.04,{speed:t<3?1:0,work:t>=3&&t<9?1:0,talk:t>=9,carrying:t>=15});
  const after=[];rig.root.traverse(o=>{if(o.isMesh)after.push([o,o.geometry,o.material]);});
  assert.deepEqual(after,before);assert.equal(rig.pupil.scale.y,1);assert.equal(rig.core,core);
  assert.ok(rig.arms[0].fingers[0].tip.rotation.x<-.55);
 }
});
