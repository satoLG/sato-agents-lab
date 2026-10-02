import * as T from '../vendor/three.module.min.js';
import {createExteriorFade} from './lab-chamber-materials.js';
import {batchStatic} from './lab-batch.js';
import {createLandscape,terrainHeight,pavementHeight} from './lab-landscape.js';
import {ZONES,FLOOR,slotsFor,deckHeight,WALL_HEIGHT} from './lab-layout.js';
import {createSectorMap} from './lab-signage.js';
export {ZONES,FLOOR,slotsFor} from './lab-layout.js';
import {findPath} from './lab-navigation.js';

export const CAMPUS_SCALE = .7;
export function groundHeight(x,z) {
  return deckHeight(x,z) ?? (pavementHeight(x,z) ?? terrainHeight(x,z));
}

export function createCampus(world,art,obstacles,materials,chamber,hall,icons){
  const {box,mesh,mat,textPlane,glow,cylinder,rod}=art;
  const surface=(w,d,y,material,x=0,z=0,parent=world)=>{
    const plane=mesh(parent,new T.PlaneGeometry(w,d),material,x,y,z,false);
    plane.rotation.x=-Math.PI/2;plane.receiveShadow=true;plane.userData.walkable=true;return plane;
  };
  const exterior=new T.Group();exterior.name='campus-exterior';world.add(exterior);
  const landscape=createLandscape(exterior,art,obstacles,materials),fadeExterior=createExteriorFade(exterior);
  batchStatic(exterior);exterior.traverse(o=>o.userData.dynamic=true);
  const skyIntensity=world.backgroundIntensity,fogColor=world.fog.color.clone(),nightFog=new T.Color('#080e16');
  let darkness=0;
  // Nature occupies the lower level; walkable decks are built by lab-layout.
  surface(63.2,10.7,FLOOR,chamber.floor.clone(),0,23.35);
  const walls=[],upper=new T.Group();world.add(upper);
  const facade=mat('#a9afac',.12,.75),frame=mat('#455451',.45,.42);
  const glass=new T.MeshStandardMaterial({color:'#647f82',metalness:.45,roughness:.18,envMapIntensity:1.1});
  function wall(name,x,z,w,d){
    const group=new T.Group();group.name=name;world.add(group);
    box(group,w,WALL_HEIGHT,d,facade,x,WALL_HEIGHT/2,z);box(group,w,.18,d+.06,'#68877e',x,.16,z);
    // Give each wall its own materials so camera cutaways don't affect other walls.
    const materials=new Set();
    const seal=()=>{
      const clones=new Map();group.traverse(o=>{if(o.isMesh){if(!clones.has(o.material))clones.set(o.material,o.material.clone());o.material=clones.get(o.material);materials.add(o.material);}});
      batchStatic(group);group.traverse(o=>o.userData.dynamic=true);materials.forEach(m=>{m.transparent=true;m.forceSinglePass=true;});
      walls.push({group,materials,x,z,name,opacity:1});
    };
    return {group,seal};
  }
  function lining(group,w,x,z,angle=0){
    const liningMaterial=chamber.wall(w,WALL_HEIGHT-.25);if(z<18)liningMaterial.userData.hallLighting=true;
    const panel=mesh(group,new T.PlaneGeometry(w,WALL_HEIGHT-.25),liningMaterial,x,WALL_HEIGHT/2,z);panel.rotation.y=angle;
    const trim=new T.Group();trim.position.set(x,0,z);trim.rotation.y=angle;group.add(trim);
    box(trim,w-.08,.18,.08,'#39464d',0,.24,.08);
    box(trim,w,.14,.15,'#293a42',0,WALL_HEIGHT-.35,0);
    const light=glow('#96e7f5').clone();if(z<18)light.userData.hallLighting=true;box(trim,w-.3,.055,.18,light,0,WALL_HEIGHT-.36,.06);
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
  panels(front.group,'front',0,16);panels(left.group,'left',0,16);panels(right.group,'right',0,16);panels(back.group,'back',0,16);
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
  lining(front.group,27.3,-18.25,28.74,Math.PI);lining(frontRight.group,27.3,18.25,28.74,Math.PI);
  lining(left.group,59.1,-31.70,-1,Math.PI/2);lining(right.group,59.1,31.70,-1,-Math.PI/2);lining(back.group,63.2,0,-30.70);
  [front,frontRight,left,right,back].forEach(w=>w.seal());
  box(upper,64,12,60,facade,0,22,-1);
  panels(upper,'front',16,28);panels(upper,'left',16,28);panels(upper,'right',16,28);panels(upper,'back',16,28);
  ribbon(upper,7.5,20,29.46,46,2.8);
  ribbon(upper,-32.46,20,-5,48,2.8,-Math.PI/2);ribbon(upper,32.46,20,-5,48,2.8,Math.PI/2);
  ribbon(upper,0,20,-31.46,54,2.8,Math.PI);
  for(const x of [-10,0,10,20,28]){
    box(upper,1.25,.62,.12,'#53615c',x,24.7,29.45);
    for(let j=0;j<4;j++)box(upper,1.16,.045,.04,'#c1c9c0',x,24.5+j*.13,29.53);
  }
  box(upper,64.5,.23,60.5,'#89948c',0,28,-1);
  box(upper,63.8,.12,59.8,'#b3bcb3',0,27.86,-1);
  // Raised corner sign: only the brand sits inside the capsule; LAB is below.
  box(upper,16,12.05,.25,'#4c525d',-24,22,29.55);
  const plaque=new T.Group();plaque.name='sato-agents-corner-sign';plaque.position.set(-24,24,29.73);upper.add(plaque);
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
  // The sole conveyor hatch is at the left; the visitor door stays in the center.
  const partition=new T.Group();partition.name='gateway-partition';world.add(partition);
  const partitionMaterial=chamber.equipment('#89949b',.2,.78).clone();
  const segments=[[-30.45,3.1],[-15.3,23.6],[17.75,28.5]];
  for(const [x,w]of segments){
    box(partition,w,16.7,.44,partitionMaterial,x,8.4,18);
    for(const side of [-1,1]){const face=mesh(partition,new T.PlaneGeometry(w-.09,16.5),chamber.wall(w,16.5),x,8.4,18+side*.26);face.rotation.y=side<0?Math.PI:0;}
  }
  box(partition,7,12.6,.44,partitionMaterial,0,10.4,18);
  box(partition,1.8,.9,.44,partitionMaterial,-28, .5,18);box(partition,1.8,13.5,.44,partitionMaterial,-28,10,18);
  for(const [x,w]of [[-17.75,28.5],[17.75,28.5]])obstacles.push({x,z:18,w,d:.6});
  textPlane(partition,'LAB / 01—07',5.8,.65,0,4.8,18.32,{color:'#b5eaff',background:'#102732',size:110});
  for(const x of [-3.5,3.5]){box(partition,.18,4,2.4,partitionMaterial,x,2,16.9);obstacles.push({x,z:16.9,w:.18,d:2.4});}
  const hallDoors=[];
  for(const side of [-1,1]){
    const door=new T.Group();door.position.set(side*1.7,0,17.72);partition.add(door);box(door,3.3,3.95,.18,'#273a47',0,2,0);box(door,.05,3.5,.025,glow('#67ceff'),-side*1.51,2,.12);hallDoors.push({door,side});
  }
  const metro=createSectorMap(partition,art,icons),partitionMaterials=new Set(),clones=new Map();
  partition.traverse(o=>{o.userData.dynamic=true;if(o.isMesh){if(!clones.has(o.material))clones.set(o.material,o.material.clone());o.material=clones.get(o.material);o.material.transparent=true;partitionMaterials.add(o.material);}});
  let partitionOpacity=1,hallLight=0,lastDoorOpen=false;
  let upperOpacity=1,enteredHall=false,settled=false;
  return {walls,partition,metro,landscape,get settled(){return settled;},get exteriorDarkness(){return darkness;},get hallLight(){return hallLight;},tick(dt,position,camera){
    settled=true;
    const settle=(value,target,rate,dt)=>{const next=T.MathUtils.damp(value,target,rate,dt);if(Math.abs(next-target)>.001){settled=false;return next;}return target;};
    const withinFootprint=Math.abs(position.x)<31.8&&position.z>-30.8;
    const interior=withinFootprint?1-T.MathUtils.smoothstep(position.z,27,30):0;
    darkness=settle(darkness,interior,2.4,dt);fadeExterior(darkness);
    world.backgroundIntensity=skyIntensity*T.MathUtils.lerp(1,.055,darkness);world.fog.color.copy(fogColor).lerp(nightFog,darkness);
    if(position.z<16)enteredHall=true;else if(position.z>19)enteredHall=false;
    hallLight=settle(hallLight,withinFootprint?1-T.MathUtils.smoothstep(position.z,11,17):0,2.8,dt);
    upperOpacity=settle(upperOpacity,1-interior,7,dt);upper.visible=upperOpacity>.01;
    upperMaterials.forEach(m=>{m.opacity=upperOpacity;m.depthWrite=upperOpacity>.98;});
    const cameraPosition=camera.position.clone().divideScalar(CAMPUS_SCALE);
    for(const wall of walls){
      const blocks=interior>.5&&(wall.name.startsWith('front')?cameraPosition.z>29:wall.name==='north'?cameraPosition.z<-31:wall.name==='west'?cameraPosition.x<-32:cameraPosition.x>32);
      wall.opacity=settle(wall.opacity,blocks?0:1,9,dt);wall.group.visible=wall.opacity>.015;
      wall.materials.forEach(m=>{m.opacity=wall.opacity;m.depthWrite=wall.opacity>.98;});
    }
    // Hide the partition only when viewing the hall through its near side.
    const cut=cameraPosition.z>18?1-T.MathUtils.smoothstep(position.z,14.7,18):0;
    partitionOpacity=settle(partitionOpacity,1-cut,6,dt);partition.visible=partitionOpacity>.002;
    partitionMaterials.forEach(m=>{m.opacity=partitionOpacity;m.depthWrite=partitionOpacity>.98;});
    const innerOpen=Math.abs(position.x)<5&&Math.abs(position.z-18)<7;
    hallDoors.forEach(({door,side})=>door.position.x=settle(door.position.x,side*(innerOpen?4.7:1.7),5,dt));
    const doorOpen=innerOpen||Math.hypot(position.x,position.z-29)<7,doorChanged=doorOpen!==lastDoorOpen;lastDoorOpen=doorOpen;
    doors.forEach(({door,side})=>door.position.x=settle(door.position.x,side*(Math.hypot(position.x,position.z-29)<7?6:2),7,dt));
    return {interior,enteredHall,hallLight,doorChanged};
  }};
}

// Ballistic fall, damped bounce and brief settling: deterministic, pooled objects.
export function parcelDrop(age){
  if(age<.5)return {y:1.49-4.16*age*age,tilt:age*1.1};
  const t=age-.5;return {y:.45+Math.abs(Math.sin(t*12))*Math.exp(-t*8)*.23,tilt:.55*Math.exp(-t*7)};
}

export function createParcelFlow(world,art,zones,factory,obstacles,hall,onCue=()=>{}){
  const {box,rod,mat,ring,cylinder,textPlane}=art,packets=[],couriers=[],deposits=[];
  const prototype=new T.Group();
  box(prototype,.5,.4,.5,'#263947');
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])box(prototype,.18,.16,.18,'#d4e0e5',x*.2,y*.16,z*.2);
  for(const side of [-1,1]){
    ring(prototype,.145,.026,art.glow('#54bdff'),0,0,side*.259);
    const plate=cylinder(prototype,.112,.018,'#9bafb9',0,0,side*.26);plate.rotation.x=Math.PI/2;
  }
  ring(prototype,.14,.02,art.glow('#54bdff'),0,.246,0,true);
  batchStatic(prototype);
  function parcel(parent,x=0,y=0,z=0){const g=prototype.clone(true);g.position.set(x,y,z);g.traverse(o=>o.userData.dynamic=true);parent.add(g);return g;}
  const speed=1.6,travel=30.3/speed;
  // Split the belt at the partition: each segment follows its room's lighting.
  const belt=[[-17,22.8,-28,22.8,world],[-28,22.8,-28,18,world],[-28,18,-28,3.5,hall]];
  const beltY=z=>1.13+(1-T.MathUtils.smoothstep(z,16,20))*1.8;
  for(const [ax,az,bx,bz,parent]of belt){
    const horizontal=az===bz,len=Math.hypot(bx-ax,bz-az),x=(ax+bx)/2,z=(az+bz)/2;
    const sections=Math.max(1,Math.ceil(len/.8));
    for(let i=0;i<sections;i++){
      const a=i/sections,b=(i+1)/sections,za=az+(bz-az)*a,zb=az+(bz-az)*b,xa=ax+(bx-ax)*a,xb=ax+(bx-ax)*b;
      const segmentLength=len/sections,ya=beltY(za),yb=beltY(zb),tilt=horizontal?0:-Math.atan((yb-ya)/(zb-za));
      const track=box(parent,horizontal?segmentLength:1.45,.2,horizontal?1.45:segmentLength/Math.cos(tilt),'#25343e',(xa+xb)/2,(ya+yb)/2,(za+zb)/2);track.rotation.x=tilt;
      for(const side of [-1,1])rod(parent,[xa+(horizontal?0:side*.73),ya+.12,za+(horizontal?side*.73:0)],[xb+(horizontal?0:side*.73),yb+.12,zb+(horizontal?side*.73:0)],.07,mat('#889ba6'));
    }
    for(let d=.12;d<len;d+=.43){const f=d/len,xx=ax+(bx-ax)*f,zz=az+(bz-az)*f;rod(parent,[xx-(horizontal?0:.65),beltY(zz)+.12,zz-(horizontal?.65:0)],[xx+(horizontal?0:.65),beltY(zz)+.12,zz+(horizontal?.65:0)],.055,mat('#8899a5'));}
    for(let d=1;d<len;d+=3.5){const f=d/len;box(parent,.14,beltY(az+(bz-az)*f)-.1,.14,'#384957',ax+(bx-ax)*f,beltY(az+(bz-az)*f)/2,az+(bz-az)*f);}
    obstacles.push({x,z,w:horizontal?len+1.5:1.65,d:horizontal?1.65:len+1.5});
  }
  const bin={x:-28,z:1.2},binY=groundHeight(bin.x,bin.z);box(hall,3.5,.15,3.6,'#5f727e',bin.x,binY+.075,bin.z);
  for(const side of [-1,1])box(hall,.1,.55,3.6,'#253846',bin.x+side*1.7,binY+.4,bin.z);
  box(hall,3.5,.55,.1,'#253846',bin.x,binY+.4,bin.z-1.8);obstacles.push({...bin,w:3.7,d:3.8});
  for(let i=0;i<9;i++)parcel(hall,bin.x+(i%3-1)*.78,binY+.15+.24+(i>=6?.48:0),bin.z-1+(Math.floor(i/3)%2)*.8);
  textPlane(hall,'01 / TRIAGEM',3.15,.5,bin.x,binY+.67,bin.z+1.87,{color:'#99dcff',background:'#182d38',size:120});
  for(let i=0;i<7;i++)packets.push({p:parcel(world),phase:i*3.1,previous:-1});
  const workers=Object.entries(zones).flatMap(([id,zone])=>slotsFor(id).map(([x,z])=>({x:zone.x+x,z:zone.z+z,r:.7})));
  const docks={hermes:[-5,0],models:[-28,-16],mcp:[-9,-16],memory:[8,-16],rag:[30,-12],cron:[27,14],vm:[-16,13]};
  for(const [index,[id,[x,z]]]of Object.entries(docks).entries()){
    const end={x,z},dockY=groundHeight(x,z-.85);box(hall,1.2,.1,1.2,'#2d4658',x,dockY+.05,z-.85);
    const deposited=parcel(hall,x,dockY+.34,z-.85);deposited.visible=false;deposits.push(deposited);
    const start={x:-25.2,z:2},route=findPath(start,end,obstacles,workers),curve=new T.CurvePath();let previous=new T.Vector3(start.x,groundHeight(start.x,start.z)-.03,start.z);
    for(const p of route){const next=new T.Vector3(p.x,groundHeight(p.x,p.z)-.03,p.z);curve.add(new T.LineCurve3(previous,next));previous=next;}
    const rig=factory.robot();rig.root.scale.setScalar(.85);rig.root.traverse(o=>o.userData.dynamic=true);hall.add(rig.root);const carried=parcel(rig.root,0,.82,.72);rod(carried,[-.88,.05,-.1],[.88,.05,-.1],.025,mat('#a1b4bc',.8,.28));const duration=Math.max(8,curve.getLength()/2.2);
    couriers.push({id,rig,parcel:carried,deposited,curve,duration,phase:index*4,speed:0,previousCarry:false});
  }
  hall.traverse(o=>o.userData.dynamic=true);
  return {packets,couriers,travel,tick(t){
    const revealTargets=[];
    for(const item of packets){
      const {p,phase}=item,age=(t+phase)%(travel+3);p.visible=age<travel+2.4;
      if(age<travel){const d=age*speed;if(d<11)p.position.set(-17-d,1.49,22.8);else {const z=22.8-(d-11);p.position.set(-28,1.49+(1-T.MathUtils.smoothstep(z,16,20))*1.8,z);}p.rotation.set(0,0,0);}
      else {const fall=parcelDrop(age-travel);p.position.set(-28,fall.y+binY-FLOOR,3.5-Math.min(1,age-travel)*1.45);p.rotation.set(fall.tilt,fall.tilt*.4,0);if(item.previous<travel+.5&&age>=travel+.5)onCue('drop',p.position);}
      const parent=p.position.z<17.7?hall:world;if(p.parent!==parent){parent.add(p);if(parent===hall)revealTargets.push(p);else p.traverse(o=>{if(o.material?.hallOriginal)o.material=o.material.hallOriginal;});}item.previous=age;
    }
    for(const item of couriers){const {rig,parcel,deposited,curve,duration,phase}=item;if(!curve.curves.length){rig.root.visible=false;continue;}const age=(t+phase)%(duration*2+4);let u,returning=false;
      if(age<2){u=0;parcel.visible=age>1;item.speed=0;}else if(age<duration+2){u=(age-2)/duration;parcel.visible=true;item.speed=curve.getLength()/duration;}else if(age<duration+4){u=1;parcel.visible=age<duration+3;deposited.visible=!parcel.visible;item.speed=0;}else{u=1-(age-duration-4)/duration;returning=true;parcel.visible=false;item.speed=curve.getLength()/duration;}
      u=T.MathUtils.clamp(u,0,1);rig.root.position.copy(curve.getPoint(u));rig.root.position.y=groundHeight(rig.root.position.x,rig.root.position.z)-.03;
      const direction=curve.getTangent(u);rig.root.rotation.y=Math.atan2(direction.x,direction.z)+(returning?Math.PI:0);
      if(parcel.visible!==item.previousCarry)onCue(parcel.visible?'pickup':'drop',rig.root.position);item.previousCarry=parcel.visible;
      for(const arm of rig.arms)if(parcel.visible){arm.upper.rotation.x=-.8;arm.lower.rotation.x=-.7;}
    }
    return revealTargets;
  }};
}
