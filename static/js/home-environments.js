import * as T from '../vendor/three.module.min.js';
import {createChamberMaterials,createExteriorFade} from './lab-chamber-materials.js';
import {createGardenTree,createRockMaterial} from './lab-nature.js';
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
 const sky=new T.Mesh(new T.BoxGeometry(24,24,24),materials);sky.name=`${kind}-skybox`;sky.renderOrder=-10;sky.visible=false;return sky;
}
function forestTerrain(){
 const segments=64,rings=12,positions=[0,-.025,-.75],uvs=[.5,.5],indices=[];
 for(let j=1;j<=rings;j++)for(let i=0;i<segments;i++){
  const angle=i*Math.PI*2/segments,f=j/rings,r=f*(3.2+.13*Math.sin(angle*3)+.09*Math.sin(angle*7));
  const x=Math.cos(angle)*r,z=Math.sin(angle)*r;
  const height=-.07+f*(.055*Math.sin(x*2.1+z)+.06*Math.cos(z*2.8-x)+.035*Math.sin(x*5+z*3));
  positions.push(x,height,z-.75);uvs.push(x/6.8+.5,z/6.8+.5);
  if(j===1)indices.push(0,1+(i+1)%segments,1+i);
  else{const a=1+(j-2)*segments+i,b=1+(j-2)*segments+(i+1)%segments,c=a+segments,d=b+segments;indices.push(a,b,c,b,d,c);}
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
// Reuse the lab's finishes, garden assets and existing forest-floor photograph.
export async function createMiniEnvironment(kind,art){
 const root=new T.Group();root.name=`companion-${kind}`;root.scale.setScalar(kind==='lab'?.52:.58);
 const {box,cylinder,ring,sphere,mat,glow}=art;
 if(kind==='lab'){
  const chamber=createChamberMaterials();
  const floor=chamber.floor.clone();floor.map=chamber.floor.map.clone();floor.map.repeat.set(3,2);
  box(root,5.8,.09,3.7,floor,0,-.09,-.8);
  box(root,5.8,4.2,.12,chamber.wall(5.8,4.2),0,2.05,-2.5);
  for(const x of [-2.75,2.75]){
   box(root,.16,4.2,.3,chamber.equipment('#526e61',.65),x,2.05,-2.35);
   box(root,.045,3.5,.035,glow('#76d9ff'),x,2.05,-2.17);
  }
  const desk=new T.Group();desk.position.set(-1.65,0,-1.7);root.add(desk);
  box(desk,1.45,.12,.65,chamber.equipment('#c7d3c7'),0,.76,0);
  for(const x of [-.5,.5])box(desk,.11,.76,.5,chamber.equipment('#384f5e'),x,.36,0);
  box(desk,1.08,.63,.12,chamber.equipment('#26333e'),0,1.15,-.08);
  box(desk,.95,.49,.02,mat('#10232e'),0,1.15,0);
  for(let i=0;i<4;i++)box(desk,.45+i*.08,.018,.025,glow(i%2?'#76d9ff':'#79cbb3'),-.12,1.32-i*.1,.018);
  const cabinet=chamber.equipment('#435d54');box(root,.8,1.8,.68,cabinet,2,.86,-1.8);
  for(let i=0;i<6;i++){box(root,.65,.15,.04,chamber.equipment('#24333c'),2,.3+i*.23,-1.44);sphere(root,.025,glow('#76d9ff'),2.24,.3+i*.23,-1.4);}
 }else if(kind==='forest'){
  const map=await new T.TextureLoader().loadAsync(new URL('../textures/polyhaven/forest-floor.jpg',import.meta.url).href);
  map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(3,3);map.anisotropy=4;
  const bump=map.clone();bump.colorSpace=T.NoColorSpace;
  const terrain=art.mesh(root,forestTerrain(),new T.MeshStandardMaterial({map,bumpMap:bump,bumpScale:.045,roughness:1,color:'#c0c1a5'}));terrain.name='forest-terrain';
  for(const [x,z,height,radius]of [[-2.35,-1.55,3.2,1.05],[2.45,-1.75,3.65,1.2],[-.55,-2.75,3.9,1.1]])createGardenTree(root,art,{x,y:-.05,z,height,radius});
  for(const [x,z,r]of [[-1.75,.15,.38],[2,.2,.42],[1.15,-2,.3]]){
   const rock=sphere(root,r,createRockMaterial(),x,.06,z,[1.5,.65,1]);rock.rotation.y=x;
  }
  for(const x of [-2.25,1.8]){cylinder(root,.035,.32,mat('#b8a17e',0,1),x,.05,.45);sphere(root,.12,mat('#aa7351',0,.9),x,.23,.45,[1,.45,1]);}
 }
 batchStatic(root);
 const fade=createExteriorFade(root);fade(1);
 const skybox=createSkybox(kind);
 return {root,skybox,setLevel(level){fade(1-level);skybox.visible=level>.002;skybox.material.forEach(material=>material.color.setScalar(level));}};
}
