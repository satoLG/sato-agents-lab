const {test,expect}=require('@playwright/test');

test('identity is shared by public, dashboard and lab pages',async({page})=>{
  for(const url of ['/','/dashboard','/lab']){
    await page.goto(url);await page.evaluate(()=>document.fonts.ready);
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href',/sato-logo\.png$/);
    await expect(page.locator('a.brand img')).toHaveAttribute('src',/sato-logo\.png$/);
    expect(await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('Nunito');
    const fonts=await page.locator('a.brand *').evaluateAll(items=>items.map(el=>getComputedStyle(el).fontFamily));
    expect(fonts.every(font=>font.includes('Nunito'))).toBe(true);
  }
});

test('campus cutaways, grounded actors, courier routes and parcel landing',async({page})=>{
  test.setTimeout(90000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Test-only instrumentation; no debug globals are shipped by the application.
  await page.route('**/js/lab-scene.js',async route=>{
    const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('renderer.render(world,camera);','window.__campus={world,camera,avatar,obstacles,campus,parcels,hall,robots};renderer.render(world,camera);')});
  });
  await page.goto('/lab');await expect(page.locator('#loading')).toBeHidden({timeout:30000});await page.waitForFunction(()=>window.__campus);
  const result=await page.evaluate(async()=>{
    const {world,camera,avatar,campus,parcels,hall}=window.__campus;
    const T=await import('/static/vendor/three.module.min.js');
    const {clearSegment}=await import('/static/js/lab-navigation.js');
    const {obstacles}=window.__campus;
    camera.position.set(0,15,32);
    const reception=campus.tick(2,new T.Vector3(0,.06,24),camera);
    const partitionInReception=campus.partition.visible;
    const inside=campus.tick(2,new T.Vector3(0,.06,15),camera);
    const walls=campus.walls.map(w=>({name:w.name,visible:w.group.visible}));
    parcels.tick(8.5,true);const landed=parcels.packets[0].p.position.y;
    const routes=parcels.couriers.map(c=>({length:c.curve.getLength(),clear:c.curve.curves.every(segment=>clearSegment(segment.v1,segment.v2,obstacles,[]))}));
    parcels.tick(4,true);const carrying=parcels.couriers[0].parcel.visible;
    parcels.tick(parcels.couriers[0].duration+3.5,true);const deposited=parcels.couriers[0].deposited.visible;
    return {scale:world.scale.x,ground:avatar.position.y,reception,partitionInReception,inside,walls,landed,routes,carrying,deposited,sky:world.background.isTexture};
  });
  expect(result.scale).toBe(.7);expect(result.ground).toBe(.06);expect(result.sky).toBe(true);
  expect(result.reception.enteredHall).toBe(false);expect(result.partitionInReception).toBe(true);expect(result.inside.enteredHall).toBe(true);
  expect(result.walls.filter(w=>w.visible).map(w=>w.name)).toEqual(['west','east','north']);
  expect(result.landed).toBeCloseTo(.45);expect(result.carrying).toBe(true);expect(result.deposited).toBe(true);
  expect(result.routes).toHaveLength(5);for(const route of result.routes){expect(route.length).toBeGreaterThan(1);expect(route.clear).toBe(true);}
  expect(errors).toEqual([]);
});
