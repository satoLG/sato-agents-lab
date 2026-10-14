import * as T from '../vendor/three.module.min.js';
import {orbNoiseGLSL} from './orb-noise.js';

const grass=new T.Color('#659a53'),grassShade=new T.Color('#548b4b');
const sand=new T.Color('#d4c19c'),wetSand=new T.Color('#969877');

export function grassColorAt(x,z) {
  return grass.clone().lerp(grassShade,.22+.13*Math.sin(x*8+z*6)*Math.cos(z*7-x*3));
}
export function landColorAt(x,z,r) {
  const green=1-T.MathUtils.smoothstep(r,.68,.84);
  return sand.clone().lerp(wetSand,T.MathUtils.smoothstep(r,.93,1.25)*.58).lerp(grassColorAt(x,z),green);
}

// The core and the submerged beach sample the same 3D surface, in the same
// planet coordinates, so their texture continues through the join.
export const orbGroundGLSL=`${orbNoiseGLSL}
vec3 orbRockSurface(vec3 p) {
  float rock=.65*orbNoise(p*2.7)+.35*orbNoise(p*5.3+vec3(5.,3.,2.));
  return mix(vec3(.028,.13,.20),vec3(.085,.36,.38),rock)*(.94+.06*orbNoise(p*17.));
}
`;
