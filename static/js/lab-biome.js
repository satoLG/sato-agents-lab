import * as T from '../vendor/three.module.min.js';
import {onDeck} from './lab-layout.js';
import {createWaterMaterial,waterRibbon} from './scene-water.js';
import {createHomeGrass} from './home-grass.js';
import {createGardenTree,createRockMaterial} from './lab-nature.js';

export const streamZ=x=>-4+Math.sin(x*.095)*4.2;
// Instanced foliage and a single animated water surface keep the lower garden cheap.
export function createLabBiome(hall,art,environment){
 const {mesh}=art;
 const garden=new T.Group();garden.name='under-platform-garden';hall.add(garden);
 const soil=environment.soil?.clone();if(soil)soil.repeat.set(20,16);
 const terrainHeight=(x,z)=>{const bank=Math.min(1,Math.max(0,(Math.abs(z-streamZ(x))-1.05)/2));return .10+bank*(.12+.09*Math.sin(x*.7)*Math.cos(z*.6)+.08*Math.sin(x*.23+z*.4));};
 const terrain=new T.PlaneGeometry(79,60,126,96),vertices=terrain.attributes.position;
 for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),z=-vertices.getY(i)-12;vertices.setZ(i,terrainHeight(x,z)-.12);}terrain.computeVertexNormals();
 const ground=mesh(garden,terrain,new T.MeshStandardMaterial({color:'#34442b',map:soil,roughness:1}),0,.12,-12);ground.rotation.x=-Math.PI/2;
 const river=waterRibbon({start:-39.4,end:39.4,axis:'x',height:.145,profile:x=>({center:streamZ(x),width:1.05})});
 const water=createWaterMaterial();
 const creek=mesh(garden,river,water);creek.name='laboratory-stream';creek.userData.dynamic=true;
 let seed=714;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 const rocks=new T.InstancedMesh(new T.IcosahedronGeometry(1,2),createRockMaterial(),120);
 const rockVertices=rocks.geometry.attributes.position;
 for(let i=0;i<rockVertices.count;i++){const x=rockVertices.getX(i),y=rockVertices.getY(i),z=rockVertices.getZ(i),relief=1+.10*Math.sin(x*13+z*7)*Math.cos(y*9);rockVertices.setXYZ(i,x*relief,y*relief,z*relief);}rocks.geometry.computeVertexNormals();
 const dummy=new T.Object3D(),color=new T.Color();let stones=0;
 const grass=createHomeGrass(garden,{heightAt:terrainHeight,waterAt:()=>({center:0,width:0}),size:78,centerZ:-12,density:128,exclude:(x,z)=>z< -41||z>18||onDeck(x,z)||Math.abs(z-streamZ(x))<1.8});
 for(let i=0;i<120;i++){
  const x=-39+random()*78,side=i%2?1:-1,z=streamZ(x)+side*(1.2+random()*.7);
  dummy.position.set(x,terrainHeight(x,z)+.04,z);dummy.rotation.set(random(),random()*6,random());dummy.scale.set(.25+random()*.45,.12+random()*.22,.22+random()*.25);dummy.updateMatrix();rocks.setMatrixAt(stones,dummy.matrix);rocks.setColorAt(stones++,color.setHSL(.12+random()*.06,.07+random()*.08,.3+random()*.14));
 }
 rocks.receiveShadow=true;garden.add(rocks);
 // Canopies remain inside open garden pockets, clear of the deck and walls.
 for(const [x,z,height,radius,vines]of [[-19,-13,3.4,1.2,false],[19,-12,5.2,1.55,true],[-34,-17,3.3,1.1,false],[34,-16,3.7,1.2,false],[10,15,3.5,1.1,false]]){
  const crown=radius*1.65;
  if([[0,0],[-crown,0],[crown,0],[0,-crown],[0,crown]].some(([dx,dz])=>onDeck(x+dx,z+dz))||Math.abs(z-streamZ(x))<2||Math.abs(x)+crown>39.4)continue;
  createGardenTree(garden,art,{x,z,y:terrainHeight(x,z),height,radius,vines,random});
 }
 return {tick(t){grass.tick(t);water.userData.waterTime.value=t;},streamAt(position){return {x:position.x,z:streamZ(position.x)};}};
}
