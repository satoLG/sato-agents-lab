import {indicatorCards} from './telemetry-indicators.js';
import {renderReadings,renderHistory,renderModels} from './telemetry-ui.js';
export function createEquipmentUI(getScene){
 const panel=document.createElement('section');panel.id='equipment-panel';panel.className='overlay equipment-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Indicadores da estação');
 const usage=document.createElement('div');
 const heading=document.createElement('h2'),close=document.createElement('button'),cards=document.createElement('div'),history=document.createElement('div'),link=document.createElement('a');close.textContent='Fechar';link.textContent='Abrir dashboard';link.href='/dashboard';cards.className='equipment-cards';history.className='execution-history';panel.append(close,heading,cards,usage,history,link);document.getElementById('lab').append(panel);
 let channels={},boards={},sector='',renderKey='';
 function render(){
  const readings=indicatorCards(sector,channels),key=JSON.stringify([sector,readings,boards[sector],sector==='models'?[channels.stats,channels.models]:null]);if(key===renderKey)return;renderKey=key;
  const scroll=panel.scrollTop;
  renderReadings(cards,readings);renderHistory(history,boards[sector]);
  usage.hidden=sector!=='models';if(sector==='models')renderModels(usage,channels);
  panel.scrollTop=scroll;
 }
 function hide(){panel.hidden=true;document.body.dataset.equipment='false';document.querySelectorAll('#scene,.hud-top,.hud-bottom,.player-controls').forEach(el=>el.inert=false);document.getElementById('scene').focus({preventScroll:true});}
 close.addEventListener('click',hide);document.addEventListener('keydown',e=>{if(panel.hidden)return;if(e.key==='Escape')hide();if(e.key==='Tab'){const first=close,last=link;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 return {update(value,logs={}){channels=value;boards=logs;if(!panel.hidden)render();},open(id,zoom=false){sector=id;link.href='/dashboard#/'+({models:'providers',hermes:'atividade',mcp:'mcps',memory:'memoria'}[id]||id);getScene()?.stopWalking();heading.textContent=({hermes:'Núcleo',models:'Providers',gateway:'Gateway',mcp:'MCPs',memory:'Memória',rag:'RAG',cron:'Cron e webhooks',vm:'VM'})[id]||id;render();panel.hidden=false;document.body.dataset.equipment='true';document.querySelectorAll('#scene,.hud-top,.hud-bottom,.player-controls').forEach(el=>el.inert=true);if(zoom)history.scrollIntoView({block:'start'});close.focus({preventScroll:true});}};
}
