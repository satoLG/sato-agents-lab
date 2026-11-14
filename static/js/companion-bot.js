import * as T from '../vendor/three.module.min.js';

// The home companion: a plain white ball with a curved black visor. Its eyes
// are drawn by a shader as a grid of blue LED dots, so they can sit anywhere
// on the visor, blink, glance around and morph between expressions without
// any extra geometry. Arms and the magnetic thruster keep the old rig layout.
const RADIUS=.54,VISOR={radius:.5465,width:2.2,height:1.22,lift:.04},GRID=[34,19];
const MOODS=['normal','happy','ouch','wide'];

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
 const {mesh,mat,geo,sphere,ring}=art;
 const bone=(parent,name,x,y,z)=>{const b=new T.Bone();b.name=name;b.position.set(x,y,z);parent.add(b);return b;};
 const root=new T.Group(),hips=bone(root,'hips',0,.54,0),spine=bone(hips,'spine',0,.66,0),head=bone(spine,'head',0,0,0);
 const rig={type:'robot',floating:true,root,hips,spine,head,arms:[],legs:[],eyes:[],move:0};
 const shell=mat('#f1f3f0',.06,.33),mechanism=mat('#344751',.82,.27);
 const ball=mesh(spine,geo('companion-ball',()=>new T.SphereGeometry(RADIUS,64,40)),shell);ball.name='companion-ball';
 const visorMaterial=new T.ShaderMaterial({vertexShader,fragmentShader,transparent:true,toneMapped:false,uniforms:{
  uGrid:{value:new T.Vector2(...GRID)},uSize:{value:new T.Vector2(VISOR.radius*VISOR.width,VISOR.radius*VISOR.height)},uLook:{value:new T.Vector2()},uSquash:{value:new T.Vector2(1,1)},
  uMood:{value:new T.Vector4(1,0,0,0)},uBlink:{value:0},uTalk:{value:0},uTime:{value:0},uPower:{value:0},uSep:{value:5.6},uLed:{value:new T.Color('#2aa8ff')}}});
 const visor=mesh(head,geo('companion-visor',()=>new T.SphereGeometry(VISOR.radius,56,28,Math.PI/2-VISOR.width/2,VISOR.width,Math.PI/2-VISOR.height/2-VISOR.lift,VISOR.height)),visorMaterial);
 visor.name='led-visor';visor.castShadow=false;
 rig.visor=visor;rig.face=createFace(visorMaterial,{reduced});
 for(const side of [-1,1]){
  const upper=bone(spine,side<0?'flipper_L':'flipper_R',side*.58,-.025,0);
  const shape=geo('smooth-flipper',()=>new T.LatheGeometry([
   new T.Vector2(0,-.77),new T.Vector2(.04,-.73),new T.Vector2(.075,-.63),new T.Vector2(.105,-.48),new T.Vector2(.125,-.30),new T.Vector2(.12,-.15),new T.Vector2(.09,-.035),new T.Vector2(.045,.02),new T.Vector2(0,.03)
  ],24));
  const flipper=mesh(upper,shape,shell);flipper.scale.z=.56;flipper.name='smooth-arm';
  rig.arms.push({upper,lower:bone(upper,'flipper-tip',0,-.77,0),side});
 }
 // Magnetic thruster: a dark core, a lit emitter ring and pulses that fall away.
 const base=sphere(spine,.2,mechanism,0,-.535,0,[1,.17,1]);base.name='magnetic-core';
 const emitter=ring(spine,.173,.009,new T.MeshBasicMaterial({color:'#65d5ff',toneMapped:false}),0,-.572,0,true);emitter.name='magnetic-emitter';
 rig.field=new T.Group();rig.field.name='magnetic-field';spine.add(rig.field);rig.flux=[];
 for(let i=0;i<3;i++){const pulse=ring(rig.field,.174,.006,new T.MeshBasicMaterial({color:'#65d5ff',transparent:true,opacity:0,depthWrite:false,toneMapped:false}),0,-.6,0,true);pulse.name=`magnetic-pulse-${i}`;pulse.castShadow=false;rig.flux.push(pulse);}
 root.rotation.y=Math.PI;
 return rig;
}

const damp=(a,b,dt,rate=6)=>a+(b-a)*(1-Math.exp(-rate*dt));
// Hover, bank into travel, idle arms and thruster pulses, then the LED face.
export function poseCompanion(rig,t,dt,{speed=0,travelAngle=0,talk=false,reduced=false,travel=null}={}){
 const move=Math.min(1,Math.max(0,speed)/2.2);rig.move=damp(rig.move,reduced?0:move,dt,10);
 rig.hips.position.y=.54+(reduced?0:Math.sin(t*1.65)*.035);rig.hips.rotation.set(0,0,0);
 // Bank state lives apart from the bone: scene sway and reactions add on top.
 const lean=rig.spine.userData;lean.pitch=damp(lean.pitch||0,Math.cos(travelAngle)*rig.move*.23,dt,8);lean.bank=damp(lean.bank||0,-Math.sin(travelAngle)*rig.move*.23,dt,8);
 rig.spine.rotation.x=lean.pitch;rig.spine.rotation.z=lean.bank;
 rig.spine.rotation.y=0;rig.head.rotation.set(0,0,0);
 for(const [i,pulse]of rig.flux.entries()){const p=reduced?(i+.5)/3:(t/1.7+i/3)%1;pulse.position.y=-.6-p*.5;pulse.scale.setScalar(1-.84*p);pulse.material.opacity=.65*Math.sin(Math.min(1,p/.12)*Math.PI/2)*Math.pow(1-p,1.4);}
 for(const {upper,lower,side}of rig.arms){const rest=rig.move>.01?0:1;upper.rotation.x=damp(upper.rotation.x,talk?-rest*.2:0,dt,10);upper.rotation.z=damp(upper.rotation.z,side*.2,dt,8);lower.rotation.set(0,0,0);}
 rig.face.update(dt,{talk,travel});
}
