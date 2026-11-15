const {test,expect,frameLimitedSource}=require('./fixtures.cjs');

async function routes(page,{authenticated=false}={}){
 const posts=[];
 await page.route('**/api/lab/hermes-chat/session',route=>route.fulfill({json:{available:true,authenticated,csrf:'test-csrf'}}));
 await page.route('**/api/lab/hermes-chat/conversations*',route=>route.fulfill({json:{conversations:[]}}));
 await page.route('**/api/lab/hermes-chat/history?**',route=>route.fulfill({json:{jobs:[]}}));
 await page.route('**/api/lab/hermes-chat/jobs',route=>{posts.push(route.request().postDataJSON());return route.fulfill({status:500,json:{error:'Unexpected model request'}});});
 await page.route('**/api/sato-agent/suggestions',route=>route.fulfill({json:{suggestions:[
  {id:'about',question:'Quem é Sato?',answer:'Léo Sato é desenvolvedor de software, com experiência em back-end e formação em Engenharia de Software.'},
  {id:'work',question:'No que ele tem trabalhado?',answer:'Léo tem desenvolvido jogos e experiências interativas, além de projetos de software.'},
  {id:'rabbit',question:'Imite um coelho',command:'/mimic coelho'},
 ]}}));
 return posts;
}

test('three suggestions work before login, with keyboard and immediate replies',async({page})=>{
 await page.setViewportSize({width:393,height:852});
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
 const posts=await routes(page);await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 const toggle=page.getByRole('button',{name:'Perguntas para começar',exact:true});await expect(toggle).toBeVisible();
 await toggle.focus();await page.keyboard.press('ArrowDown');await expect(page.locator('#robot-questions button')).toHaveCount(3);
 await expect(page.getByRole('button',{name:'Quem é Sato?',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(toggle).toBeFocused();await expect(toggle).toHaveAttribute('aria-expanded','false');
 await toggle.click();await page.getByRole('button',{name:'Quem é Sato?',exact:true}).click();
 await expect(page.locator('#home-speech')).toContainText('Léo Sato é desenvolvedor');
 await toggle.click();const bounds=await page.locator('#robot-questions').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(11);expect(bounds.x+bounds.width).toBeLessThanOrEqual(382);
 await page.getByRole('button',{name:'No que ele tem trabalhado?',exact:true}).click();await expect(page.locator('#home-speech')).toContainText('jogos e experiências');
 await toggle.click();await page.getByRole('button',{name:'Imite um coelho'}).click();await expect(page.locator('#home-speech')).toContainText('Não consegui mostrar a imitação');
 await page.setViewportSize({width:393,height:480});await toggle.click();const short=await page.locator('#robot-questions').boundingBox();expect(short.y).toBeGreaterThanOrEqual(11);expect(short.y+short.height).toBeLessThanOrEqual(469);
 expect(posts).toEqual([]);
});

test('rabbit draws on the panel, deforms arms, hops and settles; missing mimic target is explained @scene',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const posts=await routes(page,{authenticated:true});
 await page.setViewportSize({width:393,height:852});
 await page.route('**/js/home-scene.js*',async route=>{const response=await route.fetch(),source=await response.text();await route.fulfill({response,body:frameLimitedSource(source.replace('return {arrive,react,setScenario,','window.__mimicQA={rig,world,camera,renderer,mimic};return {arrive,react,setScenario,'))});});
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:45000});
 await page.locator('#robot-question-toggle').click();await expect.poll(()=>page.locator('#robot-questions button').evaluateAll(nodes=>nodes.every(el=>{const r=el.getBoundingClientRect();return r.left>=8&&r.right<=innerWidth-8;}))).toBe(true);await page.evaluate(()=>{const {renderer,world,camera}=__mimicQA;renderer.render(world,camera);});await page.screenshot({path:testInfo.outputPath('questions-mobile.png')});
 await page.getByRole('button',{name:'Imite um coelho'}).click();await expect(page.locator('#home-scene')).toHaveAttribute('data-reaction','rabbit');
 await page.waitForFunction(()=>window.__mimicQA?.rig.arms.every(arm=>arm.dir.y>.85&&arm.mesh.scale.y>1.4));
 expect(await page.evaluate(()=>__mimicQA.rig.visor.material.uniforms.uDrawing.value)).toBe(1);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.waitForFunction(()=>__mimicQA.rig.root.position.y>.08);
 await page.evaluate(()=>{const {renderer,world,camera}=__mimicQA;renderer.render(world,camera);});
 await page.screenshot({path:testInfo.outputPath('rabbit-mobile.png')});
 await expect(page.locator('#home-scene')).toHaveAttribute('data-reaction','idle',{timeout:15000});
 await page.waitForFunction(()=>__mimicQA.rig.arms.every(arm=>arm.mesh.scale.y<1.05));
 expect(await page.evaluate(()=>__mimicQA.rig.visor.material.uniforms.uDrawing.value)).toBe(0);
 await page.locator('#home-input').fill('/mimic');await page.locator('#home-send').click();
 await expect(page.locator('#home-speech')).toContainText('Me diga o que você quer que eu imite');
 await page.locator('#home-input').fill('/mimic coelho');await page.locator('#home-send').click();
 await expect(page.locator('#home-scene')).toHaveAttribute('data-reaction','rabbit');
 await page.locator('#robot-touch').click();await expect(page.locator('#home-scene')).toHaveAttribute('data-reaction','wave');
 expect(await page.evaluate(()=>__mimicQA.rig.visor.material.uniforms.uDrawing.value)).toBe(0);
 await page.setViewportSize({width:1440,height:900});await page.locator('#robot-question-toggle').click();await expect(page.locator('#robot-questions')).toBeVisible();
 await page.evaluate(()=>{const {renderer,world,camera}=__mimicQA;renderer.render(world,camera);});await page.screenshot({path:testInfo.outputPath('questions-desktop.png')});
 await page.keyboard.press('Escape');
 await page.locator('#home-input').fill('/mimic coelho');await page.locator('#home-send').click();await expect(page.locator('#home-scene')).toHaveAttribute('data-mimic','playing');
 await page.keyboard.press('Escape');await expect(page.locator('#home-scene')).toHaveAttribute('data-mimic','idle');
 await page.locator('#home-input').fill('/mimic coelho');await page.locator('#home-send').click();await page.locator('#home-input').fill('/mimic parar');await page.locator('#home-send').click();
 await expect(page.locator('#home-speech')).toContainText('Pronto, parei a imitação');await expect(page.locator('#home-scene')).toHaveAttribute('data-mimic','idle');
 expect(posts).toEqual([]);expect(errors).toEqual([]);
});
const fs=require('node:fs'),path=require('node:path');

test('question balloons float independently, return to the mark, and survive rapid toggles',async({page},testInfo)=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:393,height:852});
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
 await routes(page);await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 const toggle=page.locator('#robot-question-toggle'),group=page.locator('#robot-questions');
 await toggle.click();await expect(group).toHaveAttribute('data-state','open');
 const balloons=page.locator('#robot-questions .question-bubble');await expect(balloons).toHaveCount(3);await expect(page.locator('.mime-icon')).toHaveCount(1);
 expect(await group.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
 const rects=await balloons.evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom,width:r.width,background:getComputedStyle(el).backgroundColor,animated:el.getAnimations().length};}));
 expect(rects.every(r=>r.animated>0&&r.background!=='rgba(0, 0, 0, 0)')).toBe(true);expect(rects[1].x).toBeGreaterThan(rects[0].x+15);expect(rects[1].y-rects[0].bottom).toBeGreaterThan(2);
 await page.screenshot({path:testInfo.outputPath('floating-balloons-mobile.png')});
 await toggle.click();await expect(group).toHaveAttribute('data-state','closing');await expect(group).toBeVisible();await expect(group).toBeHidden();
 await toggle.click();await toggle.click();await toggle.click();await expect(group).toHaveAttribute('data-state','open');await expect(toggle).toHaveAttribute('aria-expanded','true');
 await page.keyboard.press('Escape');await expect(group).toBeHidden();await expect(toggle).toBeFocused();
});

test('a generated tool timeline executes once and reports the actual browser outcome @scene',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await routes(page,{authenticated:true});
 // Captured from the real model, not a runtime preset. Only shorten playback for the test.
 const plan=JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/mimic-bird.json'),'utf8'));plan.duration=3;
 const jobs=[],reports=[];
 await page.route('**/api/lab/hermes-chat/history?**',route=>route.fulfill({json:{jobs}}));
 await page.route('**/api/lab/hermes-chat/jobs',route=>{const body=route.request().postDataJSON(),job={id:body.request_id,conversation_id:body.conversation_id,robot_id:body.robot_id,question:body.question,status:'queued',created_at:Date.now()/1000};jobs.push(job);setTimeout(()=>Object.assign(job,{status:'done',answer:'Vou tentar representar um pássaro bravo.',mimic_plan:plan,mimic_result:{status:'planned'}}),80);return route.fulfill({status:202,json:{id:job.id,status:'queued',job}});});
 await page.route('**/api/lab/hermes-chat/jobs/*/mimic-result',route=>{const {status}=route.request().postDataJSON();reports.push(status);Object.assign(jobs[0],{mimic_result:{status},answer:status==='completed'?'Representei um pássaro bravo.':'Estou representando um pássaro bravo.'});return route.fulfill({json:{job:jobs[0]}});});
 await page.route('**/js/home-scene.js*',async route=>{const response=await route.fetch(),source=await response.text();await route.fulfill({response,body:frameLimitedSource(source.replace('return {arrive,react,setScenario,','window.__generatedMimicQA={rig,world,camera,renderer};return {arrive,react,setScenario,'))});});
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:45000});
 await page.locator('#home-input').fill('Imite um pássaro bravo');await page.locator('#home-send').click();
 await expect(page.locator('#home-scene')).toHaveAttribute('data-reaction','passaro_bravo');
 await page.waitForFunction(()=>__generatedMimicQA.rig.arms.every(arm=>arm.mesh.scale.x>1.15));
 expect(await page.evaluate(()=>__generatedMimicQA.rig.arms.length)).toBe(2);expect(await page.evaluate(()=>__generatedMimicQA.rig.arms.every(arm=>Math.abs(arm.dir.x)>.5))).toBe(true);expect(await page.evaluate(()=>__generatedMimicQA.rig.visor.material.uniforms.uDrawing.value)).toBe(1);
 await page.evaluate(()=>{const {renderer,world,camera}=__generatedMimicQA;renderer.render(world,camera);});await page.screenshot({path:testInfo.outputPath('generated-bird.png')});
 await expect(page.locator('#home-speech')).toContainText('Representei um pássaro bravo');await expect(page.locator('#home-scene')).toHaveAttribute('data-mimic','idle');
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(1100);
 expect(reports).toEqual(['started','completed']);expect(errors).toEqual([]);
});


test('curated library renders both choreography endpoints on the actual LED and arm rig @scene',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1280,height:1375});
 await page.route('**/__mimic-gallery',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'../fixtures/mimic-gallery.html'),'utf8')}));
 await page.goto('/__mimic-gallery');await page.waitForFunction(()=>window.mimicGallery?.length===16);
 expect(await page.evaluate(()=>mimicGallery.every(item=>item.arms===2&&item.led===1))).toBe(true);
 await page.screenshot({path:testInfo.outputPath('mimic-library-a.png'),fullPage:true});
 await page.evaluate(()=>renderMimicPhase(1));await page.screenshot({path:testInfo.outputPath('mimic-library-b.png'),fullPage:true});
 expect(errors).toEqual([]);
});
