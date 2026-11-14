import * as T from '../vendor/three.module.min.js';

// The home companion: a plain white ball with a curved black visor. Its eyes
// are drawn by a shader as a grid of blue LED cells, so they can sit anywhere
// on the visor, blink, glance around and morph between expressions without
// any extra geometry. Two small arms orbit the ball like moons; each one can
// sit anywhere around it, point any way, spin, and reshape between a ball and
// a long paddle.
const RADIUS=.54,VISOR={radius:.5465,width:2.2,height:1.22,lift:.04},GRID=[34,19];
export const GAZE_RANGE=[GRID[0]*.27,GRID[1]*.2];
const MOODS=['normal','happy','ouch','wide'];
const ORBIT=.76,v=(x,y,z)=>new T.Vector3(x,y,z).normalize();
const SIDES=[v(-1,-.25,.15),v(1,-.25,.15)];
// Arm styles. spots: orbit directions in body space (x right, y up, z towards
// the viewer). shape: 0 ball … 1 paddle. aim: where the long axis points
// ('hang' down, 'out' away from the ball, 'in', or a vector). reach scales the
// orbit radius; spin turns the arm on its own axis and tumble end over end
// (radians per second). A value may be a [left,right] pair.
const POSES={
 sides:{spots:SIDES},front:{spots:[v(-.55,-.5,.9),v(.55,-.5,.9)]},
 frontRight:{spots:[SIDES[0],v(.5,-.45,.95)]},frontLeft:{spots:[v(-.5,-.45,.95),SIDES[1]]},
 up:{spots:[v(-.75,.7,.25),v(.75,.7,.25)],aim:'out'},tuck:{spots:[v(-1,-.7,0),v(1,-.7,0)],shape:0},
 shy:{spots:[v(-.3,.1,1),v(.3,.1,1)]},back:{spots:[v(-.6,-.2,-.9),v(.6,-.2,-.9)]},
 high:{spots:[SIDES[0],v(.6,.85,.3)],aim:['hang','out']},
 point:{spots:[SIDES[0],v(.3,-.05,1)],aim:['hang','out'],reach:[1,1.3]},
 wings:{spots:[v(-1,.2,-.15),v(1,.2,-.15)],aim:'out',reach:1.15},
 moons:{spots:SIDES,shape:0},
 props:{spots:[v(-1,.05,0),v(1,.05,0)],aim:'out',tumble:[9,-9],reach:1.1},
};
const IDLE=['sides','sides','frontRight','frontLeft','front','back','high','point','wings','moons','props','wander','orbit','moonOrbit'];
const pick=(value,i,fallback)=>value===undefined?fallback:Array.isArray(value)?value[i]:value;

const vertexShader=`
varying vec2 vUv;varying vec3 vNormal;
void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragmentShader=`
uniform vec2 uGrid,uSize,uLook,uSquash;uniform vec4 uMood;uniform float uBlink,uTalk,uTime,uPower,uSep,uDrawing,uMimicBlend,uMimicFromBuiltin,uMimicToBuiltin;uniform sampler2D uMimicFrom,uMimicTo;uniform vec3 uLed;
varying vec2 vUv;varying vec3 vNormal;
float box(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
float segment(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.,1.));}
// One eye as a signed distance in LED cells; expressions blend their fields.
float eye(vec2 p,float side){
 p/=uSquash;
 float open=max(.32,(1.-uBlink));
 float normal=box(p,vec2(2.5,3.5*open),min(1.5,3.5*open));
 float wide=box(p,vec2(3.,4.4*open),min(2.,4.4*open));
 float happy=max(abs(length(p-vec2(0.,-2.4))-3.)-.8,-(p.y+.2));
 vec2 q=vec2(p.x*side,p.y);
 float ouch=min(segment(q,vec2(-2.,2.4),vec2(2.,0.)),segment(q,vec2(2.,0.),vec2(-2.,-2.4)))-.75;
 return normal*uMood.x+happy*uMood.y+ouch*uMood.z+wide*uMood.w;
}
float face(vec2 p){
 vec2 c=uGrid*.5+vec2(0.,.7)+uLook;
 float d=min(eye(p-c-vec2(-uSep,0.),-1.),eye(p-c-vec2(uSep,0.),1.));
 if(uTalk>.01){
  vec2 m=p-c-vec2(0.,-6.2);float column=floor(m.x+.5);
  float level=uTalk*(.6+1.4*abs(sin(uTime*13.+column*1.7)*sin(uTime*7.3+column*.9)));
  d=min(d,max(box(m,vec2(3.5,level),.4),abs(m.x)-3.5));
 }
 float fromDrawing=uMimicFromBuiltin>.5?d:(texture2D(uMimicFrom,clamp(p/uGrid,0.,1.)).r*255.-128.)/8.;
 float toDrawing=uMimicToBuiltin>.5?d:(texture2D(uMimicTo,clamp(p/uGrid,0.,1.)).r*255.-128.)/8.;
 return mix(d,mix(fromDrawing,toDrawing,uMimicBlend),uDrawing);
}
void main(){
 vec2 p=vUv*uGrid,cell=floor(p)+.5;
 vec2 local=(vUv-.5)*uSize;float edge=box(local,uSize*.5,.11);
 float alpha=1.-smoothstep(-.004,.002,edge);
 if(alpha<=0.)discard;
 float lit=step(face(cell),0.)*uPower;
 // Round LED dots; only when a cell shrinks under ~2 pixels it fills as a block.
 float solid=smoothstep(.5,.75,max(fwidth(p.x),fwidth(p.y)));
 float d=length(fract(p)-.5),core=mix(smoothstep(.40,.16,d),.8,solid),hot=mix(smoothstep(.22,0.,d),.3,solid);
 float glow=exp(-max(face(p),0.)*1.1)*.28*uPower*(1.-solid*.5);
 vec3 n=normalize(vNormal);
 float fresnel=pow(1.-max(n.z,0.),3.);
 float streak=smoothstep(.55,.62,n.y+n.x*.35)*smoothstep(.82,.66,n.y+n.x*.35)*.22;
 vec3 color=vec3(.012,.018,.026)+vec3(.13,.17,.2)*fresnel+vec3(streak);
 color+=vec3(.03,.06,.09)*mix(smoothstep(.34,.2,d),.4,solid);
 color+=uLed*(core*lit*1.5+glow)+vec3(.75,.9,1.)*hot*lit*.55;
 color+=vec3(.25,.3,.34)*smoothstep(.0,-.02,edge)*smoothstep(-.03,-.012,edge);
 gl_FragColor=vec4(color,alpha);
}`;

function createFace(material,{reduced}){
 const u=material.uniforms,weights=new Float32Array([1,0,0,0]);
 const state={gaze:new T.Vector2(),target:new T.Vector2(),velocity:new T.Vector2(),nextGlance:.8,nextBlink:2.2,blinkAt:-1,doubleBlink:false,mood:'normal',moodUntil:0,talk:0,power:0,squash:new T.Vector2(1,1),time:0,pointer:null};
 const range=new T.Vector2(...GAZE_RANGE);
 const blank=new Uint8Array(34*19*4).fill(255),makeMap=()=>{const map=new T.DataTexture(blank.slice(),34,19,T.RGBAFormat,T.UnsignedByteType);map.minFilter=map.magFilter=T.NearestFilter;map.generateMipmaps=false;map.colorSpace=T.NoColorSpace;map.needsUpdate=true;return map;};
 const maps=[makeMap(),makeMap()],previous=[null,null];u.uMimicFrom.value=maps[0];u.uMimicTo.value=maps[1];
 function draw(from,to,blend=0,weight=1){
  for(const [i,data]of [from,to].entries())if(data!==previous[i]){maps[i].image.data.set(data||blank);maps[i].needsUpdate=true;previous[i]=data;}
  u.uMimicFromBuiltin.value=from?0:1;u.uMimicToBuiltin.value=to?0:1;u.uMimicBlend.value=blend;u.uDrawing.value=weight;
 }
 function mood(kind,duration=0){if(!MOODS.includes(kind))kind='normal';state.mood=kind;state.moodUntil=duration?state.time+duration:0;}
 function blink(double=false){state.blinkAt=state.time;state.doubleBlink=double;}
 function look(x,y){state.pointer=x===null?null:new T.Vector2(x,y);}
 function update(dt,{talk=false,travel=null}={}){
  state.time+=dt;const t=state.time;
  if(state.moodUntil&&t>state.moodUntil)mood('normal');
  state.power=Math.min(1,state.power+dt*2.4);
  // Saccades: hold a point, then snap to a new one. A pointer pulls the gaze.
  if(t>=state.nextGlance){
   const wander=new T.Vector2((Math.random()*2-1)*range.x,(Math.random()*2-1)*range.y*.8);
   if(Math.random()<.18)wander.multiplyScalar(.15);
   state.target.copy(wander);state.nextGlance=t+.7+Math.random()*2.3;
  }
  const goal=state.target.clone();
  if(travel)goal.set(travel.x*range.x*.8,travel.y*range.y*.5);
  else if(state.pointer)goal.lerp(new T.Vector2(state.pointer.x*range.x,state.pointer.y*range.y),.82);
  if(reduced()){state.gaze.set(state.pointer?state.pointer.x*range.x:0,state.pointer?state.pointer.y*range.y:0);state.velocity.set(0,0);}
  else{
   // Critically damped spring: quick darts that settle without wobble.
   const k=170,c=2*Math.sqrt(k);const ax=k*(goal.x-state.gaze.x)-c*state.velocity.x,ay=k*(goal.y-state.gaze.y)-c*state.velocity.y;
   state.velocity.x+=ax*dt;state.velocity.y+=ay*dt;state.gaze.x+=state.velocity.x*dt;state.gaze.y+=state.velocity.y*dt;
  }
  // Squash along the motion so fast glances read as alive.
  const speed=Math.min(1,state.velocity.length()/40);state.squash.set(1+speed*.18,1-speed*.14);
  if(!reduced()&&t>=state.nextBlink){blink(Math.random()<.22);state.nextBlink=t+2+Math.random()*3.6;}
  let closed=0;
  if(state.blinkAt>=0){const age=t-state.blinkAt,span=.15;closed=age<span?Math.sin(age/span*Math.PI):state.doubleBlink&&age>.22&&age<.22+span?Math.sin((age-.22)/span*Math.PI):0;if(age>(state.doubleBlink?.4:span))state.blinkAt=-1;}
  state.talk+=((talk?1:0)-state.talk)*(1-Math.exp(-dt*10));
  const goalWeights=MOODS.map(kind=>kind===state.mood?1:0),ease=reduced()?1:1-Math.exp(-dt*11);
  for(let i=0;i<4;i++)weights[i]+=(goalWeights[i]-weights[i])*ease;
  u.uLook.value.copy(state.gaze);u.uBlink.value=state.mood==='happy'?0:closed;u.uSquash.value.copy(state.squash);
  u.uMood.value.set(weights[0],weights[1],weights[2],weights[3]);u.uTalk.value=state.talk;u.uTime.value=t;u.uPower.value=state.power;
 }
 return {update,mood,blink,look,draw,dispose(){maps.forEach(map=>map.dispose());},get gaze(){return state.gaze;},get expression(){return u.uDrawing.value>.01?'mimic':state.mood;},reset(){state.power=0;}};
}

// Chunky texels on the shell: a tiny grain map with nearest filtering.
function grainTexture(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const ctx=canvas.getContext('2d');let seed=7;
 for(let y=0;y<16;y++)for(let x=0;x<16;x++){seed=(seed*16807)%2147483647;const shade=232+Math.floor(seed/2147483647*4)*7;ctx.fillStyle=`rgb(${shade},${shade},${shade})`;ctx.fillRect(x,y,1,1);}
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(6,3);map.magFilter=T.NearestFilter;map.minFilter=T.LinearMipmapLinearFilter;return map;
}
// One arm mesh: a flat paddle whose morph target is a ball of the same vertex
// grid, so a single influence reshapes it smoothly.
function armGeometry(){
 const profile=[[0,-.77],[.04,-.73],[.075,-.63],[.105,-.48],[.125,-.30],[.12,-.15],[.09,-.035],[.045,.02],[0,.03]].map(([x,y])=>new T.Vector2(x,y));
 const segments=20,geometry=new T.LatheGeometry(profile,segments),position=geometry.attributes.position,normal=geometry.attributes.normal,rows=profile.length;
 const ball=new Float32Array(position.count*3),ballNormal=new Float32Array(position.count*3),scale=new T.Vector3(.5,.5,.28),n=new T.Vector3(),radius=.105;
 for(let i=0;i<position.count;i++){
  position.setXYZ(i,position.getX(i)*scale.x,position.getY(i)*scale.y+.185,position.getZ(i)*scale.z);
  n.set(normal.getX(i)/scale.x,normal.getY(i)/scale.y,normal.getZ(i)/scale.z).normalize();normal.setXYZ(i,n.x,n.y,n.z);
  const theta=Math.PI*(1-(i%rows)/(rows-1)),phi=Math.floor(i/rows)/segments*Math.PI*2;
  n.set(Math.sin(theta)*Math.sin(phi),Math.cos(theta),Math.sin(theta)*Math.cos(phi));
  ball.set([n.x*radius,n.y*radius,n.z*radius],i*3);ballNormal.set([n.x,n.y,n.z],i*3);
 }
 geometry.morphAttributes.position=[new T.Float32BufferAttribute(ball,3)];geometry.morphAttributes.normal=[new T.Float32BufferAttribute(ballNormal,3)];
 geometry.computeBoundingSphere();return geometry;
}

export function createCompanionBot(art,{reduced=()=>false}={}){
 const {mesh,geo}=art;
 const bone=(parent,name,x,y,z)=>{const b=new T.Bone();b.name=name;b.position.set(x,y,z);parent.add(b);return b;};
 const root=new T.Group(),hips=bone(root,'hips',0,.54,0),spine=bone(hips,'spine',0,.66,0),head=bone(spine,'head',0,0,0);
 const rig={type:'robot',floating:true,root,hips,spine,head,arms:[],legs:[],eyes:[],move:0};
 const shell=new T.MeshStandardMaterial({color:'#f4f6f3',metalness:.06,roughness:.33,map:grainTexture()});
 const ball=mesh(spine,geo('companion-ball',()=>new T.SphereGeometry(RADIUS,32,20)),shell);ball.name='companion-ball';
 const visorMaterial=new T.ShaderMaterial({vertexShader,fragmentShader,transparent:true,toneMapped:false,uniforms:{
  uGrid:{value:new T.Vector2(...GRID)},uSize:{value:new T.Vector2(VISOR.radius*VISOR.width,VISOR.radius*VISOR.height)},uLook:{value:new T.Vector2()},uSquash:{value:new T.Vector2(1,1)},
  uMood:{value:new T.Vector4(1,0,0,0)},uBlink:{value:0},uTalk:{value:0},uTime:{value:0},uPower:{value:0},uSep:{value:5.6},uDrawing:{value:0},uMimicFrom:{value:null},uMimicTo:{value:null},uMimicBlend:{value:0},uMimicFromBuiltin:{value:1},uMimicToBuiltin:{value:1},uLed:{value:new T.Color('#2aa8ff')}}});
 const visor=mesh(head,geo('companion-visor',()=>new T.SphereGeometry(VISOR.radius,40,20,Math.PI/2-VISOR.width/2,VISOR.width,Math.PI/2-VISOR.height/2-VISOR.lift,VISOR.height)),visorMaterial);
 visor.name='led-visor';visor.castShadow=false;
 rig.visor=visor;rig.face=createFace(visorMaterial,{reduced});
 const shape=geo('morphing-arm',armGeometry);
 for(const side of [-1,1]){
  const upper=bone(spine,side<0?'moon_L':'moon_R',0,0,0),lower=bone(upper,'moon',side*ORBIT,0,0);
  const arm=mesh(lower,shape,shell);arm.name='smooth-arm';arm.morphTargetInfluences[0]=0;
  const rest=SIDES[side<0?0:1].clone();
  rig.arms.push({upper,lower,mesh:arm,side,rest,dir:rest.clone(),target:rest.clone(),travel:0,phase:side<0?1.7:0,
   shape:1,shapeGoal:1,lengthGoal:1,widthGoal:1,twistGoal:0,poseTwist:0,reach:1,reachGoal:1,aim:'hang',axis:new T.Vector3(0,-1,0),spin:0,spinAngle:0,tumble:0,tumbleAngle:0});
 }
 rig.motion={pose:'sides',gesture:null,until:0,next:2.5,clock:0};
 // A named style or gesture, optionally for a limited time.
 rig.gesture=(name,duration=0)=>{const m=rig.motion;if(POSES[name]){m.pose=name;m.gesture=null;}else{m.gesture=name;m.gestureAt=m.clock;}m.until=duration?m.clock+duration:0;m.next=m.clock+(duration||0)+2.5+Math.random()*4;};
 // Free control of one arm ('left', 'right', 0, 1) or 'both':
 // {spot, shape, aim, reach, spin, tumble}; omitted fields keep their value.
 rig.setArms=(which,{spot,shape,aim,reach,spin,tumble,length,width,twist}={},duration=0)=>{
  const m=rig.motion;m.pose='free';m.gesture=null;m.until=duration?m.clock+duration:0;m.next=m.clock+(duration||1e9);
  for(const [i,arm]of rig.arms.entries()){
   if(!(which==='both'||which===i||which===(i?'right':'left')))continue;
   if(spot)arm.target.copy(spot.isVector3?spot:new T.Vector3(...spot)).normalize();
   if(shape!==undefined)arm.shapeGoal=shape;if(aim!==undefined)arm.aim=Array.isArray(aim)?new T.Vector3(...aim):aim;if(reach!==undefined)arm.reachGoal=reach;if(spin!==undefined)arm.spin=spin;if(tumble!==undefined)arm.tumble=tumble;if(length!==undefined)arm.lengthGoal=length;if(width!==undefined)arm.widthGoal=width;if(twist!==undefined)arm.twistGoal=twist;
  }
 };
 rig.armStyles=Object.keys(POSES);
 root.rotation.y=Math.PI;
 return rig;
}

const damp=(a,b,dt,rate=6)=>a+(b-a)*(1-Math.exp(-rate*dt));
const randomSpot=avoid=>{for(let i=0;i<12;i++){const d=v(Math.random()*2-1,Math.random()*1.3-.65,Math.random()*2-1);if(!(d.z>.55&&Math.abs(d.x)<.45&&d.y>-.35)&&(!avoid||d.angleTo(avoid)>.9))return d;}return SIDES[1].clone();};
const turn=new T.Quaternion(),aim=new T.Quaternion(),twist=new T.Quaternion(),down=new T.Vector3(0,-1,0),up=new T.Vector3(0,1,0),axis=new T.Vector3(),goalAxis=new T.Vector3(),wobble=new T.Euler();
const unwind=(angle,dt)=>{const rest=Math.round(angle/(Math.PI*2))*Math.PI*2;return rest+(angle-rest)*Math.exp(-dt*7);};
function moveArms(rig,dt,{talk,reduced,moving}){
 const m=rig.motion;m.clock+=dt;const t=m.clock;
 if(m.until&&t>m.until){m.until=0;m.gesture=null;m.pose='sides';}
 // Idle: every few seconds pick a new arrangement, sometimes free spots.
 if(!reduced&&!moving&&!m.gesture&&!m.until&&t>m.next){
  const choice=IDLE[Math.floor(Math.random()*IDLE.length)];
  if(choice==='wander'){m.pose='wander';for(const arm of rig.arms){arm.target.copy(randomSpot(arm.side<0?rig.arms[1].target:rig.arms[0].target));arm.shapeGoal=Math.random()<.35?0:1;arm.aim=Math.random()<.4?'out':'hang';arm.reachGoal=.95+Math.random()*.35;arm.spin=arm.tumble=0;}}
  else if(choice==='orbit'||choice==='moonOrbit'){m.pose=choice==='orbit'?'sides':'moons';m.gesture='orbit';m.gestureAt=t;m.until=t+3.4;}
  else m.pose=choice;
  m.next=t+3.5+Math.random()*4.5;
 }
 if(moving&&!m.gesture&&m.pose!=='free')m.pose='sides';
 for(const [i,arm]of rig.arms.entries()){
  const g=m.gesture,age=t-(m.gestureAt||0),style=POSES[m.pose];
  if(style){arm.lengthGoal=arm.widthGoal=1;arm.twistGoal=0;arm.target.copy(style.spots[i]);arm.shapeGoal=pick(style.shape,i,1);arm.aim=pick(style.aim,i,'hang');arm.reachGoal=pick(style.reach,i,1);arm.spin=pick(style.spin,i,0);arm.tumble=pick(style.tumble,i,0);}
  let goal=arm.target,rate=reduced?60:4.2,shape=arm.shapeGoal,pointing=arm.aim,tumble=arm.tumble,reach=arm.reachGoal;
  if(g==='wave'&&arm.side>0){goal=v(.62+Math.sin(age*9)*.32,.75,.35);rate=12;pointing='out';shape=1;}
  else if(g==='wave'){goal=SIDES[0];}
  else if(g==='dance'||g==='orbit'){
   const dance=g==='dance',speed=dance?5:2.2,length=(m.until||t+1)-(m.gestureAt||0),settle=Math.min(1,Math.max(0,(age-(length-.7))/.6)),eased=settle*settle*(3-2*settle),angle=age*speed+(arm.side<0?Math.PI:0);
   goal=v(Math.cos(angle),.25*Math.sin(age*3+arm.phase),Math.sin(angle)).lerp(arm.rest,eased).normalize();rate=dance?18:9;
   // Dancing arms pulse between ball and paddle and tumble as they fly.
   if(dance){shape=settle>0?1:.5+.5*Math.sin(age*6+arm.phase);tumble=settle>0?0:arm.side*8;reach=1.1;pointing='out';}
  }
  // Slerp the orbit direction towards its goal; talking adds small loops.
  const before=arm.dir.clone();aim.setFromUnitVectors(arm.dir,goal);turn.identity().slerp(aim,1-Math.exp(-dt*rate));arm.dir.applyQuaternion(turn).normalize();
  arm.travel+=before.angleTo(arm.dir);
  const loop=reduced?0:talk?.22:.07;wobble.set(Math.sin(t*1.3+arm.phase)*loop,Math.sin(t*1.7+arm.phase*2)*loop,0);
  const dir=arm.dir.clone().applyEuler(wobble).normalize(),ease=reduced?1:1-Math.exp(-dt*8);
  arm.shape+=(shape-arm.shape)*ease;arm.reach+=(reach-arm.reach)*ease;arm.mesh.morphTargetInfluences[0]=1-arm.shape;
  arm.mesh.scale.y=damp(arm.mesh.scale.y,arm.lengthGoal,dt,9);arm.mesh.scale.x=arm.mesh.scale.z=damp(arm.mesh.scale.x,arm.widthGoal,dt,9);arm.poseTwist=damp(arm.poseTwist,arm.twistGoal,dt,9);
  arm.upper.quaternion.setFromUnitVectors(axis.set(arm.side,0,0),dir);arm.lower.position.x=arm.side*ORBIT*arm.reach;
  // Long axis: hanging arms tip a little away from the ball.
  if(pointing==='out')goalAxis.copy(dir);else if(pointing==='in')goalAxis.copy(dir).negate();else if(pointing?.isVector3)goalAxis.copy(pointing).normalize();else goalAxis.copy(dir).multiplyScalar(.45).add(down).normalize();
  aim.setFromUnitVectors(arm.axis,goalAxis);turn.identity().slerp(aim,ease);arm.axis.applyQuaternion(turn).normalize();
  arm.spinAngle=arm.spin&&!reduced?arm.spinAngle+arm.spin*dt:unwind(arm.spinAngle,dt);arm.tumbleAngle=tumble&&!reduced?arm.tumbleAngle+tumble*dt:unwind(arm.tumbleAngle,dt);
  // Body-space orientation: tumble about the orbit direction, aim, then spin.
  twist.setFromAxisAngle(dir,arm.tumbleAngle).multiply(aim.setFromUnitVectors(down,arm.axis)).multiply(turn.setFromAxisAngle(up,arm.spinAngle+arm.poseTwist));
  arm.lower.quaternion.copy(arm.upper.quaternion).invert().multiply(twist);
 }
}
// Hover, bank into travel, orbiting arms, then the LED face.
export function poseCompanion(rig,t,dt,{speed=0,travelAngle=0,talk=false,reduced=false,travel=null}={}){
 const move=Math.min(1,Math.max(0,speed)/2.2);rig.move=damp(rig.move,reduced?0:move,dt,10);
 rig.hips.position.y=.54+(reduced?0:Math.sin(t*1.65)*.035);rig.hips.rotation.set(0,0,0);
 // Bank state lives apart from the bone: scene sway and reactions add on top.
 const lean=rig.spine.userData;lean.pitch=damp(lean.pitch||0,Math.cos(travelAngle)*rig.move*.23,dt,8);lean.bank=damp(lean.bank||0,-Math.sin(travelAngle)*rig.move*.23,dt,8);
 rig.spine.rotation.x=lean.pitch;rig.spine.rotation.z=lean.bank;
 rig.spine.rotation.y=0;rig.head.rotation.set(0,0,0);
 moveArms(rig,dt,{talk,reduced,moving:rig.move>.05});
 rig.face.update(dt,{talk,travel});
}
