import * as T from '../vendor/three.module.min.js';
import {ORB_STEP_DISTANCE} from './orb-motor.js';
import {helmetGeometry,crownGeometry,armorLoft,roundedPlate,sweptHorn} from './orb-armor.js';
import {createOrbCape} from './orb-cape.js';

export const ORB_SATO_SCALE=.165;
export const ORB_SATO_HEIGHT=.29;
export function createOrbSato() {
  const root=new T.Group();root.name='orb-sato';root.userData.sourceModel='sculpted-armored-sato';
  const model=new T.Group();model.scale.setScalar(ORB_SATO_SCALE);root.add(model);
  const white=new T.MeshStandardMaterial({color:'#f3f6fc',roughness:.32,metalness:.16});
  const blue=new T.MeshStandardMaterial({color:'#1769c4',roughness:.30,metalness:.30});
  const navy=new T.MeshStandardMaterial({color:'#10385f',roughness:.45,metalness:.25});
  const faceUniforms={blink:{value:0},joy:{value:0},sleep:{value:1},look:{value:new T.Vector2()},rimColor:{value:new T.Color('#65d8ff')},irisColor:{value:new T.Color('#149de1')},tickColor:{value:new T.Color('#b0edff')}};
  function mesh(parent,name,geometry,material,position=[0,0,0]){const m=new T.Mesh(geometry,material);m.name=name;m.position.set(...position);parent.add(m);return m;}
  function joint(parent,name,position){const g=new T.Group();g.name=name;g.position.set(...position);parent.add(g);return g;}
  const body=joint(model,'sato-bouncy-body',[0,.70,0]);
  mesh(body,'sato-tapered-chest',armorLoft([[-.15,.12,.095],[-.10,.17,.13],[.03,.235,.155],[.14,.22,.13],[.18,.08,.06]]),white);
  mesh(body,'sato-chest-inlay',roundedPlate([[-.13,.075],[0,.005],[.13,.075],[.08,-.025],[0,-.08],[-.08,-.025]],.018,.012),blue,[0,0,.15]);
  mesh(body,'sato-narrow-waist',new T.CylinderGeometry(.10,.12,.15,24),navy,[0,-.19,0]);
  mesh(body,'sato-hip-armor',armorLoft([[-.1,.11,.09],[-.04,.195,.13],[.03,.18,.12],[.08,.105,.075]]),white,[0,-.27,0]);
  mesh(body,'sato-belt-core',new T.SphereGeometry(.052,20,12),blue,[0,-.25,.13]);
  mesh(body,'sato-neck',new T.CylinderGeometry(.075,.09,.12,20),navy,[0,.22,0]);
  mesh(body,'sato-helmet',helmetGeometry(),white,[0,.50,0]);
  mesh(body,'sato-blue-crown',crownGeometry(),blue,[0,.50,0]);
  mesh(body,'sato-mask',armorLoft([[-.105,.02,.025,.025],[-.07,.115,.048,.02],[.0,.195,.06,0],[.065,.13,.035,-.02]],{rings:20}),white,[0,.35,.245]);
  mesh(body,'sato-mask-inset',roundedPlate([[-.04,.018],[.04,.018],[.025,-.025],[-.025,-.025]],.008,.009),blue,[0,.315,.297]);
  const antenna=joint(body,'sato-helmet-fins',[0,.70,0]);
  for(const side of [-1,1])mesh(antenna,'sato-swept-horn',sweptHorn(side),blue);
  const tip=new T.Object3D();tip.name='antenna-tip';tip.position.set(0,.27,-.25);antenna.add(tip);
  const arms=[],legs=[];
  for(const side of [-1,1]){
    const upper=joint(body,side<0?'sato-arm-left':'sato-arm-right',[side*.265,.10,0]);
    mesh(upper,'sato-shoulder-fin',roundedPlate([[side*-.02,.08],[side*.19,.16],[side*.12,-.015],[0,-.05]],.12,.033),white);
    mesh(upper,'sato-shoulder-joint',new T.SphereGeometry(.065,16,12),navy,[0,-.045,0]);
    mesh(upper,'sato-upper-arm',armorLoft([[-.17,.05,.055],[-.13,.073,.065],[-.06,.063,.06],[-.03,.035,.04]]),white);
    const elbow=joint(upper,'sato-elbow',[0,-.18,0]);mesh(elbow,'sato-elbow-bearing',new T.SphereGeometry(.056,16,12),blue);
    mesh(elbow,'sato-forearm',armorLoft([[-.16,.048,.055],[-.12,.082,.083],[-.025,.071,.063],[.015,.04,.04]]),white);
    const wrist=joint(elbow,'sato-wrist',[0,-.18,0]);mesh(wrist,'sato-wrist-bearing',new T.CylinderGeometry(.043,.045,.06,16),blue);
    const hand=mesh(wrist,'sato-hand',armorLoft([[-.10,.035,.04],[-.07,.068,.065],[-.015,.073,.058],[.02,.045,.04]]),white);
    mesh(wrist,'sato-palm-emitter',new T.CylinderGeometry(.026,.026,.012,16).rotateX(Math.PI/2),blue,[0,-.05,.064]);
    for(let k=0;k<3;k++)mesh(wrist,'sato-knuckle',new T.SphereGeometry(.017,10,8),blue,[(k-1)*.035,-.065,.06]);
    arms.push({joint:upper,elbow,wrist,hand,side});
    const hip=joint(model,'sato-hip-joint',[side*.135,.46,0]);mesh(hip,'sato-thigh-joint',new T.SphereGeometry(.065,16,12),navy);
    mesh(hip,'sato-thigh',armorLoft([[-.19,.045,.045],[-.13,.075,.065],[-.03,.068,.057],[0,.035,.03]]),white);
    const knee=joint(hip,'sato-knee-joint',[0,-.205,0]);mesh(knee,'sato-knee',new T.SphereGeometry(.064,20,12),blue,[0,0,.018]);
    mesh(knee,'sato-sculpted-shin',armorLoft([[-.20,.075,.068,.01],[-.15,.064,.067,0],[-.06,.083,.077,.015],[.015,.045,.04,0]]),white);
    mesh(knee,'sato-shin-stripe',roundedPlate([[-.018,.055],[.018,.055],[.025,-.07],[-.025,-.07]],.008,.011),blue,[0,-.105,.081]);
    const ankle=joint(knee,'sato-ankle',[0,-.205,0]);
    const foot=mesh(ankle,side<0?'sato-foot-left':'sato-foot-right',armorLoft([[-.045,.075,.12,.05],[-.02,.11,.155,.06],[.04,.092,.125,.045],[.065,.045,.05,0]]),white);
    mesh(ankle,'sato-blue-toe',new T.SphereGeometry(1,16,12),blue,[0,.005,.19]).scale.set(.04,.032,.02);
    legs.push({joint:hip,knee,ankle,foot,side});
  }
  const cape=createOrbCape();body.add(cape.mesh);
  const clothColliders=arms.flatMap(()=>[0,1].map(()=>({a:new T.Vector3(),b:new T.Vector3(),radius:.095}))),forearmRotation=new T.Quaternion();
  // A draped collar wraps the shoulders above the simulated cloth's pinned seam.
  const scarfCurve=new T.CatmullRomCurve3([[-.23,.22,.07],[-.19,.17,.17],[0,.13,.21],[.20,.20,.15],[.22,.24,-.02],[0,.23,-.17],[-.23,.22,.07]].map(p=>new T.Vector3(...p)));
  mesh(body,'sato-cape-collar',new T.TubeGeometry(scarfCurve,40,.044,10,false),cape.mesh.material);
  const visorShape=new T.Shape();[[-.25,.12],[-.17,.16],[.17,.16],[.25,.12],[.21,-.12],[.10,-.16],[-.10,-.16],[-.21,-.12]].forEach(([x,y],i)=>i?visorShape.lineTo(x,y):visorShape.moveTo(x,y));visorShape.closePath();
  const displayGeometry=new T.ShapeGeometry(visorShape);
  const displayMaterial=new T.ShaderMaterial({uniforms:faceUniforms,toneMapped:false,
    vertexShader:'varying vec3 vDisplayPosition;void main(){vDisplayPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 vDisplayPosition;uniform float blink,joy,sleep;uniform vec2 look;uniform vec3 rimColor,irisColor,tickColor;
      float band(float r,float lo,float hi){return smoothstep(lo-.0015,lo+.0015,r)*(1.-smoothstep(hi-.0015,hi+.0015,r));}
      void main(){
        vec2 p=(vDisplayPosition.xy-vec2(0.,.01))*1.85;p.y/=mix(1.,.055,blink);
        vec2 irisP=p-look*vec2(.012,.008);float r=length(irisP),outer=length(p);
        vec3 ink=vec3(.001,.002,.004);
        // Preserve the original .18 rim, .047/.151 iris, dark central aperture
        // and 32 radial light marks, using the companion blue palette.
        float iris=band(r,.047,.151),ring=band(outer,.165,.195);
        float angle=atan(irisP.y,irisP.x)+3.14159265;
        float sector=mod(angle,6.2831853/32.);
        float marks=band(r,.057,.145)*(1.-smoothstep(.041,.050,sector));
        float smile=mix(1.,smoothstep(-.015,.015,p.y),joy);
        vec3 color=ink+irisColor*iris*smile+tickColor*marks*smile;
        color=mix(color,rimColor,ring*smile);
        float halo=exp(-pow((outer-.18)/.031,2.))*.12*(1.-blink);
        color+=rimColor*halo*smile;
        vec2 resting=vDisplayPosition.xy*1.6;
        float closedEye=(1.-smoothstep(.004,.008,abs(resting.y-(-.015-.026*cos(resting.x/.18*1.5707963)))))*(1.-smoothstep(.16,.18,abs(resting.x)));
        color=mix(color,ink+rimColor*closedEye*.55,sleep);
        vec2 brow=vDisplayPosition.xy*1.6;float browY=.255+joy*.025;
        float eyebrow=(1.-smoothstep(.006,.011,abs(brow.y-(browY+.020*cos(brow.x/.16*1.5707963)))))*(1.-smoothstep(.145,.165,abs(brow.x)));
        color=mix(color,rimColor*mix(1.,.4,sleep),eyebrow);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`,
  });
  const display=new T.Mesh(displayGeometry,displayMaterial);display.name='sato-single-eye';display.scale.set(.91,.91,1);display.position.set(0,.505,.218);body.add(display);
  const downAxis=new T.Vector3(0,-1,0),aimUpper=new T.Quaternion(),aimLower=new T.Quaternion(),restWrist=new T.Quaternion();
  function braceArm(arm,blend){
    const right=arm.side>0;
    arm.joint.position.x=T.MathUtils.lerp(arm.side*.265,arm.side*.23,blend);
    const elbowPoint=new T.Vector3(...(right?[.14,.03,.14]:[-.13,0,.11]));
    const wristPoint=new T.Vector3(...(right?[.09,.035,.313]:[.04,0,.17]));
    aimUpper.setFromUnitVectors(downAxis,elbowPoint.clone().sub(arm.joint.position).normalize());
    aimLower.setFromUnitVectors(downAxis,wristPoint.sub(elbowPoint).normalize());
    aimLower.premultiply(aimUpper.clone().invert());
    arm.joint.quaternion.slerp(aimUpper,blend);arm.elbow.quaternion.slerp(aimLower,blend);arm.wrist.quaternion.slerp(restWrist,blend);
  }
  let gait=0,moving=0,seated=1,joy=0,spring=0,springVelocity=0,jumpPulse=0,sleeping=true,wake=0,attackBlend=0;
  function wakeUp(){sleeping=false;wake=.75;joy=.7;}
  function rest(){sleeping=true;wake=0;joy=0;}
  function celebrate(){joy=1.2;}
  function bounce(amount){springVelocity+=amount*.35;}
  function doubleJump(){jumpPulse=.42;joy=.65;}
  function update(dt,{time=0,speed=0,grounded=true,verticalSpeed=0,playing=false,reduced=false,running=false,turn=0,charge=0,firing=0}={}) {
    dt=Math.min(.05,Math.max(0,dt));moving=T.MathUtils.damp(moving,speed>.015?1:0,16,dt);
    wake=reduced?0:Math.max(0,wake-dt);seated=T.MathUtils.damp(seated,!playing&&grounded?1:0,14,dt);joy=Math.max(0,joy-dt);
    faceUniforms.sleep.value=reduced?(sleeping?1:0):T.MathUtils.damp(faceUniforms.sleep.value,sleeping?1:0,10,dt);
    jumpPulse=reduced?0:Math.max(0,jumpPulse-dt);gait+=speed*dt/(ORB_STEP_DISTANCE*(running?1.22:1))*Math.PI;
    const stride=Math.sin(gait),air=grounded?0:1,motion=reduced?.55:1,sleep=faceUniforms.sleep.value;
    attackBlend=T.MathUtils.damp(attackBlend,charge>0||firing>0?1:0,14,dt);
    springVelocity+=(-115*spring-12*springVelocity)*dt;spring+=springVelocity*dt;
    const pulse=jumpPulse>0?Math.sin(jumpPulse/.42*Math.PI)*.03:0,squash=T.MathUtils.clamp(spring+pulse,-.025,.08);
    const bob=motion*(Math.abs(Math.sin(gait))-.5)*.035*moving;
    body.scale.set(1,1-squash,1);body.position.y=.70-.15*seated+bob-.025*attackBlend;
    body.rotation.set(-.06*moving-(running?.10:0)+sleep*.07+air*T.MathUtils.clamp(verticalSpeed*.035,-.09,.08)+firing*.05,motion*stride*.055*moving,-turn*.07+motion*stride*.04*moving);
    if(!reduced)body.position.y+=Math.sin(time*1.45)*sleep*.006;
    for(const arm of arms){
      const {joint,elbow,wrist,side}=arm,cycle=stride*side;
      const baseX=-cycle*(running?.85:.56)*moving*(1-air)-.25*seated-.55*air;
      joint.rotation.set(baseX,0,side*(.07+.28*air));
      elbow.rotation.set(-.22-Math.max(0,cycle)*.45*moving-.5*air,0,0);
      wrist.rotation.set(-.10+air*.22,0,side*.05);
    }
    for(const arm of arms)braceArm(arm,attackBlend);
    for(const {joint,knee,ankle,side} of legs){
      const cycle=stride*side,lift=Math.max(0,-cycle)*moving;
      joint.rotation.set(cycle*(running?.72:.48)*moving*(1-air)-.80*seated-.35*air,0,side*(.025+.10*attackBlend));
      knee.rotation.x=.10+lift*(running?.95:.70)+air*(.65+side*.13)-.18*seated+.22*attackBlend;
      ankle.rotation.x=-joint.rotation.x*.45-knee.rotation.x*.65;
      joint.position.y=.46-.12*seated+bob+lift*.035;
    }
    arms.forEach((arm,i)=>{
      const upper=clothColliders[i*2],lower=clothColliders[i*2+1];upper.a.copy(arm.joint.position);upper.b.copy(arm.elbow.position).applyQuaternion(arm.joint.quaternion).add(upper.a);
      lower.a.copy(upper.b);forearmRotation.copy(arm.joint.quaternion).multiply(arm.elbow.quaternion);lower.b.set(0,-.27,0).applyQuaternion(forearmRotation).add(lower.a);
    });
    cape.update(dt,{speed,verticalSpeed,turn,power:charge+firing,reduced,colliders:clothColliders,floor:grounded?(.045-body.position.y)/body.scale.y:-1.2});
    const blinkPhase=time%4.3;faceUniforms.blink.value=reduced&&!playing?0:blinkPhase<.15?Math.sin(blinkPhase/.15*Math.PI):0;
    faceUniforms.joy.value=T.MathUtils.damp(faceUniforms.joy.value,joy>0&&!attackBlend?1:0,16,dt);faceUniforms.look.value.set(Math.sin(time*.63)*.8*(1-attackBlend),Math.sin(time*.31)*.4);
    root.userData.animation=sleep>.7?'sleep':wake>0?'wake':firing>0?'fire':charge>0?'charge':seated>.5?'sit':air?'jump':moving>.1?(running?'run':'walk'):joy>0?'joy':'idle';
  }
  const muzzle=new T.Object3D();muzzle.name='sato-laser-muzzle';muzzle.position.set(0,-.08,.075);arms.find(a=>a.side>0).wrist.add(muzzle);
  update(0);return {root,model,body,legs,arms,antenna,display,faceUniforms,cape,muzzle,update,wakeUp,rest,celebrate,bounce,doubleJump,get waking(){return wake>0;},get settling(){return wake>0||Math.abs(faceUniforms.sleep.value-(sleeping?1:0))>.001||Math.abs(seated-(sleeping?1:0))>.001;}};
}
