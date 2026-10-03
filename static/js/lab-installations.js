import * as T from '../vendor/three.module.min.js';
import {instrumentData,heatLevel} from './lab-telemetry.js';

export function createInstallations(world,zones,art){
  const {box,mesh,mat,glow,rod,ring}=art;
  const dynamic=o=>{o.traverse(n=>n.userData.dynamic=true);return o;};
  function surface(parent,w,h,x,y,z,width=1024,height=512){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const plane=mesh(parent,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture}),x,y,z,false);plane.userData.dynamic=true;
    return {canvas,texture,plane,ctx:canvas.getContext('2d'),paint(fn){fn(this.ctx,width,height);texture.needsUpdate=true;}};
  }
  const instruments=new T.Group();world.add(instruments);
  const gauges=[];
  for(const [i,label,color] of [[-1,'CPU','#63e5ff'],[1,'RAM','#a6f08a']]){
    const g=new T.Group();g.position.set(zones.get('vm').group.position.x+i*2.7,zones.get('vm').group.position.y+1.16,zones.get('vm').group.position.z-.9);instruments.add(g);
    box(g,1.15,.47,.38,'#26474b',0,.235,0);box(g,1.04,.4,.06,'#10272e',0,.25,.22);
    const segments=[];for(let j=0;j<14;j++)segments.push(box(g,.052,.09,.035,'#2e494c',-.46+j*.07,.11,.265));
    const display=surface(g,1.02,.25,0,.32,.262,512,256);
    gauges.push({segments,display,color,value:undefined});
  }
  function gauge(item,value,stale=false){
    const key=`${value}/${stale}`;if(item.key===key)return;item.key=key;item.value=value;
    item.segments.forEach((segment,i)=>{segment.material=value!==null&&i<Math.ceil(value/100*14)?glow(value>90?'#ffae67':item.color):mat('#2e494c');});
    item.display.paint((ctx,w,h)=>{ctx.fillStyle='#10272e';ctx.fillRect(0,0,w,h);ctx.textAlign='center';ctx.fillStyle=value===null?'#8ba6aa':item.color;ctx.font='bold 135px Nunito';ctx.fillText(value===null?'—':Math.round(value)+'%',w/2,150);ctx.fillStyle='#a3bbc0';ctx.font='27px Nunito';ctx.fillText(value===null?'SEM LEITURA':stale?'ÚLTIMA LEITURA':'USO DO HOST',w/2,218);});
  }
  gauges.forEach(g=>gauge(g,null));

  // Supply enters through the tank top; the return leaves at its bottom.
  // Both elbows sit in the left service aisle, beside the monitor bank.
  const packets=[],providers=zones.get('models').group,flowTime={value:0};
  const tankX=[-5.3,-6.3],tankZ=-1.6;
  for(const [i,x]of tankX.entries()){
    const tank=new T.Group();tank.name='provider-liquid-reservoir';tank.position.set(x,0,tankZ);providers.add(tank);
    box(tank,.98,.25,.98,'#33444f',0,.125,0);
    const glass=new T.MeshPhysicalMaterial({color:'#c2e7e9',transparent:true,opacity:.23,roughness:.12,metalness:.05,depthWrite:false});
    mesh(tank,new T.CylinderGeometry(.43,.43,1.75,24),glass,0,1.17,0);
    const liquid=mesh(tank,new T.CylinderGeometry(.37,.37,1.22,24),new T.MeshStandardMaterial({color:i?'#ad7140':'#348c9d',transparent:true,opacity:.7,roughness:.18,metalness:.1}),0,.93,0);liquid.name='provider-reservoir-liquid';
    for(const y of [.3,2.05]){const cap=mesh(tank,new T.CylinderGeometry(.48,.48,.12,24),mat('#c5d3db',.7,.3),0,y,0);ring(tank,.44,.025,glow(i?'#ffb06c':'#5bdcff'),0,y+.07,0,true);}
    rod(tank,[0,2.08,0],[0,2.32,0],.18,mat('#71838f',.7,.3));
  }
  const paths=[
    new T.CatmullRomCurve3([new T.Vector3(-7.62,3.5,-3.5),new T.Vector3(-6.7,3.5,-3.5),new T.Vector3(-5.3,3.5,-2.8),new T.Vector3(-5.3,3.05,-1.6),new T.Vector3(-5.3,2.32,-1.6)],false,'centripetal'),
    new T.CatmullRomCurve3([new T.Vector3(-6.3,.7,-1.6),new T.Vector3(-6.7,1.25,-2.15),new T.Vector3(-6.7,2.35,-3.5),new T.Vector3(-7.62,2.35,-3.5)],false,'centripetal'),
  ];
  for(const [i,path]of paths.entries()){
    const color=i?'#ffb06c':'#5bdcff';
    const shell=mesh(providers,new T.TubeGeometry(path,64,.19,12,false),new T.MeshPhysicalMaterial({color:'#c7e6ec',transparent:true,opacity:.22,roughness:.13,metalness:.1,depthWrite:false}));shell.name='provider-conduit';
    const liquidMaterial=new T.MeshStandardMaterial({color,transparent:true,opacity:.68,roughness:.22,emissive:color,emissiveIntensity:.16});
    liquidMaterial.onBeforeCompile=shader=>{shader.uniforms.flowTime=flowTime;shader.vertexShader='varying float vFlow;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFlow=uv.x;');shader.fragmentShader='uniform float flowTime; varying float vFlow;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= .78 + .22 * sin(vFlow * 80.0 - flowTime * 5.0);');};
    liquidMaterial.customProgramCacheKey=()=> 'provider-liquid-v1';
    const liquid=mesh(providers,new T.TubeGeometry(path,64,.125,10,false),liquidMaterial);liquid.name=i?'provider-return-flow':'provider-supply-flow';liquid.userData.dynamic=true;
    for(let j=0;j<7;j++){const cuff=ring(providers,.205,.036,'#c5d3db');cuff.position.copy(path.getPointAt(j/6));cuff.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),path.getTangentAt(j/6));}
    for(let j=0;j<10;j++){const bubble=mesh(providers,new T.SphereGeometry(.065,8,6),new T.MeshBasicMaterial({color:i?'#ffe2b5':'#c5f5ff'}));bubble.userData.dynamic=true;packets.push({object:bubble,path,index:j});}
    const port=new T.Group();port.name='provider-wall-bulkhead';port.position.copy(path.getPoint(i?1:0));port.rotation.y=Math.PI/2;providers.add(port);
    box(port,.85,.85,.13,'#33444f');ring(port,.28,.07,'#bdccd2',0,0,.09);
  }
  // A short manifold links the two tanks, closing the circulating liquid loop.
  rod(providers,[-5.3,.7,tankZ],[-6.3,.7,tankZ],.14,mat('#5c8994',.4,.3));
  const pipeStatus=surface(providers,2.5,.62,-2.8,1.55,-.58,1024,230);
  // The skills catalogue is rendered by the sixth sector monitor.
  let lastMemoryKey=null,writingUntil=0,data=null;
  const activityRoot=new T.Group();activityRoot.name='wall-activity-display';world.add(activityRoot);
  const board=box(activityRoot,60.7,7.1,.16,'#182c38',0,12,-30.48);board.name='elevated-activity-board';
  const activity=surface(activityRoot,60.3,6.85,0,12,-30.38,4096,512);
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
  dynamic(instruments); // preserve all gauge segments for live material updates
  function update(snapshot){
    data=instrumentData(snapshot);for(const [i,value]of [data.cpu,data.ram].entries()){const previous=gauges[i].value;gauge(gauges[i],value??previous??null,value===null&&previous!==null);}
    pipeStatus.paint((ctx,w,h)=>{ctx.fillStyle='#183a3f';ctx.fillRect(0,0,w,h);ctx.fillStyle='#d6f6ed';ctx.font='bold 41px Nunito';ctx.fillText(data.primary.slice(0,37),30,57);ctx.font='32px Nunito';ctx.fillStyle='#70dfff';ctx.fillText(data.eventAvailable?`→ ${data.outgoing} chamadas    ← ${data.incoming} respostas`:'SEM FONTE DE EVENTOS',30,115);ctx.fillStyle='#a2bbb5';ctx.font='24px Nunito';ctx.fillText('CIRCULAÇÃO ILUSTRATIVA · DADOS / 3 MIN',30,174);});
    const key=JSON.stringify(data.memoryItems.map(d=>[d.name,d.modified]));
    if(lastMemoryKey!==null&&key!==lastMemoryKey||data.memoryEvents.length){writingUntil=performance.now()+6500;}
    lastMemoryKey=key;
    zones.get('memory').display.setCatalog({available:data.memoryAvailable,count:data.memoryCount,items:data.memoryItems.filter(item=>item.category==='skill')});
  }
  function tick(t,dt,paused){
    flowTime.value=t;
    for(const packet of packets){const progress=(t*.16+packet.index/10)%1;packet.object.position.copy(packet.path.getPointAt(progress));}
  }
  return {activityRoot,update,tick,updateHeatmap,setStale(value){if(data)for(const g of gauges)gauge(g,g.value,value);},memoryActive:()=>performance.now()<writingUntil};
}
