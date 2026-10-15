import * as T from '../vendor/three.module.min.js';

// The canopy cards are instanced. Their conservative world bounds are enough
// to keep the follow camera out of foliage, without raycasting every leaf.
export function createOrbCameraCollision(trees) {
  const spheres=[],instance=new T.Matrix4(),transform=new T.Matrix4();
  trees.updateWorldMatrix(true,true);
  trees.traverse(mesh=>{
    if(mesh.name!=='wind-canopies')return;
    mesh.geometry.computeBoundingSphere();
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,instance);transform.multiplyMatrices(mesh.matrixWorld,instance);
      const sphere=mesh.geometry.boundingSphere.clone().applyMatrix4(transform);sphere.radius+=.035;spheres.push(sphere);
    }
  });
  const ray=new T.Ray(),hit=new T.Vector3(),axis=new T.Vector3(),candidate=new T.Vector3();
  function clearance(target,back,up,pitch,distance) {
    axis.copy(back).multiplyScalar(Math.cos(pitch)).addScaledVector(up,Math.sin(pitch));ray.set(target,axis);
    let room=distance;
    for(const sphere of spheres)if(ray.intersectSphere(sphere,hit))room=Math.min(room,Math.max(.20,hit.distanceTo(target)-.05));
    return room;
  }
  function resolve(target,back,up,pitch,distance) {
    let room=clearance(target,back,up,pitch,distance),best=room,bestAngle=0;
    const minimum=Math.min(distance,.95);
    if(room<minimum)for(let i=1;i<=8;i++){
      for(const sign of [-1,1]){
        candidate.copy(back).applyAxisAngle(up,sign*i*Math.PI/8);
        const available=clearance(target,candidate,up,pitch,distance);
        if(available>best+.02){best=available;bestAngle=sign*i*Math.PI/8;}
      }
      if(best>=minimum)break;
    }
    if(bestAngle){back.applyAxisAngle(up,bestAngle);room=best;}
    return room;
  }
  return {resolve,clearance};
}
