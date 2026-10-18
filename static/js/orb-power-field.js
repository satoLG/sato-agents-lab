import * as T from '../vendor/three.module.min.js';

export function createPowerUniforms(){return {orbPowerUp:{value:new T.Vector3(0,1,0)},orbPowerForward:{value:new T.Vector3(0,0,1)},orbPowerCharge:{value:0},orbPowerBeam:{value:0},orbPowerLength:{value:0},orbPowerWake:{value:0},orbPowerTime:{value:0},orbPowerWaves:{value:1}};}
const smooth=(lo,hi,x)=>T.MathUtils.smoothstep(x,lo,hi);
// Radial water displacement shared by CPU contacts and the GPU. Negative values
// uncover the existing seabed; raised side banks show where the water moves.
export function powerDisplacement(n,u) {
  const charge=u.orbPowerCharge.value,beam=u.orbPowerBeam.value,wake=u.orbPowerWake.value,time=u.orbPowerTime.value;if(charge+beam+wake<.0001)return 0;
  const up=u.orbPowerUp.value,forward=u.orbPowerForward.value,right=new T.Vector3().crossVectors(up,forward),d=n.distanceTo(up)*2.05;
  const width=.18+.42*charge,q=d/width;
  let field=charge*(-.43*Math.exp(-q*q*q*q)+.115*Math.exp(-Math.pow((d-width-.065)/.09,2)));
  const c=n.dot(up),s=n.dot(forward),along=Math.atan2(s,c)*2.05,side=n.dot(right)*2.05,w=.085+.17*beam;
  const gate=smooth(-.12,.10,along)*(1-smooth(u.orbPowerLength.value-.18,u.orbPowerLength.value+.12,along))*smooth(0,.15,c);
  field+=beam*gate*(-.62*Math.exp(-Math.pow(side/w,4))+.12*Math.exp(-Math.pow((Math.abs(side)-w-.08)/.13,2)));
  // Two dispersive fronts and a cross-current continually fold the rim back
  // into the hollow. The wake survives the force, so refill overshoots in waves.
  const envelope=Math.exp(-Math.pow((d-.45)/.48,2)),phase=18*d-5.6*time+.8*Math.sin(7*side+2.1*time);
  const wave=Math.sin(phase)+.42*Math.sin(29*d-8.3*time+5*side);
  const cross=Math.sin(21*side-5*time+.7*Math.sin(8*along+1.7*time));
  field+=u.orbPowerWaves.value*((charge*.035+wake*.11)*envelope*wave+(beam*.045+wake*.025)*gate*Math.exp(-side*side/.22)*cross);
  return field;
}
export const powerFieldGLSL=`
  uniform vec3 orbPowerUp,orbPowerForward;
  uniform float orbPowerCharge,orbPowerBeam,orbPowerLength,orbPowerWake,orbPowerTime,orbPowerWaves;
  vec2 powerSmooth(float lo,float hi,float x){float t=clamp((x-lo)/(hi-lo),0.,1.);return vec2(t*t*(3.-2.*t),6.*t*(1.-t)/(hi-lo));}
  vec4 orbPowerField(vec3 n){
    if(orbPowerCharge+orbPowerBeam+orbPowerWake<.0001)return vec4(0.);
    vec3 delta=n-orbPowerUp;float chord=length(delta),d=chord*2.05,w=.18+.42*orbPowerCharge,q=d/w;
    float bowl=exp(-q*q*q*q),ring=(d-w-.065)/.09,rim=exp(-ring*ring);
    float value=orbPowerCharge*(-.43*bowl+.115*rim);
    vec3 gradient=orbPowerCharge*(1.72*q*q*q*bowl/w-.23*ring*rim/.09)*delta*(2.05/max(chord,.00001));
    vec3 right=cross(orbPowerUp,orbPowerForward);float c=dot(n,orbPowerUp),s=dot(n,orbPowerForward),along=atan(s,c)*2.05,side=dot(n,right)*2.05;
    vec3 ag=2.05*(c*orbPowerForward-s*orbPowerUp)/max(.00001,c*c+s*s),sg=right*2.05;
    vec2 start=powerSmooth(-.12,.10,along),end=powerSmooth(orbPowerLength-.18,orbPowerLength+.12,along),front=powerSmooth(0.,.15,c);
    float gate=start.x*(1.-end.x)*front.x;
    vec3 gg=(start.y*(1.-end.x)-start.x*end.y)*front.x*ag+start.x*(1.-end.x)*front.y*orbPowerUp;
    float width=.085+.17*orbPowerBeam,a=side/width,bank=(abs(side)-width-.08)/.13,cut=exp(-a*a*a*a),crest=exp(-bank*bank);
    float channel=-.62*cut+.12*crest,derivative=2.48*a*a*a*cut/width-.24*bank*crest*sign(side)/.13;
    value+=orbPowerBeam*gate*channel;gradient+=orbPowerBeam*(gg*channel+gate*derivative*sg);
    vec3 dg=delta*(2.05/max(chord,.00001));float t=orbPowerTime,e=(d-.45)/.48,env=exp(-e*e);
    float phase=18.*d-5.6*t+.8*sin(7.*side+2.1*t),phase2=29.*d-8.3*t+5.*side;
    float wave=sin(phase)+.42*sin(phase2),amp=(orbPowerCharge*.035+orbPowerWake*.11)*orbPowerWaves;
    vec3 wg=cos(phase)*(18.*dg+5.6*cos(7.*side+2.1*t)*sg)+.42*cos(phase2)*(29.*dg+5.*sg);
    value+=amp*env*wave;gradient+=amp*env*(wg-wave*2.*e/.48*dg);
    float cp=21.*side-5.*t+.7*sin(8.*along+1.7*t),crossWave=sin(cp),ce=exp(-side*side/.22),ca=(orbPowerBeam*.045+orbPowerWake*.025)*orbPowerWaves;
    vec3 cg=cos(cp)*(21.*sg+5.6*cos(8.*along+1.7*t)*ag);
    value+=ca*gate*ce*crossWave;gradient+=ca*ce*(gg*crossWave+gate*(cg-crossWave*2.*side/.22*sg));
    return vec4(value,gradient);
  }
`;
