import * as T from '../vendor/three.module.min.js';
// The same endpoints feed /dashboard. Missing or failed readings stay explicit.
export function indicatorCards(sector,channels){
 const data=key=>channels[key]?.data&&!channels[key].data.error?channels[key].data:null;
 const card=(key,title,value,detail='',series=[])=>({title,value:data(key)?value??'—':'—',detail:data(key)?detail:'Fonte indisponível',source:channels[key]?.error?'Última leitura · sem conexão':key,series:data(key)?series:[]});
 const stats=data('stats'),vm=data('vm'),mcp=data('mcp'),memory=data('memory'),rag=data('rag'),events=data('events'),live=data('live');
 const common=[card('stats','CHAMADAS',stats?.total_calls,stats?.month,stats?.daily?.map(d=>d.calls)),card('stats','CUSTO',stats?.total_cost===undefined?null:`$ ${stats.total_cost.toFixed(4)}`,'Mês atual'),card('stats','FALLBACK',stats?.fallback_rate===undefined?null:`${stats.fallback_rate}%`,'Chamadas do mês'),card('vm','CPU',vm?.cpu?.total===null?null:vm?.cpu?.total===undefined?null:`${vm.cpu.total}%`,vm?.hostname),card('vm','RAM',vm?.memory?.used_percent===undefined?null:`${vm.memory.used_percent}%`,'Memória utilizada'),card('live','PROCESSOS',live?.processes?.length,'Processos observados')];
 const specific={
  mcp:[card('mcp','SERVIDORES',mcp?.servers?.length,'Configurados / observados'),card('mcp','CHAMADAS MCP',mcp?.total_calls,`${mcp?.days??30} dias`),card('mcp','FALHAS MCP',mcp?.servers?.reduce((s,n)=>s+n.failures,0),'Mesma janela do dashboard')],
  memory:[card('memory','SKILLS',memory?.skills?.length,'Catálogo em disco'),card('memory','MEMÓRIAS',memory?.documents?.length,'Documentos / contextos'),card('memory','ARQUIVOS',memory?.count,'Itens catalogados')],
  rag:[card('rag','VETORES / DOCS',rag?.total,'Base vetorial'),card('rag','REPOSITÓRIOS',rag?.by_repo?.length,'Fontes indexadas'),card('rag','TIPOS',rag?.by_type?Object.keys(rag.by_type).length:null,'Categorias de documentos')],
  cron:[card('events','CRON JOBS',events?.jobs?.length,'Hermes / crontab / timers'),card('events','WEBHOOKS',events?.webhooks?.available?events.webhooks.routes.length:null,events?.webhooks?.available?'Rotas configuradas':'Fonte indisponível'),card('events','FALHAS',events?.failed_runs,'Até 60 execuções recentes')],
  vm:[common[3],common[4],card('vm','UPTIME',vm?.uptime_seconds===undefined?null:`${Math.floor(vm.uptime_seconds/3600)} h`,'Desde o boot')],
  gateway:[card('live','EVENTOS',live?.events?.length,'Janela recente'),common[5],common[0]],
 };
 return [...(specific[sector]||common.slice(0,3)),...common.filter(c=>!(specific[sector]||common.slice(0,3)).some(s=>s.title===c.title))].slice(0,6);
}
export function createMonitorBank(parent,{box,mesh,mat},{compact=false,x=0,y=0,z=-.4}={}){
 const bank=new T.Group();bank.name='dashboard-monitor-bank';bank.position.set(x,y,z);parent.add(bank);
 const width=compact?.51:.77,height=compact?.31:.46,columns=compact?2:3,rows=2,displays=[];
 box(bank,.06,compact?.52:.85,.06,mat('#687b87',.7,.3),0,compact?1.1:1.55,-.1);
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const monitor=new T.Group();monitor.position.set((col-(columns-1)/2)*(width+.075),(compact?1.12:1.56)+row*(height+.075),0);monitor.rotation.x=-.08;bank.add(monitor);
  box(monitor,width+.055,height+.055,.09,'#233844');
  const canvas=document.createElement('canvas');canvas.width=compact?320:512;canvas.height=compact?192:308;const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const plane=mesh(monitor,new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map:texture}),0,0,.058,false);plane.name='dashboard-indicator-screen';plane.userData.dynamic=true;plane.userData.sectorIndicator=true;
  displays.push({canvas,texture,key:''});
 }
 let cards=indicatorCards('',{}),status='Aguardando dados';
 function paint(){displays.forEach((d,i)=>{const c=cards[i%cards.length],key=JSON.stringify([c,status]);if(key===d.key)return;d.key=key;const ctx=d.canvas.getContext('2d');ctx.setTransform(d.canvas.width/640,0,0,d.canvas.height/384,0,0);ctx.fillStyle='#0c252f';ctx.fillRect(0,0,640,384);
  function text(value,y,size,color){ctx.font=`600 ${size}px Nunito`;ctx.fillStyle=color;let s=String(value??'');while(ctx.measureText(s).width>570&&s.length>1)s=s.slice(0,-2)+'…';ctx.fillText(s,32,y);}
  text(c.title,50,28,'#78dfff');text(c.value,142,72,'#ecfaff');text(c.detail,194,23,'#a5c6c4');
  if(c.series?.length>1){const values=c.series.filter(Number.isFinite),max=Math.max(1,...values);ctx.strokeStyle='#78e6b1';ctx.lineWidth=4;ctx.beginPath();values.forEach((v,n)=>{const x=32+n*576/(values.length-1),y=283-v/max*68;n?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
  text(status,326,20,'#b1c2c8');text(`/dashboard · ${c.source}`,362,18,'#6f9da8');d.texture.needsUpdate=true;
 });}
 paint();return {update(lines){status=lines.slice(0,2).join(' · ');paint();},indicators(value){cards=value;paint();}};
}
