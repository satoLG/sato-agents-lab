import {createOrbLoading} from './orb-loading.js';
import {createOrbAmbience} from './orb-audio.js';

const $=id=>document.getElementById(id),container=$('orb-scene');
const motionPreference=matchMedia('(prefers-reduced-motion:reduce)');
let scene=null,loader=null,paused=motionPreference.matches,entered=false,loading=false;
let ambience=null;
const timers=[];
function updateAudio({muted,available}) {
  const button=$('orb-sound');button.hidden=!entered||!available;
  button.setAttribute('aria-pressed',String(!muted));button.setAttribute('aria-label',muted?'Ativar som do mar':'Silenciar som do mar');
  button.title=muted?'Ativar som do mar (M)':'Silenciar som do mar (M)';
}
function error(message) {
  loader?.stop();$('orb-loading').hidden=true;$('orb-blur').hidden=true;$('orb-error').hidden=false;
  if(message)$('orb-error-detail').textContent=message;
  container.inert=true;scene?.dispose();scene=null;ambience?.dispose();$('orb-sound').hidden=true;
}
async function start() {
  if(loading)return;loading=true;entered=false;delete document.body.dataset.started;container.inert=true;$('orb-error').hidden=true;
  ambience=createOrbAmbience({onChange:updateAudio});$('orb-sound').hidden=true;
  const audioReady=ambience.prepare().catch(error=>console.warn('orb foley:',error.message));
  loader=createOrbLoading({reducedMotion:motionPreference.matches});loader.setProgress(.03);
  try {
    const {createOrbScene}=await import('./orb-scene.js');
    scene=await createOrbScene(container,{
      reducedMotion:motionPreference.matches,onProgress:value=>loader.setProgress(value*.97),
      getLoadingDiameter:()=>parseFloat(getComputedStyle($('orb-start')).width)||140,
      onCameraChange:zoom=>{container.dataset.zoom=zoom.toFixed(2);},onError:error,
      onContact:event=>ambience?.playContact(event),
      onSound:event=>ambience?.playEffect(event),
    });
    scene.setPaused(true);await audioReady;loader.setProgress(1);
    if(await loader.ready)$('orb-status').textContent='Seu mundo está pronto. Ative Entrar na orb para explorar.';
  } catch(e) {
    console.error('orb:',e);error(e.message==='WEBGL_UNAVAILABLE'?null:'Não foi possível preparar a visualização 3D. Tente recarregar a página ou usar outro navegador com aceleração gráfica ativada.');
  } finally {loading=false;}
}
$('orb-start').addEventListener('click',()=>{
  if(!scene||entered||$('orb-start').disabled)return;
  entered=true;document.body.dataset.started='true';container.inert=false;scene.enter();scene.setPaused(paused);
  ambience.start();
  $('orb-start').classList.add('bounce-out');$('orb-loading').classList.add('leaving');$('orb-blur').classList.add('fade-out');
  const duration=motionPreference.matches?0:600;
  timers.push(setTimeout(()=>{$('orb-loading').hidden=true;},duration));
  timers.push(setTimeout(()=>{$('orb-blur').hidden=true;},motionPreference.matches?0:2000));
  container.focus({preventScroll:true});$('orb-status').textContent='Arraste para explorar. Use a roda ou dois dedos para aproximar. M ativa ou silencia o som do mar.';
});
container.addEventListener('keydown',event=>{if(event.code==='Space'&&entered&&!scene?.playing){event.preventDefault();paused=!paused;scene?.setPaused(paused);$('orb-status').textContent=paused?'Movimento pausado.':'Movimento retomado.';}else if(event.key.toLowerCase()==='m'&&entered){event.preventDefault();ambience?.toggleMuted();}});
$('orb-sound').addEventListener('click',()=>ambience?.toggleMuted());
document.addEventListener('visibilitychange',()=>ambience?.setHidden(document.hidden));
$('orb-retry').addEventListener('click',()=>location.reload());
motionPreference.addEventListener('change',event=>{paused=event.matches;scene?.setPaused(!entered||paused);});
window.addEventListener('pagehide',()=>{loader?.stop();for(const timer of timers)clearTimeout(timer);scene?.dispose();scene=null;ambience?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted&&!scene)start();});
start();
