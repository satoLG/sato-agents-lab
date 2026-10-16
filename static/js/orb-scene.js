import {createWaterDebug} from './orb-water-debug.js';
import {createCoreGeometry} from './orb-core-surface.js';
import * as T from '../vendor/three.module.min.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {createOrbWater,createOrbCore,WATER_RADIUS} from './orb-water.js';
import {createOrbIsland} from './orb-island.js';
import {createOrbDepth} from './orb-depth.js';
import {sphereDistanceForDiameter} from './orb-camera.js';
import {createOrbMoon,loadOrbMoonTextures,MOON_RADIUS,MOON_ORBIT_RADIUS} from './orb-moon.js';
import {createOceanGeometry} from './orb-geometry.js';
import {createOrbGame} from './orb-game.js';
import {createOrbRefractionFilter} from './orb-refraction.js';

const WORLD_POSITION=new T.Vector3(4.4,4.7,9.8);
const WORLD_TARGET=new T.Vector3(0,.45,0);
const ISLAND_POSITION=new T.Vector3(1.65,3.65,3.35);
const ISLAND_TARGET=new T.Vector3(0,2.20,0);
const BASE_DISTANCE=WORLD_POSITION.distanceTo(WORLD_TARGET);
const INTRO_DIRECTION=WORLD_POSITION.clone().sub(WORLD_TARGET).normalize();

function createEnvironment(renderer) {
  // An HDR light field provides broad sky reflections and soft sun streaks.
  // It is generated locally; the scene has no CDN or texture dependencies.
  const w=1024,h=512,data=new Float32Array(w*h*4);
  const lights=[
    [.14,.26,.11,.055,7.5,8.3,8.5],
    [.63,.19,.055,.09,4.6,6.3,8.0],
    [.82,.40,.10,.12,.2,1.0,1.6],
    [.40,.32,.19,.13,.3,.9,1.1],
    [.08,.48,.09,.025,1.5,1.2,.70],
  ];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const u=x/w,v=y/h,k=(y*w+x)*4;
    let red=.055,green=.11,blue=.16;
    for(const [cx,cy,sx,sy,r,g,b] of lights) {
      const d=Math.min(Math.abs(u-cx),1-Math.abs(u-cx));
      const glow=Math.exp(-((d/sx)**2+((v-cy)/sy)**2)*2);
      red+=r*glow;green+=g*glow;blue+=b*glow;
    }
    const sky=.20*Math.max(0,1-v*1.7);
    data[k]=red+sky*.5;data[k+1]=green+sky;data[k+2]=blue+sky*1.4;data[k+3]=1;
  }
  const texture=new T.DataTexture(data,w,h,T.RGBAFormat,T.FloatType);
  texture.mapping=T.EquirectangularReflectionMapping;texture.wrapS=T.RepeatWrapping;
  texture.magFilter=texture.minFilter=T.LinearFilter;texture.needsUpdate=true;
  const pmrem=new T.PMREMGenerator(renderer),target=pmrem.fromEquirectangular(texture);
  texture.dispose();pmrem.dispose();return target;
}

function createStars() {
  const count=3400,positions=[],colors=[],sizes=[],seeds=[];
  let seed=8731;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<count;i++) {
    const y=random()*2-1,angle=random()*Math.PI*2,r=35+random()*50,s=Math.sqrt(1-y*y);
    positions.push(Math.cos(angle)*s*r,y*r,Math.sin(angle)*s*r);
    const color=new T.Color(i%9===0?'#fff0ce':i%4===0?'#a3d5ff':'#e3efff');
    colors.push(color.r,color.g,color.b);sizes.push(1.25+random()**5*3.1);seeds.push(random()*Math.PI*2);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setAttribute('starSize',new T.Float32BufferAttribute(sizes,1));geometry.setAttribute('starSeed',new T.Float32BufferAttribute(seeds,1));
  const time={value:0},dpr={value:1};
  const material=new T.ShaderMaterial({
    uniforms:{time,dpr},vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:`uniform float time; uniform float dpr; attribute float starSize; attribute float starSeed; varying vec3 vColor; varying float vShine;
      void main(){vColor=color;vShine=.85+.12*sin(time*.4+starSeed);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=starSize*dpr;}`,
    fragmentShader:`varying vec3 vColor; varying float vShine; void main(){float d=length(gl_PointCoord-.5);float alpha=(1.-smoothstep(.06,.5,d))*vShine;gl_FragColor=vec4(vColor,alpha);}`,
  });
  const group=new T.Points(geometry,material);group.frustumCulled=false;group.name='orb-starfield';return {group,time,dpr};
}

export async function createOrbScene(container,{reducedMotion=false,onCameraChange=()=>{},onManualOrbit=()=>{},onError=()=>{},onProgress=()=>{},onContact=()=>{},getLoadingDiameter=()=>140}={}) {
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('webgl2',{alpha:false,antialias:true,powerPreference:'high-performance'});
  if(!context)throw new Error('WEBGL_UNAVAILABLE');
  const renderer=new T.WebGLRenderer({canvas,context,antialias:true,alpha:false});
  renderer.setClearColor('#14243f');renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.transmissionResolutionScale=.75;
  container.appendChild(canvas);
  onProgress(.12);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.05,150);
  const worldPosition=WORLD_POSITION.clone();
  camera.position.copy(WORLD_POSITION);
  const controls=new OrbitControls(camera,canvas);
  controls.enabled=false;
  controls.target.copy(WORLD_TARGET);controls.enableDamping=true;controls.dampingFactor=.065;
  controls.enablePan=false;controls.rotateSpeed=.48;controls.zoomSpeed=.7;
  controls.minDistance=4.8;controls.maxDistance=Infinity;controls.minPolarAngle=.035;controls.maxPolarAngle=Math.PI-.035;
  controls.autoRotate=false;controls.autoRotateSpeed=.30;
  const environment=createEnvironment(renderer);scene.environment=environment.texture;
  onProgress(.26);
  scene.add(new T.HemisphereLight('#b2dbe6','#0c1825',1.5));
  const sun=new T.DirectionalLight('#ffe8c5',2.8);sun.position.set(-3,7,4);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-3,right:3,top:4,bottom:-3,near:.1,far:18});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.001;sun.shadow.normalBias=.025;scene.add(sun);
  const blueLight=new T.DirectionalLight('#72c2e6',1.8);blueLight.position.set(5,1,-4);scene.add(blueLight);
  const world=new T.Group();world.name='orb-world';scene.add(world);
  const core=createOrbCore(),coreGeometry=createCoreGeometry();
  const nucleus=new T.Mesh(coreGeometry,core.material);nucleus.name='submerged-nucleus';
  // The permanently submerged globe is separated from the water by a gap.
  // Only external contact geometry should contribute intersection foam.
  nucleus.userData.orbFoamExclude=true;world.add(nucleus);
  const water=createOrbWater(),mobile=window.matchMedia('(max-width:760px)').matches;
  const ocean=new T.Mesh(createOceanGeometry(WATER_RADIUS,mobile?24:28),water.material);
  // Vertex displacement includes the raised coastal water and the lunar swell.
  ocean.geometry.boundingSphere.radius=WATER_RADIUS+.35;
  ocean.name='wobbly-ocean';ocean.receiveShadow=false;world.add(ocean);
  const moonTextures=await loadOrbMoonTextures(),island=await createOrbIsland(moonTextures);
  const moon=createOrbMoon({orbitNormal:INTRO_DIRECTION,moonDirection:water.uniforms.orbMoonDirection.value,textures:moonTextures});
  moon.mesh.userData.orbFoamExclude=true;world.add(moon.mesh,island.group);
  onProgress(.58);
  const stars=createStars();scene.add(stars.group);
  // A restrained glow behind the orb adds depth without flattening the stars.
  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=128;
  const ctx=glowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(18,72,102,.16)');gradient.addColorStop(.4,'rgba(16,52,81,.08)');gradient.addColorStop(1,'rgba(2,8,13,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const glowTexture=new T.CanvasTexture(glowCanvas),glow=new T.Sprite(new T.SpriteMaterial({map:glowTexture,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));glow.scale.set(24,24,1);glow.position.set(0,0,-18);scene.add(glow);
  const depth=createOrbDepth(renderer,scene,water.uniforms);
  const game=createOrbGame({world,island,water,camera,occluders:[moon.mesh],canvas,container,controls,reducedMotion,onContact,
    onActivate(){transition=null;automatic=false;controls.autoRotate=false;container.dataset.view='walk';},
    onExit(){setView('world');},
  });
  const refraction=createOrbRefractionFilter(renderer);
  refraction.add(moon.mesh);refraction.add(island.trees);refraction.add(island.grass);
  // Straight-through transmission keeps submerged terrain and Sato at their
  // actual screen positions. Radial cutoffs created the hard turquoise band.
  // Trees and the moon remain excluded from this background pass.

  let paused=true,intro=true,automatic=false,speed=1,elapsed=0,previous=0,transition=null,view='world',disposed=false,raf=0,contextLost=false,dirty=true,lastRendered=0;
  const waterDebug=createWaterDebug(water.settings,()=>{dirty=true;});
  const emitCamera=()=>{dirty=true;onCameraChange(worldPosition.distanceTo(WORLD_TARGET)/camera.position.distanceTo(controls.target));};
  const orbitLimit=()=>view==='island'?8:Math.max(17,worldPosition.distanceTo(WORLD_TARGET)*1.45);
  controls.addEventListener('change',emitCamera);
  controls.addEventListener('start',()=>{transition=null;controls.maxDistance=Math.max(orbitLimit(),camera.position.distanceTo(controls.target));automatic=false;controls.autoRotate=false;onManualOrbit();});
  function resize() {
    const {width,height}=container.getBoundingClientRect();if(!width||!height)return;
    const isMobile=width<=760,dpr=Math.min(window.devicePixelRatio||1,isMobile?1.25:1.5,Math.sqrt(900000/(width*height)));
    renderer.setPixelRatio(dpr);renderer.setSize(width,height,false);stars.dpr.value=dpr;
    camera.aspect=width/height;
    camera.clearViewOffset();camera.fov=isMobile?46:36;
    // Fit the full lunar orbit, including the moon's own radius, on the
    // shortest screen dimension. Manual zoom remains available after entry.
    const envelope=MOON_ORBIT_RADIUS+MOON_RADIUS+WORLD_TARGET.length();
    const worldDistance=Math.max(BASE_DISTANCE,sphereDistanceForDiameter(envelope,height,Math.min(width,height)*.92,camera.fov));
    worldPosition.copy(WORLD_TARGET).addScaledVector(INTRO_DIRECTION,worldDistance);
    if(transition&&view==='world')transition.position.copy(worldPosition);
    if(intro){
      const distance=sphereDistanceForDiameter(WATER_RADIUS,height,getLoadingDiameter(),camera.fov);
      controls.target.set(0,0,0);camera.position.copy(INTRO_DIRECTION).multiplyScalar(distance);
      camera.far=Math.max(150,distance+12);controls.update();emitCamera();
    }
    camera.updateProjectionMatrix();depth.resize();dirty=true;
  }
  const observer=new ResizeObserver(resize);observer.observe(container);resize();controls.update();
  function setView(next,{instant=false,duration=900}={}) {
    view=next==='island'?'island':'world';container.dataset.view=view;
    controls.minDistance=view==='island'?1.6:4.8;
    const finalMaxDistance=orbitLimit();
    // Keep the distant loading pose while easing in; restoring the regular
    // orbit bound too early would clamp the camera and turn the zoom into a jump.
    controls.maxDistance=Math.max(finalMaxDistance,camera.position.distanceTo(controls.target));
    controls.maxPolarAngle=view==='island'?Math.PI*.48:Math.PI-.035;
    const position=view==='island'?ISLAND_POSITION:worldPosition,target=view==='island'?ISLAND_TARGET:WORLD_TARGET;
    transition=null;
    if(instant||reducedMotion){camera.position.copy(position);controls.target.copy(target);controls.maxDistance=finalMaxDistance;controls.update();emitCamera();}
    else transition={start:performance.now(),duration,finalMaxDistance,fromPosition:camera.position.clone(),fromTarget:controls.target.clone(),position:position.clone(),target:target.clone()};
  }
  function zoom(factor) {
    transition=null;
    const offset=camera.position.clone().sub(controls.target);
    offset.setLength(T.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));
    camera.position.copy(controls.target).add(offset);controls.update();emitCamera();
  }
  const keydown=event=>{
    if(event.target!==container||!controls.enabled)return;
    if(['+','=','-','_','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();
    if(event.key==='+'||event.key==='=')zoom(.87);
    else if(event.key==='-'||event.key==='_')zoom(1.15);
    else if(event.key==='0')setView('world');
    else if(event.key.startsWith('Arrow')) {
      transition=null;automatic=false;controls.autoRotate=false;onManualOrbit();
      const spherical=new T.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      spherical.theta+=event.key==='ArrowLeft'?.10:event.key==='ArrowRight'?-.10:0;
      spherical.phi=T.MathUtils.clamp(spherical.phi+(event.key==='ArrowUp'?-.10:event.key==='ArrowDown'?.10:0),controls.minPolarAngle,controls.maxPolarAngle);
      camera.position.copy(controls.target).add(new T.Vector3().setFromSpherical(spherical));controls.update();
    }
  };
  container.addEventListener('keydown',keydown);
  const lost=event=>{event.preventDefault();contextLost=true;cancelAnimationFrame(raf);onError('A conexão com a placa gráfica foi interrompida. Recarregue para retomar a viagem.');};
  canvas.addEventListener('webglcontextlost',lost);
  function render(now) {
    if(disposed||contextLost)return;
    raf=requestAnimationFrame(render);
    const delta=previous?Math.min((now-previous)/1000,.05):0;previous=now;
    if(document.hidden)return;
    if(!paused)elapsed+=delta*speed;
    water.uniforms.orbTime.value=elapsed;moon.update(elapsed);
    const gameActive=game.update(delta,{time:elapsed,animate:!paused&&!intro});
    if(gameActive)dirty=true;
    if(transition){dirty=true;const t=T.MathUtils.clamp((now-transition.start)/transition.duration,0,1),ease=t*t*(3-2*t);camera.position.lerpVectors(transition.fromPosition,transition.position,ease);controls.target.lerpVectors(transition.fromTarget,transition.target,ease);if(t===1){controls.maxDistance=transition.finalMaxDistance;transition=null;}}
    controls.autoRotate=automatic&&!paused&&!transition&&!game.playing;if(!game.playing)controls.update(delta);
    // Paused scenes redraw for camera/settings changes, then release the GPU.
    if((!paused||dirty)&&now-lastRendered>=1000/30){
      water.uniforms.orbTime.value=elapsed;core.time.value=elapsed;stars.time.value=elapsed;
      stars.group.rotation.y=elapsed*.0015;island.update(elapsed);
      // Walking changes the camera and Sato's contact depth, but every shadow
      // caster stays static. Sato receives no cast shadow, so reuse this map.
      if(depth.capture(camera)&&!game.playing)renderer.shadowMap.needsUpdate=true;
      renderer.render(scene,camera);dirty=false;lastRendered=now;
    }
  }
  const shaderErrors=[];
  renderer.debug.onShaderError=(gl,program,vs,fs)=>{shaderErrors.push(gl.getProgramInfoLog(program)||gl.getShaderInfoLog(vs)||gl.getShaderInfoLog(fs));};
  try {
    onProgress(.70);
    await renderer.compileAsync(scene,camera);
    onProgress(.88);
    depth.capture(camera);
    renderer.render(scene,camera);
    renderer.shadowMap.autoUpdate=false;
    if(shaderErrors.length)throw new Error('SHADER_ERROR');
  } catch(error) {dispose();throw error;}
  renderer.debug.onShaderError=(gl,program)=>{console.error('orb shader:',gl.getProgramInfoLog(program));onError('Não foi possível desenhar o oceano neste navegador. Tente recarregar a página.');};
  container.dataset.view='intro';emitCamera();container.dataset.ready='true';raf=requestAnimationFrame(render);
  onProgress(1);
  function dispose() {
    if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer.disconnect();waterDebug.dispose();game.dispose();refraction.dispose();controls.dispose();container.removeEventListener('keydown',keydown);canvas.removeEventListener('webglcontextlost',lost);
    const geometries=new Set(),materials=new Set();scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)for(const m of Array.isArray(object.material)?object.material:[object.material])materials.add(m);});
    for(const g of geometries)g.dispose();for(const m of materials){for(const key of ['map','alphaMap','normalMap','gradientMap'])m[key]?.dispose();m.dispose();}depth.dispose();glowTexture.dispose();environment.dispose();sun.shadow.map?.dispose();renderer.dispose();canvas.remove();delete container.dataset.ready;
  }
  return {
    setView,zoom,dispose,
    enter(){if(!intro)return;intro=false;controls.enabled=true;game.setEnabled(true);setView('world',{duration:2800});},
    get playing(){return game.playing;},
    setPaused(value){paused=value;dirty=true;},
    setAutoOrbit(value){automatic=value;},
    setStrength(value){water.uniforms.orbStrength.value=value;dirty=true;},
    setSpeed(value){speed=value;},
    setClarity(value){water.material.transmission=value;water.material.opacity=1;dirty=true;},
    reset(){if(game.playing)game.setMode(false);else setView('world');},
  };
}
