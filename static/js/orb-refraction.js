import * as T from '../vendor/three.module.min.js';

// Filter the renderer's existing transmission pass, without another scene pass.
// The pinned Three r180 target uses MSAA + generated mipmaps. Ordinary depth,
// shadow and screenshot targets keep the scene's normal appearance.
export function createOrbRefractionFilter(renderer) {
  const pass={value:0},original=renderer.setRenderTarget;
  renderer.setRenderTarget=function(target,...args) {
    pass.value=target?.samples===4&&target.texture.generateMipmaps&&target.texture.minFilter===T.LinearMipmapLinearFilter?1:0;
    if(pass.value)target.texture.name='orb-filtered-refraction';
    return original.call(this,target,...args);
  };
  const configured=new Set();
  function add(root,{cutoff=null}={}) {
    root.traverse(object=>{
      if(!object.isMesh)return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]) {
        if(configured.has(material))continue;configured.add(material);
        const previous=material.onBeforeCompile,key=material.customProgramCacheKey(),radius={value:cutoff??0};
        material.onBeforeCompile=shader=>{
          previous.call(material,shader);shader.uniforms.orbRefractionPass=pass;shader.uniforms.orbSubmergedCutoff=radius;
          shader.vertexShader='varying vec3 vOrbRefractionPosition;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 orbFilterP=vec4(transformed,1.);
            #ifdef USE_INSTANCING
              orbFilterP=instanceMatrix*orbFilterP;
            #endif
            vOrbRefractionPosition=(modelMatrix*orbFilterP).xyz;
            #include <project_vertex>`);
          if(!shader.vertexShader.includes('vOrbRefractionPosition=(modelMatrix'))shader.vertexShader=shader.vertexShader.replace('gl_Position=','vOrbRefractionPosition=(modelMatrix*vec4(position,1.)).xyz;gl_Position=');
          const discard='if(orbRefractionPass>.5&&(orbSubmergedCutoff<.1||length(vOrbRefractionPosition)>orbSubmergedCutoff))discard;';
          shader.fragmentShader='uniform float orbRefractionPass,orbSubmergedCutoff;varying vec3 vOrbRefractionPosition;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('void main() {','void main() {'+discard).replace('void main(){','void main(){'+discard);
        };
        material.customProgramCacheKey=()=>key+'-filtered-refraction-v1';
        material.needsUpdate=true;
      }
    });
  }
  return {add,pass,dispose(){renderer.setRenderTarget=original;}};
}
