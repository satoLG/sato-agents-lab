import * as T from '../vendor/three.module.min.js';
import {createServiceRack} from './scene-equipment.js';
import {instrumentData,heatLevel} from './lab-telemetry.js';
import {gridPlacement,deckHeight,EQUIPMENT_FOOTPRINTS,PROVIDER_SERVICE_FOOTPRINT} from './lab-layout.js';

export function createInstallations(world,zones,art,onAlarm=()=>{}){
  const {box,mesh,mat,glow,rod,ring,sphere,textPlane}=art;
  const dynamic=o=>{o.traverse(n=>n.userData.dynamic=true);return o;};
  function surface(parent,w,h,x,y,z,width=1024,height=512){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const plane=mesh(parent,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture}),x,y,z,false);plane.userData.dynamic=true;
    return {canvas,texture,plane,ctx:canvas.getContext('2d'),paint(fn){fn(this.ctx,width,height);texture.needsUpdate=true;}};
  }
  const roots=new Map(),packets=[],flowTime={value:0};
  function equipment(id,name){
    const zone=zones.get(id).group.position,slot=gridPlacement(zone,EQUIPMENT_FOOTPRINTS[id]),root=new T.Group();
    root.name=name;root.position.set(slot.x,deckHeight(slot.x,slot.z),slot.z);root.userData.grid=slot.cells;world.add(root);roots.set(id,root);return root;
  }
  // Three cabinet rows delimit two clear aisles inside 4 × 3 cells.
  const servers=equipment('vm','vm-server-aisles'),leds=[];
  for(const side of [-1,0,1])for(const z of [-2,0,2]){
    const rack=createServiceRack(servers,art,{x:side*3,z,angle:(side===0?-1:-side)*Math.PI/2,doubleSided:side===0});
    leds.push(...rack.lights);
  }
  // Skills occupy the same equipment slot as the RAG projector.
  const books=equipment('memory','skills-book-stack');
  box(books,4.6,.3,3.2,'#2d4352',0,.15,0);
  for(let stack=0;stack<3;stack++)for(let i=0;i<5;i++){
    const book=new T.Group();book.position.set((stack-1)*1.25,.42+i*.25,(stack%2)*.35);book.rotation.y=(i%2?1:-1)*.08;books.add(book);
    const color=['#b9c795','#688fae','#ddad70','#a795c0','#78bca9'][i];
    box(book,1.15,.22,1.65,color);box(book,1.03,.13,1.52,'#f1e9d3',0,0,.04);
    for(const y of [-.09,.09])box(book,1.17,.035,1.69,color,0,y,0);
  }
  textPlane(books,'SKILLS / MEMÓRIA',4,.42,0,.48,1.63,{color:'#b9edcf',background:'#18313a',size:100});
  // MCP toolboxes and a separate drafting table live in the reserved equipment bay.
  const workshop=equipment('mcp','mcp-blueprint-workshop');
  box(workshop,5.5,.16,3.3,'#b5c5cc',0,1.3,0);
  for(const x of [-2.3,2.3])for(const z of [-1.25,1.25])box(workshop,.12,1.25,.12,'#314451',x,.63,z);
  const blueprint=surface(workshop,3.8,2.3,-.5,1.395,0,1024,640);blueprint.plane.rotation.x=-Math.PI/2;
  blueprint.paint((ctx,w,h)=>{ctx.fillStyle='#174a72';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#83b9d333';ctx.lineWidth=1;for(let x=0;x<w;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}ctx.strokeStyle='#c1eeff';ctx.lineWidth=5;for(let i=0;i<4;i++){ctx.strokeRect(80+i*230,190,160,190);if(i<3){ctx.beginPath();ctx.moveTo(240+i*230,285);ctx.lineTo(310+i*230,285);ctx.stroke();}}ctx.fillStyle='#e4f8ff';ctx.font='bold 45px monospace';ctx.fillText('MCP / TOOL BLUEPRINT',70,90);ctx.font='26px monospace';ctx.fillText('CLIENT → TRANSPORT → SERVER → TOOL',60,490);});
  for(const [x,z,y]of [[2,0,1.55],[-2.1,2.2,.4],[.6,2.2,.4]]){
    box(workshop,1.45,.62,.95,'#c58b4d',x,y,z);box(workshop,1.52,.1,1.02,'#263c4d',x,y+.33,z);
    for(const dx of [-.45,.45])box(workshop,.09,.18,.04,'#c0cbd0',x+dx,y+.15,z+.50);
    rod(workshop,[x-.35,y+.51,z],[x+.35,y+.51,z],.045,mat('#d3dee3',.7,.3));
  }
  // A floating brain in a water-filled cylinder anchors the core bay.
  const core=equipment('hermes','core-brain-cylinder');
  const glass=new T.MeshPhysicalMaterial({color:'#b5ecf6',transparent:true,opacity:.19,roughness:.08,metalness:.08,depthWrite:false,side:T.DoubleSide});
  mesh(core,new T.CylinderGeometry(1.6,1.6,4.1,40),glass,0,2.55,0);
  mesh(core,new T.CylinderGeometry(1.45,1.45,3.5,32),new T.MeshPhysicalMaterial({color:'#429caf',transparent:true,opacity:.26,roughness:.15,depthWrite:false}),0,2.4,0);
  for(const y of [.45,4.65]){mesh(core,new T.CylinderGeometry(1.75,1.75,.28,32),mat('#526a7a',.6,.3),0,y,0);ring(core,1.64,.06,glow('#78dfff'),0,y+.15,0,true);}
  const brain=new T.Group();brain.name='floating-brain';core.add(brain);brain.position.y=2.6;
  const flesh=new T.MeshStandardMaterial({color:'#d98cab',roughness:.85});
  for(const side of [-1,1]){
    sphere(brain,.86,flesh,side*.45,0,0,[.75,.75,1.05]);
    for(let i=0;i<7;i++){
      const a=(i+.5)*Math.PI/7,points=[];
      for(let j=0;j<=32;j++){const z=-.84+j/32*1.68,arc=Math.sqrt(Math.max(0,1-(z/.905)**2)),fold=a+Math.sin(z*12+i)*.13;points.push(new T.Vector3(side*(.45+.67*arc*Math.sin(fold)),.67*arc*Math.cos(fold),z));}
      mesh(brain,new T.TubeGeometry(new T.CatmullRomCurve3(points),40,.038,6,false),new T.MeshStandardMaterial({color:'#9c466c',roughness:.8}));
    }
  }
  rod(brain,[0,-.3,.1],[0,-.78,.28],.15,flesh);dynamic(brain);
  const bubbles=[];for(let i=0;i<10;i++){const b=sphere(core,.055,glow('#99edff'));b.userData.dynamic=true;bubbles.push(b);}
  // World clocks use IANA time zones; alarms use real upcoming cron timestamps.
  const scheduler=equipment('cron','events-world-clock-wall'),clocks=[];
  box(scheduler,7.5,4.3,.3,'#2c4352',0,2.5,0);
  for(const [i,[city,timeZone]]of [['SÃO PAULO','America/Sao_Paulo'],['UTC','UTC'],['LONDRES','Europe/London'],['NOVA YORK','America/New_York'],['TÓQUIO','Asia/Tokyo'],['SYDNEY','Australia/Sydney']].entries()){
    const x=(i%3-1)*2.35,y=3.6-Math.floor(i/3)*2;
    const face=mesh(scheduler,new T.CylinderGeometry(.7,.7,.08,32),mat('#e4e9df'),x,y,.24);face.rotation.x=Math.PI/2;
    ring(scheduler,.73,.07,'#a7b9c3',x,y,.27);
    for(let j=0;j<12;j++){const a=j*Math.PI/6;box(scheduler,.035,.09,.02,'#354d5e',x+Math.sin(a)*.56,y+Math.cos(a)*.56,.31);}
    const hands=[];for(const length of [.35,.5]){const pivot=new T.Group();pivot.position.set(x,y,.34);scheduler.add(pivot);box(pivot,.045,length,.025,'#293f50',0,length/2,0);dynamic(pivot);hands.push(pivot);}
    textPlane(scheduler,city,1.95,.3,x,y-.95,.28,{color:'#cdf1ff',background:'#213847',size:100});clocks.push({hands,format:new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}),city});
  }
  const alarm=box(scheduler,.25,.25,.08,glow('#6bcbe0'),0,4.8,.2);alarm.userData.dynamic=true;
  let schedule=[],lastAlarm=new Set(),clockSecond=-1;
  function updateSchedule(board){const rows=[...schedule,...(board?.upcoming||[])].filter(row=>Number.isFinite(Date.parse(row.when))&&Date.parse(row.when)>Date.now()-15000);schedule=[...new Map(rows.map(row=>[`${row.name}:${row.when}`,row])).values()];}
  // Thick provider conduits stay in this bay and the west service strip, away from all panels.
  const providers=equipment('models','provider-circulation-equipment');providers.userData.serviceGrid=PROVIDER_SERVICE_FOOTPRINT;
  const tankX=[-1.6,1.6];
  for(const [i,x]of tankX.entries()){
    const tank=new T.Group();tank.name='provider-liquid-reservoir';tank.position.x=x;providers.add(tank);
    box(tank,1.7,.3,1.7,'#33444f',0,.15,0);
    mesh(tank,new T.CylinderGeometry(.72,.72,3,32),glass,0,1.85,0);
    mesh(tank,new T.CylinderGeometry(.65,.65,2.45,32),new T.MeshStandardMaterial({color:i?'#ad7140':'#348c9d',transparent:true,opacity:.7,roughness:.18}),0,1.62,0).name='provider-reservoir-liquid';
    for(const y of [.35,3.35]){mesh(tank,new T.CylinderGeometry(.79,.79,.18,32),mat('#c5d3db',.7,.3),0,y,0);ring(tank,.74,.04,glow(i?'#ffb06c':'#5bdcff'),0,y+.1,0,true);}
  }
  const paths=[
    new T.CatmullRomCurve3([new T.Vector3(-17,6.8,0),new T.Vector3(-11.5,6.8,0),new T.Vector3(-3.6,6.8,0),new T.Vector3(-1.6,5.7,0),new T.Vector3(-1.6,3.55,0)],false,'centripetal'),
    new T.CatmullRomCurve3([new T.Vector3(1.6,.75,0),new T.Vector3(1.6,1.4,1.8),new T.Vector3(1.6,4.7,1.8),new T.Vector3(-1,5.5,1.8),new T.Vector3(-6.5,5.5,1.8),new T.Vector3(-11.5,5.5,1.8),new T.Vector3(-17,5.5,1.8)],false,'centripetal'),
  ];
  for(const [i,path]of paths.entries()){
    const color=i?'#ffb06c':'#5bdcff';
    const shell=mesh(providers,new T.TubeGeometry(path,80,.34,16,false),glass);shell.name='provider-conduit';
    const liquidMaterial=new T.MeshStandardMaterial({color,transparent:true,opacity:.68,roughness:.22,emissive:color,emissiveIntensity:.16});
    liquidMaterial.onBeforeCompile=shader=>{shader.uniforms.flowTime=flowTime;shader.vertexShader='varying float vFlow;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFlow=uv.x;');shader.fragmentShader='uniform float flowTime; varying float vFlow;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= .78 + .22 * sin(vFlow * 80.0 - flowTime * 5.0);');};
    liquidMaterial.customProgramCacheKey=()=> 'provider-liquid-v2';
    const liquid=mesh(providers,new T.TubeGeometry(path,80,.25,12,false),liquidMaterial);liquid.name=i?'provider-return-flow':'provider-supply-flow';liquid.userData.dynamic=true;
    for(let j=0;j<10;j++){const cuff=ring(providers,.36,.055,'#c5d3db');cuff.position.copy(path.getPointAt(j/9));cuff.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),path.getTangentAt(j/9));}
    for(let j=0;j<10;j++){const bubble=sphere(providers,.1,glow(i?'#ffe2b5':'#c5f5ff'));bubble.userData.dynamic=true;packets.push({object:bubble,path,index:j});}
    const port=new T.Group();port.name='provider-wall-bulkhead';port.position.set(-11.5,i?5.5:6.8,i?1.8:0);port.rotation.y=Math.PI/2;providers.add(port);box(port,1.2,1.2,.2,'#33444f');ring(port,.43,.09,'#bdccd2',0,0,.15);
  }
  rod(providers,[-1.6,.75,0],[1.6,.75,0],.25,mat('#5c8994',.4,.3));
  const pipeStatus=surface(providers,3.2,.8,0,2,1.35,1024,230);
  // The skills catalogue is rendered by the sixth sector monitor.
  let lastMemoryKey=null,writingUntil=0,data=null;
  const activityRoot=new T.Group();activityRoot.name='wall-activity-display';world.add(activityRoot);
  const board=box(activityRoot,76.7,7.1,.16,'#182c38',0,12,-42.48);board.name='elevated-activity-board';
  const activity=surface(activityRoot,76.3,6.85,0,12,-42.38,4096,512);
  activityRoot.traverse(o=>{o.userData.dynamic=true;if(o.material)o.material.userData.hallLighting=true;});
  function updateHeatmap(payload){
    activity.paint((ctx,w,h)=>{
      ctx.save();ctx.scale(w/2048,h/360);w=2048;h=360;
      ctx.fillStyle='#102e32';ctx.fillRect(0,0,w,h);ctx.fillStyle='#d9f8df';ctx.font='bold 49px Nunito';ctx.fillText('ATIVIDADE DO HERMES',42,59);
      ctx.font='26px Nunito';ctx.fillStyle='#9bbdb1';ctx.fillText(payload.error?'FONTE INDISPONÍVEL':`${payload.total||0} eventos · últimos 365 dias · UTC`,990,57);
      const days=payload.days||[],offset=days.length?new Date(days[0].date+'T00:00:00Z').getUTCDay():0,colors=['#23484a','#326c60','#42927a','#76c996','#b8f2ac'];
      const step=34,size=26;for(let i=0;i<371;i++){const col=Math.floor(i/7),row=i%7;ctx.fillStyle='#1b3d40';ctx.fillRect(119+col*step,89+row*step,size,size);}
      days.forEach((day,i)=>{const pos=i+offset;ctx.fillStyle=colors[heatLevel(day.total,payload.max)];ctx.fillRect(119+Math.floor(pos/7)*step,89+(pos%7)*step,size,size);});
      ctx.font='19px Nunito';ctx.fillStyle='#93b3a7';['D','S','T','Q','Q','S','S'].forEach((v,i)=>ctx.fillText(v,70,109+i*step));ctx.restore();
    });
  }
  updateHeatmap({error:'aguardando',days:[]});
  function update(snapshot){
    data=instrumentData(snapshot);
    pipeStatus.paint((ctx,w,h)=>{ctx.fillStyle='#183a3f';ctx.fillRect(0,0,w,h);ctx.fillStyle='#d6f6ed';ctx.font='bold 41px Nunito';ctx.fillText(data.primary.slice(0,37),30,57);ctx.font='32px Nunito';ctx.fillStyle='#70dfff';ctx.fillText(data.eventAvailable?`→ ${data.outgoing} chamadas    ← ${data.incoming} respostas`:'SEM FONTE DE EVENTOS',30,115);ctx.fillStyle='#a2bbb5';ctx.font='24px Nunito';ctx.fillText('CIRCULAÇÃO ILUSTRATIVA · DADOS / 3 MIN',30,174);});
    const key=JSON.stringify(data.memoryItems.map(d=>[d.name,d.modified]));
    if(lastMemoryKey!==null&&key!==lastMemoryKey||data.memoryEvents.length){writingUntil=performance.now()+6500;}
    lastMemoryKey=key;
    zones.get('memory').display.setCatalog({available:data.memoryAvailable,count:data.memoryCount,items:data.memoryItems.filter(item=>item.category==='skill')});
  }
  function tick(t,dt,paused){
    flowTime.value=t;
    if(!paused){brain.position.y=2.6+Math.sin(t*.7)*.12;brain.rotation.y=Math.sin(t*.25)*.13;}
    bubbles.forEach((b,i)=>b.position.set(Math.sin(i*2.4)*1.2,.6+((t*.22+i*.31)%3.7),Math.cos(i*2.4)*1.2));
    leds.forEach((led,i)=>led.visible=paused||Math.sin(t*2+i*.7)>-.45);
    const now=Date.now();
    if(Math.floor(now/1000)!==clockSecond){clockSecond=Math.floor(now/1000);for(const c of clocks){const [h,m,s]=c.format.format(now).split(':').map(Number);c.hands[0].rotation.z=-(h%12+m/60)*Math.PI/6;c.hands[1].rotation.z=-(m+s/60)*Math.PI/30;}}
    for(const row of schedule){const at=Date.parse(row.when),key=`${row.name}:${row.when}`;if(now>=at&&now-at<15000&&!lastAlarm.has(key)){lastAlarm.add(key);onAlarm(roots.get('cron').position);}}
    if(lastAlarm.size>100)lastAlarm=new Set([...lastAlarm].slice(-50));
    alarm.visible=paused||schedule.some(row=>Math.abs(Date.parse(row.when)-now)<5000)&&Math.sin(t*12)>0;

    for(const packet of packets){const progress=(t*.16+packet.index/10)%1;packet.object.position.copy(packet.path.getPointAt(progress));}
  }
  return {roots,activityRoot,update,tick,updateSchedule,updateHeatmap,setStale(){},memoryActive:()=>performance.now()<writingUntil};
}
