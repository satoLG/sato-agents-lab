import * as T from '../vendor/three.module.min.js';
import {createExteriorFade} from './lab-chamber-materials.js';
import {createHomeForest} from './home-forest.js';
import {createHomeLaboratory} from './home-laboratory.js';
import {batchStatic} from './lab-batch.js';

// Small cube faces form a real skybox, with a continuous horizon on every side.
function createSkybox(kind){
 const size=128,faces=[];
 const zenith=new T.Color(kind==='lab'?'#e1e6e9':'#428ecb'),horizon=new T.Color(kind==='lab'?'#f4f5f5':'#a8c8cf'),ground=new T.Color(kind==='lab'?'#cbd2d7':'#a8c8cf');
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
 const materials=faces.map(canvas=>{const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;return new T.MeshBasicMaterial({map,side:T.BackSide,depthWrite:false,toneMapped:false,fog:false});});
 const sky=new T.Mesh(new T.BoxGeometry(140,140,140),materials);sky.name=`${kind}-skybox`;sky.renderOrder=-10;sky.visible=false;return sky;
}
// Reuse the lab's finishes, garden assets and existing forest-floor photograph.
export async function createMiniEnvironment(kind,art){
 const root=new T.Group();root.name=`companion-${kind}`;
 let nature=null;
 if(kind==='lab'){
  nature=createHomeLaboratory(root,art);
 }else if(kind==='forest'){
  nature=await createHomeForest(root,art);
 }
 batchStatic(root);
 const fade=createExteriorFade(root);fade(1);
 const skybox=createSkybox(kind);
 return {root,skybox,navigation:nature?.navigation,groundHeight:nature?.groundHeight,tick(t){nature?.tick?.(t);},setLevel(level){fade(1-level);skybox.visible=level>.002;skybox.material.forEach(material=>material.color.setScalar(level));}};
}
