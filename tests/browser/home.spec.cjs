const {test,expect}=require('@playwright/test');

async function chatRoutes(page,{loggedIn=true}={}){
 let authenticated=loggedIn,submitted,csrfSeen=false;
 const jobs=[];
 await page.route('**/api/lab/hermes-chat/session',route=>route.fulfill({json:{available:true,authenticated,csrf:authenticated?'home-test-csrf':null}}));
 await page.route('**/api/lab/hermes-chat/login',route=>{
  if(route.request().postDataJSON().password!=='test-password')return route.fulfill({status:401,json:{error:'Senha incorreta.'}});
  authenticated=true;return route.fulfill({json:{available:true,authenticated,csrf:'home-test-csrf'}});
 });
 const sessionJobs=()=>jobs.map(job=>({...job,conversation_id:job.conversation_id||'b'.repeat(32)}));
 await page.route('**/api/lab/hermes-chat/conversations',route=>{const conversations=new Map();for(const job of sessionJobs()){const value=conversations.get(job.conversation_id)||{id:job.conversation_id,title:job.question.slice(0,90),updated_at:job.created_at,messages:0};value.messages++;conversations.set(value.id,value);}return route.fulfill({json:{conversations:[...conversations.values()]}});});
 await page.route('**/api/lab/hermes-chat/history?**',route=>{const id=new URL(route.request().url()).searchParams.get('conversation_id');return route.fulfill({json:{jobs:sessionJobs().filter(job=>!id||job.conversation_id===id)}});});
 await page.route('**/api/lab/hermes-chat/jobs',route=>{
  submitted=route.request().postDataJSON();csrfSeen=route.request().headers()['x-chat-csrf']==='home-test-csrf';
  const job={id:submitted.request_id,conversation_id:submitted.conversation_id,robot_id:submitted.robot_id,question:submitted.question,status:'queued',created_at:Date.now()/1000};jobs.push(job);
  return route.fulfill({status:202,json:{id:job.id,status:'queued',job}});
 });
 return {jobs,get submitted(){return submitted;},get csrfSeen(){return csrfSeen;}};
}
async function ready(page){await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:15000});await expect(page.locator('#home-loading')).toBeHidden();}
async function chooseSession(page){if(await page.locator('#home-sessions').isVisible()){await expect(page.locator('.session-card').first()).toBeVisible();await page.locator('.session-card').first().click();}await expect(page.locator('.history-turn').first()).toBeVisible();}
async function resumeSeeded(page){await page.locator('#home-history-toggle').click();await chooseSession(page);await page.keyboard.press('Escape');}

test('root starts empty with one robot, real chat protocol and a glass history',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const chat=await chatRoutes(page);
 await ready(page);await expect(page.locator('#home-scene canvas')).toHaveCount(1);await expect(page.locator('#home-speech')).toBeHidden();await expect(page.locator('#home-progress')).toHaveAttribute('value','100');
 expect(await page.locator('#home').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(17, 27, 33)');
 await page.screenshot({path:testInfo.outputPath('home-desktop.png')});
 await page.locator('#home-input').fill('O que a VM sabe sobre MCP?');await page.locator('#home-send').click();
 await expect(page.locator('#last-question')).toContainText('O que a VM sabe sobre MCP?');await expect(page.locator('#home-speech .thinking-dots circle')).toHaveCount(3);
 expect(await page.locator('#home-speech .thinking-indicator').evaluate(el=>el.lastChild.classList.contains('thinking-dots'))).toBe(true);
 expect(chat.submitted).toMatchObject({robot_id:'guide:hermes',question:'O que a VM sabe sobre MCP?'});expect(chat.submitted.conversation_id).toMatch(/^[a-f0-9]{32}$/);expect(chat.csrfSeen).toBe(true);
 chat.jobs[0].status='done';chat.jobs[0].answer='MCP conecta o Hermes aos serviços configurados na VM.';
 await expect(page.locator('#home-speech')).toContainText(chat.jobs[0].answer,{timeout:10000});
 await page.locator('#home-history-toggle').click();await chooseSession(page);await expect(page.locator('#home-messages')).toContainText(chat.jobs[0].question);await expect(page.locator('#home-messages')).toContainText(chat.jobs[0].answer);
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
 // Exercise the home redirect independently of the destination's asset loading.
 for(const path of ['/dashboard','/lab'])await page.route(`**${path}`,route=>route.fulfill({contentType:'text/html',body:`<title>${path}</title>`}));
 await chatRoutes(page);await ready(page);
 for(const [path,name] of [['/dashboard','dashboard'],['/lab','laboratório']]){
  await page.locator(`.home-nav a[href="${path}"]`).click();await expect(page.locator('#home-speech')).toContainText(`Vou te levar ao ${name}`);expect(new URL(page.url()).pathname).toBe('/');await expect(page).toHaveURL(new RegExp(`${path}$`),{timeout:15000});if(path==='/dashboard')await ready(page);
 }
});

test('a late older answer never replaces the latest question and history is text',async({page})=>{
 const chat=await chatRoutes(page);await ready(page);
 for(const question of ['Primeira pergunta','Segunda pergunta']){await page.locator('#home-input').fill(question);await page.locator('#home-send').click();await expect(page.locator('#home-input')).toHaveValue('');}
 chat.jobs[0].status='done';chat.jobs[0].answer='Esta resposta é da primeira pergunta.';
 await page.waitForTimeout(2200);await expect(page.locator('#last-question')).toContainText('Segunda pergunta');await expect(page.locator('#home-speech')).not.toContainText(chat.jobs[0].answer);
 chat.jobs[1].status='done';chat.jobs[1].answer='<img src="x" onerror="alert(1)"> Resposta da segunda pergunta.';
 await expect(page.locator('#home-speech')).toContainText(chat.jobs[1].answer,{timeout:10000});await page.locator('#home-history-toggle').click();await chooseSession(page);await expect(page.locator('#home-messages img')).toHaveCount(0);await expect(page.locator('#home-messages')).toContainText(chat.jobs[0].answer);
});

test('WebGL failure leaves the informative chat and navigation available',async({page})=>{
 await chatRoutes(page);await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};});
 await ready(page);await expect(page.locator('#home-fallback')).toBeVisible();await expect(page.locator('#home-input')).toBeEnabled();await expect(page.locator('.home-nav a')).toHaveCount(2);await expect(page.locator('#robot-touch')).toBeHidden();
});

test('long previews open full chat bubbles without spilling into the scene',async({page},testInfo)=>{
 await page.setViewportSize({width:393,height:852});const chat=await chatRoutes(page);
 const answer='Uma resposta longa com detalhes, código e referências.\n'.repeat(160)+'https://example.com/'+('a'.repeat(300));
 chat.jobs.push({id:'long',question:'Minha pergunta com vários detalhes. '.repeat(25),status:'done',answer,created_at:Date.now()/1000});
 await ready(page);await resumeSeeded(page);await expect(page.locator('#speech-more')).toBeVisible({timeout:10000});
 expect((await page.locator('#home-speech .speech-text').innerText()).length).toBeLessThanOrEqual(421);
 const metrics=await page.locator('#home-speech .speech-text').evaluate(el=>({height:el.clientHeight,line:parseFloat(getComputedStyle(el).lineHeight),width:el.clientWidth,scrollWidth:el.scrollWidth}));expect(metrics.height).toBeLessThanOrEqual(metrics.line*5+1);expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
 await page.screenshot({path:testInfo.outputPath('home-long-preview.png')});
 await page.locator('#speech-more').click();await expect(page.locator('#home-history')).toBeVisible();await expect(page.locator('.history-answer p')).toHaveText(answer);await expect(page.locator('#last-question')).toBeHidden();
 const chatGeometry=await page.locator('.history-answer').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));expect(chatGeometry.scrollWidth).toBeLessThanOrEqual(chatGeometry.width);
 await page.screenshot({path:testInfo.outputPath('home-long-chat.png')});await page.keyboard.press('Escape');await expect(page.locator('#home-history')).toBeHidden();
});

async function instrumentScene(page){
 await page.route('**/js/home-scene.js',async route=>{
  const response=await route.fetch(),source=await response.text();
  const sample=`if(window.__companionFrames){
   let tubeArmRadius=0;
   if(container.dataset.arrival==='fall')for(const arm of rig.arms)arm.upper.traverse(mesh=>{
    if(!mesh.isMesh)return;const positions=mesh.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){const p=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);if(p.y>=chute.position.y)tubeArmRadius=Math.max(tubeArmRadius,Math.hypot(p.x,p.z));}
   });
   window.__companionFrames.push({stage:container.dataset.arrival,reaction:container.dataset.reaction,y:rig.root.position.y,body:rig.root.rotation.y,arm:rig.arms[0].upper.rotation.x,tubeArmRadius});
  }`;
  await route.fulfill({response,body:source.replace('return {arrive,react,setScenario,','window.__companionQA={world,rig,chute,renderer,camera};return {arrive,react,setScenario,').replace(/renderer.render\(world,camera\);report\(\);(\r?\n) \}/,`renderer.render(world,camera);report();${sample}\n }`)});
 });
}

test('settings lazily reuse miniature lab and forest with smooth scenario changes',async({page},testInfo)=>{
 await page.setViewportSize({width:393,height:852});await chatRoutes(page);await instrumentScene(page);let environmentRequests=0;page.on('request',request=>{if(request.url().includes('/js/home-environments.js'))environmentRequests++;});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await ready(page);expect(environmentRequests).toBe(0);await page.locator('#home-settings-toggle').click();await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:testInfo.outputPath('home-settings.png')});
 await page.evaluate(()=>{const r=__companionQA.renderer,compile=r.compileAsync.bind(r);r.compileAsync=async(...args)=>{await new Promise(resolve=>{window.__releaseCompanionCompile=resolve;});return compile(...args);};window.__restoreCompanionCompile=()=>{r.compileAsync=compile;};});
 await page.locator('[name="home-scenario"][value="lab"]').check();await page.waitForFunction(()=>window.__releaseCompanionCompile);expect(await page.evaluate(()=>__companionQA.world.getObjectByName('companion-lab').visible)).toBe(false);await expect(page.locator('#home-scene')).toHaveAttribute('data-scenario','black');await page.evaluate(()=>{__releaseCompanionCompile();__restoreCompanionCompile();});
 for(const kind of ['lab','forest']){await page.locator(`[name="home-scenario"][value="${kind}"]`).check();await expect(page.locator('#home-scene')).toHaveAttribute('data-scenario',kind);await page.waitForTimeout(700);await page.locator('#settings-close').click();await page.screenshot({path:testInfo.outputPath(`home-${kind}.png`)});await page.locator('#home-settings-toggle').click();}
 expect(environmentRequests).toBe(1);const memory=await page.evaluate(()=>({...__companionQA.renderer.info.memory}));
 await page.locator('[name="home-scenario"][value="lab"]').check();await page.locator('[name="home-scenario"][value="black"]').check();await page.locator('[name="home-scenario"][value="forest"]').check();await expect(page.locator('#home-scene')).toHaveAttribute('data-scenario','forest');await page.waitForTimeout(800);
 const actual=await page.evaluate(()=>({memory:{...__companionQA.renderer.info.memory},calls:__companionQA.renderer.info.render.calls,sets:__companionQA.world.children.filter(o=>o.name.startsWith('companion-')).length,saved:localStorage.getItem('sato-home-scenario')}));expect(actual.memory).toEqual(memory);expect(actual.calls).toBeLessThan(220);expect(actual.sets).toBe(2);expect(actual.saved).toBe('forest');expect(errors).toEqual([]);
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();await page.reload();await expect(page.locator('#home-scene')).toHaveAttribute('data-scenario','forest',{timeout:15000});
});

test('tube arrival lands, says ouch, rises and dance makes complete turns',async({browser},testInfo)=>{
 const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,reducedMotion:'no-preference'}),page=await context.newPage();
 try{
  await chatRoutes(page);await instrumentScene(page);await page.addInitScript(()=>{window.__companionFrames=[];});await page.goto('/');
  await expect(page.locator('#home-scene')).toHaveAttribute('data-arrival','tube',{timeout:10000});await expect(page.locator('#home-loading')).toBeHidden();await page.waitForTimeout(1100);await page.screenshot({path:testInfo.outputPath('home-tube.png')});
  await expect(page.locator('#home-scene')).toHaveAttribute('data-arrival','fall',{timeout:10000});await page.screenshot({path:testInfo.outputPath('home-exit.png')});
  await expect(page.locator('#home-scene')).toHaveAttribute('data-arrival','ouch',{timeout:10000});await page.screenshot({path:testInfo.outputPath('home-ouch.png')});await expect(page.locator('#home-scene')).toHaveAttribute('data-arrival','settled',{timeout:15000});await expect(page.locator('#home-speech')).toBeHidden();
  const stages=await page.evaluate(()=>[...new Set(__companionFrames.map(f=>f.stage))]);expect(stages).toEqual(expect.arrayContaining(['tube','fall','ouch','rise','settled']));
  const radius=await page.evaluate(()=>Math.max(...__companionFrames.map(f=>f.tubeArmRadius)));expect(radius).toBeGreaterThan(.5);expect(radius).toBeLessThan(1.08*.93);
  const gap=await page.evaluate(()=>{const robot=document.getElementById('robot-touch').getBoundingClientRect(),chat=document.getElementById('home-chat').getBoundingClientRect();return chat.top-robot.bottom;});expect(gap).toBeGreaterThanOrEqual(0);expect(gap).toBeLessThan(70);
  for(let i=0;i<3;i++)await page.locator('#robot-touch').tap();await expect(page.locator('#home-scene')).toHaveAttribute('data-reaction','dance');await page.waitForTimeout(4400);
  const turns=await page.evaluate(()=>{const f=__companionFrames.filter(f=>f.reaction==='dance');return {body:Math.max(...f.map(v=>v.body))-Math.min(...f.map(v=>v.body)),arm:Math.max(...f.map(v=>v.arm))-Math.min(...f.map(v=>v.arm)),last:__companionQA.rig.arms[0].upper.rotation.x};});expect(turns.body).toBeGreaterThan(6);expect(turns.arm).toBeGreaterThan(12);expect(Math.abs(turns.last)).toBeLessThan(.6);
  await page.evaluate(()=>window.__companionFrames=[]);await page.waitForTimeout(4000);
  const hover=await page.evaluate(()=>{const f=__companionFrames.filter(f=>f.reaction==='idle');return Math.max(...f.map(v=>v.y))-Math.min(...f.map(v=>v.y));});expect(hover).toBeGreaterThan(.075);expect(hover).toBeLessThan(.10);
 }finally{await context.close();}
});

test('copy preserves complete previews and history, and thinking SVG changes then stops',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);const chat=await chatRoutes(page);await ready(page);
 const question='Uma pergunta longa. '.repeat(30),answer='Texto completo, com quebras de linha.\n'.repeat(40)+'Fim da resposta.';
 await page.locator('#home-input').fill(question);await page.locator('#home-send').click();
 await expect(page.locator('#home-speech .thinking-indicator svg')).toBeVisible();const before=await page.locator('#home-speech .thinking-indicator').innerText();
 await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+10000;});await expect(page.locator('#home-speech .thinking-indicator')).not.toHaveText(before,{timeout:10000});
 await page.locator('#question-copy').click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(question.trim());
 chat.jobs[0].status='done';chat.jobs[0].answer=answer;
 await expect(page.locator('#home-speech .thinking-indicator')).toHaveCount(0,{timeout:10000});await expect(page.locator('#speech-more')).toBeVisible();
 await page.locator('#home-speech .copy-button').click();expect((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(answer);
 await page.locator('#speech-more').click();
 await page.locator('.history-question .copy-button').click();expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(question.trim());
 await page.locator('.history-answer .copy-button').click();expect((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(answer);
 await expect(page.locator('#home-messages')).not.toContainText('HERMES');
});

test('themes are legible across skyboxes, scene is not selectable and sound SVG is centered',async({page},testInfo)=>{
 await page.setViewportSize({width:393,height:852});const chat=await chatRoutes(page);await instrumentScene(page);
 chat.jobs.push({id:'palette',question:'Como funciona a flutuação?',answer:'A base magnética mantém o Sato Agent flutuando.',status:'done',created_at:Date.now()/1000});await ready(page);await resumeSeeded(page);
 await expect(page.locator('#home-speech')).toContainText(chat.jobs[0].answer,{timeout:10000});await expect(page.locator('.composer-heading')).toHaveCount(0);
 await expect(page.locator('#home-chat-status')).toHaveCSS('position','absolute');
 const selection=await page.evaluate(()=>['#home','#home-scene canvas','.home-nav','#home-speech .speech-text','#last-question-text','#home-input'].map(selector=>getComputedStyle(document.querySelector(selector)).userSelect));expect(selection).toEqual(['none','none','none','text','text','text']);
 await page.locator('#home-settings-toggle').click();await expect(page.locator('#settings-title')).toHaveText('Configurações');
 for(const kind of ['black','lab','forest']){
  await page.locator(`[name="home-scenario"][value="${kind}"]`).check();await expect(page.locator('#home')).toHaveAttribute('data-scenario',kind);
  for(const theme of ['cyan','mint','violet','amber']){
   await page.locator(`[name="home-theme"][value="${theme}"]`).check();
   const ratios=await page.evaluate(()=>{
    const rgb=value=>value.match(/[\d.]+/g).map(Number),luminance=values=>values.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    return ['.speech-card','.history-question','.history-answer','#last-question'].map(selector=>{
     const el=document.querySelector(selector),text=el.querySelector('p,.speech-text,#last-question-text'),style=getComputedStyle(el),bg=rgb(style.backgroundColor),ink=luminance(rgb(getComputedStyle(text).color));
     return [0,255].map(scene=>{const back=luminance(bg.map((v,i)=>i<3?v*(bg[3]??1)+scene*(1-(bg[3]??1)):v));return (Math.max(ink,back)+.05)/(Math.min(ink,back)+.05);});
    }).flat();
   });expect(Math.min(...ratios)).toBeGreaterThan(4.5);
  }
  await page.locator('[name="home-theme"][value="cyan"]').check();await page.locator('#settings-close').click();
  await page.screenshot({path:testInfo.outputPath(`verified-${kind}.png`)});await page.locator('#home-settings-toggle').click();
 }
 await page.locator('[name="home-theme"][value="violet"]').check();
 for(const active of [false,true]){
  if(active)await page.locator('#home-sound').click();
  const offset=await page.locator('#home-sound').evaluate(button=>{const b=button.getBoundingClientRect(),svg=[...button.querySelectorAll('svg')].find(svg=>svg.getBoundingClientRect().width),s=svg.getBoundingClientRect();return Math.hypot(b.x+b.width/2-s.x-s.width/2,b.y+b.height/2-s.y-s.height/2);});expect(offset).toBeLessThan(.5);
 }
 await page.screenshot({path:testInfo.outputPath('verified-settings.png')});await page.locator('#settings-close').click();await page.locator('#home-history-toggle').click();await page.screenshot({path:testInfo.outputPath('verified-history.png')});
 const blur=await page.locator('#home-history').evaluate(el=>getComputedStyle(el).backdropFilter);expect(blur).toBe('blur(1px)');
 const terrain=await page.evaluate(()=>{const mesh=__companionQA.world.getObjectByName('forest-terrain');const positions=mesh.geometry.getAttribute('position');return {texture:!!mesh.material.map,variation:Math.max(...Array.from({length:positions.count},(_,i)=>positions.getY(i)))-Math.min(...Array.from({length:positions.count},(_,i)=>positions.getY(i))),sky:__companionQA.world.getObjectByName('forest-skybox').visible};});expect(terrain.texture).toBe(true);expect(terrain.variation).toBeGreaterThan(.1);expect(terrain.sky).toBe(true);
 await page.reload();await expect(page.locator('#home')).toHaveAttribute('data-theme','violet');
});

test('history collapses long messages by default and keeps completed footers during thinking',async({page},testInfo)=>{
 await page.setViewportSize({width:393,height:852});const chat=await chatRoutes(page);
 const answer='Detalhes importantes desta resposta.\n'.repeat(50),question='Uma pergunta longa para o histórico. '.repeat(20);
 chat.jobs.push({id:'completed',question,answer,status:'done',created_at:Date.now()/1000},{id:'pending',question:'Outra pergunta',status:'running',created_at:Date.now()/1000});
 await ready(page);await page.locator('#home-history-toggle').click();await chooseSession(page);const completed=page.locator('[data-job="completed"]');
 for(const role of ['question','answer']){await expect(completed.locator(`.history-${role} .history-more`)).toHaveText('Ver mais');expect((await completed.locator(`.history-${role} p`).innerText()).length).toBeLessThan(role==='question'?question.length:answer.length);}
 await page.screenshot({path:testInfo.outputPath('history-collapsed.png')});
 await completed.locator('.history-answer .history-more').click();await expect(completed.locator('.history-answer p')).toHaveText(answer);
 await page.evaluate(()=>{const article=document.querySelector('[data-job="completed"]');window.__retainedFooterNodes=[...article.querySelectorAll('footer,footer *')];window.__completedChanges=[];window.__completedObserver=new MutationObserver(records=>__completedChanges.push(...records.map(record=>record.type)));__completedObserver.observe(article,{childList:true,subtree:true});const now=Date.now;Date.now=()=>now()+10000;});
 await page.waitForTimeout(2200);
 expect(await page.evaluate(()=>__retainedFooterNodes.every(node=>node.isConnected)&&__completedChanges.length===0)).toBe(true);await expect(completed.locator('.history-answer p')).toHaveText(answer);
 chat.jobs[1].status='done';chat.jobs[1].answer='A segunda resposta chegou.';await expect(page.locator('[data-job="pending"] .history-answer p')).toHaveText(chat.jobs[1].answer,{timeout:10000});
 expect(await page.evaluate(()=>__retainedFooterNodes.every(node=>node.isConnected)&&__completedChanges.length===0)).toBe(true);
 await page.locator('#history-sessions').click();await chooseSession(page);await expect(completed.locator('.history-answer p')).toHaveText(answer);
 await completed.locator('.history-answer .history-more').click();await expect(completed.locator('.history-answer .history-more')).toHaveText('Ver mais');
 await page.reload();await expect(page.locator('body')).toHaveAttribute('data-ready','true');await page.locator('#home-history-toggle').click();await chooseSession(page);await expect(completed.locator('.history-answer .history-more')).toHaveText('Ver mais');
});

test('full viewport backgrounds keep one canvas and resize only inside a rendered frame',async({page},testInfo)=>{
 await page.setViewportSize({width:393,height:852});const chat=await chatRoutes(page);await instrumentScene(page);await ready(page);
 await page.evaluate(()=>{window.__canvas=document.querySelector('#home-scene canvas');window.__drawingEvents=[];const renderer=__companionQA.renderer;for(const name of ['setSize','render']){const original=renderer[name].bind(renderer);renderer[name]=(...args)=>{__drawingEvents.push(name);return original(...args);};}});
 await page.locator('#home-input').fill('Uma pergunta para variar a altura do chat.');await page.locator('#home-send').click();await page.waitForTimeout(350);
 expect(await page.evaluate(()=>__drawingEvents.filter(event=>event==='setSize').length)).toBe(0);
 await page.setViewportSize({width:393,height:640});await page.waitForTimeout(300);
 const events=await page.evaluate(()=>__drawingEvents);expect(events.filter(event=>event==='setSize').length).toBe(1);expect(events[events.indexOf('setSize')+1]).toBe('render');
 for(const kind of ['lab','forest']){
  await page.locator('#home-settings-toggle').click();await page.locator(`[name="home-scenario"][value="${kind}"]`).check();await expect(page.locator('#home-scene')).toHaveAttribute('data-scenario',kind);await page.waitForTimeout(700);await page.locator('#settings-close').click();
  const background=await page.evaluate(()=>{const {renderer,world,camera}=__companionQA;renderer.render(world,camera);const gl=renderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(2,2,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return {same:__canvas===renderer.domElement,height:renderer.domElement.getBoundingClientRect().height,pixel:[...pixel]};});expect(background.same).toBe(true);expect(background.height).toBe(640);expect(background.pixel.slice(0,3).reduce((sum,n)=>sum+n,0)).toBeGreaterThan(100);
  await page.screenshot({path:testInfo.outputPath(`full-background-${kind}.png`)});
 }
 await page.route('**/js/home-environments.js',async route=>{await new Promise(resolve=>setTimeout(resolve,600));await route.continue();});await page.reload();await expect(page.locator('#home-loading')).toBeVisible();await expect(page.locator('#home-scene')).toHaveCSS('opacity','0');await expect(page.locator('body')).toHaveAttribute('data-ready','true');await expect(page.locator('#home')).toHaveAttribute('data-scenario','forest');
});

test('robot touch never stretches the sphere or arms',async({browser},testInfo)=>{
 const context=await browser.newContext({viewport:{width:393,height:852},reducedMotion:'no-preference'}),page=await context.newPage();
 try{
  await chatRoutes(page);await instrumentScene(page);await ready(page);
  await page.locator('#robot-touch').click();await page.waitForTimeout(400);await page.locator('#robot-touch').click();await page.waitForTimeout(650);
  const scales=await page.evaluate(()=>{const {rig}=__companionQA;return {root:rig.root.scale.toArray(),arms:rig.arms.map(arm=>{const mesh=arm.upper.getObjectByName('smooth-arm'),e=mesh.matrixWorld.elements;return [Math.hypot(e[0],e[1],e[2]),Math.hypot(e[4],e[5],e[6]),Math.hypot(e[8],e[9],e[10])];})};});expect(scales.root).toEqual([1,1,1]);for(const scale of scales.arms){expect(scale[0]).toBeCloseTo(1);expect(scale[1]).toBeCloseTo(1);expect(scale[2]).toBeCloseTo(.56);}
  await page.screenshot({path:testInfo.outputPath('rigid-boop.png')});
  await page.locator('#robot-touch').click();await page.waitForTimeout(2100);await page.screenshot({path:testInfo.outputPath('robot-back.png')});
 }finally{await context.close();}
});

test('ambient audio follows the scenario, mutes and resumes without duplicate loops',async({page})=>{
 await chatRoutes(page);await page.route('**/js/home-audio.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('return {startTyping,stopTyping,','window.__homeAudioQA={loops,buffers,context:()=>context};return {startTyping,stopTyping,')});});await ready(page);await page.locator('#home-settings-toggle').click();
 for(const [scenario,kind]of [['lab','hum'],['forest','nature']]){
  await page.locator(`[name="home-scenario"][value="${scenario}"]`).check();await expect(page.locator('#home-scene')).toHaveAttribute('data-scenario',scenario);await page.waitForFunction(kind=>__homeAudioQA.loops.has(kind),kind);
  expect(await page.evaluate(kind=>{const {loops,context}=__homeAudioQA,voice=loops.get(kind);return {size:loops.size,loop:voice.source.loop,state:context().state,buffer:!!voice.source.buffer};},kind)).toEqual({size:1,loop:true,state:'running',buffer:true});
 }
 await expect(page.locator('#home-sound')).toHaveAttribute('aria-pressed','true');await page.locator('#home-sound').click();await expect(page.locator('#home-sound')).toHaveAttribute('aria-pressed','false');expect(await page.evaluate(()=>__homeAudioQA.loops.size)).toBe(0);
 await page.locator('#home-sound').click();await page.waitForFunction(()=>__homeAudioQA.loops.has('nature'));expect(await page.evaluate(()=>__homeAudioQA.loops.size)).toBe(1);
 await page.locator('[name="home-scenario"][value="black"]').check();await expect(page.locator('#home-scene')).toHaveAttribute('data-scenario','black');expect(await page.evaluate(()=>__homeAudioQA.loops.size)).toBe(0);
});

for(const viewport of [{width:1440,height:1000},{width:393,height:852}])test(`input clears with its balloon before a delayed acknowledgement ${viewport.width}`,async({page})=>{
 await page.setViewportSize(viewport);const chat=await chatRoutes(page);let release,body;
 await page.route('**/api/lab/hermes-chat/jobs',async route=>{body=route.request().postDataJSON();await new Promise(resolve=>release=resolve);const job={id:body.request_id,conversation_id:body.conversation_id,question:body.question,status:'queued',created_at:Date.now()/1000};chat.jobs.push(job);await route.fulfill({status:202,json:{id:job.id,status:job.status,job}});});
 await ready(page);await page.locator('#home-input').fill('Mensagem com confirmação demorada');await page.locator('#home-input').press('Enter');
 await expect(page.locator('#last-question')).toContainText('Mensagem com confirmação demorada');await expect(page.locator('#home-input')).toHaveValue('');await expect(page.locator('#home-input')).toBeDisabled();
 release();await expect(page.locator('#home-input')).toBeEnabled();await expect(page.locator('.history-turn')).toHaveCount(1);expect(body.request_id).toMatch(/^[a-f0-9]{32}$/);
});

test('failed sends restore the draft and reuse the message ID on retry',async({page})=>{
 const chat=await chatRoutes(page);let requestId,attempts=0;
 await page.route('**/api/lab/hermes-chat/jobs/*',route=>route.fulfill({status:404,json:{error:'Mensagem não encontrada'}}));
 await page.route('**/api/lab/hermes-chat/jobs',route=>{const body=route.request().postDataJSON();attempts++;if(attempts===1){requestId=body.request_id;return route.fulfill({status:503,json:{error:'Falha temporária'}});}expect(body.request_id).toBe(requestId);const job={id:body.request_id,conversation_id:body.conversation_id,question:body.question,status:'queued',created_at:Date.now()/1000};chat.jobs.push(job);return route.fulfill({status:202,json:{id:job.id,status:job.status,job}});});
 await ready(page);await page.locator('#home-input').fill('Texto que não pode se perder');await page.locator('#home-send').click();await expect(page.locator('#home-chat-status')).toContainText('Falha temporária');await expect(page.locator('#home-input')).toHaveValue('Texto que não pode se perder');await expect(page.locator('#last-question')).toBeHidden();
 await page.locator('#home-send').click();await expect(page.locator('#home-input')).toHaveValue('');await expect(page.locator('#home-input')).toBeEnabled();expect(chat.jobs).toHaveLength(1);
});

test('sessions start empty, resume independently and keep their title after a reload',async({page},testInfo)=>{
 const chat=await chatRoutes(page);await ready(page);await expect(page.locator('#last-question')).toBeHidden();await expect(page.locator('#home-speech')).toBeHidden();
 await page.locator('#home-input').fill('Planejamento da floresta');await page.locator('#home-send').click();await expect(page.locator('#home-input')).toBeEnabled();const first=chat.jobs[0].conversation_id;
 await page.locator('#home-history-toggle').click();await expect(page.locator('#history-thread')).toBeVisible();await expect(page.locator('#home-sessions')).toBeHidden();await expect(page.locator('#history-new')).toBeHidden();await expect(page.locator('#history-sessions')).toHaveText('Lista de sessões');await page.locator('#history-close').click();await expect(page.locator('#home-history')).toBeHidden();await page.locator('#home-history-toggle').click();await expect(page.locator('#history-title')).toHaveText('Planejamento da floresta');await page.locator('#history-sessions').click();await expect(page.locator('#home-sessions')).toBeVisible();await expect(page.locator('#history-sessions')).toBeHidden();await page.locator('#history-new').click();await expect(page.locator('#home-speech')).toBeHidden();await expect(page.locator('#last-question')).toBeHidden();
 await page.locator('#home-input').fill('Equipamentos do laboratório');await page.locator('#home-send').click();await expect(page.locator('#home-input')).toBeEnabled();const second=chat.jobs[1].conversation_id;expect(first).not.toBe(second);
 chat.jobs[0].status='done';chat.jobs[0].answer='Resposta sobre a floresta.';await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('#last-question')).toContainText('Equipamentos');await expect(page.locator('#home-speech')).not.toContainText('Resposta sobre a floresta');
 await page.reload();await expect(page.locator('body')).toHaveAttribute('data-ready','true');await expect(page.locator('#home-speech')).toBeHidden();await expect(page.locator('#last-question')).toBeHidden();await page.locator('#home-history-toggle').click();await expect(page.locator('.session-card')).toHaveCount(2);await page.screenshot({path:testInfo.outputPath('session-list-desktop.png')});
 await page.locator(`[data-conversation="${first}"]`).click();await expect(page.locator('#history-title')).toHaveText('Planejamento da floresta');await expect(page.locator('#home-messages')).toContainText('Resposta sobre a floresta');await expect(page.locator('#home-messages')).not.toContainText('Equipamentos');
 await page.locator('#home-input').fill('Continue o plano');await page.locator('#home-send').click();await expect(page.locator('#home-input')).toBeEnabled();expect(chat.jobs[2].conversation_id).toBe(first);await expect(page.locator('#history-title')).toHaveText('Planejamento da floresta');
 await page.setViewportSize({width:393,height:852});await page.screenshot({path:testInfo.outputPath('session-thread-mobile.png')});
});

test('copy and clock stay together at the right edge with and without Ver mais',async({page})=>{
 const chat=await chatRoutes(page);chat.jobs.push({id:'footer',question:'Pergunta com muitos detalhes. '.repeat(20),answer:'Resposta longa. '.repeat(60),status:'done',created_at:Date.now()/1000});await ready(page);await resumeSeeded(page);
 for(const selector of ['#home-speech .bubble-actions','#last-question .bubble-actions']){
  const alignment=await page.locator(selector).evaluate(footer=>{const more=footer.querySelector('button'),copy=footer.querySelector('.copy-button'),time=footer.querySelector('time'),bounds=footer.getBoundingClientRect(),m=more.getBoundingClientRect(),c=copy.getBoundingClientRect(),t=time.getBoundingClientRect();return {left:m.left-bounds.left,gap:t.left-c.right,right:bounds.right-t.right};});expect(alignment.left).toBeLessThan(1);expect(alignment.gap).toBeLessThanOrEqual(6);expect(alignment.right).toBeLessThan(1);
 }
 await page.locator('#home-history-toggle').click();await chooseSession(page);
 for(const role of ['question','answer']){
  const footer=page.locator(`.history-${role} footer`),position=()=>footer.evaluate(el=>{const copy=el.querySelector('.copy-button').getBoundingClientRect(),time=el.querySelector('time').getBoundingClientRect();return time.left-copy.right;});expect(await position()).toBeLessThanOrEqual(6);
  await page.locator(`.history-${role} .history-more`).click();expect(await position()).toBeLessThanOrEqual(6);
 }
});

test('official typewriter renders literal text once and stops keyboard sound on completion or mute',async({browser})=>{
 const context=await browser.newContext({reducedMotion:'no-preference'}),page=await context.newPage();
 try{
  const chat=await chatRoutes(page);await page.route('**/js/home-audio.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('return {startTyping,stopTyping,','window.__typingAudio=()=>typingVoice;return {startTyping,stopTyping,')});});
  await ready(page);await page.locator('#home-input').fill('Responda com texto literal');await page.locator('#home-send').click();await expect(page.locator('#home-input')).toBeEnabled();chat.jobs[0].status='done';chat.jobs[0].answer='<img src=x onerror=alert(1)> Texto ^99999 `código` & emoji 👩🏽‍💻. '.repeat(10);await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  const text=page.locator('#home-speech .speech-text');await expect(text).toHaveAttribute('data-typing','true',{timeout:10000});await page.waitForFunction(()=>!!__typingAudio());const partial=await text.textContent();expect(partial.length).toBeLessThan(421);expect(chat.jobs[0].answer.startsWith(partial)).toBe(true);await expect(text.locator('img')).toHaveCount(0);
  await page.locator('#home-settings-toggle').click();await page.locator('#home-sound').click();expect(await page.evaluate(()=>__typingAudio())).toBeFalsy();await page.locator('#settings-close').click();await expect(text).not.toHaveAttribute('data-typing','true',{timeout:15000});const excerpt=await text.textContent();expect(excerpt.endsWith('…')).toBe(true);expect(chat.jobs[0].answer.startsWith(excerpt.slice(0,-1))).toBe(true);expect(excerpt.length).toBeLessThan(421);expect(await text.evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBe(true);expect(await page.evaluate(()=>__typingAudio())).toBeFalsy();
  await page.waitForTimeout(2200);await expect(text).not.toHaveAttribute('data-typing','true');await expect(text.locator('img')).toHaveCount(0);
 }finally{await context.close();}
});

test('a lost acknowledgement reconciles the saved message without restoring or duplicating the draft',async({page})=>{
 const chat=await chatRoutes(page);let saved;
 await page.route('**/api/lab/hermes-chat/jobs',route=>{const body=route.request().postDataJSON();saved={id:body.request_id,conversation_id:body.conversation_id,question:body.question,status:'queued',created_at:Date.now()/1000};chat.jobs.push(saved);return route.abort('failed');});
 await page.route('**/api/lab/hermes-chat/jobs/*',route=>route.fulfill({json:saved}));
 await ready(page);await page.locator('#home-input').fill('Confirmação perdida');await page.locator('#home-send').click();await expect(page.locator('#home-input')).toBeEnabled();await expect(page.locator('#home-input')).toHaveValue('');await expect(page.locator('#last-question')).toContainText('Confirmação perdida');await expect(page.locator('.history-turn')).toHaveCount(1);expect(chat.jobs).toHaveLength(1);
});

test('a history request started before submission cannot remove the newly registered balloon',async({page})=>{
 const chat=await chatRoutes(page);await ready(page);await page.locator('#home-input').fill('Mensagem anterior');await page.locator('#home-send').click();await expect(page.locator('#home-input')).toBeEnabled();let release;
 await page.route('**/api/lab/hermes-chat/history?**',async route=>{const snapshot=JSON.parse(JSON.stringify(chat.jobs));await new Promise(resolve=>release=resolve);await route.fulfill({json:{jobs:snapshot}});});
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect.poll(()=>!!release).toBe(true);
 await page.locator('#home-input').fill('Nova mensagem durante o refresh');await page.locator('#home-send').click();await expect(page.locator('#home-input')).toBeEnabled();release();await expect(page.locator('#last-question')).toContainText('Nova mensagem durante o refresh');await expect(page.locator('#home-input')).toHaveValue('');await expect(page.locator('.history-turn')).toHaveCount(2);
});

test('latest messages fold above the robot, reopen and fold again without losing the conversation',async({browser},testInfo)=>{
 const context=await browser.newContext({viewport:{width:393,height:852},reducedMotion:'no-preference'}),page=await context.newPage();
 try{
  const chat=await chatRoutes(page);chat.jobs.push({id:'peek',question:'Última pergunta',answer:'Última resposta salva.',status:'done',created_at:Date.now()/1000});
  await ready(page);await resumeSeeded(page);await page.mouse.move(0,0);
  await expect(page.locator('#home-speech')).toContainText('Última resposta salva.');await expect(page.locator('#conversation-title')).toHaveCount(0);
  await expect(page.locator('#home')).toHaveAttribute('data-preview-collapsed','true',{timeout:8000});await expect(page.locator('#chat-peek')).toHaveCSS('opacity','1');
  const head=await page.locator('#robot-touch').boundingBox(),peek=await page.locator('#chat-peek').boundingBox();expect(peek.y+peek.height/2).toBeLessThan(head.y);await expect(page.locator('#home-speech')).toHaveCSS('opacity','0');
  await page.screenshot({path:testInfo.outputPath('collapsed-mobile.png')});await page.locator('#chat-peek').click();await page.mouse.move(0,0);await expect(page.locator('#home-speech')).toHaveCSS('opacity','1');await expect(page.locator('#last-question')).toContainText('Última pergunta');
  await page.screenshot({path:testInfo.outputPath('revealed-mobile.png')});await expect(page.locator('#home')).toHaveAttribute('data-preview-collapsed','true',{timeout:8000});
  await page.locator('#home-history-toggle').click();await chooseSession(page);await expect(page.locator('#home-messages')).toContainText('Última resposta salva.');await page.locator('#history-sessions').click();await page.locator('#history-new').click();await expect(page.locator('#chat-peek')).toBeHidden();
 }finally{await context.close();}
});

for(const viewport of [{width:393,height:852},{width:1440,height:1000}])test(`camera stays fixed across messages, preview and history ${viewport.width}`,async({page})=>{
 await page.setViewportSize(viewport);await chatRoutes(page);await instrumentScene(page);await ready(page);
 const camera=()=>page.evaluate(()=>({projection:__companionQA.camera.projectionMatrix.toArray(),position:__companionQA.camera.position.toArray(),canvas:[__companionQA.renderer.domElement.clientWidth,__companionQA.renderer.domElement.clientHeight]}));
 for(const kind of ['black','lab','forest']){
  await page.locator('#home-settings-toggle').click();await page.locator(`[name="home-scenario"][value="${kind}"]`).check();await expect(page.locator('#home-scene')).toHaveAttribute('data-scenario',kind);await page.locator('#settings-close').click();const before=await camera();
  await page.locator('#home-input').fill(('Pergunta longa sobre a cena. ').repeat(15));await page.locator('#home-send').click();await expect(page.locator('#last-question')).toBeVisible();expect(await camera()).toEqual(before);
  await page.locator('#home-history-toggle').click();await chooseSession(page);expect(await camera()).toEqual(before);await page.keyboard.press('Escape');expect(await camera()).toEqual(before);
  await page.locator('#home-input').fill('Linha\n'.repeat(8));await expect(page.locator('#home-input')).toHaveValue('Linha\n'.repeat(8));expect(await camera()).toEqual(before);await page.locator('#home-input').fill('');
 }
});

test('default wallpaper sits behind the transparent canvas and is absent in lab and forest',async({page},testInfo)=>{
 await chatRoutes(page);await instrumentScene(page);await ready(page);
 const layer=await page.evaluate(()=>{const {renderer,world,camera}=__companionQA;renderer.render(world,camera);const gl=renderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(2,2,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return {art:Number(getComputedStyle(document.getElementById('home-art')).zIndex),scene:Number(getComputedStyle(document.getElementById('home-scene')).zIndex),alpha:pixel[3]};});expect(layer.scene).toBeGreaterThan(layer.art);expect(layer.alpha).toBe(0);
 for(const button of await page.locator('#home button,#home a').all()){if(await button.isVisible()){await button.evaluate(el=>el.focus());await expect(button).toHaveCSS('outline-style','none');}}
 await page.keyboard.press('Tab');expect(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle)).toBe('none');
 await page.screenshot({path:testInfo.outputPath('default-wallpaper.png')});await page.locator('#home-settings-toggle').click();await expect(page.locator('.scene-option').first()).toContainText('Padrão');
 for(const kind of ['lab','forest']){await page.locator(`[name="home-scenario"][value="${kind}"]`).check();await expect(page.locator('#home-scene')).toHaveAttribute('data-scenario',kind);await expect(page.locator('#home-art')).toHaveCSS('opacity','0');}
});

for(const viewport of [{width:393,height:852},{width:393,height:480}])test(`typing sound ends at the visible preview without muting ${viewport.height}`,async({browser})=>{
 const context=await browser.newContext({viewport,reducedMotion:'no-preference'}),page=await context.newPage();
 try{
  const chat=await chatRoutes(page);await page.route('**/js/home-audio.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('return {startTyping,stopTyping,','window.__typingAudio=()=>typingVoice;return {startTyping,stopTyping,')});});
  await ready(page);await page.locator('#home-input').fill('Resposta extensa');await page.locator('#home-send').click();await expect(page.locator('#home-input')).toBeEnabled();
  const answer='Detalhes extensos 👾 sobre videogames, robôs e seus cenários. '.repeat(25);chat.jobs[0].status='done';chat.jobs[0].answer=answer;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  const text=page.locator('#home-speech .speech-text');await expect(text).toHaveAttribute('data-typing','true',{timeout:10000});await page.waitForFunction(()=>!!__typingAudio());await expect(text).not.toHaveAttribute('data-typing','true',{timeout:10000});
  const excerpt=await text.textContent();expect(answer.startsWith(excerpt.slice(0,-1))).toBe(true);expect(excerpt.endsWith('…')).toBe(true);expect(excerpt.length).toBeLessThan(420);expect(await text.evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBe(true);expect(await page.evaluate(()=>!!__typingAudio())).toBe(false);await expect(page.locator('#speech-more')).toBeVisible();
  await page.waitForTimeout(1200);expect(await text.textContent()).toBe(excerpt);expect(await page.evaluate(()=>!!__typingAudio())).toBe(false);
 }finally{await context.close();}
});
