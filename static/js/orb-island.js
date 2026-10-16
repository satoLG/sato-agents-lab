import {smoothSphereNormals} from './orb-geometry.js';
import {createOrbRockMaterial} from './orb-rock-material.js';
import {coreSurfaceRadius} from './orb-core-surface.js';
import * as T from '../vendor/three.module.min.js';
import {createTreeGrove,createGroveResources,createContactShadows} from './scene-grove.js';
import {createHomeGrass} from './home-grass.js';
import {loadFoliageTexture} from './folio-foliage.js';
import {updateNature} from './nature-motion.js';
import {CORE_RADIUS,WATER_RADIUS} from './orb-water.js';
import {grassColorAt,landColorAt,orbGroundGLSL} from './orb-ground.js';

export function coastRadius(angle) {
  return .92 * (1 + .09*Math.sin(angle*3+.7) + .055*Math.cos(angle*5-1.2));
}
export function terrainHeight(x,z) {
  const d=Math.hypot(x,z),coast=coastRadius(Math.atan2(z,x));
  const plateau=2.145+.025*Math.exp(-((x+.18)**2+(z+.20)**2)/.25);
  const end=Math.min(CORE_RADIUS*.95,coast*1.9);
  const beach=Math.sqrt(Math.max(0,(WATER_RADIUS+.022)**2-d*d));
  const beachBlend=T.MathUtils.smoothstep(d,coast*.44,coast*1.16);
  const globe=Math.sqrt(Math.max(0,(CORE_RADIUS-.035)**2-d*d));
  const coreBlend=T.MathUtils.smoothstep(d,coast*1.2,end);
  return T.MathUtils.lerp(T.MathUtils.lerp(plateau,beach,beachBlend),globe,coreBlend);
}
export function terrainGeometry() {
  const rings=44,segments=96,positions=[],colors=[],blends=[],indices=[];
  for(let ring=0;ring<=rings;ring++)for(let j=0;j<=segments;j++) {
    const a=j/segments*Math.PI*2,coast=coastRadius(a),end=Math.min(CORE_RADIUS*.95,coast*1.9),d=end*ring/rings;
    const x=Math.cos(a)*d,z=Math.sin(a)*d,color=landColorAt(x,z,d/coast);
    positions.push(x,terrainHeight(x,z),z);colors.push(color.r,color.g,color.b);
    blends.push(T.MathUtils.smoothstep(d,coast*1.08,end*.95));
    if(ring&&j){const b=ring*(segments+1)+j,a0=b-segments-1;indices.push(a0-1,a0,b-1,b-1,a0,b);}
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setAttribute('coreBlend',new T.Float32BufferAttribute(blends,1));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function landMaterial() {
  const material=new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float coreBlend; varying float vCoreBlend; varying vec3 vLandPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCoreBlend=coreBlend;vLandPosition=position;');
    shader.fragmentShader=`varying float vCoreBlend; varying vec3 vLandPosition; ${orbGroundGLSL}`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,orbRockSurface(vLandPosition),vCoreBlend);');
  };
  material.customProgramCacheKey=()=> 'orb-land-continuous-ground-v1';return material;
}

export function addIslandRocks(island,textures={}) {
  const material=createOrbRockMaterial(textures,1.2);
  let seed=9871;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const dummy=new T.Object3D(),meshes=[];
  for(let variant=0;variant<3;variant++){
    const geometry=new T.IcosahedronGeometry(1,2),p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const bump=.94+.12*Math.sin(x*3.7+y*2.3+variant*2)*Math.cos(z*4.1-y*1.8)+.06*Math.sin(x*7-z*5+y*3);
      p.setXYZ(i,x*bump*(.85+variant*.13),(variant===2&&y>.32?.52:y*bump),z*bump*(1.1-variant*.08));
    }
    smoothSphereNormals(geometry);geometry.computeBoundingBox();
    const rocks=new T.InstancedMesh(geometry,material,3);rocks.name='island-rock';rocks.castShadow=variant!==2;rocks.receiveShadow=variant!==2;
    for(let j=0;j<3;j++){
      const i=variant*3+j,a=i*2.39996+.12*random(),coast=coastRadius(a);
      const r=i<6?coast*(.16+random()*.46):coast*(1.32+random()*.16);
      const x=Math.cos(a)*r,z=Math.sin(a)*r,outer=i>=6,size=outer?.18+random()*.025:.024+random()*.019;
      const groundPoint=new T.Vector3(x,terrainHeight(x,z),z),up=groundPoint.clone().normalize();
      const ground=Math.max(groundPoint.length(),coreSurfaceRadius(up));
      dummy.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),up);dummy.rotateY(a+random());
      if(outer){
        // Anchor a broad irregular base below the actual seabed. Keep a flat
        // top above the tide, rather than lifting a small pebble into midair.
        const bottom=ground-.055,top=2.27,sy=(top-bottom)/(.52-geometry.boundingBox.min.y);
        dummy.scale.set(size*1.2,sy,size*1.12);dummy.position.copy(up).multiplyScalar(bottom-geometry.boundingBox.min.y*sy);
      }else{
        dummy.scale.set(size*(1.1+random()*.4),size*.8,size*(.9+random()*.3));
        dummy.position.copy(up).multiplyScalar(ground-geometry.boundingBox.min.y*dummy.scale.y-.008);
      }
      dummy.updateMatrix();rocks.setMatrixAt(j,dummy.matrix);
    }
    rocks.instanceMatrix.needsUpdate=true;rocks.computeBoundingSphere();island.add(rocks);meshes.push(rocks);
  }
  return meshes;
}

export async function createOrbIsland(textures={}) {
  await loadFoliageTexture();
  const island=new T.Group();island.name='orb-island';
  const land=new T.Mesh(terrainGeometry(),landMaterial());
  land.name='island-shore';land.receiveShadow=false;island.add(land);

  // Use the forest's actual stand, foliage SDF, colors and wind at miniature scale.
  const treeScale=.14,treeRoot=new T.Group();treeRoot.scale.setScalar(treeScale);island.add(treeRoot);
  const locations=[[-.40,-.12,.92,.28],[.21,-.35,.78,.25],[.43,.14,.67,.23]];
  const trees=locations.map(([x,z,height,radius])=>({x:x/treeScale,z:z/treeScale,y:terrainHeight(x,z)/treeScale,height:height/treeScale,radius:radius/treeScale}));
  const grove=createTreeGrove(treeRoot,trees,{seed:627,detail:true,shadows:true,resources:createGroveResources(true),sculptedWood:true});
  // Only the leaf shader moves in this stand. Its opaque wood stays fixed;
  // actual transforms/buffer edits still invalidate the depth automatically.
  grove.getObjectByName('branching-trunks').userData.dynamic=false;
  createContactShadows(treeRoot,trees);

  // Short, dense blades share the ground's color and upward lighting normals.
  const grassScale=.14,grassRoot=new T.Group();grassRoot.scale.setScalar(grassScale);island.add(grassRoot);
  const grass=createHomeGrass(grassRoot,{
    size:2.25/grassScale,centerZ:0,density:104,heightScale:.58,widthScale:1.3,velvet:true,
    colorAt:(x,z)=>grassColorAt(x*grassScale,z*grassScale),
    normalAt:(x,z)=>{x*=grassScale;z*=grassScale;const e=.01;return new T.Vector3(-(terrainHeight(x+e,z)-terrainHeight(x-e,z))/(2*e),1,-(terrainHeight(x,z+e)-terrainHeight(x,z-e))/(2*e)).normalize();},
    heightAt:(x,z)=>terrainHeight(x*grassScale,z*grassScale)/grassScale,
    waterAt:()=>({center:0,width:0}),
    exclude:(x,z)=>Math.hypot(x*grassScale,z*grassScale)/coastRadius(Math.atan2(z,x))>.67,
  });
  grassRoot.traverse(object=>{if(object.isMesh){object.userData.orbFoamExclude=true;object.geometry.boundingSphere=new T.Sphere(new T.Vector3(0,2.16/grassScale,0),2.25/grassScale);}});

  const rocks=addIslandRocks(island,textures);
  const trunks=locations.map(([x,z,height])=>({x,z,y:terrainHeight(x,z),height,radius:height*.085}));
  return {group:island,land,rocks,trunks,trees:treeRoot,grass:grassRoot,update(time){updateNature(time);grass.tick(time);}};
}
