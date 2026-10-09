const {test,expect}=require('@playwright/test');
test('shared floating robot renders and banks without imported gait or WebGL errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__avatar_test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto('/__avatar_test');
 const result=await page.evaluate(async()=>{
  const T=await import('/static/vendor/three.module.min.js'),{loadSatoAvatar}=await import('/static/js/lab-avatar.js');
  const hero=await loadSatoAvatar(),scene=new T.Scene();scene.add(hero.root);scene.add(new T.HemisphereLight(0xffffff,0x555555,3));
  const camera=new T.PerspectiveCamera(40,1,.1,100);camera.position.set(0,1.2,5);camera.lookAt(0,1.2,0);
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(400,400);document.body.append(renderer.domElement);
  for(let i=0;i<60;i++)hero.update(1/60,{speed:3,travelAngle:Math.PI/2});renderer.render(scene,camera);
  const gl=renderer.getContext(),pixels=new Uint8Array(400*400*4);gl.readPixels(0,0,400,400,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  const result={legs:hero.legs.length,bank:hero.spine.rotation.z,arms:hero.arms.map(a=>a.upper.rotation.x),events:hero.drainEvents(),lit:pixels.filter((v,i)=>i%4!==3&&v>20).length,error:gl.getError()};renderer.dispose();return result;
 });
 expect(result.legs).toBe(0);expect(result.bank).toBeLessThan(-.22);expect(result.arms.every(a=>Math.abs(a)<.001)).toBe(true);expect(result.events).toEqual([]);expect(result.lit).toBeGreaterThan(5000);expect(result.error).toBe(0);expect(errors).toEqual([]);
});
test('failed scene module leaves the dashboard fallback usable',async({page})=>{
 await page.route('**/js/lab-scene.js',route=>route.abort());await page.goto('/lab');await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#scene-fallback')).toBeVisible();await expect(page.locator('#scene-fallback a')).toHaveAttribute('href','/dashboard');
});
