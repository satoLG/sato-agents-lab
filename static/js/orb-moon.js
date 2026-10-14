import * as T from '../vendor/three.module.min.js';
import {CORE_RADIUS} from './orb-water.js';

export const MOON_RADIUS=CORE_RADIUS*.5;
export const MOON_ORBIT_RADIUS=3.4;
export const MOON_ORBIT_PERIOD=300;
const INITIAL_PHASE=Math.PI*.24;

function smoothstep(a,b,x) {
  const t=T.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);
}

// Paint in sphere space rather than UV space: rounded craters and the large
// lavender maria meet cleanly at the map seam and stay round at the poles.
function createMoonTexture() {
  const width=512,height=256,data=new Uint8Array(width*height*4);
  let seed=59173;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const craters=[];
  for(let i=0;i<42;i++){
    const y=1-2*(i+.5)/42,phi=i*2.399963229728653,r=Math.sqrt(1-y*y);
    craters.push({x:Math.cos(phi)*r,y,z:Math.sin(phi)*r,radius:.07+random()*.13});
  }
  const maria=[[-.35,.31,.88,.60],[.80,-.46,.39,.48],[-.71,-.53,-.47,.53]].map(([x,y,z,radius])=>({direction:new T.Vector3(x,y,z).normalize(),radius}));
  const base=[219,218,234],mare=[173,169,200],cup=[123,122,155],rim=[243,239,242];
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    const theta=Math.PI*(1-(row+.5)/height),phi=2*Math.PI*(col+.5)/width;
    const x=-Math.cos(phi)*Math.sin(theta),y=Math.cos(theta),z=Math.sin(phi)*Math.sin(theta);
    const grain=Math.sin(x*73+y*41)*Math.sin(y*67-z*53)*Math.sin(z*61-x*37);
    const irregular=Math.sin(x*13+z*9)*Math.sin(y*11-z*7)*.035;
    let patch=0;
    for(const m of maria){const d=Math.sqrt(Math.max(0,2*(1-x*m.direction.x-y*m.direction.y-z*m.direction.z)));patch=Math.max(patch,1-smoothstep(m.radius-.08,m.radius+.08,d+irregular));}
    const rgb=base.map((c,i)=>T.MathUtils.lerp(c,mare[i],patch*.72)+grain*1.8);
    for(const crater of craters){
      const distance=Math.sqrt(Math.max(0,2*(1-x*crater.x-y*crater.y-z*crater.z)))/crater.radius;
      if(distance>1.22)continue;
      const bowl=1-smoothstep(.68,.92,distance);
      const outline=smoothstep(.76,.87,distance)*(1-smoothstep(.92,1.01,distance));
      const lip=smoothstep(.94,1.02,distance)*(1-smoothstep(1.07,1.22,distance));
      // A pale outer rim, dark pencil-like ring and two-tone bowl give the
      // craters an illustrated appearance instead of a photographic albedo.
      const shade=T.MathUtils.clamp(.55+((x-crater.x)-(y-crater.y))*.65/crater.radius,.25,.85);
      for(let i=0;i<3;i++){
        rgb[i]=T.MathUtils.lerp(rgb[i],cup[i]+shade*27,bowl*.74);
        rgb[i]=T.MathUtils.lerp(rgb[i],cup[i],outline*.58);
        rgb[i]=T.MathUtils.lerp(rgb[i],rim[i],lip*.78);
      }
    }
    const k=(row*width+col)*4;
    for(let i=0;i<3;i++)data[k+i]=Math.round(T.MathUtils.clamp(rgb[i],0,255));data[k+3]=255;
  }
  const texture=new T.DataTexture(data,width,height,T.RGBAFormat);
  texture.name='orb-illustrated-lunar-craters';texture.colorSpace=T.SRGBColorSpace;
  texture.wrapS=T.RepeatWrapping;texture.magFilter=T.LinearFilter;
  texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

export function createOrbMoon({orbitNormal,moonDirection}={}) {
  const normal=orbitNormal.clone().normalize();
  const up=new T.Vector3(0,1,0).addScaledVector(normal,-normal.y).normalize();
  const right=new T.Vector3().crossVectors(up,normal).normalize();
  const gradient=new T.DataTexture(new Uint8Array([85,135,184,222,255]),5,1,T.RedFormat);
  gradient.minFilter=gradient.magFilter=T.NearestFilter;gradient.needsUpdate=true;
  const material=new T.MeshToonMaterial({map:createMoonTexture(),gradientMap:gradient,color:'#d9e0f4',emissive:'#303048',emissiveIntensity:.18});
  const mesh=new T.Mesh(new T.SphereGeometry(MOON_RADIUS,64,48),material);mesh.name='orb-moon';
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
