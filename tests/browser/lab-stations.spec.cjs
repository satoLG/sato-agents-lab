const {test,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:30000});
test('station prompts, dashboard monitors, bounded dialogue and semantic search',async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width:960,height:720});
 await page.addInitScript(()=>window.labQARender=false);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/js/lab-scene.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('renderer.render(world,camera);','window.stationQA={world,hall,robots,zones,avatar,groundAt,stopWalking,obstacles,campus,ragDome,render:()=>renderer.render(world,camera)};if(window.labQARender!==false)renderer.render(world,camera);else{world.updateMatrixWorld(true);camera.updateMatrixWorld(true);}')});});
 await page.route('**/api/rag/search?*',route=>route.fulfill({json:{hits:[{id:'doc1',distance:.23}],graph:{nodes:[{id:'query',kind:'query',label:'Consulta'},{id:'doc1',kind:'doc',label:'Manual da VM',distance:.23,preview:'Trecho real do resultado de teste'}],edges:[{source:'query',target:'doc1'}]}}}));
 await page.goto('/lab');await page.waitForFunction(()=>window.stationQA,null,{timeout:100000});await page.locator('#lab-play').click();
 // Use the real proximity callback and E key with the receptionist across the counter.
 await page.evaluate(()=>{const q=stationQA;q.stopWalking();q.avatar.position.set(-14,q.groundAt(-14,24),24);});
 await expect(page.locator('#interaction')).toBeVisible();await expect(page.locator('#interaction strong')).toHaveText('Conversar');
 await page.locator('#scene').focus();await page.keyboard.press('e');await expect(page.locator('#chat')).toBeVisible();
 for(const selector of ['#chat','.dialogue-layer .speech-card']){
  const style=await page.locator(selector).first().evaluate(el=>({background:getComputedStyle(el).backgroundColor,blur:getComputedStyle(el).backdropFilter}));expect(style.background).toMatch(/^rgba/);expect(style.blur).toContain('blur');
 }
 await page.evaluate(async()=>{const {createDialogue}=await import('/static/js/lab-dialogue.js');const d=createDialogue(document.getElementById('scene'));d.setMessages([{role:'user',text:'Pergunta longa '.repeat(100)},{role:'robot',text:'Resposta longa sobre os dados observados '.repeat(100)}],'Gateway');d.setOpen(true);window.testDialogue=d;});
 for(const viewport of [{width:960,height:720},{width:390,height:680},{width:740,height:360}]){
  await page.setViewportSize(viewport);await expect.poll(()=>page.evaluate(()=>[...document.querySelectorAll('.dialogue-layer:not([hidden]) .speech-card'),document.getElementById('chat')].every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}))).toBe(true);
 }
 await page.setViewportSize({width:390,height:680});await page.screenshot({path:'/workspace/scratch/lab-stations-chat-mobile.png'});
 await page.evaluate(()=>testDialogue.setOpen(false));await page.locator('#chat-close').click();await page.setViewportSize({width:960,height:720});
 // Empty space inside RAG still offers an interaction without needing a robot.
 await page.evaluate(()=>{const q=stationQA;q.stopWalking();q.avatar.position.set(28,q.groundAt(28,-24),-24);});
 await expect(page.locator('#interaction strong')).toHaveText('Explorar vetores');await page.locator('#interaction').click();await expect(page.locator('#rag-panel')).toBeVisible();
 await page.locator('#rag-query').fill('Como funciona a VM?');await page.locator('#rag-search-submit').click();await expect(page.locator('#rag-node-title')).toHaveText('Manual da VM');await expect(page.locator('#rag-node-detail')).toContainText('0.2300');
 const result=await page.evaluate(()=>{const q=stationQA,planes=[];q.world.traverse(o=>{if(o.name==='dashboard-indicator-screen')planes.push(o);});const root=q.robots.get('guide:gateway').rig.root.position;return {screens:planes.length,clearance:planes.every(p=>p.position.z>.045),robot:{x:root.x,z:root.z},banks:[...q.zones.values()].every(z=>z.group.getObjectByName('dashboard-monitor-bank')),trees:!!q.world.getObjectByName('garden-tree'),bulkheads:!!q.world.getObjectByName('provider-wall-bulkhead')};});
 expect(result.screens).toBe(48);expect(result.clearance).toBe(true);expect(result.banks).toBe(true);expect(result.robot.x).toBe(-14);expect(result.robot.z).toBeCloseTo(21.1);expect(result.trees).toBe(true);expect(result.bulkheads).toBe(true);
 const continuity=await page.evaluate(()=>{const q=stationQA,node=q.ragDome.network.children.find(o=>o.userData.ragNode==='doc1'),before=node.position.toArray();q.ragDome.setGraph({nodes:[{id:'repo-new',kind:'repo',label:'Nova fonte'}],edges:[]});const after=q.ragDome.network.children.find(o=>o.userData.ragNode==='doc1');return {same:node===after,before,after:after.position.toArray()};});expect(continuity.same).toBe(true);expect(continuity.before).toEqual(continuity.after);expect(errors).toEqual([]);
 await page.locator('#rag-close').click();await page.evaluate(()=>{const q=stationQA;q.avatar.position.set(0,q.groundAt(0,0),0);});await page.locator('#camera-room').click();
 await page.evaluate(()=>stationQA.render());await page.screenshot({path:'/workspace/scratch/lab-stations-room.png'});
 await page.evaluate(()=>{const q=stationQA;q.stopWalking();q.avatar.position.set(34,q.groundAt(34,14),14);});await expect(page.locator('#interaction strong')).toHaveText('Ver indicadores');await page.locator('#interaction').click();await expect(page.locator('#equipment-panel')).toBeVisible();await expect(page.locator('#equipment-panel')).toContainText('EVENTS');await page.getByRole('button',{name:'Fechar',exact:true}).click();
});
