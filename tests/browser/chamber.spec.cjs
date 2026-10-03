const {test,expect}=require('@playwright/test');

test.use({viewport:{width:1000,height:760}});
test.setTimeout(180000);

test('interior materials stay lit while the outside fades and recovers',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/js/lab-scene.js',async route=>{
    const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('renderer.render(world,camera);','window.__chamber={world,camera,campus,avatar,start};renderer.render(world,camera);')});
  });
  await page.goto('/lab');await page.waitForFunction(()=>window.__chamber);
  const before=await page.evaluate(()=>{
    const c=window.__chamber,floor=c.world.getObjectByName('chamber-tile-floor');
    c.start();c.avatar.position.set(0,.06,23);
    return {floorColor:floor.material.color.getHex(),mapSize:floor.material.map.image.width,roughness:floor.material.roughness,sky:c.world.backgroundIntensity};
  });
  await expect.poll(()=>page.evaluate(()=>window.__chamber.campus.exteriorDarkness),{timeout:60000}).toBeGreaterThan(.95);
  const inside=await page.evaluate(()=>{const c=window.__chamber;return {color:c.world.getObjectByName('chamber-tile-floor').material.color.getHex(),sky:c.world.backgroundIntensity,terrain:c.campus.landscape.terrain.material.userData.exteriorBrightness.value};});
  expect(before.mapSize).toBe(512);expect(before.roughness).toBeGreaterThan(.7);
  expect(inside.color).toBe(before.floorColor);expect(inside.sky).toBeLessThan(before.sky*.1);
  await page.evaluate(()=>window.__chamber.avatar.position.set(0,.06,36));
  await expect.poll(()=>page.evaluate(()=>window.__chamber.campus.exteriorDarkness),{timeout:60000}).toBeLessThan(.05);
  expect(await page.evaluate(()=>window.__chamber.campus.landscape.terrain.material.userData.exteriorBrightness.value)).toBeGreaterThan(inside.terrain*5);
  // Along the side of the building, crossing z=29 must not darken the campus.
  await page.evaluate(()=>window.__chamber.avatar.position.set(36,.06,15));
  await page.waitForTimeout(500);
  expect(await page.evaluate(()=>window.__chamber.campus.exteriorDarkness)).toBeLessThan(.05);
  expect(errors).toEqual([]);
});
