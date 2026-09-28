import * as T from '../vendor/three.module.min.js';
import {batchStatic} from './lab-batch.js';
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
  return Math.abs(x)<=34 && z>=-33 && z<=58 ? FLOOR : .02;
}

export function createCampus(world,art,obstacles,materials){
  const {box,mesh,mat,textPlane,glow,cylinder,rod}=art;
  const surface=(w,d,y,material,x=0,z=0)=>{
    const plane=mesh(world,new T.PlaneGeometry(w,d),material,x,y,z,false);
    plane.rotation.x=-Math.PI/2;plane.receiveShadow=true;return plane;
  };
  // Ground extends beyond the far clipping plane, so its edge can never appear.
  surface(2000,2000,.02,materials.grass,0,10);
  const paving=(w,d,x,z)=>{
    const material=materials.paving.clone();
    for(const key of ['map','normalMap'])if(material[key]){material[key]=material[key].clone();material[key].repeat.set(w/5,d/5);}
    surface(w,d,FLOOR,material,x,z);
  };
  // Separate rectangles avoid coplanar exterior/interior planes and depth flicker.
  paving(68,29,0,43.5);paving(2,60,-33,-1);paving(2,60,33,-1);paving(68,2,0,-32);
  surface(63.4,59.4,FLOOR+.001,mat('#ccd4cd',0,.88),0,-1);
  let seed=137;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  // Broadleaf silhouettes: branches and instanced individual leaves, not cones.
  const leafGeo=new T.IcosahedronGeometry(1,0),leafMat=mat('#597848',0,1);
  const leaves=new T.InstancedMesh(leafGeo,leafMat,40*100);leaves.castShadow=false;leaves.receiveShadow=true;
  const dummy=new T.Object3D();let leafIndex=0;
  for(let i=0;i<40;i++){
    const x=(i%2?-1:1)*(39+random()*62),z=-65+random()*170,h=4+random()*3;
    cylinder(world,.25,h,'#75634a',x,h/2+.02,z,.13);
    for(let k=0;k<5;k++){
      const a=k*Math.PI*2/5,dx=Math.cos(a)*1.6,dz=Math.sin(a)*1.6;
      rod(world,[x,h*.55,z],[x+dx,h*.92,z+dz],.1,mat('#75634a'));
    }
    for(let k=0;k<100;k++){
      const a=random()*Math.PI*2,r=Math.sqrt(random())*2.9;
      dummy.position.set(x+Math.cos(a)*r,h+.3+random()*2-r*.35,z+Math.sin(a)*r);
      dummy.scale.set(.45+random()*.45,.12+random()*.18,.35+random()*.5);
      dummy.rotation.set(random(),random()*Math.PI,random());dummy.updateMatrix();leaves.setMatrixAt(leafIndex,dummy.matrix);
      leaves.setColorAt(leafIndex++,new T.Color().setHSL(.22+random()*.06,.27+random()*.15,.24+random()*.16));
    }
    if(Math.abs(x)<46&&z>-33&&z<59)obstacles.push({x,z,w:1.1,d:1.1});
  }world.add(leaves);
  for(const x of [-13,13]){
    box(world,2,.45,15,'#7a8e80',x,FLOOR+.225,43);
    box(world,1.8,.1,14.8,'#556c45',x,FLOOR+.5,43);
    for(let z=37;z<=49;z+=2)cylinder(world,.75,.6,'#6a8657',x,FLOOR+.8,z);
    for(const z of [34,51]){cylinder(world,.09,2.2,'#344d4c',x,FLOOR+1.1,z);box(world,.65,.12,.65,glow('#fff4c4'),x,FLOOR+2.2,z);}
    obstacles.push({x,z:43,w:2,d:15});
  }
  const walls=[],upper=new T.Group();world.add(upper);
  const facade=mat('#e1e5d9',0,.8),frame=mat('#45625f',.35,.5);
  const glass=new T.MeshStandardMaterial({color:'#89b7bd',metalness:.45,roughness:.18,envMapIntensity:1.1});
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
  // Recessed panes, deep sill, vertical mullion and slim top shade.
  function window(parent,x,y,z,angle=0){
    const g=new T.Group();g.position.set(x,y,z);g.rotation.y=angle;parent.add(g);
    box(g,3.35,2.55,.22,frame);box(g,3.05,2.25,.08,glass,0,0,.15);
    box(g,.055,2.25,.1,'#c5d2c8',0,0,.22);box(g,3.5,.12,.5,'#b2c3b6',0,-1.34,.11);
    box(g,3.6,.12,.65,'#d0d9cc',0,1.36,.18);
  }
  for(const x of [-27,-21,-15,-9,9,15,21,27])window(x<0?front.group:frontRight.group,x,3.4,29.28);
  for(const side of [-1,1])for(const z of [-24,-16,-8,0,8,23])window(side<0?left.group:right.group,side*32.25,3.4,z,side*Math.PI/2);
  box(front.group,9,3.5,.45,facade,0,6.25,29);
  [front,frontRight,left,right,back].forEach(w=>w.seal());
  box(upper,64,12,60,facade,0,14,-1);
  for(const y of [10.2,14])for(const x of [-27,-21,-15,-9,-3,3,9,15,21,27])window(upper,x,y,29.15);
  box(upper,65,.4,61,'#81998d',0,20,-1);
  textPlane(upper,'Sato Agents Lab',25,3.1,0,18.1,29.28,{color:'#214d46',background:'#f0f3e8',size:96,rounded:true});
  const logo=new T.TextureLoader().load(new URL('../sato-logo.png',import.meta.url).href);logo.colorSpace=T.SRGBColorSpace;
  mesh(upper,new T.PlaneGeometry(2.5,2.3),new T.MeshBasicMaterial({map:logo}),-15,18.1,29.3,false);
  box(upper,10,.24,4.2,'#e1e5d9',0,4.5,30.5);
  textPlane(upper,'RECEPÇÃO / GATEWAY',7.8,.65,0,3.9,30.8,{color:'#ddf7e8',background:'#244c45',size:64});
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
  return {walls,partition,metro,tick(dt,position,camera){
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
