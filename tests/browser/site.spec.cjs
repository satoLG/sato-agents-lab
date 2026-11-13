const {test,expect}=require('./fixtures.cjs');

for(const width of [1440,393])test(`home and dashboard identity at ${width}px`,async({page,request},info)=>{
 await page.setViewportSize({width,height:852});
 await page.route('**/api/lab/hermes-chat/session',route=>route.fulfill({json:{available:false,authenticated:false}}));
 for(const url of ['/','/dashboard']){
  await page.goto(url);await page.evaluate(()=>document.fonts.ready);
  const brand=page.locator('a.brand,a.site-brand');
  await expect(brand.locator('img')).toHaveAttribute('src',/sato-logo\.png$/);
  const style=await brand.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,radius:parseFloat(s.borderRadius),blur:s.backdropFilter||s.webkitBackdropFilter,font:s.fontFamily,width:el.getBoundingClientRect().width};});
  expect(style.radius).toBeGreaterThan(10);expect(style.blur).toContain('blur(');
  expect(style.background).toMatch(/^rgba\(/);expect(style.width).toBeGreaterThanOrEqual(44);expect(style.font).toContain('Nunito');
  await expect(page.locator('a[href="/lab"],a[href="/orb"],a[href="/models"]')).toHaveCount(0);
  if(url==='/'){
   await expect(page.locator('a[href="/dashboard"]')).toHaveCount(0);
   expect(await page.locator('noscript').textContent()).not.toContain('/dashboard');
   await expect(page.locator('body')).toHaveAttribute('data-ready','true',{timeout:45000});
  }else await expect(page.locator('.site-nav a[href="/"]')).toBeVisible();
  await page.screenshot({path:info.outputPath(url==='/'?'home.png':'dashboard.png')});
 }
 for(const url of ['/lab','/orb','/models'])expect((await request.get(url)).status()).toBe(404);
});
