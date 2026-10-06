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
 const sky=new T.Mesh(new T.BoxGeometry(140,140,140),materials);sky.name=`${kind}-skybox`;sky.renderOrder=-10;sky.visible=false;return sky;
}
function forestTerrain(){
 const segments=80,rings=24,positions=[0,-.08,-10],uvs=[.5,.5],indices=[];
 for(let j=1;j<=rings;j++)for(let i=0;i<segments;i++){
  const angle=i*Math.PI*2/segments,f=j/rings,r=f*(32+.4*Math.sin(angle*3));
  const x=Math.cos(angle)*r,z=Math.sin(angle)*r-10;
  const height=-.13+.045*Math.sin(x*.6+z)+.055*Math.cos(z*.7-x*.4);
  positions.push(x,height,z);uvs.push(x/64+.5,z/64+.5);
  if(j===1)indices.push(0,1+(i+1)%segments,1+i);
  else{const a=1+(j-2)*segments+i,b=1+(j-2)*segments+(i+1)%segments,c=a+segments,d=b+segments;indices.push(a,b,c,b,d,c);}
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function forestHorizon(root,art){
 // Soft, blue forest silhouettes fill the distance without hundreds of meshes.
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d');ctx.fillStyle='#b2cbd5';ctx.fillRect(0,0,1024,512);
 for(let layer=0;layer<3;layer++){ctx.filter=`blur(${18-layer*3}px)`;ctx.fillStyle=['#8faeba','#71949e','#567d83'][layer];for(let i=0;i<60;i++){const x=i*18-20+(layer%2)*9,y=110+layer*70+Math.sin(i*2.7)*32;ctx.beginPath();ctx.ellipse(x,y,18+Math.sin(i)*5,45+i%5*9,0,0,Math.PI*2);ctx.fill();ctx.fillRect(x-7,y,14,512-y);}}
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
 const horizon=art.mesh(root,new T.PlaneGeometry(90,24),new T.MeshBasicMaterial({map,color:'#a4bfce'}),0,9,-30);horizon.name='distant-forest';
}
function forestRiver(root,art){
 const points=[];for(let i=0;i<=22;i++){const z=-3-i*.9,x=2.1+Math.sin(i*.29)*1.8;points.push(x-.42,-.055,z,x+.42,-.055,z);}
 const indices=[];for(let i=0;i<22;i++){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(points,3));geo.setIndex(indices);geo.computeVertexNormals();
 const river=art.mesh(root,geo,new T.MeshStandardMaterial({color:'#28617a',metalness:.4,roughness:.35,side:T.DoubleSide}));river.name='forest-river';
}
// Reuse the lab's finishes, garden assets and existing forest-floor photograph.
export async function createMiniEnvironment(kind,art){
 const root=new T.Group();root.name=`companion-${kind}`;root.scale.setScalar(.86);
 const {box,cylinder,ring,sphere,mat,glow}=art;
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
  for(const x of [-6,6]){box(root,2.6,2.3,1,chamber.equipment('#7d8c98'),x,1.05,-14);for(let i=0;i<5;i++)box(root,2.1,.08,.04,mat('#a9c4d5'),x,.5+i*.35,-13.48);}
 }else if(kind==='forest'){
  const map=await new T.TextureLoader().loadAsync(new URL('../textures/polyhaven/forest-floor.jpg',import.meta.url).href);
  map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(28,28);map.anisotropy=4;
  const bump=map.clone();bump.colorSpace=T.NoColorSpace;
  const terrain=art.mesh(root,forestTerrain(),new T.MeshStandardMaterial({map,bumpMap:bump,bumpScale:.045,roughness:1,color:'#c0c1a5'}));terrain.name='forest-terrain';
  for(const [x,z,height,radius]of [[-2.9,-2.1,4.8,1.35],[3.6,-2.7,5.3,1.5],[-1.7,-5,4.8,1.3]])createGardenTree(root,art,{x,y:-.12,z,height,radius});
  for(let row=0;row<3;row++)for(let i=0;i<5;i++)createGardenTree(root,art,{x:(i-2)*3.2+(row%2)*1.5,y:-.12,z:-8-row*6-(i%2),height:5.3+(i%3)*.65+row*.3,radius:1.35+(row*.12)});
  forestHorizon(root,art);forestRiver(root,art);
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
