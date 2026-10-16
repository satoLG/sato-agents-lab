import * as T from '../vendor/three.module.min.js';
import {CORE_RADIUS} from './orb-water.js';
import {createOrbRockMaterial} from './orb-rock-material.js';
import {smoothSphereNormals} from './orb-geometry.js';

export const MOON_RADIUS=CORE_RADIUS*.43;
export const MOON_ORBIT_RADIUS=4.75;
export const MOON_ORBIT_PERIOD=300;
export const MOON_SPIN_PERIOD=480;
const INITIAL_PHASE=Math.PI*.24;

export async function loadOrbMoonTextures() {
  const loader=new T.TextureLoader();
  const [color,normal,height]=await Promise.all([
    loader.loadAsync(new URL('../textures/orb-moon/rock-color.webp',import.meta.url).href),
    loader.loadAsync(new URL('../textures/orb-moon/rock-normal.webp',import.meta.url).href),
    loader.loadAsync(new URL('../textures/orb-moon/rock-height.png',import.meta.url).href),
  ]);
  color.colorSpace=T.SRGBColorSpace;
  for(const texture of [color,normal]){texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(1,1);texture.anisotropy=2;}
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const context=canvas.getContext('2d');context.drawImage(height.image,0,0,64,64);
  const pixels=context.getImageData(0,0,64,64).data;
  const heightData=Uint8Array.from({length:64*64},(_,i)=>pixels[i*4]);height.dispose();
  return {color,normal,heightData};
}

function rockHeight(data,u,v) {
  if(!data)return .5;
  const x=((u%1+1)%1)*64,y=((v%1+1)%1)*64,x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
  const at=(dx,dy)=>data[((y0+dy)%64)*64+(x0+dx)%64]/255;
  return T.MathUtils.lerp(T.MathUtils.lerp(at(0,0),at(1,0),fx),T.MathUtils.lerp(at(0,1),at(1,1),fx),fy);
}

function moonGeometry(heightData) {
  const geometry=new T.SphereGeometry(MOON_RADIUS,48,32),p=geometry.attributes.position,n=new T.Vector3();
  for(let i=0;i<p.count;i++) {
    n.fromBufferAttribute(p,i).normalize();const {x,y,z}=n;
    const macro=.026*Math.sin(x*4.3+y*2.1+z*.8)*Math.cos(z*3.7-y*1.8)
      +.018*Math.sin(x*7.2-z*5.1+y*3.3);
    const weights=[Math.abs(x)**4,Math.abs(y)**4,Math.abs(z)**4],sum=weights.reduce((a,b)=>a+b);
    const detail=(rockHeight(heightData,z*1.2,y*1.2)*weights[0]+rockHeight(heightData,x*1.2,z*1.2)*weights[1]+rockHeight(heightData,x*1.2,y*1.2)*weights[2])/sum;
    n.multiplyScalar(MOON_RADIUS+macro+(detail-.5)*.026);p.setXYZ(i,n.x,n.y,n.z);
  }
  smoothSphereNormals(geometry);geometry.computeBoundingSphere();return geometry;
}

export function createOrbMoon({orbitNormal,moonDirection,textures={}}={}) {
  const normal=orbitNormal.clone().normalize();
  const up=new T.Vector3(0,1,0).addScaledVector(normal,-normal.y).normalize();
  const right=new T.Vector3().crossVectors(up,normal).normalize();
  const material=createOrbRockMaterial(textures,1.2/MOON_RADIUS);
  const mesh=new T.Mesh(moonGeometry(textures.heightData),material);mesh.name='orb-moon';
  // The circle is fixed in world space. OrbitControls can explore it in 3D
  // without moving the moon's orbit or changing which water faces it.
  function update(seconds) {
    const phase=INITIAL_PHASE+seconds*Math.PI*2/MOON_ORBIT_PERIOD;
    mesh.position.copy(up).multiplyScalar(Math.cos(phase)*MOON_ORBIT_RADIUS).addScaledVector(right,Math.sin(phase)*MOON_ORBIT_RADIUS);
    mesh.rotation.y=-seconds*Math.PI*2/MOON_SPIN_PERIOD;
    moonDirection?.copy(mesh.position).normalize();
  }
  update(0);
  return {mesh,update};
}
