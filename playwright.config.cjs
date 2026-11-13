const {defineConfig} = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', timeout: 90000, workers: 1,
  expect:{timeout:10000},
  forbidOnly:!!process.env.CI,
  reporter:process.env.CI?'list':'line',
  use: {baseURL: process.env.SITE_TEST_URL || 'http://127.0.0.1:8080', viewport: {width: 1440, height: 1100}, reducedMotion:'reduce',trace:{mode:'retain-on-failure',screenshots:false},screenshot:'only-on-failure',launchOptions:{args:process.env.LAB_BROWSER_ANGLE?[`--use-angle=${process.env.LAB_BROWSER_ANGLE}`]:[]}},
  projects:[
    {name:'ui',testMatch:['home.spec.cjs','site.spec.cjs','dashboard.spec.cjs'],grepInvert:/@scene/},
    {name:'scenes',testMatch:['home.spec.cjs','home-exploration.spec.cjs','scenic-nature.spec.cjs'],grep:/@scene/,timeout:120000},
  ],
});
