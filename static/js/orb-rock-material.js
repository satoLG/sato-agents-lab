import * as T from '../vendor/three.module.min.js';

// Shared lunar rock maps, projected in object space. There are no spherical
// UV poles; derivative tangent frames preserve normal relief on every axis,
// including non-uniformly scaled instances and the rotating moon.
export function createOrbRockMaterial(textures={},scale=1.5) {
  const material=new T.MeshStandardMaterial({map:textures.color??null,normalMap:textures.normal??null,color:'#c3c7bc',roughness:.96,metalness:0,envMapIntensity:.12,normalScale:new T.Vector2(1.2,1.2)});
  material.onBeforeCompile=shader=>{
    if(!textures.color||!textures.normal)return;
    shader.uniforms.orbRockScale={value:scale};
    shader.vertexShader='varying vec3 vRockPosition,vRockNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRockPosition=position;vRockNormal=normal;');
    shader.fragmentShader=`varying vec3 vRockPosition,vRockNormal;uniform float orbRockScale;
      vec3 rockWeights(){vec3 w=pow(abs(normalize(vRockNormal)),vec3(4.));return w/max(dot(w,vec3(1.)),.0001);}
      vec3 rockDetailNormal(vec2 uv,vec3 mapped,vec3 base,vec3 eye){
        vec3 dx=dFdx(eye),dy=dFdy(eye);vec2 ux=dFdx(uv),uy=dFdy(uv);
        vec3 px=cross(dy,base),py=cross(base,dx),t=px*ux.x+py*uy.x,b=px*ux.y+py*uy.y;
        float gain=inversesqrt(max(max(dot(t,t),dot(b,b)),1e-10));
        return normalize(base*mapped.z+(t*mapped.x+b*mapped.y)*gain);
      }
      `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec3 rockP=vRockPosition*orbRockScale,rockW=rockWeights();
      #ifdef USE_MAP
      diffuseColor.rgb*=texture2D(map,rockP.yz).rgb*rockW.x+texture2D(map,rockP.xz).rgb*rockW.y+texture2D(map,rockP.xy).rgb*rockW.z;
      #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #ifdef USE_NORMALMAP
      vec3 nx=texture2D(normalMap,rockP.yz).xyz*2.-1.,ny=texture2D(normalMap,rockP.xz).xyz*2.-1.,nz=texture2D(normalMap,rockP.xy).xyz*2.-1.;
      nx.xy*=normalScale;ny.xy*=normalScale;nz.xy*=normalScale;
      normal=normalize(rockDetailNormal(rockP.yz,nx,normal,-vViewPosition)*rockW.x+rockDetailNormal(rockP.xz,ny,normal,-vViewPosition)*rockW.y+rockDetailNormal(rockP.xy,nz,normal,-vViewPosition)*rockW.z);
      #endif`);
  };
  material.customProgramCacheKey=()=> 'orb-triplanar-rock-v1';return material;
}
