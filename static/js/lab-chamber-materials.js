import * as T from '../vendor/three.module.min.js';

// Small, deterministic authored textures: no new network requests or large assets.
export function createChamberMaterials() {
  let seed=41;
  const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  function texture(kind) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle=kind==='floor'?'#969ea2':kind==='wall'?'#c2c8c9':'#dce0e0';ctx.fillRect(0,0,512,512);
    for(let i=0;i<12000;i++){
      const v=random()>.5?255:30;ctx.fillStyle=`rgba(${v},${v},${v},${kind==='shell'?.018:.035})`;
      ctx.fillRect(random()*512,random()*512,1+random()*3,1+random()*3);
    }
    if(kind==='shell'){
      for(let i=0;i<18;i++){const y=12+i*28;ctx.strokeStyle=i%3?'#87909528':'#313f4550';ctx.lineWidth=i%3?1:2;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(512,y);ctx.stroke();}
      for(let i=0;i<30;i++){ctx.fillStyle='#67747a35';ctx.fillRect(random()*512,random()*512,2,8);}
    }
    if(kind!=='shell')for(let y=0;y<512;y+=256)for(let x=0;x<512;x+=256){
      ctx.strokeStyle='#3e484c';ctx.lineWidth=5;ctx.strokeRect(x+2,y+2,252,252);
      ctx.strokeStyle='#dde0de';ctx.lineWidth=2;ctx.strokeRect(x+6,y+6,245,245);
      const grime=ctx.createLinearGradient(x,y,x+35,y+55);grime.addColorStop(0,'#27343930');grime.addColorStop(1,'#27343900');ctx.fillStyle=grime;ctx.fillRect(x+7,y+7,242,242);
      for(const dx of [14,242])for(const dy of [14,242]){ctx.fillStyle='#596166';ctx.beginPath();ctx.arc(x+dx,y+dy,2,0,Math.PI*2);ctx.fill();}
      if(kind==='floor')for(let i=0;i<8;i++){ctx.strokeStyle='#333c4419';ctx.lineWidth=.6;ctx.beginPath();const sx=x+20+random()*190,sy=y+20+random()*190;ctx.moveTo(sx,sy);ctx.lineTo(sx+random()*26,sy+random()*5);ctx.stroke();}
    }
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;return map;
  }
  const floorMap=texture('floor'),wallMap=texture('wall'),shellMap=texture('shell');
  function panel(map,x,y,color,roughness){const tiled=map.clone();tiled.repeat.set(x,y);const bump=tiled.clone();bump.colorSpace=T.NoColorSpace;return new T.MeshStandardMaterial({color,map:tiled,bumpMap:bump,bumpScale:.025,roughness,metalness:.16});}
  const floor=panel(floorMap,16,15,'#d0d9df',.85),cache=new Map();
  const wall=(w,h)=>panel(wallMap,w/8,h/8,'#c2ced3',.82);
  function equipment(color,metalness=.1,roughness=.65){
    const key=`${color}:${metalness}:${roughness}`;if(cache.has(key))return cache.get(key);
    const tint=new T.Color(color),hsl={};tint.getHSL(hsl);
    // Retain parcels and colored signal parts; replace the old sage-green housings.
    const neutral=hsl.s<.23||(hsl.h>.18&&hsl.h<.55&&hsl.s<.48);
    if(neutral){const brightness=Math.max(tint.r,tint.g,tint.b);tint.set(brightness>.56?'#e2e8e9':brightness>.3?'#717e86':'#27323b');}
    const bump=shellMap.clone();bump.colorSpace=T.NoColorSpace;
    const material=new T.MeshStandardMaterial({bumpMap:neutral?bump:null,bumpScale:.012,envMapIntensity:1.25,color:tint,metalness:neutral?Math.max(.22,metalness):metalness,roughness:neutral?(hsl.l>.65?.36:.58):roughness,map:neutral?shellMap:null});
    cache.set(key,material);return material;
  }
  return {floor,wall,equipment};
}

// Isolate outdoor materials before batching so indoor finishes keep their lighting.
export function createExteriorFade(group) {
  const materials=new Map(),brightness={value:1};
  group.traverse(o=>{
    if(!o.isMesh)return;
    const clone=source=>{
      if(!materials.has(source)){
        const m=source.clone();
        m.onBeforeCompile=(shader,renderer)=>{
          source.onBeforeCompile.call(m,shader,renderer);
          shader.uniforms.exteriorBrightness=brightness;
          shader.fragmentShader='uniform float exteriorBrightness;\n'+shader.fragmentShader;
          // Apply after terrain splat blending and lighting, so soil and reflections fade too.
          shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight *= exteriorBrightness;\n#include <opaque_fragment>');
        };
        m.customProgramCacheKey=()=>source.customProgramCacheKey()+'-exterior-fade-v1';
        m.userData.exteriorBrightness=brightness;materials.set(source,m);
      }
      return materials.get(source);
    };
    o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);
  });
  return amount=>{brightness.value=T.MathUtils.lerp(1,.035,amount);};
}

// Black, depth-writing interior is prepared before entry, then revealed by light.
export function createHallReveal(world,hall){
  const level={value:0},seen=new WeakMap(),clones=new WeakSet();
  function register(root=hall){
    const apply=o=>{if(!o.material)return;const replace=m=>{
      if(clones.has(m))return m;if(seen.has(m))return seen.get(m);
      const copy=m.userData.hallLighting?m:m.clone(),compile=m.onBeforeCompile,key=m.customProgramCacheKey();copy.onBeforeCompile=(shader,renderer)=>{
        compile.call(copy,shader,renderer);shader.uniforms.hallLight=level;
        shader.fragmentShader='uniform float hallLight;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight *= hallLight;\n#include <opaque_fragment>');
      };copy.customProgramCacheKey=()=>key+'-hall-light-v1';copy.userData.hallLight=level;copy.hallOriginal=m;seen.set(m,copy);clones.add(copy);return copy;
    };o.material=Array.isArray(o.material)?o.material.map(replace):replace(o.material);};
    root.traverse(apply);if(root===hall)world.traverse(o=>{if(o.material?.userData.hallLighting)apply(o);});
  }
  register();return {register,set(value){level.value=value;},get value(){return level.value;}};
}
