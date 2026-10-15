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
  antenna.position.set(0,.50,-.04);
  const legs=[];
  for(const {joint,side} of arms) {
    // Clone the original arm geometry: the legs keep its taper, cross-section
    // and material, shortened to 56.5% of its length.
    const leg=joint.clone(true);leg.name=side<0?'sato-leg-left':'sato-leg-right';leg.position.set(side*.20,.435,0);leg.scale.set(.8,.565,.9);model.add(leg);
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

  let gait=0,moving=0,seated=1,joy=0,spring=0,springVelocity=0,spin=0,sleeping=true,wake=0;
  function wakeUp(){sleeping=false;wake=.9;joy=.9;springVelocity-=.45;}
  function rest(){sleeping=true;wake=0;joy=0;}
  function celebrate(){joy=1.2;}
  function bounce(amount){springVelocity+=amount;}
  function doubleJump(){spin=.42;joy=.65;}
  function update(dt,{time=0,speed=0,grounded=true,verticalSpeed=0,playing=false,reduced=false}={}) {
    dt=Math.min(.05,Math.max(0,dt));moving=T.MathUtils.damp(moving,speed>.015?1:0,20,dt);
    wake=reduced?0:Math.max(0,wake-dt);
    seated=reduced?(!playing&&grounded?1:0):T.MathUtils.damp(seated,!playing&&grounded?1:grounded?wake/.9:0,14,dt);joy=Math.max(0,joy-dt);
    faceUniforms.sleep.value=reduced?(sleeping?1:0):T.MathUtils.damp(faceUniforms.sleep.value,sleeping?1:0,10,dt);
    spin=reduced?0:Math.max(0,spin-dt);model.rotation.y=spin>0?Math.PI*2*(1-spin/.42):0;
    gait+=speed*dt/.095*Math.PI;
    const stride=Math.sin(gait),hop=Math.abs(Math.cos(gait)),air=grounded?0:1,motion=reduced?.55:1;
    springVelocity+=(-160*spring-18*springVelocity)*dt;spring+=springVelocity*dt;
    const squash=T.MathUtils.clamp(spring,-.16,.2);
    const sleep=faceUniforms.sleep.value,breath=reduced?0:Math.sin(time*1.45)*sleep,stretch=Math.sin(Math.PI*(1-wake/.9))*(wake>0?1:0);
    const bob=motion*(hop*.025*moving+(reduced?0:Math.sin(time*2.4)*.008)*(1-moving)+breath*.007);
    body.scale.set(1+squash*.42+breath*.012,1-squash+breath*.018,1+squash*.42+breath*.012);
    body.position.y=.94-.38*seated+bob-.54*squash;
    body.rotation.x=-.08*moving+.035*air+sleep*(.11+(reduced?0:Math.sin(time*.8)*.025));body.rotation.z=motion*(stride*.045*moving+sleep*Math.sin(time*.58)*.018);
    for(const {joint,side} of arms) {
      joint.rotation.x=-stride*side*.80*moving*(1-air)-.95*seated-.35*air-.75*stretch;
      joint.rotation.z=side*(.16+.12*seated+.45*air+.35*stretch+(joy>0&&wake===0&&side>0?.45+.18*Math.sin(time*20):0));
    }
    for(const {joint,side} of legs) {
      const strideSide=stride*side;
      joint.position.y=.435-.27*seated+bob;
      joint.rotation.x=strideSide*.78*moving*(1-air)-1.15*seated-.32*air;
      joint.rotation.z=side*(.025+.10*air);
      // The planted flipper reaches the ground; the other one swings freely.
      const plant=grounded&&seated<.1&&(moving<.05||strideSide>0);
      joint.scale.y=plant?joint.position.y/(.77*Math.cos(joint.rotation.x)):.565;
    }
    antenna.rotation.z=motion*(stride*.11*moving+Math.sin(time*3.7)*.035);
    antenna.rotation.x=.34*sleep+motion*T.MathUtils.clamp(-verticalSpeed*.11,-.2,.2);
    indicator.material.emissiveIntensity=.25;
    const blinkPhase=time%4.3,blink=blinkPhase<.15?Math.sin(blinkPhase/.15*Math.PI):0;
    faceUniforms.blink.value=reduced&&!playing?0:blink;faceUniforms.joy.value=T.MathUtils.damp(faceUniforms.joy.value,joy>0?1:0,16,dt);
    faceUniforms.look.value.set(Math.sin(time*.63)*.8,Math.sin(time*.31)*.4);
    root.userData.animation=sleep>.7?'sleep':wake>0?'wake':seated>.5?'sit':air?'jump':moving>.1?'walk':joy>0?'joy':'idle';
  }
  update(0);return {root,model,body,legs,arms,antenna,display,faceUniforms,update,wakeUp,rest,celebrate,bounce,doubleJump,get waking(){return wake>0;},get settling(){return wake>0||Math.abs(faceUniforms.sleep.value-(sleeping?1:0))>.001||Math.abs(seated-(sleeping?1:0))>.001;}};
}
