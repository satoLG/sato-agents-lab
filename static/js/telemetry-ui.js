import {h,fmt} from './core.js';
const readingKeys=new WeakMap(),historyKeys=new WeakMap(),modelKeys=new WeakMap();
function changed(cache,target,value){const key=JSON.stringify(value);if(cache.get(target)===key)return false;cache.set(target,key);return true;}
export function renderReadings(target,readings){
 if(!changed(readingKeys,target,readings))return;
 target.replaceChildren(...readings.map(c=>h('article',{class:'stat'},h('small',{class:'label'},c.title),h('strong',{class:'value'},c.value),h('p',{class:'foot'},c.detail))));
 if(!readings.length)target.append(h('p',{class:'empty'},'Sem indicadores disponíveis nesta fonte.'));
}
export function renderHistory(target,board){
 if(!changed(historyKeys,target,board||null))return;
 const expanded=new Set([...target.querySelectorAll('details[open]')].map(el=>el.dataset.key));
 const labels={when:'Horário',name:'Execução',status:'Status',kind:'Tipo',source:'Fonte',model:'Modelo',provider:'Provider',duration_ms:'Duração (ms)',end_time:'Término',exit_code:'Código de saída',response_status:'Resposta HTTP'};
 const content=[];
 for(const [label,rows]of [['Próximos agendamentos',board?.upcoming||[]],['Histórico de execuções',board?.rows||[]]]){
  if(!rows.length)continue;content.push(h('h3',{},label));
  for(const row of rows){
   const key=JSON.stringify([row.when,row.name,row.kind]);
   content.push(h('details',{open:expanded.has(key),dataset:{key}},h('summary',{},`${fmt.dateTime(row.when)} · ${row.name||'—'} · ${row.status}`),h('dl',{},Object.entries(row).filter(([,v])=>v!==null&&v!==undefined).map(([k,v])=>[h('dt',{},labels[k]||k),h('dd',{},String(v))]))));
  }
 }
 target.replaceChildren(...content);
}
export function renderModelUsage(target,stats){
 const rows=stats?.models||[],fields=[['Provider',r=>r.provider||'Não registrado'],['Modelo',r=>r.model],['Chamadas',r=>fmt.num(r.calls)],['Entrada',r=>fmt.num(r.input_tokens)],['Saída',r=>fmt.num(r.output_tokens)],['Custo',r=>fmt.usd(r.cost)]];
 target.replaceChildren(h('h2',{},'Uso de modelos'),h('p',{class:'muted'},stats?.note||'Chamadas registradas no mês atual.'),rows.length?h('div',{class:'table-wrap'},h('table',{class:'stack'},h('thead',{},h('tr',{},fields.map(([label])=>h('th',{},label)))),h('tbody',{},rows.map(row=>h('tr',{},fields.map(([label,value])=>h('td',{'data-label':label},value(row)))))))):h('p',{class:'empty'},'Sem uso registrado nesta fonte.'));
}

export function renderModels(target,channels){
 if(!changed(modelKeys,target,[channels.stats?.data,channels.stats?.error,channels.models?.data,channels.models?.error]))return;
 renderModelUsage(target,channels.stats?.error?null:channels.stats?.data);
 const routing=channels.models?.error?null:channels.models?.data;
 if(routing&&!routing.error)target.append(h('h3',{},'Roteamento configurado'),h('p',{},`Principal: ${routing.primary}`),h('ul',{},(routing.fallbacks||[]).map(f=>h('li',{},`${f.provider} / ${f.model}`))));
}
