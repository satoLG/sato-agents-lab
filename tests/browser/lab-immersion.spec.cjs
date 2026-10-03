const {test,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:60000});
const {livingFixture}=require('./living-fixture.cjs');
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'no-preference'});

test('floating dual touch controls, room culling and lower shared sector workstations',async({page,request})=>{
  test.setTimeout(240000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await livingFixture(page,request);
  await page.route('**/js/lab-scene.js*',async route=>{
    const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('renderer.render(world,camera);','window.immersionQA={world,camera,campus,avatar,hero,zones,robots,controls,obstacles,circles,audio,stopWalking,groundAt,installations,azimuth,render:()=>renderer.render(world,camera)};if(window.labQARender!==false)renderer.render(world,camera);else{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);}')});
  });
  await page.goto('/lab');await page.waitForFunction(()=>window.immersionQA,null,{timeout:100000});await page.locator('#lab-play').click();
  // Keep input/physics at normal cadence on CPU-only CI; render full frames for captures.
  await page.evaluate(()=>window.labQARender=false);
  await expect(page.locator('.move-stick')).toBeHidden();await expect(page.locator('.aim-stick')).toBeHidden();
  expect(await page.locator('.hud-top #sound-toggle').count()).toBe(1);
  expect(await page.locator('.player-actions button svg').count()).toBe(3);
  const client=await page.context().newCDPSession(page);
  const touch=(id,x,y)=>({id,x,y,radiusX:5,radiusY:5});
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,80,740),touch(2,300,740)]});
  await expect(page.locator('.move-stick')).toBeVisible();await expect(page.locator('.aim-stick')).toBeVisible();
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(1,80,700),touch(2,330,740)]});
  await expect.poll(()=>page.evaluate(()=>Math.hypot(immersionQA.controls.aim.x,immersionQA.controls.aim.y))).toBeGreaterThan(.3);
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('.move-stick')).toBeHidden();await expect(page.locator('.aim-stick')).toBeHidden();
  expect(await page.evaluate(()=>immersionQA.controls.aim)).toEqual({x:0,y:0});
  await page.evaluate(()=>{const q=immersionQA;q.stopWalking();q.avatar.position.set(12,q.groundAt(12,24),24);});
  await expect.poll(()=>page.evaluate(()=>immersionQA.world.getObjectByName('campus-exterior').visible),{timeout:60000}).toBe(false);
  // A mouse aim becomes inactive after the visitor starts moving with the keyboard.
  await page.mouse.move(190,440);await page.locator('#scene').focus();await page.keyboard.down('d');
  await expect.poll(()=>page.evaluate(()=>document.querySelector('#scene').dataset.gait),{timeout:60000}).toBe('walk');
  await expect.poll(()=>page.evaluate(()=>{const q=immersionQA,d=q.controls.read(q.azimuth),heading=Math.atan2(d.x,d.z);return Math.abs(Math.atan2(Math.sin(q.avatar.rotation.y-heading),Math.cos(q.avatar.rotation.y-heading)));}),{timeout:60000}).toBeLessThan(.15);
  await page.keyboard.up('d');
  await page.locator('#sound-toggle').click();await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true',{timeout:60000});
  await page.evaluate(()=>{const q=immersionQA;q.stopWalking();q.avatar.position.set(-7,q.groundAt(-7,22),22);});
  await expect.poll(()=>page.evaluate(()=>immersionQA.campus.exteriorDarkness),{timeout:60000}).toBeGreaterThan(.999);
  const reception=await page.evaluate(()=>{
    const q=immersionQA,g=q.zones.get('gateway').display.root;
    return {exterior:q.world.getObjectByName('campus-exterior').visible,reception:q.campus.reception.visible,sky:q.world.background.getHex(),z:g.getWorldPosition(q.avatar.position.clone()).z/.7,y:g.children.filter(o=>o.isGroup).map(o=>o.position.y)};
  });
  expect(reception.exterior).toBe(false);expect(reception.reception).toBe(true);expect(reception.sky).toBe(0);expect(reception.z).toBeGreaterThan(18.3);expect(Math.max(...reception.y)).toBeLessThan(4.5);
  await expect(page.locator('#interaction')).toBeVisible();expect(await page.locator('#interaction').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await page.evaluate(()=>immersionQA.render());await page.screenshot({path:'/workspace/scratch/lab-immersion-reception-mobile.png'});
  await page.evaluate(()=>{const q=immersionQA;q.stopWalking();q.avatar.position.set(0,q.groundAt(0,3),3);for(const z of q.zones.values())z.history.update({rows:[{when:new Date().toISOString(),name:'Evento de teste',status:'REGISTRADO'}]});});
  await expect.poll(()=>page.evaluate(()=>immersionQA.campus.reception.visible),{timeout:60000}).toBe(false);
  const layout=await page.evaluate(()=>{
    const q=immersionQA;let benches=0,screens=0,vines=0; q.world.traverse(o=>{if(o.name==='sector-shared-workbench')benches++;if(o.name==='dashboard-indicator-screen')screens++;if(o.name==='hanging-vine')vines++;});
    const root=q.robots.get('guide:hermes').rig.root,core=q.robots.get('guide:hermes').rig;
    const north=q.campus.walls.find(w=>w.name==='north'),front=q.campus.walls.find(w=>w.name==='front-left');
    return {benches,screens,vines,coreScale:root.scale.x,orange:core.pupil.material.color.getHex(),historyAbove:[...q.zones.values()].every(z=>z.history.root.position.y>z.display.root.position.y+5.7),activityInWall:q.installations.activityRoot.parent===north.group,doorInWall:front.group.children.some(o=>o.isGroup&&o.position.x!==0)};
  });
  expect(layout.benches).toBe(7);expect(layout.screens).toBe(48);expect(layout.vines).toBeGreaterThan(0);expect(layout.coreScale).toBeGreaterThan(1.2);expect(layout.orange).toBe(0xffca78);expect(layout.historyAbove).toBe(true);expect(layout.activityInWall).toBe(true);expect(layout.doorInWall).toBe(true);
  await page.evaluate(()=>immersionQA.render());await page.screenshot({path:'/workspace/scratch/lab-immersion-core-mobile.png'});
  await page.evaluate(()=>{const q=immersionQA;q.stopWalking();q.avatar.position.set(-24,q.groundAt(-24,-17),-17);});
  await expect(page.locator('#interaction-name')).toContainText('PROVIDERS');await page.evaluate(()=>immersionQA.render());await page.screenshot({path:'/workspace/scratch/lab-immersion-providers-mobile.png'});
  // Culling is reversible when leaving both rooms.
  await page.evaluate(()=>{const q=immersionQA;q.stopWalking();q.avatar.position.set(0,q.groundAt(0,37),37);});
  await expect.poll(()=>page.evaluate(()=>immersionQA.campus.exteriorDarkness),{timeout:60000}).toBeLessThan(.001);
  expect(await page.evaluate(()=>immersionQA.world.getObjectByName('campus-exterior').visible)).toBe(true);
  expect(errors).toEqual([]);
});
