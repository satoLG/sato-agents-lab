const {test,expect}=require('@playwright/test');

test('leaf and water shaders compile, animate on the GPU and honor reduced motion',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/js/home-scene.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('return {arrive,react,setScenario,','window.natureQA={world,renderer};return {arrive,react,setScenario,')});});
 await page.addInitScript(()=>localStorage.setItem('sato-home-scenario','forest'));
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 const initial=await page.evaluate(async()=>{
  const {ShaderLib}=await import('/static/vendor/three.module.min.js'),{world,renderer}=natureQA;
  const foliage=world.getObjectByName('wind-canopies'),water=world.getObjectByName('forest-river');
  const compile=material=>{const shader={uniforms:{},vertexShader:ShaderLib.basic.vertexShader,fragmentShader:ShaderLib.basic.fragmentShader};material.onBeforeCompile(shader,renderer);return shader.uniforms;};
  window.natureUniforms={leaf:compile(foliage.material),water:compile(water.material)};
  return {cards:foliage.geometry.attributes.position.count/4,texture:foliage.material.alphaMap.image.src,calls:renderer.info.render.calls,programs:renderer.info.programs.every(p=>p.diagnostics?.runnable!==false),waterTransparent:water.material.transparent};
 });
 expect(initial.cards).toBe(80);expect(initial.texture).toContain('folio-2025/foliageSDF.png');expect(initial.calls).toBeLessThan(80);expect(initial.programs).toBe(true);expect(initial.waterTransparent).toBe(false);
 const times=()=>page.evaluate(()=>[natureUniforms.leaf.natureTime.value,natureUniforms.water.waterTime.value]);
 expect(await times()).toEqual([0,0]);
 await page.emulateMedia({reducedMotion:'no-preference'});await expect.poll(async()=>Math.min(...await times())).toBeGreaterThan(.1);
 const first=await times();await expect.poll(async()=>Math.min(...await times())).toBeGreaterThan(Math.max(...first)+.1);
 await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(times).toEqual([0,0]);
 expect(errors).toEqual([]);
});
