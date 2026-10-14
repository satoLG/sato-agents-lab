import * as T from '../vendor/three.module.min.js';

// Even triangles and shared vertices avoid the latitude rings and duplicate
// pole/meridian normals of a UV sphere. Water shading needs no UV coordinates.
export function createOceanGeometry(radius,detail=26) {
  const source=new T.IcosahedronGeometry(radius,detail),p=source.attributes.position;
  const positions=[],indices=[],vertices=new Map();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),key=[x,y,z].map(n=>Math.round(n*1e5)).join(',');
    let index=vertices.get(key);
    if(index===undefined){index=positions.length/3;vertices.set(key,index);positions.push(x,y,z);}
    indices.push(index);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  geometry.parameters={radius,detail};source.dispose();return geometry;
}

// UVs can remain split for a tiling rock map, while its geometric normals
// join smoothly across the meridian and the duplicate vertices at the poles.
export function smoothSphereNormals(geometry) {
  geometry.computeVertexNormals();
  const p=geometry.attributes.position,n=geometry.attributes.normal,groups=new Map();
  for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(',');
    let group=groups.get(key);if(!group){group={normal:new T.Vector3(),indices:[]};groups.set(key,group);}
    group.normal.add(new T.Vector3().fromBufferAttribute(n,i));group.indices.push(i);
  }
  for(const group of groups.values()){group.normal.normalize();for(const i of group.indices)n.setXYZ(i,group.normal.x,group.normal.y,group.normal.z);}
  n.needsUpdate=true;
}
