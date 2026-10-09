import * as T from '../vendor/three.module.min.js';

// One geometry/material vocabulary for the companion and the campus characters.
export function createSceneArt(){
 const materials=new Map(),geometries=new Map();
 const geo=(key,make)=>{if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);};
 const mat=(color,metalness=.1,roughness=.55)=>{const key=`${color}:${metalness}:${roughness}`;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,metalness,roughness}));return materials.get(key);};
 const glow=color=>{const key=`glow:${color}`;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.8,roughness:.4}));return materials.get(key);};
 const finish=color=>typeof color==='string'?mat(color):color;
 function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function box(parent,w,h,d,color,x=0,y=0,z=0){const m=mesh(parent,geo('box',()=>new T.BoxGeometry(1,1,1)),finish(color),x,y,z);m.scale.set(w,h,d);return m;}
 function sphere(parent,r,color,x=0,y=0,z=0,scale=[1,1,1]){const m=mesh(parent,geo('sphere',()=>new T.SphereGeometry(1,24,16)),finish(color),x,y,z);m.scale.set(r*scale[0],r*scale[1],r*scale[2]);return m;}
 const cylinder=(parent,r,height,color,x=0,y=0,z=0,top=r)=>mesh(parent,geo(`cyl:${r}:${top}:${height}`,()=>new T.CylinderGeometry(top,r,height,24)),finish(color),x,y,z);
 function ring(parent,r,width,color,x=0,y=0,z=0,floor=false){const m=mesh(parent,geo(`ring:${r}:${width}`,()=>new T.TorusGeometry(r,width,8,64)),finish(color),x,y,z);if(floor)m.rotation.x=Math.PI/2;return m;}
 function rod(parent,a,b,width,color){const start=new T.Vector3(...a),end=new T.Vector3(...b),delta=end.clone().sub(start),m=cylinder(parent,width,delta.length(),color);m.position.copy(start.add(end).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;}
 return {box,sphere,cylinder,ring,rod,mesh,mat,glow,geo};
}
