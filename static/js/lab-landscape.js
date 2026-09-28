import * as T from '../vendor/three.module.min.js';

const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const hash=(x,z)=>{const v=Math.sin(x*127.1+z*311.7)*43758.5453;return v-Math.floor(v);};
export function noise(x,z){
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
  return T.MathUtils.lerp(T.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),T.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v);
}
function terrainRelief(x,z){
  const d=Math.hypot(Math.max(0,Math.abs(x)-57),Math.max(0,Math.abs(z-13)-70));
  const relief=noise(x*.038,z*.038)*4+noise(x*.09,z*.09)*1.1;
  return .02+smooth(0,18,d)*(relief+smooth(30,115,d)*(8+noise(x*.013,z*.013)*15));
}
// Match the rendered grid triangles, so trunks and walkers cannot float between samples.
export function terrainHeight(x,z){
  const step=1200/192,x0=Math.floor((x+600)/step)*step-600,z0=Math.floor((z+600)/step)*step-600;
  const u=(x-x0)/step,v=(z-z0)/step,a=terrainRelief(x0,z0),b=terrainRelief(x0,z0+step),c=terrainRelief(x0+step,z0+step),d=terrainRelief(x0+step,z0);
  return u+v<=1?a+(d-a)*u+(b-a)*v:c+(b-c)*(1-u)+(d-c)*(1-v);
}
export function pavedAt(x,z){
  // Rounded forecourt and perimeter road; the entrance remains level.
  const dx=Math.max(0,Math.abs(x)-34),dz=Math.max(0,Math.abs(z-13)-47);
  return Math.hypot(dx,dz)<=16;
}

export function pavementHeight(x,z){
  if(!pavedAt(x,z))return null;
  const edge=Math.hypot(Math.max(0,Math.abs(x)-33.5),Math.max(0,Math.abs(z-13)-42.5));
  return edge<=5.5?.06:edge<=6.5?.1:.035;
}

function rounded(w,h,r,cx=0,cy=0){
  const s=new T.Shape(),x=cx-w/2,y=cy-h/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}

export function createLandscape(world,art,obstacles,materials){
  const {mesh,box,mat,cylinder,glow}=art;
  // Height-field mesh with shader splat blending. Its distant alpha fades directly
  // into the actual sky texture, not a solid fog rectangle at the clipping plane.
  const ground=new T.PlaneGeometry(1200,1200,192,192);ground.rotateX(-Math.PI/2);
  const vertices=ground.attributes.position;
  for(let i=0;i<vertices.count;i++)vertices.setY(i,terrainHeight(vertices.getX(i),vertices.getZ(i)));
  ground.computeVertexNormals();
  const land=materials.grass.clone();land.fog=false;land.transparent=true;land.depthWrite=false;
  land.map=materials.grass.map?.clone();if(land.map)land.map.repeat.set(180,180);
  land.onBeforeCompile=shader=>{
    shader.uniforms.soilMap={value:materials.soil};
    shader.vertexShader='varying vec3 vTerrain; varying vec3 vTerrainWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrain=position;vTerrainWorld=(modelMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader='uniform sampler2D soilMap; varying vec3 vTerrain; varying vec3 vTerrainWorld;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec2 p=vTerrain.xz;
      float edge=length(max(abs(p-vec2(0.,13.))-vec2(34.,47.),0.));
      float variation=sin(p.x*.47+sin(p.y*.23))*sin(p.y*.39)+sin(p.x*.11+p.y*.17)*.7;
      float soilWeight=(1.-smoothstep(15.,21.+variation*2.,edge))*.88;
      soilWeight=max(soilWeight,smoothstep(.7,1.6,variation)*.35);
      vec3 soil=texture2D(soilMap,p*.19).rgb;
      diffuseColor.rgb=mix(diffuseColor.rgb,soil*.66,soilWeight);
      diffuseColor.a*=1.-smoothstep(130.,240.,length(cameraPosition.xz-vTerrainWorld.xz));`);
  };
  land.customProgramCacheKey=()=> 'clearing-splat-v1';
  const terrain=mesh(world,ground,land,0,0,0,false);terrain.name='rolling-forest-terrain';terrain.renderOrder=-1;
  function flat(shape,y,material,z=13){const g=new T.ShapeGeometry(shape,12);g.rotateX(-Math.PI/2);return mesh(world,g,material,0,y,z,false);}
  // Pavement, curb and asphalt are distinct continuous surfaces, with real edges.
  const road=rounded(100,126,16);road.holes.push(rounded(79,97,6));
  const asphalt=new T.MeshStandardMaterial({color:'#8a9396',roughness:1,map:materials.paving.map?.clone()});
  if(asphalt.map)asphalt.map.repeat.set(.35,.35);
  const neutralPaving=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb=mix(vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),diffuseColor.rgb,.15);');};
  asphalt.onBeforeCompile=neutralPaving;
  flat(road,.035,asphalt);
  const curb=rounded(80,98,6.5);curb.holes.push(rounded(78,96,5.5));flat(curb,.1,mat('#aeb5ad',0,.95));
  const walk=rounded(78,96,5.5);
  const hole=new T.Path();hole.moveTo(-32,-17);hole.lineTo(-32,43);hole.lineTo(32,43);hole.lineTo(32,-17);hole.closePath();walk.holes.push(hole);
  const paving=materials.paving.clone();for(const key of ['map','normalMap'])if(paving[key]){paving[key]=paving[key].clone();paving[key].repeat.set(.2,.2);}
  paving.onBeforeCompile=neutralPaving;
  flat(walk,.06,paving);
  // Individual curb joints and drains provide scale along the street edge.
  for(let x=-31;x<=31;x+=3){box(world,.04,.012,.8,'#727e76',x,.107,61.35);box(world,.04,.012,.8,'#727e76',x,.107,-35.35);}
  for(const x of [-36,36])for(const z of [-20,5,30,54]){
    box(world,.65,.018,.9,'#4f5d56',x,.075,z);
    for(let k=0;k<5;k++)box(world,.51,.008,.035,'#a7b2a6',x,.087,z-.32+k*.16);
  }
  const leafCanvas=document.createElement('canvas');leafCanvas.width=leafCanvas.height=128;const ctx=leafCanvas.getContext('2d');
  let seed=761;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  for(let i=0;i<200;i++){
    const angle=random()*Math.PI*2,r=Math.sqrt(random())*57,x=64+Math.cos(angle)*r,y=64+Math.sin(angle)*r;
    ctx.fillStyle=['#59763e','#829452','#426339','#a0ab6d'][i%4];ctx.beginPath();ctx.ellipse(x,y,5+random()*5,3+random()*3,angle,0,Math.PI*2);ctx.fill();
  }
  const leafMap=new T.CanvasTexture(leafCanvas);leafMap.colorSpace=T.SRGBColorSpace;
  const leafMaterial=new T.MeshStandardMaterial({map:leafMap,alphaTest:.45,side:T.DoubleSide,roughness:.95,color:'#b3c295'});
  leafMaterial.alphaToCoverage=true;leafMaterial.fog=false;
  const trees=[],shrubs=[];
  function island(x,z,w,d){
    const curbShape=rounded(w,d,Math.min(w,d)/2-.1),geometry=new T.ExtrudeGeometry(curbShape,{depth:.22,bevelEnabled:false,curveSegments:12});geometry.rotateX(-Math.PI/2);
    mesh(world,geometry,mat('#a8b0a3',0,.9),x,.055,z);
    const soilShape=rounded(w-.35,d-.35,Math.min(w,d)/2-.3);const soilGeo=new T.ShapeGeometry(soilShape);soilGeo.rotateX(-Math.PI/2);
    mesh(world,soilGeo,new T.MeshStandardMaterial({color:'#675a42',map:materials.soil,roughness:1}),x,.281,z,false);
    obstacles.push({x,z,w,d});
    for(let i=0;i<Math.floor(w*d*3);i++){
      const px=(random()-.5)*(w-.7),pz=(random()-.5)*(d-.7);
      if(Math.hypot(Math.max(0,Math.abs(px)-(w/2-1)),Math.max(0,Math.abs(pz)-(d/2-1)))>.7)continue;
      shrubs.push({x:x+px,z:z+pz,y:.29,h:.35+random()*.6});
    }
    trees.push({x,z:z-d*.24,y:.28,h:6.5+random()*2,r:2.3,garden:true});
    if(d>14)trees.push({x:x+.3,z:z+d*.24,y:.28,h:7.5,r:2.6,garden:true});
  }
  island(-16,44,5,19);island(18,43,5.8,23);island(-30,33,8,4.6);island(29,31.8,8,4.5);
  // Jittered forest stands surround the clearing on every side, with hills behind.
  for(let x=-154;x<=154;x+=8.8)for(let z=-158;z<=166;z+=9.2){
    const px=x+(random()-.5)*6,pz=z+(random()-.5)*6;
    if(Math.hypot(Math.max(0,Math.abs(px)-35),Math.max(0,Math.abs(pz-13)-48))<21)continue;
    if(random()<.12)continue;
    trees.push({x:px,z:pz,y:terrainHeight(px,pz),h:8+random()*8,r:2.5+random()*2});
  }
  const trunks=new T.InstancedMesh(new T.CylinderGeometry(.12,.24,1,6),mat('#71634e',0,1),trees.length*4);
  const foliage=new T.InstancedMesh(new T.PlaneGeometry(1,1),leafMaterial,trees.length*24+shrubs.length*3);
  const dummy=new T.Object3D(),up=new T.Vector3(0,1,0);let ti=0,li=0;
  const segment=(a,b,r)=>{const delta=b.clone().sub(a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(up,delta.clone().normalize());dummy.scale.set(r,delta.length(),r);dummy.updateMatrix();trunks.setMatrixAt(ti++,dummy.matrix);};
  const leaves=(x,y,z,w,h)=>{dummy.position.set(x,y,z);dummy.rotation.set((random()-.5)*1.5,random()*Math.PI*2,(random()-.5)*.8);dummy.scale.set(w,h,1);dummy.updateMatrix();foliage.setMatrixAt(li,dummy.matrix);foliage.setColorAt(li++,new T.Color().setHSL(.2+random()*.06,.25,.45+random()*.2));};
  for(const tree of trees){
    const {x,y,z,h,r}=tree;segment(new T.Vector3(x,y,z),new T.Vector3(x,y+h*.85,z),tree.garden?1:1.3);
    for(let k=0;k<3;k++){const a=k*2.1;segment(new T.Vector3(x,y+h*.42,z),new T.Vector3(x+Math.cos(a)*r*.7,y+h*.8,z+Math.sin(a)*r*.7),.55);}
    for(let k=0;k<(Math.hypot(x,z)<100?24:14);k++){const a=random()*Math.PI*2,radius=Math.sqrt(random())*r;leaves(x+Math.cos(a)*radius,y+h*.72+random()*r*1.2,z+Math.sin(a)*radius,r*1.35,r*1.1);}
  }
  for(const shrub of shrubs)for(let k=0;k<3;k++)leaves(shrub.x,shrub.y+shrub.h*.5,shrub.z,shrub.h*1.1,shrub.h);
  trunks.material=trunks.material.clone();trunks.material.fog=false;
  trunks.count=ti;foliage.count=li;trunks.castShadow=true;foliage.castShadow=true;foliage.receiveShadow=true;
  trunks.computeBoundingSphere();foliage.computeBoundingSphere();world.add(trunks,foliage);
  for(const x of [-10,11])for(const z of [34,52]){cylinder(world,.075,1.3,'#405149',x,.71,z);box(world,.2,.09,.2,glow('#fff1cd'),x,1.4,z);}
  return {terrain,treeCount:trees.length,gardenCount:4};
}

