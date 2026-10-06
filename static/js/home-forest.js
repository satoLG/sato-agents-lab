import * as T from '../vendor/three.module.min.js';
import {loadFoliageTexture} from './folio-foliage.js';
import {createTreeGrove,createMeadow,createContactShadows,seededRandom,createGroveResources,createShrubs} from './scene-grove.js';
import {createWaterMaterial,waterRibbon} from './scene-water.js';

export const FOREST_WATER_HEIGHT=-.10;
export function forestWaterProfile(z){
 const cap=Math.sqrt(Math.max(0,1-Math.pow((z+5.8)/5.1,2)));
 const creek=.46+.13*Math.sin(z*.7);
 return {center:3.7+Math.sin((z+5)*.22)*.85,width:z>-.7||z< -32?0:Math.max(cap*3.15*(1+.035*Math.sin(z*2)),creek*T.MathUtils.smoothstep(-z,3,9))};
}
export function forestGroundHeight(x,z){
 const {center,width}=forestWaterProfile(z),distance=Math.abs(x-center)-width;
 const relief=-.025+.075*Math.sin(x*.45+z*.3)+.065*Math.cos(z*.55-x*.28);
 if(width<=0)return relief;
 // The extra submerged border covers the interpolation between terrain vertices.
 const bank=T.MathUtils.smoothstep(distance,.05,.95);
 return T.MathUtils.lerp(FOREST_WATER_HEIGHT-.32,relief,bank);
}

export function createForestTerrain(){
 const geometry=new T.PlaneGeometry(76,76,128,128);geometry.rotateX(-Math.PI/2);geometry.translate(0,0,-12);
 const positions=geometry.attributes.position,colors=[],color=new T.Color();
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),z=positions.getZ(i);positions.setY(i,forestGroundHeight(x,z));
  const shore=forestWaterProfile(z),bank=Math.abs(x-shore.center)-shore.width;
  color.set(shore.width>0&&bank<1.2?'#e5b079':'#838340');colors.push(color.r,color.g,color.b);
 }
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
 return geometry;
}

export async function createHomeForest(root,art){
 await loadFoliageTexture();
 const map=await new T.TextureLoader().loadAsync(new URL('../textures/polyhaven/forest-floor.jpg',import.meta.url).href);
 map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(22,24);map.anisotropy=4;
 const geometry=createForestTerrain(),color=new T.Color();
 const groundMaterial=new T.MeshStandardMaterial({map,roughness:1,vertexColors:true,color:'#d1d5b0'});
 // Broad dappled shade gives the floor depth without a home shadow-map pass.
 groundMaterial.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec2 vForestGround;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvForestGround=position.xz;');
  shader.fragmentShader='varying vec2 vForestGround;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','diffuseColor.rgb*=mix(vec3(1.),texture2D(map,vMapUv).rgb,.23);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float shade=sin(vForestGround.x*1.2+sin(vForestGround.y*.8))*sin(vForestGround.y*1.5-vForestGround.x*.5);
   diffuseColor.rgb*=.78+.22*smoothstep(-.6,.6,shade);`);
 };groundMaterial.customProgramCacheKey=()=> 'forest-dapple-v1';
 const terrain=art.mesh(root,geometry,groundMaterial);terrain.name='forest-terrain';
 const water=createWaterMaterial(),lake=art.mesh(root,waterRibbon({start:-.7,end:-32,profile:forestWaterProfile,height:FOREST_WATER_HEIGHT}),water);lake.name='forest-river';lake.userData.dynamic=true;
 const random=seededRandom(4091),trees=[];
 const add=(x,z,height,radius)=>trees.push({x,z,y:forestGroundHeight(x,z),height,radius});
 // An open foreground and a curved shore frame the companion; irregular groves
 // recede into cool fog instead of a flat background photograph.
 add(-4.9,-3.1,6.4,2);add(7.7,-6.8,8.2,2.5);add(-2.7,-7.3,4.1,1.35);
 add(-8,-7,7.4,2.1);add(-.1,-11,6.6,2);add(7.2,-12,5.3,1.75);
 for(let row=0;row<5;row++)for(let i=0;i<8;i++){
  const x=-21+i*6+(random()-.5)*3,z=-12-row*5.8-random()*3,p=forestWaterProfile(z);
  if(Math.abs(x-p.center)<p.width+1.5)continue;
  add(x,z,4.1+random()*6.7,1.3+random()*1.8);
 }
 const resources=createGroveResources(true);
 createTreeGrove(root,trees,{seed:627,detail:true,shadows:false,resources});
 createContactShadows(root,trees);
 const patches=[];
 for(let i=0;i<3600;i++){
  const x=(random()-.5)*36,z=3-random()*36,p=forestWaterProfile(z),edge=Math.abs(x-p.center)-p.width;
  if(p.width>0&&edge<.8||Math.hypot(x,z)<1.7||Math.abs(x+.8*Math.sin(z*.4))<.9&&z>-8)continue;
  patches.push({x,z,y:forestGroundHeight(x,z),size:.14+random()*.28});
 }
 createMeadow(root,patches);
 const shrubs=[];
 for(let i=0;i<54;i++){
  const z=-2-random()*25,p=forestWaterProfile(z),x=i%3===0?-4-random()*8:p.center+(i%2?1:-1)*(p.width+1.3+random()*2.2);
  if(Math.abs(x)<1.8&&z>-7)continue;
  shrubs.push({x,z,y:forestGroundHeight(x,z),size:.38+random()*.72,tint:['#b4b536','#aaa62a','#d58b37','#c28296'][i%4]});
 }
 createShrubs(root,shrubs,resources);
 const stones=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshStandardMaterial({color:'#89938b',roughness:1,flatShading:true}),68),dummy=new T.Object3D();
 for(let i=0;i<68;i++){
  const z=-1.5-random()*24,p=forestWaterProfile(z),x=p.center+(i%2?1:-1)*(p.width+.55+random()*.65),r=.10+Math.pow(random(),3)*.55;
  dummy.position.set(x,forestGroundHeight(x,z)+r*.25,z);dummy.rotation.set(random()*.6,random()*6,random()*.5);dummy.scale.set(r*1.5,r*.75,r);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);stones.setColorAt(i,color.setHSL(.11+random()*.07,.08,.48+random()*.18));
 }
 stones.name='shore-stones';root.add(stones);
 return {tick(t){water.userData.waterTime.value=t;}};
}
