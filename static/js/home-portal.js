import * as T from '../vendor/three.module.min.js';

// A rift "in the matrix" behind the companion. The scene draws the next
// scenario first; this mask then writes depth only inside the rift, so the
// current scenario covers everything except that hole. No render target and
// no stencil: the view through the rift is the real next world, lit as it
// will be after the crossing.
const CELL='.13';
const shape=`
uniform float uOpen,uTime,uTear;
varying vec2 vPlane;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
// Edge of the rift in plane metres, in blocks: negative inside. It starts as
// a wide slit, tears open vertically, then grows past the screen.
float rift(vec2 p){
 float row=floor(p.y/.21),tick=floor(uTime*14.);
 p.x+=(hash(vec2(row,tick))-.5)*.7*uTear*step(.72,hash(vec2(row*3.1+7.,tick)));
 vec2 cell=(floor(p/${CELL})+.5)*${CELL};
 vec2 radius=vec2(1.22*min(uOpen*2.4,max(1.,uOpen)),1.66*(uOpen<1.?uOpen*uOpen:uOpen))+1e-4;
 float jitter=(hash(cell*7.31+floor(uTime*9.))-.5)*.2;
 return length(cell/radius)+jitter-1.;
}`;
const planeVertex='varying vec2 vPlane;void main(){vPlane=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const screenVertex='void main(){gl_Position=vec4(position.xy,.99999,1.);}';
const GREEN='vec3(.2,1.,.55)',CYAN='vec3(.45,.9,1.)';

export function createPortal(world){
 const uniforms={uOpen:{value:0},uTime:{value:0},uTear:{value:0},uGlow:{value:1}};
 const group=new T.Group();group.name='scenario-portal';group.visible=false;world.add(group);
 const plane=new T.PlaneGeometry(70,70);
 const mask=new T.Mesh(plane,new T.ShaderMaterial({uniforms,vertexShader:planeVertex,fragmentShader:shape+'void main(){if(rift(vPlane)>0.)discard;gl_FragColor=vec4(0.);}',colorWrite:false}));
 mask.name='portal-mask';mask.renderOrder=-1000;group.add(mask);
 // Flickering blocks around the edge and code rain falling beside it.
 const rim=new T.Mesh(plane,new T.ShaderMaterial({uniforms,vertexShader:planeVertex,transparent:true,depthWrite:false,blending:T.AdditiveBlending,premultipliedAlpha:true,toneMapped:false,fragmentShader:shape+`
uniform float uGlow;
void main(){
 float h=rift(vPlane);vec2 cell=floor(vPlane/${CELL});
 float flick=hash(cell+floor(uTime*18.));
 float edge=smoothstep(.34,0.,h)*step(0.,h),inner=smoothstep(-.16,0.,h)*step(h,0.)*.35;
 float column=cell.x,speed=1.+hash(vec2(column,3.))*2.2;
 float head=fract((cell.y+.5)*${CELL}*.28+uTime*speed*.55+hash(vec2(column,9.)));
 float rain=pow(head,7.)*smoothstep(1.3,.1,h)*step(0.,h)*step(.35,hash(vec2(column,floor(uTime*2.))));
 float a=(edge*(.35+.65*flick)+inner*flick+rain*.9)*uGlow;
 vec3 color=mix(mix(${GREEN},${CYAN},flick),vec3(1.),edge*edge*.7);
 gl_FragColor=vec4(color*a,a);
}`}));
 rim.name='portal-rim';rim.position.z=.02;rim.renderOrder=20;group.add(rim);
 const screen=new T.BufferGeometry();screen.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
 // The default scenario has no backdrop: outside the rift this clears the
 // next world back to the transparent page behind the canvas.
 const eraser=new T.Mesh(screen,new T.ShaderMaterial({vertexShader:screenVertex,fragmentShader:'void main(){gl_FragColor=vec4(0.);}',blending:T.NoBlending,depthWrite:false,toneMapped:false}));
 eraser.name='portal-eraser';eraser.frustumCulled=false;eraser.renderOrder=-999;eraser.visible=false;world.add(eraser);
 // Screen-wide block noise and torn rows, used as a flash on the crossing.
 const flash={uFlash:{value:0},uTime:uniforms.uTime};
 const glitch=new T.Mesh(screen,new T.ShaderMaterial({uniforms:flash,vertexShader:screenVertex,transparent:true,depthTest:false,depthWrite:false,blending:T.AdditiveBlending,premultipliedAlpha:true,toneMapped:false,fragmentShader:`
uniform float uFlash,uTime;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec2 f=gl_FragCoord.xy;float row=floor(f.y/5.),tick=floor(uTime*20.);
 f.x+=(hash(vec2(row,tick))-.5)*48.;vec2 cell=floor(f/vec2(6.,3.));
 float on=step(1.-uFlash*.2,hash(cell+tick*1.3)),bar=step(.97-uFlash*.12,hash(vec2(row,tick+5.)));
 float a=uFlash*(on*.55+bar*.22);
 gl_FragColor=vec4(mix(${GREEN},${CYAN},hash(cell*1.7))*a,a);
}`}));
 glitch.name='portal-glitch';glitch.frustumCulled=false;glitch.renderOrder=999;glitch.visible=false;world.add(glitch);
 return {group,eraser,glitch,
  place(x,y,z,yaw){group.position.set(x,y,z);group.rotation.set(0,yaw,0);},
  set({open,time,tear,glow=1}){uniforms.uOpen.value=open;uniforms.uTime.value=time;uniforms.uTear.value=tear;uniforms.uGlow.value=glow;},
  set flash(value){flash.uFlash.value=value;glitch.visible=value>.001;},get flash(){return flash.uFlash.value;},
 };
}
