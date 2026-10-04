const {test,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:30000});
const {livingFixture}=require('./living-fixture.cjs');
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'no-preference'});

test('prompts avoid projected interaction objects and mouse movement does not aim the avatar',async({page,request})=>{
 test.setTimeout(150000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await livingFixture(page,request);await page.addInitScript(()=>window.labQARender=false);
 await page.route('**/js/lab-scene.js*',async route=>{
  const response=await route.fetch();const source=(await response.text()).replace('callbacks.onPromptPosition(anchor,rectangles);','window.promptRects={anchor,rectangles};callbacks.onPromptPosition(anchor,rectangles);').replace('renderer.render(world,camera);','window.immersionQA={world,camera,campus,avatar,zones,robots,controls,stopWalking,groundAt,installations};if(window.labQARender!==false)renderer.render(world,camera);else{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);}');
  await route.fulfill({response,body:source});
 });
 await page.goto('/lab');await page.waitForFunction(()=>window.immersionQA,null,{timeout:100000});await page.locator('#lab-play').click();
 for(const [x,z]of [[-14,24],[4,3],[-28,-24],[28,-24]]){
  await page.evaluate(([x,z])=>{const q=immersionQA;q.stopWalking();q.avatar.position.set(x,q.groundAt(x,z),z);},[x,z]);
  await expect(page.locator('#interaction')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>{
   const r=document.getElementById('interaction').getBoundingClientRect();
   return promptRects.rectangles.every(o=>Math.max(0,Math.min(r.right,o.right)-Math.max(r.left,o.left))*Math.max(0,Math.min(r.bottom,o.bottom)-Math.max(r.top,o.top))<1);
  })).toBe(true);
 }
 const angle=await page.evaluate(()=>immersionQA.avatar.rotation.y);await page.mouse.move(100,400);await page.waitForTimeout(250);expect(await page.evaluate(()=>immersionQA.avatar.rotation.y)).toBeCloseTo(angle);
 const composition=await page.evaluate(()=>{
  const q=immersionQA;let screens=0,vines=0,cabinets=0;q.world.traverse(o=>{if(o.name==='dashboard-indicator-screen')screens++;if(o.name==='hanging-vine')vines++;if(o.name==='working-server-cabinet')cabinets++;});
  return {screens,vines,cabinets,equipmentMeshes:[...q.installations.roots.values()].map(root=>{let n=0;root.traverse(o=>{if(o.isMesh)n++;});return n;})};
 });
 expect(composition.screens).toBe(48);expect(composition.vines).toBeGreaterThan(0);expect(composition.cabinets).toBe(9);expect(composition.equipmentMeshes.every(n=>n>3)).toBe(true);expect(errors).toEqual([]);
});
