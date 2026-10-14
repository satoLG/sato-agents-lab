const {test,expect}=require('@playwright/test');
const {createHash}=require('node:crypto');

const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
async function sceneHash(page) {
  // Sample the ocean itself, excluding UI labels that change with the sliders.
  const {width,height}=page.viewportSize();
  return hash(await page.screenshot({clip:{x:Math.floor(width*(width>760?.575:.5)-64),y:Math.floor(height*(width>760?.53:.44)-64),width:128,height:128}}));
}
async function ready(page) {
  await page.goto('/orb');
  await expect(page.locator('#orb-scene')).toHaveAttribute('data-ready','true',{timeout:45000});
  await expect(page.locator('#orb-loading')).toBeHidden();
}
async function setRange(page,id,value) {
  await page.locator(id).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},String(value));
}

test('orb renders locally; water, camera, keyboard and reset controls change the scene',async({page},info)=>{
  // Includes several shader variants and GPU readbacks on software WebGL in CI.
  test.setTimeout(120000);
  const errors=[],apiRequests=[],remoteRequests=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{const url=new URL(request.url());if(url.pathname.startsWith('/api/'))apiRequests.push(url.pathname);if(url.origin!==new URL(info.project.use.baseURL).origin)remoteRequests.push(url.href);});
  await ready(page);
  const canvas=page.locator('#orb-scene canvas');
  await expect(page.locator('#orb-pause-motion')).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:info.outputPath('orb-world.png')});
  await page.locator('#orb-zoom-in').click();await expect(page.locator('#orb-zoom-label')).toHaveText('1.2×');
  await page.locator('#orb-zoom-out').click();await expect(page.locator('#orb-zoom-label')).toHaveText('1.0×');
  await page.getByRole('button',{name:'A ilha'}).click();await expect(page.locator('#orb-scene')).toHaveAttribute('data-view','island');
  await page.screenshot({path:info.outputPath('orb-island.png')});
  await page.locator('#orb-reset-view').click();await expect(page.locator('#orb-zoom-label')).toHaveText('1.0×');
  await page.locator('#orb-scene').focus();await page.keyboard.press('+');await expect(page.locator('#orb-zoom-label')).toHaveText('1.1×');
  await page.keyboard.press('0');await expect(page.locator('#orb-zoom-label')).toHaveText('1.0×');
  const beforeOrbit=await sceneHash(page);await page.keyboard.press('ArrowRight');
  await expect.poll(()=>sceneHash(page)).not.toBe(beforeOrbit);
  await page.locator('#orb-settings-toggle').click();await expect(page.locator('#orb-settings-close')).toBeFocused();
  const beforeWater=await sceneHash(page);await setRange(page,'#orb-wave-strength',100);
  await expect(page.locator('#orb-wave-strength-value')).toHaveText('100%');
  await expect.poll(()=>sceneHash(page)).not.toBe(beforeWater);
  const beforeClarity=await sceneHash(page);await setRange(page,'#orb-water-clarity',0);
  await expect.poll(()=>sceneHash(page)).not.toBe(beforeClarity);
  await setRange(page,'#orb-wave-speed',150);await expect(page.locator('#orb-wave-speed-value')).toHaveText('1.5×');
  await page.locator('#orb-reset-settings').click();await expect(page.locator('#orb-wave-strength')).toHaveValue('55');await expect(page.locator('#orb-water-clarity')).toHaveValue('70');
  await page.keyboard.press('Escape');await expect(page.locator('#orb-settings')).toBeHidden();await expect(page.locator('#orb-settings-toggle')).toBeFocused();
  await page.locator('#orb-auto-orbit').click();await expect(page.locator('#orb-auto-orbit')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#orb-pause-motion')).toHaveAttribute('aria-pressed','false');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('#orb-pause-motion').click();await expect(page.locator('#orb-pause-motion')).toHaveAttribute('aria-pressed','true');
  const box=await canvas.boundingBox();await page.mouse.move(box.width*.6,box.height*.45);await page.mouse.down();await page.mouse.move(box.width*.7,box.height*.5,{steps:5});await page.mouse.up();
  await expect(page.locator('#orb-auto-orbit')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#orb-pause-motion')).toHaveAttribute('aria-pressed','true');
  expect(errors).toEqual([]);expect(apiRequests).toEqual([]);expect(remoteRequests).toEqual([]);
});

test.describe('orb on a phone',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('touch orbit, island view and adjustments fit the viewport',async({page},info)=>{
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));await ready(page);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({path:info.outputPath('orb-mobile.png')});
    const before=await sceneHash(page);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:230,y:330}]});
    for(let i=1;i<=5;i++) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:230+i*14,y:330+i*4}]});
      await page.evaluate(()=>new Promise(requestAnimationFrame));
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>sceneHash(page)).not.toBe(before);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:160,y:340},{x:230,y:340}]});
    for(let i=1;i<=5;i++) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160-i*4,y:340},{x:230+i*4,y:340}]});
      await page.evaluate(()=>new Promise(requestAnimationFrame));
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect(page.locator('#orb-zoom-label')).not.toHaveText('1.0×');
    await page.getByRole('button',{name:'A ilha'}).tap();await expect(page.locator('#orb-scene')).toHaveAttribute('data-view','island');
    await page.locator('#orb-settings-toggle').tap();await expect(page.locator('#orb-settings')).toBeVisible();
    const box=await page.locator('#orb-settings').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);expect(box.y+box.height).toBeLessThanOrEqual(844);
    await page.locator('#orb-settings-close').tap();await expect(page.locator('#orb-settings')).toBeHidden();expect(errors).toEqual([]);
  });
});

test('orb explains unavailable WebGL and does not leave an endless loading screen',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
  await page.goto('/orb');await expect(page.locator('#orb-error')).toBeVisible();await expect(page.locator('#orb-loading')).toBeHidden();
  await expect(page.locator('#orb-error-detail')).toContainText('WebGL 2');await expect(page.locator('#orb-zoom-in')).toBeDisabled();await expect(page.locator('#orb-retry')).toBeEnabled();
});
