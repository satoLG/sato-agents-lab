import * as T from '../vendor/three.module.min.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {GLTFExporter} from '../vendor/GLTFExporter.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {createCompanionModel} from './companion-model.js';

const $=id=>document.getElementById(id),host=$('model-canvas');
let renderer;
try{renderer=new T.WebGLRenderer({antialias:true});}
catch(error){$('model-loading').hidden=true;$('model-error').hidden=false;$('model-error').textContent='Não foi possível iniciar o 3D. Verifique se WebGL está ativado no navegador.';throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;host.append(renderer.domElement);
const world=new T.Scene();world.background=new T.Color('#111e29');
const camera=new T.PerspectiveCamera(38,1,.01,1000),controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.minDistance=.1;controls.maxDistance=150;
world.add(new T.HemisphereLight('#dbf3ff','#687b83',2.8));
for(const [x,y,z,intensity] of [[3,5,4,3],[-4,2,-3,2]]){const light=new T.DirectionalLight('#ecf8ff',intensity);light.position.set(x,y,z);world.add(light);}
const grid=new T.GridHelper(20,40,'#416071','#243b4a');grid.position.y=-.004;world.add(grid);
const mount=new T.Group();world.add(mount);
let asset=null,mixer=null,action=null,helper=null,playing=false,generation=0,exporting=false;
let meshes=[],originalTransforms=[],sourceBlob=null,sourceName='sato',radius=2,center=new T.Vector3(),last=0;
const transform=n=>({node:n,position:n.position.clone(),quaternion:n.quaternion.clone(),scale:n.scale.clone(),visible:n.visible});
const restore=states=>{for(const s of states){s.node.position.copy(s.position);s.node.quaternion.copy(s.quaternion);s.node.scale.copy(s.scale);s.node.visible=s.visible;}};
function release(g){
 if(!g)return;const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
 g.scene.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.skeleton)skeletons.add(n.skeleton);for(const m of n.material?(Array.isArray(n.material)?n.material:[n.material]):[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
 for(const item of [...geometries,...materials,...textures,...skeletons])item.dispose();
}
function setPlaying(value){playing=!!action&&value;$('play-animation').textContent=playing?'Pausar':'Reproduzir';$('play-animation').setAttribute('aria-pressed',String(playing));}
function syncTime(){const duration=action?.getClip().duration||0;$('animation-time').value=action?.time||0;$('time-label').value=`${(action?.time||0).toFixed(2)} / ${duration.toFixed(2)} s`;}
function seek(time){if(!action)return;setPlaying(false);action.reset().play();action.time=Math.min(action.getClip().duration,Math.max(0,time));mixer.update(0);syncTime();}
function configureLoop(){if(!action)return;action.setLoop($('animation-loop').checked?T.LoopRepeat:T.LoopOnce,Infinity);action.clampWhenFinished=true;}
function selectClip(){
 setPlaying(false);mixer.stopAllAction();restore(originalTransforms);
 const clip=asset.animations[Number($('clip-select').value)];
 action=clip?mixer.clipAction(clip).reset().play():null;
 for(const id of ['play-animation','restart-animation','step-animation','animation-time'])$(id).disabled=!action;
 if(action){configureLoop();mixer.update(0);$('animation-time').max=clip.duration;}
 applyInspection();syncTime();
}
function frame(view='front'){
 if(asset){mount.updateMatrixWorld(true);const box=new T.Box3().setFromObject(mount);box.getCenter(center);radius=Math.max(box.getSize(new T.Vector3()).length()/2,.1);}
 const vector={front:[0,.2,1],side:[1,.2,0],back:[0,.2,-1]}[view]||[0,.2,1];
 const distance=radius/Math.sin(T.MathUtils.degToRad(camera.fov/2))/Math.min(1,camera.aspect)*1.12;
 controls.target.copy(center);camera.position.copy(center).add(new T.Vector3(...vector).normalize().multiplyScalar(distance));
 camera.near=Math.max(.001,radius/1000);camera.far=Math.max(100,radius*100);camera.updateProjectionMatrix();controls.update();
}
function applyInspection(){
 if(helper)helper.visible=$('show-skeleton').checked;grid.visible=$('show-grid').checked;
 const index=$('mesh-select').value,isolated=$('isolate-mesh').checked&&index!=='';
 meshes.forEach((mesh,i)=>{mesh.visible=!isolated||i===Number(index);for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.wireframe=$('show-wireframe').checked;});
 const mesh=index===''?null:meshes[Number(index)];
 $('mesh-detail').textContent=mesh?`${mesh.name||'Malha'} · ${mesh.geometry.attributes.position.count.toLocaleString('pt-BR')} vértices · ${[mesh.material].flat().map(m=>m.name||m.type).join(', ')}${mesh.isSkinnedMesh?' · vinculada ao esqueleto':''}`:'Selecione uma peça para conferir sua geometria e material.';
}
function stats(){
 let vertices=0,triangles=0,bones=0;const materials=new Set();asset.scene.traverse(n=>{if(n.isBone)bones++;if(n.isMesh){vertices+=n.geometry.attributes.position.count;triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;[n.material].flat().forEach(m=>materials.add(m));}});
 $('model-stats').replaceChildren();
 for(const [label,value]of [['Malhas',meshes.length],['Vértices',vertices],['Triângulos',Math.round(triangles)],['Ossos',bones],['Materiais',materials.size],['Clipes',asset.animations.length]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value.toLocaleString('pt-BR');$('model-stats').append(dt,dd);}
}
async function loadModel(kind,file=null){
 const token=++generation;setPlaying(false);action=null;
 $('model-loading').hidden=false;$('model-progress').value=15;$('model-stage').textContent='Carregando modelo…';$('model-error').hidden=true;
 for(const id of ['export-model','clip-select','play-animation','restart-animation','step-animation','animation-time'])$(id).disabled=true;
 $('export-status').textContent='';
 try{
  let next,blob=null;
  if(kind==='companion'){next=createCompanionModel();}
  else{blob=file||await fetch(new URL('../models/sato.glb',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Não foi possível carregar o GLB.');return r.blob();});next=await new GLTFLoader().parseAsync(await blob.arrayBuffer(),'');}
  if(token!==generation){release(next);return;}
  if(mixer){mixer.stopAllAction();mixer.uncacheRoot(asset.scene);}if(helper){world.remove(helper);helper.dispose();helper=null;}
  mount.clear();release(asset);asset=next;sourceBlob=blob;sourceName=file?file.name.replace(/\.glb$/i,''):kind;
  meshes=[];originalTransforms=[];asset.scene.traverse(n=>{originalTransforms.push(transform(n));if(n.isMesh){meshes.push(n);n.frustumCulled=false;}});
  mount.position.set(0,0,0);mount.add(asset.scene);mount.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(asset.scene),size=box.getSize(new T.Vector3()),mid=box.getCenter(new T.Vector3());
  if(box.isEmpty()||!Number.isFinite(size.length())||size.length()<1e-8)throw new Error('O arquivo não contém geometria visível.');
  mount.position.set(-mid.x,-box.min.y,-mid.z);center.set(0,size.y/2,0);radius=Math.max(size.length()/2,.1);
  helper=new T.SkeletonHelper(asset.scene);helper.material.depthTest=false;helper.renderOrder=10;world.add(helper);
  mixer=new T.AnimationMixer(asset.scene);mixer.addEventListener('finished',()=>setPlaying(false));
  $('clip-select').replaceChildren(...asset.animations.map((c,i)=>new Option(c.name,String(i))));
  const idle=asset.animations.findIndex(c=>c.name==='Rig|Idle_Loop'||c.name==='Float_Idle');if(idle>=0)$('clip-select').value=String(idle);
  if(!asset.animations.length)$('clip-select').add(new Option('Sem animações',''));$('clip-select').disabled=!asset.animations.length;
  $('mesh-select').replaceChildren(new Option('Modelo completo',''),...meshes.map((m,i)=>new Option(m.name||`Malha ${i+1}`,String(i))));
  $('model-description').textContent=file?file.name:kind==='sato'?'O humanoide original do lab, com todos os clipes do GLB.':'A mesma geometria da home, com peças separadas e movimentos de flutuação exportáveis.';
  $('model-select').querySelector('option[value="local"]')?.remove();if(file){const option=new Option(file.name,'local',true,true);option.disabled=true;$('model-select').add(option);}
  $('export-model').disabled=false;$('model-progress').value=100;stats();selectClip();frame();$('model-loading').hidden=true;
  host.dataset.model=kind;
 }catch(error){if(token!==generation)return;$('model-loading').hidden=true;$('model-error').hidden=false;$('model-error').textContent=`${error.message} Selecione outro modelo ou abra um GLB válido.`;}
}
async function exportModel(){
 if(!asset||exporting)return;exporting=true;for(const id of ['export-model','model-select','model-file'])$(id).disabled=true;$('export-status').textContent='Preparando GLB…';
 const states=[];asset.scene.traverse(n=>states.push(transform(n)));const resume=playing;setPlaying(false);
 try{
  let blob=sourceBlob;
  if(!blob){restore(originalTransforms);const flags=new Map();meshes.forEach(n=>[n.material].flat().forEach(m=>{flags.set(m,m.wireframe);m.wireframe=false;}));
   try{const result=await new GLTFExporter().parseAsync(asset.scene,{binary:true,animations:asset.animations,onlyVisible:false});blob=new Blob([result],{type:'model/gltf-binary'});}
   finally{for(const [m,value]of flags)m.wireframe=value;}
  }
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${sourceName}.glb`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('export-status').textContent='GLB pronto para edição no Blender. Para conferir uma revisão, use “Abrir GLB local”.';
 }catch(error){$('export-status').textContent=`Falha ao exportar: ${error.message}`;}
 finally{restore(states);setPlaying(resume);exporting=false;for(const id of ['export-model','model-select','model-file'])$(id).disabled=false;}
}
$('model-select').onchange=()=>loadModel($('model-select').value);
$('model-file').onchange=()=>{const file=$('model-file').files[0];if(file)loadModel('local',file);$('model-file').value='';};
$('clip-select').onchange=selectClip;$('play-animation').onclick=()=>{if(action?.paused||action?.time>=action?.getClip().duration)action.reset().play();setPlaying(!playing);};
$('restart-animation').onclick=()=>seek(0);$('step-animation').onclick=()=>seek((action?.time||0)+1/30);
$('animation-time').oninput=()=>seek(Number($('animation-time').value));$('animation-loop').onchange=configureLoop;
for(const id of ['show-wireframe','show-skeleton','show-grid','mesh-select','isolate-mesh'])$(id).onchange=applyInspection;
$('frame-model').onclick=()=>frame();for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>frame(button.dataset.view);
$('export-model').onclick=exportModel;
const observer=new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();});observer.observe(host);
renderer.setAnimationLoop(ms=>{const dt=Math.min(.05,(ms-last)/1000||0);last=ms;if(playing&&action){action.paused=false;mixer.update(dt*Number($('animation-speed').value));syncTime();}controls.update();renderer.render(world,camera);});
window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);observer.disconnect();controls.dispose();helper?.dispose();release(asset);renderer.dispose();});
loadModel('sato');
