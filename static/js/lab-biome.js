import * as T from '../vendor/three.module.min.js';
import {onDeck} from './lab-layout.js';
import {createGardenTree,createRockMaterial,createFoliageMaterial} from './lab-nature.js';

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
 const clock={value:0},water=new T.MeshPhysicalMaterial({color:'#397974',metalness:.08,roughness:.19,transparent:true,opacity:.91,side:T.DoubleSide,clearcoat:1,clearcoatRoughness:.14,envMapIntensity:.9});
 water.onBeforeCompile=shader=>{
  shader.uniforms.streamTime=clock;
  shader.vertexShader='varying vec2 vRiver;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRiver=uv;');
  shader.fragmentShader='uniform float streamTime; varying vec2 vRiver;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    vec2 p=vec2(vRiver.x*5.2,vRiver.y*2.1);
    float a=p.x*3.1+p.y*4.7-streamTime*1.8;
    float b=p.x*7.3-p.y*5.2-streamTime*2.6;
    vec2 slope=vec2(cos(a)*.065+cos(b)*.035,cos(a)*.045-cos(b)*.025);
    normal=normalize(normal+vec3(slope,0.));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float bank=abs(vRiver.y*2.-1.);
    float depth=1.-smoothstep(.38,.98,bank);
    diffuseColor.rgb=mix(vec3(.19,.34,.28),vec3(.055,.19,.21),depth*.8);
    float edgeFoam=smoothstep(.94,1.,bank)*(.3+.7*pow(.5+.5*sin(vRiver.x*26.-streamTime*1.5),3.));
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.65,.74,.63),edgeFoam*.24);`);
 };
 water.customProgramCacheKey=()=> 'river-ripples-v2';
 const creek=mesh(garden,river,water);creek.name='laboratory-stream';creek.userData.dynamic=true;
 let seed=714;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 const leaves=new T.InstancedMesh(new T.PlaneGeometry(1,1),createFoliageMaterial(),1200);
 const rocks=new T.InstancedMesh(new T.IcosahedronGeometry(1,2),createRockMaterial(),120);
 const rockVertices=rocks.geometry.attributes.position;
 for(let i=0;i<rockVertices.count;i++){const x=rockVertices.getX(i),y=rockVertices.getY(i),z=rockVertices.getZ(i),relief=1+.10*Math.sin(x*13+z*7)*Math.cos(y*9);rockVertices.setXYZ(i,x*relief,y*relief,z*relief);}rocks.geometry.computeVertexNormals();
 const dummy=new T.Object3D(),color=new T.Color();let count=0,stones=0;
 for(let i=0;i<400;i++){
  const x=-30+random()*60,z=-29+random()*44,near=Math.abs(z-streamZ(x));if(near<1.2)continue;
  const height=onDeck(x,z)? .45+random()*.3:.8+random()*.85;
  for(let j=0;j<3;j++){
   const a=j*Math.PI*2/3+random()*.3,r=.2+random()*.45;
   dummy.position.set(x+Math.sin(a)*r,terrainHeight(x,z)+.1+height*.4,z+Math.cos(a)*r);dummy.rotation.set(Math.cos(a)*.65,a,Math.sin(a)*.65);dummy.scale.set(height*1.1,height,1);dummy.updateMatrix();leaves.setMatrixAt(count,dummy.matrix);leaves.setColorAt(count++,color.setHSL(.2+random()*.06,.25,.45+random()*.2));
  }
 }
 leaves.count=count;leaves.name='garden-ferns';leaves.castShadow=true;leaves.receiveShadow=true;garden.add(leaves);
 for(let i=0;i<120;i++){
  const x=-31+random()*62,side=i%2?1:-1,z=streamZ(x)+side*(1.2+random()*.7);
  dummy.position.set(x,terrainHeight(x,z)+.04,z);dummy.rotation.set(random(),random()*6,random());dummy.scale.set(.25+random()*.45,.12+random()*.22,.22+random()*.25);dummy.updateMatrix();rocks.setMatrixAt(stones,dummy.matrix);rocks.setColorAt(stones++,color.setHSL(.12+random()*.06,.07+random()*.08,.3+random()*.14));
 }
 rocks.receiveShadow=true;garden.add(rocks);
 // Canopies remain inside open garden pockets, clear of the deck and walls.
 for(const [x,z,height,radius,vines]of [[-14,-12,3.4,1.2,false],[14,-6.8,5.2,1.55,true],[-29,-7,3.3,1.1,false],[29,-6,3.7,1.2,false],[9,16,3.5,1.1,false]]){
  const crown=radius*1.65;
  if([[0,0],[-crown,0],[crown,0],[0,-crown],[0,crown]].some(([dx,dz])=>onDeck(x+dx,z+dz))||Math.abs(z-streamZ(x))<2||Math.abs(x)+crown>31.4)continue;
  createGardenTree(garden,art,{x,z,y:terrainHeight(x,z),height,radius,vines,random});
 }
 return {tick(t){clock.value=t;},streamAt(position){return {x:position.x,z:streamZ(position.x)};}};
}
