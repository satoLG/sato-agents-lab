const {test,expect}=require('@playwright/test');
const {createHash}=require('node:crypto');

async function exposeScene(page) {
  await page.route('**/js/orb-scene.js',async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace('return {\n    setView,zoom,dispose,','window.orbQA={T,scene,world,water,depth,renderer,camera,core,ocean,island,moon,worldPosition,controls,get transitioning(){return Boolean(transition);}};return {\n    setView,zoom,dispose,');
    await route.fulfill({response,body});
  });
}
async function enter(page) {
  await page.goto('/orb',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#orb-scene')).toHaveAttribute('data-ready','true',{timeout:45000});
  await expect(page.locator('#orb-start')).toBeEnabled();
  await page.locator('#orb-start').click();await expect(page.locator('#orb-loading')).toBeHidden();
}
async function pixels(page) {
  const {width,height}=page.viewportSize();
  return createHash('sha256').update(await page.screenshot({clip:{x:Math.floor(width/2-64),y:Math.floor(height/2-64),width:128,height:128}})).digest('hex');
}
async function loadingFit(page) {
  return page.evaluate(()=>{
    const {T,camera,ocean}=orbQA,stage=document.querySelector('#orb-scene').getBoundingClientRect(),button=document.querySelector('#orb-start').getBoundingClientRect();
    const positions=ocean.geometry.attributes.position,point=new T.Vector3();let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).project(camera);minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);}
    return {diameter:button.width,planetWidth:(maxX-minX)*stage.width/2,planetHeight:(maxY-minY)*stage.height/2,planetX:stage.x+stage.width/2+(maxX+minX)*stage.width/4,planetY:stage.y+stage.height/2-(maxY+minY)*stage.height/4,buttonX:button.x+button.width/2,buttonY:button.y+button.height/2};
  });
}
function expectLoadingFit(fit) {
  expect(fit.diameter).toBeGreaterThan(100);expect(Math.abs(fit.planetWidth-fit.diameter)).toBeLessThan(1);expect(Math.abs(fit.planetHeight-fit.diameter)).toBeLessThan(1);expect(Math.abs(fit.planetX-fit.buttonX)).toBeLessThan(1);expect(Math.abs(fit.planetY-fit.buttonY)).toBeLessThan(1);
}
async function expectMoonOrbitFits(page) {
  const bounds=await page.evaluate(()=>{
    const {T,moon,camera}=orbQA,stage=document.querySelector('#orb-scene').getBoundingClientRect(),p=new T.Vector3(),positions=moon.mesh.geometry.attributes.position;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(let t=0;t<300;t+=37.5){moon.update(t);moon.mesh.updateMatrixWorld();for(let i=0;i<positions.count;i++){
      p.fromBufferAttribute(positions,i).applyMatrix4(moon.mesh.matrixWorld).project(camera);
      const x=(p.x+1)*stage.width/2,y=(1-p.y)*stage.height/2;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }}
    moon.update(0);return {minX,maxX,minY,maxY,width:stage.width,height:stage.height};
  });
  expect(bounds.minX).toBeGreaterThan(0);expect(bounds.minY).toBeGreaterThan(0);expect(bounds.maxX).toBeLessThan(bounds.width);expect(bounds.maxY).toBeLessThan(bounds.height);
}

test.describe('orb desktop',()=>{
  test.use({viewport:{width:1100,height:850}});
  test('portfolio loading reflects readiness, then reveals a clean interactive world',async({page},info)=>{
    test.setTimeout(90000);
    const errors=[],remote=[],api=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{const url=new URL(r.url());if(url.origin!==new URL(info.project.use.baseURL).origin)remote.push(url.href);if(url.pathname.startsWith('/api/'))api.push(url.pathname);});
    let release;const textureReady=new Promise(resolve=>{release=resolve;});
    await page.route('**/foliageSDF.png',async route=>{await textureReady;await route.continue();});
    await exposeScene(page);await page.goto('/orb',{waitUntil:'domcontentloaded'});
    await expect(page.locator('#orb-start')).toBeDisabled();
    await expect.poll(async()=>Number(await page.locator('#orb-progress').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect(Number(await page.locator('#orb-progress').getAttribute('aria-valuenow'))).toBeLessThan(100);
    await expect(page.locator('.wave-wrapper')).toHaveCount(3);
    await page.screenshot({path:info.outputPath('orb-loading.png')});release();
    await expect(page.locator('#orb-start')).toBeEnabled({timeout:45000});
    expectLoadingFit(await loadingFit(page));
    await expect(page.locator('#orb-progress')).toHaveAttribute('aria-valuenow','100');await page.locator('#orb-start').click();await expect(page.locator('#orb-loading')).toBeHidden();
    await expect(page.locator('#orb-settings')).toHaveCount(0);await expect(page.locator('header,nav,input,aside')).toHaveCount(0);
    const details=await page.evaluate(()=>{
      const {water,world,renderer}=orbQA,grass=world.getObjectByName('camera-facing-procedural-grass'),trees=world.getObjectByName('wind-canopies');
      return {strength:water.uniforms.orbStrength.value,transmission:water.material.transmission,grass:grass.geometry.instanceCount,cards:trees.geometry.attributes.position.count/4,texture:trees.material.alphaMap.image.src,programs:renderer.info.programs.every(p=>p.diagnostics?.runnable!==false)};
    });
    expect(details.strength).toBeGreaterThan(.55);expect(details.transmission).toBe(1);expect(details.grass).toBeGreaterThan(1000);expect(details.cards).toBe(80);expect(details.texture).toContain('folio-2025/foliageSDF.png');expect(details.programs).toBe(true);
    await page.screenshot({path:info.outputPath('orb-world.png')});const before=await pixels(page);
    await page.locator('#orb-scene').focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>pixels(page)).not.toBe(before);
    await page.keyboard.press('+');await expect.poll(async()=>Number(await page.locator('#orb-scene').getAttribute('data-zoom'))).toBeGreaterThan(1);
    await page.keyboard.press('0');await expect(page.locator('#orb-scene')).toHaveAttribute('data-zoom','1.00');
    expect(errors).toEqual([]);expect(remote).toEqual([]);expect(api).toEqual([]);
  });

  test('depth foam follows any intersecting mesh and disappears for deep geometry',async({page})=>{
    test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await exposeScene(page);await enter(page);
    const counts=await page.evaluate(async()=>{
      const {T,scene,world,water,depth,renderer,camera,ocean}=orbQA;
      for(const child of scene.children)if(child!==world&&!child.isLight)child.visible=false;
      for(const child of world.children)child.visible=child===ocean;
      const original=water.material.onBeforeCompile;
      water.material.onBeforeCompile=shader=>{original(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','gl_FragColor=vec4(vec3(orbEdgeFoamRaw),1.);');};
      water.material.customProgramCacheKey=()=> 'orb-foam-mask-qa';water.material.transmission=0;water.material.needsUpdate=true;
      const direction=camera.position.clone().normalize(),probe=new T.Mesh(new T.SphereGeometry(.18,24,16),new T.MeshBasicMaterial({color:'#7a887a'}));world.add(probe);
      const size=renderer.getDrawingBufferSize(new T.Vector2()),target=new T.WebGLRenderTarget(size.x,size.y),data=new Uint8Array(size.x*size.y*4);
      await renderer.compileAsync(scene,camera);
      function sample(radius) {
        probe.visible=radius!==null;if(radius!==null)probe.position.copy(direction).multiplyScalar(radius);
        depth.capture(camera);probe.visible=false;
        renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,size.x,size.y,data);renderer.setRenderTarget(null);
        let count=0;for(let i=0;i<data.length;i+=4)if(data[i]>128)count++;return count;
      }
      // Partially submerge the probe so its visible face crosses the wavy
      // surface; a sphere centered above it hides its own contact line.
      const output={empty:sample(null),contact:sample(1.93),deep:sample(1.1)};
      target.dispose();probe.geometry.dispose();probe.material.dispose();world.remove(probe);return output;
    });
    expect(counts.empty).toBe(0);expect(counts.contact).toBeGreaterThan(30);expect(counts.deep).toBe(0);expect(errors).toEqual([]);
  });

  test('lunar tide follows the orbit and keeps water on the opposite side',async({page},info)=>{
    test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await exposeScene(page);await enter(page);
    await page.screenshot({path:info.outputPath('orb-moon.png')});
    const before=await page.evaluate(()=>orbQA.moon.mesh.position.toArray());
    await page.locator('#orb-scene').focus();await page.keyboard.press('Space');
    await expect.poll(()=>page.evaluate(()=>orbQA.moon.mesh.position.toArray())).not.toEqual(before);
    await page.keyboard.press('Space');
    const tracking=await page.evaluate(()=>orbQA.water.uniforms.orbMoonDirection.value.distanceTo(orbQA.moon.mesh.position.clone().normalize()));expect(tracking).toBeLessThan(1e-8);
    const result=await page.evaluate(async()=>{
      const {T,scene,world,water,renderer,ocean,moon}=orbQA;
      world.position.set(0,0,0);for(const child of scene.children)if(child!==world&&!child.isLight)child.visible=false;
      for(const child of world.children)child.visible=child===ocean;
      // Read the actual physical water's displaced radius on the GPU. Turn
      // off short waves first to isolate the slower lunar tide.
      water.uniforms.orbStrength.value=0;water.uniforms.orbTime.value=0;
      const original=water.material.onBeforeCompile;
      water.material.onBeforeCompile=shader=>{original(shader);shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','gl_FragColor=vec4(vec3((length(vOrbPosition)-2.05+.2)/.4),1.);');};
      water.material.customProgramCacheKey=()=> 'orb-lunar-radius-qa';water.material.transmission=0;water.material.needsUpdate=true;
      renderer.toneMapping=T.NoToneMapping;renderer.outputColorSpace=T.LinearSRGBColorSpace;
      const camera=new T.PerspectiveCamera(18,1,.05,150),target=new T.WebGLRenderTarget(65,65),data=new Uint8Array(4);
      moon.update(0);const near=moon.mesh.position.clone().normalize(),far=near.clone().negate(),equator=new T.Vector3().crossVectors(near,new T.Vector3(0,1,0)).normalize();
      camera.position.copy(near).multiplyScalar(8);camera.lookAt(0,0,0);await renderer.compileAsync(scene,camera);
      function height(direction){camera.position.copy(direction).multiplyScalar(8);camera.lookAt(0,0,0);renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,32,32,1,1,data);renderer.setRenderTarget(null);return data[0]/255*.4-.2;}
      const first={near:height(near),far:height(far),equator:height(equator)};
      moon.update(150);const opposite={near:height(near),far:height(far),equator:height(equator)};
      // With waves restored, both faces must continue changing over time.
      water.uniforms.orbStrength.value=.9;const waves0={near:height(near),far:height(far)};
      water.uniforms.orbTime.value=8;const waves8={near:height(near),far:height(far)};
      target.dispose();return {first,opposite,waves0,waves8};
    });
    for(const tide of [result.first,result.opposite]){expect(tide.near).toBeGreaterThan(.02);expect(tide.far).toBeGreaterThan(.02);expect(tide.equator).toBeGreaterThan(.006);}
    expect(result.first.near-result.first.far).toBeGreaterThan(.01);expect(result.opposite.far-result.opposite.near).toBeGreaterThan(.01);
    expect(Math.abs(result.first.near-result.opposite.far)).toBeLessThan(.003);expect(Math.abs(result.first.far-result.opposite.near)).toBeLessThan(.003);
    expect(Math.abs(result.waves0.near-result.waves8.near)).toBeGreaterThan(.003);expect(Math.abs(result.waves0.far-result.waves8.far)).toBeGreaterThan(.003);expect(errors).toEqual([]);
  });
});

test.describe('orb with normal motion',()=>{
  test.use({viewport:{width:1100,height:850},reducedMotion:'no-preference'});
  test('play stays visible, the entry zoom is gradual and the canvas accepts input',async({page},info)=>{
    test.setTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await exposeScene(page);
    await page.route('**/js/orb.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('scene.setPaused(true);','window.orbController=scene;scene.setPaused(true);')});});
    await page.goto('/orb',{waitUntil:'domcontentloaded'});await expect(page.locator('#orb-start')).toBeEnabled({timeout:45000});
    await expect(page.locator('#orb-start')).toBeVisible();
    await expect.poll(()=>page.locator('#orb-start').evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1);
    await expect.poll(()=>page.locator('.start-icon').evaluate(el=>Number(getComputedStyle(el).opacity))).toBe(1);
    expect(await page.locator('#orb-start').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    expectLoadingFit(await loadingFit(page));
    await page.screenshot({path:info.outputPath('orb-ready-play.png')});
    // A resize before play must recompute camera distance, keeping the circle fit.
    await page.setViewportSize({width:390,height:844});await expect.poll(async()=>Math.abs((await loadingFit(page)).planetWidth-(await loadingFit(page)).diameter)).toBeLessThan(1);expectLoadingFit(await loadingFit(page));
    await page.setViewportSize({width:1100,height:850});await expect.poll(async()=>Math.abs((await loadingFit(page)).planetWidth-(await loadingFit(page)).diameter)).toBeLessThan(1);
    const before=await page.evaluate(()=>orbQA.camera.position.distanceTo(orbQA.controls.target));
    await page.locator('#orb-start').click();
    // Freeze water only during readback on software WebGL; the real camera
    // transition still advances and is checked through its actual matrices.
    await page.evaluate(()=>orbController.setPaused(true));
    const intermediate=await page.evaluate(()=>({distance:orbQA.camera.position.distanceTo(orbQA.controls.target),transitioning:orbQA.transitioning,inert:document.querySelector('#orb-scene').inert,hit:document.elementFromPoint(600,450).tagName}));
    expect(intermediate.transitioning).toBe(true);expect(intermediate.inert).toBe(false);expect(intermediate.distance).toBeGreaterThan(17);expect(intermediate.distance).toBeLessThanOrEqual(before);
    expect(intermediate.hit).toBe('CANVAS');
    await expect(page.locator('#orb-loading')).toBeHidden();
    await expect.poll(()=>page.evaluate(()=>orbQA.transitioning),{timeout:12000}).toBe(false);
    const final=await page.evaluate(()=>({position:orbQA.camera.position.toArray(),expected:orbQA.worldPosition.toArray()}));for(const [i,value]of final.expected.entries())expect(final.position[i]).toBeCloseTo(value,5);await expect(page.locator('#orb-scene')).toHaveAttribute('data-zoom','1.00');
    await expectMoonOrbitFits(page);
    await page.screenshot({path:info.outputPath('orb-after-zoom.png')});
    const theta=await page.evaluate(()=>orbQA.controls.getAzimuthalAngle());
    await page.mouse.move(600,450);await page.mouse.down();await page.mouse.move(680,470,{steps:4});await page.mouse.up();
    await expect.poll(()=>page.evaluate(()=>orbQA.controls.getAzimuthalAngle())).not.toBe(theta);
    const zoom=Number(await page.locator('#orb-scene').getAttribute('data-zoom'));await page.mouse.wheel(0,-180);await expect.poll(async()=>Number(await page.locator('#orb-scene').getAttribute('data-zoom'))).toBeGreaterThan(zoom);
    await page.mouse.wheel(0,650);await expect.poll(async()=>Number(await page.locator('#orb-scene').getAttribute('data-zoom'))).toBeLessThan(.9);
    expect(errors).toEqual([]);
  });
});

test.describe('orb on a phone',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('clean screen supports touch orbit and two-finger zoom',async({page},info)=>{
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));await exposeScene(page);await enter(page);
    await expectMoonOrbitFits(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({path:info.outputPath('orb-mobile.png')});const before=await page.evaluate(()=>orbQA.controls.getAzimuthalAngle()),cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:230,y:330}]});
    for(let i=1;i<=5;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:230+i*14,y:330+i*4}]});await page.evaluate(()=>new Promise(requestAnimationFrame));}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(()=>page.evaluate(()=>orbQA.controls.getAzimuthalAngle())).not.toBe(before);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:160,y:340},{x:230,y:340}]});
    for(let i=1;i<=5;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160-i*4,y:340},{x:230+i*4,y:340}]});await page.evaluate(()=>new Promise(requestAnimationFrame));}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>Number(await page.locator('#orb-scene').getAttribute('data-zoom'))).toBeGreaterThan(1);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:340},{x:250,y:340}]});
    for(let i=1;i<=5;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:140+i*8,y:340},{x:250-i*8,y:340}]});await page.evaluate(()=>new Promise(requestAnimationFrame));}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>Number(await page.locator('#orb-scene').getAttribute('data-zoom'))).toBeLessThan(.9);
    expect(errors).toEqual([]);
  });
});

test('orb explains unavailable WebGL and removes loading',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
  await page.goto('/orb');await expect(page.locator('#orb-error')).toBeVisible();await expect(page.locator('#orb-loading')).toBeHidden();await expect(page.locator('#orb-error-detail')).toContainText('WebGL 2');await expect(page.locator('#orb-retry')).toBeEnabled();
});
