import {indicatorCards} from './telemetry-indicators.js';
import {renderReadings,renderHistory,renderModels} from './telemetry-ui.js';
const sections=[...document.querySelectorAll('[data-live-sector]')];
let channels={},boards={},stream=null,lastSample=0,staleTimer=null,status='Conectando…';
function render(){
 for(const section of sections){
  if(section.closest('[role=tabpanel]').hidden)continue;
  section.querySelector('[role=status]').textContent=status;
  renderReadings(section.querySelector('.stat-grid'),indicatorCards(section.dataset.liveSector,channels));
  renderHistory(section.querySelector('[data-live-history]'),boards[section.dataset.liveSector]);
  const usage=section.querySelector('[data-model-usage]');if(usage)renderModels(usage,channels);
 }
}
function unavailable(message){channels={};boards={};status=message;render();}
function connect(){
 if(document.hidden||stream)return;
 stream=new EventSource('/api/lab/stream');
 stream.addEventListener('telemetry',e=>{
  clearTimeout(staleTimer);staleTimer=null;
  try{
   const payload=JSON.parse(e.data);if(payload.error){unavailable('Fonte indisponível');return;}
   lastSample=Date.now();channels=payload.channels||{};boards=payload.boards||{};
   status=`Leitura ${new Date(payload.state.now).toLocaleTimeString('pt-BR')}`;render();
  }catch{unavailable('Leitura indisponível');}
 });
 stream.onerror=()=>{if(!staleTimer)staleTimer=setTimeout(()=>{staleTimer=null;unavailable('Reconectando…');},Math.max(0,5000-(Date.now()-lastSample)));};
}
document.addEventListener('dashboard:tab',render);
document.addEventListener('visibilitychange',()=>{if(document.hidden){stream?.close();stream=null;clearTimeout(staleTimer);staleTimer=null;}else{if(Date.now()-lastSample>5000)unavailable('Reconectando…');connect();}});
connect();render();
