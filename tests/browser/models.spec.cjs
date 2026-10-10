const {test,expect}=require('@playwright/test');
const fs=require('node:fs');

test('Sato inspector exposes every clip and supports playback, scrubbing and inspection',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/models');
 await expect(page.locator('#model-loading')).toBeHidden();await expect(page.locator('#model-error')).toBeHidden();
 await expect(page.locator('#clip-select option')).toHaveCount(45);await expect(page.locator('#clip-select')).toHaveValue('8');
 await page.locator('#clip-select').selectOption({label:'Rig|Walk_Loop'});await page.locator('#play-animation').click();
 await expect.poll(()=>page.locator('#animation-time').inputValue()).not.toBe('0');await page.locator('#play-animation').click();
 await expect(page.locator('#play-animation')).toHaveAttribute('aria-pressed','false');
 await page.locator('#animation-time').fill('0.4');await expect(page.locator('#time-label')).toContainText('0.40');
 await page.locator('#step-animation').click();await expect(page.locator('#time-label')).toContainText('0.43');
 await page.locator('#restart-animation').click();await expect(page.locator('#animation-time')).toHaveValue('0');
 await page.locator('#show-skeleton').check();await page.locator('#show-wireframe').check();
 await page.locator('#mesh-select').selectOption('0');await page.locator('#isolate-mesh').check();
 await expect(page.locator('#mesh-detail')).toContainText('vértices');
 await page.locator('#isolate-mesh').uncheck();await page.locator('#show-wireframe').uncheck();await page.locator('#show-skeleton').uncheck();
 await page.screenshot({path:info.outputPath('sato-inspector.png')});
 await page.setViewportSize({width:393,height:852});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});

test('companion exports editable meshes and all clips and can be opened locally',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/models');
 await expect(page.locator('#model-loading')).toBeHidden();await page.locator('#model-select').selectOption('companion');
 await expect(page.locator('#model-canvas')).toHaveAttribute('data-model','companion');await expect(page.locator('#clip-select option')).toHaveCount(5);
 await page.locator('#clip-select').selectOption({label:'Float_Left'});await page.locator('#show-wireframe').check();
 await page.locator('#mesh-select').selectOption('0');await page.locator('#isolate-mesh').check();
 const pending=page.waitForEvent('download');await page.locator('#export-model').click();const download=await pending;
 const path=info.outputPath('companion.glb');await download.saveAs(path);const bytes=fs.readFileSync(path);
 expect(bytes.readUInt32LE(0)).toBe(0x46546c67);const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 expect(gltf.nodes.filter(n=>n.mesh!==undefined).length).toBe(43);expect(gltf.animations.length).toBe(5);
 await page.locator('#model-file').setInputFiles(path);await expect(page.locator('#model-canvas')).toHaveAttribute('data-model','local');
 await expect(page.locator('#clip-select option')).toHaveCount(5);await expect(page.locator('#mesh-select option')).toHaveCount(44);
 await page.locator('#isolate-mesh').uncheck();await page.locator('#show-wireframe').uncheck();await page.locator('#frame-model').click();
 await page.screenshot({path:info.outputPath('editable-companion.png')});expect(errors).toEqual([]);
});

test('bad local asset shows an error and library selection recovers',async({page})=>{
 await page.goto('/models');await expect(page.locator('#model-loading')).toBeHidden();
 await page.locator('#model-file').setInputFiles({name:'broken.glb',mimeType:'model/gltf-binary',buffer:Buffer.from('broken')});
 await expect(page.locator('#model-error')).toBeVisible();await page.locator('#model-select').selectOption('companion');
 await expect(page.locator('#model-error')).toBeHidden();await expect(page.locator('#export-model')).toBeEnabled();
});
