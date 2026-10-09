import {createWorkstation} from './scene-equipment.js';
import {createMonitorBank,indicatorCards} from './lab-monitors.js';
import {createHistoryBoard} from './lab-history.js';
import * as T from '../vendor/three.module.min.js';
import {createCampus,createParcelFlow,ZONES,slotsFor,CAMPUS_SCALE,FLOOR,groundHeight} from './lab-campus.js';
import {createChamberMaterials,createHallReveal} from './lab-chamber-materials.js';
import {createLabBiome} from './lab-biome.js';
import {updateNature} from './nature-motion.js';
import {loadFoliageTexture} from './folio-foliage.js';
import {createAreaFloors,createEnergyLines,gridPlacement,BUILDING} from './lab-layout.js';
import {loadSectorIcons,createSectorSign} from './lab-signage.js';
import {loadEnvironment} from './lab-environment.js';
import {createLabAudio,ambienceLevels} from './lab-audio.js';
import {createDialogue} from './lab-dialogue.js';
import {createInstallations} from './lab-installations.js';
import {createRagDome} from './lab-rag.js';
import {batchStatic} from './lab-batch.js';
import {loadSatoAvatar} from './lab-avatar.js';
import {createLabControls,WALK_SPEED,RUN_SPEED} from './lab-controls.js';
import {createSceneArt} from './scene-art.js';
import {createRigFactory, poseRig, dampAngle} from './lab-rigs.js';
import {canStand, findPath, nearestFree, moveWithCollision} from './lab-navigation.js';

// Local assets only: companion geometry, shared equipment and procedural campus.
const LIVE = new Set(['recent', 'running', 'process']);
const NAMES=Object.fromEntries(Object.entries(ZONES).map(([id,z])=>[id,z.name]));

export async function createLabScene(container, callbacks) {
  await document.fonts.load('700 48px Nunito');callbacks.onLoadProgress?.(18,'PREPARANDO PERSONAGEM');
  const [hero,sectorIcons] = await Promise.all([loadSatoAvatar(),loadSectorIcons(),loadFoliageTexture()]);callbacks.onLoadProgress?.(37,'CARREGANDO AMBIENTE');
  const renderer = new T.WebGLRenderer({antialias: true, alpha: false, powerPreference: 'high-performance'});
  let pixelRatio=Math.min(devicePixelRatio,1.75),qualityFrames=0,qualityElapsed=0;
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  container.append(renderer.domElement);
  const audio=createLabAudio(),dialogue=createDialogue(container);
  const world = new T.Scene(); world.background = new T.Color('#c5dde4');
  world.fog = new T.Fog('#bfd2d7', 115, 260);
  const environment = await loadEnvironment(renderer,world);callbacks.onLoadProgress?.(61,'MONTANDO LABORATÓRIO');
  const hall = new T.Group(); hall.name='main-laboratory'; world.add(hall);
  const camera = new T.PerspectiveCamera(42, 1, .35, 400);
  const openingTarget=()=>camera.aspect<.8?new T.Vector3(-19,8,23):new T.Vector3(5,3.2,9);
  const openingAzimuth=()=>camera.aspect<.8?-.45:-.72;
  const aim = openingTarget().multiplyScalar(CAMPUS_SCALE), target = aim.clone();
  let azimuth = -.72, elevation = .26, radius = 55, targetRadius = 55, paused = false, stale = false;
  let latestData = null, lastTime = 0, animationTime = 0, lastPosition = 0;
  let dirty = true,firstFrame=true;
  const robots = new Map(), zones = new Map(), hitObjects = [], obstacles = [];
  const chamber=createChamberMaterials();let furnishing=false;
  const mats = new Map(), geometries = new Map();
  const mat = (color, metalness = .1, roughness = .65) => {
    if(furnishing)return chamber.equipment(color,metalness,roughness);
    const key = `${color}:${metalness}:${roughness}`;
    if (!mats.has(key)) mats.set(key, new T.MeshStandardMaterial({color, metalness, roughness}));
    return mats.get(key);
  };
  const glow = color => {
    const key = `glow:${color}`;
    if (!mats.has(key)) mats.set(key, new T.MeshStandardMaterial({color, emissive: color, emissiveIntensity: .85, roughness: .4}));
    return mats.get(key);
  };
  const geo = (key, create) => { if (!geometries.has(key)) geometries.set(key, create()); return geometries.get(key); };
  function mesh(parent, geometry, material, x = 0, y = 0, z = 0, shadow = true) {
    const m = new T.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, w, h, d, color, x = 0, y = 0, z = 0) {
    const m = mesh(parent, geo('box', () => new T.BoxGeometry(1, 1, 1)), typeof color === 'string' ? mat(color) : color, x, y, z);
    m.scale.set(w, h, d); return m;
  }
  function sphere(parent, r, color, x = 0, y = 0, z = 0, scale = [1, 1, 1]) {
    const m = mesh(parent, geo('sphere', () => new T.SphereGeometry(1, 24, 16)), typeof color === 'string' ? mat(color) : color, x, y, z);
    m.scale.set(r * scale[0], r * scale[1], r * scale[2]); return m;
  }
  function cylinder(parent, r, height, color, x = 0, y = 0, z = 0, top = r) {
    return mesh(parent, geo(`cyl:${r}:${top}:${height}`, () => new T.CylinderGeometry(top, r, height, 24)), typeof color === 'string' ? mat(color) : color, x, y, z);
  }
  function ring(parent, r, thickness, color, x = 0, y = 0, z = 0, floor = false) {
    const m = mesh(parent, geo(`ring:${r}:${thickness}`, () => new T.TorusGeometry(r, thickness, 8, 64)), typeof color === 'string' ? mat(color) : color, x, y, z);
    if (floor) m.rotation.x = Math.PI / 2; return m;
  }
  function rod(parent, a, b, width, material) {
    const start = new T.Vector3(...a), end = new T.Vector3(...b), delta = end.clone().sub(start);
    const m = cylinder(parent, width, delta.length(), material);
    m.position.copy(start.add(end).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()); return m;
  }
  function textPlane(parent, text, width, height, x, y, z, {color = '#315d59', background = '#dbe5da', floor = false, size = 65, digital = false, rounded = false} = {}) {
    const canvas = document.createElement('canvas'); canvas.width = digital?1536:2048; canvas.height = Math.round(canvas.width*height/width);
    const ctx = canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    ctx.fillStyle = background;
    if(rounded){ctx.beginPath();ctx.roundRect(5,5,w-10,h-10,h/2-5);ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=12;ctx.beginPath();ctx.roundRect(24,24,w-48,h-48,h/2-24);ctx.stroke();}
    else ctx.fillRect(0,0,w,h);
    const ink=document.createElement('canvas');ink.width=w;ink.height=h;const pen=ink.getContext('2d');
    let fontSize=Math.min(h*.67,size*h/150);pen.font=`800 ${fontSize}px Nunito`;
    while(pen.measureText(text).width>w*.88){fontSize-=2;pen.font=`800 ${fontSize}px Nunito`;}
    pen.textAlign='center';pen.textBaseline='middle';pen.fillStyle=color;pen.fillText(text,w/2,h*.52);
    if(digital){
      const pixels=pen.getImageData(0,0,w,h).data,step=7;
      for(let yy=step;yy<h;yy+=step)for(let xx=step;xx<w;xx+=step){
        const lit=pixels[(yy*w+xx)*4+3]>80;ctx.fillStyle=lit?color:'#193531';ctx.shadowColor=color;ctx.shadowBlur=lit?5:0;
        ctx.beginPath();ctx.arc(xx,yy,2.35,0,Math.PI*2);ctx.fill();
      }
    }else ctx.drawImage(ink,0,0);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    const material = new T.MeshBasicMaterial({map: texture, side: T.FrontSide,transparent:rounded,toneMapped:false});
    const plane = mesh(parent, new T.PlaneGeometry(width, height), material, x, y, z, false);
    if (floor) plane.rotation.x = -Math.PI / 2; return plane;
  }
  world.add(new T.HemisphereLight('#e5f6ff', '#637457', 1.25));
  const sunlight = new T.DirectionalLight('#ffe7c4', 2.65); sunlight.position.set(-25, 65, 30); sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024); Object.assign(sunlight.shadow.camera, {left: -60, right: 60, top: 60, bottom: -60, far: 140});
  sunlight.shadow.normalBias = .045; sunlight.shadow.bias = -.0001; world.add(sunlight);
  const fill = new T.DirectionalLight('#b2d9ed', .75); fill.position.set(13, 9, -10); world.add(fill);
  const rim=new T.DirectionalLight('#f9d9a7',.7);rim.position.set(-20,12,-28);world.add(rim);

  const art={box,sphere,cylinder,ring,rod,mesh,mat,glow,geo,textPlane};
  const campus=createCampus(world,art,obstacles,environment,chamber,hall,sectorIcons);
  furnishing=true;
  callbacks.onLoadProgress?.(79,'PREPARANDO CENA');
  createAreaFloors(hall,art,obstacles);
  const biome=createLabBiome(hall,art,environment);
  const energy=createEnergyLines(hall,groundHeight);
  function consoleDesk(group,color){
    group.name='sector-shared-workbench';
    for(const x of [-2.8,0,2.8])createWorkstation(group,art,{x});
    batchStatic(group);group.traverse(o=>o.userData.dynamic=true);
  }

  function receptionDesk(group,color){
    box(group,6.3,1.05,1.4,'#27323b',0,.525,0);
    box(group,6.1,.76,.05,'#e2e8e9',0,.55,.72);
    for(const x of [-1.2,1.2])for(let i=0;i<4;i++)box(group,.3,.025,.02,'#394851',x,.34+i*.09,.755);
    box(group,6.6,.16,1.65,'#e2e6d4',0,1.13,0);
    box(group,3.1,.065,.04,glow(color),0,.79,.72);
    return null;
  }
  for (const [id, zone] of Object.entries(ZONES)) {
    const group = new T.Group(); group.position.set(zone.x, groundHeight(zone.x,zone.z), zone.z); (id==='gateway'?campus.reception:hall).add(group);
    const r = id==='gateway'?4.1:9;
    const trim=box(group,3,.04,.035,glow(zone.color),0,.055,3.7);
    const desk = new T.Group(); desk.position.z = id==='gateway'?.9:gridPlacement(zone,'bench').z-zone.z; group.add(desk); if(id==='gateway')receptionDesk(desk,zone.color);else consoleDesk(desk, zone.color);
    // Gateway screens mount on the reception face of the partition (z > 18).
    const monitorZ=id==='gateway'?18.48-zone.z:gridPlacement(zone,'monitors').z-zone.z;
    const display=createMonitorBank(group,art,{sector:id,z:monitorZ,y:id==='gateway'?-.25:0,wallMounted:id==='gateway'});
    const history=createHistoryBoard(group,art,id,{x:7,z:monitorZ});
    display.root.userData.grid=gridPlacement(zone,'monitors').cells;history.root.userData.grid=gridPlacement(zone,'history').cells;desk.userData.grid=gridPlacement(zone,'bench').cells;
    if(id!=='gateway')for(const side of [-1,1])obstacles.push({x:zone.x+side*3.6,z:zone.z+monitorZ,w:.22,d:.22});
    obstacles.push({x:zone.x,z:zone.z+desk.position.z,w:id==='gateway'?6.6:8.5,d:1.75});
    zones.set(id, {group, trim, display, history, status:'unknown',radius:r});
    zones.get(id).sign=createSectorSign(id==='gateway'?campus.reception:hall,id,art,sectorIcons,obstacles);
    zones.get(id).sign.userData.grid=gridPlacement(zone,'number').cells;
    obstacles.push({x:zone.x+7,z:zone.z+monitorZ,w:2.85,d:.6});
  }
  // One workbench per sector; auxiliary agents share it without extra furniture.
  const benches=new Map();
  for(const [id,zone] of Object.entries(ZONES)){
    for(let i=1;i<slotsFor(id).length;i++)benches.set(`${id}:${i}`,{display:{update(){}}});
    zones.get(id).trim.userData.dynamic=true;
  }
  // Keep the plaques raycastable when batching the static chamber.
  world.traverse(o => { if (o.isMesh && o.userData.station) hitObjects.push(o); });
  const installations=createInstallations(hall,zones,art,p=>audio.cue('clock',p,'cron-clock'));
  campus.attachToWall('north',installations.activityRoot);const ragDome=createRagDome(hall,art,ZONES.rag);installations.roots.set('rag',ragDome.root);
  for(const [id,root]of installations.roots){
    batchStatic(root);root.traverse(o=>o.userData.dynamic=true);root.userData.equipmentSector=id;
    if(id==='vm'){
      for(const x of [-3,0,3])for(const z of [-2,0,2])obstacles.push({x:root.position.x+x,z:root.position.z+z,w:1.3,d:1.7});
    }else{
      const dims={models:[5,3],mcp:[6,6],memory:[4.6,3.4],hermes:[3.6,3.6],cron:[7.5,.6],rag:[6.4,6.4]}[id];
      obstacles.push({x:root.position.x,z:root.position.z,w:dims[0],d:dims[1]});
    }
  }
  batchStatic(hall);
  hall.traverse(o=>o.userData.dynamic=true);
  campus.registerReception();
  batchStatic(world);

  const factory = createRigFactory(createSceneArt());
  const parcels=createParcelFlow(world,art,ZONES,factory,obstacles,hall,(kind,p)=>audio.cue(kind,p),campus.reception,p=>campus.registerReception(p));campus.registerReception();batchStatic(world);
  const hallReveal=createHallReveal(world,hall);
  const walkSurfaces=[];world.traverse(o=>{if(o.isMesh&&o.userData.walkable)walkSurfaces.push(o);});
  const avatar = hero.root; avatar.position.set(0,FLOOR,46); avatar.scale.setScalar(1.12);avatar.rotation.y=Math.PI; world.add(avatar);
  const destination = ring(world,.27,.023,glow('#c6f0f7'),0,.16,0,true); destination.visible=false;
  let study=false,savedStudyCamera=null,arrivalView=true,started=false;
  let cameraMode='follow', savedCamera=null, chatId=null, desiredRobot=null, route=[], location=null, candidate=null, emoteUntil=0;
  let targetAzimuth=azimuth, targetElevation=elevation, wasMoving=false, contextLost=false;
  const circles=[], zoneByRobot=new Map();
  const phaseFor=id => [...id].reduce((n,c) => (n*31+c.charCodeAt(0))%997,0)/71;
  const dist=(a,b) => Math.hypot(a.x-b.x,a.z-b.z);
  function inside(id,p=avatar.position) {const z=ZONES[id];if(id==='gateway')return p.z>18.6&&p.z<30&&Math.abs(p.x-z.x)<9;return p.z<18&&Math.abs(p.x-z.x)<9&&p.z>z.z-9&&p.z<z.z+9;}
  function groundAt(x,z) { return groundHeight(x,z); }
  const emoticons=new Map();
  for (const text of ['…','?','!','✓','✦']) {
    const c=document.createElement('canvas'); c.width=128;c.height=128; const ctx=c.getContext('2d');
    ctx.fillStyle='#f1fbf3';ctx.beginPath();ctx.roundRect(7,5,114,99,27);ctx.fill();ctx.beginPath();ctx.moveTo(45,100);ctx.lineTo(50,122);ctx.lineTo(72,100);ctx.fill();
    ctx.fillStyle='#28637b';ctx.font='600 61px Nunito';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,64,55);
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;
    emoticons.set(text,new T.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  }
  function bubble(parent,height) { const sprite=new T.Sprite(emoticons.get('…'));sprite.position.y=height;sprite.scale.set(.53,.53,1);sprite.visible=false;sprite.renderOrder=10;parent.add(sprite);return sprite; }
  hero.bubble=bubble(avatar,2.7);
  function showBubble(rig,text) { rig.bubble.material=emoticons.get(text);rig.bubble.visible=true; }
  function refreshCircles() { circles.length=0; for (const [id,item] of robots) circles.push({id,x:item.rig.root.position.x,z:item.rig.root.position.z,r:item.worker.sector==='hermes'&&item.slot===0?.87:item.slot===0?.57:.44}); }
  function update(data) {
    latestData=data;stale=false;dirty=true;installations.update(data);
    const keep=new Set();
    for (const [id,zone] of Object.entries(ZONES)) {
      const workers=data.workers.filter(w=>w.sector===id&&(id!=='gateway'||w.kind==='guide')), guide=workers.find(w=>w.kind==='guide');
      const priority=w=>w.kind==='guide'?0:w.id===chatId?1:w.id===desiredRobot?2:3;
      const visible=workers.sort((a,b)=>priority(a)-priority(b)).slice(0,slotsFor(id).length);
      const slots=slotsFor(id);
      const occupied=new Set();
      // Preserve each actor's workstation across snapshots, even when order changes.
      for (const w of visible) if (robots.has(w.id)) occupied.add(robots.get(w.id).slot);
      for (const w of visible) {
        keep.add(w.id); let item=robots.get(w.id);
        if (!item) {
          const slot=w.kind==='guide'?0:slots.map((_,i)=>i).slice(1).find(i=>!occupied.has(i));if(slot===undefined)continue;occupied.add(slot);
          const isCore=id==='hermes'&&slot===0;const rig=factory.robot({core:isCore,floating:true});rig.phase=phaseFor(w.id);rig.root.scale.setScalar(isCore?1.35:slot===0?1:.8);rig.root.position.set(zone.x+slots[slot][0],groundAt(zone.x+slots[slot][0],zone.z+slots[slot][1])-.03,zone.z+slots[slot][1]);
          rig.root.traverse(o=>o.userData.robot=w.id);rig.bubble=bubble(rig.root,2.27);(id==='gateway'?campus.reception:hall).add(rig.root);
          item={rig,slot,worker:w};robots.set(w.id,item);renderer.shadowMap.needsUpdate=true;
        }
        item.worker=w;zoneByRobot.set(w.id,id);
        item.rig.indicator.material=glow(id==='hermes'&&item.slot===0?'#ffad4a':w.status==='error'?'#df9c6d':LIVE.has(w.status)?'#89d7b9':'#829c93');
        if(item.slot)benches.get(`${id}:${item.slot}`).display.update([w.name,w.status_label,w.detail||'']);
      }
      for(let i=1;i<slotsFor(id).length;i++) if(!visible.some(w=>robots.get(w.id)?.slot===i))benches.get(`${id}:${i}`).display.update(['BANCADA AUXILIAR','Aguardando agente','']);
      const z=zones.get(id);z.status=guide?.status||'unknown';z.trim.material=LIVE.has(z.status)?glow(zone.color):mat('#8ca89a');
      if(guide)z.display.update([NAMES[id]+' / '+guide.name,guide.status_label,...(guide.facts||[]).slice(0,2)]);
    }
    for(const[id,item]of robots)if(!keep.has(id)){item.rig.root.removeFromParent();for(const g of item.rig.ownedGeometry)g.dispose();item.rig.pupil.material.dispose();item.rig.opticMaterial.dispose();robots.delete(id);zoneByRobot.delete(id);renderer.shadowMap.needsUpdate=true;}
    campus.registerReception();hallReveal.register();refreshCircles();
    const free=nearestFree(avatar.position,obstacles,circles,2);if(free&&!canStand(avatar.position.x,avatar.position.z,obstacles,circles)){avatar.position.x=free.x;avatar.position.z=free.z;stopWalking();}
    if(route.length)route=findPath(avatar.position,route.at(-1),obstacles,circles);
    if(chatId&&!robots.has(chatId))endChat();
  }
  function stopWalking(){controls.reset();route=[];movementSpeed=0;hero.cancelActions();destination.visible=false;dirty=true;}
  const cornerRadius=()=>camera.aspect<.8?Math.max(45,20/camera.aspect):55;
  const outside=()=>avatar.position.z>BUILDING.front||Math.abs(avatar.position.x)>BUILDING.halfWidth||avatar.position.z<BUILDING.north;
  function start(){if(started)return;started=true;arrivalView=false;cameraMode='follow';targetRadius=30*CAMPUS_SCALE;targetElevation=.48;targetAzimuth=.55;callbacks.onCamera('follow');audio.cue('click');dirty=true;}
  function leaveArrival(){if(started&&arrivalView){arrivalView=false;targetRadius=30*CAMPUS_SCALE;}}
  function navigate(point){leaveArrival();audio.cue('click');if(chatId||study)return false;const next=findPath(avatar.position,point,obstacles,circles);if(!next.length){callbacks.onToast('Não encontrei um caminho livre até esse ponto.');return false;}route=next;destination.position.set(next.at(-1).x,groundAt(next.at(-1).x,next.at(-1).z)+.025,next.at(-1).z);destination.visible=true;dirty=true;return true;}
  function approach(item){
    const center=item.rig.root.position,options=[];
    for(let i=0;i<16;i++){const angle=i*Math.PI/8,p={x:center.x+Math.sin(angle)*(item.worker.sector==='gateway'?3.05:1.5),z:center.z+Math.cos(angle)*(item.worker.sector==='gateway'?3.05:1.5)};if(inside(item.worker.sector,p)&&canStand(p.x,p.z,obstacles,circles))options.push(p);}
    options.sort((a,b)=>dist(a,avatar.position)-dist(b,avatar.position));
    for(const p of options){const path=findPath(avatar.position,p,obstacles,circles);if(path.length)return path;}
    return [];
  }
  function visitRobot(id){
    if(chatId)return;leaveArrival();desiredRobot=id;
    if(!robots.has(id)&&latestData){const wasStale=stale;update(latestData);if(wasStale)setStale(true);}
    const item=robots.get(id);if(!item)return;
    route=approach(item);
    if(!route.length){callbacks.onToast('Não há caminho livre até essa bancada.');return;}
    if(cameraMode==='room')setCameraMode('follow');
    destination.position.set(route.at(-1).x,groundAt(route.at(-1).x,route.at(-1).z)+.025,route.at(-1).z);destination.visible=true;dirty=true;
  }
  function canInteract(id){const item=robots.get(id);return !contextLost&&!!item&&inside(item.worker.sector)&&dist(avatar.position,item.rig.root.position)<(item.worker.sector==='gateway'?3.4:2.05);}
  function interact(){if(chatId||study)return;if(candidate&&canInteract(candidate.worker.id))callbacks.onInteract(candidate.worker.id);else if(location==='rag')callbacks.onRagInteract?.();else if(location)callbacks.onEquipment?.(location);}
  function beginChat(id){
    if(!canInteract(id)||chatId||study)return false;
    stopWalking();chatId=id;savedCamera={mode:cameraMode,azimuth:targetAzimuth,elevation:targetElevation,radius:targetRadius};
    renderer.shadowMap.needsUpdate=true;
    const robot=robots.get(id).rig;
    savedCamera.aim=aim.clone();targetAzimuth=azimuth;targetElevation=elevation;targetRadius=radius;
    dialogue.setOpen(true);audio.cue('robotVoice',robot.root.position,`voice:${id}`);
    hero.greeting=animationTime+1.5;robot.greeting=animationTime+1.8;showBubble(hero,'✦');showBubble(robot,'…');emoteUntil=performance.now()+2500;
    callbacks.onCamera('chat');dirty=true;return true;
  }
  function endChat(){
    chatId=null;dialogue.setOpen(false);hero.bubble.visible=false;for(const item of robots.values())item.rig.bubble.visible=false;
    renderer.shadowMap.needsUpdate=true;previousCandidate=null;
    if(savedCamera){cameraMode=savedCamera.mode;targetAzimuth=savedCamera.azimuth;targetElevation=savedCamera.elevation;targetRadius=savedCamera.radius;savedCamera=null;}
    callbacks.onCamera(cameraMode);dirty=true;
  }
  function emote(kind){if(!chatId)return;const rig=robots.get(chatId)?.rig;if(!rig)return;audio.cue(kind==='error'?'error':kind==='question'?'chat':'robotVoice',rig.root.position,`voice:${chatId}`);rig.speakingUntil=kind==='question'?0:animationTime+2.4;showBubble(hero,kind==='question'?'?':'…');showBubble(rig,kind==='question'?'…':kind==='error'?'!':'✓');emoteUntil=performance.now()+3000;dirty=true;}
  function setCameraMode(mode){if(!started||chatId||study)return;audio.cue('click');arrivalView=false;cameraMode=mode;const exterior=outside();targetRadius=mode==='room'?(exterior?cornerRadius():Math.max(70,60/camera.aspect)*CAMPUS_SCALE):(exterior?30:27)*CAMPUS_SCALE;targetElevation=mode==='room'?(exterior?.26:.77):.64;targetAzimuth=mode==='room'&&exterior?openingAzimuth():.55;callbacks.onCamera(mode);dirty=true;}
  function setStale(value){stale=value;installations.setStale(value);dirty=true;if(value){for(const[id,z]of zones){z.trim.material=mat('#8ca89a');z.display.update([NAMES[id],'DADOS DESATUALIZADOS','Aguardando conexão']);}for(const item of robots.values())item.rig.indicator.material=glow('#829c93');}hallReveal.register();}
  const playable=()=>started&&!chatId&&!study&&!contextLost;
  const jump=()=>{if(playable()){hero.jump();dirty=true;}};
  const attack=()=>{if(playable()){route=[];hero.attack();dirty=true;}};
  const controls=createLabControls(container,{enabled:playable,onJump:jump,onAttack:attack,onInteract:interact,onInputType:type=>callbacks.onInputType?.(type),onMove(){leaveArrival();route=[];dirty=true;}});
  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),floor=new T.Plane(new T.Vector3(0,1,0),-FLOOR*CAMPUS_SCALE);
  let drag=null;
  function cast(event){const r=container.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
  function pointAt(event){cast(event);const hit=raycaster.intersectObjects(walkSurfaces,false)[0];return (hit?.point||raycaster.ray.intersectPlane(floor,new T.Vector3()))?.clone().divideScalar(CAMPUS_SCALE);}
  function selectAt(e){
    cast(e);
    if(study){const node=ragDome.pick(raycaster);if(node)callbacks.onRagNode(ragDome.getNode(node));return true;}
    const objects=[...hitObjects,...[...zones.values()].map(zone=>zone.history.root),...[...installations.roots.values()],...[...robots.values()].map(item=>item.rig.root)];
    const hits=raycaster.intersectObjects(objects,true).filter(h=>{let o=h.object;if(o.isSprite)return false;while(o){if(!o.visible)return false;o=o.parent;}return true;});
    if(hits.length){let object=hits[0].object;while(object&&!object.userData.robot&&!object.userData.station&&!object.userData.historySector&&!object.userData.equipmentSector)object=object.parent;
      if(object?.userData.equipmentSector){stopWalking();if(object.userData.equipmentSector==='rag'&&inside('rag'))callbacks.onRagInteract?.();else if(inside(object.userData.equipmentSector))callbacks.onEquipment?.(object.userData.equipmentSector);else navigate(object.position);return true;}
      if(object?.userData.historySector){stopWalking();callbacks.onEquipment?.(object.userData.historySector,true);return true;}
      if(object?.userData.robot){const id=object.userData.robot;if(canInteract(id))callbacks.onInteract(id);else visitRobot(id);return true;}
      if(object?.userData.station){visitRobot(`guide:${object.userData.station}`);return true;}
    }return false;
  }
  container.addEventListener('contextmenu',e=>e.preventDefault());
  container.addEventListener('pointerdown',e=>{
    if(!started||chatId||drag||![0,2].includes(e.button))return;
    container.focus({preventScroll:true});drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:e.clientX,py:e.clientY,moved:false,orbit:e.button===2||e.pointerType==='touch',touch:e.pointerType==='touch',button:e.button};container.setPointerCapture(e.pointerId);
  });
  container.addEventListener('pointermove',e=>{
    if(!started||chatId)return;
    if(drag&&drag.id===e.pointerId){
      if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>7)drag.moved=true;
      if(drag.orbit&&drag.moved){targetAzimuth-=(e.clientX-drag.px)*.006;targetElevation=T.MathUtils.clamp(targetElevation+(e.clientY-drag.py)*.004,.25,1.18);dirty=true;}
      drag.px=e.clientX;drag.py=e.clientY;
    }
  });
  container.addEventListener('pointerup',e=>{
    if(!drag||drag.id!==e.pointerId)return;const gesture=drag;drag=null;
    if(container.hasPointerCapture(e.pointerId))container.releasePointerCapture(e.pointerId);
    if(gesture.moved||chatId)return;
    if(study){selectAt(e);return;}
    if(gesture.touch||gesture.button===2){if(selectAt(e))return;const p=pointAt(e);if(p)navigate(p);return;}
    cast(e);const equipmentHit=raycaster.intersectObjects([...installations.roots.values()],true)[0];if(equipmentHit){let object=equipmentHit.object;while(object&&!object.userData.equipmentSector)object=object.parent;const id=object?.userData.equipmentSector;if(id){if(inside(id)){stopWalking();if(id==='rag')callbacks.onRagInteract?.();else callbacks.onEquipment?.(id);}else navigate(object.position);return;}}
    const boardHit=raycaster.intersectObjects([...zones.values()].filter(z=>z.history.root.visible).map(z=>z.history.root),true)[0];if(boardHit){let object=boardHit.object;while(object&&!object.userData.historySector&&!object.userData.equipmentSector)object=object.parent;if(object){stopWalking();callbacks.onEquipment?.(object.userData.historySector,true);return;}}
    attack();
  });
  for(const type of ['pointercancel','lostpointercapture'])container.addEventListener(type,e=>{if(drag?.id===e.pointerId)drag=null;});
  container.addEventListener('wheel',e=>{if(!started||chatId)return;e.preventDefault();targetRadius=T.MathUtils.clamp(targetRadius+Math.sign(e.deltaY)*1.2,8,75);dirty=true;},{passive:false});
  window.addEventListener('blur',()=>{drag=null;stopWalking();});
  const resizeObserver=new ResizeObserver(()=>{const r=container.getBoundingClientRect();renderer.setSize(r.width,r.height,false);dialogue.resize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();if(study)targetRadius=(camera.aspect>.85?12:21)*CAMPUS_SCALE;else if(arrivalView){targetRadius=cornerRadius();radius=targetRadius;azimuth=targetAzimuth=openingAzimuth();aim.copy(openingTarget()).multiplyScalar(CAMPUS_SCALE);}else if(cameraMode==='room'&&!chatId)targetRadius=outside()?cornerRadius():Math.max(70,60/camera.aspect)*CAMPUS_SCALE;dirty=true;});resizeObserver.observe(container);
  const direction=new T.Vector3(),travelDirection=new T.Vector3();
  let movementSpeed=0,previousLocation='',previousCandidate='',wasInterior=false,wasHallLit=false;
  function frame(ms){
    requestAnimationFrame(frame);if(ms-lastTime<1000/30)return;
    const lightingDt=Math.max(0,(ms-lastTime)/1000),elapsed=Math.min(lightingDt,.25),dt=elapsed;lastTime=ms;if(document.hidden||contextLost)return;
    // Lower fill cost on sustained slow devices, keeping the canvas/UI dimensions.
    if(!paused){qualityFrames++;qualityElapsed+=elapsed;if(qualityFrames>=45){if(qualityElapsed/qualityFrames>.08&&pixelRatio>1){pixelRatio=Math.max(1,pixelRatio-.2);renderer.setPixelRatio(pixelRatio);dirty=true;}qualityFrames=0;qualityElapsed=0;}}
    if(!paused)animationTime+=dt;
    controls.setEnabled(playable());
    const input=controls.read(azimuth);
    direction.set(input.x,0,input.z);
    let remaining=Infinity;
    if(!input.strength&&route.length){
      while(route.length&&dist(avatar.position,route[0])<.08)route.shift();
      if(route.length){direction.set(route[0].x-avatar.position.x,0,route[0].z-avatar.position.z);remaining=direction.length();}
      else {direction.set(0,0,0);movementSpeed=0;}
    }
    const wantsToMove=direction.lengthSq()>.001;
    const running=input.running;
    const actionSpeed=hero.attacking?0:1;
    const desiredSpeed=playable()&&wantsToMove?(running?RUN_SPEED:WALK_SPEED)*(input.strength||1)*actionSpeed*(route.length===1?Math.min(1,remaining/.45):1):0;
    movementSpeed=T.MathUtils.damp(movementSpeed,desiredSpeed,wantsToMove?8:12,dt);
    if(movementSpeed<.005)movementSpeed=0;
    if(wantsToMove)travelDirection.copy(direction).normalize();
    else if(movementSpeed)direction.copy(travelDirection);
    const step=Math.min(dt*movementSpeed,remaining);
    const before={x:avatar.position.x,z:avatar.position.z};
    if(playable()&&direction.lengthSq()>.001){direction.normalize();const next=moveWithCollision(avatar.position,direction.x*step,direction.z*step,obstacles,circles);avatar.position.x=next.x;avatar.position.z=next.z;if(dist(before,next)<.001&&route.length){route=findPath(avatar.position,route.at(-1),obstacles,circles);}}
    const moving=dist(before,avatar.position)>.001;
    if(moving)avatar.rotation.y=dampAngle(avatar.rotation.y,Math.atan2(avatar.position.x-before.x,avatar.position.z-before.z),dt,12);
    avatar.position.y=groundAt(avatar.position.x,avatar.position.z)+hero.jumpHeight;
    destination.visible=route.length>0&&!chatId;
    location=Object.keys(ZONES).find(id=>inside(id))||null;candidate=null;let nearest=location==='gateway'?3.4:2.05;
    for(const item of robots.values()){const distance=dist(avatar.position,item.rig.root.position);if(inside(item.worker.sector)&&distance<nearest){candidate=item;nearest=distance;}}
    if(desiredRobot&&canInteract(desiredRobot))candidate=robots.get(desiredRobot);
    if(location!==previousLocation){callbacks.onLocation(location);previousLocation=location;if(location){for(const item of robots.values())if(item.worker.sector===location){item.rig.greeting=animationTime+1.3;showBubble(item.rig,'✦');}emoteUntil=ms+1700;}}
    const candidateId=candidate?.worker.id||'';callbacks.onContext?.(candidate?.worker||null,location);if(candidateId!==previousCandidate){callbacks.onCandidate(candidate?.worker||null);previousCandidate=candidateId;}
    if(chatId){const other=robots.get(chatId)?.rig.root;if(other){target.copy(savedCamera.aim).divideScalar(CAMPUS_SCALE);target.y+=2.2;avatar.rotation.y=dampAngle(avatar.rotation.y,Math.atan2(other.position.x-avatar.position.x,other.position.z-avatar.position.z),dt);}}
    else if(study){target.copy(ragDome.root.position);target.y+=1.5;if(camera.aspect>.85){target.x-=Math.cos(azimuth)*1.8;target.z+=Math.sin(azimuth)*1.8;}else target.y=ragDome.root.position.y+1.5-(targetRadius/CAMPUS_SCALE)*Math.tan(T.MathUtils.degToRad(camera.fov/2))*.43/Math.cos(targetElevation);}
    else if(arrivalView||cameraMode==='room'&&outside()){
      target.copy(openingTarget());targetRadius=cornerRadius();
      targetAzimuth=openingAzimuth();targetElevation=.26;
    }
    else if(cameraMode==='follow'){target.copy(avatar.position);target.y+=1.1;}
    else {target.set(0,4,-5);targetRadius=Math.max(78,68/camera.aspect)*CAMPUS_SCALE;targetElevation=.77;}
    target.multiplyScalar(CAMPUS_SCALE);
    const changing=aim.distanceToSquared(target)>.0001||Math.abs(radius-targetRadius)>.002||Math.abs(azimuth-targetAzimuth)>.002||Math.abs(elevation-targetElevation)>.002;
    aim.lerp(target,1-Math.exp(-elapsed*5));radius=T.MathUtils.lerp(radius,targetRadius,1-Math.exp(-elapsed*5));azimuth=dampAngle(azimuth,targetAzimuth,elapsed,6);elevation=T.MathUtils.lerp(elevation,targetElevation,1-Math.exp(-elapsed*5));
    camera.position.set(aim.x+Math.sin(azimuth)*Math.cos(elevation)*radius,aim.y+Math.sin(elevation)*radius,aim.z+Math.cos(azimuth)*Math.cos(elevation)*radius);camera.lookAt(aim);
    if(arrivalView&&!paused){
      // Tiny hand-held drift exists only before Play; the exploration camera stays steady.
      camera.position.x+=Math.sin(animationTime*1.8)*.035+Math.sin(animationTime*2.7)*.012;
      camera.position.y+=Math.sin(animationTime*1.4+.7)*.025;
      camera.lookAt(aim);
    }
    if(callbacks.onPromptPosition){
      world.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      const project=p=>{p.project(camera);return {x:(p.x*.5+.5)*container.clientWidth,y:(-p.y*.5+.5)*container.clientHeight};};
      const foot=project(avatar.position.clone().multiplyScalar(CAMPUS_SCALE)),head=project(avatar.position.clone().add(new T.Vector3(0,2.8,0)).multiplyScalar(CAMPUS_SCALE));
      const anchor={x:foot.x,top:Math.min(head.y,foot.y),bottom:Math.max(head.y,foot.y),left:foot.x-18,right:foot.x+18};
      const targets=candidate?[candidate.rig.root,zones.get(location)?.display.root]:[installations.roots.get(location),zones.get(location)?.display.root];
      const rectangles=targets.filter(Boolean).map(root=>{
        const bounds=new T.Box3().setFromObject(root),points=[];
        for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])points.push(project(new T.Vector3(x,y,z)));
        return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
      });callbacks.onPromptPosition(anchor,rectangles);
    }
    if(emoteUntil&&ms>emoteUntil){hero.bubble.visible=false;for(const item of robots.values())item.rig.bubble.visible=false;emoteUntil=0;dirty=true;}
    if(!dirty&&paused&&!moving&&!wasMoving&&!changing&&!hero.transitioning&&campus.settled)return;dirty=false;wasMoving=moving;
    hero.update(dt,{speed:dist(before,avatar.position)/dt,running,travelAngle:Math.atan2(Math.sin(Math.atan2(travelDirection.x,travelDirection.z)-avatar.rotation.y),Math.cos(Math.atan2(travelDirection.x,travelDirection.z)-avatar.rotation.y)),reduced:paused});
    avatar.position.y=groundAt(avatar.position.x,avatar.position.z)+hero.jumpHeight;
    audio.setListener(avatar.position.x,avatar.position.z,azimuth);
    for(const event of hero.drainEvents())audio.cue(event);
    container.dataset.action=hero.actionState;container.dataset.gait=moving?'hover':'idle';
    for(const item of robots.values()){
      const rig=item.rig,attention=inside(item.worker.sector)&&(item.worker.kind!=='catalog'||chatId===item.worker.id||animationTime<rig.greeting)?1:0;
      const look=Math.atan2(avatar.position.x-rig.root.position.x,avatar.position.z-rig.root.position.z);
      const beforeTurn=rig.root.rotation.y;
      rig.root.rotation.y=dampAngle(beforeTurn,attention?look:item.worker.sector==='gateway'?0:Math.PI,dt,attention?4:2);
      // Ambient inspection/tapping remains subtle while real work increases its pace.
      poseRig(rig,animationTime,dt,{speed:0,attention,work:stale?.7:item.worker.status==='running'||item.worker.kind==='catalog'&&installations.memoryActive()?1:.8,talk:chatId===item.worker.id&&animationTime<(rig.speakingUntil||0),lookYaw:T.MathUtils.clamp(Math.atan2(Math.sin(look-rig.root.rotation.y),Math.cos(look-rig.root.rotation.y)),-.3,.3),reduced:paused});
    }
    if(!paused&&started){
      for(const [id,item] of robots){
        if(chatId===id||dist(avatar.position,item.rig.root.position)>6)continue;
        const active=item.worker.status==='running'||item.worker.kind==='catalog';
        if(active&&Math.sin(animationTime*2.2+item.rig.phase)>.6)audio.cue('typing',item.rig.root.position,`typing:${id}`);
        if(item.rig.blinked)audio.cue('robotBlink',item.rig.root.position,`blink:${id}`);
        if(active&&Math.cos(animationTime*.4+item.rig.phase)>.85)audio.cue('computer',item.rig.root.position,`computer:${id}`);
      }
      for(const [id,zone] of zones){
        if(dist(avatar.position,zone.group.position)>10)continue;
        const p=zone.group.position;
        if(Math.sin(animationTime*.8+phaseFor(id))>.7)audio.cue('equipment',p,`equipment:${id}`);
      }
    }
    const {interior,enteredHall,hallLight,doorChanged}=campus.tick(lightingDt,avatar.position,camera);hallReveal.set(hallLight);audio.tick();
    if(doorChanged)audio.cue('door');if(hallLight>.5&&!wasHallLit)audio.cue('arrival');wasHallLit=hallLight>.5;
    container.dataset.hall=String(enteredHall);
    if((interior>.5)!==wasInterior&&!chatId&&!study){wasInterior=interior>.5;if(cameraMode==='follow'){targetRadius=(wasInterior?27:30)*CAMPUS_SCALE;targetElevation=wasInterior?.64:.48;}}
    container.dataset.environment=interior>.5?'interior':'exterior';
    if(ms-lastPosition>150){callbacks.onPosition(avatar.position.x,avatar.position.z);lastPosition=ms;}
    // Shadow maps update on every rendered frame, including idle and turns.
    energy.tick(animationTime);biome.tick(animationTime);updateNature(animationTime,paused);
    const levels=ambienceLevels(interior,hallLight);
    audio.ambient([{id:'outdoor-nature',kind:'nature',bed:true,position:null,volume:levels.nature},{id:'laboratory-hum',kind:'hum',bed:true,position:null,volume:levels.equipment},...Array.from(zones,([id,zone])=>({id:`machine:${id}`,kind:['vm','mcp','rag'].includes(id)?'machineFan':'machineMotor',position:zone.group.position,volume:id==='gateway'?0:.07*hallLight,range:14})),{id:'stream',kind:'stream',position:biome.streamAt(avatar.position),volume:levels.stream,range:7}],started);
    if(started&&!paused&&hallLight>.5){const pulse=energy.nearbyPulse(avatar.position,animationTime);if(pulse)audio.cue('energy',pulse,'energy-route');}installations.tick(animationTime,dt,paused);ragDome.tick(animationTime,camera,dt,paused);
    for(const packet of parcels.tick(animationTime,enteredHall))hallReveal.register(packet);
    for(const {id,rig,speed,parcel} of parcels.couriers){
      poseRig(rig,animationTime,dt,{speed,work:0,carrying:parcel.visible,reduced:paused});
      if(started&&!paused&&rig.root.visible&&speed>.1){if(rig.steps)audio.cue('robotStep',rig.root.position,`step:${id}`);audio.cue('robotServo',rig.root.position,`servo:${id}`);}
    }
    renderer.render(world,camera);if(firstFrame){firstFrame=false;callbacks.onReady?.();}dialogue.render(camera,avatar,robots.get(chatId)?.rig.root);
  }
  function setRagOpen(value){
    if(value){if(chatId||!inside('rag'))return false;stopWalking();study=true;savedStudyCamera={mode:cameraMode,azimuth:targetAzimuth,elevation:targetElevation,radius:targetRadius};targetRadius=(camera.aspect>.85?12:21)*CAMPUS_SCALE;targetElevation=.54;targetAzimuth=.28;callbacks.onCamera('rag');}
    else if(study){study=false;previousCandidate=null;cameraMode=savedStudyCamera.mode;targetRadius=savedStudyCamera.radius;targetAzimuth=savedStudyCamera.azimuth;targetElevation=savedStudyCamera.elevation;savedStudyCamera=null;callbacks.onCamera(cameraMode);}
    dirty=true;return true;
  }
  callbacks.onLoadProgress?.(93,'RENDERIZANDO');
  world.scale.setScalar(CAMPUS_SCALE);hall.visible=true;
  // Compile the dark hall before revealing the page; crossing the door only animates light.
  await renderer.compileAsync(world,camera);
  callbacks.onCamera('follow');requestAnimationFrame(frame);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;stopWalking();callbacks.onLostContext(true);});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{contextLost=false;dirty=true;renderer.shadowMap.needsUpdate=true;callbacks.onLostContext(false);});
  return {start,setChatMessages(entries,name){dialogue.setMessages(entries,name);dirty=true;},setHistoryBoards(boards){for(const[id,zone]of zones)zone.history.update(boards[id]);installations.updateSchedule(boards.cron);dirty=true;},setDashboardIndicators(channels){for(const[id,zone]of zones)zone.display.indicators(indicatorCards(id,channels));dirty=true;},async toggleAudio(){const on=await audio.toggle();dirty=true;return on;},setRagOpen,setRagGraph(payload,options){dirty=true;return ragDome.setGraph(payload,options);},selectRagNode(id){audio.cue('node');ragDome.select(id);dirty=true;},setRagBusy(value){ragDome.setBusy(value);dirty=true;},updateHeatmap(payload){installations.updateHeatmap(payload);dirty=true;},update,visitRobot,canInteract,interact,beginChat,endChat,emote,setCameraMode,setStale,stopWalking,setPaused(value){paused=value;dirty=true;}};
}
