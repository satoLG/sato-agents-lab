import * as T from '../vendor/three.module.min.js';
import * as S from './orb-blast-shaders.js';
import {createCombatSettings} from './orb-combat-settings.js';

const Y=new T.Vector3(0,1,0),Z=new T.Vector3(0,0,1),STEP=1/120,MAX_SHOTS=6;
// Velocity Verlet preserves curved trajectories under inverse-square gravity.
export function advanceProjectile(p,dt){
 const r=p.position.length(),a=p.position.clone().multiplyScalar(-p.mu/(r*r*r));
 p.position.addScaledVector(p.velocity,dt).addScaledVector(a,.5*dt*dt);
 const r2=p.position.length();p.velocity.addScaledVector(a,.5*dt).addScaledVector(p.position,-p.mu/(r2*r2*r2)*.5*dt);p.age+=dt;
}
export function createOrbPower(water,{onSound=()=>{},surface=null}={}){
 const settings=createCombatSettings(),cfg=settings.values,group=new T.Group();group.name='sato-power-effects';group.userData.orbFoamExclude=true;
 const color=hex=>({value:new T.Color(hex)}),f=value=>({value});
 const mat=(vertexShader,fragmentShader,uniforms)=>new T.ShaderMaterial({vertexShader,fragmentShader,uniforms,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,side:T.DoubleSide});
 const chargeRoot=new T.Group();group.add(chargeRoot);
 const sphere=new T.SphereGeometry(1,28,20);
 const coreMat=mat(S.BASE_VERT,S.FRESNEL_FRAG,{uCoreColor:color(cfg.coreColor),uRimColor:color(cfg.rimColor),uEmission:f(1),uProgress:f(0),uFresnelPower:f(2),uBodyFalloff:f(1.2),uCoreFalloff:f(1.1),uCoreBoost:f(.6)});
 const glowMat=mat(S.BASE_VERT,S.GLOW_FRAG,{uColorInner:color(cfg.midColor),uColorOuter:color(cfg.rimColor),uEmission:f(.16),uProgress:f(0),uFalloffPower:f(2.4),uEdgeSoftness:f(1.5)});
 const noiseMat=mat(S.BASE_VERT,S.NOISE_FRAG,{uTime:f(0),uProgress:f(0),uColor:color(cfg.midColor),uNoiseScale:f(cfg.noiseScale),uNoiseSpeed:f(cfg.noiseSpeed),uFlowIntensity:f(.65),uWarpStrength:f(cfg.warp)});
 coreMat.side=glowMat.side=noiseMat.side=T.FrontSide;
 const orb=new T.Mesh(sphere,coreMat),halo=new T.Mesh(sphere,glowMat),flow=new T.Mesh(sphere,noiseMat);orb.name='sato-charge-orb';halo.scale.setScalar(1.8);flow.scale.setScalar(1.08);chargeRoot.add(orb,halo,flow);
 const ringMat=mat(S.TRAIL_VERT,`varying vec2 vUv;uniform vec3 uColor;uniform float uOpacity;void main(){float a=(.35+.65*sin(vUv.x*6.28318)*sin(vUv.x*6.28318))*uOpacity;gl_FragColor=vec4(uColor,a);}`,{uColor:color(cfg.midColor),uOpacity:f(0)});
 const rings=Array.from({length:3},(_,i)=>{const m=new T.Mesh(new T.TorusGeometry(1,.018,6,64,Math.PI*1.65),ringMat);chargeRoot.add(m);m.rotation.set(i*.8,i*.7,0);return m;});
 const particleMat=new T.MeshBasicMaterial({color:cfg.midColor,transparent:true,opacity:.7,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
 const particles=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),particleMat,80);particles.frustumCulled=false;group.add(particles);const dummy=new T.Object3D();
 const projectileMat=mat(S.PROJECTILE_VERT,S.PROJECTILE_FRAG,{uTime:f(0),uGradientSpeed:f(cfg.gradientSpeed),uColorA:color(cfg.rimColor),uColorB:color(cfg.coreColor),uColorC:color(cfg.midColor),uBandWidth:f(cfg.bandWidth),uTipY:f(1),uTailY:f(-1),uFresnelColor:color(cfg.midColor),uFresnelPower:f(2),uFresnelEmission:f(cfg.fresnel)});
 // Fade in the shader, rather than popping a projectile at the lifetime limit.
 projectileMat.fragmentShader=projectileMat.fragmentShader.replace('uniform float uTime;','uniform float uTime; uniform float uFade;').replace('vec4(col, 1.0)','vec4(col, uFade)');projectileMat.uniforms.uFade=f(1);
 projectileMat.side=T.FrontSide;projectileMat.blending=T.NormalBlending;
 // Rounded leading dome and a tapered tail, matching the reference profile.
 const profile=[new T.Vector2(0,-2.4),new T.Vector2(.4,-1.4),new T.Vector2(1,0)];
 for(let i=1;i<=12;i++){const a=i/12*Math.PI/2;profile.push(new T.Vector2(Math.cos(a),Math.sin(a)));}
 const shotGeometry=new T.LatheGeometry(profile,24);projectileMat.uniforms.uTailY.value=-2.4;
 const flashMat=mat(S.MUZZLE_VERT,S.MUZZLE_FRAG,{uColor:color(cfg.midColor),uEmission:f(0),uInnerRadius:f(0),uEdgeSoftness:f(.12),uNumRays:f(2),uRayWidth:f(.36),uRaySoftness:f(.12)});
 const flash=new T.Mesh(new T.PlaneGeometry(2,2),flashMat);group.add(flash);
 const shots=Array.from({length:MAX_SHOTS},()=>{
  const mesh=new T.Mesh(shotGeometry,projectileMat.clone());group.add(mesh);mesh.visible=false;mesh.name='sato-orbital-projectile';
  const pulseRings=Array.from({length:2},()=>{const ring=new T.Mesh(new T.TorusGeometry(1,.035,6,40),ringMat.clone());ring.rotation.x=Math.PI/2;mesh.add(ring);return ring;});
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(32*2*3),3));geometry.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(32*2*2),2));
  const indices=[];for(let i=0;i<31;i++)indices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);geometry.setIndex(indices);
  const trailMat=mat('varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',`varying vec2 vUv;uniform vec3 uColor;uniform float uOpacity;void main(){float edge=pow(max(0.,1.-abs(vUv.x*2.-1.)),1.4);gl_FragColor=vec4(uColor,edge*vUv.y*uOpacity);}`,{uColor:color(cfg.rimColor),uOpacity:f(cfg.trailOpacity)});
  const trail=new T.Mesh(geometry,trailMat);trail.frustumCulled=false;trail.visible=false;group.add(trail);
  return {mesh,trail,pulseRings,position:new T.Vector3(),velocity:new T.Vector3(),history:[],mu:1,age:99,life:0,strength:0,active:false};
 });
 const up=new T.Vector3(0,1,0),forward=new T.Vector3(0,0,1),origin=new T.Vector3(),muzzle=new T.Vector3(),right=new T.Vector3();
 let state='idle',charge=0,chargeTime=0,age=0,fireAge=99,recovery=0,strength=0,shotIndex=0,accumulator=0,waterCharge=0,waterVelocity=0,wake=0,channel=0,length=0,ready=false,previewing=false,pendingShot=false;
 const u=water.uniforms;
 function begin({preview=false}={}){if(state!=='idle')return false;previewing=preview;state='charging';chargeTime=0;charge=0;ready=false;onSound({type:'charge-start',volume:cfg.effectsVolume});return true;}
 function release(){if(state!=='charging')return;previewing=false;pendingShot=true;strength=.25+.75*charge;fireAge=0;state='firing';onSound({type:'blast',strength,volume:cfg.effectsVolume});}
 function cancel(){previewing=false;pendingShot=false;state='idle';charge=chargeTime=waterCharge=waterVelocity=wake=channel=length=0;fireAge=99;for(const p of shots){p.active=false;p.mesh.visible=p.trail.visible=false;}u.orbPowerCharge.value=u.orbPowerBeam.value=u.orbPowerLength.value=u.orbPowerWake.value=0;group.visible=false;onSound({type:'charge-stop'});onSound({type:'water-flow',strength:0});}
 function launch(){
  const p=shots[shotIndex++%MAX_SHOTS];p.position.copy(muzzle);const radius=p.position.length();
  const normal=p.position.clone().normalize(),tangent=forward.clone().addScaledVector(normal,-forward.dot(normal)).normalize();
  p.mu=cfg.gravity*radius*radius;p.velocity.copy(tangent).multiplyScalar(Math.sqrt(p.mu/radius)*cfg.speed).addScaledVector(normal,.08);
  p.age=0;p.life=cfg.lifetime;p.strength=strength;p.active=true;p.history=[p.position.clone()];channel=strength;wake=Math.max(wake,strength);length=.15;
  flash.position.copy(muzzle);flash.quaternion.setFromUnitVectors(Z,forward);
  water.emitRipple?.(origin,1+strength);
 }
 function updateShot(p,dt){
  if(!p.active)return;
  advanceProjectile(p,dt);
  const floor=surface?.sample(p.position.clone().normalize());
  if(p.age>=p.life||p.position.length()<(floor?.radius??1.79)+.012){p.active=false;p.mesh.visible=p.trail.visible=false;return;}
  p.history.unshift(p.position.clone());if(p.history.length>100)p.history.pop();
 }
 function renderShot(p){
  if(!p.active)return;
  const fade=Math.min(1,(p.life-p.age)/.5),r=cfg.radius*(.5+.5*p.strength)*(1+.035*Math.sin(age*16));
  p.mesh.visible=p.trail.visible=true;p.mesh.position.copy(p.position);p.mesh.quaternion.setFromUnitVectors(Y,p.velocity.clone().normalize());p.mesh.scale.setScalar(r*(.35+.65*fade));
  const q=p.mesh.material.uniforms;q.uTime.value=age;q.uFade.value=fade;q.uGradientSpeed.value=cfg.gradientSpeed;q.uBandWidth.value=cfg.bandWidth;q.uFresnelEmission.value=cfg.fresnel;q.uColorA.value.set(cfg.rimColor);q.uColorB.value.set(cfg.coreColor);q.uColorC.value.set(cfg.midColor);q.uFresnelColor.value.set(cfg.midColor);
  p.pulseRings.forEach((ring,i)=>{const phase=(p.age*3.7+i*.5)%1;ring.position.y=-phase*3;ring.scale.setScalar(.8+phase*.8);ring.material.uniforms.uOpacity.value=(1-phase)*.55*fade;ring.material.uniforms.uColor.value.set(cfg.midColor);});
  const g=p.trail.geometry,positions=g.attributes.position,uv=g.attributes.uv;
  const count=Math.min(p.history.length-1,Math.max(1,Math.round(cfg.trailLength/Math.max(.001,p.velocity.length()*STEP))));
  const side=new T.Vector3().crossVectors(p.position,p.velocity).normalize();
  for(let i=0;i<32;i++){const t=i/31,index=Math.min(p.history.length-1,Math.round(t*count)),center=p.history[index],width=r*(1-t)*.8;for(let j=0;j<2;j++){positions.setXYZ(i*2+j,center.x+side.x*width*(j*2-1),center.y+side.y*width*(j*2-1),center.z+side.z*width*(j*2-1));uv.setXY(i*2+j,j,1-t);}}
  positions.needsUpdate=uv.needsUpdate=true;p.trail.material.uniforms.uOpacity.value=cfg.trailOpacity*fade;p.trail.material.uniforms.uColor.value.set(cfg.midColor);
 }
 function update(dt,{position,heading,normal,muzzlePosition,reduced=false}={}){
  dt=Math.min(.05,Math.max(0,dt));age+=dt;
  if(state==='charging'||state==='firing'&&fireAge===0){origin.copy(position);up.copy(normal);forward.copy(heading);muzzle.copy(muzzlePosition);}
  if(state==='charging'){chargeTime+=dt;charge=Math.min(1,chargeTime/cfg.chargeTime);if(charge===1&&!ready){ready=true;onSound({type:'charge-ready',volume:cfg.effectsVolume});}if(!previewing&&chargeTime>=cfg.chargeTime+1.75)release();}
  if(state==='firing'){if(pendingShot){launch();pendingShot=false;}fireAge+=dt;if(fireAge>.28){state='recovering';recovery=0;}}
  else fireAge+=dt;
  if(state==='recovering'){recovery+=dt;if(recovery>.3){state='idle';charge=0;}}
  accumulator+=dt;while(accumulator>=STEP){for(const p of shots)updateShot(p,STEP);
   const target=state==='charging'?charge:0;
   waterVelocity+=((target-waterCharge)*65-waterVelocity*9)*STEP*cfg.waterSpeed;waterCharge+=waterVelocity*STEP*cfg.waterSpeed;
   accumulator-=STEP;
  }
  channel*=Math.exp(-dt*1.75*cfg.waterSpeed);wake=Math.max(wake*Math.exp(-dt*1.45*cfg.waterSpeed),Math.abs(waterVelocity)*.13);
  if(Math.abs(waterCharge)<.0001&&Math.abs(waterVelocity)<.001&&state==='idle')waterCharge=waterVelocity=0;
  if(wake<.0001)wake=0;if(channel<.0001)channel=0;
  if(channel>0)length=Math.min(3.4,length+dt*4.2);
  u.orbPowerUp.value.copy(up);u.orbPowerForward.value.copy(forward);u.orbPowerCharge.value=Math.max(0,waterCharge)*cfg.waterForce;u.orbPowerBeam.value=channel*cfg.waterForce;u.orbPowerLength.value=length;u.orbPowerWake.value=(wake+Math.max(0,-waterCharge)*2)*cfg.waterForce;u.orbPowerTime.value=age*cfg.waterSpeed;u.orbPowerWaves.value=cfg.waterWaves;
  onSound({type:'water-flow',strength:Math.min(1,(Math.abs(waterVelocity)*.15+channel*.6+wake*.4)*cfg.waterForce),volume:cfg.effectsVolume});
  onSound({type:'charge-level',strength:state==='charging'?charge:0,active:state==='charging',volume:cfg.effectsVolume});
  group.visible=state!=='idle'||shots.some(p=>p.active)||wake>0||channel>0||waterCharge!==0;
  chargeRoot.visible=particles.visible=state==='charging';
  chargeRoot.position.copy(muzzle);chargeRoot.scale.setScalar(cfg.orbSize*(.25+.75*charge)*(reduced?1:1+.025*Math.sin(age*23)));
  coreMat.uniforms.uProgress.value=glowMat.uniforms.uProgress.value=noiseMat.uniforms.uProgress.value=.3+.7*charge;coreMat.uniforms.uEmission.value=cfg.emission;coreMat.uniforms.uCoreColor.value.set(cfg.coreColor);coreMat.uniforms.uRimColor.value.set(cfg.rimColor);glowMat.uniforms.uColorInner.value.set(cfg.midColor);glowMat.uniforms.uColorOuter.value.set(cfg.rimColor);
  noiseMat.uniforms.uTime.value=age;noiseMat.uniforms.uNoiseScale.value=cfg.noiseScale;noiseMat.uniforms.uNoiseSpeed.value=reduced?cfg.noiseSpeed*.25:cfg.noiseSpeed;noiseMat.uniforms.uWarpStrength.value=cfg.warp;noiseMat.uniforms.uColor.value.set(cfg.midColor);
  ringMat.uniforms.uOpacity.value=charge*.65;ringMat.uniforms.uColor.value.set(cfg.midColor);rings.forEach((m,i)=>{m.rotation.set(i*.8+age*.5,i*.7+age*(i%2?-.7:.7),age*(i%2?1:-1));m.scale.setScalar(cfg.ringSize*(1+i*.15));});
  right.crossVectors(up,forward).normalize();particles.count=Math.round(cfg.particles);particleMat.color.set(cfg.midColor);
  for(let i=0;i<particles.count;i++){const t=(age*(reduced?.3:1.1)+i/80)%1,a=i*2.399+age*.7,r=(1-t)*(.25+charge*.2);dummy.position.copy(muzzle).addScaledVector(right,Math.cos(a)*r).addScaledVector(forward,Math.sin(a)*r).addScaledVector(up,Math.sin(a*1.7)*r);dummy.scale.setScalar(.006*Math.sin(t*Math.PI)*(.4+charge));dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);}particles.instanceMatrix.needsUpdate=true;
  flash.visible=fireAge<.25;const ft=Math.min(1,fireAge/.25);flash.scale.setScalar(cfg.muzzleSize*(.2+ft));flash.rotateZ(dt*9);flashMat.uniforms.uInnerRadius.value=ft;flashMat.uniforms.uEmission.value=(1-ft)*1.6;flashMat.uniforms.uColor.value.set(cfg.midColor);
  for(const p of shots)renderShot(p);
 }
 projectileMat.dispose();
 cancel();return {group,settings,shots,begin,release,cancel,update,get previewing(){return previewing;},get state(){return state;},get charge(){return charge;},get firing(){return state==='firing'?strength*(1-fireAge/.28):0;},get active(){return group.visible;},get locked(){return state==='charging'||state==='firing';}};
}
