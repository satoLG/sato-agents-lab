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
 const uniforms={uOpen:{value:0},uTime:{value:0},uTear:{value:0},uGlow:{value:1},uFloor:{value:-1e3}};
 const group=new T.Group();group.name='scenario-portal';group.visible=false;world.add(group);
 const plane=new T.PlaneGeometry(70,70);
 const mask=new T.Mesh(plane,new T.ShaderMaterial({uniforms,vertexShader:planeVertex,fragmentShader:shape+'void main(){if(rift(vPlane)>0.)discard;gl_FragColor=vec4(0.);}',colorWrite:false}));
 mask.name='portal-mask';mask.renderOrder=-1000;group.add(mask);
 // Flickering blocks around the edge and code rain falling beside it.
 const rim=new T.Mesh(plane,new T.ShaderMaterial({uniforms,vertexShader:planeVertex,transparent:true,depthWrite:false,blending:T.AdditiveBlending,premultipliedAlpha:true,toneMapped:false,fragmentShader:shape+`
uniform float uGlow,uFloor;
void main(){
 // Nothing glows below the ground: once the ground in front gives way, that
 // part of the edge would otherwise show through.
 if(vPlane.y<uFloor)discard;
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
 // The reveal's outline (see home-scene.js): on the ground, flickering blocks
 // around a bright core line; above it, a low curtain of code rain, so the
 // cut through the world being left reads as the rift's own edge. Cells are
 // in world metres, so every segment shares one material per kind.
 const seamVertex='varying vec2 vUv;varying vec3 vWorld;varying float vAlong;void main(){vUv=uv;vAlong=uv.x*length(modelMatrix[0].xyz);vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}';
 const seamCommon=`uniform float uTime,uGlow;varying vec2 vUv;varying vec3 vWorld;varying float vAlong;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`;
 const seamOptions={uniforms:{uTime:uniforms.uTime,uGlow:uniforms.uGlow},vertexShader:seamVertex,transparent:true,depthWrite:false,blending:T.AdditiveBlending,premultipliedAlpha:true,toneMapped:false,side:T.DoubleSide};
 const groundSeam=new T.ShaderMaterial({...seamOptions,fragmentShader:seamCommon+`
void main(){
 vec2 cell=floor(vWorld.xz/${CELL});
 float flick=hash(cell+floor(uTime*18.)),line=1.-abs(vUv.y-.5)*2.;
 float core=pow(line,8.),blocks=step(.45,flick)*smoothstep(0.,.7,line)*step(.3,hash(cell*1.9+floor(uTime*6.)));
 float a=(core*.9+blocks*.55*line)*uGlow;
 vec3 color=mix(mix(${GREEN},${CYAN},flick),vec3(1.),core*.6);
 gl_FragColor=vec4(color*a,a);
}`});
 const curtainSeam=new T.ShaderMaterial({...seamOptions,fragmentShader:seamCommon+`
void main(){
 float column=floor(vAlong/${CELL}),row=floor(vWorld.y/${CELL});
 float flick=hash(vec2(column,row)+floor(uTime*18.)),speed=1.+hash(vec2(column,3.))*2.2;
 float head=fract(-vWorld.y*.28+uTime*speed*.55+hash(vec2(column,9.)));
 float rain=pow(head,7.)*step(.4,hash(vec2(column,floor(uTime*2.))));
 float base=step(.55,flick)*smoothstep(.45,0.,vUv.y);
 float a=(rain*.85+base*.6)*smoothstep(1.,.35,vUv.y)*uGlow;
 vec3 color=mix(mix(${GREEN},${CYAN},flick),vec3(1.),rain*rain*.5);
 gl_FragColor=vec4(color*a,a);
}`});
 const strip=new T.PlaneGeometry(1,1);strip.rotateX(-Math.PI/2);
 const wall=new T.PlaneGeometry(1,1);wall.translate(0,.5,0);
 const seam=new T.Group();seam.name='portal-seam';seam.visible=false;world.add(seam);
 const segments=[0,1,2].map(()=>{
  const ground=new T.Mesh(strip,groundSeam),curtain=new T.Mesh(wall,curtainSeam);
  ground.renderOrder=curtain.renderOrder=21;ground.frustumCulled=curtain.frustumCulled=false;seam.add(ground,curtain);return {ground,curtain};
 });
 return {group,eraser,glitch,seam,
  place(x,y,z,yaw,floor=y-1e3){group.position.set(x,y,z);group.rotation.set(0,yaw,0);uniforms.uFloor.value=floor-y;},
  // Up to three outline segments, each a pair of ground points [x,y,z].
  outline(pairs){segments.forEach((segment,i)=>{
   const [a,b]=pairs[i]||[],show=!!(a&&b);segment.ground.visible=segment.curtain.visible=show;if(!show)return;
   const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),yaw=Math.atan2(-dz,dx),x=(a[0]+b[0])/2,y=Math.max(a[1],b[1]),z=(a[2]+b[2])/2;
   segment.ground.position.set(x,y+.03,z);segment.ground.rotation.set(0,yaw,0);segment.ground.scale.set(length+.3,1,.5);
   segment.curtain.position.set(x,y,z);segment.curtain.rotation.set(0,yaw,0);segment.curtain.scale.set(length+.3,1.1,1);
  });},
  set({open,time,tear,glow=1}){uniforms.uOpen.value=open;uniforms.uTime.value=time;uniforms.uTear.value=tear;uniforms.uGlow.value=glow;},
  set flash(value){flash.uFlash.value=value;glitch.visible=value>.001;},get flash(){return flash.uFlash.value;},
 };
}
