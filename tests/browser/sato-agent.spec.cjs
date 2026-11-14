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

test('rabbit draws on the panel, deforms arms, hops and settles; unknown mimic is honest @scene',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const posts=await routes(page,{authenticated:true});
 await page.setViewportSize({width:393,height:852});
 await page.route('**/js/home-scene.js*',async route=>{const response=await route.fetch(),source=await response.text();await route.fulfill({response,body:frameLimitedSource(source.replace('return {arrive,react,setScenario,','window.__mimicQA={rig,world,camera,renderer,mimic};return {arrive,react,setScenario,'))});});
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:45000});
 await page.locator('#robot-question-toggle').click();await page.evaluate(()=>{const {renderer,world,camera}=__mimicQA;renderer.render(world,camera);});await page.screenshot({path:testInfo.outputPath('questions-mobile.png')});
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
 await page.locator('#home-input').fill('/mimic dragão');await page.locator('#home-send').click();
 await expect(page.locator('#home-speech')).toContainText('ainda não cabe nos meus movimentos');
 await page.locator('#home-input').fill('/mimic coelho');await page.locator('#home-send').click();
 await expect(page.locator('#home-scene')).toHaveAttribute('data-reaction','rabbit');
 await page.locator('#robot-touch').click();await expect(page.locator('#home-scene')).toHaveAttribute('data-reaction','wave');
 expect(await page.evaluate(()=>__mimicQA.rig.visor.material.uniforms.uDrawing.value)).toBe(0);
 await page.setViewportSize({width:1440,height:900});await page.locator('#robot-question-toggle').click();await expect(page.locator('#robot-questions')).toBeVisible();
 await page.evaluate(()=>{const {renderer,world,camera}=__mimicQA;renderer.render(world,camera);});await page.screenshot({path:testInfo.outputPath('questions-desktop.png')});
 expect(posts).toEqual([]);expect(errors).toEqual([]);
});
