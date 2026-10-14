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
