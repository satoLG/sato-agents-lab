import * as T from '../vendor/three.module.min.js';
import {ORB_STEP_DISTANCE} from './orb-motor.js';

export const ORB_SATO_SCALE=.165;
export const ORB_SATO_HEIGHT=.29;

// Bevelled armor plates keep the compact silhouette readable at game scale.
function plate(points,depth) {
  const shape=new T.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
  const geometry=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.018,bevelSize:.018,bevelSegments:1,steps:1});
  geometry.translate(0,0,-depth/2);return geometry;
}
export function createOrbSato() {
  const root=new T.Group();root.name='orb-sato';root.userData.sourceModel='compact-armored-sato';
  const model=new T.Group();model.scale.setScalar(ORB_SATO_SCALE);root.add(model);
  const white=new T.MeshStandardMaterial({color:'#f3f6fc',roughness:.34,metalness:.18});
  const blue=new T.MeshStandardMaterial({color:'#1769c4',roughness:.32,metalness:.35});
  const navy=new T.MeshStandardMaterial({color:'#10385f',roughness:.45,metalness:.25});
  const faceUniforms={blink:{value:0},joy:{value:0},sleep:{value:1},look:{value:new T.Vector2()},
    rimColor:{value:new T.Color('#65d8ff')},irisColor:{value:new T.Color('#149de1')},tickColor:{value:new T.Color('#b0edff')}};
  function mesh(parent,name,geometry,material,position=[0,0,0]){const m=new T.Mesh(geometry,material);m.name=name;m.position.set(...position);parent.add(m);return m;}
  const body=new T.Group();body.name='sato-bouncy-body';body.position.y=.70;model.add(body);
  mesh(body,'sato-tapered-chest',plate([[-.20,.17],[-.28,.08],[-.15,-.14],[.15,-.14],[.28,.08],[.20,.17]],.26),white);
  mesh(body,'sato-chest-inlay',plate([[-.15,.12],[0,.02],[.15,.12],[.10,-.02],[0,-.08],[-.10,-.02]],.018),blue,[0,0,.15]);
  mesh(body,'sato-narrow-waist',new T.CylinderGeometry(.105,.115,.16,8),navy,[0,-.17,0]);
  mesh(body,'sato-hip-armor',plate([[-.17,.06],[-.21,-.02],[-.13,-.12],[0,-.06],[.13,-.12],[.21,-.02],[.17,.06]],.24),white,[0,-.25,0]);
  mesh(body,'sato-belt-core',new T.SphereGeometry(.06,12,8),blue,[0,-.22,.14]);
  mesh(body,'sato-neck',new T.CylinderGeometry(.08,.09,.12,8),navy,[0,.22,0]);
  // Helmet wraps the recessed optic with a pointed brow, cheek guards and chin mask.
  mesh(body,'sato-helmet',new T.SphereGeometry(1,16,12),white,[0,.50,-.025]).scale.set(.335,.30,.26);
  mesh(body,'sato-blue-crown',plate([[-.11,.26],[0,.30],[.11,.26],[.12,.10],[0,.035],[-.12,.10]],.045),blue,[0,.48,.215]);
  for(const side of [-1,1]){
    const mirror=points=>points.map(([x,y])=>[x*side,y]);
    mesh(body,'sato-brow',plate(mirror([[.0,.07],[.13,.10],[.31,.13],[.33,.06],[.17,.015],[.0,.035]]),.10),white,[0,.645,.245]);
    mesh(body,'sato-cheek-guard',plate(mirror([[.24,.13],[.34,.20],[.32,-.18],[.21,-.26],[.14,-.15],[.22,-.08]]),.13),white,[0,.49,.14]);
  }
  mesh(body,'sato-mask',plate([[-.21,.03],[-.12,.075],[-.065,.01],[.065,.01],[.12,.075],[.21,.03],[.15,-.095],[0,-.15],[-.15,-.095]],.095),white,[0,.34,.245]);
  mesh(body,'sato-mask-inset',plate([[-.065,.02],[.065,.02],[.045,-.045],[-.045,-.045]],.012),blue,[0,.29,.303]);
  const antenna=new T.Group();antenna.name='sato-helmet-fins';antenna.position.set(0,.70,0);body.add(antenna);
  for(const side of [-1,1]){
    mesh(antenna,'sato-swept-horn',plate([[.20,.0],[.28,.10],[.245,.28],[.36,.18],[.37,.07],[.29,-.055]].map(([x,y])=>[x*side,y]),.075),blue,[0,0,-.015]);
    mesh(antenna,'sato-fin-highlight',plate([[.27,.08],[.263,.20],[.29,.14],[.31,.08]].map(([x,y])=>[x*side,y]),.008),white,[0,0,.04]);
  }
  const tip=new T.Object3D();tip.name='antenna-tip';tip.position.set(0,.29,0);antenna.add(tip);
  const arms=[],legs=[];
  for(const side of [-1,1]) {
    const joint=new T.Group();joint.position.set(side*.265,.09,0);body.add(joint);
    mesh(joint,'sato-shoulder-fin',plate([[0,.10],[side*.22,.19],[side*.12,-.05],[0,-.07]],.17),white);
    mesh(joint,'sato-arm-joint',new T.SphereGeometry(.07,12,8),navy,[side*.025,-.08,0]);
    mesh(joint,'sato-forearm',plate([[-.075,.07],[-.09,-.09],[-.055,-.14],[.065,-.14],[.09,.02],[.055,.09]],.15),white,[side*.05,-.20,0]);
    mesh(joint,'sato-wrist',new T.CylinderGeometry(.055,.055,.07,8),blue,[side*.05,-.34,0]);
    mesh(joint,'sato-hand',plate([[-.075,.055],[-.08,-.04],[-.04,-.075],[.06,-.055],[.08,.03]],.14),white,[side*.05,-.40,.018]);
    for(let k=0;k<3;k++)mesh(joint,'sato-knuckle',new T.BoxGeometry(.025,.04,.018),blue,[side*.05+(k-1)*.04,-.405,.10]);
    arms.push({joint,side});
    const leg=new T.Group();leg.position.set(side*.135,.46,0);model.add(leg);
    mesh(leg,'sato-thigh-joint',new T.SphereGeometry(.075,12,8),navy);
    mesh(leg,'sato-thigh',new T.CylinderGeometry(.07,.08,.17,8),white,[0,-.11,0]);
    mesh(leg,'sato-knee',plate([[-.075,.05],[0,.09],[.075,.05],[.055,-.065],[0,-.09],[-.055,-.065]],.11),blue,[0,-.21,.055]);
    mesh(leg,'sato-sculpted-shin',plate([[-.065,.10],[-.085,.01],[-.065,-.12],[-.11,-.16],[.11,-.16],[.065,-.12],[.085,.01],[.065,.10]],.14),white,[0,-.30,0]);
    mesh(leg,'sato-shin-stripe',plate([[-.022,.06],[-.027,-.10],[.027,-.10],[.022,.06]],.012),blue,[0,-.30,.085]);
    const foot=mesh(leg,side<0?'sato-foot-left':'sato-foot-right',plate([[-.10,.05],[-.12,-.035],[.12,-.035],[.10,.05],[0,.08]],.28),white,[0,-.41,.075]);
    mesh(leg,'sato-blue-toe',plate([[-.055,.045],[-.04,-.025],[.04,-.025],[.055,.045]],.012),blue,[0,-.41,.23]);
    legs.push({joint:leg,foot,side});
  }
  const visorShape=new T.Shape();
  [[-.25,.12],[-.17,.16],[.17,.16],[.25,.12],[.21,-.12],[.10,-.16],[-.10,-.16],[-.21,-.12]].forEach(([x,y],i)=>i?visorShape.lineTo(x,y):visorShape.moveTo(x,y));visorShape.closePath();
  const displayGeometry=new T.ShapeGeometry(visorShape);
  const displayMaterial=new T.ShaderMaterial({uniforms:faceUniforms,toneMapped:false,
    vertexShader:'varying vec3 vDisplayPosition;void main(){vDisplayPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 vDisplayPosition;uniform float blink,joy,sleep;uniform vec2 look;uniform vec3 rimColor,irisColor,tickColor;
      float band(float r,float lo,float hi){return smoothstep(lo-.0015,lo+.0015,r)*(1.-smoothstep(hi-.0015,hi+.0015,r));}
      void main(){
        vec2 p=(vDisplayPosition.xy-vec2(0.,.025))*1.6;p.y/=mix(1.,.055,blink);
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
  const display=new T.Mesh(displayGeometry,displayMaterial);display.name='sato-single-eye';display.position.set(0,.51,.275);body.add(display);
  let gait=0,moving=0,seated=1,joy=0,spring=0,springVelocity=0,jumpPulse=0,sleeping=true,wake=0;
  function wakeUp(){sleeping=false;wake=.9;joy=.9;}
  function rest(){sleeping=true;wake=0;joy=0;}
  function celebrate(){joy=1.2;}
  function bounce(amount){springVelocity+=amount*.35;}
  function doubleJump(){jumpPulse=.42;joy=.65;}
  function update(dt,{time=0,speed=0,grounded=true,verticalSpeed=0,playing=false,reduced=false}={}) {
    dt=Math.min(.05,Math.max(0,dt));moving=T.MathUtils.damp(moving,speed>.015?1:0,20,dt);
    wake=reduced?0:Math.max(0,wake-dt);seated=T.MathUtils.damp(seated,!playing&&grounded?1:0,14,dt);joy=Math.max(0,joy-dt);
    faceUniforms.sleep.value=reduced?(sleeping?1:0):T.MathUtils.damp(faceUniforms.sleep.value,sleeping?1:0,10,dt);
    jumpPulse=reduced?0:Math.max(0,jumpPulse-dt);gait+=speed*dt/ORB_STEP_DISTANCE*Math.PI;
    const stride=Math.sin(gait),air=grounded?0:1,motion=reduced?.55:1,sleep=faceUniforms.sleep.value;
    springVelocity+=(-115*spring-12*springVelocity)*dt;spring+=springVelocity*dt;
    const pulse=jumpPulse>0?Math.sin(jumpPulse/.42*Math.PI)*.025:0;
    const squash=T.MathUtils.clamp(spring+pulse,-.035,.07),bob=motion*Math.abs(Math.cos(gait))*.018*moving;
    body.scale.set(1,1-squash,1);body.position.y=.70-.15*seated+bob;
    body.rotation.x=-.055*moving+sleep*.07+air*T.MathUtils.clamp(verticalSpeed*.015,-.025,.025);body.rotation.z=motion*stride*.035*moving;
    if(!reduced)body.position.y+=Math.sin(time*1.45)*sleep*.006;
    for(const {joint,side} of arms){joint.rotation.x=-stride*side*.55*moving*(1-air)-.35*seated-.55*air;joint.rotation.z=side*(.04+.25*air+(joy>0&&wake===0&&side>0?.25+.10*Math.sin(time*12):0));}
    for(const {joint,side} of legs){joint.position.y=.46-.12*seated+bob;joint.rotation.x=stride*side*.48*moving*(1-air)-.85*seated-.25*air;joint.rotation.z=side*.025;}
    const blinkPhase=time%4.3;faceUniforms.blink.value=reduced&&!playing?0:blinkPhase<.15?Math.sin(blinkPhase/.15*Math.PI):0;
    faceUniforms.joy.value=T.MathUtils.damp(faceUniforms.joy.value,joy>0?1:0,16,dt);faceUniforms.look.value.set(Math.sin(time*.63)*.8,Math.sin(time*.31)*.4);
    root.userData.animation=sleep>.7?'sleep':wake>0?'wake':seated>.5?'sit':air?'jump':moving>.1?'walk':joy>0?'joy':'idle';
  }
  update(0);return {root,model,body,legs,arms,antenna,display,faceUniforms,update,wakeUp,rest,celebrate,bounce,doubleJump,get waking(){return wake>0;},get settling(){return wake>0||Math.abs(faceUniforms.sleep.value-(sleeping?1:0))>.001||Math.abs(seated-(sleeping?1:0))>.001;}};
}
