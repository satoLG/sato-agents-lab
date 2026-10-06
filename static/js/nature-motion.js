// One uniform update per rendered frame; instance transforms stay on the GPU.
const time={value:0};
export function updateNature(timeSeconds,reduced=false){time.value=reduced?0:timeSeconds;}

export function windMaterial(material,{strength=.13,anchored=false}={}){
 const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  shader.uniforms.natureTime=time;
  shader.vertexShader='uniform float natureTime;\n'+shader.vertexShader;
  // Displace after instancing, so scale/rotation do not turn breeze into stretching.
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
   vec4 mvPosition=vec4(transformed,1.0);
   #ifdef USE_BATCHING
    mvPosition=batchingMatrix*mvPosition;
   #endif
   #ifdef USE_INSTANCING
    mvPosition=instanceMatrix*mvPosition;
   #endif
   float phase=mvPosition.x*.49+mvPosition.z*.32;
   float gust=sin(natureTime*.85+phase)*.64+sin(natureTime*1.63+phase*.57)*.36;
   float anchor=${anchored?'clamp(position.y,0.,1.)':'1.'};
   mvPosition.xz+=vec2(gust,sin(natureTime*.73+phase)*.4)*${strength.toFixed(3)}*anchor;
   mvPosition.y+=sin(natureTime*1.17+phase)*${(strength*.12).toFixed(4)}*anchor;
   mvPosition=modelViewMatrix*mvPosition;
   gl_Position=projectionMatrix*mvPosition;`);
 };
 material.customProgramCacheKey=()=>`${key}-breeze-${strength}-${anchored}`;
 material.userData.natureTime=time;
 return material;
}
