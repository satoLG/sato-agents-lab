const {test,expect}=require('@playwright/test');

test('grouped hall reveals gradually, keeps routes accessible and decodes opt-in sound',async({page})=>{
  test.setTimeout(180000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{
    window.decodedSamples=0;const decode=AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData=async function(...args){const buffer=await decode.apply(this,args);window.decodedSamples++;return buffer;};
  });
  await page.route('**/js/lab-scene.js',async route=>{
    const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('renderer.render(world,camera);','window.layoutCheck={world,camera,campus,hall,hallReveal,avatar,robots,parcels,obstacles,stopWalking,setCameraMode,groundAt};renderer.render(world,camera);')});
  });
  await page.goto('/lab');await page.waitForFunction(()=>window.layoutCheck,null,{timeout:90000});
  await page.locator('#lab-play').click();
  await page.evaluate(()=>{layoutCheck.stopWalking();layoutCheck.avatar.position.set(0,.06,24);});
  await expect.poll(()=>page.evaluate(()=>layoutCheck.campus.hallLight)).toBeLessThan(.001);
  expect(await page.evaluate(()=>layoutCheck.hall.visible)).toBe(true);
  const state=await page.evaluate(()=>({
    gateways:[...layoutCheck.robots.values()].filter(r=>r.worker.sector==='gateway').length,
    routes:layoutCheck.parcels.couriers.map(c=>({id:c.id,length:c.curve.getLength()})),
    steps:layoutCheck.hall.children.filter(o=>o.name.startsWith('core-step')).length,
  }));
  expect(state.gateways).toBe(1);expect(state.steps).toBe(8);expect(state.routes).toHaveLength(7);
  expect(state.routes.every(r=>r.length>8)).toBe(true);
  await page.evaluate(()=>{layoutCheck.stopWalking();layoutCheck.avatar.position.set(0,.06,11);});
  const intermediate=await page.evaluate(()=>{layoutCheck.campus.tick(5,{x:0,z:24},layoutCheck.camera);return layoutCheck.campus.tick(.1,{x:0,z:11},layoutCheck.camera).hallLight;});
  expect(intermediate).toBeGreaterThan(.05);expect(intermediate).toBeLessThan(.95);
  await expect.poll(()=>page.evaluate(()=>layoutCheck.campus.hallLight),{timeout:30000}).toBeGreaterThan(.99);
  // A stationary visitor with reduced motion still completes the reveal.
  await page.evaluate(()=>{layoutCheck.stopWalking();layoutCheck.avatar.position.set(-5,layoutCheck.groundAt(-5,0),0);});
  expect(await page.evaluate(()=>layoutCheck.avatar.position.y)).toBeCloseTo(3.78);
  const deliveries=await page.evaluate(()=>layoutCheck.parcels.couriers.map(c=>{
    const t=c.duration+3.5-c.phase;layoutCheck.parcels.tick(t+10*(c.duration*2+4));
    return {id:c.id,deposited:c.deposited.visible,carried:c.parcel.visible};
  }));
  expect(deliveries.every(c=>c.deposited&&!c.carried)).toBe(true);
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true',{timeout:30000});
  expect(await page.evaluate(async()=>{const {AUDIO_FILES}=await import('/static/js/lab-audio.js');return window.decodedSamples===AUDIO_FILES.length;})).toBe(true);
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','false');
  await page.evaluate(()=>{layoutCheck.stopWalking();layoutCheck.avatar.position.set(0,.06,24);});
  await expect.poll(()=>page.evaluate(()=>layoutCheck.campus.hallLight),{timeout:30000}).toBeLessThan(.01);
  expect(errors).toEqual([]);
});
