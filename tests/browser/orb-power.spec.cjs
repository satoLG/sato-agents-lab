const {test,expect}=require('@playwright/test');
test.use({viewport:{width:900,height:700}});
async function enter(page){
 await page.route('**/js/orb-scene.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/\r\n/g,'\n').replace('return {\n    setView,zoom,dispose,','window.orbQA={T,water,renderer,game};return {\n    setView,zoom,dispose,')});});
 await page.goto('/orb');await expect(page.locator('#orb-start')).toBeEnabled({timeout:45000});await page.locator('#orb-start').click();await expect(page.locator('#orb-loading')).toBeHidden();await page.locator('#orb-sato-invite').click();
 await expect.poll(()=>page.evaluate(()=>orbQA.game.avatar.waking)).toBe(false);
}
test('running and charging work through actual controls and cancel cleanly on blur and exit',async({page})=>{
 test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await enter(page);
 await page.locator('#orb-run').click();await expect(page.locator('#orb-run')).toHaveAttribute('aria-pressed','true');
 await page.locator('#orb-scene').focus();await page.keyboard.down('w');await expect.poll(()=>page.evaluate(()=>orbQA.game.motor.velocity.length())).toBeGreaterThan(.75);await page.keyboard.up('w');
 await page.keyboard.down('f');await expect(page.locator('#orb-attack')).toHaveAttribute('data-state','charging');
 await page.keyboard.press('Space');expect(await page.evaluate(()=>orbQA.game.motor.jumps)).toBe(0);
 await page.evaluate(()=>{for(let i=0;i<75;i++)orbQA.game.update(1/60,{time:0});});expect(await page.evaluate(()=>orbQA.water.uniforms.orbPowerCharge.value)).toBeGreaterThan(.95);
 await page.keyboard.up('f');await expect(page.locator('#orb-attack')).toHaveAttribute('data-state','firing');
 await page.evaluate(()=>{for(let i=0;i<220;i++)orbQA.game.update(1/60,{time:0});});expect(await page.evaluate(()=>orbQA.game.power.state)).toBe('idle');
 await page.keyboard.down('f');await expect(page.locator('#orb-attack')).toHaveAttribute('data-state','charging');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('f');
 expect(await page.evaluate(()=>orbQA.game.power.state)).toBe('idle');expect(await page.evaluate(()=>orbQA.water.uniforms.orbPowerBeam.value)).toBe(0);
 await page.keyboard.down('f');await page.keyboard.press('Escape');await page.keyboard.up('f');await expect(page.locator('#orb-play-controls')).toBeHidden();expect(await page.evaluate(()=>orbQA.game.power.active)).toBe(false);expect(errors).toEqual([]);
});
test('power deformation and its slope agree with CPU samples and expose the seabed',async({page})=>{
 test.setTimeout(90000);await enter(page);
 const result=await page.evaluate(async()=>{
  const {T,renderer,water}=orbQA,{orbWaterSurfaceGLSL}=await import('/static/js/orb-water.js'),{seaSurfaceRadius}=await import('/static/js/orb-surface.js');
  const samples=[];for(let i=0;i<64;i++)samples.push(new T.Vector3((i%8-3.5)*.06,Math.sin(Math.floor(i/8)*.11),1).normalize());
  water.uniforms.orbPowerUp.value.set(0,0,1);water.uniforms.orbPowerForward.value.set(0,1,0);water.uniforms.orbPowerCharge.value=1;water.uniforms.orbPowerBeam.value=1;water.uniforms.orbPowerLength.value=2;
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
 await page.locator('#orb-run').click();await expect(page.locator('#orb-run')).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
});
