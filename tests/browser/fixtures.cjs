const {test:base,expect}=require('@playwright/test');

// Keep real WebGL draws and shader compilation, but avoid saturating a software
// GPU while tests wait for chat, navigation, collision and DOM assertions.
function frameLimitedSource(source){
 return 'let __testLastFrame=-Infinity;\n'+source
  .replace(/let pixelRatio=Math\.min\(devicePixelRatio,[\d.]+\)/, 'let pixelRatio=.5')
  .replace('function applyResize(){', 'function applyResize(){__testLastFrame=-Infinity;')
  .replaceAll('renderer.render(world,camera);',
   'world.updateMatrixWorld(true);camera.updateMatrixWorld(true);if(performance.now()-__testLastFrame>=1000){renderer.render(world,camera);__testLastFrame=performance.now();}');
}
const test=base.extend({
 browser:[async({browser},use)=>{
  const createContext=browser.newContext.bind(browser);
  browser.newContext=async(...args)=>{
   const context=await createContext(...args);
   await context.route('**/js/home-scene.js*',async route=>{
    const response=await route.fetch();await route.fulfill({response,body:frameLimitedSource(await response.text())});
   });
   // Functional checks exercise the real grass shader without rasterizing
   // hundreds of thousands of decorative blades on a software GPU.
   await context.route('**/js/home-grass.js*',async route=>{
    const response=await route.fetch();const source=(await response.text()).replace(
     "const subdivisions=density??(matchMedia('(pointer:coarse)').matches?300:420)",
     'const subdivisions=Math.min(density??48,48)');
    await route.fulfill({response,body:source});
   });
   return context;
  };
  try{await use(browser);}finally{browser.newContext=createContext;}
 },{scope:'worker'}],
});
module.exports={test,expect,frameLimitedSource};
