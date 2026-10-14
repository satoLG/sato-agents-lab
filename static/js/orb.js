import {createOrbLoading} from './orb-loading.js';

const $=id=>document.getElementById(id),container=$('orb-scene');
const motionPreference=matchMedia('(prefers-reduced-motion:reduce)');
let scene=null,loader=null,paused=motionPreference.matches,entered=false,loading=false;
const timers=[];
function error(message) {
  loader?.stop();$('orb-loading').hidden=true;$('orb-blur').hidden=true;$('orb-error').hidden=false;
  if(message)$('orb-error-detail').textContent=message;
  container.inert=true;scene?.dispose();scene=null;
}
async function start() {
  if(loading)return;loading=true;entered=false;delete document.body.dataset.started;container.inert=true;$('orb-error').hidden=true;
  loader=createOrbLoading({reducedMotion:motionPreference.matches});loader.setProgress(.03);
  try {
    const {createOrbScene}=await import('./orb-scene.js');
    scene=await createOrbScene(container,{
      reducedMotion:motionPreference.matches,onProgress:value=>loader.setProgress(value),
      onCameraChange:zoom=>{container.dataset.zoom=zoom.toFixed(2);},onError:error,
    });
    scene.setPaused(true);
    if(await loader.ready)$('orb-status').textContent='Seu mundo está pronto. Ative Entrar na orb para explorar.';
  } catch(e) {
    console.error('orb:',e);error(e.message==='WEBGL_UNAVAILABLE'?null:'Não foi possível preparar a visualização 3D. Tente recarregar a página ou usar outro navegador com aceleração gráfica ativada.');
  } finally {loading=false;}
}
$('orb-start').addEventListener('click',()=>{
  if(!scene||entered||$('orb-start').disabled)return;
  entered=true;document.body.dataset.started='true';container.inert=false;scene.setPaused(paused);
  $('orb-start').classList.add('bounce-out');$('orb-blur').classList.add('fade-out');
  const duration=motionPreference.matches?0:600;
  timers.push(setTimeout(()=>{$('orb-loading').classList.add('leaving');$('orb-loading').hidden=true;},duration));
  timers.push(setTimeout(()=>{$('orb-blur').hidden=true;},motionPreference.matches?0:2000));
  container.focus({preventScroll:true});$('orb-status').textContent='Arraste para explorar. Use a roda ou dois dedos para aproximar.';
});
container.addEventListener('keydown',event=>{if(event.code==='Space'&&entered){event.preventDefault();paused=!paused;scene?.setPaused(paused);$('orb-status').textContent=paused?'Movimento pausado.':'Movimento retomado.';}});
$('orb-retry').addEventListener('click',()=>location.reload());
motionPreference.addEventListener('change',event=>{paused=event.matches;scene?.setPaused(!entered||paused);});
window.addEventListener('pagehide',()=>{loader?.stop();for(const timer of timers)clearTimeout(timer);scene?.dispose();scene=null;});
window.addEventListener('pageshow',event=>{if(event.persisted&&!scene)start();});
start();
