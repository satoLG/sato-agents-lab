const {test,expect}=require('@playwright/test');

test('private robot chat logs in, queues a question and later shows the Hermes answer',async({page})=>{
  test.setTimeout(180000);await page.setViewportSize({width:800,height:600});
  // Conversation coverage runs the actual scene updates without full software-GPU frames.
  await page.route('**/js/lab-scene.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('renderer.render(world,camera);','window.chatQA={robots,avatar,groundAt,stopWalking};world.updateMatrixWorld(true);camera.updateMatrixWorld(true);')});});
  let authenticated=false,csrfSeen=false;const jobs=[];
  await page.route('**/api/lab/hermes-chat/session',route=>route.fulfill({json:{available:true,authenticated,csrf:authenticated?'test-csrf':null}}));
  await page.route('**/api/lab/hermes-chat/login',route=>{
    authenticated=route.request().postDataJSON().password==='test-password';
    return route.fulfill({json:{available:true,authenticated,csrf:'test-csrf'}});
  });
  await page.route('**/api/lab/hermes-chat/jobs',route=>{
    csrfSeen=route.request().headers()['x-chat-csrf']==='test-csrf';
    const payload=route.request().postDataJSON();jobs.push({id:'a'.repeat(32),robot_id:payload.robot_id,question:payload.question,status:'queued',answer:null,error:null,attempts:0,created_at:Date.now()/1000,updated_at:Date.now()/1000});
    setTimeout(()=>{jobs[0].status='done';jobs[0].answer='Hermes confirma que a VM usa CPU e RAM.';jobs[0].updated_at=Date.now()/1000;},4000);
    return route.fulfill({status:202,json:{id:jobs[0].id,status:'queued'}});
  });
  await page.route('**/api/lab/hermes-chat/history?**',route=>route.fulfill({json:{jobs}}));
  await page.route('**/api/lab/hermes-chat/stream?**',route=>route.fulfill({contentType:'text/event-stream',body:`event: history\ndata: ${JSON.stringify({jobs})}\n\n`}));
  await page.goto('/lab');await expect(page.locator('#loading')).toBeHidden({timeout:60000});await page.locator('#lab-play').click();
  await page.evaluate(()=>{const q=chatQA,p=q.robots.get('guide:hermes').rig.root.position;q.stopWalking();q.avatar.position.set(p.x+1.4,q.groundAt(p.x+1.4,p.z),p.z);});
  await expect(page.locator('#interaction')).toHaveAttribute('data-robot','guide:hermes',{timeout:55000});
  await page.locator('#interaction').click();await expect(page.locator('#chat-form')).toBeHidden();await page.locator('#chat-free-toggle').click();await expect(page.locator('#chat-login')).toBeVisible();
  await expect(page.locator('#chat-form')).toBeHidden();
  await page.locator('#chat-password').fill('test-password');await page.locator('#chat-login button').click();
  await expect(page.locator('#chat-form')).toBeVisible();
  await page.locator('#chat-input').fill('Qual é o uso da VM?');await page.locator('#chat-form button').click();
  await expect(page.locator('#chat-messages')).toContainText('Pergunta guardada na fila');
  await expect(page.locator('#chat-messages')).toContainText('Hermes confirma que a VM usa CPU e RAM.',{timeout:10000});
  expect(csrfSeen).toBe(true);
});
