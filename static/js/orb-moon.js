import * as T from '../vendor/three.module.min.js';
import {CORE_RADIUS} from './orb-water.js';

export const MOON_RADIUS=CORE_RADIUS*.5;
export const MOON_ORBIT_RADIUS=4.25;
export const MOON_ORBIT_PERIOD=300;
const INITIAL_PHASE=Math.PI*.24;

export async function loadOrbMoonTextures() {
  const loader=new T.TextureLoader();
  const [color,normal]=await Promise.all([
    loader.loadAsync(new URL('../textures/orb-moon/lroc-color.webp',import.meta.url).href),
    loader.loadAsync(new URL('../textures/orb-moon/lola-normal.webp',import.meta.url).href),
  ]);
  color.colorSpace=T.SRGBColorSpace;
  for(const texture of [color,normal]){texture.wrapS=T.RepeatWrapping;texture.anisotropy=2;}
  return {color,normal};
}

export function createOrbMoon({orbitNormal,moonDirection,textures={}}={}) {
  const normal=orbitNormal.clone().normalize();
  const up=new T.Vector3(0,1,0).addScaledVector(normal,-normal.y).normalize();
  const right=new T.Vector3().crossVectors(up,normal).normalize();
  const material=new T.MeshStandardMaterial({map:textures.color??null,normalMap:textures.normal??null,normalScale:new T.Vector2(.7,.7),color:'#c8c7c6',roughness:.96,metalness:0,envMapIntensity:.18});
  const mesh=new T.Mesh(new T.SphereGeometry(MOON_RADIUS,48,32),material);mesh.name='orb-moon';
  // The circle is fixed in world space. OrbitControls can explore it in 3D
  // without moving the moon's orbit or changing which water faces it.
  function update(seconds) {
    const phase=INITIAL_PHASE+seconds*Math.PI*2/MOON_ORBIT_PERIOD;
    mesh.position.copy(up).multiplyScalar(Math.cos(phase)*MOON_ORBIT_RADIUS).addScaledVector(right,Math.sin(phase)*MOON_ORBIT_RADIUS);
    mesh.rotation.y=-phase*.16;
    moonDirection?.copy(mesh.position).normalize();
  }
  update(0);
  return {mesh,update};
}
