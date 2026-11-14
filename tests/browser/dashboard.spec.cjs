const {test,expect}=require('./fixtures.cjs');

test('dashboard keeps live readings and execution history without the lab page',async({page})=>{
 const channels={vm:{data:{cpu:{total:42},memory:{total:1024,used_percent:61},uptime_seconds:3600}}};
 const boards={cron:{upcoming:[{when:'2026-11-14T12:00:00Z',name:'Agenda de teste',status:'AGENDADO',kind:'cron'}],rows:[{when:'2026-11-13T12:00:00Z',name:'Execução de teste',status:'REGISTRADO',kind:'cron',source:'fixture'}]}};
 await page.route('**/api/lab/stream',route=>route.fulfill({contentType:'text/event-stream',body:`event: telemetry\ndata: ${JSON.stringify({state:{now:'2026-11-13T12:00:00Z'},channels,boards})}\n\n`}));
 await page.goto('/dashboard');
 await page.getByRole('tab',{name:'VM',exact:true}).click();
 await expect(page.locator('#panel-vm [data-live-sector] .stat-grid')).toContainText('42%');
 await expect(page.locator('#panel-vm [data-live-sector] .stat-grid')).toContainText('61%');
 await page.getByRole('tab',{name:'Cron',exact:true}).click();
 await expect(page.locator('#panel-cron [data-live-history]')).toContainText('Execução de teste');
 await page.locator('#panel-cron [data-live-history] summary').last().click();
 await expect(page.locator('#panel-cron details[open]')).toContainText('fixture');
});
