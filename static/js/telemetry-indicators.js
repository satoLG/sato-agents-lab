// The same endpoints feed /dashboard. Missing or failed readings stay explicit.
export function indicatorCards(sector,channels){
 const data=key=>!channels[key]?.error&&channels[key]?.data&&!channels[key].data.error?channels[key].data:null;
 const card=(key,title,value,detail='',series=[])=>({title,value:data(key)?value??null:null,detail,source:key,series:data(key)?series:[]});
 const stats=data('stats'),vm=data('vm'),mcp=data('mcp'),memory=data('memory'),rag=data('rag'),events=data('events'),live=data('live');
 const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
 const pct=value=>numeric(value)===null?null:`${value}%`;
 const gauge=(key,title,value,detail)=>({...card(key,title,pct(value),detail),progress:numeric(value)});
 const disks=vm?.filesystems||[],disk=disks.find(d=>d.mount==='/')||disks[0];
 const processes=vm?.top_processes||live?.processes||[];
 const common=[card('stats','CHAMADAS',numeric(stats?.total_calls),stats?.month,stats?.daily?.map(d=>d.calls)),card('stats','CUSTO',numeric(stats?.total_cost)===null?null:`$ ${stats.total_cost.toFixed(4)}`,'Mês atual'),card('stats','FALLBACK',pct(stats?.fallback_rate),'Chamadas do mês'),card('vm','CPU',pct(vm?.cpu?.total),vm?.hostname),card('vm','RAM',pct(vm?.memory?.used_percent),'Memória utilizada'),card('live','PROCESSOS',live?.processes?.length,'Processos observados')];
 const specific={
  mcp:[card('mcp','SERVIDORES',mcp?.servers?.length,'Configurados / observados'),card('mcp','CHAMADAS MCP',mcp?.total_calls,`${mcp?.days??30} dias`),card('mcp','FALHAS MCP',mcp?.detail_available===false?null:mcp?.servers?.reduce((s,n)=>s+n.failures,0),'Mesma janela do dashboard')],
  memory:[card('memory','SKILLS',memory?.exists?memory?.skills?.length:null,'Catálogo em disco'),card('memory','DOCUMENTOS',memory?.exists?memory?.documents?.length:null,'Memórias / contextos'),card('memory','ARQUIVOS',memory?.exists?memory?.count:null,'Itens catalogados')],
  rag:[card('rag','VETORES / DOCS',rag?.total,'Base vetorial'),card('rag','REPOSITÓRIOS',rag?.by_repo?.length,'Fontes indexadas'),card('rag','TIPOS',rag?.by_type?Object.keys(rag.by_type).length:null,'Categorias de documentos')],
  cron:[card('events','CRON JOBS',events?.jobs?.length,'Hermes / crontab / timers'),card('events','WEBHOOKS',events?.webhooks?.available?events.webhooks.routes.length:null,events?.webhooks?.available?'Rotas configuradas':'Fonte indisponível'),card('events','FALHAS',events?.failed_runs,'Até 1000 execuções recentes')],
  vm:[gauge('vm','CPU',vm?.cpu?.total,vm?.hostname),gauge('vm','RAM',vm?.memory?.total?vm?.memory?.used_percent:null,'Memória utilizada'),gauge('vm','DISCO',disk?.used_percent,disk?.mount||'Armazenamento'),{...card(vm?.top_processes?'vm':'live','PROCESSOS',processes.length,'Processos em execução'),lines:processes.slice(0,4).map(p=>`${p.command||p.name||'Processo'} · ${p.cpu??'—'}% CPU · ${p.pid??'—'}`)},card('vm','UPTIME',typeof vm?.uptime_seconds==='number'?`${Math.floor(vm.uptime_seconds/3600)} h`:null,'Desde o boot')],
  gateway:[card('live','ENTRADAS',live?.events?.filter(e=>e.kind==='prompt').length,'Prompts / últimos 3 minutos'),common[5]],
 };
 const chosen=sector==='models'?common.slice(0,3):sector==='hermes'?[common[5],...common.slice(0,3)]:specific[sector]||[];
 return chosen.filter(c=>c.value!==null&&c.value!==undefined&&!(typeof c.value==='number'&&!Number.isFinite(c.value))).slice(0,6);
}
