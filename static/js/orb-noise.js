// Continuous sphere-space value noise: no UV seam or pole singularity.
export const orbNoiseGLSL=`
float orbHash(vec3 p) {
  p=fract(p*.3183099+vec3(.13,.27,.41));p*=17.;
  return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}
float orbNoise(vec3 p) {
  vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(orbHash(i),orbHash(i+vec3(1,0,0)),f.x),mix(orbHash(i+vec3(0,1,0)),orbHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(orbHash(i+vec3(0,0,1)),orbHash(i+vec3(1,0,1)),f.x),mix(orbHash(i+vec3(0,1,1)),orbHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float orbFbm(vec3 p) {return .57*orbNoise(p)+.29*orbNoise(p*2.07+5.)+.14*orbNoise(p*4.13+11.);}
`;

// One noise evaluation returns the value and its exact Cartesian gradient.
// Normals no longer depend on a tangent basis that switches near the poles.
export const orbNoiseGradientGLSL=`
${orbNoiseGLSL}
// Integer arithmetic is reproducible in JS and GLSL: collision and visible
// water share the same waves without reading vertices back from the GPU.
float orbWaterHash(vec3 p) {
  uvec3 q=uvec3(ivec3(p));
  uint h=(q.x*1597334677u)^(q.y*3812015801u)^(q.z*2798796415u);
  h=(h^(h>>16u))*2246822519u;h=(h^(h>>13u))*3266489917u;
  return float(h&16777215u)/16777215.;
}
vec4 orbNoiseGradient(vec3 p) {
  vec3 i=floor(p),t=fract(p),f=t*t*(3.-2.*t),df=6.*t*(1.-t);
  float a=orbWaterHash(i),b=orbWaterHash(i+vec3(1,0,0)),c=orbWaterHash(i+vec3(0,1,0)),d=orbWaterHash(i+vec3(1,1,0));
  float e=orbWaterHash(i+vec3(0,0,1)),g=orbWaterHash(i+vec3(1,0,1)),h=orbWaterHash(i+vec3(0,1,1)),j=orbWaterHash(i+vec3(1,1,1));
  float z0=mix(mix(a,b,f.x),mix(c,d,f.x),f.y),z1=mix(mix(e,g,f.x),mix(h,j,f.x),f.y);
  float dx=mix(mix(b-a,d-c,f.y),mix(g-e,j-h,f.y),f.z)*df.x;
  float dy=mix(mix(c-a,d-b,f.x),mix(h-e,j-g,f.x),f.z)*df.y;
  return vec4(mix(z0,z1,f.z),dx,dy,(z1-z0)*df.z);
}
`;

export function orbWaterNoise(x,y,z) {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const smooth=t=>t*t*(3-2*t),a=smooth(x-ix),b=smooth(y-iy),c=smooth(z-iz);
  const hash=(dx,dy,dz)=>{
    let h=Math.imul(ix+dx,1597334677)^Math.imul(iy+dy,3812015801)^Math.imul(iz+dz,2798796415);
    h=Math.imul(h^(h>>>16),2246822519);h=Math.imul(h^(h>>>13),3266489917);
    return (h&16777215)/16777215;
  };
  const mix=(a,b,t)=>a+(b-a)*t;
  return mix(mix(mix(hash(0,0,0),hash(1,0,0),a),mix(hash(0,1,0),hash(1,1,0),a),b),
    mix(mix(hash(0,0,1),hash(1,0,1),a),mix(hash(0,1,1),hash(1,1,1),a),b),c);
}
