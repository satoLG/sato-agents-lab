import * as T from '../vendor/three.module.min.js';
import {batchRobot} from './lab-batch.js';

// Rigid meshes attached to a real Bone hierarchy. No downloaded animation clips
// or per-frame geometry allocations: poses blend at the joints, in radians.
export function createRigFactory(art) {
  const {box, sphere, cylinder, ring, rod, mesh, mat, glow, geo} = art;
  const opticRim=new T.MeshBasicMaterial({color:'#65d5ff',toneMapped:false});
  const irisFinishes=new Map();
  function bone(parent, name, x, y, z) { const b = new T.Bone(); b.name = name; b.position.set(x, y, z); parent.add(b); return b; }
  function base(type) {
    const root = new T.Group();
    const hips = bone(root, 'hips', 0, type === 'avatar' ? .95 : .54, 0);
    const spine = bone(hips, 'spine', 0, type === 'avatar' ? .06 : .66, 0);
    const head = bone(spine, 'head', 0, type === 'avatar' ? .84 : 0, 0);
    return {type, root, hips, spine, head, arms: [], legs: [], eyes: [], move: 0, attention: 0, work: .6, phase: 0, greeting: 0, gaitPhase: 0, steps: 0, blink: 0, lids: []};
  }
  function robot({core=false,floating=false}={}) {
    const rig = base('robot');rig.core=core;rig.floating=floating;if(core){rig.spine.position.y=.9;rig.root.name='core-custodian';}
    const signal=core?'#ffad4a':'#65d5ff';
    const shell=mat('#e3e8df',.42,.3),mechanism=mat('#344751',.82,.27),fingerMetal=mat('#b8c7cd',.85,.27);
    if(floating){
      // Cut the optic aperture out of a sphere; the lens sits inside the hull.
      const hull=mesh(rig.spine,geo('companion-spherical-hull',()=>{
        const profile=[];for(let i=0;i<=64;i++){const a=.60+(Math.PI-.60)*i/64;profile.push(new T.Vector2(.54*Math.sin(a),.54*Math.cos(a)));}
        return new T.LatheGeometry(profile.reverse(),64).rotateX(Math.PI/2);
      }),shell);hull.name='spherical-hull';hull.userData.dynamic=true;
      const seamFinish=mat('#36464c',.7,.4);
      for(const [i,angle]of [Math.PI/2,7*Math.PI/6,11*Math.PI/6].entries()){
        const points=[];for(let j=0;j<=64;j++){const a=.60+(Math.PI-.60)*j/64;points.push(new T.Vector3(.54*Math.sin(a)*Math.cos(angle),.54*Math.sin(a)*Math.sin(angle),.54*Math.cos(a)));}
        const seam=mesh(rig.spine,geo(`companion-seam-${i}`,()=>new T.TubeGeometry(new T.CatmullRomCurve3(points),64,.006,6,false)),seamFinish);seam.name=`shell-seam-${i}`;seam.userData.dynamic=true;
      }
      rig.head.position.z=-.215;
    }else{
      sphere(rig.spine, .54, shell, 0, 0, 0, [1.08, core?1.55:.96, .98]);
      ring(rig.spine, .535, .043, '#61736c', 0, 0, 0, true);
      ring(rig.spine, .53, .028, '#81928a', 0, 0, 0);
    }
    // Independent gimbal inside the shell keeps eye tracking separate from the torso.
    if(floating){
      const backing=mesh(rig.spine,geo('companion-optic-backing',()=>new T.CircleGeometry(.306,48)),mat('#0c151d',.65,.3),0,.015,.393);backing.name='optic-recess';backing.userData.dynamic=true;
    }else sphere(rig.head, .31, '#253d3c', 0, .015, .445, [1.2, 1, .5]);
    ring(rig.head, .18, .015, core?new T.MeshBasicMaterial({color:signal,toneMapped:false}):opticRim, 0, .015, .6);
    const pupilMaterial = new T.MeshBasicMaterial({color:core?'#251909':'#061925',toneMapped:false});
    rig.pupil = mesh(rig.head,geo('optic-disc',()=>new T.CircleGeometry(.043,24)),pupilMaterial,0,.015,.611,false);
    rig.pupil.name='optic-dark-pupil';rig.pupil.userData.dynamic=true;
    if(!irisFinishes.has(core))irisFinishes.set(core,[new T.MeshBasicMaterial({color:core?'#854411':'#064c89',toneMapped:false}),new T.MeshBasicMaterial({color:core?'#ffb345':'#169eff',toneMapped:false})]);
    const [irisMaterial,rayMaterial]=irisFinishes.get(core);
    mesh(rig.pupil,geo('optic-iris',()=>new T.RingGeometry(.047,.151,48)),irisMaterial,0,0,.001,false);
    // The reference optic is a ring of radial light marks around a dark aperture.
    mesh(rig.pupil,geo('optic-radial-marks',()=>{
      const positions=[];
      for(let i=0;i<32;i++){
        const a=i*Math.PI/16,b=a+.047;
        for(const [radius,angle]of [[.057,a],[.145,a],[.145,b],[.057,a],[.145,b],[.057,b]])positions.push(Math.cos(angle)*radius,Math.sin(angle)*radius,0);
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();return g;
    }),rayMaterial,0,0,.002,false).name='optic-radial-marks';
    const halo=geo(core?'core-optic-halo-texture':'optic-halo-texture',()=>{
      const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,3,64,64,64);
      g.addColorStop(0,core?'rgba(255,158,38,0)':'rgba(59,182,255,0)');g.addColorStop(.14,core?'rgba(255,158,38,0)':'rgba(59,182,255,0)');g.addColorStop(.32,core?'rgba(255,158,38,.34)':'rgba(59,182,255,.34)');g.addColorStop(.55,core?'rgba(255,110,0,.15)':'rgba(0,133,255,.15)');g.addColorStop(1,core?'rgba(255,110,0,0)':'rgba(0,120,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new T.CanvasTexture(c);
    });
    const glowMaterial=new T.MeshBasicMaterial({map:halo,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
    mesh(rig.head,geo('optic-halo-plane',()=>new T.PlaneGeometry(.65,.65)),glowMaterial,0,.015,.616,false);
    rig.opticMaterial=glowMaterial;
    rig.eyes.push(rig.pupil);
    // A bevelled white socket sits ahead of the shutter and hides its outer
    // edges. Leaves rotate behind that socket, like a camera diaphragm.
    const socket=mesh(floating?rig.spine:rig.head,geo(floating?'companion-mechanical-socket':'optic-white-socket',()=>{
      const radii=floating?[.183,.197,.223,.293,.306]:[.183,.197,.223,.313,.34],depths=floating?[.038,.043,.029,.017,-.002]:[.038,.043,.039,.036,-.13],positions=[],indices=[],segments=40;
      for(let band=0;band<radii.length;band++)for(let i=0;i<=segments;i++){const a=i*Math.PI*2/segments;positions.push(Math.cos(a)*radii[band],Math.sin(a)*radii[band],depths[band]);}
      for(let band=0;band<radii.length-1;band++)for(let i=0;i<segments;i++){const a=band*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;indices.push(a,c,b,b,c,d);}
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
    }),floating?mechanism:shell,0,.015,floating?.42:.61);socket.name=floating?'optic-mechanical-socket':'optic-white-socket';socket.userData.dynamic=floating;
    if(floating){
      ring(rig.spine,.196,.009,mat('#b8c7cd',.85,.23),0,.015,.465);
      for(let i=0;i<8;i++){const a=i*Math.PI/4; sphere(rig.spine,.012,mat('#9aa8ae',.9,.25),Math.cos(a)*.262,.015+Math.sin(a)*.262,.445);}
    }
    const shutterGeometry=geo('optic-iris-leaf',()=>{
      const shape=new T.Shape();shape.moveTo(-.19,.015);shape.lineTo(-.06,-.135);shape.lineTo(.08,-.09);shape.lineTo(.09,-.015);shape.closePath();return new T.ShapeGeometry(shape);
    });
    for(let i=0;i<6;i++){
      const angle=i*Math.PI/3,lid=mesh(rig.head,shutterGeometry,mechanism,Math.cos(angle)*.16,.015+Math.sin(angle)*.16,.63+i*.0005);
      lid.name=`optic-shutter-${i}`;lid.userData.dynamic=true;rig.lids.push({mesh:lid,side:i%2?1:-1,angle});
    }
    setRigBlink(rig,0);
    // Exposed service hardware: cooling ribs, power rails, shell seam and bolts.
    for(const side of [-1,1]){
      if(!floating){box(rig.spine,.14,.38,.2,mat('#24333c',.72,.3),side*.47,.04,-.27);
      for(let i=0;i<5;i++)box(rig.spine,.15,.022,.23,mat('#9caeb6',.8,.25),side*.47,-.1+i*.055,-.27);}
      if(!floating)rod(rig.spine,[side*.38,-.23,.35],[side*.4,.22,.34],.012,glow(core?signal:'#3eafd0'));
      for(const y of [-.25,.26])sphere(rig.spine,.025,mat('#31404a',.9,.2),side*.32,y,.4);
    }
    box(rig.spine,.23,.12,.035,mat('#26333e',.7,.25),0,-.34,.4);
    for(let i=0;i<3;i++)box(rig.spine,.035,.05,.04,glow(i===2?'#f2bc61':'#5ee6ee'),-.07+i*.07,-.34,.422);

    for (const side of [-1, 1]) {
      if(floating){
        const upper=bone(rig.spine,side<0?'flipper_L':'flipper_R',side*.58,-.025,0);
        const shape=geo('smooth-flipper',()=>new T.LatheGeometry([
          new T.Vector2(0,-.77),new T.Vector2(.04,-.73),new T.Vector2(.075,-.63),
          new T.Vector2(.105,-.48),new T.Vector2(.125,-.30),new T.Vector2(.12,-.15),
          new T.Vector2(.09,-.035),new T.Vector2(.045,.02),new T.Vector2(0,.03)
        ],24));
        const flipper=mesh(upper,shape,shell);flipper.scale.z=.56;flipper.name='smooth-arm';
        const lower=bone(upper,'flipper-tip',0,-.77,0);
        rig.arms.push({upper,lower,side});continue;
      }
      box(rig.spine, .13, .47, .3, '#c7d3c7', side * .53, .045, -.045).rotation.z = side * -.2;
      const arm = bone(rig.spine, side < 0 ? 'shoulder_L' : 'shoulder_R', side * .71, -.04, 0);
      sphere(arm, .125, mat('#24343f',.8,.23));
      const hinge=cylinder(arm,.095,.18,mat('#b4c0c5',.9,.22));hinge.rotation.z=Math.PI/2;
      ring(arm,.086,.012,glow(core?signal:'#63d4df'),side*.102,0,0).rotation.y=Math.PI/2;
      rod(arm, [0, 0, 0], [side * .05, -.33, 0], .054, mat('#586e68', .65));
      rod(arm, [side * .07, -.01, -.045], [side * .12, -.31, -.04], .019, mat('#c4d1c2', .65));
      const elbow = bone(arm, 'elbow', side * .05, -.33, 0);
      sphere(elbow, .075, '#405f57');
      cylinder(elbow, .065, .3, mat('#d5e1d0',.55,.28), 0, -.15, 0);
      rod(elbow,[-.08,-.045,-.04],[-.08,-.27,-.04],.019,mat('#acbbc3',.95,.2));
      box(elbow,.032,.18,.025,glow(core?signal:'#5ec5df'),0,-.16,.067);
      const wrist=bone(elbow,'wrist',0,-.31,0);sphere(wrist,.044,mechanism);
      ring(wrist,.044,.009,fingerMetal,0,0,0,true);
      sphere(wrist,.062,shell,0,-.043,.005,[.78,.85,.53]);
      const fingers=[];
      for(let i=0;i<3;i++){
        const finger=bone(wrist,`finger_${i}`,(i-1)*.031,-.075,.014);finger.rotation.x=-.2;
        rod(finger,[0,0,0],[0,-.034,0],.011,fingerMetal);sphere(finger,.013,fingerMetal);
        const tip=bone(finger,'fingertip',0,-.034,0);tip.rotation.x=-.55;
        rod(tip,[0,0,0],[0,-.027,0],.01,fingerMetal);sphere(tip,.012,fingerMetal,0,-.026,0);
        fingers.push({root:finger,tip});
      }
      const thumb=bone(wrist,'thumb',side*.052,-.028,.019);thumb.rotation.z=side*.65;thumb.rotation.x=-.35;
      rod(thumb,[0,0,0],[0,-.044,0],.013,fingerMetal);sphere(thumb,.014,fingerMetal,0,-.041,0);
      rig.arms.push({upper: arm, lower: elbow, wrist, fingers, thumb, side});
      const leg = bone(rig.hips, side < 0 ? 'hip_L' : 'hip_R', side * .25, 0, 0);
      sphere(leg, .11, '#435d54');
      rod(leg, [0, 0, 0], [side * .04, -.22, 0], .074, mat('#e0e7da'));
      const knee = bone(leg, 'knee', side * .04, -.22, 0);
      sphere(knee, .068, '#4b655c');
      rod(knee, [0, 0, 0], [0, -.21, 0], .048, mat('#798b7e', .7));
      const ankle = bone(knee, 'ankle', 0, -.21, 0);
      // Sculpted shell over a dark sole, with visible ankle and toe hinges.
      sphere(ankle,.134,mechanism,0,-.021,.069,[1.01,.35,1.49]);
      sphere(ankle,.126,shell,0,.017,.043,[1.01,.45,1.31]);
      const ankleHinge=cylinder(ankle,.055,.2,fingerMetal,0,.067,0);ankleHinge.rotation.z=Math.PI/2;
      sphere(ankle,.056,mechanism,0,.072,-.023);
      rod(ankle,[-.067,.055,-.069],[-.067,-.014,-.108],.016,fingerMetal);
      rod(ankle,[.067,.055,-.069],[.067,-.014,-.108],.016,fingerMetal);
      const toe=bone(ankle,'toe',0,-.002,.16),toeHinge=cylinder(toe,.022,.205,mechanism);toeHinge.rotation.z=Math.PI/2;
      sphere(toe,.094,shell,0,-.002,.036,[1.25,.37,.96]);
      sphere(toe,.095,mechanism,0,-.029,.032,[1.25,.16,.98]);
      box(knee,.09,.12,.045,mat('#becbd1',.82,.25),0,-.1,.049);
      rod(leg,[side*.1,-.035,-.04],[side*.1,-.2,-.04],.018,mat('#b2c1c7',.9,.22));
      rig.legs.push({upper: leg, lower: knee, ankle, toe, side});
    }
    if(floating){
      const base=sphere(rig.spine,.20,mechanism,0,-.535,0,[1,.17,1]);base.name='magnetic-core';base.userData.dynamic=true;
      const emitter=ring(rig.spine,.173,.009,opticRim,0,-.572,0,true);emitter.name='magnetic-emitter';emitter.userData.dynamic=true;
      rig.field=new T.Group();rig.field.name='magnetic-field';rig.spine.add(rig.field);rig.flux=[];
      for(let i=0;i<3;i++){const pulse=ring(rig.field,.174,.006,new T.MeshBasicMaterial({color:signal,transparent:true,opacity:0,depthWrite:false,toneMapped:false}),0,-.60,0,true);pulse.name=`magnetic-pulse-${i}`;rig.flux.push(pulse);}
      rig.antenna=bone(rig.spine,'antenna-swivel',.35,.32,-.08);
      const blade=mesh(rig.antenna,geo('smooth-flipper'),shell);blade.scale.set(.42,.40,.24);blade.rotation.z=Math.PI;blade.name='antenna-blade';
      const tipFinish=new T.MeshStandardMaterial({color:signal,emissive:signal,emissiveIntensity:.25,roughness:.3});
      rig.indicator=sphere(rig.antenna,.023,tipFinish,0,.298,0);rig.indicator.name='antenna-tip';rig.indicator.userData.dynamic=true;
    }else{
      rod(rig.spine, [.15, .43, -.12], [.22, .75, -.12], .022, mat('#5a7264'));
      rig.indicator = sphere(rig.spine, .06, glow('#779d8a'), .22, .75, -.12);
    }
    rig.root.rotation.y = Math.PI;
    batchRobot(rig);
    return rig;
  }
  return {robot};
}

const damp = (a, b, dt, rate = 6) => a + (b - a) * (1 - Math.exp(-rate * dt));
export function dampAngle(a, b, dt, rate = 7) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * (1 - Math.exp(-rate * dt)); }
// Also used by the home entrance: 0 = clear optic, 1 = fully shut.
export function setRigBlink(rig,amount){
 const blink=Math.max(0,Math.min(1,amount)),radius=.16-blink*.054;
 for(const {mesh,angle}of rig.lids){mesh.rotation.z=angle+(1-blink)*1.58;mesh.position.x=Math.cos(angle)*radius;mesh.position.y=.015+Math.sin(angle)*radius;}
}
// Distance-based cadence: a half-cycle corresponds to one planted footfall.
export function poseRig(rig,t,dt,{speed=0,travelAngle=0,attention=0,work=0,talk=false,lookYaw=0,reduced=false,carrying=false}={}){
 const moving=Math.min(1,Math.max(0,speed)/2.2);
 rig.move=damp(rig.move,moving,dt,10);rig.attention=damp(rig.attention,attention,dt,5);
 rig.work=damp(rig.work,work*(1-attention)*(1-moving),dt,5);
 const before=rig.gaitPhase;
 if(!reduced&&!rig.floating)rig.gaitPhase+=Math.max(0,speed)*dt*Math.PI/(.44*rig.root.scale.x);
 rig.steps=Math.floor(rig.gaitPhase/Math.PI)-Math.floor(before/Math.PI);
 const phase=t+rig.phase,stride=Math.sin(rig.gaitPhase),move=reduced?0:rig.move,idle=1-move;
 const inspect=Math.floor(phase/7)%3,breath=Math.sin(phase*1.4);
 rig.hips.position.y=.54+Math.abs(Math.sin(rig.gaitPhase))*.025*move;
 rig.hips.rotation.z=Math.sin(rig.gaitPhase)*.028*move+Math.sin(phase*.73)*.012*idle;
 rig.spine.rotation.x=-.045*move+breath*.01*idle+rig.work*.045;
 rig.spine.rotation.y=stride*.045*move+Math.sin(phase*.55)*.025*idle;
 rig.spine.rotation.z=-rig.hips.rotation.z*.65;
 if(rig.floating){
  // A thruster-driven body banks into the actual local travel vector.
  rig.hips.position.y=.54+(reduced?0:Math.sin(phase*1.65)*.035);
  rig.hips.rotation.z=0;
  rig.spine.rotation.x=damp(rig.spine.userData.pitch||0,Math.cos(travelAngle)*move*.23,dt,8);
  rig.spine.rotation.z=damp(rig.spine.userData.bank||0,-Math.sin(travelAngle)*move*.23,dt,8);
  rig.spine.userData.pitch=rig.spine.rotation.x;rig.spine.userData.bank=rig.spine.rotation.z;
  rig.spine.rotation.y=0;rig.steps=0;
 }
 const glance=Math.sin(phase*.45)*.18+Math.sin(phase*.17)*.1;
 if(rig.floating)rig.head.rotation.set(0,0,0);
 else{
  rig.head.rotation.y=damp(rig.head.rotation.y,lookYaw*rig.attention+glance*idle*(1-rig.attention),dt);
  rig.head.rotation.x=damp(rig.head.rotation.x,talk?Math.sin(phase*5.2)*.055:rig.work*.06+Math.sin(phase*.8)*.025,dt);
 }
 rig.pupil.position.x=damp(rig.pupil.position.x,T.MathUtils.clamp((rig.attention?lookYaw:glance)*.045,-.012,.012),dt);
 rig.opticMaterial.opacity=talk?.7+Math.sin(phase*12)*.18:.62;
 if(rig.floating){
  rig.antenna.rotation.y=reduced?0:t*.55;rig.antenna.rotation.z=-.18;
  const blinkAt=t%5.8,flash=!reduced&&(blinkAt<.16||(blinkAt>.34&&blinkAt<.50));rig.indicator.material.emissiveIntensity=flash?3:.18;
  for(const [i,pulse]of rig.flux.entries()){
   const p=reduced?(i+.5)/3:(t/1.7+i/3)%1;pulse.position.y=-.60-p*.50;pulse.scale.setScalar(1-.84*p);pulse.material.opacity=.65*Math.sin(Math.min(1,p/.12)*Math.PI/2)*Math.pow(1-p,1.4);
  }
 }
 for(let i=0;i<rig.arms.length;i++){
  const {upper,lower,wrist,fingers,thumb,side}=rig.arms[i],wave=!reduced&&t<rig.greeting&&i===1?Math.sin(Math.min(1,rig.greeting-t)*Math.PI/2):0;
  if(rig.floating){
   // Arms stay neutral in transit; explicit greetings/talking can still gesture at rest.
   const gesture=move>.01?0:1;
   upper.rotation.x=damp(upper.rotation.x,talk?-gesture*.2:0,dt,10);
   upper.rotation.z=damp(upper.rotation.z,side*.2+(i===1?wave*.95*gesture:0),dt,8);
   lower.rotation.set(0,0,0);continue;
  }
  const tap=Math.sin(phase*(i?5.6:4.4)+i*1.8);
  // Shoulders stay outside the shell. Elbows flex forward, away from the torso.
  const idleCheck=inspect===1&&i===0&&!talk?(1-rig.work)*idle*.42*(.5+.5*Math.sin(phase*.7)):0;
  const workPose=rig.work*(i===inspect%2?1.55:1.35)+idleCheck,talkPose=talk?(i? .35+.12*Math.sin(phase*3):.2):0;
  upper.rotation.x=damp(upper.rotation.x,-stride*side*.42*move*(carrying?0:1)-workPose-talkPose-(carrying?.75:0),dt,10);
  upper.rotation.z=damp(upper.rotation.z,side*(.2+.025*breath*idle)+(i===1?wave*.95:0),dt,8);
  if(rig.floating)continue;
  lower.rotation.x=damp(lower.rotation.x,-.16-Math.max(0,-stride*side)*.24*move*(carrying?0:1)-rig.work*(.45+tap*.07)-(carrying?.4:0)-wave*.4,dt,10);
  lower.rotation.z=wave*Math.sin(phase*8)*.12;
  wrist.rotation.x=damp(wrist.rotation.x,-rig.work*.22-(carrying?.25:0),dt,8);
  wrist.rotation.z=side*(talk?.09*Math.sin(phase*3):.025*breath*idle);
  for(let j=0;j<fingers.length;j++){
   const finger=fingers[j],curl=rig.work*.24+(carrying?.4:0)+(talk?.08*Math.sin(phase*3+j*.5):0);
   finger.root.rotation.x=-.2-curl;finger.tip.rotation.x=-.55-curl*.5;
  }
  thumb.rotation.x=-.35-rig.work*.17-(carrying?.25:0);
 }
 for(const {upper,lower,ankle,toe,side}of rig.legs){
  const gait=stride*side;
  upper.rotation.x=gait*.48*move;
  lower.rotation.x=Math.max(0,-gait)*.64*move;
  ankle.rotation.x=-lower.rotation.x*.5;
  toe.rotation.x=Math.max(0,gait)*.18*move;
 }
 const blinkPhase=(phase+50)% (4.1+(rig.phase%1)*2),blink=blinkPhase<.18?Math.sin(blinkPhase/.18*Math.PI):0;
 rig.blinked=blink>.6&&rig.blink<=.6;rig.blink=blink;
 setRigBlink(rig,blink);
 rig.root.userData.animation=move>.05?(rig.floating?'hover':'walk'):talk?'talk':rig.work>.4?'operate':inspect===0?'scan':inspect===1?'inspect':'idle';
}
