import * as T from '../vendor/three.module.min.js';

// Fade only the fragments between the camera and Sato. A stable screen-door
// mask preserves instancing, depth and leaf alpha tests without another pass.
// The camera never searches for another angle or collapses its distance.
export function createOrbCameraOcclusion(roots) {
  const uniforms={orbFadeCamera:{value:new T.Vector3()},orbFadeTarget:{value:new T.Vector3()},orbFadeAmount:{value:0}};
  const materials=new Set();
  for(const root of roots)root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.name==='soft-contact-shadows')return;
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]) {
      if(materials.has(material))continue;materials.add(material);
      const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
      material.onBeforeCompile=shader=>{
        previous.call(material,shader);Object.assign(shader.uniforms,uniforms);
        shader.vertexShader='varying vec3 vOrbFadePosition;\n'+shader.vertexShader;
        // Wind materials replace project_vertex. mvPosition is available
        // here after instancing AND wind, so leaves use their actual position.
        shader.vertexShader=shader.vertexShader.replace('#include <logdepthbuf_vertex>',`vOrbFadePosition=vec3(
          dot(viewMatrix[0].xyz,mvPosition.xyz),dot(viewMatrix[1].xyz,mvPosition.xyz),dot(viewMatrix[2].xyz,mvPosition.xyz))+cameraPosition;
          #include <logdepthbuf_vertex>`);
        shader.fragmentShader='varying vec3 vOrbFadePosition;uniform vec3 orbFadeCamera,orbFadeTarget;uniform float orbFadeAmount;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
          vec3 line=orbFadeTarget-orbFadeCamera;float length2=max(dot(line,line),.001);
          float along=dot(vOrbFadePosition-orbFadeCamera,line)/length2;
          float distanceToLine=length(vOrbFadePosition-(orbFadeCamera+clamp(along,0.,1.)*line));
          float mask=(1.-smoothstep(.19,.34,distanceToLine))*smoothstep(-.03,.03,along)*(1.-smoothstep(.88,1.02,along))*orbFadeAmount;
          float dither=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
          if(dither>1.-mask*.84)discard;`);
      };
      material.customProgramCacheKey=()=>key+'-orb-camera-fade-v2';material.needsUpdate=true;
    }
  });
  return {uniforms,update(camera,target,enabled,dt){uniforms.orbFadeCamera.value.copy(camera);uniforms.orbFadeTarget.value.copy(target);uniforms.orbFadeAmount.value=T.MathUtils.damp(uniforms.orbFadeAmount.value,enabled?1:0,10,dt);}};
}
