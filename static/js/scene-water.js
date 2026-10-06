import * as T from '../vendor/three.module.min.js';

// WebGL adaptation of folio-2025 Terrain + WaterSurface (Bruno Simon, MIT).
// Depth color and thin contour masks, without specular normals. See docs.
export function createWaterMaterial(){
 const time={value:0};
 const material=new T.MeshBasicMaterial({color:'#ffffff',side:T.DoubleSide,toneMapped:false});
 material.userData.waterTime=time;
 material.onBeforeCompile=shader=>{
  shader.uniforms.waterTime=time;
  shader.uniforms.waterShallow={value:new T.Color('#5bc2b9')};
  shader.uniforms.waterDeep={value:new T.Color('#13375f')};
  shader.vertexShader='attribute float waterWidth; varying vec2 vWater; varying vec2 vWaterPosition; varying float vWaterWidth;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWater=uv;vWaterPosition=position.xz;vWaterWidth=waterWidth;');
  shader.fragmentShader=`uniform float waterTime; uniform vec3 waterShallow; uniform vec3 waterDeep;
   varying vec2 vWater; varying vec2 vWaterPosition; varying float vWaterWidth;
   float waterHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float waterNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(waterHash(i),waterHash(i+vec2(1,0)),f.x),mix(waterHash(i+vec2(0,1)),waterHash(i+1.),f.x),f.y);}
   `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float shoreDistance=(1.-abs(vWater.y*2.-1.))*vWaterWidth;
   float noise=waterNoise(vWaterPosition*.8);
   float depth=smoothstep(0.,max(.55,vWaterWidth*.82),shoreDistance+noise*.10);
   diffuseColor.rgb=mix(waterShallow,waterDeep,depth*.86);
   diffuseColor.rgb*=.83+.17*waterNoise(vWaterPosition*.38);
   float aa=max(fwidth(shoreDistance),.003);
   float shore=1.-smoothstep(.018-aa,.018+aa,shoreDistance);
   // Drifting shore contours broken into short white ripples by noise.
   float ripplePhase=fract(shoreDistance*1.9-waterTime*.11+noise*.14);
   float rippleAA=max(fwidth(ripplePhase),.004);
   float ripple=1.-smoothstep(.018-rippleAA,.018+rippleAA,abs(ripplePhase-.5));
   ripple*=smoothstep(.05,.20,shoreDistance)*(1.-smoothstep(.6,1.2,shoreDistance));
   ripple*=smoothstep(.29,.43,waterNoise(vWaterPosition*.6+waterTime*.04));
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.88,.96,.84),max(shore*.8,ripple*.82));`);
 };
 material.customProgramCacheKey=()=> 'folio-water-contours-v2';
 return material;
}

export function waterRibbon({start,end,segments=128,across=12,profile,height,axis='z'}){
 const positions=[],uvs=[],widths=[],indices=[];
 for(let i=0;i<=segments;i++){
  const t=i/segments,p=T.MathUtils.lerp(start,end,t),{center,width}=profile(p);
  for(let j=0;j<=across;j++){
   const v=j/across,q=center+(v*2-1)*width;
   positions.push(axis==='z'?q:p,height,axis==='z'?p:q);uvs.push(t*Math.abs(end-start),v);widths.push(width);
   if(i&&j){const b=i*(across+1)+j,a=b-across-1;indices.push(a-1,b-1,a,b-1,b,a);}
  }
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setAttribute('waterWidth',new T.Float32BufferAttribute(widths,1));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
