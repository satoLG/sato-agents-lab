import * as T from '../vendor/three.module.min.js';
import {createChamberMaterials,createExteriorFade} from './lab-chamber-materials.js';
import {createHomeForest} from './home-forest.js';
import {createContactShadows,createMeadow} from './scene-grove.js';
import {batchStatic} from './lab-batch.js';

// Small cube faces form a real skybox, with a continuous horizon on every side.
function createSkybox(kind){
 const size=128,faces=[];
 const zenith=new T.Color(kind==='lab'?'#e1e6e9':'#428ecb'),horizon=new T.Color(kind==='lab'?'#f4f5f5':'#e6f0f1'),ground=new T.Color(kind==='lab'?'#cbd2d7':'#a0bba2');
 const cloud=new T.Color('#ffffff'),color=new T.Color(),direction=new T.Vector3();
 for(let face=0;face<6;face++){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const u=2*(x+.5)/size-1,v=1-2*(y+.5)/size;
   if(face===0)direction.set(1,v,-u);else if(face===1)direction.set(-1,v,u);else if(face===2)direction.set(u,1,-v);else if(face===3)direction.set(u,-1,v);else if(face===4)direction.set(u,v,1);else direction.set(-u,v,-1);
   direction.normalize();const h=direction.y;color.copy(horizon).lerp(h>0?zenith:ground,Math.min(1,Math.abs(h)*(kind==='lab'?1.35:2.35)));
   if(kind==='forest'&&h>0){
    const cloudBand=Math.exp(-Math.pow((h-.32)/.15,2)),wisps=Math.sin(direction.x*15+direction.z*5)+Math.sin(direction.z*19-direction.x*9)+Math.sin(direction.x*35+direction.z*27)*.35;
    color.lerp(cloud,cloudBand*T.MathUtils.smoothstep(wisps,-.1,1.5)*.72);
   }
   color.convertLinearToSRGB();const i=(y*size+x)*4;pixels.data[i]=color.r*255;pixels.data[i+1]=color.g*255;pixels.data[i+2]=color.b*255;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);faces.push(canvas);
 }
 // An enclosing cube fills an orthographic view as well as a perspective one.
 const materials=faces.map(canvas=>{const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;return new T.MeshBasicMaterial({map,side:T.BackSide,depthWrite:false,toneMapped:false});});
 const sky=new T.Mesh(new T.BoxGeometry(140,140,140),materials);sky.name=`${kind}-skybox`;sky.renderOrder=-10;sky.visible=false;return sky;
}
// Reuse the lab's finishes, garden assets and existing forest-floor photograph.
export async function createMiniEnvironment(kind,art){
 const root=new T.Group();root.name=`companion-${kind}`;root.scale.setScalar(.86);
 let nature=null;
 const {box,sphere,mat,glow}=art;
 if(kind==='lab'){
  const chamber=createChamberMaterials();
  const floor=chamber.floor.clone();floor.map=chamber.floor.map.clone();floor.map.repeat.set(18,20);
  const ground=box(root,70,.09,64,floor,0,-.14,-16);ground.name='lab-floor';
  const wall=box(root,70,12,.18,chamber.wall(70,12),0,5.8,-24);wall.name='lab-distant-wall';
  for(const x of [-16,-8,0,8,16]){
   box(root,.22,12,.3,chamber.equipment('#526e61',.65),x,5.8,-23.8);
   box(root,.08,9,.05,glow('#b8d8f2'),x,5.8,-23.6);
  }
  for(const x of [-9,9]){box(root,.24,8,.28,chamber.equipment('#717e86'),x,3.9,-10);box(root,18,.18,.28,chamber.equipment('#717e86'),0,7.8,-10);}
  const desk=new T.Group();desk.position.set(-2.4,0,-3.4);root.add(desk);
  box(desk,1.45,.12,.65,chamber.equipment('#c7d3c7'),0,.76,0);
  for(const x of [-.5,.5])box(desk,.11,.76,.5,chamber.equipment('#384f5e'),x,.36,0);
  box(desk,1.08,.63,.12,chamber.equipment('#26333e'),0,1.15,-.08);
  box(desk,.95,.49,.02,mat('#10232e'),0,1.15,0);
  for(let i=0;i<4;i++)box(desk,.45+i*.08,.018,.025,glow(i%2?'#76d9ff':'#79cbb3'),-.12,1.32-i*.1,.018);
  const cabinet=chamber.equipment('#435d54');box(root,.8,1.8,.68,cabinet,2.5,.86,-3.6);
  for(let i=0;i<6;i++){box(root,.65,.15,.04,chamber.equipment('#24333c'),2.5,.3+i*.23,-3.24);sphere(root,.025,glow('#76d9ff'),2.74,.3+i*.23,-3.2);}
  createContactShadows(root,[{x:-2.4,y:-.089,z:-3.4,radius:1.5},{x:2.5,y:-.089,z:-3.6,radius:1.1}]);
  // Recessed plinths, warm task lights and repeated wall bays give scale/depth.
  for(const x of [-4.7,4.7]){
   box(root,2.2,.16,1.2,chamber.equipment('#273b44'),x,-.015,-5.8);
   box(root,2.1,.5,1.1,chamber.equipment('#8b9999'),x,.25,-5.8);
   box(root,2.13,.065,1.13,chamber.equipment('#dae3df'),x,.53,-5.8);
   const patches=[];for(let i=0;i<18;i++)patches.push({x:x+(i%6-2.5)*.31,y:.56,z:-5.8+(Math.floor(i/6)-1)*.3,size:.27+(i%3)*.13});createMeadow(root,patches);
  }
  for(const z of [-7,-13,-19])for(const x of [-11,11]){
   box(root,.32,6.7,.4,chamber.equipment('#536875'),x,3.22,z);
   box(root,.055,5.7,.05,glow('#bbe3de'),x+(x<0?.18:-.18),3.4,z+.22);
   box(root,4.4,.13,1.2,chamber.equipment('#e4e7df'),x*.68,5.7,z);
   box(root,3.8,.028,.45,glow('#f3dfb3'),x*.68,5.61,z);
  }
  for(const x of [-6,6]){box(root,2.6,2.3,1,chamber.equipment('#7d8c98'),x,1.05,-14);for(let i=0;i<5;i++)box(root,2.1,.08,.04,mat('#a9c4d5'),x,.5+i*.35,-13.48);}
 }else if(kind==='forest'){
  nature=await createHomeForest(root,art);
 }
 batchStatic(root);
 const fade=createExteriorFade(root);fade(1);
 const skybox=createSkybox(kind);
 return {root,skybox,tick(t){nature?.tick(t);},setLevel(level){fade(1-level);skybox.visible=level>.002;skybox.material.forEach(material=>material.color.setScalar(level));}};
}
