import * as T from '../vendor/three.module.min.js';

// The home companion: a plain white ball with a curved black visor. Its eyes
// are drawn by a shader as a grid of blue LED dots, so they can sit anywhere
// on the visor, blink, glance around and morph between expressions without
// any extra geometry. Two half-size paddle arms orbit the ball like moons.
const RADIUS=.54,VISOR={radius:.5465,width:2.2,height:1.22,lift:.04},GRID=[34,19];
const MOODS=['normal','happy','ouch','wide'];
const ORBIT=.76,v=(x,y,z)=>new T.Vector3(x,y,z).normalize();
// Arm spots as directions in body space: x right, y up, z towards the viewer.
const POSES={
 sides:[v(-1,-.25,.15),v(1,-.25,.15)],front:[v(-.55,-.5,.9),v(.55,-.5,.9)],
 frontRight:[v(-1,-.25,.15),v(.5,-.45,.95)],frontLeft:[v(-.5,-.45,.95),v(1,-.25,.15)],
 up:[v(-.75,.7,.25),v(.75,.7,.25)],tuck:[v(-1,-.7,0),v(1,-.7,0)],shy:[v(-.3,.1,1),v(.3,.1,1)],
 back:[v(-.6,-.2,-.9),v(.6,-.2,-.9)],high:[v(-1,-.25,.15),v(.6,.85,.3)],
};
const IDLE=['sides','sides','frontRight','frontLeft','front','back','high','wander','orbit'];

const vertexShader=`
varying vec2 vUv;varying vec3 vNormal;
void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragmentShader=`
uniform vec2 uGrid,uSize,uLook,uSquash;uniform vec4 uMood;uniform float uBlink,uTalk,uTime,uPower,uSep;uniform vec3 uLed;
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
 return d;
}
void main(){
 vec2 p=vUv*uGrid,cell=floor(p)+.5;
 vec2 local=(vUv-.5)*uSize;float edge=box(local,uSize*.5,.11);
 float alpha=1.-smoothstep(-.004,.002,edge);
 if(alpha<=0.)discard;
 float lit=step(face(cell),0.)*uPower;
 float d=length(fract(p)-.5),core=smoothstep(.40,.16,d),hot=smoothstep(.22,0.,d);
 float glow=exp(-max(face(p),0.)*1.1)*.28*uPower;
 vec3 n=normalize(vNormal);
 float fresnel=pow(1.-max(n.z,0.),3.);
 float streak=smoothstep(.55,.62,n.y+n.x*.35)*smoothstep(.82,.66,n.y+n.x*.35)*.22;
 vec3 color=vec3(.012,.018,.026)+vec3(.13,.17,.2)*fresnel+vec3(streak);
 color+=vec3(.03,.06,.09)*smoothstep(.34,.2,d);
 color+=uLed*(core*lit*1.5+glow)+vec3(.75,.9,1.)*hot*lit*.55;
 color+=vec3(.25,.3,.34)*smoothstep(.0,-.02,edge)*smoothstep(-.03,-.012,edge);
 gl_FragColor=vec4(color,alpha);
}`;

function createFace(material,{reduced}){
 const u=material.uniforms,weights=new Float32Array([1,0,0,0]);
 const state={gaze:new T.Vector2(),target:new T.Vector2(),velocity:new T.Vector2(),nextGlance:.8,nextBlink:2.2,blinkAt:-1,doubleBlink:false,mood:'normal',moodUntil:0,talk:0,power:0,squash:new T.Vector2(1,1),time:0,pointer:null};
 const range=new T.Vector2(GRID[0]*.27,GRID[1]*.2);
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
 return {update,mood,blink,look,get gaze(){return state.gaze;},get expression(){return state.mood;},reset(){state.power=0;}};
}

export function createCompanionBot(art,{reduced=()=>false}={}){
 const {mesh,mat,geo}=art;
 const bone=(parent,name,x,y,z)=>{const b=new T.Bone();b.name=name;b.position.set(x,y,z);parent.add(b);return b;};
 const root=new T.Group(),hips=bone(root,'hips',0,.54,0),spine=bone(hips,'spine',0,.66,0),head=bone(spine,'head',0,0,0);
 const rig={type:'robot',floating:true,root,hips,spine,head,arms:[],legs:[],eyes:[],move:0};
 const shell=mat('#f1f3f0',.06,.33);
 const ball=mesh(spine,geo('companion-ball',()=>new T.SphereGeometry(RADIUS,64,40)),shell);ball.name='companion-ball';
 const visorMaterial=new T.ShaderMaterial({vertexShader,fragmentShader,transparent:true,toneMapped:false,uniforms:{
  uGrid:{value:new T.Vector2(...GRID)},uSize:{value:new T.Vector2(VISOR.radius*VISOR.width,VISOR.radius*VISOR.height)},uLook:{value:new T.Vector2()},uSquash:{value:new T.Vector2(1,1)},
  uMood:{value:new T.Vector4(1,0,0,0)},uBlink:{value:0},uTalk:{value:0},uTime:{value:0},uPower:{value:0},uSep:{value:5.6},uLed:{value:new T.Color('#2aa8ff')}}});
 const visor=mesh(head,geo('companion-visor',()=>new T.SphereGeometry(VISOR.radius,56,28,Math.PI/2-VISOR.width/2,VISOR.width,Math.PI/2-VISOR.height/2-VISOR.lift,VISOR.height)),visorMaterial);
 visor.name='led-visor';visor.castShadow=false;
 rig.visor=visor;rig.face=createFace(visorMaterial,{reduced});
 // Arms are half-size paddles that orbit the ball like moons: each keeps a
 // direction on a sphere around the body and glides to new spots freely.
 const shape=geo('smooth-flipper',()=>new T.LatheGeometry([
  new T.Vector2(0,-.77),new T.Vector2(.04,-.73),new T.Vector2(.075,-.63),new T.Vector2(.105,-.48),new T.Vector2(.125,-.30),new T.Vector2(.12,-.15),new T.Vector2(.09,-.035),new T.Vector2(.045,.02),new T.Vector2(0,.03)
 ],24));
 for(const side of [-1,1]){
  const upper=bone(spine,side<0?'moon_L':'moon_R',0,0,0),lower=bone(upper,'moon',side*ORBIT,0,0);
  const flipper=mesh(lower,shape,shell);flipper.scale.set(.5,.5,.28);flipper.position.y=.185;flipper.name='smooth-arm';
  const rest=POSES.sides[side<0?0:1].clone();
  rig.arms.push({upper,lower,side,rest,dir:rest.clone(),target:rest.clone(),travel:0,phase:side<0?1.7:0});
 }
 rig.motion={pose:'sides',gesture:null,until:0,next:2.5,clock:0};
 rig.gesture=(name,duration=0)=>{const m=rig.motion;if(POSES[name]){m.pose=name;m.gesture=null;m.until=duration?m.clock+duration:0;}else{m.gesture=name;m.gestureAt=m.clock;m.until=duration?m.clock+duration:0;}m.next=m.clock+(duration||0)+2.5+Math.random()*4;};
 root.rotation.y=Math.PI;
 return rig;
}

const damp=(a,b,dt,rate=6)=>a+(b-a)*(1-Math.exp(-rate*dt));
const randomSpot=avoid=>{for(let i=0;i<12;i++){const d=v(Math.random()*2-1,Math.random()*1.3-.65,Math.random()*2-1);if(!(d.z>.55&&Math.abs(d.x)<.45&&d.y>-.35)&&(!avoid||d.angleTo(avoid)>.9))return d;}return POSES.sides[1].clone();};
const spin=new T.Quaternion(),aim=new T.Quaternion(),down=new T.Vector3(0,-1,0),axis=new T.Vector3(),hang=new T.Vector3(),wobble=new T.Euler();
function moveArms(rig,dt,{talk,reduced,moving}){
 const m=rig.motion;m.clock+=dt;const t=m.clock;
 if(m.until&&t>m.until){m.until=0;m.gesture=null;m.pose='sides';}
 // Idle: every few seconds pick a new arrangement, sometimes free spots.
 if(!reduced&&!moving&&!m.gesture&&!m.until&&t>m.next){
  const choice=IDLE[Math.floor(Math.random()*IDLE.length)];
  if(choice==='wander'){m.pose='wander';for(const arm of rig.arms)arm.target.copy(randomSpot(arm.side<0?rig.arms[1].target:rig.arms[0].target));}
  else if(choice==='orbit'){m.gesture='orbit';m.gestureAt=t;m.until=t+3.2;}
  else m.pose=choice;
  m.next=t+3.5+Math.random()*4.5;
 }
 if(moving&&!m.gesture)m.pose='sides';
 for(const [i,arm]of rig.arms.entries()){
  const g=m.gesture,age=t-(m.gestureAt||0);
  if(m.pose!=='wander'&&POSES[m.pose])arm.target.copy(POSES[m.pose][i]);
  let goal=arm.target,rate=reduced?60:4.2;
  if(g==='wave'&&arm.side>0){goal=v(.62+Math.sin(age*9)*.32,.75,.35);rate=12;}
  else if(g==='wave'){goal=POSES.sides[0];}
  else if(g==='dance'||g==='orbit'){
   const speed=g==='dance'?5:2.2,length=(m.until||t+1)-(m.gestureAt||0),settle=Math.min(1,Math.max(0,(age-(length-.7))/.6)),angle=age*speed+(arm.side<0?Math.PI:0);
   goal=v(Math.cos(angle),.25*Math.sin(age*3+arm.phase),Math.sin(angle)).lerp(arm.rest,settle*settle*(3-2*settle)).normalize();rate=g==='dance'?18:9;
  }
  // Slerp the orbit direction towards its goal; talking adds small loops.
  const before=arm.dir.clone();aim.setFromUnitVectors(arm.dir,goal);spin.identity().slerp(aim,1-Math.exp(-dt*rate));arm.dir.applyQuaternion(spin).normalize();
  arm.travel+=before.angleTo(arm.dir);
  const loop=reduced?0:talk?.22:.07;wobble.set(Math.sin(t*1.3+arm.phase)*loop,Math.sin(t*1.7+arm.phase*2)*loop,0);
  const dir=arm.dir.clone().applyEuler(wobble).normalize();
  arm.upper.quaternion.setFromUnitVectors(axis.set(arm.side,0,0),dir);
  // The paddle hangs mostly down, tipped a little away from the ball.
  hang.copy(dir).multiplyScalar(.45).add(down).normalize();
  arm.lower.quaternion.copy(arm.upper.quaternion).invert().multiply(aim.setFromUnitVectors(down,hang));
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
