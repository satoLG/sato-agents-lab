import * as T from '../vendor/three.module.min.js';
import {windMaterial} from './nature-motion.js';

// Port of folio-2025 Foliage.setGeometry / foliageAlpha / colorNode (MIT).
// Original author: Bruno Simon. See textures/folio-2025/LICENSE.txt and
// docs/scenic-environments.md for pinned sources and WebGL adaptations.
let texture,pending;
export async function loadFoliageTexture(){
 if(!pending)pending=new T.TextureLoader().loadAsync(new URL('../textures/folio-2025/foliageSDF.png',import.meta.url).href).then(map=>{texture=map;return map;}).catch(error=>{pending=null;throw error;});
 return pending;
}

export function createFoliageCloud(count=80){
 let seed=3187;const rng=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
 const positions=[],normals=[],uvs=[],indices=[],card=new T.Vector3(),normal=new T.Vector3();
 for(let i=0;i<count;i++){
  // Same shell-biased distribution and .8-unit leaf cards as the reference.
  const center=new T.Vector3().setFromSpherical(new T.Spherical(1-Math.pow(rng(),3),Math.PI*2*rng(),Math.PI*rng()));
  normal.copy(center).normalize();
  const angle=rng()*Math.PI*2,turn=(i%3-1)*Math.PI/3;
  for(const [x,y,u,v]of [[-.4,-.4,0,0],[.4,-.4,1,0],[.4,.4,1,1],[-.4,.4,0,1]]){
   card.set(x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle),0);
   card.applyAxisAngle(new T.Vector3(0,1,0),turn).add(center);positions.push(card.x,card.y,card.z);
   // The reference blends toward the cloud's radial normal by .85.
   card.lerp(normal,.85).normalize();normals.push(card.x,card.y,card.z);uvs.push(u,v);
  }
  const a=i*4;indices.push(a,a+1,a+2,a,a+2,a+3);
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);return geometry;
}

export function createFolioFoliageMaterial(){
 const material=windMaterial(new T.MeshBasicMaterial({color:'#ffffff',alphaMap:texture,alphaTest:.4,side:T.DoubleSide,toneMapped:false}),{strength:.085});
 const breeze=material.onBeforeCompile;
 material.onBeforeCompile=(shader,renderer)=>{
  breeze.call(material,shader,renderer);
  shader.vertexShader='varying vec3 vLeafNormal; varying vec3 vLeafPosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   mat3 leafBasis=mat3(modelMatrix);
   vec4 leafPosition=vec4(position,1.);
   #ifdef USE_INSTANCING
    leafBasis=leafBasis*mat3(instanceMatrix);
    leafPosition=instanceMatrix*leafPosition;
   #endif
   vLeafNormal=normalize(leafBasis*normal);
   vLeafPosition=(modelMatrix*leafPosition).xyz;`);
  shader.fragmentShader='uniform float natureTime; varying vec3 vLeafNormal; varying vec3 vLeafPosition;\n'+shader.fragmentShader;
  // Reference: rotateUV(uv, length(wind.offset(positionLocal.xz))*2.2).
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`
   float leafTurn=sin(natureTime*.7+vLeafPosition.x*.5+vLeafPosition.z*.34)*.12;
   vec2 leafUv=mat2(cos(leafTurn),-sin(leafTurn),sin(leafTurn),cos(leafTurn))*(vAlphaMapUv-.5)+.5;
   diffuseColor.a*=texture2D(alphaMap,leafUv).g;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
   float facing=dot(normalize(vLeafNormal),normalize(vec3(-.45,.8,.3)));
   float lightMix=smoothstep(-.25,1.,facing);
   // Colored core shadows and warm light, following MeshDefaultMaterial.
   vec3 shade=diffuseColor.rgb*vec3(.29,.19,.52);
   vec3 sun=diffuseColor.rgb*vec3(1.18,1.02,.86);
   outgoingLight=mix(shade,sun,lightMix);
   #include <opaque_fragment>`);
 };
 material.customProgramCacheKey=()=> 'folio-leaf-cloud-v2';
 return material;
}
