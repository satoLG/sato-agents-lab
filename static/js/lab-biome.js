import * as T from '../vendor/three.module.min.js';
import {onDeck} from './lab-layout.js';

export const streamZ=x=>-4+Math.sin(x*.095)*4.2;
// Instanced foliage and a single animated water surface keep the lower garden cheap.
export function createLabBiome(hall,art,environment){
 const {mesh,mat,rod,cylinder}=art;
 const garden=new T.Group();garden.name='under-platform-garden';hall.add(garden);
 const soil=environment.soil?.clone();if(soil)soil.repeat.set(20,16);
 const terrainHeight=(x,z)=>{const bank=Math.min(1,Math.max(0,(Math.abs(z-streamZ(x))-1.05)/2));return .10+bank*(.12+.09*Math.sin(x*.7)*Math.cos(z*.6)+.08*Math.sin(x*.23+z*.4));};
 const terrain=new T.PlaneGeometry(63,48,126,96),vertices=terrain.attributes.position;
 for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),z=-vertices.getY(i)-6.2;vertices.setZ(i,terrainHeight(x,z)-.12);}terrain.computeVertexNormals();
 const ground=mesh(garden,terrain,new T.MeshStandardMaterial({color:'#34442b',map:soil,roughness:1}),0,.12,-6.2);ground.rotation.x=-Math.PI/2;
 const river=new T.BufferGeometry(),positions=[],uvs=[],indices=[];
 for(let i=0;i<=96;i++)for(const side of [-1,1]){const x=-31.4+i*62.8/96;positions.push(x,.145,streamZ(x)+side*1.05);uvs.push(i/8,(side+1)/2);}
 for(let i=0;i<96;i++){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
 river.setAttribute('position',new T.Float32BufferAttribute(positions,3));river.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));river.setIndex(indices);river.computeVertexNormals();
 const clock={value:0},water=new T.MeshStandardMaterial({color:'#337c78',metalness:.28,roughness:.22,transparent:true,opacity:.88,side:T.DoubleSide});
 water.onBeforeCompile=shader=>{
  shader.uniforms.streamTime=clock;
  shader.fragmentShader='uniform float streamTime;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor += .08 * sin(vMapUv.x * 28.0 - streamTime * 1.6 + sin(vMapUv.y * 18.0));');
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal.xy += vec2(cos(vMapUv.x * 25.0 - streamTime * 2.2), sin(vMapUv.y * 22.0 + vMapUv.x * 14.0 - streamTime * 1.4)) * .16; normal = normalize(normal);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat ripple = sin(vMapUv.x * 32.0 - streamTime * 1.8 + sin(vMapUv.y * 24.0)); float foam = smoothstep(.87, 1.0, abs(vMapUv.y * 2.0 - 1.0)) * (.6 + .4 * ripple); diffuseColor.rgb = mix(diffuseColor.rgb * (.85 + .15 * ripple), vec3(.62,.83,.78), foam * .5);');
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
   dummy.position.set(x+Math.sin(a)*r,terrainHeight(x,z)+.1+height*.4,z+Math.cos(a)*r);dummy.rotation.set(Math.cos(a)*.65,a,Math.sin(a)*.65);dummy.scale.set(.1+random()*.07,height*.6,.032);dummy.updateMatrix();leaves.setMatrixAt(count,dummy.matrix);leaves.setColorAt(count++,color.setHSL(.23+random()*.09,.25+random()*.25,.18+random()*.18));
  }
 }
 leaves.count=count;leaves.name='garden-ferns';leaves.castShadow=true;leaves.receiveShadow=true;garden.add(leaves);
 for(let i=0;i<120;i++){
  const x=-31+random()*62,side=i%2?1:-1,z=streamZ(x)+side*(1.2+random()*.7);
  dummy.position.set(x,terrainHeight(x,z)+.04,z);dummy.rotation.set(random(),random()*6,random());dummy.scale.set(.25+random()*.45,.12+random()*.22,.22+random()*.25);dummy.updateMatrix();rocks.setMatrixAt(stones++,dummy.matrix);
 }
 rocks.receiveShadow=true;garden.add(rocks);
 // Small trees occupy open garden gaps; crowns stay clear of walking decks.
 for(const [x,z]of [[-14,-12],[14,1],[14,-7],[-29,-7],[30,-6],[9,16]]){
  if([[0,0],[-1.7,0],[1.7,0],[0,-1.7],[0,1.7]].some(([dx,dz])=>onDeck(x+dx,z+dz))||Math.abs(z-streamZ(x))<2)continue;
  const tree=new T.Group();tree.name='garden-tree';tree.position.set(x,terrainHeight(x,z),z);garden.add(tree);
  const height=2.1+random()*.7;cylinder(tree,.12,height,mat('#66513c',.02,.95),0,height/2,0);
  for(let i=0;i<5;i++){const a=i*2.4,px=Math.sin(a)*.55,pz=Math.cos(a)*.55,py=height-.4+random()*.65;rod(tree,[0,height*.62,0],[px,py,pz],.055,mat('#66513c'));
   const crown=mesh(tree,new T.IcosahedronGeometry(.78,2),mat(i%2?'#567c43':'#71964d',0,.9),px,py,pz);crown.scale.set(1,.85,1);}
 }
 return {tick(t){clock.value=t;},streamAt(position){return {x:position.x,z:streamZ(position.x)};}};
}
