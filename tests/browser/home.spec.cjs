const {test,expect}=require('@playwright/test');

async function chatRoutes(page,{loggedIn=true}={}){
 let authenticated=loggedIn,submitted,csrfSeen=false;
 const jobs=[];
 await page.route('**/api/lab/hermes-chat/session',route=>route.fulfill({json:{available:true,authenticated,csrf:authenticated?'home-test-csrf':null}}));
 await page.route('**/api/lab/hermes-chat/login',route=>{
  if(route.request().postDataJSON().password!=='test-password')return route.fulfill({status:401,json:{error:'Senha incorreta.'}});
  authenticated=true;return route.fulfill({json:{available:true,authenticated,csrf:'home-test-csrf'}});
 });
 await page.route('**/api/lab/hermes-chat/history?**',route=>route.fulfill({json:{jobs}}));
 await page.route('**/api/lab/hermes-chat/jobs',route=>{
  submitted=route.request().postDataJSON();csrfSeen=route.request().headers()['x-chat-csrf']==='home-test-csrf';
  const job={id:String(jobs.length+1).padStart(32,'a'),robot_id:submitted.robot_id,question:submitted.question,status:'queued',created_at:Date.now()/1000};jobs.push(job);
  return route.fulfill({status:202,json:{id:job.id,status:'queued'}});
 });
 return {jobs,get submitted(){return submitted;},get csrfSeen(){return csrfSeen;}};
}
async function ready(page){await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true');await expect(page.locator('#home-loading')).toBeHidden();}

test('root greets with one robot, real chat protocol and a glass history',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const chat=await chatRoutes(page);
 await ready(page);await expect(page.locator('#home-scene canvas')).toHaveCount(1);await expect(page.locator('#home-speech')).toContainText('Hello, im a Sato Agent');await expect(page.locator('#home-progress')).toHaveAttribute('value','100');
 expect(await page.locator('#home').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(0, 0, 0)');
 await page.screenshot({path:testInfo.outputPath('home-desktop.png')});
 await page.locator('#home-input').fill('O que a VM sabe sobre MCP?');await page.locator('#home-send').click();
 await expect(page.locator('#last-question')).toContainText('O que a VM sabe sobre MCP?');await expect(page.locator('#home-speech')).toContainText('Deixa eu pensar');
 expect(chat.submitted).toEqual({robot_id:'guide:hermes',question:'O que a VM sabe sobre MCP?'});expect(chat.csrfSeen).toBe(true);
 chat.jobs[0].status='done';chat.jobs[0].answer='MCP conecta o Hermes aos serviços configurados na VM.';
 await expect(page.locator('#home-speech')).toContainText(chat.jobs[0].answer,{timeout:10000});
 await page.locator('#home-history-toggle').click();await expect(page.locator('#home-messages')).toContainText(chat.jobs[0].question);await expect(page.locator('#home-messages')).toContainText(chat.jobs[0].answer);
 const glass=await page.locator('#home-history').evaluate(el=>({blur:getComputedStyle(el).backdropFilter,background:getComputedStyle(el).backgroundColor}));expect(glass.blur).toContain('blur');expect(glass.background).toMatch(/^rgba/);
 await page.screenshot({path:testInfo.outputPath('home-history.png')});await page.keyboard.press('Escape');await expect(page.locator('#home-history')).toBeHidden();expect(errors).toEqual([]);
});

test('login preserves existing private access and handles incorrect passwords',async({page})=>{
 await chatRoutes(page,{loggedIn:false});await ready(page);await expect(page.locator('#home-login')).toBeVisible();await expect(page.locator('#home-form')).toBeHidden();
 await page.locator('#home-password').fill('wrong-password');await page.locator('#home-login button').click();await expect(page.locator('#home-chat-status')).toContainText('Senha incorreta');
 await page.locator('#home-password').fill('test-password');await page.locator('#home-login button').click();await expect(page.locator('#home-form')).toBeVisible();await expect(page.locator('#home-input')).toBeEnabled();await expect(page.locator('#home-password')).toHaveValue('');
});

test('touch reactions differ and the composer stays usable in a short viewport',async({browser},testInfo)=>{
 const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'no-preference'}),page=await context.newPage();
 try{
  await chatRoutes(page);await ready(page);await page.waitForTimeout(900);
  await page.screenshot({path:testInfo.outputPath('home-mobile.png')});
  const texts=[];for(const kind of ['wave','boop','dance','shy']){await page.locator('#robot-touch').tap();await expect(page.locator('#home-scene')).toHaveAttribute('data-reaction',kind);texts.push(await page.locator('#home-speech .speech-text').innerText());}expect(new Set(texts).size).toBe(4);
  await page.setViewportSize({width:393,height:500});await page.locator('#home-input').fill('Uma mensagem para Hermes em uma tela menor.');
  const bounds=await page.locator('#home-form').boundingBox();expect(bounds.y+bounds.height).toBeLessThan(500);expect(bounds.x).toBeGreaterThan(0);
  await page.locator('#home-send').tap();await expect(page.locator('#last-question')).toContainText('Uma mensagem para Hermes');
  await page.screenshot({path:testInfo.outputPath('home-short.png')});
 }finally{await context.close();}
});

test('robot announces each destination before navigation',async({page})=>{
 await chatRoutes(page);await ready(page);
 for(const [path,name] of [['/dashboard','dashboard'],['/lab','laboratório']]){
  await page.locator(`.home-nav a[href="${path}"]`).click();await expect(page.locator('#home-speech')).toContainText(`Vou te levar ao ${name}`);expect(new URL(page.url()).pathname).toBe('/');await expect(page).toHaveURL(new RegExp(`${path}$`));if(path==='/dashboard')await ready(page);
 }
});

test('a late older answer never replaces the latest question and history is text',async({page})=>{
 const chat=await chatRoutes(page);await ready(page);
 for(const question of ['Primeira pergunta','Segunda pergunta']){await page.locator('#home-input').fill(question);await page.locator('#home-send').click();await expect(page.locator('#home-input')).toHaveValue('');}
 chat.jobs[0].status='done';chat.jobs[0].answer='Esta resposta é da primeira pergunta.';
 await page.waitForTimeout(2200);await expect(page.locator('#last-question')).toContainText('Segunda pergunta');await expect(page.locator('#home-speech')).not.toContainText(chat.jobs[0].answer);
 chat.jobs[1].status='done';chat.jobs[1].answer='<img src="x" onerror="alert(1)"> Resposta da segunda pergunta.';
 await expect(page.locator('#home-speech')).toContainText(chat.jobs[1].answer,{timeout:10000});await page.locator('#home-history-toggle').click();await expect(page.locator('#home-messages img')).toHaveCount(0);await expect(page.locator('#home-messages')).toContainText(chat.jobs[0].answer);
});

test('WebGL failure leaves the informative chat and navigation available',async({page})=>{
 await chatRoutes(page);await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
 await ready(page);await expect(page.locator('#home-fallback')).toBeVisible();await expect(page.locator('#home-input')).toBeEnabled();await expect(page.locator('.home-nav a')).toHaveCount(2);await expect(page.locator('#robot-touch')).toBeHidden();
});
