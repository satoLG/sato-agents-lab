const {test,expect}=require('@playwright/test');
const {createHash}=require('node:crypto');

async function exposeScene(page) {
  await page.route('**/js/orb-scene.js',async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace('return {\n    setView,zoom,dispose,','window.orbQA={T,scene,world,water,depth,renderer,camera,core,ocean,island};return {\n    setView,zoom,dispose,');
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
});

test.describe('orb on a phone',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('clean screen supports touch orbit and two-finger zoom',async({page},info)=>{
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));await enter(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({path:info.outputPath('orb-mobile.png')});const before=await pixels(page),cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:230,y:330}]});
    for(let i=1;i<=5;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:230+i*14,y:330+i*4}]});await page.evaluate(()=>new Promise(requestAnimationFrame));}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(()=>pixels(page)).not.toBe(before);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:160,y:340},{x:230,y:340}]});
    for(let i=1;i<=5;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160-i*4,y:340},{x:230+i*4,y:340}]});await page.evaluate(()=>new Promise(requestAnimationFrame));}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>Number(await page.locator('#orb-scene').getAttribute('data-zoom'))).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });
});

test('orb explains unavailable WebGL and removes loading',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
  await page.goto('/orb');await expect(page.locator('#orb-error')).toBeVisible();await expect(page.locator('#orb-loading')).toBeHidden();await expect(page.locator('#orb-error-detail')).toContainText('WebGL 2');await expect(page.locator('#orb-retry')).toBeEnabled();
});
