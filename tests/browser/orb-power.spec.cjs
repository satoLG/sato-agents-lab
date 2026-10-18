const {test,expect}=require('@playwright/test');
test.use({viewport:{width:900,height:700}});
async function enter(page){
 await page.route('**/js/orb-scene.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/\r\n/g,'\n').replace('return {\n    setView,zoom,dispose,','window.orbQA={T,water,renderer,game,scene,camera,freeze(){cancelAnimationFrame(raf);},draw(){renderer.render(scene,camera);}};return {\n    setView,zoom,dispose,')});});
 await page.goto('/orb');await expect(page.locator('#orb-start')).toBeEnabled({timeout:45000});await page.locator('#orb-start').click();await expect(page.locator('#orb-loading')).toBeHidden();await page.locator('#orb-sato-invite').click();
 await expect.poll(()=>page.evaluate(()=>orbQA.game.avatar.waking)).toBe(false);
}
test('dash and charged projectile respond to real controls, shader rendering and cancellation',async({page})=>{
 test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await enter(page);await page.evaluate(()=>orbQA.freeze());
 await page.locator('#orb-dash').click();expect(await page.evaluate(()=>orbQA.game.motor.dashing)).toBe(true);
 await page.evaluate(()=>{for(let i=0;i<13;i++)orbQA.game.update(1/120,{time:0});});expect(await page.evaluate(()=>orbQA.game.avatar.legs[0].knee.rotation.x)).toBeGreaterThan(.5);
 await page.evaluate(()=>{for(let i=0;i<13;i++)orbQA.game.update(1/120,{time:0});orbQA.draw();});expect(await page.evaluate(()=>orbQA.game.motor.velocity.length())).toBeGreaterThan(2);
 await page.evaluate(()=>{for(let i=0;i<90;i++)orbQA.game.update(1/120,{time:0});});
 await page.locator('#orb-scene').focus();await page.keyboard.down('f');await page.evaluate(()=>{for(let i=0;i<75;i++)orbQA.game.update(1/60,{time:0});orbQA.draw();});await expect(page.locator('#orb-attack')).toHaveAttribute('data-state','charging');
 await page.keyboard.press('Space');expect(await page.evaluate(()=>orbQA.game.motor.jumps)).toBe(0);
 await page.keyboard.up('f');await page.evaluate(()=>{for(let i=0;i<8;i++)orbQA.game.update(1/120,{time:0});orbQA.draw();});expect(await page.evaluate(()=>orbQA.game.power.shots.filter(p=>p.active).length)).toBe(1);
 await page.evaluate(()=>{for(let i=0;i<720;i++)orbQA.game.update(1/60,{time:0});});expect(await page.evaluate(()=>orbQA.game.power.active)).toBe(false);
 await page.keyboard.down('f');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('f');expect(await page.evaluate(()=>orbQA.game.power.state)).toBe('idle');
 await page.keyboard.down('f');await page.keyboard.press('Escape');await page.keyboard.up('f');await expect(page.locator('#orb-play-controls')).toBeHidden();expect(await page.evaluate(()=>orbQA.game.power.active)).toBe(false);expect(errors).toEqual([]);
});

test('VFX preview stays live while sliders change, saves settings, restores and ignores movement keys',async({page})=>{
 await enter(page);await page.locator('#orb-combat-debug summary').click();await page.locator('[data-preview]').click();
 const input=page.getByRole('spinbutton',{name:'Tamanho da esfera: valor',exact:true});await input.fill('0.09');await input.dispatchEvent('input');expect(await page.evaluate(()=>orbQA.game.power.settings.values.orbSize)).toBe(.09);
 expect(await page.evaluate(()=>orbQA.game.power.previewing)).toBe(true);await input.press('f');expect(await page.evaluate(()=>orbQA.game.power.state)).toBe('charging');
 await page.evaluate(()=>{for(let i=0;i<240;i++)orbQA.game.update(1/60,{time:0});});expect(await page.evaluate(()=>orbQA.game.power.state)).toBe('charging');
 await page.locator('[data-fire]').click();expect(await page.evaluate(()=>orbQA.game.power.previewing)).toBe(false);await page.locator('[data-stop]').click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sato-orb-combat-v1')).values.orbSize)).toBe(.09);
 await page.locator('[data-reset]').click();expect(await page.evaluate(()=>orbQA.game.power.settings.values.orbSize)).toBe(.055);
});

test('power deformation and its slope agree with CPU samples and expose the seabed',async({page})=>{
 test.setTimeout(90000);await enter(page);
 const result=await page.evaluate(async()=>{
  const {T,renderer,water}=orbQA,{orbWaterSurfaceGLSL}=await import('/static/js/orb-water.js'),{seaSurfaceRadius}=await import('/static/js/orb-surface.js');
  const samples=[];for(let i=0;i<64;i++)samples.push(new T.Vector3((i%8-3.5)*.06,Math.sin(Math.floor(i/8)*.11),1).normalize());
  water.uniforms.orbPowerUp.value.set(0,0,1);water.uniforms.orbPowerForward.value.set(0,1,0);water.uniforms.orbPowerCharge.value=1;water.uniforms.orbPowerBeam.value=1;water.uniforms.orbPowerLength.value=2;water.uniforms.orbPowerTime.value=1.37;water.uniforms.orbPowerWake.value=.7;
  const bytes=new Float32Array(samples.length*4);samples.forEach((n,i)=>n.toArray(bytes,i*4));const tex=new T.DataTexture(bytes,64,1,T.RGBAFormat,T.FloatType);tex.needsUpdate=true;
  const material=new T.ShaderMaterial({uniforms:{...water.uniforms,samples:{value:tex}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`varying vec2 vUv;uniform sampler2D samples;${orbWaterSurfaceGLSL}
   void main(){vec3 n=texture2D(samples,vUv).xyz;vec4 f=orbSurface(n),p=orbPowerField(n);float e=.0001;vec3 numeric=vec3(orbPowerField(n+vec3(e,0.,0.)).x-orbPowerField(n-vec3(e,0.,0.)).x,orbPowerField(n+vec3(0.,e,0.)).x-orbPowerField(n-vec3(0.,e,0.)).x,orbPowerField(n+vec3(0.,0.,e)).x-orbPowerField(n-vec3(0.,0.,e)).x)/(2.*e);gl_FragColor=vec4(f.x,length(p.yzw-numeric),0.,1.);}`});
  const scene=new T.Scene(),geometry=new T.PlaneGeometry(2,2);scene.add(new T.Mesh(geometry,material));const target=new T.WebGLRenderTarget(64,1,{type:T.FloatType}),data=new Float32Array(256);renderer.setRenderTarget(target);renderer.render(scene,new T.Camera());renderer.readRenderTargetPixels(target,0,0,64,1,data);renderer.setRenderTarget(null);
  let error=0,slope=0,dry=0;for(let i=0;i<64;i++){error=Math.max(error,Math.abs(data[i*4]-seaSurfaceRadius(samples[i],water.uniforms.orbTime.value,water.uniforms.orbMoonDirection.value,water.uniforms.orbStrength.value,water.settings.values,water.uniforms)));slope=Math.max(slope,data[i*4+1]);if(data[i*4]<1.82)dry++;}
  target.dispose();tex.dispose();geometry.dispose();material.dispose();return {error,slope,dry};
 });expect(result.error).toBeLessThan(.00005);expect(result.slope).toBeLessThan(.025);expect(result.dry).toBeGreaterThan(8);
});
test.describe('touch power controls',()=>{
 test.use({isMobile:true,hasTouch:true});
test('touch attack captures release, cancels interruptions and leaves movement usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await enter(page);
 const button=page.locator('#orb-attack'),cdp=await page.context().newCDPSession(page),bounds=await button.boundingBox(),point={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
 await expect(button).toHaveAttribute('data-state','charging');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(button).toHaveAttribute('data-state','firing');
 await page.evaluate(()=>{for(let i=0;i<220;i++)orbQA.game.update(1/60,{time:0});});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});expect(await page.evaluate(()=>orbQA.game.power.state)).toBe('idle');
 await page.locator('#orb-dash').click();await expect.poll(()=>page.evaluate(()=>orbQA.game.motor.dashCooldown)).toBeGreaterThan(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
});

test('arcade sound envelopes are distinct, water and charge loops stop, and disposal releases voices',async({page})=>{
 await page.goto('/orb');
 const result=await page.evaluate(async()=>{
  const {createOrbSfx}=await import('/static/js/orb-sfx.js'),stats=[];
  for(const event of [{type:'jump'},{type:'jump',double:true},{type:'blast',strength:1},{type:'dash'},{type:'charge-ready'}]){
   const context=new OfflineAudioContext(1,44100,44100),sfx=createOrbSfx(context,context.destination);sfx.handle(event);const data=(await context.startRendering()).getChannelData(0);let energy=0,peak=0,tail=0,crossings=0;for(let i=0;i<data.length;i++){energy+=data[i]**2;peak=Math.max(peak,Math.abs(data[i]));if(i>35000)tail+=data[i]**2;if(i&&data[i]*data[i-1]<0)crossings++;}sfx.dispose();stats.push({rms:Math.sqrt(energy/data.length),peak,tail,crossings,voices:sfx.voiceCount});
  }
  const loops=[];for(const type of ['charge-level','water-flow']){
   const context=new OfflineAudioContext(1,88200,44100),sfx=createOrbSfx(context,context.destination);sfx.handle({type,strength:1,active:true});
   const stop=context.suspend(.4).then(()=>{sfx.handle({type,strength:0,active:false});return context.resume();});const data=(await context.startRendering()).getChannelData(0);await stop;
   const rms=(a,b)=>Math.sqrt(data.slice(a,b).reduce((s,v)=>s+v*v,0)/(b-a));loops.push({on:rms(4410,15000),off:rms(75000,85000)});sfx.dispose();
  }return {stats,loops};
 });
 for(const clip of result.stats){expect(clip.rms).toBeGreaterThan(.001);expect(clip.peak).toBeLessThan(.9);expect(clip.tail).toBeLessThan(.00001);expect(clip.voices).toBe(0);}expect(new Set(result.stats.map(s=>s.crossings)).size).toBe(5);
 for(const loop of result.loops){expect(loop.on).toBeGreaterThan(.001);expect(loop.off).toBeLessThan(.00001);}
});
