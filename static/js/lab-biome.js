import * as T from '../vendor/three.module.min.js';
import {onDeck} from './lab-layout.js';

export const streamZ=x=>-4+Math.sin(x*.095)*4.2;
// Instanced foliage and a single animated water surface keep the lower garden cheap.
export function createLabBiome(hall,art,environment){
 const {mesh,mat,rod}=art;
 const garden=new T.Group();garden.name='under-platform-garden';hall.add(garden);
 const soil=environment.soil?.clone();if(soil)soil.repeat.set(20,16);
 const ground=mesh(garden,new T.PlaneGeometry(63,48),new T.MeshStandardMaterial({color:'#34442b',map:soil,roughness:1}),0,.12,-6.2);ground.rotation.x=-Math.PI/2;
 const river=new T.BufferGeometry(),positions=[],uvs=[],indices=[];
 for(let i=0;i<=96;i++)for(const side of [-1,1]){const x=-31.4+i*62.8/96;positions.push(x,.145,streamZ(x)+side*1.05);uvs.push(i/8,(side+1)/2);}
 for(let i=0;i<96;i++){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
 river.setAttribute('position',new T.Float32BufferAttribute(positions,3));river.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));river.setIndex(indices);river.computeVertexNormals();
 const clock={value:0},water=new T.MeshStandardMaterial({color:'#337c78',metalness:.28,roughness:.18,transparent:true,opacity:.88,side:T.DoubleSide});
 water.onBeforeCompile=shader=>{
  shader.uniforms.streamTime=clock;
  shader.fragmentShader='uniform float streamTime;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor += .08 * sin(vMapUv.x * 28.0 - streamTime * 1.6 + sin(vMapUv.y * 18.0));');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= .88 + .12 * sin(vMapUv.x * 32.0 - streamTime * 1.8 + sin(vMapUv.y * 24.0));');
 };
 // UVs are needed by the ripple shader even without an image texture.
 const c=document.createElement('canvas');c.width=c.height=2;c.getContext('2d').fillRect(0,0,2,2);const map=new T.CanvasTexture(c);map.image.getContext('2d').fillStyle='white';map.image.getContext('2d').fillRect(0,0,2,2);water.map=map;
 const creek=mesh(garden,river,water);creek.name='laboratory-stream';creek.userData.dynamic=true;
 let seed=714;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 const leaves=new T.InstancedMesh(new T.SphereGeometry(1,8,5),new T.MeshStandardMaterial({color:'#77975a',roughness:.83,side:T.DoubleSide}),3600);
 const rocks=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),mat('#647168',.05,.92),120);
 const dummy=new T.Object3D(),color=new T.Color();let count=0,stones=0;
 for(let i=0;i<400;i++){
  const x=-30+random()*60,z=-29+random()*44,near=Math.abs(z-streamZ(x));if(near<1.2)continue;
  const height=onDeck(x,z)? .45+random()*.3:.8+random()*.85;
  for(let j=0;j<9;j++){
   const a=j*Math.PI*2/9+random()*.3,r=.2+random()*.45;
   dummy.position.set(x+Math.sin(a)*r,.22+height*.4,z+Math.cos(a)*r);dummy.rotation.set(Math.cos(a)*.65,a,Math.sin(a)*.65);dummy.scale.set(.1+random()*.07,height*.6,.032);dummy.updateMatrix();leaves.setMatrixAt(count,dummy.matrix);leaves.setColorAt(count++,color.setHSL(.23+random()*.09,.25+random()*.25,.18+random()*.18));
  }
 }
 leaves.count=count;leaves.name='garden-ferns';leaves.castShadow=true;leaves.receiveShadow=true;garden.add(leaves);
 for(let i=0;i<120;i++){
  const x=-31+random()*62,side=i%2?1:-1,z=streamZ(x)+side*(1.2+random()*.7);
  dummy.position.set(x,.12,z);dummy.rotation.set(random(),random()*6,random());dummy.scale.set(.25+random()*.45,.12+random()*.22,.22+random()*.25);dummy.updateMatrix();rocks.setMatrixAt(stones++,dummy.matrix);
 }
 rocks.receiveShadow=true;garden.add(rocks);
 // Tall vines live on the outer walls, clear of the navigation deck.
 for(const x of [-31,31])for(let z=-27;z<16;z+=4.2){
  rod(garden,[x,-.1,z],[x*.985,3.2,z+.6],.05,mat('#3d5942'));
  for(let i=0;i<5;i++){const leaf=mesh(garden,new T.SphereGeometry(1,8,5),mat('#46694b'),x*.99,.5+i*.52,z+.12*i);leaf.scale.set(.22,.42,.055);leaf.rotation.z=(i%2?1:-1)*.8;}
 }
 return {tick(t){clock.value=t;},streamAt(position){return {x:position.x,z:streamZ(position.x)};}};
}
