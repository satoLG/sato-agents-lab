import * as T from '../vendor/three.module.min.js';
import {batchStatic} from './lab-batch.js';
import {createLandscape,terrainHeight,pavementHeight} from './lab-landscape.js';
import {findPath} from './lab-navigation.js';

export const CAMPUS_SCALE = .7;
export const FLOOR = .06;
export const ZONES = {
  hermes:{x:0,z:-3,color:'#56d5c3'}, models:{x:-19,z:-16,color:'#e9ab61'},
  mcp:{x:-3,z:-21,color:'#6ccce0'}, rag:{x:19,z:-14,color:'#83cbb3'},
  memory:{x:-19,z:4,color:'#bab5e4'}, cron:{x:19,z:7,color:'#e3b271'},
  vm:{x:0,z:11,color:'#80b4c6'}, gateway:{x:-7,z:24,color:'#a0dfff'},
};
// Equipment is behind the workstations; all four actors have separate footprints.
export const slotsFor = id => id==='rag'?[[0,7.8],[-6.6,5.5],[6.6,5.5],[0,10.5]]:
  id==='gateway'?[[0,-1.8],[-5,-1.8],[14,-1.8],[19,-1.8],[24,-1.8]]:
  [[0,2],[-3.5,1.8],[3.5,1.8],[0,4.3]];

export function groundHeight(x,z) {
  return pavementHeight(x,z) ?? terrainHeight(x,z);
}

export function createCampus(world,art,obstacles,materials){
  const {box,mesh,mat,textPlane,glow,cylinder,rod}=art;
  const surface=(w,d,y,material,x=0,z=0)=>{
    const plane=mesh(world,new T.PlaneGeometry(w,d),material,x,y,z,false);
    plane.rotation.x=-Math.PI/2;plane.receiveShadow=true;return plane;
  };
  const landscape=createLandscape(world,art,obstacles,materials);
  surface(63.4,59.4,FLOOR+.001,mat('#ccd4cd',0,.88),0,-1);
  const walls=[],upper=new T.Group();world.add(upper);
  const facade=mat('#a9afac',.12,.75),frame=mat('#455451',.45,.42);
  const glass=new T.MeshStandardMaterial({color:'#647f82',metalness:.45,roughness:.18,envMapIntensity:1.1});
  function wall(name,x,z,w,d){
    const group=new T.Group();group.name=name;world.add(group);
    box(group,w,8,d,facade,x,4,z);box(group,w,.18,d+.06,'#68877e',x,.16,z);
    // Give each wall its own materials so camera cutaways don't affect other walls.
    const materials=new Set();
    const seal=()=>{
      const clones=new Map();group.traverse(o=>{if(o.isMesh){if(!clones.has(o.material))clones.set(o.material,o.material.clone());o.material=clones.get(o.material);materials.add(o.material);}});
      batchStatic(group);group.traverse(o=>o.userData.dynamic=true);materials.forEach(m=>{m.transparent=true;m.forceSinglePass=true;});
      walls.push({group,materials,x,z,name,opacity:1});
    };
    return {group,seal};
  }
  const front=wall('front-left',-18.25,29,27.5,.45),frontRight=wall('front-right',18.25,29,27.5,.45);
  const left=wall('west',-32,-1,.45,60),right=wall('east',32,-1,.45,60),back=wall('north',0,-31,64,.45);
  // Large modular metal panels, with recessed joints and continuous glazing.
  const panelColors=['#e1e3df','#d8dcd8','#cdd3cf','#e8e9e3'];
  function panels(parent,side,fromY,toY){
    for(let row=fromY;row<toY;row+=4)for(let col=0;col<12;col++){
      const u=-32+col*(64/12)+(64/12)/2,color=panelColors[(col*7+row/4*3)%panelColors.length];
      if(side==='front'||side==='back'){
        if(side==='front'&&row<4&&Math.abs(u)<5)continue;
        box(parent,64/12-.045,3.94,.12,color,u,row+2,side==='front'?29.29:-31.29);
      }else{
        const z=-31+col*5+2.5;box(parent,.12,3.94,4.95,color,side==='left'?-32.29:32.29,row+2,z);
      }
    }
  }
  panels(front.group,'front',0,8);panels(left.group,'left',0,8);panels(right.group,'right',0,8);panels(back.group,'back',0,8);
  // Ground-level panel geometry belongs to the matching wall for camera cutaways.
  for(const child of [...front.group.children])if(child.position.x>4.5)frontRight.group.attach(child);
  function ribbon(parent,x,y,z,width,height=2.6,angle=0){
    const g=new T.Group();g.position.set(x,y,z);g.rotation.y=angle;parent.add(g);
    box(g,width,height,.18,frame);box(g,width-.12,height-.12,.08,glass,0,0,.12);
    for(let x=-width/2+.06;x<width/2;x+=2.8)box(g,.055,height,.12,'#a0aaa5',x,0,.19);
    box(g,width,.09,.26,'#c5ccc5',0,-height/2,.1);
  }
  ribbon(front.group,-21.5,3.1,29.46,19,2.7);ribbon(frontRight.group,19,3.1,29.46,24,2.7);
  ribbon(left.group,-32.46,3.5,-7,38,1.6,-Math.PI/2);ribbon(right.group,32.46,3.5,-7,38,1.6,Math.PI/2);
  ribbon(back.group,0,3.5,-31.46,54,1.6,Math.PI);
  box(front.group,9,3.5,.45,facade,0,6.25,29);
  [front,frontRight,left,right,back].forEach(w=>w.seal());
  box(upper,64,12,60,facade,0,14,-1);
  panels(upper,'front',8,20);panels(upper,'left',8,20);panels(upper,'right',8,20);panels(upper,'back',8,20);
  ribbon(upper,7.5,12,29.46,46,2.8);
  ribbon(upper,-32.46,12,-5,48,2.8,-Math.PI/2);ribbon(upper,32.46,12,-5,48,2.8,Math.PI/2);
  ribbon(upper,0,12,-31.46,54,2.8,Math.PI);
  for(const x of [-10,0,10,20,28]){
    box(upper,1.25,.62,.12,'#53615c',x,16.7,29.45);
    for(let j=0;j<4;j++)box(upper,1.16,.045,.04,'#c1c9c0',x,16.5+j*.13,29.53);
  }
  box(upper,64.5,.23,60.5,'#89948c',0,20,-1);
  box(upper,63.8,.12,59.8,'#b3bcb3',0,19.86,-1);
  // Raised corner sign: only the brand sits inside the capsule; LAB is below.
  box(upper,16,12.05,.25,'#4c525d',-24,14,29.55);
  const plaque=new T.Group();plaque.name='sato-agents-corner-sign';plaque.position.set(-24,16,29.73);upper.add(plaque);
  function capsule(w,h){const r=h/2,shape=new T.Shape();shape.moveTo(-w/2+r,-r);shape.lineTo(w/2-r,-r);shape.absarc(w/2-r,0,r,-Math.PI/2,Math.PI/2,false);shape.lineTo(-w/2+r,r);shape.absarc(-w/2+r,0,r,Math.PI/2,Math.PI*1.5,false);return shape;}
  const outline=capsule(13.1,2.7);outline.holes.push(new T.Path(capsule(12.78,2.38).getPoints(32)));
  mesh(plaque,new T.ExtrudeGeometry(outline,{depth:.14,bevelEnabled:true,bevelThickness:.02,bevelSize:.02,bevelSegments:1,steps:1}),mat('#f6f5ed',.2,.35),0,0,.02);
  function signText(text,w,h,y){
    const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=Math.round(2048*h/w);const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fafbf5';ctx.font=`800 ${canvas.height*.76}px Nunito`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='#121a24';ctx.shadowBlur=5;ctx.shadowOffsetY=6;ctx.fillText(text,1024,canvas.height*.5,1900);
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;
    mesh(plaque,new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,transparent:true,toneMapped:false}),0,y,.2,false);
  }
  signText('Sato Agents',11.9,2.15,0);signText('L A B',4.7,1.1,-2.45);
  // Long folded canopy, as in the reference, with a dark underside.
  box(upper,40,1.05,3.6,'#d5dbd5',7,5.55,30.65);
  box(upper,40,.1,3.6,'#7b8980',7,4.99,30.65);
  for(const x of [-10,-2,6,14,22])box(upper,.12,.65,3.4,'#a7b3a9',x,4.63,30.5);
  textPlane(upper,'RECEPÇÃO / GATEWAY',7.8,.6,0,4.45,32.5,{color:'#e9f0e5',background:'#34483e',size:70});
  const upperMaterials=new Set(),upperClones=new Map();upper.traverse(o=>{if(o.isMesh){if(!upperClones.has(o.material))upperClones.set(o.material,o.material.clone());o.material=upperClones.get(o.material);upperMaterials.add(o.material);}});
  batchStatic(upper);upper.traverse(o=>o.userData.dynamic=true);upperMaterials.forEach(m=>{m.transparent=true;m.forceSinglePass=true;});
  const doors=[];
  for(const side of [-1,1]){
    const g=new T.Group();world.add(g);g.userData.dynamic=true;
    box(g,3.9,3.5,.12,new T.MeshStandardMaterial({color:'#a8d8d7',transparent:true,opacity:.28,roughness:.16}),0,1.8,29);
    for(const x of [-1.95,1.95])box(g,.07,3.6,.16,frame,x,1.8,29);
    box(g,.08,.65,.14,'#e0e9db',side*1.45,1.6,29.12);
    g.traverse(o=>o.userData.dynamic=true);doors.push({door:g,side});
  }
  obstacles.push({x:-18.25,z:29,w:27.5,d:.6},{x:18.25,z:29,w:27.5,d:.6},{x:-32,z:-1,w:.6,d:60},{x:32,z:-1,w:.6,d:60},{x:0,z:-31,w:64,d:.6});
  // Full-height partition with a central visitor passage and two parcel hatches.
  const partition=new T.Group();partition.name='gateway-partition';world.add(partition);
  const partitionMaterial=facade.clone();partitionMaterial.transparent=true;
  for(const [x,w]of [[-21,22],[-5.75,4.5],[5.75,4.5],[21,22]])box(partition,w,8.8,.5,partitionMaterial,x,4.4,18);
  box(partition,7,4.8,.5,partitionMaterial,0,6.4,18);
  for(const x of [-9,9]){
    box(partition,2,1,.5,partitionMaterial,x,.5,18);box(partition,2,6.7,.5,partitionMaterial,x,5.45,18);
    box(partition,2.2,.14,.65,'#345852',x,2.16,18);
    obstacles.push({x,z:18,w:2,d:.6});
  }
  for(const [x,w]of [[-17.75,28.5],[17.75,28.5]])obstacles.push({x,z:18,w,d:.6});
  textPlane(partition,'01  →  LABORATÓRIO',6.6,.75,0,4.85,18.3,{color:'#dcfff1',background:'#264c46',size:68});
  // A short vestibule prevents a full view through the doorway from reception.
  for(const x of [-3.5,3.5]){box(partition,.18,4,2.4,partitionMaterial,x,2,17);obstacles.push({x,z:17,w:.18,d:2.4});}
  const metro=createMetroMap(partition,art);
  partition.traverse(o=>o.userData.dynamic=true);
  let upperOpacity=1,enteredHall=false;
  return {walls,partition,metro,landscape,tick(dt,position,camera){
    const interior=1-T.MathUtils.smoothstep(position.z,28,32);
    if(position.z<16)enteredHall=true;else if(position.z>19)enteredHall=false;
    upperOpacity=T.MathUtils.damp(upperOpacity,1-interior,7,dt);upper.visible=upperOpacity>.01;
    upperMaterials.forEach(m=>{m.opacity=upperOpacity;m.depthWrite=upperOpacity>.98;});
    const cameraPosition=camera.position.clone().divideScalar(CAMPUS_SCALE);
    for(const wall of walls){
      const blocks=interior>.5&&(wall.name.startsWith('front')?cameraPosition.z>29:wall.name==='north'?cameraPosition.z<-31:wall.name==='west'?cameraPosition.x<-32:cameraPosition.x>32);
      wall.opacity=T.MathUtils.damp(wall.opacity,blocks?0:1,9,dt);wall.group.visible=wall.opacity>.015;
      wall.materials.forEach(m=>{m.opacity=wall.opacity;m.depthWrite=wall.opacity>.98;});
    }
    // Hide the partition only when viewing the hall through its near side.
    partition.visible=!(enteredHall&&cameraPosition.z>18);
    doors.forEach(({door,side})=>door.position.x=T.MathUtils.damp(door.position.x,side*(Math.hypot(position.x,position.z-29)<7?6:2),7,dt));
    return {interior,enteredHall};
  }};
}

function createMetroMap(parent,{box,mesh}){
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=880;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#edf2e7';ctx.fillRect(0,0,1600,880);ctx.fillStyle='#244a45';ctx.font='800 63px Nunito';ctx.fillText('O CAMINHO DA INFORMAÇÃO',65,85);
  ctx.font='30px Nunito';ctx.fillText('Você está na recepção • setores nas suas posições físicas',65,135);
  const nodes={gateway:[790,765],vm:[790,625],hermes:[790,430],models:[290,265],mcp:[750,205],rag:[1260,295],memory:[290,560],cron:[1260,590]};
  const names={gateway:'GATEWAY · VOCÊ',vm:'VM / TRIAGEM',hermes:'NÚCLEO',models:'PROVIDERS',mcp:'MCP',rag:'RAG',memory:'SKILLS',cron:'CRON'};
  for(const id of Object.keys(nodes)){
    if(id==='gateway')continue;const from=id==='vm'?nodes.gateway:id==='hermes'?nodes.vm:nodes.hermes,to=nodes[id];
    ctx.strokeStyle=ZONES[id].color;ctx.lineWidth=13;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(...from);ctx.lineTo(to[0],from[1]);ctx.lineTo(...to);ctx.stroke();
  }
  for(const[id,p]of Object.entries(nodes)){ctx.beginPath();ctx.arc(...p,15,0,Math.PI*2);ctx.fillStyle='#fafff7';ctx.fill();ctx.strokeStyle='#28584c';ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#244a45';ctx.font='800 32px Nunito';ctx.textAlign='center';ctx.fillText(names[id],p[0],p[1]+48);}
  ctx.textAlign='left';ctx.font='25px Nunito';ctx.fillText('↑ FUNDO DO LAB',65,210);ctx.fillText('Rotas conceituais · não representam tráfego ao vivo',65,847);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;
  box(parent,13.4,7.4,.2,'#315d52',-20,4.3,18.32);
  return mesh(parent,new T.PlaneGeometry(13,7.15),new T.MeshBasicMaterial({map:texture}),-20,4.3,18.44,false);
}

// Ballistic fall, damped bounce and brief settling: deterministic, pooled objects.
export function parcelDrop(age){
  if(age<.5)return {y:1.49-4.16*age*age,tilt:age*1.1};
  const t=age-.5;return {y:.45+Math.abs(Math.sin(t*12))*Math.exp(-t*8)*.23,tilt:.55*Math.exp(-t*7)};
}

export function createParcelFlow(world,art,zones,factory,obstacles,hall){
  const {box,rod,mat,textPlane}=art,packets=[],couriers=[],deposits=[];
  function parcel(parent,x=0,y=0,z=0){
    const g=new T.Group();g.position.set(x,y,z);parent.add(g);
    box(g,.58,.48,.58,'#c69a62');box(g,.11,.006,.59,'#e4c48d',0,.243,0);box(g,.26,.17,.008,'#f2ebd7',0,.025,.295);return g;
  }
  for(const x of [-9,9]){
    // Intake stays behind the reception counter; the belt crosses a real opening.
    box(world,1.45,.2,8,'#294542',x,1.13,19);
    for(const dx of [-.71,.71])box(world,.07,.26,8,'#78918c',x+dx,1.26,19);
    for(let z=15;z<=23;z+=.42)rod(world,[x-.66,1.25,z],[x+.66,1.25,z],.055,mat('#879b94'));
    for(const z of [15.3,18.8,22.7])for(const dx of [-.52,.52])box(world,.12,1.05,.12,'#526c62',x+dx,FLOOR+.525,z);
    obstacles.push({x,z:19,w:1.65,d:8});
    box(hall,3.1,.15,3.2,'#687d68',x,FLOOR+.075,13);
    for(const dx of [-1.5,1.5])box(hall,.1,.5,3.2,'#36594e',x+dx,FLOOR+.35,13);
    box(hall,3,.5,.1,'#36594e',x,FLOOR+.35,11.4);
    obstacles.push({x,z:13,w:3.2,d:3.3});
    for(let i=0;i<7;i++)parcel(hall,x+(i%3-1)*.75,FLOOR+.15+.24+(i>5?.48:0),12+(Math.floor(i/3)%2)*.75);
    for(let i=0;i<5;i++){const p=parcel(world);p.traverse(o=>o.userData.dynamic=true);packets.push({p,x,phase:i*2.2});}
    textPlane(hall,'TRIAGEM',2.6,.48,x,.75,14.67,{color:'#eeffe8',background:'#294d42',size:70});
  }
  const workers=Object.entries(zones).flatMap(([id,zone])=>slotsFor(id).map(([x,z])=>({x:zone.x+x,z:zone.z+z,r:.7})));
  for(const [index,id]of ['models','mcp','rag','memory','cron'].entries()){
    const zone=zones[id],end={x:zone.x+(zone.x<0?5:id==='rag'?-8:-5),z:zone.z+5};
    box(hall,1.4,.14,1.4,'#728b79',end.x,FLOOR+.07,end.z);
    const deposited=parcel(hall,end.x,FLOOR+.14+.24,end.z);deposited.traverse(o=>o.userData.dynamic=true);deposited.visible=false;deposits.push(deposited);
    const start={x:index%2?-6.7:6.7,z:12.5};
    const route=findPath(start,end,obstacles,workers),curve=new T.CurvePath();let previous=new T.Vector3(start.x,FLOOR-.03,start.z);
    for(const point of route){const next=new T.Vector3(point.x,FLOOR-.03,point.z);curve.add(new T.LineCurve3(previous,next));previous=next;}
    const rig=factory.robot();rig.root.scale.setScalar(.85);rig.root.traverse(o=>o.userData.dynamic=true);hall.add(rig.root);
    const carried=parcel(rig.root,0,.82,.72);carried.traverse(o=>o.userData.dynamic=true);
    const duration=Math.max(8,curve.getLength()/2.2);
    couriers.push({rig,parcel:carried,deposited,curve,duration,phase:index*4,speed:0});
  }
  hall.traverse(o=>o.userData.dynamic=true);
  return {packets,couriers,tick(t,enteredHall){
    for(const {p,x,phase} of packets){
      const age=(t+phase)%11;p.visible=age<10.5;
      if(age<8){p.position.set(x,1.49,23-age);p.rotation.set(0,0,0);}
      else {const fall=parcelDrop(age-8);p.position.set(x,fall.y,15-Math.min(1,age-8)*1.45);p.rotation.set(fall.tilt,fall.tilt*.4,0);}
      if(!enteredHall&&p.position.z<18)p.visible=false;
    }
    for(const item of couriers){
      const {rig,parcel,deposited,curve,duration,phase}=item;if(!curve.curves.length){rig.root.visible=false;continue;}
      const age=(t+phase)%(duration*2+4);let u,returning=false;
      if(age<2){u=0;parcel.visible=age>1;item.speed=0;}
      else if(age<duration+2){u=(age-2)/duration;parcel.visible=true;item.speed=.8;}
      else if(age<duration+4){u=1;parcel.visible=age<duration+3;deposited.visible=!parcel.visible;item.speed=0;}
      else {u=1-(age-duration-4)/duration;returning=true;parcel.visible=false;item.speed=.8;}
      u=T.MathUtils.clamp(u,0,1);rig.root.position.copy(curve.getPoint(u));
      const direction=curve.getTangent(u);rig.root.rotation.y=Math.atan2(direction.x,direction.z)+(returning?Math.PI:0);
      for(const arm of rig.arms)if(parcel.visible){arm.upper.rotation.x=-.8;arm.lower.rotation.x=-.7;}
    }
  }};
}
