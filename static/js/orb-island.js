import * as T from '../vendor/three.module.min.js';
import {createTreeGrove,createGroveResources,createContactShadows} from './scene-grove.js';
import {createHomeGrass} from './home-grass.js';
import {loadFoliageTexture} from './folio-foliage.js';
import {updateNature} from './nature-motion.js';

export function coastRadius(angle) {
  return .92 * (1 + .09*Math.sin(angle*3+.7) + .055*Math.cos(angle*5-1.2));
}
export function terrainHeight(x,z) {
  const d=Math.hypot(x,z),r=d/coastRadius(Math.atan2(z,x));
  const plateau=2.155 + .035*Math.exp(-((x+.18)**2+(z+.20)**2)/.25)
    + .007*Math.sin(x*11+z*4)*Math.cos(z*9-x*3);
  const shore=Math.sqrt(Math.max(0,2.065**2-d*d))-.065*T.MathUtils.smoothstep(r,.92,1.12);
  return T.MathUtils.lerp(plateau,shore,T.MathUtils.smoothstep(r,.56,1.07));
}

function terrainGeometry() {
  const rings=30,segments=128,positions=[],colors=[],indices=[];
  const sand=new T.Color('#d8c69b'),wetSand=new T.Color('#8b8e68');
  const grass=new T.Color('#769c49'),shadeGrass=new T.Color('#2e6445');
  for(let ring=0;ring<=rings;ring++)for(let j=0;j<=segments;j++) {
    const f=ring/rings,a=j/segments*Math.PI*2,d=coastRadius(a)*f*1.12;
    const x=Math.cos(a)*d,z=Math.sin(a)*d;
    positions.push(x,terrainHeight(x,z),z);
    const color=sand.clone();
    if(f<.69)color.copy(grass).lerp(shadeGrass,.24+.18*Math.sin(x*13+z*17));
    else if(f<.77)color.lerp(grass,(.77-f)/.08*.85);
    else color.lerp(wetSand,T.MathUtils.smoothstep(f,.88,1.));
    color.multiplyScalar(.96+.04*Math.sin(x*80)*Math.cos(z*74));colors.push(color.r,color.g,color.b);
    if(ring&&j){const b=ring*(segments+1)+j,a0=b-segments-1;indices.push(a0-1,a0,b-1,b-1,a0,b);}
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export async function createOrbIsland() {
  await loadFoliageTexture();
  const island=new T.Group();island.name='orb-island';
  const land=new T.Mesh(terrainGeometry(),new T.MeshStandardMaterial({vertexColors:true,roughness:.95,side:T.DoubleSide}));
  land.name='island-shore';land.receiveShadow=true;island.add(land);

  // Use the forest's actual stand, foliage SDF, colors and wind at miniature scale.
  const treeScale=.14,treeRoot=new T.Group();treeRoot.scale.setScalar(treeScale);island.add(treeRoot);
  const locations=[[-.40,-.12,.92,.28],[.21,-.35,.78,.25],[.43,.14,.67,.23],[-.15,.37,.73,.25]];
  const trees=locations.map(([x,z,height,radius])=>({x:x/treeScale,z:z/treeScale,y:terrainHeight(x,z)/treeScale,height:height/treeScale,radius:radius/treeScale}));
  createTreeGrove(treeRoot,trees,{seed:627,detail:true,shadows:true,resources:createGroveResources(true)});
  createContactShadows(treeRoot,trees);

  // The same camera-facing forest blades, denser and taller than the old tufts.
  const grassScale=.14,grassRoot=new T.Group();grassRoot.scale.setScalar(grassScale);island.add(grassRoot);
  const grass=createHomeGrass(grassRoot,{
    size:2.25/grassScale,centerZ:0,density:86,
    heightAt:(x,z)=>terrainHeight(x*grassScale,z*grassScale)/grassScale,
    waterAt:()=>({center:0,width:0}),
    exclude:(x,z)=>Math.hypot(x*grassScale,z*grassScale)/coastRadius(Math.atan2(z,x))>.73,
  });
  grassRoot.traverse(object=>{if(object.isMesh){object.userData.orbFoamExclude=true;object.geometry.boundingSphere=new T.Sphere(new T.Vector3(0,2.16/grassScale,0),2.25/grassScale);}});

  const rockMaterial=new T.MeshStandardMaterial({color:'#818679',roughness:1,flatShading:true});
  for(let i=0;i<18;i++) {
    const a=i*2.39996,r=i<10?.23+(i%4)*.10:coastRadius(a)*.93;
    const x=Math.cos(a)*r,z=Math.sin(a)*r;
    const rock=new T.Mesh(new T.IcosahedronGeometry(.035+(i%3)*.023,1),rockMaterial);
    rock.name='island-rock';rock.position.set(x,terrainHeight(x,z)+.012,z);rock.scale.set(1.3,.7+(i%2)*.4,1);rock.rotation.set(i*.4,i*1.1,i*.8);rock.castShadow=true;island.add(rock);
  }
  return {group:island,update(time){updateNature(time);grass.tick(time);}};
}
