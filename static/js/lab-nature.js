import * as T from '../vendor/three.module.min.js';

// Shared authored surfaces keep the indoor garden and exterior forest consistent.
let foliage,bark,stone;
function randomSequence(seed){return ()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};}
export function createFoliageMaterial(){
  if(foliage)return foliage;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),random=randomSequence(761);
  for(let i=0;i<200;i++){
    const angle=random()*Math.PI*2,r=Math.sqrt(random())*57,x=64+Math.cos(angle)*r,y=64+Math.sin(angle)*r;
    ctx.fillStyle=['#59763e','#829452','#426339','#a0ab6d'][i%4];ctx.beginPath();ctx.ellipse(x,y,5+random()*5,3+random()*3,angle,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#c4ce852b';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x-3*Math.cos(angle),y-3*Math.sin(angle));ctx.lineTo(x+3*Math.cos(angle),y+3*Math.sin(angle));ctx.stroke();
  }
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  foliage=new T.MeshStandardMaterial({map,alphaTest:.45,alphaToCoverage:true,side:T.DoubleSide,roughness:.95,color:'#b3c295'});
  return foliage;
}
export function createBarkMaterial(){
  if(bark)return bark;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'),random=randomSequence(1283);
  ctx.fillStyle='#79684d';ctx.fillRect(0,0,256,256);
  for(let i=0;i<420;i++){
    const x=random()*256,y=random()*256,length=10+random()*100;
    ctx.strokeStyle=i%3?'#40372970':'#b8a17e80';ctx.lineWidth=.5+random()*3;
    ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+random()*7,y+length*.3,x-random()*5,y+length*.7,x+random()*4,y+length);ctx.stroke();
  }
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(2,3);map.anisotropy=4;
  const bump=map.clone();bump.colorSpace=T.NoColorSpace;
  bark=new T.MeshStandardMaterial({color:'#b3a084',map,bumpMap:bump,bumpScale:.065,roughness:.97});return bark;
}
export function createRockMaterial(){
  if(stone)return stone;
  stone=new T.MeshStandardMaterial({color:'#a09d8b',roughness:.96,metalness:0});
  stone.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vStone;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvStone=position;');
    shader.fragmentShader=`varying vec3 vStone;
      float stoneNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);vec3 s=vec3(17.,59.4,15.);float n=dot(i,s);return mix(mix(mix(fract(sin(n)*43758.54),fract(sin(n+s.x)*43758.54),f.x),mix(fract(sin(n+s.y)*43758.54),fract(sin(n+s.x+s.y)*43758.54),f.x),f.y),mix(mix(fract(sin(n+s.z)*43758.54),fract(sin(n+s.x+s.z)*43758.54),f.x),mix(fract(sin(n+s.y+s.z)*43758.54),fract(sin(n+s.x+s.y+s.z)*43758.54),f.x),f.y),f.z);}
      `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float mineral=stoneNoise(vStone*5.)*.55+stoneNoise(vStone*19.)*.3+stoneNoise(vStone*65.)*.15;
      float vein=1.-smoothstep(.035,.10,abs(mineral-.48));
      diffuseColor.rgb*=.65+mineral*.65;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.47,.46,.40),vein*.23);
      float moss=smoothstep(.15,.75,vStone.y)*smoothstep(.45,.7,stoneNoise(vStone*3.));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.20,.29,.13),moss*.48);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 grain=vec3(stoneNoise(vStone*42.),stoneNoise(vStone*42.+11.),stoneNoise(vStone*42.+23.))-.5;normal=normalize(normal+grain*.13);`);
  };
  stone.customProgramCacheKey=()=> 'mineral-stone-v1';return stone;
}

export function createGardenTree(parent,art,{x,z,y,height=3.5,radius=1.25,vines=false,random=randomSequence(44)}){
  const {mesh,rod}=art,tree=new T.Group();tree.name=vines?'garden-tree-vines':'garden-tree';tree.position.set(x,y,z);parent.add(tree);
  const trunk=mesh(tree,new T.CylinderGeometry(vines?.19:.11,vines?.36:.2,height,12,5),createBarkMaterial(),0,height/2,0);trunk.name='textured-tree-trunk';
  for(let i=0;i<5;i++){
    const angle=i*Math.PI*2/5;rod(tree,[0,.12,0],[Math.sin(angle)*(vines?.7:.38),.02,Math.cos(angle)*(vines?.7:.38)],vines?.095:.06,createBarkMaterial());
    rod(tree,[0,height*.48,0],[Math.sin(angle)*radius*.6,height*.81,Math.cos(angle)*radius*.6],vines?.09:.055,createBarkMaterial());
  }
  const leaves=new T.InstancedMesh(new T.PlaneGeometry(1,1),createFoliageMaterial(),36),dummy=new T.Object3D();
  for(let i=0;i<36;i++){
    const angle=random()*Math.PI*2,r=Math.sqrt(random())*radius;
    dummy.position.set(Math.cos(angle)*r,height*.76+random()*radius*.85,Math.sin(angle)*r);
    dummy.rotation.set((random()-.5)*1.5,random()*Math.PI*2,(random()-.5)*.8);dummy.scale.set(radius*1.3,radius*1.05,1);dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);leaves.setColorAt(i,new T.Color().setHSL(.2+random()*.06,.25,.45+random()*.2));
  }
  leaves.castShadow=true;leaves.receiveShadow=true;tree.add(leaves);
  if(vines)for(let i=0;i<5;i++){
    const a=i*1.35,r=radius*.64,start=height*.86,end=start-1.4-random()*1.1;
    const curve=new T.CatmullRomCurve3([new T.Vector3(Math.cos(a)*r,start,Math.sin(a)*r),new T.Vector3(Math.cos(a)*r+.12,(start+end)/2,Math.sin(a)*r+.15),new T.Vector3(Math.cos(a)*r-.06,end,Math.sin(a)*r)]);
    const vine=mesh(tree,new T.TubeGeometry(curve,16,.024,5,false),new T.MeshStandardMaterial({color:'#626843',roughness:1}));vine.name='hanging-vine';
    for(let j=1;j<5;j++){const p=curve.getPoint(j/5);const leaf=mesh(tree,new T.PlaneGeometry(.28,.3),createFoliageMaterial(),p.x,p.y,p.z);leaf.rotation.y=a;}
  }
  tree.traverse(o=>o.userData.dynamic=true);return tree;
}
