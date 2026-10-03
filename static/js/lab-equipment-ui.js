import {indicatorCards} from './lab-monitors.js';
import {boardRows} from './lab-history.js';
export function createEquipmentUI(getScene){
 const panel=document.createElement('section');panel.id='equipment-panel';panel.className='overlay equipment-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Indicadores da estação');
 const heading=document.createElement('h2'),close=document.createElement('button'),cards=document.createElement('div'),history=document.createElement('div'),link=document.createElement('a');close.textContent='Fechar';link.textContent='Abrir dashboard';link.href='/dashboard';cards.className='equipment-cards';history.className='execution-history';panel.append(close,heading,cards,history,link);document.getElementById('lab').append(panel);
 let channels={},boards={},sector='',renderKey='';
 function render(){
  const readings=indicatorCards(sector,channels),key=JSON.stringify([sector,readings,boards[sector]]);if(key===renderKey)return;renderKey=key;
  const scroll=panel.scrollTop,expanded=new Set([...history.querySelectorAll('details[open]')].map(el=>el.dataset.key));
  cards.replaceChildren(...readings.map(c=>{const el=document.createElement('article'),title=document.createElement('small'),value=document.createElement('strong'),detail=document.createElement('p');title.textContent=c.title;value.textContent=c.value;detail.textContent=`${c.detail} · ${c.source}`;el.append(title,value,detail);return el;}));
  history.replaceChildren();
  for(const [label,rows]of [['Próximos agendamentos',boards[sector]?.upcoming||[]],['Histórico de execuções',boards[sector]?.rows||[]]]){
   if(!rows.length)continue;const h=document.createElement('h3');h.textContent=label;history.append(h);
   for(const row of rows){const detail=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('dl');const date=new Date(row.when);detail.dataset.key=JSON.stringify([sector,row.when,row.name,row.kind]);detail.open=expanded.has(detail.dataset.key);summary.textContent=`${Number.isNaN(+date)?'—':date.toLocaleString('pt-BR')} · ${row.name||'—'} · ${row.status}`;for(const [key,value]of Object.entries(row)){if(value===null||value===undefined)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=({when:'Horário',name:'Execução',status:'Status',kind:'Tipo',source:'Fonte',model:'Modelo',duration_ms:'Duração (ms)',end_time:'Término',exit_code:'Código de saída',response_status:'Resposta HTTP'})[key]||key;dd.textContent=String(value);body.append(dt,dd);}detail.append(summary,body);history.append(detail);}
  }
  panel.scrollTop=scroll;
 }
 function hide(){panel.hidden=true;document.body.dataset.equipment='false';document.querySelectorAll('#scene,.hud-top,.hud-bottom,.player-controls').forEach(el=>el.inert=false);document.getElementById('scene').focus({preventScroll:true});}
 close.addEventListener('click',hide);document.addEventListener('keydown',e=>{if(panel.hidden)return;if(e.key==='Escape')hide();if(e.key==='Tab'){const first=close,last=link;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 return {update(value,logs={}){channels=value;boards=logs;if(!panel.hidden)render();},open(id,zoom=false){sector=id;getScene()?.stopWalking();heading.textContent=id==='cron'?'EVENTS':id.toUpperCase();render();panel.hidden=false;document.body.dataset.equipment='true';document.querySelectorAll('#scene,.hud-top,.hud-bottom,.player-controls').forEach(el=>el.inert=true);if(zoom)history.scrollIntoView({block:'start'});close.focus({preventScroll:true});}};
}
