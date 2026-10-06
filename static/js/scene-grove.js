import * as T from '../vendor/three.module.min.js';
import {windMaterial} from './nature-motion.js';
import {createFoliageCloud,createFolioFoliageMaterial} from './folio-foliage.js';

export function seededRandom(seed=761){return ()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};}

export function createGroveResources(detail=true){
 const wood=new T.MeshStandardMaterial({color:'#d3caba',roughness:.96,flatShading:true});
 return {wood,crownMaterial:createFolioFoliageMaterial(),trunkGeometry:new T.CylinderGeometry(.58,1,1,7,1),crownGeometry:createFoliageCloud(detail?80:20)};
}

// Each spatial stand is two draws, independent of its number of trees. The
// split into stands retains frustum culling and keeps far foliage out of shadows.
export function createTreeGrove(parent,trees,{seed=77,detail=true,shadows=true,resources=null}={}){
 const group=new T.Group();group.name='sculpted-tree-grove';parent.add(group);
 if(!trees.length)return group;
 const random=seededRandom(seed),dummy=new T.Object3D(),up=new T.Vector3(0,1,0),color=new T.Color();
 const {wood,crownMaterial,trunkGeometry,crownGeometry}=resources||createGroveResources(detail);
 const trunks=new T.InstancedMesh(trunkGeometry,wood,trees.length*9);
 const crowns=new T.InstancedMesh(crownGeometry,crownMaterial,trees.length*5);
 let ti=0,ci=0;
 function segment(a,b,r){
  const delta=b.clone().sub(a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(up,delta.normalize());dummy.scale.set(r,a.distanceTo(b),r);dummy.updateMatrix();trunks.setMatrixAt(ti,dummy.matrix);trunks.setColorAt(ti++,color.setHSL(.09+random()*.03,.08,.72+random()*.13));
 }
 for(const tree of trees){
  const {x,y=0,z}=tree,h=tree.height??tree.h??5,r=tree.radius??tree.r??1.5;
  const angle=random()*Math.PI*2,lean=.035+random()*.19,bendX=Math.cos(angle)*lean,bendZ=Math.sin(angle)*lean;
  const a=new T.Vector3(x,y-.04,z),b=new T.Vector3(x+bendX*h*.35,y+h*.35,z+bendZ*h*.35),c=new T.Vector3(x+bendX*h*.23,y+h*.68,z+bendZ*h*.8),d=new T.Vector3(x+bendX*h*.8,y+h*.9,z+bendZ*h*.45);
  const trunkRadius=h*(.012+random()*.009);
  segment(a,b,trunkRadius);segment(b,c,trunkRadius*.65);segment(c,d,trunkRadius*.42);
  // Offset branch junctions and asymmetrical crowns avoid the pole + ball shape.
  const palette=tree.color||['#b4b536','#d99d32','#ef713b','#99af42','#bda64a'][Math.floor(random()*5)],tint=new T.Color(palette);
  for(let k=0;k<5;k++){
   const direction=angle+k*2.399,spread=k===4?.12:r*(.38+random()*.32),cx=c.x+Math.cos(direction)*spread,cz=c.z+Math.sin(direction)*spread,cy=y+h*.76+r*(k===4?.65:random()*.35);
   if(k<3)segment(k%2?b:c,new T.Vector3(cx,cy,cz),trunkRadius*(.27+random()*.13));
   dummy.position.set(cx,cy,cz);dummy.rotation.set(random()*.3,direction,random()*.3);dummy.scale.set(r*(.57+random()*.23),r*(.5+random()*.28),r*(.54+random()*.24));dummy.updateMatrix();crowns.setMatrixAt(ci,dummy.matrix);crowns.setColorAt(ci++,color.copy(tint).multiplyScalar(.8+random()*.35));
  }
  for(let k=0;k<3;k++){
   const direction=angle+k*2.1;segment(new T.Vector3(x,y+.21,z),new T.Vector3(x+Math.cos(direction)*trunkRadius*3.5,y+.02,z+Math.sin(direction)*trunkRadius*3.5),trunkRadius*.53);
  }
 }
 trunks.name='branching-trunks';crowns.name='wind-canopies';
 trunks.count=ti;crowns.count=ci;
 trunks.castShadow=shadows;trunks.receiveShadow=true;crowns.receiveShadow=true;
 // Wind is shaded in the main pass only. Contact shade provides canopy grounding.
 for(const mesh of [trunks,crowns]){mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.3;mesh.userData.dynamic=true;group.add(mesh);}
 return group;
}

export function createMeadow(parent,patches,{seed=123}={}){
 const random=seededRandom(seed),dummy=new T.Object3D(),color=new T.Color();
 const material=windMaterial(new T.MeshBasicMaterial({color:'#ffffff',side:T.DoubleSide,toneMapped:false}),{strength:.055,anchored:true});
 const breeze=material.onBeforeCompile;
 material.onBeforeCompile=(shader,renderer)=>{
  breeze.call(material,shader,renderer);
  shader.vertexShader='varying float bladeTip;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nbladeTip=position.y;');
  shader.fragmentShader='varying float bladeTip;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(vec3(.4,.38,.22),vec3(1.08,1.,.65),smoothstep(0.,1.,bladeTip));');
 };
 material.customProgramCacheKey=()=> 'folio-grass-tips-v1';
 const geometry=new T.BufferGeometry();
 // The reference uses one triangle per blade, with a grounded base and wind at
 // the tip. Dense patches are cheaper than the old broad, folded quads.
 geometry.setAttribute('position',new T.Float32BufferAttribute([-.09,0,0,.09,0,0,.11,1,.10],3));geometry.setAttribute('normal',new T.Float32BufferAttribute([0,1,0,0,1,0,0,1,0],3));
 const mesh=new T.InstancedMesh(geometry,material,patches.length*9);let n=0;
 for(const {x,y,z,size=.45} of patches)for(let k=0;k<9;k++){
  dummy.position.set(x+(random()-.5)*size*2,y,z+(random()-.5)*size*2);dummy.rotation.set(0,random()*Math.PI*2,(random()-.5)*.4);dummy.scale.setScalar(size*(.55+random()*.8));dummy.updateMatrix();mesh.setMatrixAt(n,dummy.matrix);mesh.setColorAt(n++,color.setHSL(.17+random()*.065,.50+random()*.18,.27+random()*.12));
 }
 mesh.name='wind-meadow';mesh.receiveShadow=true;mesh.computeBoundingSphere();if(mesh.boundingSphere)mesh.boundingSphere.radius+=.2;parent.add(mesh);return mesh;
}

export function createShrubs(parent,patches,resources){
 const mesh=new T.InstancedMesh(resources.crownGeometry,resources.crownMaterial,patches.length),dummy=new T.Object3D(),color=new T.Color();
 patches.forEach(({x,y,z,size=.6,tint='#b4b536'},i)=>{dummy.position.set(x,y+size*.5,z);dummy.rotation.y=i*2.399;dummy.scale.set(size,size*.6,size*.8);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,color.set(tint));});
 mesh.name='leaf-cloud-understory';mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.2;parent.add(mesh);return mesh;
}

export function createContactShadows(parent,patches){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,2,32,32,32);gradient.addColorStop(0,'#142c27aa');gradient.addColorStop(.45,'#142c2755');gradient.addColorStop(1,'#142c2700');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
 const map=new T.CanvasTexture(canvas),material=new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,opacity:.6,polygonOffset:true,polygonOffsetFactor:-1});
 const geometry=new T.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);
 const mesh=new T.InstancedMesh(geometry,material,patches.length),dummy=new T.Object3D();
 patches.forEach(({x,y,z,radius=1},i)=>{dummy.position.set(x,y+.012,z);dummy.scale.set(radius*3,1,radius*2.4);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
 mesh.name='soft-contact-shadows';mesh.renderOrder=1;parent.add(mesh);return mesh;
}
