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
vec4 orbNoiseGradient(vec3 p) {
  vec3 i=floor(p),t=fract(p),f=t*t*(3.-2.*t),df=6.*t*(1.-t);
  float a=orbHash(i),b=orbHash(i+vec3(1,0,0)),c=orbHash(i+vec3(0,1,0)),d=orbHash(i+vec3(1,1,0));
  float e=orbHash(i+vec3(0,0,1)),g=orbHash(i+vec3(1,0,1)),h=orbHash(i+vec3(0,1,1)),j=orbHash(i+vec3(1,1,1));
  float z0=mix(mix(a,b,f.x),mix(c,d,f.x),f.y),z1=mix(mix(e,g,f.x),mix(h,j,f.x),f.y);
  float dx=mix(mix(b-a,d-c,f.y),mix(g-e,j-h,f.y),f.z)*df.x;
  float dy=mix(mix(c-a,d-b,f.x),mix(h-e,j-g,f.x),f.z)*df.y;
  return vec4(mix(z0,z1,f.z),dx,dy,(z1-z0)*df.z);
}
`;
