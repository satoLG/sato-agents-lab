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
  await expect.poll(()=>page.evaluate(()=>orbQA.game.motor.grounded),{timeout:20000}).toBe(true);
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
   water.uniforms.orbStrength.value=0;water.uniforms.orbTime.value=0;game.motor.place(new T.Vector3(0,0,1));
   for(let i=0;i<20;i++)game.update(.05,{time:0,animate:false});
   const actor=game.avatar.root;
   for(const child of scene.children)if(child!==world&&!child.isLight)child.visible=false;
   for(const child of world.children)child.visible=child===ocean||child===actor;
   renderer.setPixelRatio(1);renderer.setSize(256,256,false);
   const camera=new T.PerspectiveCamera(42,1,.05,150);camera.position.copy(game.motor.position).addScaledVector(game.motor.up,.29).addScaledVector(game.motor.heading,.36);camera.up.copy(game.motor.up);camera.lookAt(game.motor.position.clone().addScaledVector(game.motor.up,.012));
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
  await expect.poll(()=>page.evaluate(()=>orbQA.game.motor.grounded),{timeout:20000}).toBe(true);
  await page.screenshot({path:info.outputPath('sato-mobile.png')});await page.locator('#orb-walk-exit').click();await expect(page.locator('#orb-play-controls')).toBeHidden();expect(failures).toEqual([]);
 });
});

test('surface foley renders distinct footsteps, takeoff and landing without loading audio files',async({page})=>{
 test.setTimeout(90000);const failures=errors(page);await enter(page);
 const clips=await page.evaluate(async()=>{
  const {createOrbAmbience}=await import('/static/js/orb-audio.js'),Native=globalThis.AudioContext;
  const outputs=[];let offline;
  globalThis.AudioContext=class extends OfflineAudioContext {
   constructor(){super(1,44100,44100);offline=this;}
   resume(){return Promise.resolve();}close(){return Promise.resolve();}
   createGain(){const gain=super.createGain(),connect=gain.connect.bind(gain);gain.connect=(target,...args)=>{if(target===this.destination)this.master=gain;return connect(target,...args);};return gain;}
  };
  try {
   for(const event of [null,{type:'step',surface:'grass'},{type:'step',surface:'sand'},{type:'step',surface:'rock'},{type:'step',surface:'water'},{type:'jump',surface:'water'},{type:'land',surface:'water',impact:1.7}]){
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
 for(const clip of clips){expect(clip.rms).toBeGreaterThan(.0001);expect(clip.rms).toBeLessThan(.1);expect(clip.duration).toBeLessThan(.5);}
 expect(clips[3].tail).toBeGreaterThan(clips[0].tail*5);expect(clips[5].duration).toBeGreaterThan(clips[3].duration);expect(clips[4].crossings).not.toBe(clips[3].crossings);
 expect(new Set(clips.map(c=>c.rms.toFixed(6))).size).toBe(6);expect(failures).toEqual([]);
});
