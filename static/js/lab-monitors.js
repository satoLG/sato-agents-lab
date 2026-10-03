import * as T from '../vendor/three.module.min.js';
// The same endpoints feed /dashboard. Missing or failed readings stay explicit.
export function indicatorCards(sector,channels){
 const data=key=>!channels[key]?.error&&channels[key]?.data&&!channels[key].data.error?channels[key].data:null;
 const card=(key,title,value,detail='',series=[])=>({title,value:data(key)?value??null:null,detail,source:key,series:data(key)?series:[]});
 const stats=data('stats'),vm=data('vm'),mcp=data('mcp'),memory=data('memory'),rag=data('rag'),events=data('events'),live=data('live');
 const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
 const pct=value=>numeric(value)===null?null:`${value}%`;
 const common=[card('stats','CHAMADAS',numeric(stats?.total_calls),stats?.month,stats?.daily?.map(d=>d.calls)),card('stats','CUSTO',numeric(stats?.total_cost)===null?null:`$ ${stats.total_cost.toFixed(4)}`,'Mês atual'),card('stats','FALLBACK',pct(stats?.fallback_rate),'Chamadas do mês'),card('vm','CPU',pct(vm?.cpu?.total),vm?.hostname),card('vm','RAM',pct(vm?.memory?.used_percent),'Memória utilizada'),card('live','PROCESSOS',live?.processes?.length,'Processos observados')];
 const specific={
  mcp:[card('mcp','SERVIDORES',mcp?.servers?.length,'Configurados / observados'),card('mcp','CHAMADAS MCP',mcp?.total_calls,`${mcp?.days??30} dias`),card('mcp','FALHAS MCP',mcp?.detail_available===false?null:mcp?.servers?.reduce((s,n)=>s+n.failures,0),'Mesma janela do dashboard')],
  memory:[card('memory','SKILLS',memory?.exists?memory?.skills?.length:null,'Catálogo em disco'),card('memory','DOCUMENTOS',memory?.exists?memory?.documents?.length:null,'Memórias / contextos'),card('memory','ARQUIVOS',memory?.exists?memory?.count:null,'Itens catalogados')],
  rag:[card('rag','VETORES / DOCS',rag?.total,'Base vetorial'),card('rag','REPOSITÓRIOS',rag?.by_repo?.length,'Fontes indexadas'),card('rag','TIPOS',rag?.by_type?Object.keys(rag.by_type).length:null,'Categorias de documentos')],
  cron:[card('events','CRON JOBS',events?.jobs?.length,'Hermes / crontab / timers'),card('events','WEBHOOKS',events?.webhooks?.available?events.webhooks.routes.length:null,events?.webhooks?.available?'Rotas configuradas':'Fonte indisponível'),card('events','FALHAS',events?.failed_runs,'Até 1000 execuções recentes')],
  vm:[common[3],card('vm','RAM',vm?.memory?.total&&Number.isFinite(vm?.memory?.used_percent)?`${vm.memory.used_percent}%`:null,'Memória utilizada'),card('vm','UPTIME',typeof vm?.uptime_seconds==='number'?`${Math.floor(vm.uptime_seconds/3600)} h`:null,'Desde o boot')],
  gateway:[card('live','ENTRADAS',live?.events?.filter(e=>e.kind==='prompt').length,'Prompts / últimos 3 minutos'),common[5]],
 };
 const chosen=sector==='models'?common.slice(0,3):sector==='hermes'?[common[5],...common.slice(0,3)]:specific[sector]||[];
 return chosen.filter(c=>c.value!==null&&c.value!==undefined&&!(typeof c.value==='number'&&!Number.isFinite(c.value))).slice(0,6);
}
export const MONITOR_LAYOUT={width:2.5,height:1.5,columns:3,rows:2};
export function createMonitorBank(parent,{box,mesh,mat},{x=0,y=0,z=-3.1,sector=''}={}){
 const bank=new T.Group();bank.name='dashboard-monitor-bank';bank.userData.sector=sector;bank.position.set(x,y,z);parent.add(bank);
 const {width,height,columns,rows}=MONITOR_LAYOUT,displays=[];
 box(bank,8.25,3.55,.15,mat('#233844',.7,.3),0,7.25,-.11);
 for(const x of [-3.6,3.6])box(bank,.13,5.55,.13,'#687b87',x,2.775,-.18);
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const monitor=new T.Group();monitor.position.set((col-1)*(width+.16),8.05-row*(height+.16),0);bank.add(monitor);
  box(monitor,width+.055,height+.055,.09,'#233844');
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=576;const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const plane=mesh(monitor,new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map:texture}),0,0,.058,false);plane.name='dashboard-indicator-screen';plane.userData.dynamic=true;plane.userData.sectorIndicator=true;
  displays.push({canvas,texture,key:''});
 }
 let cards=[],status='Aguardando dados';
 function paint(){displays.forEach((d,i)=>{const c=cards[i],key=JSON.stringify([c,c?status:'']);if(key===d.key)return;d.key=key;const ctx=d.canvas.getContext('2d');ctx.setTransform(d.canvas.width/640,0,0,d.canvas.height/384,0,0);ctx.fillStyle='#0c252f';ctx.fillRect(0,0,640,384);
  if(!c){d.texture.needsUpdate=true;return;}
  function text(value,y,size,color){ctx.font=`600 ${size}px Nunito`;ctx.fillStyle=color;let s=String(value??'');while(ctx.measureText(s).width>570&&s.length>1)s=s.slice(0,-2)+'…';ctx.fillText(s,32,y);}
  text(c.title,55,34,'#78dfff');text(c.value,155,84,'#ecfaff');text(c.detail,208,26,'#a5c6c4');
  if(c.series?.length>1){const values=c.series.filter(Number.isFinite),max=Math.max(1,...values);ctx.strokeStyle='#78e6b1';ctx.lineWidth=4;ctx.beginPath();values.forEach((v,n)=>{const x=32+n*576/(values.length-1),y=283-v/max*68;n?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
  text(status,326,20,'#b1c2c8');text(`/dashboard · ${c.source}`,362,18,'#6f9da8');d.texture.needsUpdate=true;
 });}
 paint();return {update(lines){status=lines.slice(0,2).join(' · ');paint();},indicators(value){cards=value;paint();}};
}
