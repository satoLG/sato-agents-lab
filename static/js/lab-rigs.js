import * as T from '../vendor/three.module.min.js';
import {batchRobot} from './lab-batch.js';

// Rigid meshes attached to a real Bone hierarchy. No downloaded animation clips
// or per-frame geometry allocations: poses blend at the joints, in radians.
export function createRigFactory(art) {
  const {box, sphere, cylinder, ring, rod, mesh, mat, glow, geo} = art;
  const opticRim=new T.MeshBasicMaterial({color:'#65d5ff',toneMapped:false});
  function bone(parent, name, x, y, z) { const b = new T.Bone(); b.name = name; b.position.set(x, y, z); parent.add(b); return b; }
  function base(type) {
    const root = new T.Group();
    const hips = bone(root, 'hips', 0, type === 'avatar' ? .95 : .54, 0);
    const spine = bone(hips, 'spine', 0, type === 'avatar' ? .06 : .66, 0);
    const head = bone(spine, 'head', 0, type === 'avatar' ? .84 : 0, 0);
    return {type, root, hips, spine, head, arms: [], legs: [], eyes: [], move: 0, attention: 0, work: .6, phase: 0, greeting: 0, gaitPhase: 0, steps: 0, blink: 0, lids: []};
  }
  function robot() {
    const rig = base('robot');
    sphere(rig.spine, .54, mat('#e3e8df',.42,.3), 0, 0, 0, [1.08, .96, .98]);
    ring(rig.spine, .535, .043, '#61736c', 0, 0, 0, true);
    ring(rig.spine, .53, .028, '#81928a', 0, 0, 0);
    // Independent gimbal inside the shell keeps eye tracking separate from the torso.
    sphere(rig.head, .31, '#253d3c', 0, .015, .445, [1.2, 1, .5]);
    ring(rig.head, .18, .015, opticRim, 0, .015, .6);
    const pupilMaterial = new T.MeshBasicMaterial({color:'#d5f7ff',toneMapped:false});
    rig.pupil = mesh(rig.head,geo('optic-disc',()=>new T.CircleGeometry(.082,32)),pupilMaterial,0,.015,.611,false);
    const halo=geo('optic-halo-texture',()=>{
      const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,3,64,64,64);
      g.addColorStop(0,'rgba(180,244,255,1)');g.addColorStop(.22,'rgba(59,182,255,.85)');g.addColorStop(.55,'rgba(0,133,255,.23)');g.addColorStop(1,'rgba(0,120,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new T.CanvasTexture(c);
    });
    const glowMaterial=new T.MeshBasicMaterial({map:halo,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
    mesh(rig.head,geo('optic-halo-plane',()=>new T.PlaneGeometry(.65,.65)),glowMaterial,0,.015,.616,false);
    rig.opticMaterial=glowMaterial;
    rig.eyes.push(rig.pupil);
    for(const side of [-1,1]){
      const lid=mesh(rig.head,geo('optic-shutter',()=>new T.CircleGeometry(.195,24,0,Math.PI)),mat('#33434c',.65,.26),0,side*.2,.623);
      if(side<0)lid.rotation.z=Math.PI;lid.userData.dynamic=true;rig.lids.push({mesh:lid,side});
    }
    // Exposed service hardware: cooling ribs, power rails, shell seam and bolts.
    for(const side of [-1,1]){
      box(rig.spine,.14,.38,.2,mat('#24333c',.72,.3),side*.47,.04,-.27);
      for(let i=0;i<5;i++)box(rig.spine,.15,.022,.23,mat('#9caeb6',.8,.25),side*.47,-.1+i*.055,-.27);
      rod(rig.spine,[side*.38,-.23,.35],[side*.4,.22,.34],.012,glow('#3eafd0'));
      for(const y of [-.25,.26])sphere(rig.spine,.025,mat('#31404a',.9,.2),side*.32,y,.4);
    }
    box(rig.spine,.23,.12,.035,mat('#26333e',.7,.25),0,-.34,.4);
    for(let i=0;i<3;i++)box(rig.spine,.035,.05,.04,glow(i===2?'#f2bc61':'#5ee6ee'),-.07+i*.07,-.34,.422);

    for (const side of [-1, 1]) {
      box(rig.spine, .13, .47, .3, '#c7d3c7', side * .53, .045, -.045).rotation.z = side * -.2;
      const arm = bone(rig.spine, side < 0 ? 'shoulder_L' : 'shoulder_R', side * .71, -.04, 0);
      sphere(arm, .125, mat('#24343f',.8,.23));
      const hinge=cylinder(arm,.095,.18,mat('#b4c0c5',.9,.22));hinge.rotation.z=Math.PI/2;
      ring(arm,.086,.012,glow('#63d4df'),side*.102,0,0).rotation.y=Math.PI/2;
      rod(arm, [0, 0, 0], [side * .05, -.33, 0], .054, mat('#586e68', .65));
      rod(arm, [side * .07, -.01, -.045], [side * .12, -.31, -.04], .019, mat('#c4d1c2', .65));
      const elbow = bone(arm, 'elbow', side * .05, -.33, 0);
      sphere(elbow, .075, '#405f57');
      cylinder(elbow, .065, .3, mat('#d5e1d0',.55,.28), 0, -.15, 0);
      rod(elbow,[-.08,-.045,-.04],[-.08,-.27,-.04],.019,mat('#acbbc3',.95,.2));
      box(elbow,.032,.18,.025,glow('#5ec5df'),0,-.16,.067);
      for (const finger of [-1, 1]) rod(elbow, [0, -.3, 0], [finger * .065, -.39, .075], .022, mat('#4c665b'));
      rig.arms.push({upper: arm, lower: elbow, side});
      const leg = bone(rig.hips, side < 0 ? 'hip_L' : 'hip_R', side * .25, 0, 0);
      sphere(leg, .11, '#435d54');
      rod(leg, [0, 0, 0], [side * .04, -.22, 0], .074, mat('#e0e7da'));
      const knee = bone(leg, 'knee', side * .04, -.22, 0);
      sphere(knee, .068, '#4b655c');
      rod(knee, [0, 0, 0], [0, -.21, 0], .048, mat('#798b7e', .7));
      const ankle = bone(knee, 'ankle', 0, -.21, 0);
      box(ankle, .27, .13, .4, '#526e61', 0, -.015, .07);
      box(ankle, .26, .05, .27, mat('#d6e0cf',.5,.29), 0, .065, .07);
      box(knee,.09,.12,.045,mat('#becbd1',.82,.25),0,-.1,.049);
      rod(leg,[side*.1,-.035,-.04],[side*.1,-.2,-.04],.018,mat('#b2c1c7',.9,.22));
      rig.legs.push({upper: leg, lower: knee, ankle, side});
    }
    rod(rig.spine, [.15, .43, -.12], [.22, .75, -.12], .022, mat('#5a7264'));
    rig.indicator = sphere(rig.spine, .06, glow('#779d8a'), .22, .75, -.12);
    rig.root.rotation.y = Math.PI;
    batchRobot(rig);
    return rig;
  }
  return {robot};
}

const damp = (a, b, dt, rate = 6) => a + (b - a) * (1 - Math.exp(-rate * dt));
export function dampAngle(a, b, dt, rate = 7) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * (1 - Math.exp(-rate * dt)); }
// Distance-based cadence: a half-cycle corresponds to one planted footfall.
export function poseRig(rig,t,dt,{speed=0,attention=0,work=0,talk=false,lookYaw=0,reduced=false,carrying=false}={}){
 const moving=Math.min(1,Math.max(0,speed)/2.2);
 rig.move=damp(rig.move,moving,dt,10);rig.attention=damp(rig.attention,attention,dt,5);
 rig.work=damp(rig.work,work*(1-attention)*(1-moving),dt,5);
 const before=rig.gaitPhase;
 if(!reduced)rig.gaitPhase+=Math.max(0,speed)*dt*Math.PI/(.44*rig.root.scale.x);
 rig.steps=Math.floor(rig.gaitPhase/Math.PI)-Math.floor(before/Math.PI);
 const phase=t+rig.phase,stride=Math.sin(rig.gaitPhase),move=reduced?0:rig.move,idle=1-move;
 const inspect=Math.floor(phase/7)%3,breath=Math.sin(phase*1.4);
 rig.hips.position.y=.54+Math.abs(Math.sin(rig.gaitPhase))*.025*move;
 rig.hips.rotation.z=Math.sin(rig.gaitPhase)*.028*move+Math.sin(phase*.73)*.012*idle;
 rig.spine.rotation.x=-.045*move+breath*.01*idle+rig.work*.045;
 rig.spine.rotation.y=stride*.045*move+Math.sin(phase*.55)*.025*idle;
 rig.spine.rotation.z=-rig.hips.rotation.z*.65;
 const glance=Math.sin(phase*.45)*.18+Math.sin(phase*.17)*.1;
 rig.head.rotation.y=damp(rig.head.rotation.y,lookYaw*rig.attention+glance*idle*(1-rig.attention),dt);
 rig.head.rotation.x=damp(rig.head.rotation.x,talk?Math.sin(phase*5.2)*.055:rig.work*.06+Math.sin(phase*.8)*.025,dt);
 rig.pupil.position.x=damp(rig.pupil.position.x,(rig.attention?lookYaw:glance)*.11,dt);
 rig.pupil.material.color.set(talk?'#f0fbff':'#9de6ff');
 rig.opticMaterial.opacity=talk?.7+Math.sin(phase*12)*.18:.62;
 for(let i=0;i<rig.arms.length;i++){
  const {upper,lower,side}=rig.arms[i],wave=!reduced&&t<rig.greeting&&i===1?Math.sin(Math.min(1,rig.greeting-t)*Math.PI/2):0;
  const tap=Math.sin(phase*(i?5.6:4.4)+i*1.8);
  // Shoulders stay outside the shell. Elbows flex forward, away from the torso.
  const idleCheck=inspect===1&&i===0&&!talk?(1-rig.work)*idle*.42*(.5+.5*Math.sin(phase*.7)):0;
  const workPose=rig.work*(i===inspect%2?1.55:1.35)+idleCheck,talkPose=talk?(i? .35+.12*Math.sin(phase*3):.2):0;
  upper.rotation.x=damp(upper.rotation.x,-stride*side*.42*move*(carrying?0:1)-workPose-talkPose-(carrying?.75:0),dt,10);
  upper.rotation.z=damp(upper.rotation.z,side*(.2+.025*breath*idle)+(i===1?wave*.95:0),dt,8);
  lower.rotation.x=damp(lower.rotation.x,-.16-Math.max(0,-stride*side)*.24*move*(carrying?0:1)-rig.work*(.45+tap*.07)-(carrying?.4:0)-wave*.4,dt,10);
  lower.rotation.z=wave*Math.sin(phase*8)*.12;
 }
 for(const {upper,lower,ankle,side}of rig.legs){
  const gait=stride*side;
  upper.rotation.x=gait*.48*move;
  lower.rotation.x=Math.max(0,-gait)*.64*move;
  ankle.rotation.x=-lower.rotation.x*.5;
 }
 const blinkPhase=(phase+50)% (4.1+(rig.phase%1)*2),blink=blinkPhase<.18?Math.sin(blinkPhase/.18*Math.PI):0;
 rig.blinked=blink>.6&&rig.blink<=.6;rig.blink=blink;
 for(const eye of rig.eyes)eye.scale.y=Math.max(.08,1-blink);
 for(const {mesh,side}of rig.lids)mesh.position.y=side*.2*(1-blink);
 rig.root.userData.animation=move>.05?'walk':talk?'talk':rig.work>.4?'operate':inspect===0?'scan':inspect===1?'inspect':'idle';
}
