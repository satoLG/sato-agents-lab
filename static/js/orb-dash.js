import * as T from '../vendor/three.module.min.js';
export function createOrbDash(avatar){
 const group=new T.Group();group.name='sato-dash-effects';group.userData.orbFoamExclude=true;
 const originals=[];avatar.root.traverse(o=>originals.push(o));
 const ghosts=Array.from({length:6},()=>{
  const root=avatar.root.clone(true),objects=[];root.name='sato-dash-afterimage';root.traverse(o=>objects.push(o));
  const material=new T.MeshBasicMaterial({color:'#6ddfff',transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false});
  root.traverse(o=>{if(o.isMesh){o.material=material;o.castShadow=o.receiveShadow=false;}});root.visible=false;group.add(root);return {root,objects,material,age:99};
 });
 const ringMaterial=new T.MeshBasicMaterial({color:'#a9efff',transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
 const ring=new T.Mesh(new T.RingGeometry(.7,1,40),ringMaterial);ring.visible=false;group.add(ring);
 const streakMaterial=ringMaterial.clone(),streaks=new T.InstancedMesh(new T.ConeGeometry(.014,.12,4),streakMaterial,12),dummy=new T.Object3D();streaks.visible=false;group.add(streaks);
 let index=0,timer=0,impactAge=99;const impact=new T.Vector3(),up=new T.Vector3(),forward=new T.Vector3(),right=new T.Vector3(),Z=new T.Vector3(0,0,1);
 function emit(event){if(event.type!=='dash'&&event.type!=='dash-impact')return;impact.copy(event.point).addScaledVector(event.up,.012);up.copy(event.up);forward.copy(event.heading);right.crossVectors(up,forward);impactAge=0;ring.position.copy(impact);ring.quaternion.setFromUnitVectors(Z,up);}
 function update(dt,{burst=false,reduced=false}={}){
  timer+=dt;impactAge+=dt;
  if(burst&&!reduced&&timer>.035){timer=0;const ghost=ghosts[index++%ghosts.length];originals.forEach((o,i)=>{const c=ghost.objects[i];c.position.copy(o.position);c.quaternion.copy(o.quaternion);c.scale.copy(o.scale);c.visible=o.visible;if(o===avatar.cape.mesh){if(c.geometry===o.geometry)c.geometry=o.geometry.clone();c.geometry.attributes.position.copy(o.geometry.attributes.position);c.geometry.attributes.position.needsUpdate=true;}});ghost.age=0;ghost.root.visible=true;}
  for(const ghost of ghosts){ghost.age+=dt;ghost.root.visible=!reduced&&ghost.age<.25;ghost.material.opacity=.25*Math.pow(Math.max(0,1-ghost.age/.25),2);}
  const t=impactAge/.3;ring.visible=streaks.visible=t<1;ring.scale.setScalar(.035+t*(reduced?.12:.33));ringMaterial.opacity=(1-t)*.55;streakMaterial.opacity=(1-t)*.65;
  if(t<1)for(let i=0;i<12;i++){const a=i/12*Math.PI*2;dummy.position.copy(impact).addScaledVector(right,Math.cos(a)*t*.22).addScaledVector(forward,Math.sin(a)*t*.22).addScaledVector(up,Math.sin(t*Math.PI)*.025);dummy.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),right.clone().multiplyScalar(Math.cos(a)).addScaledVector(forward,Math.sin(a)));dummy.scale.setScalar((1-t)*(reduced?.3:1));dummy.updateMatrix();streaks.setMatrixAt(i,dummy.matrix);}streaks.instanceMatrix.needsUpdate=true;
 }
 return {group,emit,update,clear(){for(const ghost of ghosts){ghost.age=99;ghost.root.visible=false;}impactAge=99;ring.visible=streaks.visible=false;}};
}
