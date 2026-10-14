import * as T from '../vendor/three.module.min.js';

// Adapted from satoLG/portfolio src/effects/SceneDepth.ts at e32fd55a0182186d89054ca4bf5628b24b887435.
// Actual opaque geometry drives the contact mask, including models added later.
export function createOrbDepth(renderer,scene,uniforms) {
  const size=new T.Vector2(),material=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide});
  let target=null,lastState=null;
  function resize() {
    renderer.getDrawingBufferSize(size);
    uniforms._SceneResolution.value.copy(size);
    // This small scene can afford full resolution: it keeps the narrow sphere
    // contact line from turning into the half-resolution pre-pass's stair steps.
    const width=Math.max(1,Math.round(size.x)),height=Math.max(1,Math.round(size.y));
    if(target&&target.width===width&&target.height===height)return;
    if(target){target.depthTexture.dispose();target.dispose();}
    const texture=new T.DepthTexture(width,height,T.UnsignedIntType);
    texture.minFilter=texture.magFilter=T.NearestFilter;
    target=new T.WebGLRenderTarget(width,height,{depthTexture:texture,depthBuffer:true,minFilter:T.NearestFilter,magFilter:T.NearestFilter});
    uniforms._SceneDepth.value=texture;
    uniforms._SceneTexelSize.value.set(1/width,1/height);lastState=null;
  }
  function capture(camera) {
    resize();uniforms._CameraNear.value=camera.near;uniforms._CameraFar.value=camera.far;
    scene.updateMatrixWorld();camera.updateMatrixWorld();
    const state=[...camera.matrixWorld.elements,...camera.projectionMatrix.elements];
    let animated=false;
    scene.traverseVisible(object=>{
      if(!object.isMesh)return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(materials.some(m=>m.transparent||m.alphaTest>0||!m.depthWrite))return;
      for(let parent=object;parent;parent=parent.parent)if(parent.userData.orbFoamExclude)return;
      state.push(object.id,object.geometry.id,object.geometry.attributes.position?.version??0,object.geometry.index?.version??0,object.instanceMatrix?.version??0,object.count??0,...object.matrixWorld.elements);
      animated||=object.isSkinnedMesh||object.userData.dynamic===true;
    });
    // Water deformation does not change the opaque depth. Cache it while the
    // camera/contact geometry is still, but invalidate for transforms, added
    // models, visibility, buffer updates, animation and resize.
    if(!animated&&lastState&&state.length===lastState.length&&state.every((v,i)=>v===lastState[i]||Math.abs(v-lastState[i])<1e-7))return false;
    const hidden=[];
    scene.traverse(object=>{
      const materials=object.material?(Array.isArray(object.material)?object.material:[object.material]):[];
      // An override would otherwise turn transparent sprites and leaf cards
      // into solid occluders and grass into an un-displaced triangle at origin.
      if(object.visible&&(object.userData.orbFoamExclude||object.isSprite||object.isPoints||materials.some(m=>m.transparent||m.alphaTest>0||!m.depthWrite))){hidden.push(object);object.visible=false;}
    });
    const previousTarget=renderer.getRenderTarget(),previousOverride=scene.overrideMaterial;
    const previousShadowUpdate=renderer.shadowMap.autoUpdate,previousBackground=scene.background;
    try {
      renderer.shadowMap.autoUpdate=false;scene.background=null;scene.overrideMaterial=material;
      renderer.setRenderTarget(target);renderer.clear(true,true,false);renderer.render(scene,camera);
    } finally {
      scene.overrideMaterial=previousOverride;scene.background=previousBackground;renderer.setRenderTarget(previousTarget);renderer.shadowMap.autoUpdate=previousShadowUpdate;
      for(const object of hidden)object.visible=true;
    }
    lastState=state;return true;
  }
  return {resize,capture,dispose(){if(target){target.depthTexture.dispose();target.dispose();}material.dispose();}};
}
