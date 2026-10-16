const {test,expect}=require('@playwright/test');
async function enter(page){
  await page.route('**/js/orb-scene.js',async route=>{
    const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('return {\n    setView,zoom,dispose,','window.orbQA={T,renderer,water,game,camera,island};return {\n    setView,zoom,dispose,')});
  });
  await page.goto('/orb');await expect(page.locator('#orb-start')).toBeEnabled({timeout:45000});await page.locator('#orb-start').click();await expect(page.locator('#orb-loading')).toBeHidden();
}
test('water controls update live, isolate keyboard input, persist and export a preset',async({page,context})=>{
  test.setTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await context.grantPermissions(['clipboard-read','clipboard-write']);await enter(page);
  await page.locator('#orb-sato-invite').click();
  const value=page.getByRole('spinbutton',{name:'Frequência espacial: valor'});await value.fill('1.8');
  await value.press('ArrowUp');
  expect(await page.evaluate(()=>orbQA.game.motor.velocity.length())).toBe(0);
  await expect.poll(()=>page.evaluate(()=>orbQA.water.uniforms.orbWaveFrequency.value)).toBe(1.85);
  await page.getByRole('spinbutton',{name:'Opacidade: valor',exact:true}).fill('0.6');
  expect(await page.evaluate(()=>orbQA.water.material.opacity)).toBe(.6);
  await page.getByRole('button',{name:'Modo print'}).click();
  await expect(page.locator('#water-frequency')).toBeHidden();await expect(value).toBeVisible();
  await page.getByRole('button',{name:'Copiar valores'}).click();
  const preset=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));expect(preset.frequency).toBe(1.85);expect(preset.opacity).toBe(.6);
  await page.reload();await expect(page.locator('#orb-start')).toBeEnabled({timeout:45000});await page.locator('#orb-start').click();
  await expect(page.getByRole('spinbutton',{name:'Frequência espacial: valor'})).toHaveValue('1.85');
  await page.getByRole('button',{name:'Restaurar'}).click();expect(await page.evaluate(()=>orbQA.water.settings.values.frequency)).toBe(1);
  expect(await page.evaluate(()=>orbQA.island.trunks.length)).toBe(3);expect(errors).toEqual([]);
});
test('non-default wave presets keep rendered heights and gradients consistent with CPU contacts',async({page})=>{
  test.setTimeout(90000);await enter(page);
  const result=await page.evaluate(async()=>{
    const {T,renderer,water}=orbQA,{orbWaterSurfaceGLSL}=await import('/static/js/orb-water.js'),{seaSurfaceRadius}=await import('/static/js/orb-surface.js');
    const samples=Array.from({length:64},(_,i)=>new T.Vector3(Math.cos(i*2.399),Math.sin(i*.61),Math.sin(i*2.399)).normalize());
    const bytes=new Float32Array(samples.length*4);samples.forEach((n,i)=>n.toArray(bytes,i*4));
    const texture=new T.DataTexture(bytes,samples.length,1,T.RGBAFormat,T.FloatType);texture.needsUpdate=true;
    const material=new T.ShaderMaterial({uniforms:{...water.uniforms,directions:{value:texture}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`varying vec2 vUv;uniform sampler2D directions;${orbWaterSurfaceGLSL}
      void main(){vec3 n=texture2D(directions,vUv).xyz;vec4 f=orbSurface(n);float e=.0001;
      vec3 numeric=vec3(orbSurface(normalize(n+vec3(e,0.,0.))).x-orbSurface(normalize(n-vec3(e,0.,0.))).x,orbSurface(normalize(n+vec3(0.,e,0.))).x-orbSurface(normalize(n-vec3(0.,e,0.))).x,orbSurface(normalize(n+vec3(0.,0.,e))).x-orbSurface(normalize(n-vec3(0.,0.,e))).x)/(2.*e);
      gl_FragColor=vec4(f.x,length(normalize(n*f.x-(f.yzw-n*dot(n,f.yzw)))-normalize(n*f.x-numeric)),0.,1.);}`});
    const scene=new T.Scene(),geometry=new T.PlaneGeometry(2,2);scene.add(new T.Mesh(geometry,material));
    const target=new T.WebGLRenderTarget(samples.length,1,{type:T.FloatType}),data=new Float32Array(samples.length*4);let cpuError=0,normalError=0;
    for(const preset of [{frequency:.35,height:0,amplitude:.2,speed:.2},{frequency:1.8,height:1.6,amplitude:1.3,speed:1.7},{frequency:2.5,height:2,amplitude:1.5,speed:2}]){
      water.settings.apply(preset);water.uniforms.orbTime.value=7;renderer.setRenderTarget(target);renderer.render(scene,new T.Camera());renderer.readRenderTargetPixels(target,0,0,samples.length,1,data);
      samples.forEach((n,i)=>{cpuError=Math.max(cpuError,Math.abs(data[i*4]-seaSurfaceRadius(n,7,water.uniforms.orbMoonDirection.value,preset.amplitude,preset)));normalError=Math.max(normalError,data[i*4+1]);});
    }
    renderer.setRenderTarget(null);water.settings.reset();geometry.dispose();material.dispose();texture.dispose();target.dispose();return {cpuError,normalError};
  });
  expect(result.cpuError).toBeLessThan(.00005);expect(result.normalError).toBeLessThan(.02);
});
test('mobile debug can be opened, collapsed and printed without overflowing the viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await enter(page);
  const panel=page.locator('#orb-water-debug');await expect(panel).not.toHaveAttribute('open','');
  await panel.locator('summary').click();await page.getByRole('button',{name:'Modo print'}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  expect(await panel.evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
  await expect(page.getByRole('spinbutton',{name:'Partículas · quantidade: valor'})).toBeInViewport();
  await panel.locator('summary').click();await expect(page.locator('#water-frequency')).toBeHidden();
});
