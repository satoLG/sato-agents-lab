const {test,expect}=require('@playwright/test');

async function enter(page) {
 await page.route('**/js/orb-scene.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('return {\n    setView,zoom,dispose,','window.orbQA={T,scene,world,water,depth,renderer,camera,ocean,island,moon,game,refraction,controls};return {\n    setView,zoom,dispose,')});});
 await page.route('**/js/orb.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('onContact:event=>ambience?.playContact(event),','onContact:event=>{(window.orbEvents??=[]).push({type:event.type,surface:event.surface});ambience?.playContact(event);},')});});
 await page.goto('/orb',{waitUntil:'domcontentloaded'});await expect(page.locator('#orb-start')).toBeEnabled({timeout:45000});await page.locator('#orb-start').click();await expect(page.locator('#orb-loading')).toBeHidden();
}
function errors(page) {const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});return errors;}

test.describe('orb Sato controls',()=>{
 test.use({viewport:{width:640,height:480}});
 test('a discreet icon wakes the original Sato for walking, double jump and returning to sleep',async({page},info)=>{
  test.setTimeout(120000);const failures=errors(page);await enter(page);
  await expect(page.locator('#orb-sato-invite')).toBeVisible();
  await expect(page.locator('#orb-sato-invite')).toHaveAccessibleName('Acordar Sato');
  expect(await page.locator('#orb-sato-invite').innerText()).toBe('');
  expect(await page.evaluate(()=>orbQA.game.avatar.root.userData.animation)).toBe('sleep');
  await page.locator('#orb-sato-invite').click();
  await expect(page.locator('#orb-scene')).toHaveAttribute('data-mode','walk');await expect(page.locator('#orb-play-controls')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>orbQA.game.avatar.waking),{timeout:30000}).toBe(false);
  const before=await page.evaluate(()=>orbQA.game.motor.position.toArray());await page.keyboard.down('w');
  await expect.poll(()=>page.evaluate(start=>orbQA.game.motor.position.distanceTo(new orbQA.T.Vector3(...start)),before),{timeout:30000}).toBeGreaterThan(.04);await page.keyboard.up('w');
  await page.keyboard.press('Space');await expect.poll(()=>page.evaluate(()=>orbQA.game.motor.jumps)).toBe(1);
  await page.keyboard.press('Space');await expect.poll(()=>page.evaluate(()=>orbQA.game.motor.jumps)).toBe(2);
  await page.keyboard.press('Space');expect(await page.evaluate(()=>orbQA.game.motor.jumps)).toBe(2);
  // A software renderer can finish landing between CDP calls. Check the
  // input events, then the completed landing, rather than sampling a late gap.
  expect(await page.evaluate(()=>orbEvents.filter(e=>e.type==='jump').length)).toBe(2);
  // SwiftShader can spend seconds rendering one frame; advance bounded physics
  // ticks after the real input sequence rather than measuring GPU wall time.
  await page.evaluate(()=>{for(let i=0;i<240&&!orbQA.game.motor.grounded;i++)orbQA.game.update(1/120,{time:orbQA.water.uniforms.orbTime.value});});
  expect(await page.evaluate(()=>orbQA.game.motor.grounded)).toBe(true);
  expect(await page.evaluate(()=>orbQA.game.motor.jumps)).toBe(0);
  const pose=await page.evaluate(()=>{const {T,game,camera}=orbQA;return {up:new T.Vector3(0,1,0).applyQuaternion(game.avatar.root.quaternion).dot(game.motor.up),cameraRadius:camera.position.length(),actorRadius:game.motor.position.length(),orbitEnabled:orbQA.controls.enabled};});
  expect(pose.up).toBeGreaterThan(.9999);expect(pose.orbitEnabled).toBe(false);expect(pose.cameraRadius).toBeGreaterThan(pose.actorRadius);
  await page.screenshot({path:info.outputPath('sato-controlled.png')});
  await page.keyboard.press('Escape');await expect(page.locator('#orb-play-controls')).toBeHidden();await expect(page.locator('#orb-scene')).toHaveAttribute('data-mode','orbit');
  expect(await page.evaluate(()=>orbQA.controls.enabled)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>orbQA.game.avatar.faceUniforms.sleep.value),{timeout:20000}).toBeGreaterThan(.99);
  const screen=await page.evaluate(()=>orbQA.game.screenPosition());await page.mouse.click(screen.x,screen.y);
  await expect(page.locator('#orb-scene')).toHaveAttribute('data-mode','walk');expect(failures).toEqual([]);
 });

 test('above-water models remain visible but disappear from the actual refraction texture',async({page})=>{
  test.setTimeout(90000);const failures=errors(page);await enter(page);
  const pixels=await page.evaluate(()=>{
   const {T,renderer,scene,world,moon,ocean}=orbQA;
   for(const child of scene.children)if(child!==world&&!child.isLight)child.visible=false;
   for(const child of world.children)child.visible=child===moon.mesh||child===ocean||child.name==='submerged-nucleus';
   const camera=new T.PerspectiveCamera(28,1,.05,150),direction=new T.Vector3(4.4,4.25,9.8).normalize();camera.position.copy(direction).multiplyScalar(8);camera.lookAt(0,0,0);
   moon.mesh.position.copy(direction).multiplyScalar(3.2);moon.mesh.material.map=null;moon.mesh.material.color.set('#ff0000');moon.mesh.material.needsUpdate=true;
   let transmission=null;const setTarget=renderer.setRenderTarget;renderer.setRenderTarget=function(target,...args){const result=setTarget.call(this,target,...args);if(target?.texture?.name==='orb-filtered-refraction')transmission=target;return result;};
   const output=new T.WebGLRenderTarget(128,128),normal=new Uint8Array(4),refracted=new Uint8Array(4);
   renderer.setRenderTarget(output);renderer.render(scene,camera);renderer.readRenderTargetPixels(output,64,64,1,1,normal);
   const quadScene=new T.Scene(),quad=new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({uniforms:{image:{value:transmission.texture}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 vUv;uniform sampler2D image;void main(){gl_FragColor=texture2D(image,vUv);}'}));quadScene.add(quad);
   renderer.render(quadScene,new T.Camera());renderer.readRenderTargetPixels(output,64,64,1,1,refracted);renderer.setRenderTarget(null);renderer.setRenderTarget=setTarget;
   output.dispose();quad.geometry.dispose();quad.material.dispose();return {normal:[...normal],refracted:[...refracted],shadow:ocean.receiveShadow,specular:ocean.material.specularIntensity,environment:ocean.material.envMapIntensity};
  });
  expect(pixels.normal[0]).toBeGreaterThan(pixels.normal[2]*3);expect(pixels.refracted[2]).toBeGreaterThan(pixels.refracted[0]*1.5);
  expect(pixels.shadow).toBe(false);expect(pixels.specular).toBe(0);expect(pixels.environment).toBe(0);expect(failures).toEqual([]);
 });

 test('walking and jumping in water creates real Sato contact foam, particles, ripples and surface events',async({page},info)=>{
  test.setTimeout(120000);const failures=errors(page);await enter(page);await page.locator('#orb-sato-invite').click();
  const result=await page.evaluate(async()=>{
   const {T,scene,world,renderer,water,ocean,game,depth}=orbQA;
   water.uniforms.orbStrength.value=0;water.uniforms.orbTime.value=0;game.motor.place(new T.Vector3(.20,.84,.50));
   for(let i=0;i<20;i++)game.update(.05,{time:0,animate:false});
   const actor=game.avatar.root;
   for(const child of scene.children)if(child!==world&&!child.isLight)child.visible=false;
   for(const child of world.children)child.visible=child===ocean||child===actor;
   renderer.setPixelRatio(1);renderer.setSize(256,256,false);
   const camera=new T.PerspectiveCamera(42,1,.05,150);camera.position.copy(game.motor.position).addScaledVector(game.motor.up,.6).addScaledVector(game.motor.heading,.65);camera.up.copy(game.motor.up);camera.lookAt(game.motor.position.clone().addScaledVector(game.motor.up,.14));
   const original=water.material.onBeforeCompile;water.material.onBeforeCompile=shader=>{original(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','gl_FragColor=vec4(vec3(orbEdgeFoamRaw),1.);');};water.material.transmission=0;water.material.customProgramCacheKey=()=> 'sato-real-foam-qa';water.material.needsUpdate=true;
   const target=new T.WebGLRenderTarget(256,256),bytes=new Uint8Array(256*256*4);await renderer.compileAsync(scene,camera);
   function mask(visible){actor.visible=visible;depth.capture(camera);actor.visible=false;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,256,256,bytes);renderer.setRenderTarget(null);actor.visible=visible;let count=0;for(let i=0;i<bytes.length;i+=4)if(bytes[i]>45&&bytes[i+1]>45)count++;return count;}
   const contact=mask(true),empty=mask(false);actor.visible=true;
   for(let i=0;i<50;i++)game.motor.update(1/120,{direction:game.motor.heading.clone(),amount:1,time:0});
   game.motor.jump();game.trails.update(.016,1.02);
   const particles=game.trails.activeParticles,ripples=[...water.uniforms.orbRippleStrengths.value].filter(x=>x>0).length;
   target.dispose();return {contact,empty,particles,ripples,surface:game.motor.support.surface,foamIncluded:!actor.userData.orbFoamExclude,events:window.orbEvents};
  });
  expect(result.contact).toBeGreaterThan(5);expect(result.empty).toBe(0);expect(result.particles).toBeGreaterThan(5);expect(result.ripples).toBeGreaterThan(0);expect(result.surface).toBe('water');expect(result.foamIncluded).toBe(true);
  expect(result.events.some(e=>e.type==='step'&&e.surface==='water')).toBe(true);expect(result.events.some(e=>e.type==='jump'&&e.surface==='water')).toBe(true);expect(failures).toEqual([]);
 });
});

test.describe('orb Sato touch controls',()=>{
 test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 test('thumbstick and jump work together with two fingers and release cleanly',async({page},info)=>{
  test.setTimeout(150000);const failures=errors(page);await enter(page);await page.locator('#orb-sato-invite').click();await expect(page.locator('#orb-stick')).toBeVisible();
  const stick=await page.locator('#orb-stick').boundingBox(),jump=await page.locator('#orb-jump').boundingBox(),cdp=await page.context().newCDPSession(page),center={x:stick.x+stick.width/2,y:stick.y+stick.height/2,id:1},moving={...center,x:center.x+28};
  const before=await page.evaluate(()=>orbQA.game.motor.position.toArray());await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[center]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moving]});
  await expect.poll(()=>page.evaluate(start=>orbQA.game.motor.position.distanceTo(new orbQA.T.Vector3(...start)),before),{timeout:30000}).toBeGreaterThan(.025);
  const tap={x:jump.x+jump.width/2,y:jump.y+jump.height/2,id:2};
  // touchEnd names the changed touch; ending the stick would leave the jump
  // finger down and turn the next tap into another stick pointer.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[moving,tap]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[tap]});await expect.poll(()=>page.evaluate(()=>orbQA.game.motor.jumps)).toBe(1);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[moving,tap]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[tap]});await expect.poll(()=>page.evaluate(()=>orbQA.game.motor.jumps)).toBe(2);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('#orb-stick-knob')).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
  // Air control intentionally retains a little momentum after release.
  await expect.poll(()=>page.evaluate(()=>orbQA.game.motor.velocity.length()),{timeout:20000}).toBeLessThan(.05);
  // SwiftShader can spend seconds rendering one frame; advance bounded physics
  // ticks after the real input sequence rather than measuring GPU wall time.
  await page.evaluate(()=>{for(let i=0;i<240&&!orbQA.game.motor.grounded;i++)orbQA.game.update(1/120,{time:orbQA.water.uniforms.orbTime.value});});
  expect(await page.evaluate(()=>orbQA.game.motor.grounded)).toBe(true);
  const zoomBefore=await page.evaluate(()=>orbQA.game.cameraDistance);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:145,y:380,id:3},{x:245,y:380,id:4}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:95,y:380,id:3},{x:295,y:380,id:4}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>orbQA.game.cameraDistance)).toBeLessThan(zoomBefore*.8);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:95,y:380,id:5},{x:295,y:380,id:6}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:155,y:380,id:5},{x:235,y:380,id:6}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>orbQA.game.cameraDistance)).toBeGreaterThan(zoomBefore);
  await page.screenshot({path:info.outputPath('sato-mobile.png')});await page.locator('#orb-walk-exit').click();await expect(page.locator('#orb-play-controls')).toBeHidden();expect(failures).toEqual([]);
 });
});

test('JDSherbert recordings render distinct surfaces, takeoff and landing',async({page})=>{
 test.setTimeout(90000);const failures=errors(page),recordings=new Set();page.on('request',request=>{if(request.url().includes('/audio/orb-foley/')&&request.url().endsWith('.mp3'))recordings.add(request.url().split('/').at(-1));});await enter(page);
 const clips=await page.evaluate(async()=>{
  const {createOrbAmbience}=await import('/static/js/orb-audio.js'),Native=globalThis.AudioContext;
  const outputs=[];let offline;
  globalThis.AudioContext=class extends OfflineAudioContext {
   constructor(){super(1,44100,44100);offline=this;}
   resume(){return Promise.resolve();}close(){return Promise.resolve();}
   createGain(){const gain=super.createGain(),connect=gain.connect.bind(gain);gain.connect=(target,...args)=>{if(target===this.destination)this.master=gain;return connect(target,...args);};return gain;}
  };
  try {
   for(const event of [null,{type:'step',surface:'grass'},{type:'step',surface:'sand'},{type:'step',surface:'rock'},{type:'step',surface:'water',waterDepth:.2},{type:'jump',surface:'water',waterDepth:.2},{type:'land',surface:'water',waterDepth:.2,impact:1.7},{type:'step',surface:'water',waterDepth:.03}]){
    const audio=createOrbAmbience();await audio.start();offline.master.gain.cancelScheduledValues(0);offline.master.gain.setValueAtTime(1,0);
    if(event)audio.playContact(event);
    const buffer=await offline.startRendering();outputs.push(new Float32Array(buffer.getChannelData(0)));audio.dispose();
   }
  } finally {globalThis.AudioContext=Native;}
  const baseline=outputs.shift();return outputs.map((samples,index)=>{
   let energy=0,tail=0,last=0,crossings=0;for(let i=0;i<samples.length;i++){const v=samples[i]-baseline[i];energy+=v*v;if(i>4410&&i<8000)tail+=v*v;if(Math.abs(v)>.0001)last=i;if(i&&v*(samples[i-1]-baseline[i-1])<0)crossings++;}
   return {index,rms:Math.sqrt(energy/samples.length),tail,duration:last/44100,crossings};
  });
 });
 expect(recordings.size).toBe(10);
 for(const clip of clips){expect(clip.rms).toBeGreaterThan(.0001);expect(clip.rms).toBeLessThan(.25);expect(clip.duration).toBeLessThan(.9);}
 expect(clips[3].rms).toBeGreaterThan(clips[1].rms);
 expect(clips[3].tail).toBeGreaterThan(clips[0].tail*2);expect(clips[5].duration).toBeGreaterThan(clips[3].duration);expect(clips[4].crossings).not.toBe(clips[3].crossings);
 expect(new Set(clips.map(c=>c.rms.toFixed(6))).size).toBe(7);expect(failures).toEqual([]);
});

test('follow camera keeps its distance while occluding geometry fades on the GPU',async({page})=>{
 test.setTimeout(90000);const failures=errors(page);await enter(page);await page.locator('#orb-sato-invite').click();
 const result=await page.evaluate(async()=>{
  const {T,game,camera,island,renderer}=orbQA;
  for(let i=0;i<35;i++)game.update(.05,{time:0});
  const before=camera.position.clone(),distance=game.cameraDistance;
  island.trees.scale.multiplyScalar(3);
  for(let i=0;i<35;i++)game.update(.05,{time:0});
  const cameraShift=camera.position.distanceTo(before),target=game.motor.position.clone().addScaledVector(game.motor.up,.15),elevation=camera.position.clone().sub(target).normalize().dot(game.motor.up);
  const {createOrbCameraOcclusion}=await import('/static/js/orb-camera-occlusion.js');
  const scene=new T.Scene(),probe=new T.Mesh(new T.PlaneGeometry(1.6,1.6),new T.MeshBasicMaterial({color:'#ff0000'}));scene.add(probe);
  const view=new T.PerspectiveCamera(40,1,.05,10);view.position.set(0,0,2);view.lookAt(0,0,0);
  const fade=createOrbCameraOcclusion([probe]),rt=new T.WebGLRenderTarget(128,128),data=new Uint8Array(128*128*4);
  function count(){renderer.setRenderTarget(rt);renderer.render(scene,view);renderer.readRenderTargetPixels(rt,0,0,128,128,data);let center=0,edge=0;for(let y=0;y<128;y++)for(let x=0;x<128;x++){const red=data[(y*128+x)*4]>100;if(x>54&&x<74&&y>54&&y<74)center+=red;if(x<15&&y>40&&y<80)edge+=red;}return {center,edge};}
  fade.update(view.position,new T.Vector3(0,0,-.3),false,1);const solid=count();fade.update(view.position,new T.Vector3(0,0,-.3),true,1);const faded=count();
  renderer.setRenderTarget(null);rt.dispose();probe.geometry.dispose();probe.material.dispose();
  game.motor.place(new T.Vector3(0,0,1));game.update(.05,{time:0});const initialUp=game.motor.up.clone(),initialBack=camera.position.clone().sub(game.motor.position);initialBack.addScaledVector(initialUp,-initialBack.dot(initialUp)).normalize();window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'}));
  for(let i=0;i<100;i++)game.update(1/60,{time:0});window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD'}));
  const cameraBack=camera.position.clone().sub(game.motor.position);cameraBack.addScaledVector(game.motor.up,-cameraBack.dot(game.motor.up)).normalize();
  return {cameraShift,distance,elevation,solid,faded,stable:cameraBack.dot(initialBack.applyQuaternion(new T.Quaternion().setFromUnitVectors(initialUp,game.motor.up)))};
 });
 expect(result.stable).toBeGreaterThan(.999);expect(result.cameraShift).toBeLessThan(.001);expect(result.distance).toBeGreaterThan(2);expect(result.elevation).toBeGreaterThan(.5);
 expect(result.faded.center).toBeLessThan(result.solid.center*.3);expect(result.faded.edge).toBe(result.solid.edge);
 await page.mouse.move(600,350);const before=await page.evaluate(()=>orbQA.game.cameraDistance);await page.mouse.wheel(0,350);await expect.poll(()=>page.evaluate(()=>orbQA.game.cameraDistance)).toBeGreaterThan(before*1.2);expect(failures).toEqual([]);
});

test('water wakes expand from the contact point, break up with noise and expire on the GPU',async({page})=>{
 test.setTimeout(90000);const failures=errors(page);await enter(page);
 const result=await page.evaluate(async()=>{
  const {T,water,ocean,renderer}=orbQA,scene=new T.Scene();scene.add(ocean);water.material.transmission=0;
  const original=water.material.onBeforeCompile;water.material.onBeforeCompile=shader=>{original(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','gl_FragColor=vec4(vec3(min(wake,1.)),1.);');};water.material.customProgramCacheKey=()=> 'orb-wake-readback';water.material.needsUpdate=true;
  water.uniforms.orbStrength.value=0;water.uniforms.orbTime.value=0;water.uniforms.orbInteractionTime.value=0;water.emitRipple(new T.Vector3(0,0,2),1.5);
  const camera=new T.PerspectiveCamera(32,1,.05,20);camera.position.set(0,0,4);camera.lookAt(0,0,0);
  const target=new T.WebGLRenderTarget(160,160),bytes=new Uint8Array(160*160*4);
  function sample(time){water.uniforms.orbInteractionTime.value=time;renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,160,160,bytes);let count=0,spread=0,left=0,right=0;for(let y=0;y<160;y++)for(let x=0;x<160;x++){const v=bytes[(y*160+x)*4];if(v>12){count++;spread+=Math.hypot(x-80,y-80);if(x<80)left+=v;else right+=v;}}return {count,spread:spread/Math.max(1,count),left,right};}
  const early=sample(.25),late=sample(.9),expired=sample(3);renderer.setRenderTarget(null);target.dispose();return {early,late,expired};
 });
 expect(result.early.count).toBeGreaterThan(20);expect(result.late.spread).toBeGreaterThan(result.early.spread*1.5);expect(result.early.left).not.toBe(result.early.right);expect(result.expired.count).toBe(0);expect(failures).toEqual([]);
});

test('submerged Sato remains visible without a displaced duplicate in the water',async({page})=>{
 test.setTimeout(90000);const failures=errors(page);await enter(page);await page.locator('#orb-sato-invite').click();
 const result=await page.evaluate(()=>{
  const {T,game,scene,world,renderer,ocean,water}=orbQA;water.uniforms.orbStrength.value=0;water.uniforms.orbTime.value=0;
  game.motor.place(new T.Vector3(0,0,1));for(let i=0;i<20;i++)game.update(.05,{time:0});const actor=game.avatar.root;
  for(const child of scene.children)if(child!==world&&!child.isLight)child.visible=false;
  for(const child of world.children)child.visible=child===ocean||child===actor||child.name==='submerged-nucleus';
  const camera=new T.PerspectiveCamera(42,1,.05,150);camera.position.copy(game.motor.position).addScaledVector(game.motor.up,.6).addScaledVector(game.motor.heading,.65);camera.up.copy(game.motor.up);camera.lookAt(game.motor.position.clone().addScaledVector(game.motor.up,.14));camera.updateMatrixWorld();
  actor.updateWorldMatrix(true,true);const box=new T.Box3().setFromObject(actor),bounds={minX:1,minY:1,maxX:-1,maxY:-1};
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new T.Vector3(x,y,z).project(camera);bounds.minX=Math.min(bounds.minX,p.x);bounds.maxX=Math.max(bounds.maxX,p.x);bounds.minY=Math.min(bounds.minY,p.y);bounds.maxY=Math.max(bounds.maxY,p.y);}
  const rt=new T.WebGLRenderTarget(192,192),present=new Uint8Array(192*192*4),absent=new Uint8Array(present.length);
  renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,0,0,192,192,present);actor.visible=false;renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,0,0,192,192,absent);renderer.setRenderTarget(null);actor.visible=true;
  let inside=0,outside=0;for(let y=0;y<192;y++)for(let x=0;x<192;x++){const i=(y*192+x)*4,delta=Math.abs(present[i]-absent[i])+Math.abs(present[i+1]-absent[i+1])+Math.abs(present[i+2]-absent[i+2]);if(delta<15)continue;const px=x/192*2-1,py=y/192*2-1;if(px<bounds.minX-.03||px>bounds.maxX+.03||py<bounds.minY-.03||py>bounds.maxY+.03)outside++;else inside++;}
  rt.dispose();return {inside,outside,depth:game.motor.waterDepth};
 });
 expect(result.depth).toBeGreaterThan(.18);expect(result.inside).toBeGreaterThan(30);expect(result.outside).toBeLessThan(5);expect(failures).toEqual([]);
});

test('wind-displaced leaves and the moon become translucent in front of Sato',async({page})=>{
 test.setTimeout(90000);const failures=errors(page);await enter(page);
 const result=await page.evaluate(async()=>{
  const {T,renderer,moon}=orbQA;
  const {createFoliageCloud,createFolioFoliageMaterial,loadFoliageTexture}=await import('/static/js/folio-foliage.js');await loadFoliageTexture();
  const {createOrbMoon}=await import('/static/js/orb-moon.js');
  const {createOrbCameraOcclusion}=await import('/static/js/orb-camera-occlusion.js');
  const leaf=new T.InstancedMesh(createFoliageCloud(),createFolioFoliageMaterial(),1);leaf.setMatrixAt(0,new T.Matrix4().makeScale(.5,.5,.5));leaf.material.color.set('#ff0000');
  const rock=createOrbMoon({orbitNormal:new T.Vector3(0,0,1),textures:{color:moon.mesh.material.map,normal:moon.mesh.material.normalMap}}).mesh;rock.position.set(0,0,0);rock.material.color.set('#ff0000');
  const camera=new T.PerspectiveCamera(40,1,.05,10);camera.position.set(0,0,2);camera.lookAt(0,0,0);
  const target=new T.WebGLRenderTarget(128,128),data=new Uint8Array(128*128*4),results=[];
  for(const mesh of [leaf,rock]){
   const scene=new T.Scene();scene.add(new T.AmbientLight('#ffffff',3),mesh);const fade=createOrbCameraOcclusion([mesh]);
   const count=()=>{renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,128,128,data);let count=0;for(let y=54;y<74;y++)for(let x=54;x<74;x++)if(data[(y*128+x)*4]>80)count++;return count;};
   fade.update(camera.position,new T.Vector3(0,0,-1),false,1);const solid=count();fade.update(camera.position,new T.Vector3(0,0,-1),true,1);const faded=count();results.push({solid,faded});
   mesh.geometry.dispose();mesh.material.dispose();
  }
  renderer.setRenderTarget(null);target.dispose();return results;
 });
 for(const item of result){expect(item.solid).toBeGreaterThan(20);expect(item.faded).toBeLessThan(item.solid*.3);}expect(failures).toEqual([]);
});

test('lunar rock color and normals remain independent of sphere UVs, including at the pole',async({page})=>{
 test.setTimeout(90000);const failures=errors(page);await enter(page);
 const result=await page.evaluate(()=>{
  const {T,moon,renderer,island}=orbQA,scene=new T.Scene();scene.add(moon.mesh,new T.DirectionalLight('#ffffff',3),new T.AmbientLight('#ffffff',.4));scene.children[1].position.set(2,3,1);moon.mesh.position.set(0,0,0);
  const camera=new T.PerspectiveCamera(35,1,.05,10);camera.position.set(.12,2.8,.12);camera.up.set(0,0,1);camera.lookAt(0,0,0);
  const target=new T.WebGLRenderTarget(160,160);function pixels(){const data=new Uint8Array(160*160*4);renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,160,160,data);return data;}
  const original=pixels();moon.mesh.geometry.attributes.uv.array.fill(0);moon.mesh.geometry.attributes.uv.needsUpdate=true;const collapsedUV=pixels();moon.mesh.material.normalScale.set(0,0);const flat=pixels();
  let uvChanges=0,normalChanges=0;for(let i=0;i<original.length;i+=4){const diff=(a,b)=>Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(diff(original,collapsedUV)>3)uvChanges++;if(diff(collapsedUV,flat)>12)normalChanges++;}
  renderer.setRenderTarget(null);target.dispose();return {uvChanges,normalChanges,shared:island.rocks.every(rock=>rock.material.map===moon.mesh.material.map&&rock.material.normalMap===moon.mesh.material.normalMap)};
 });
 expect(result.uvChanges).toBe(0);expect(result.normalChanges).toBeGreaterThan(300);expect(result.shared).toBe(true);expect(failures).toEqual([]);
});
