import * as T from '../vendor/three.module.min.js';
import {createExteriorFade} from './lab-chamber-materials.js';
import {batchStatic} from './lab-batch.js';
import {createLandscape,terrainHeight,pavementHeight} from './lab-landscape.js';
import {ZONES,FLOOR,slotsFor,deckHeight,WALL_HEIGHT,BUILDING} from './lab-layout.js';
import {createSectorMap} from './lab-signage.js';
export {ZONES,FLOOR,slotsFor} from './lab-layout.js';
import {findPath} from './lab-navigation.js';

export const CAMPUS_SCALE = .7;
export function groundHeight(x,z) {
  return deckHeight(x,z) ?? (pavementHeight(x,z) ?? terrainHeight(x,z));
}

export function roomVisibility(position){
 const {halfWidth,north,front,partition}=BUILDING;
 const inShell=Math.abs(position.x)<halfWidth&&position.z>north&&position.z<front;
 const room=inShell?(position.z<partition?'hall':'reception'):'outside';
 const portal=(z,r)=>Math.abs(position.x)<3.4&&Math.abs(position.z-z)<r;
 const outer=portal(front,4),inner=portal(partition,5);
 return {room,exterior:outer?1-T.MathUtils.smoothstep(position.z,front-4,front+3):room==='outside'?0:1,
  hall:room==='hall'?inner?1-T.MathUtils.smoothstep(position.z,partition-5,partition+4):1:inner?1-T.MathUtils.smoothstep(position.z,partition-5,partition+4):0};
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
  const sky=world.background,black=new T.Color('#000000'),skyIntensity=world.backgroundIntensity,fogColor=world.fog.color.clone(),nightFog=black;
  let darkness=0;
  const reception=new T.Group();reception.name='gateway-reception';world.add(reception);
  const fadeReception=createExteriorFade(reception);
  // Nature occupies the lower level; walkable decks are built by lab-layout.
  surface(79.2,14.7,FLOOR,chamber.floor.clone(),0,25.35,reception).name='chamber-tile-floor';
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
      batchStatic(group);group.traverse(o=>o.userData.dynamic=true);materials.forEach(m=>{m.userData.cutawayOpacity=m.opacity;m.transparent=true;m.forceSinglePass=true;});
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
  const front=wall('front-left',-22.25,33,35.5,.45),frontRight=wall('front-right',22.25,33,35.5,.45);
  const left=wall('west',-40,-5,.45,76),right=wall('east',40,-5,.45,76),back=wall('north',0,-43,80,.45);
  // Large modular metal panels, with recessed joints and continuous glazing.
  const panelColors=['#e1e3df','#d8dcd8','#cdd3cf','#e8e9e3'];
  function panels(parent,side,fromY,toY){
    for(let row=fromY;row<toY;row+=4)for(let col=0;col<12;col++){
      const u=-40+col*(80/12)+(80/12)/2,color=panelColors[(col*7+row/4*3)%panelColors.length];
      if(side==='front'||side==='back'){
        if(side==='front'&&row<4&&Math.abs(u)<5)continue;
        box(parent,80/12-.045,3.94,.12,color,u,row+2,side==='front'?33.29:-43.29);
      }else{
        const z=-43+col*(76/12)+(76/12)/2;box(parent,.12,3.94,76/12-.05,color,side==='left'?-40.29:40.29,row+2,z);
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
  ribbon(front.group,-25.5,3.1,33.46,27,2.7);ribbon(frontRight.group,23,3.1,33.46,32,2.7);
  ribbon(left.group,-40.46,3.5,-10,54,1.6,-Math.PI/2);ribbon(right.group,40.46,3.5,-10,54,1.6,Math.PI/2);
  ribbon(back.group,0,3.5,-43.46,70,1.6,Math.PI);
  box(front.group,9,3.5,.45,facade,0,6.25,33);
  lining(front.group,35.3,-22.25,32.74,Math.PI);lining(frontRight.group,35.3,22.25,32.74,Math.PI);
  lining(left.group,75.1,-39.70,-5,Math.PI/2);lining(right.group,75.1,39.70,-5,-Math.PI/2);lining(back.group,79.2,0,-42.70);
  box(upper,80,12,76,facade,0,22,-5);
  panels(upper,'front',16,28);panels(upper,'left',16,28);panels(upper,'right',16,28);panels(upper,'back',16,28);
  ribbon(upper,7.5,20,33.46,46,2.8);
  ribbon(upper,-40.46,20,-8,64,2.8,-Math.PI/2);ribbon(upper,40.46,20,-8,64,2.8,Math.PI/2);
  ribbon(upper,0,20,-43.46,70,2.8,Math.PI);
  for(const x of [-10,0,10,20,28]){
    box(upper,1.25,.62,.12,'#53615c',x,24.7,33.45);
    for(let j=0;j<4;j++)box(upper,1.16,.045,.04,'#c1c9c0',x,24.5+j*.13,33.53);
  }
  box(upper,80.5,.23,76.5,'#89948c',0,28,-5);
  box(upper,79.8,.12,75.8,'#b3bcb3',0,27.86,-5);
  // Raised corner sign: only the brand sits inside the capsule; LAB is below.
  box(upper,16,12.05,.25,'#4c525d',-32,22,33.55);
  const plaque=new T.Group();plaque.name='sato-agents-corner-sign';plaque.position.set(-32,24,33.73);upper.add(plaque);
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
  box(upper,40,1.05,3.6,'#d5dbd5',7,5.55,34.65);
  box(upper,40,.1,3.6,'#7b8980',7,4.99,34.65);
  for(const x of [-10,-2,6,14,22])box(upper,.12,.65,3.4,'#a7b3a9',x,4.63,34.5);
  textPlane(upper,'RECEPÇÃO / GATEWAY',7.8,.6,0,4.45,36.5,{color:'#e9f0e5',background:'#34483e',size:70});
  const upperMaterials=new Set(),upperClones=new Map();upper.traverse(o=>{if(o.isMesh){if(!upperClones.has(o.material))upperClones.set(o.material,o.material.clone());o.material=upperClones.get(o.material);upperMaterials.add(o.material);}});
  batchStatic(upper);upper.traverse(o=>o.userData.dynamic=true);upperMaterials.forEach(m=>{m.transparent=true;m.forceSinglePass=true;});
  const doors=[];
  for(const side of [-1,1]){
    const g=new T.Group();front.group.add(g);g.userData.dynamic=true;
    box(g,3.9,3.5,.12,new T.MeshStandardMaterial({color:'#a8d8d7',transparent:true,opacity:.28,roughness:.16}),0,1.8,33);
    for(const x of [-1.95,1.95])box(g,.07,3.6,.16,frame,x,1.8,33);
    box(g,.08,.65,.14,'#e0e9db',side*1.45,1.6,33.12);
    g.traverse(o=>o.userData.dynamic=true);doors.push({door:g,side});
  }
  [front,frontRight,left,right,back].forEach(w=>w.seal());
  obstacles.push({x:-22.25,z:33,w:35.5,d:.6},{x:22.25,z:33,w:35.5,d:.6},{x:-40,z:-5,w:.6,d:76},{x:40,z:-5,w:.6,d:76},{x:0,z:-43,w:80,d:.6});
  // The sole conveyor hatch is at the left; the visitor door stays in the center.
  const partition=new T.Group();partition.name='gateway-partition';world.add(partition);
  const partitionMaterial=chamber.equipment('#89949b',.2,.78).clone();
  const segments=[[-39.45,1.1],[-20.3,33.6],[21.75,36.5]];
  for(const [x,w]of segments){
    box(partition,w,16.7,.44,partitionMaterial,x,8.4,18);
    for(const side of [-1,1]){const face=mesh(partition,new T.PlaneGeometry(w-.09,16.5),chamber.wall(w,16.5),x,8.4,18+side*.26);face.rotation.y=side<0?Math.PI:0;}
  }
  box(partition,7,12.6,.44,partitionMaterial,0,10.4,18);
  box(partition,1.8,.9,.44,partitionMaterial,-38, .5,18);box(partition,1.8,13.5,.44,partitionMaterial,-38,10,18);
  for(const [x,w]of [[-21.75,36.5],[21.75,36.5]])obstacles.push({x,z:18,w,d:.6});
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
  function registerReception(root=reception){fadeReception.register(root);root.traverse(o=>o.userData.dynamic=true);}
  function attachToWall(name,root){
    const wall=walls.find(w=>w.name===name);wall.group.attach(root);
    root.traverse(o=>{o.userData.dynamic=true;if(o.material){
      const material=o.material.clone();material.onBeforeCompile=o.material.onBeforeCompile;material.customProgramCacheKey=o.material.customProgramCacheKey;
      material.userData.cutawayOpacity=material.opacity;material.transparent=true;o.material=material;wall.materials.add(material);
    }});
  }
  return {walls,partition,metro,landscape,reception,registerReception,attachToWall,get settled(){return settled;},get exteriorDarkness(){return darkness;},get hallLight(){return hallLight;},tick(dt,position,camera){
    settled=true;
    const settle=(value,target,rate,dt)=>{const next=T.MathUtils.damp(value,target,rate,dt);if(Math.abs(next-target)>.001){settled=false;return next;}return target;};
    const visibility=roomVisibility(position);
    const interior=visibility.exterior;
    darkness=settle(darkness,interior,2.4,dt);fadeExterior(darkness);
    world.background=darkness>.998?black:sky;world.backgroundIntensity=skyIntensity*(1-darkness);world.fog.color.copy(fogColor).lerp(nightFog,darkness);
    if(position.z<16)enteredHall=true;else if(position.z>19)enteredHall=false;
    hallLight=settle(hallLight,visibility.hall,2.8,dt);
    fadeReception(hallLight);
    upperOpacity=settle(upperOpacity,1-interior,7,dt);upper.visible=upperOpacity>.01;
    upperMaterials.forEach(m=>{m.opacity=upperOpacity;m.depthWrite=upperOpacity>.98;});
    const cameraPosition=camera.position.clone().divideScalar(CAMPUS_SCALE);
    for(const wall of walls){
      const blocks=wall.name.startsWith('front')&&hallLight>.998||interior>.5&&(wall.name.startsWith('front')?cameraPosition.z>33:wall.name==='north'?cameraPosition.z<-43:wall.name==='west'?cameraPosition.x<-40:cameraPosition.x>40);
      wall.opacity=settle(wall.opacity,blocks?0:1,9,dt);wall.group.visible=wall.opacity>.015;
      wall.materials.forEach(m=>{m.opacity=wall.opacity*(m.userData.cutawayOpacity??1);m.depthWrite=wall.opacity>.98;});
    }
    // Hide the partition only when viewing the hall through its near side.
    const cut=cameraPosition.z>18?1-T.MathUtils.smoothstep(position.z,14.7,18):0;
    partitionOpacity=settle(partitionOpacity,1-cut,6,dt);partition.visible=partitionOpacity>.002;
    partitionMaterials.forEach(m=>{m.opacity=partitionOpacity;m.depthWrite=partitionOpacity>.98;});
    const innerOpen=Math.abs(position.x)<5&&Math.abs(position.z-18)<7;
    hallDoors.forEach(({door,side})=>door.position.x=settle(door.position.x,side*(innerOpen?4.7:1.7),5,dt));
    const doorOpen=innerOpen||Math.hypot(position.x,position.z-33)<7,doorChanged=doorOpen!==lastDoorOpen;lastDoorOpen=doorOpen;
    doors.forEach(({door,side})=>door.position.x=settle(door.position.x,side*(Math.hypot(position.x,position.z-33)<7?6:2),7,dt));
    return {interior,enteredHall,hallLight,doorChanged};
  }};
}

// Distance-parametrized route: a tangent-continuous radius-2 quarter turn.
export const BELT_LENGTH=14+Math.PI+29;
export function conveyorPoint(distance){
 const d=Math.max(0,Math.min(BELT_LENGTH,distance));
 if(d<=14)return {x:-22-d,z:26,angle:-Math.PI/2};
 if(d<14+Math.PI){const a=(d-14)/2;return {x:-36-2*Math.sin(a),z:24+2*Math.cos(a),angle:-Math.PI/2-a};}
 return {x:-38,z:24-(d-14-Math.PI),angle:-Math.PI};
}

// Ballistic fall, damped bounce and brief settling: deterministic, pooled objects.
export function parcelDrop(age){
  if(age<.5)return {y:1.49-4.16*age*age,tilt:age*1.1};
  const t=age-.5;return {y:.45+Math.abs(Math.sin(t*12))*Math.exp(-t*8)*.23,tilt:.55*Math.exp(-t*7)};
}

export function createParcelFlow(world,art,zones,factory,obstacles,hall,onCue=()=>{},reception=world,onReception=()=>{}){
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
  const speed=1.6,feed=.8,travel=feed+BELT_LENGTH/speed,slats=[];
  const beltY=z=>1.13+(1-T.MathUtils.smoothstep(z,16,20))*1.8;
  // One continuous ribbon and tangent-aligned rails cover the quarter-circle elbow.
  for(const parent of [reception,hall]){
    const positions=[],indices=[],count=Math.ceil(BELT_LENGTH/.3);
    let previous=null;
    for(let i=0;i<=count;i++){
      const p=conveyorPoint(i/count*BELT_LENGTH),y=beltY(p.z),inside=p.z<18;
      for(const side of [-1,1])positions.push(p.x+Math.cos(p.angle)*side*.72,y+.1,p.z-Math.sin(p.angle)*side*.72);
      if(i&&((parent===hall)===inside)){const j=i*2;indices.push(j-2,j-1,j,j-1,j+1,j);
        for(const side of [-1,1])rod(parent,[previous.x+Math.cos(previous.angle)*side*.76,beltY(previous.z)+.22,previous.z-Math.sin(previous.angle)*side*.76],[p.x+Math.cos(p.angle)*side*.76,y+.22,p.z-Math.sin(p.angle)*side*.76],.07,mat('#96a8b5'));
      }previous=p;
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const track=art.mesh(parent,geometry,new T.MeshStandardMaterial({color:'#23343f',side:T.DoubleSide,roughness:.85}));track.name='continuous-conveyor-belt';
    for(let i=0;i<Math.ceil(BELT_LENGTH/.55);i++){const slat=box(parent,1.32,.055,.085,'#6e899a');slat.userData.dynamic=true;slat.name='moving-conveyor-slat';slats.push({object:slat,index:i,hall:parent===hall});}
  }
  for(let distance=1;distance<BELT_LENGTH;distance+=3){const p=conveyorPoint(distance);box(p.z<18?hall:reception,.16,beltY(p.z),.16,'#384f5e',p.x,beltY(p.z)/2,p.z);}
  obstacles.push({x:-29,z:26,w:15.5,d:1.7},{x:-38,z:9.5,w:1.7,d:31},{x:-37,z:25,w:3.5,d:3.5});
  const chute=new T.Group();chute.name='gateway-ceiling-parcel-chute';chute.position.set(-22,0,26);reception.add(chute);
  cylinder(chute,.7,WALL_HEIGHT-4.4,'#647e8e',0,(WALL_HEIGHT+4.4)/2,0);box(chute,1.9,.16,1.9,'#263c4d',0,WALL_HEIGHT-.08,0);cylinder(chute,.84,.2,'#c3d5dd',0,4.4,0);
  cylinder(chute,.65,.04,'#07131d',0,4.27,0);ring(chute,.74,.055,art.glow('#76d9ff'),0,4.3,0,true);
  for(const y of [5,8,11,14]){ring(chute,.73,.07,'#344e60',0,y,0,true);}
  const bin={x:-37.6,z:-7.3},binY=groundHeight(bin.x,bin.z);box(hall,3.5,.15,3.6,'#5f727e',bin.x,binY+.075,bin.z);
  for(const side of [-1,1])box(hall,.1,.55,3.6,'#253846',bin.x+side*1.7,binY+.4,bin.z);
  box(hall,3.5,.55,.1,'#253846',bin.x,binY+.4,bin.z-1.8);obstacles.push({...bin,w:3.7,d:3.8});
  for(let i=0;i<9;i++)parcel(hall,bin.x+(i%3-1)*.78,binY+.15+.24+(i>=6?.48:0),bin.z-1+(Math.floor(i/3)%2)*.8);
  textPlane(hall,'01 / TRIAGEM',3.15,.5,bin.x,binY+.67,bin.z+1.87,{color:'#99dcff',background:'#182d38',size:120});
  for(let i=0;i<7;i++)packets.push({p:parcel(reception),phase:i*3.1,previous:-1});
  const workers=Object.entries(zones).flatMap(([id,zone])=>slotsFor(id).map(([x,z])=>({x:zone.x+x,z:zone.z+z,r:.7})));
  const docks=Object.fromEntries(Object.entries(zones).filter(([id])=>id!=='gateway').map(([id,zone])=>[id,[zone.x+(zone.x>0?7:-7),zone.z+5]]));
  for(const [index,[id,[x,z]]]of Object.entries(docks).entries()){
    const end={x,z},dockY=groundHeight(x,z-.85);box(hall,1.2,.1,1.2,'#2d4658',x,dockY+.05,z-.85);
    const deposited=parcel(hall,x,dockY+.34,z-.85);deposited.visible=false;deposits.push(deposited);
    const start={x:-34,z:-7},route=findPath(start,end,obstacles,workers),curve=new T.CurvePath();let previous=new T.Vector3(start.x,groundHeight(start.x,start.z)-.03,start.z);
    for(const p of route){const next=new T.Vector3(p.x,groundHeight(p.x,p.z)-.03,p.z);curve.add(new T.LineCurve3(previous,next));previous=next;}
    const rig=factory.robot();rig.root.scale.setScalar(.85);rig.root.traverse(o=>o.userData.dynamic=true);hall.add(rig.root);const carried=parcel(rig.root,0,.82,.72);rod(carried,[-.88,.05,-.1],[.88,.05,-.1],.025,mat('#a1b4bc',.8,.28));const duration=Math.max(8,curve.getLength()/2.2);
    couriers.push({id,rig,parcel:carried,deposited,curve,duration,phase:index*4,speed:0,previousCarry:false});
  }
  hall.traverse(o=>o.userData.dynamic=true);
  return {packets,couriers,travel,tick(t){
    const revealTargets=[];
    for(const slat of slats){const p=conveyorPoint((t*speed+slat.index*.55)%BELT_LENGTH);slat.object.visible=(p.z<17.7)===slat.hall;slat.object.position.set(p.x,beltY(p.z)+.14,p.z);slat.object.rotation.y=p.angle;}

    for(const item of packets){
      const {p,phase}=item,age=(t+phase)%(travel+3);p.visible=age<travel+2.4;
      if(age<feed){p.position.set(-22,1.49+2.71*(1-(age/feed)**2),26);p.rotation.set(0,0,0);}
      else if(age<travel){const at=conveyorPoint((age-feed)*speed);p.position.set(at.x,beltY(at.z)+.36,at.z);p.rotation.set(0,at.angle,0);}
      else {const fall=parcelDrop(age-travel);p.position.set(-38,fall.y+binY-FLOOR,-5-Math.min(1,age-travel)*1.45);p.rotation.set(fall.tilt,fall.tilt*.4,0);if(item.previous<travel+.5&&age>=travel+.5)onCue('drop',p.position);}
      const parent=p.position.z<17.7?hall:reception;if(p.parent!==parent){p.traverse(o=>{while(o.material?.hallOriginal||o.material?.roomOriginal)o.material=o.material.hallOriginal||o.material.roomOriginal;});parent.add(p);if(parent===hall)revealTargets.push(p);else onReception(p);}item.previous=age;
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
