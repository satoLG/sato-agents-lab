const $=id=>document.getElementById(id);
const container=$('orb-scene'),settings=$('orb-settings'),settingsToggle=$('orb-settings-toggle');
const motionPreference=window.matchMedia('(prefers-reduced-motion:reduce)');
const inputs=[['orb-wave-strength',55,'%'],['orb-wave-speed',100,'×'],['orb-water-clarity',70,'%']];
const viewButtons=[...document.querySelectorAll('[data-view]')];
const sceneButtons=['orb-zoom-in','orb-zoom-out','orb-reset-view','orb-auto-orbit','orb-pause-motion'];
let scene=null,paused=motionPreference.matches,autoOrbit=false,loading=false;

function announce(message){$('orb-status').textContent=message;}
function motionState() {
  const button=$('orb-pause-motion');button.setAttribute('aria-pressed',String(paused));
  button.setAttribute('aria-label',paused?'Retomar movimento':'Pausar movimento');button.title=paused?'Retomar movimento':'Pausar movimento';
  $('orb-motion-icon').setAttribute('href',paused?'#orb-play':'#orb-pause');
  $('orb-auto-orbit').setAttribute('aria-pressed',String(autoOrbit));
}
function setViews(view) {for(const button of viewButtons)button.setAttribute('aria-pressed',String(button.dataset.view===view));}
function panel(open,{restoreFocus=true}={}) {
  settings.hidden=!open;settingsToggle.setAttribute('aria-expanded',String(open));
  if(open)$('orb-settings-close').focus();else if(restoreFocus)settingsToggle.focus();
}
function error(message) {
  $('orb-loading').hidden=true;$('orb-error').hidden=false;
  if(message)$('orb-error-detail').textContent=message;
  for(const id of sceneButtons)$(id).disabled=true;
  for(const button of viewButtons)button.disabled=true;
  settingsToggle.disabled=true;settings.hidden=true;settingsToggle.setAttribute('aria-expanded','false');
}
function updateInput(id,value,suffix) {
  $(id+'-value').value=suffix==='×'?(value/100).toFixed(1)+suffix:value+suffix;
  if(id==='orb-wave-strength')scene?.setStrength(value/100);
  else if(id==='orb-wave-speed')scene?.setSpeed(value/100);
  else scene?.setClarity(value/100);
}

async function start() {
  if(loading)return;loading=true;$('orb-error').hidden=true;$('orb-loading').hidden=false;$('orb-loading').classList.remove('leaving');
  try {
    const {createOrbScene}=await import('./orb-scene.js');
    scene=await createOrbScene(container,{
      reducedMotion:motionPreference.matches,
      onCameraChange:zoom=>{$('orb-zoom-label').value=zoom.toFixed(1)+'×';},
      onManualOrbit:()=>{autoOrbit=false;motionState();},
      onError:error,
    });
    for(const id of sceneButtons)$(id).disabled=false;
    for(const button of viewButtons)button.disabled=false;
    settingsToggle.disabled=false;
    setViews('world');
    for(const [id,,suffix] of inputs)updateInput(id,Number($(id).value),suffix);
    scene.setPaused(paused);scene.setAutoOrbit(autoOrbit);motionState();
    $('orb-loading').classList.add('leaving');setTimeout(()=>{$('orb-loading').hidden=true;},motionPreference.matches?0:700);
    announce('Seu mundo está pronto. Arraste para explorar ou escolha A ilha.');
  } catch(e) {
    console.error('orb:',e);
    error(e.message==='WEBGL_UNAVAILABLE'?null:'Não foi possível preparar a visualização 3D. Tente recarregar a página ou usar outro navegador com aceleração gráfica ativada.');
  } finally {loading=false;}
}

for(const button of viewButtons)button.addEventListener('click',()=>{scene?.setView(button.dataset.view);setViews(button.dataset.view);announce(button.dataset.view==='island'?'Vista da ilha.':'Vista do mundo.');});
$('orb-zoom-in').addEventListener('click',()=>scene?.zoom(.86));
$('orb-zoom-out').addEventListener('click',()=>scene?.zoom(1.16));
$('orb-reset-view').addEventListener('click',()=>{scene?.reset();setViews('world');announce('Vista inicial restaurada.');});
container.addEventListener('keydown',event=>{if(event.key==='0')setViews('world');});
$('orb-auto-orbit').addEventListener('click',()=>{autoOrbit=!autoOrbit;if(autoOrbit&&paused){paused=false;scene?.setPaused(false);}scene?.setAutoOrbit(autoOrbit);motionState();});
$('orb-pause-motion').addEventListener('click',()=>{paused=!paused;scene?.setPaused(paused);motionState();announce(paused?'Movimento pausado. Você ainda pode girar e aproximar.':'Movimento retomado.');});
settingsToggle.addEventListener('click',()=>panel(settings.hidden));
$('orb-settings-close').addEventListener('click',()=>panel(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!settings.hidden)panel(false);});
document.addEventListener('pointerdown',event=>{if(!settings.hidden&&!settings.contains(event.target)&&!settingsToggle.contains(event.target))panel(false,{restoreFocus:false});});
for(const [id,,suffix] of inputs)$(id).addEventListener('input',()=>updateInput(id,Number($(id).value),suffix));
$('orb-reset-settings').addEventListener('click',()=>{for(const [id,value,suffix] of inputs){$(id).value=value;updateInput(id,value,suffix);}announce('Oceano restaurado.');});
$('orb-retry').addEventListener('click',()=>location.reload());
if(!document.fullscreenEnabled)$('orb-fullscreen').hidden=true;
else $('orb-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('orb-experience').requestFullscreen();}catch{announce('Tela cheia indisponível neste navegador.');}});
document.addEventListener('fullscreenchange',()=>{$('orb-fullscreen').setAttribute('aria-label',document.fullscreenElement?'Sair da tela cheia':'Tela cheia');});
motionPreference.addEventListener('change',event=>{if(event.matches){paused=true;autoOrbit=false;scene?.setPaused(true);scene?.setAutoOrbit(false);motionState();}});
window.addEventListener('pagehide',()=>{scene?.dispose();scene=null;});
window.addEventListener('pageshow',event=>{if(event.persisted&&!scene)start();});
motionState();
for(const id of sceneButtons)$(id).disabled=true;
for(const button of viewButtons)button.disabled=true;
settingsToggle.disabled=true;
start();
