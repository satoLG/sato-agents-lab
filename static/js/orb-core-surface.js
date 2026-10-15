import * as T from '../vendor/three.module.min.js';

export const CORE_RADIUS=1.84,CORE_SEGMENTS=64,CORE_RINGS=48;
export function coreReliefRadius(n) {
  const x=n.x*CORE_RADIUS,y=n.y*CORE_RADIUS,z=n.z*CORE_RADIUS;
  return CORE_RADIUS*(1+Math.sin(x*5+z*2)*Math.cos(y*6-z*3)*.006);
}
export function createCoreGeometry() {
  const geometry=new T.SphereGeometry(CORE_RADIUS,CORE_SEGMENTS,CORE_RINGS),p=geometry.attributes.position,n=new T.Vector3();
  for(let i=0;i<p.count;i++){n.fromBufferAttribute(p,i).normalize().multiplyScalar(coreReliefRadius(n));p.setXYZ(i,n.x,n.y,n.z);}
  geometry.computeVertexNormals();return geometry;
}
// The visible sphere is a regular angular grid. Find its two candidate
// triangles directly instead of raycasting all 6,000 faces at 120 Hz.
const geometry=createCoreGeometry(),vertices=Array.from({length:geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(geometry.attributes.position,i));
geometry.dispose();
const ray=new T.Ray(new T.Vector3()),hit=new T.Vector3();
export function coreSurfaceRadius(n) {
  const phi=(Math.atan2(n.z,-n.x)+Math.PI*2)%(Math.PI*2),theta=Math.acos(T.MathUtils.clamp(n.y,-1,1));
  const x=Math.min(CORE_SEGMENTS-1,Math.floor(phi/(Math.PI*2)*CORE_SEGMENTS)),y=Math.min(CORE_RINGS-1,Math.floor(theta/Math.PI*CORE_RINGS));
  const b=y*(CORE_SEGMENTS+1)+x,a=b+1,c=b+CORE_SEGMENTS+1,d=c+1;ray.direction.copy(n);
  if(ray.intersectTriangle(vertices[a],vertices[b],vertices[d],false,hit)||ray.intersectTriangle(vertices[b],vertices[c],vertices[d],false,hit))return hit.length();
  return coreReliefRadius(n); // Pole degeneracy only.
}
