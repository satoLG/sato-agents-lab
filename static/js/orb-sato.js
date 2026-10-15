import * as T from '../vendor/three.module.min.js';
import {createSceneArt} from './scene-art.js';
import {createRigFactory} from './lab-rigs.js';

export const ORB_SATO_SCALE=.17;
export const ORB_SATO_HEIGHT=.30;

export function createOrbSato() {
  // Start with the existing companion, including its actual spherical hull,
  // flipper meshes, finishes and antenna. This is an adaptation of that rig.
  const rig=createRigFactory(createSceneArt()).robot({floating:true,batch:false});
  const original=[];rig.root.traverse(node=>{if(node.isMesh)original.push(node);});
  const hull=rig.spine.getObjectByName('spherical-hull');
  const rim=rig.head.children.find(node=>node.geometry?.type==='TorusGeometry'&&node.geometry.parameters.radius===.18);
  const iris=rig.pupil.children.find(node=>node.geometry?.type==='RingGeometry');
  const ticks=rig.pupil.getObjectByName('optic-radial-marks');
  const faceUniforms={blink:{value:0},joy:{value:0},sleep:{value:1},look:{value:new T.Vector2()},
    rimColor:{value:rim.material.color.clone()},irisColor:{value:iris.material.color.clone()},tickColor:{value:ticks.material.color.clone()}};
  const arms=rig.arms.map(({upper,side})=>({joint:upper,side})),antenna=rig.antenna,indicator=rig.indicator;
  const keep=new Set([hull,antenna,...arms.map(a=>a.joint)]);
  // Remove service seams, battery, magnetic emitter and the mechanical optic
  // assembly. Its familiar iris is reproduced on the curved display below.
  for(const child of [...rig.spine.children])if(!keep.has(child))rig.spine.remove(child);
  const root=new T.Group();root.name='orb-sato';root.userData.sourceModel='existing-companion';
  const model=new T.Group();model.scale.setScalar(ORB_SATO_SCALE);root.add(model);
  const body=rig.spine;body.name='sato-bouncy-body';body.removeFromParent();body.position.set(0,.94,0);model.add(body);
  // Round out the same continuous flippers, including the lower ends. Arms
  // and legs still share one shape/material; there are no separate shoes.
  const plumpFlipper=new T.LatheGeometry([
    new T.Vector2(0,-.77),new T.Vector2(.075,-.75),new T.Vector2(.13,-.68),
    new T.Vector2(.17,-.50),new T.Vector2(.175,-.27),new T.Vector2(.14,-.09),
    new T.Vector2(.07,.02),new T.Vector2(0,.03),
  ],24);
  for(const {joint} of arms){joint.children[0].geometry=plumpFlipper;joint.children[0].scale.z=.78;joint.scale.set(1,.72,1.1);}
  // A soft curled antenna grows diagonally from the front of the shell.
  antenna.clear();antenna.position.set(0,.44,.24);
  const curl=new T.CatmullRomCurve3([[0,0,0],[0,.15,.065],[.025,.30,.13],[.11,.40,.16],[.21,.38,.17],[.23,.30,.17],[.16,.265,.17],[.13,.31,.17]].map(p=>new T.Vector3(...p)));
  const tailBend={value:new T.Vector2()},tailMaterial=hull.material.clone();
  tailMaterial.onBeforeCompile=shader=>{
    shader.uniforms.orbTailBend=tailBend;shader.vertexShader='uniform vec2 orbTailBend;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal.y-=2.*position.y*dot(orbTailBend,objectNormal.xz);');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.xz+=position.y*position.y*orbTailBend;');
  };
  tailMaterial.customProgramCacheKey=()=> 'orb-sato-flexible-curl-v1';
  const tail=new T.Mesh(new T.TubeGeometry(curl,40,.025,8,false),tailMaterial);tail.name='sato-curled-antenna';antenna.add(tail);
  const tipRest=curl.getPoint(1);indicator.position.copy(tipRest);antenna.add(indicator);
  const legs=[];
  for(const {joint,side} of arms) {
    // Clone the adapted arm geometry: the legs keep its rounded cross-section
    // and material, with a short, rounded silhouette.
    const leg=joint.clone(true);leg.name=side<0?'sato-leg-left':'sato-leg-right';leg.position.set(side*.21,.33,0);leg.scale.set(.95,.43,1.15);model.add(leg);
    const foot=leg.getObjectByName('flipper-tip');foot.name=side<0?'sato-foot-left':'sato-foot-right';legs.push({joint:leg,foot,side});
  }
  // Same sphere as the white hull, only .002 above it to avoid z-fighting.
  // The display is a spherical cap, with no flat panel, socket or extruded rim.
  const displayGeometry=new T.SphereGeometry(.542,64,28,0,Math.PI*2,0,.77).rotateX(Math.PI/2);
  const displayMaterial=new T.ShaderMaterial({uniforms:faceUniforms,toneMapped:false,
    vertexShader:'varying vec3 vDisplayPosition;void main(){vDisplayPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 vDisplayPosition;uniform float blink,joy,sleep;uniform vec2 look;uniform vec3 rimColor,irisColor,tickColor;
      float band(float r,float lo,float hi){return smoothstep(lo-.0015,lo+.0015,r)*(1.-smoothstep(hi-.0015,hi+.0015,r));}
      void main(){
        vec2 p=vDisplayPosition.xy-vec2(0.,.015);p.y/=mix(1.,.055,blink);
        vec2 irisP=p-look*vec2(.012,.008);float r=length(irisP),outer=length(p);
        vec3 ink=vec3(.001,.002,.004);
        // Preserve the original .18 rim, .047/.151 iris, dark central aperture
        // and 32 radial light marks, using the original companion materials.
        float iris=band(r,.047,.151),ring=band(outer,.165,.195);
        float angle=atan(irisP.y,irisP.x)+3.14159265;
        float sector=mod(angle,6.2831853/32.);
        float marks=band(r,.057,.145)*(1.-smoothstep(.041,.050,sector));
        float smile=mix(1.,smoothstep(-.015,.015,p.y),joy);
        vec3 color=ink+irisColor*iris*smile+tickColor*marks*smile;
        color=mix(color,rimColor,ring*smile);
        float halo=exp(-pow((outer-.18)/.031,2.))*.12*(1.-blink);
        color+=rimColor*halo*smile;
        vec2 resting=vDisplayPosition.xy;
        float closedEye=(1.-smoothstep(.004,.008,abs(resting.y-(-.015-.026*cos(resting.x/.18*1.5707963)))))*(1.-smoothstep(.16,.18,abs(resting.x)));
        color=mix(color,ink+rimColor*closedEye*.55,sleep);
        vec2 brow=vDisplayPosition.xy;float browY=.255+joy*.025;
        float eyebrow=(1.-smoothstep(.006,.011,abs(brow.y-(browY+.020*cos(brow.x/.16*1.5707963)))))*(1.-smoothstep(.145,.165,abs(brow.x)));
        color=mix(color,rimColor*mix(1.,.4,sleep),eyebrow);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`,
  });
  const display=new T.Mesh(displayGeometry,displayMaterial);display.name='sato-single-eye';body.add(display);
  root.traverse(node=>{if(node.isMesh){node.castShadow=false;node.receiveShadow=false;}});
  // Release the legacy parts that were removed, retaining shared flipper and
  // shell resources used by the adapted rig.
  const retainedGeometry=new Set(),retainedMaterials=new Set();root.traverse(node=>{if(node.isMesh){retainedGeometry.add(node.geometry);retainedMaterials.add(node.material);}});
  const oldGeometry=new Set(original.map(node=>node.geometry)),oldMaterials=new Set(original.map(node=>node.material));
  for(const geometry of oldGeometry)if(!retainedGeometry.has(geometry))geometry.dispose();
  for(const material of oldMaterials)if(!retainedMaterials.has(material)){material.map?.dispose();material.dispose();}

  let gait=0,moving=0,seated=1,joy=0,spring=0,springVelocity=0,jumpPulse=0,sleeping=true,wake=0,antennaSpring=0,antennaVelocity=0;
  function wakeUp(){sleeping=false;wake=.9;joy=.9;springVelocity-=.45;}
  function rest(){sleeping=true;wake=0;joy=0;}
  function celebrate(){joy=1.2;}
  function bounce(amount){springVelocity+=amount;}
  function doubleJump(){jumpPulse=.42;joy=.65;springVelocity-=1.0;}
  function update(dt,{time=0,speed=0,grounded=true,verticalSpeed=0,playing=false,reduced=false}={}) {
    dt=Math.min(.05,Math.max(0,dt));moving=T.MathUtils.damp(moving,speed>.015?1:0,20,dt);
    wake=reduced?0:Math.max(0,wake-dt);
    seated=reduced?(!playing&&grounded?1:0):T.MathUtils.damp(seated,!playing&&grounded?1:grounded?wake/.9:0,14,dt);joy=Math.max(0,joy-dt);
    faceUniforms.sleep.value=reduced?(sleeping?1:0):T.MathUtils.damp(faceUniforms.sleep.value,sleeping?1:0,10,dt);
    jumpPulse=reduced?0:Math.max(0,jumpPulse-dt);model.rotation.y=0;
    gait+=speed*dt/.095*Math.PI;
    const stride=Math.sin(gait),hop=Math.abs(Math.cos(gait)),air=grounded?0:1,motion=reduced?.55:1;
    springVelocity+=(-115*spring-12*springVelocity)*dt;spring+=springVelocity*dt;
    const squash=T.MathUtils.clamp(spring,-.24,.28);
    const sleep=faceUniforms.sleep.value,breath=reduced?0:Math.sin(time*1.45)*sleep,stretch=Math.sin(Math.PI*(1-wake/.9))*(wake>0?1:0);
    const bob=motion*(hop*.055*moving+(reduced?0:Math.sin(time*2.4)*.008)*(1-moving)+breath*.007);
    const airStretch=air*T.MathUtils.clamp(verticalSpeed*.075,-.07,.13),pulse=jumpPulse>0?Math.sin(jumpPulse/.42*Math.PI)*.12:0;
    const bodyY=1-squash+airStretch-pulse+breath*.018,bodyXZ=1/Math.sqrt(bodyY);
    body.scale.set(bodyXZ+breath*.012,bodyY,bodyXZ+breath*.012);
    body.position.y=.84-.28*seated+bob-.54*squash;
    body.rotation.x=-.08*moving+.035*air+sleep*(.11+(reduced?0:Math.sin(time*.8)*.025));body.rotation.z=motion*(stride*.085*moving+sleep*Math.sin(time*.58)*.018);
    for(const {joint,side} of arms) {
      const stretchY=.72*(1-squash*.8+airStretch+Math.sin(gait*2+side)*moving*.10);
      joint.scale.set(Math.sqrt(.72/stretchY),stretchY,1.1*Math.sqrt(.72/stretchY));
      joint.rotation.x=-stride*side*1.02*moving*(1-air)-.95*seated-.35*air-.75*stretch;
      joint.rotation.z=side*(.16+.12*seated+.45*air+.35*stretch+(joy>0&&wake===0&&side>0?.45+.18*Math.sin(time*20):0));
    }
    for(const {joint,side} of legs) {
      const strideSide=stride*side;
      joint.position.y=.33-.165*seated+bob;
      joint.rotation.x=strideSide*.66*moving*(1-air)-1.15*seated-.32*air;
      joint.rotation.z=side*(.025+.10*air);
      // The planted flipper reaches the ground; the other one swings freely.
      const plant=grounded&&seated<.1&&(moving<.05||strideSide>0);
      joint.scale.y=plant?joint.position.y/(.77*Math.cos(joint.rotation.x)):.43*(1-squash+airStretch-pulse);
      const legWidth=T.MathUtils.clamp(Math.sqrt(.43/joint.scale.y),.85,1.3);joint.scale.x=.95*legWidth;joint.scale.z=1.15*legWidth;
    }
    const antennaTarget=stride*.30*moving+spring*1.6-verticalSpeed*.12;
    antennaVelocity+=((antennaTarget-antennaSpring)*65-antennaVelocity*8)*dt;antennaSpring+=antennaVelocity*dt;
    antenna.rotation.z=motion*(antennaSpring+Math.sin(time*3.7)*.045);
    antenna.rotation.x=.24*sleep+motion*(antennaSpring*.5+Math.sin(gait*.5)*moving*.10);
    antenna.scale.set(1+spring*.3,1-spring*.65,1+spring*.3);
    tailBend.value.set(motion*T.MathUtils.clamp(antennaSpring*1.4+antennaVelocity*.08,-.9,.9),motion*T.MathUtils.clamp(-verticalSpeed*.24+spring,-.5,.5));
    indicator.position.copy(tipRest);indicator.position.x+=tipRest.y*tipRest.y*tailBend.value.x;indicator.position.z+=tipRest.y*tipRest.y*tailBend.value.y;
    indicator.material.emissiveIntensity=.25;
    const blinkPhase=time%4.3,blink=blinkPhase<.15?Math.sin(blinkPhase/.15*Math.PI):0;
    faceUniforms.blink.value=reduced&&!playing?0:blink;faceUniforms.joy.value=T.MathUtils.damp(faceUniforms.joy.value,joy>0?1:0,16,dt);
    faceUniforms.look.value.set(Math.sin(time*.63)*.8,Math.sin(time*.31)*.4);
    root.userData.animation=sleep>.7?'sleep':wake>0?'wake':seated>.5?'sit':air?'jump':moving>.1?'walk':joy>0?'joy':'idle';
  }
  update(0);return {root,model,body,legs,arms,antenna,display,faceUniforms,update,wakeUp,rest,celebrate,bounce,doubleJump,get waking(){return wake>0;},get settling(){return wake>0||Math.abs(faceUniforms.sleep.value-(sleeping?1:0))>.001||Math.abs(seated-(sleeping?1:0))>.001;}};
}
