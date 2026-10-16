import {powerDisplacement} from './orb-power-field.js';
import * as T from '../vendor/three.module.min.js';
import {orbWaterNoise as noise} from './orb-noise.js';
import {CORE_RADIUS,WATER_RADIUS} from './orb-water.js';
import {coastRadius} from './orb-island.js';

import {coreSurfaceRadius} from './orb-core-surface.js';
export {coreSurfaceRadius};

const smooth=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);
export function coastContactRatio(angle,time) {
  return .92+.014*Math.sin(time*.9+angle*3)+.008*Math.sin(time*1.37-angle*5);
}

// CPU counterpart of orbSurface, validated against the production GPU shader.
// Sample only at contact points; the ocean geometry stays entirely on the GPU.
export function seaSurfaceRadius(n,time,moon,strength=.9,{frequency=1,height=1,speed=1}={},powerUniforms=null) {
  const {x,y,z}=n,a=n.dot(moon),protection=smooth(.58,.82,y);
  const wt=time*speed,wx=x*frequency,wy=y*frequency,wz=z*frequency;
  const waves=(noise(wx*2.25+wt*.16,wy*2.25,wz*2.25+wt*.09)-.5)*.21*height
    +(.68*noise(wx*6.51,wy*6.51-wt*.2,wz*6.51-wt*.13)+.32*noise(wx*13.02+5,wy*13.02-wt*.26,wz*13.02)-.5)*.09
    +Math.sin(wx*4.34+wz*2.48+wt*.55)*Math.sin(wy*4.96-wz*2.17+wt*.38)*.027;
  let radius=WATER_RADIUS+(.016+.046*a*a+.016*a)*(1-.92*protection)
    +waves*strength*1.65*(1+.24*a)*(1-.985*protection);
  const h=Math.hypot(x,z);
  if(y>.58&&h>.001) {
    const angle=Math.atan2(z,x),coast=coastRadius(angle),contact=coastContactRatio(angle,time),d=contact*coast;
    const px=d*Math.cos(angle),pz=d*Math.sin(angle),plateau=2.145+.025*Math.exp(-((px+.18)**2+(pz+.20)**2)/.25);
    const beach=Math.sqrt(2.072**2-d*d),height=T.MathUtils.lerp(plateau,beach,smooth(.44,1.16,contact));
    const level=Math.hypot(d,height),ratio=2.18*h/coast;
    radius+=(level-WATER_RADIUS)*smooth(.25,.65,ratio)*(1-smooth(1.04,1.70,ratio))*smooth(.58,.72,y);
  }
  return Math.max(CORE_RADIUS-.08,Math.max(CORE_RADIUS+.06,radius)+(powerUniforms?powerDisplacement(n,powerUniforms):0));
}

export function createOrbSurface({land,rocks=[],trunks=[],water}) {
  const ray=new T.Raycaster(),origin=new T.Vector3(),down=new T.Vector3();
  const colliders=[land,...rocks].filter(Boolean);
  for(const object of colliders)object.updateWorldMatrix(true,false);
  function sample(direction,time=water.uniforms.orbTime.value) {
    const n=direction.clone().normalize(),sea=seaSurfaceRadius(n,time,water.uniforms.orbMoonDirection.value,water.uniforms.orbStrength.value,water.settings.values,water.uniforms);
    let result={radius:coreSurfaceRadius(n),waterRadius:sea,normal:n.clone(),surface:'rock',object:null};
    if(n.y>.48) {
      origin.copy(n).multiplyScalar(4);down.copy(n).negate();ray.set(origin,down);ray.far=3;
      const hits=ray.intersectObjects(colliders,false);
      for(const hit of hits) {
        const radius=hit.point.dot(n);
        if(radius<=result.radius)continue;
        let normal=hit.face.normal.clone();
        if(hit.object.isInstancedMesh){const instance=new T.Matrix4();hit.object.getMatrixAt(hit.instanceId,instance);normal.applyNormalMatrix(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld.clone().multiply(instance)));}
        else normal.applyNormalMatrix(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld));
        if(normal.dot(n)<0)normal.negate();
        const ratio=Math.hypot(hit.point.x,hit.point.z)/coastRadius(Math.atan2(hit.point.z,hit.point.x));
        result={radius,waterRadius:sea,normal,surface:hit.object===land?(ratio<.69?'grass':'sand'):'rock',object:hit.object};
      }
    }
    result.groundSurface=result.surface;result.waterDepth=Math.max(0,sea-result.radius);
    if(result.waterDepth>.008)result.surface='water';
    result.point=n.multiplyScalar(result.radius);return result;
  }
  function blockedByTrunk(point,radius=.045,height=.24) {
    for(const trunk of trunks) {
      if(point.y+height<trunk.y||point.y>trunk.y+trunk.height)continue;
      if(Math.hypot(point.x-trunk.x,point.z-trunk.z)<radius+trunk.radius)return true;
    }
    return false;
  }
  return {sample,blockedByTrunk,colliders};
}
