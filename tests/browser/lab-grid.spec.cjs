const {test,expect:baseExpect}=require('@playwright/test');
const {livingFixture}=require('./living-fixture.cjs');
const expect=baseExpect.configure({timeout:30000});
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'no-preference'});
test('grid composition, contextual touch controls and doorway-only room transitions',async({page,request},testInfo)=>{
 test.setTimeout(240000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const {state}=await livingFixture(page,request);
 // Synthetic endpoint data is confined to this QA fixture, never production telemetry.
 const channels={stats:{data:{month:'2026-10',total_calls:2347,total_cost:1.2345,fallback_rate:2,daily:[{calls:5},{calls:8},{calls:3}]}},vm:{data:{hostname:'QA host',cpu:{total:42},memory:{total:4096,used_percent:61},filesystems:[{mount:'/',used_percent:57}],top_processes:[{command:'hermes',pid:'42',cpu:12.5},{command:'python',pid:'100',cpu:3.2}],uptime_seconds:7200}},live:{data:{processes:[{},{}],events:[{kind:'prompt'}]}},memory:{data:{exists:true,skills:[{},{},{}],documents:[{},{}],count:12}},rag:{data:{total:30,by_repo:[{},{}],by_type:{doc:30}}},mcp:{data:{servers:[{failures:0},{failures:1}],total_calls:7}},events:{data:{jobs:[{},{}],webhooks:{available:true,routes:[{}]},failed_runs:0}}};
 const boards=Object.fromEntries(['gateway','vm','hermes','models','mcp','memory','rag','cron'].map(id=>[id,{rows:[{when:new Date().toISOString(),name:'Execução de teste',status:'REGISTRADO'}]}]));
 await page.route('**/api/lab/stream',route=>route.fulfill({contentType:'text/event-stream',body:`event: telemetry\ndata: ${JSON.stringify({state,channels,boards})}\n\n`}));
 await page.addInitScript(()=>window.labQARender=false);
 await page.route('**/js/lab-scene.js*',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('renderer.render(world,camera);','window.gridQA={world,camera,campus,hall,avatar,hero,zones,robots,controls,obstacles,circles,parcels,stopWalking,groundAt,installations,ragDome,setRagOpen,setCameraMode,render:()=>renderer.render(world,camera)};if(window.labQARender!==false)renderer.render(world,camera);else{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);}')});
 });
 await page.goto('/lab');await page.waitForFunction(()=>window.gridQA,null,{timeout:100000});await page.locator('#lab-play').click();
 await page.evaluate(()=>window.labQARender=false);
 await expect(page.locator('.aim-zone')).toHaveCount(0);await expect(page.locator('.player-actions')).toBeHidden();
 const client=await page.context().newCDPSession(page),touch=(id,x,y)=>({id,x,y,radiusX:5,radiusY:5});
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,80,740)]});await expect(page.locator('.move-stick')).toBeVisible();await expect(page.locator('.player-actions')).toBeHidden();
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(1,80,700)]});await expect(page.locator('.player-actions')).toBeVisible();
 const actions=await page.locator('.player-actions').boundingBox();expect(actions.y+actions.height).toBeGreaterThan(800);expect(actions.x).toBeGreaterThan(190);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(1,80,700),touch(2,288,803)]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[touch(1,80,700)]});await expect.poll(()=>page.evaluate(()=>gridQA.hero.jumpHeight)).toBeGreaterThan(.1);
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('.player-actions')).toBeHidden();await expect(page.locator('.move-stick')).toBeHidden();
 await page.evaluate(()=>{const q=gridQA;q.stopWalking();q.avatar.position.set(-14,q.groundAt(-14,25),25);});
 await expect(page.locator('#interaction')).toBeVisible();await expect(page.locator('#interaction .input-button img')).toHaveCount(1);
 expect(await page.locator('#interaction').evaluate(el=>getComputedStyle(el).userSelect)).toBe('none');
 await page.locator('#scene').focus();await page.keyboard.press('d');await expect(page.locator('#interaction kbd')).toHaveText('E');
 const layout=await page.evaluate(async()=>{
  const q=gridQA,{findPath}=await import('/static/js/lab-navigation.js'),T=await import('/static/vendor/three.module.min.js');
  return {banks:[...q.zones.values()].map(z=>({id:z.display.root.userData.sector,numberX:z.sign.position.x-z.group.position.x,monitorX:z.display.root.position.x,historyX:z.history.root.position.x,numberZ:z.sign.position.z-z.group.position.z,monitorZ:z.display.root.position.z,historyZ:z.history.root.position.z})),
   roots:[...q.installations.roots].map(([id,root])=>({id,name:root.name,cells:root.userData.grid})),
   routes:[...q.robots.values()].filter(r=>r.worker.kind==='guide').map(r=>{const p=r.rig.root.position,target={x:p.x,z:p.z+1.6},path=findPath({x:0,z:25},target,q.obstacles,q.circles);return {id:r.worker.id,path:path.length};}),
   equipmentFits:[...q.installations.roots].filter(([id])=>id!=='models').map(([id,root])=>{const b=new T.Box3().setFromObject(root),f=root.userData.grid;return {id,fits:b.min.x/.7>=root.position.x-f.w-1e-4&&b.max.x/.7<=root.position.x+f.w+1e-4&&b.min.z/.7>=root.position.z-f.d-1e-4&&b.max.z/.7<=root.position.z+f.d+1e-4};}),
   mapX:q.campus.metro.position.x,gatewayX:q.zones.get('gateway').group.position.x};
 });
 for(const bank of layout.banks){expect(bank.numberX).toBe(-7);expect(bank.monitorX).toBe(0);expect(bank.historyX).toBe(7);expect(bank.numberZ).toBeCloseTo(bank.monitorZ,1);expect(bank.historyZ).toBeCloseTo(bank.monitorZ,1);}
 expect(layout.mapX).toBe(-layout.gatewayX);expect(layout.roots).toHaveLength(7);expect(layout.routes.every(r=>r.path>0),JSON.stringify(layout.routes)).toBe(true);expect(layout.equipmentFits.every(r=>r.fits),JSON.stringify(layout.equipmentFits)).toBe(true);
 for(const [x,z,hall]of [[39,26,false],[-39,17,true],[20,32,false]]){
  await page.evaluate(([x,z])=>{const q=gridQA;q.stopWalking();q.avatar.position.set(x,q.groundAt(x,z),z);q.campus.tick(10,q.avatar.position,q.camera);},[x,z]);
  expect(await page.evaluate(()=>gridQA.world.getObjectByName('campus-exterior').visible)).toBe(false);
  expect(await page.evaluate(()=>gridQA.campus.reception.visible)).toBe(!hall);
 }
 await page.evaluate(()=>{const q=gridQA;q.stopWalking();q.avatar.position.set(0,q.groundAt(0,18),18);q.campus.tick(10,q.avatar.position,q.camera);});expect(await page.evaluate(()=>gridQA.campus.hallLight)).toBeGreaterThan(.1);expect(await page.evaluate(()=>gridQA.campus.hallLight)).toBeLessThan(.9);
 // Capture all requested equipment in the actual scene, using the CPU-friendly render switch.
 for(const [id,x,z]of [['core',4,3],['providers',-28,-24],['mcp',-10,-24],['skills',10,-24],['rag',28,-24],['vm',-28,15],['events',28,15],['gateway',-14,26]]){
  await page.evaluate(([x,z])=>{const q=gridQA;q.stopWalking();q.avatar.position.set(x,q.groundAt(x,z),z);q.campus.tick(10,q.avatar.position,q.camera);},[x,z]);
  await page.waitForTimeout(1200);await page.evaluate(()=>gridQA.render());await page.screenshot({path:testInfo.outputPath(`${id}-mobile.png`)});
 }
 await page.evaluate(()=>{const q=gridQA;q.stopWalking();q.avatar.position.set(28,q.groundAt(28,-24),-24);});await expect(page.locator('#interaction strong')).toHaveText('Explorar vetores');await page.locator('#interaction').click();await expect(page.locator('#rag-panel')).toBeVisible();await expect(page.locator('#scene')).toHaveAttribute('data-camera','rag');await page.waitForTimeout(1200);await page.evaluate(()=>gridQA.render());await page.screenshot({path:testInfo.outputPath('rag-zoom.png')});
 await page.locator('#rag-close').click();await page.setViewportSize({width:900,height:720});await page.evaluate(()=>{const q=gridQA;q.avatar.position.set(-33,q.groundAt(-33,29),29);q.setCameraMode('follow');q.campus.tick(10,q.avatar.position,q.camera);});await page.waitForTimeout(1500);await page.evaluate(()=>gridQA.render());await page.screenshot({path:testInfo.outputPath('conveyor.png')});await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{const q=gridQA;q.avatar.position.set(0,q.groundAt(0,2),2);q.setCameraMode('room');q.campus.tick(10,q.avatar.position,q.camera);});await page.waitForTimeout(1500);await page.evaluate(()=>gridQA.render());await page.screenshot({path:testInfo.outputPath('overview.png')});
 expect(errors).toEqual([]);
});
