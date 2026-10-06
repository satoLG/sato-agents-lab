import * as T from '../vendor/three.module.min.js';
import {windMaterial} from './nature-motion.js';
import {createFoliageCloud,createFolioFoliageMaterial} from './folio-foliage.js';

export function seededRandom(seed=761){return ()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};}

export function createGroveResources(detail=true){
 const wood=new T.MeshStandardMaterial({color:'#d3caba',roughness:.96,vertexColors:true});
 return {wood,crownMaterial:createFolioFoliageMaterial(),crownGeometry:createFoliageCloud(detail?80:20)};
}

// Continuous tapered wood, merged once per stand. Seven sides retain the
// simple silhouette; smooth normals remove the joints between cylinder pieces.
function appendWoodTube(positions,normals,colors,indices,curve,radius,tint,steps,base=false){
 const sides=7,offset=positions.length/3,point=new T.Vector3(),normal=new T.Vector3();
 const reference=new T.Vector3(1,0,0),side=new T.Vector3(),across=new T.Vector3();
 for(let j=0;j<=steps;j++){
  const t=j/steps,tangent=curve.getTangent(t).normalize();curve.getPoint(t,point);
  side.crossVectors(tangent,reference).normalize();across.crossVectors(side,tangent).normalize();
  const width=radius*(1-.88*t)*(base?1+.5*Math.exp(-t*28):1);
  for(let k=0;k<sides;k++){
   const angle=k/sides*Math.PI*2;
   normal.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(across,Math.sin(angle));
   positions.push(point.x+normal.x*width,point.y+normal.y*width,point.z+normal.z*width);
   normal.addScaledVector(tangent,radius*.88/curve.getLength()).normalize();normals.push(normal.x,normal.y,normal.z);
   const shade=.97+.025*Math.sin(j*1.8+k*.9);colors.push(tint.r*shade,tint.g*shade,tint.b*shade);
   if(j<steps){const a=offset+j*sides+k,b=offset+j*sides+(k+1)%sides,c=a+sides,d=b+sides;indices.push(a,c,b,c,d,b);}
  }
 }
 for(let k=1;k<sides-1;k++){indices.push(offset,offset+k,offset+k+1);const end=offset+steps*sides;indices.push(end,end+k+1,end+k);}
}

// Each spatial stand is two draws, independent of its number of trees. The
// split into stands retains frustum culling and keeps far foliage out of shadows.
export function createTreeGrove(parent,trees,{seed=77,detail=true,shadows=true,resources=null}={}){
 const group=new T.Group();group.name='sculpted-tree-grove';parent.add(group);
 if(!trees.length)return group;
 const random=seededRandom(seed),dummy=new T.Object3D(),color=new T.Color();
 const {wood,crownMaterial,crownGeometry}=resources||createGroveResources(detail);
 const positions=[],normals=[],colors=[],indices=[];
 const crowns=new T.InstancedMesh(crownGeometry,crownMaterial,trees.length*5);
 let ci=0;
 function woodTint(){return color.setHSL(.09+random()*.03,.08,.72+random()*.13);}
 for(const tree of trees){
  const {x,y=0,z}=tree,h=tree.height??tree.h??5,r=tree.radius??tree.r??1.5;
  const angle=random()*Math.PI*2,lean=.035+random()*.19,bendX=Math.cos(angle)*lean,bendZ=Math.sin(angle)*lean;
  const a=new T.Vector3(x,y-.04,z),b=new T.Vector3(x+bendX*h*.35,y+h*.35,z+bendZ*h*.35),c=new T.Vector3(x+bendX*h*.23,y+h*.68,z+bendZ*h*.8),d=new T.Vector3(x+bendX*h*.8,y+h*.9,z+bendZ*h*.45);
  const trunkRadius=h*(.012+random()*.009);
  const stem=new T.CubicBezierCurve3(a,b,c,d);
  appendWoodTube(positions,normals,colors,indices,stem,trunkRadius,woodTint(),8,true);
  // Preserve the established seeded crown composition while replacing wood.
  woodTint();woodTint();
  // Offset branch junctions and asymmetrical crowns avoid the pole + ball shape.
  const palette=tree.color||['#b4b536','#d99d32','#ef713b','#99af42','#bda64a'][Math.floor(random()*5)],tint=new T.Color(palette);
  for(let k=0;k<5;k++){
   const direction=angle+k*2.399,spread=k===4?.12:r*(.38+random()*.32),cx=c.x+Math.cos(direction)*spread,cz=c.z+Math.sin(direction)*spread,cy=y+h*.76+r*(k===4?.65:random()*.35);
   if(k<3){
    const branchRadius=trunkRadius*(.27+random()*.13),start=stem.getPoint(k%2?1/3:2/3),end=new T.Vector3(cx,cy,cz);
    const shoulder=start.clone().lerp(end,.45);shoulder.y-=h*.035;
    appendWoodTube(positions,normals,colors,indices,new T.CatmullRomCurve3([start,shoulder,end]),branchRadius,woodTint(),3);
   }
   dummy.position.set(cx,cy,cz);dummy.rotation.set(random()*.3,direction,random()*.3);dummy.scale.set(r*(.57+random()*.23),r*(.5+random()*.28),r*(.54+random()*.24));dummy.updateMatrix();crowns.setMatrixAt(ci,dummy.matrix);crowns.setColorAt(ci++,color.copy(tint).multiplyScalar(.8+random()*.35));
  }
  // A restrained flare grounds the trunk without protruding root spokes.
  for(let k=0;k<3;k++)woodTint();
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeBoundingSphere();
 const trunks=new T.Mesh(geometry,wood);
 trunks.name='branching-trunks';crowns.name='wind-canopies';
 crowns.count=ci;
 trunks.castShadow=shadows;trunks.receiveShadow=true;crowns.receiveShadow=true;
 // Wind is shaded in the main pass only. Contact shade provides canopy grounding.
 crowns.computeBoundingSphere();crowns.boundingSphere.radius+=.3;
 for(const mesh of [trunks,crowns]){mesh.userData.dynamic=true;group.add(mesh);}
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
