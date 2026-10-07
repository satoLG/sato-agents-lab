const {test,expect}=require('@playwright/test');

async function setup(page,scenario='lab'){
 await page.addInitScript(kind=>localStorage.setItem('sato-home-scenario',kind),scenario);
 await page.route('**/api/lab/hermes-chat/session',route=>route.fulfill({json:{available:false,authenticated:false}}));
 await page.route('**/js/home-scene.js',async route=>{
  const response=await route.fetch(),source=await response.text();
  const sample=`window.__homeSample={position:rig.root.position.toArray(),heading:rig.root.rotation.y,camera:camera.position.toArray(),eye:rig.pupil.position.toArray(),head:rig.head.rotation.toArray(),scenario:currentScenario,active:navigation.active,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,center:rig.root.localToWorld(new T.Vector3(0,1.2,0)).project(camera).toArray(),fov:camera.fov};`;
  const helpers=`window.__homeQA={place(x,z){rig.root.position.set(x,0,z);},occluded(){
   const set=sets.get(currentScenario),ray=new T.Raycaster();
   return [-.3,0,.3].some(x=>{const end=rig.root.localToWorld(new T.Vector3(x,1.2,0)),direction=end.clone().sub(camera.position);ray.set(camera.position,direction.clone().normalize());ray.far=direction.length()-.3;return ray.intersectObject(set.root,true).length>0;});
  }};`;
  await route.fulfill({response,body:source.replace('function report(){',helpers+'function report(){'+sample)});
 });
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:20000});
}
const sample=page=>page.evaluate(()=>window.__homeSample);
async function hold(page,key,ms){await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);}
async function drag(page,x,y,dx,dy){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:4});await page.mouse.up();}
async function scenario(page,name,kind){await page.getByRole('button',{name:'Configurações',exact:true}).click();await page.getByRole('radio',{name,exact:true}).check();await expect(page.locator('#home')).toHaveAttribute('data-scenario',kind);await page.getByRole('button',{name:'Fechar configurações',exact:true}).click();}

test('play, movement, orbit, wall collision and a front view at the stopped location',async({page},info)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await setup(page);
 const order=await page.locator('.composer-row').evaluate(el=>[...el.querySelectorAll('button')].map(b=>b.id));expect(order.indexOf('home-explore')).toBe(order.indexOf('home-send')+1);expect(order.indexOf('home-settings-toggle')).toBe(order.indexOf('home-explore')+1);
 await page.getByRole('button',{name:'Explorar cenário',exact:true}).click();await expect(page.locator('#home-explore')).toHaveAttribute('aria-pressed','true');
 const before=await sample(page);await hold(page,'w',2400);const moved=await sample(page);expect(Math.hypot(moved.position[0]-before.position[0],moved.position[2]-before.position[2])).toBeGreaterThan(.6);
 await drag(page,1100,400,-350,70);await page.waitForTimeout(700);const orbited=await sample(page);expect(Math.hypot(orbited.camera[0]-moved.camera[0],orbited.camera[2]-moved.camera[2])).toBeGreaterThan(2);
 await page.screenshot({path:info.outputPath('lab-orbit.png')});
 await hold(page,'s',6500);const boundary=await sample(page);expect(Math.abs(boundary.position[0])).toBeLessThan(8.2);expect(Math.abs(boundary.position[2])).toBeLessThan(9.2);
 await page.keyboard.press('Escape');await expect(page.locator('#home-explore')).toHaveAttribute('aria-pressed','false');await page.waitForTimeout(1700);const stopped=await sample(page);
 expect(stopped.position[0]).toBeCloseTo(boundary.position[0],2);expect(stopped.position[2]).toBeCloseTo(boundary.position[2],2);
 const dx=stopped.camera[0]-stopped.position[0],dz=stopped.camera[2]-stopped.position[2];expect((Math.sin(stopped.heading)*dx+Math.cos(stopped.heading)*dz)/Math.hypot(dx,dz)).toBeGreaterThan(.95);expect(await page.evaluate(()=>__homeQA.occluded())).toBe(false);
 expect(stopped.camera[0]).toBeGreaterThan(-8.8);expect(stopped.camera[0]).toBeLessThan(8.8);expect(Math.abs(stopped.camera[2])).toBeLessThan(9.8);
 expect(Math.abs(stopped.center[0])).toBeLessThan(.5);expect(Math.abs(stopped.center[1])).toBeLessThan(.85);await page.screenshot({path:info.outputPath('lab-return.png')});expect(errors).toEqual([]);
});

test('front view stays visible beside walls and laboratory equipment',async({page},info)=>{
 await setup(page);
 for(const [i,[x,z]]of [[7.8,0],[-7.8,0],[0,8.8],[0,-8.3],[3.6,-7.4],[-4.35,-6.8],[7.8,8.9]].entries()){
  await page.getByRole('button',{name:'Explorar cenário',exact:true}).click();await page.evaluate(([x,z])=>__homeQA.place(x,z),[x,z]);await page.waitForTimeout(120);
  await page.getByRole('button',{name:'Parar exploração',exact:true}).click();await page.waitForTimeout(1600);const s=await sample(page);
  expect(Math.abs(s.center[0])).toBeLessThan(.5);expect(Math.abs(s.center[1])).toBeLessThan(.85);expect(await page.evaluate(()=>__homeQA.occluded()),`view ${x},${z}`).toBe(false);
  await page.screenshot({path:info.outputPath(`lab-front-${i}.png`)});
 }
});

test('forest works all around, stops at shore/hedges and returns to the robot',async({page},info)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await setup(page,'forest');await page.getByRole('button',{name:'Explorar cenário',exact:true}).click();
 await hold(page,'d',5000);let pos=(await sample(page)).position;expect(pos[0]).toBeLessThan(6.4);expect(pos[0]).toBeGreaterThan(-10.4);
 for(let i=0;i<4;i++){await drag(page,1100,400,-262,0);await page.waitForTimeout(500);const view=await sample(page);expect(Math.hypot(view.camera[0]-view.position[0],view.camera[1]-view.position[1]-1.15,view.camera[2]-view.position[2])).toBeGreaterThan(1.5);expect(Math.abs(view.center[0])).toBeLessThan(.5);expect(Math.abs(view.center[1])).toBeLessThan(.85);await page.screenshot({path:info.outputPath(`forest-side-${i}.png`)});}
 await page.getByRole('button',{name:'Parar exploração',exact:true}).click();await page.waitForTimeout(1700);const stopped=await sample(page);expect(stopped.position[0]).toBeCloseTo(pos[0],2);
 await scenario(page,'Padrão','black');await expect(page.locator('#home-explore')).toBeHidden();expect((await sample(page)).position[0]).toBeCloseTo(0,2);expect(errors).toEqual([]);
});

test('iris follows all pointer quadrants while the optic stays inside its socket',async({page},info)=>{
 await setup(page);
 const views=[];
 for(const [x,y]of [[120,150],[1300,150],[1300,850],[120,850]]){
  await page.mouse.move(x,y);await page.waitForTimeout(500);const s=await sample(page);views.push(s.eye);expect(Math.hypot(s.eye[0],s.eye[1]-.015)).toBeLessThanOrEqual(.0251);expect(s.eye[2]).toBe(.611);expect(s.head.slice(0,3)).toEqual([0,0,0]);
  await page.screenshot({path:info.outputPath(`eye-${x}-${y}.png`)});
 }
 expect(views[0][0]).toBeLessThan(0);expect(views[1][0]).toBeGreaterThan(0);expect(views[0][1]).toBeGreaterThan(.015);expect(views[2][1]).toBeLessThan(.015);
});

test('wallpaper bounces, displaces neighbors, restores and ignores composer input',async({page},info)=>{
 await setup(page,'black');await expect(page.locator('#home-art>svg')).toBeVisible();
 const glyphs=page.locator('#home-art>svg>g'),origins=await glyphs.evaluateAll(nodes=>nodes.map(el=>({transform:el.getAttribute('transform'),box:el.getBoundingClientRect().toJSON()})));
 const index=origins.findIndex(o=>o.box.x>170&&o.box.x<250&&o.box.y>250&&o.box.y<350),o=origins[index];expect(index).toBeGreaterThan(-1);
 await page.mouse.move(o.box.x+o.box.width/2,o.box.y+o.box.height/2);await page.waitForTimeout(280);
 const changes=await glyphs.evaluateAll(nodes=>nodes.map(el=>el.getAttribute('transform')));expect(changes[index]).toContain('scale(');expect(changes.filter((t,i)=>t!==origins[i].transform).length).toBeGreaterThan(4);
 await page.screenshot({path:info.outputPath('wallpaper-bounce.png')});await page.mouse.move(700,960);await page.waitForTimeout(2200);
 const restored=await glyphs.evaluateAll(nodes=>nodes.map(el=>el.getAttribute('transform')));expect(restored[index]).toBe(origins[index].transform);
});

test('mobile reveals one floating stick only during movement and supports simultaneous look',async({browser},info)=>{
 const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'no-preference'}),page=await context.newPage();
 try{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await setup(page,'forest');await page.getByRole('button',{name:'Explorar cenário',exact:true}).tap();await expect(page.locator('#home-joystick')).toBeHidden();
  const cdp=await context.newCDPSession(page),point=(id,x,y)=>({id,x,y,radiusX:4,radiusY:4,force:1});const before=await sample(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(0,80,530)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(0,80,465)]});await expect(page.locator('#home-joystick')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(0,80,465),point(1,300,420)]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(0,80,465),point(1,230,455)]});
  await page.waitForTimeout(1200);const moved=await sample(page);expect(Math.hypot(moved.position[0]-before.position[0],moved.position[2]-before.position[2])).toBeGreaterThan(.7);
  await page.screenshot({path:info.outputPath('mobile-stick.png')});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('#home-joystick')).toBeHidden();
  const atRelease=(await sample(page)).position;await page.waitForTimeout(350);expect((await sample(page)).position[0]).toBeCloseTo(atRelease[0],2);
  await page.getByRole('button',{name:'Parar exploração',exact:true}).tap();await page.waitForTimeout(1700);await page.screenshot({path:info.outputPath('mobile-return.png')});
  await scenario(page,'Padrão','black');
  const drawings=page.locator('#home-art>svg>g'),beforeTouch=await drawings.evaluateAll(nodes=>nodes.map(el=>el.getAttribute('transform')));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(0,70,220)]});
  for(const x of [95,125,155]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(0,x,220)]});await page.waitForTimeout(90);}
  const duringTouch=await drawings.evaluateAll(nodes=>nodes.map(el=>el.getAttribute('transform')));expect(duringTouch.filter((value,index)=>value!==beforeTouch[index]).length).toBeGreaterThan(4);
  await page.screenshot({path:info.outputPath('mobile-wallpaper-touch.png')});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(1500);
  expect(await drawings.evaluateAll(nodes=>nodes.filter(el=>el.getAttribute('transform').includes('scale(')).length)).toBe(0);expect(errors).toEqual([]);
 }finally{await context.close();}
});
