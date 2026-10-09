import * as T from '../vendor/three.module.min.js';
import {seededRandom} from './scene-grove.js';

// folio-2025's Grass.js: jittered grid, one camera-facing triangle per blade,
// terrain-dependent height and wind only at the tip. Adapted to WebGL/GLSL.
export function createHomeGrass(root,{heightAt,waterAt,size=56,centerZ=-4,exclude=null,density=null}){
 const random=seededRandom(6109),positions=[],heights=[],widths=[],colors=[],color=new T.Color();
 const subdivisions=density??(matchMedia('(pointer:coarse)').matches?300:420),cell=size/subdivisions;
 for(let row=0;row<subdivisions;row++)for(let column=0;column<subdivisions;column++){
  const x=-size/2+(column+random())*cell,z=-size/2+(row+random())*cell+centerZ;
  const water=waterAt(z),shore=Math.abs(x-water.center)-water.width,path=Math.abs(x+.8*Math.sin(z*.4));
  if(exclude?exclude(x,z):water.width>0&&shore<.8||Math.hypot(x,z)<1.4||path<.7&&z>-8&&z<4)continue;
  const variation=.65+.35*Math.sin(x*.39+Math.sin(z*.3))*Math.cos(z*.42);
  positions.push(x,heightAt(x,z)+.008,z);heights.push((.36+random()*.30)*variation);widths.push(.03+random()*.02);
  color.setHSL(.19+random()*.035,.45+random()*.15,.30+random()*.08);colors.push(color.r,color.g,color.b);
 }
 const geometry=new T.InstancedBufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute([-1,0,0,1,0,0,0,1,0],3));
 geometry.setAttribute('normal',new T.Float32BufferAttribute([0,1,0,0,1,0,0,1,0],3));
 geometry.setAttribute('bladeCenter',new T.InstancedBufferAttribute(new Float32Array(positions),3));
 geometry.setAttribute('bladeHeight',new T.InstancedBufferAttribute(new Float32Array(heights),1));
 geometry.setAttribute('bladeWidth',new T.InstancedBufferAttribute(new Float32Array(widths),1));
 geometry.setAttribute('bladeColor',new T.InstancedBufferAttribute(new Float32Array(colors),3));geometry.instanceCount=heights.length;
 geometry.boundingSphere=new T.Sphere(new T.Vector3(0,0,centerZ),size*.73);
 const time={value:0},material=new T.MeshBasicMaterial({color:'#ffffff',side:T.DoubleSide});
 material.onBeforeCompile=shader=>{
  shader.uniforms.grassTime=time;
  shader.vertexShader='attribute vec3 bladeCenter;\nattribute float bladeHeight;\nattribute float bladeWidth;\nattribute vec3 bladeColor;\nuniform float grassTime;\nvarying float bladeTip;\nvarying vec3 grassColor;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`vec3 transformed=bladeCenter;
   vec3 centerWorld=(modelMatrix*vec4(bladeCenter,1.)).xyz;
   vec2 facing=normalize(cameraPosition.xz-centerWorld.xz+vec2(.0001));
   transformed.xz+=vec2(facing.y,-facing.x)*position.x*bladeWidth;
   transformed.y+=position.y*bladeHeight;
   float phase=bladeCenter.x*.49+bladeCenter.z*.32;
   float gust=sin(grassTime*.85+phase)*.64+sin(grassTime*1.63+phase*.57)*.36;
   transformed.xz+=vec2(gust,sin(grassTime*.73+phase)*.4)*position.y*bladeHeight*.32;
   bladeTip=position.y;grassColor=bladeColor;`);
  shader.fragmentShader='varying float bladeTip;\nvarying vec3 grassColor;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=grassColor*mix(vec3(.43,.49,.34),vec3(1.24,1.2,.85),smoothstep(0.,1.,bladeTip));');
 };
 material.customProgramCacheKey=()=> 'home-folio-grass-v1';
 const mesh=new T.Mesh(geometry,material);mesh.name='camera-facing-procedural-grass';mesh.userData.dynamic=true;root.add(mesh);
 return {tick(t){time.value=t;}};
}
