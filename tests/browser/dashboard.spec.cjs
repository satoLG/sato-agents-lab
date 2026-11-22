const {test,expect}=require('./fixtures.cjs');

test('dashboard keeps live readings and execution history without the lab page',async({page})=>{
 const channels={vm:{data:{cpu:{total:42},memory:{total:1024,used_percent:61},uptime_seconds:3600}}};
 const boards={cron:{upcoming:[{when:'2026-11-14T12:00:00Z',name:'Agenda de teste',status:'AGENDADO',kind:'cron'}],rows:[{when:'2026-11-13T12:00:00Z',name:'Execução de teste',status:'REGISTRADO',kind:'cron',source:'fixture'}]}};
 await page.route('**/api/lab/stream',route=>route.fulfill({contentType:'text/event-stream',body:`event: telemetry\ndata: ${JSON.stringify({state:{now:'2026-11-13T12:00:00Z'},channels,boards})}\n\n`}));
 await page.goto('/dashboard');
 await page.getByRole('tab',{name:'Sistema',exact:true}).click();
 await expect(page.locator('#panel-sistema [data-live-sector] .stat-grid')).toContainText('42%');
 await expect(page.locator('#panel-sistema [data-live-sector] .stat-grid')).toContainText('61%');
 await page.getByRole('tab',{name:'Cron',exact:true}).click();
 await expect(page.locator('#panel-cron [data-live-history]')).toContainText('Execução de teste');
 await page.locator('#panel-cron [data-live-history] summary').last().click();
 await expect(page.locator('#panel-cron details[open]')).toContainText('fixture');
});

test('Sistema abre primeiro e atualiza CPU/memoria via SSE sem re-renderizar',async({page})=>{
 await page.addInitScript(()=>{
  const Native=window.EventSource;window.__eventSources=0;
  window.EventSource=class extends Native{constructor(...args){super(...args);window.__eventSources+=1;}};
 });
 const vm=(usage,mem)=>({cpu:{total:usage,count:2,cores:[{core:'0',usage},{core:'1',usage:5}]},
  memory:{total:8*2**30,available:4*2**30,used:4*2**30,used_percent:mem,swap_total:2**30,swap_used:2**29,swap_percent:50,cached:0,buffers:0,free:0},
  load:{'1min':0.5,per_core:25},uptime_seconds:3600,hostname:'fixture-host'});
 await page.route('**/api/vmstats',route=>route.fulfill({json:{...vm(3,20),
  filesystems:[{mount:'/',fstype:'ext4',total:100,used:40,free:60,used_percent:40}],
  top_processes:[{command:'proc-fixture',pid:'1',cpu:1,mem:2}],timestamp:'2026-11-13T12:00:00Z'}}));
 let streams=0,releaseNext;
 // The reconnection that carries the second reading waits until the first one
 // has been checked, so a fast reconnect cannot overtake that assertion.
 const nextReading=new Promise(resolve=>{releaseNext=resolve;});
 await page.route('**/api/lab/stream',async route=>{
  streams+=1;if(streams>1)await nextReading;
  const sample=streams===1?vm(10,30):vm(77,61);
  const now=streams===1?'2026-11-13T12:00:02Z':'2026-11-13T12:00:04Z';
  // a resposta termina e o mesmo EventSource reconecta (retry curto): simula leituras sucessivas
  route.fulfill({contentType:'text/event-stream',body:`retry: 300\nevent: telemetry\ndata: ${JSON.stringify({state:{now},channels:{vm:{data:sample}}})}\n\n`});
 });
 await page.goto('/dashboard');
 const tabs=page.getByRole('tab');
 await expect(tabs.first()).toHaveText('Sistema');
 await expect(tabs.first()).toHaveAttribute('aria-selected','true');
 const panel=page.locator('#panel-sistema');
 await expect(panel).toBeVisible();
 const core0=panel.locator('[data-role=sistema] .bar-row').first();
 await expect(core0).toContainText('10.0%');
 await expect(panel.getByText('proc-fixture')).toBeVisible();
 await panel.locator('[data-role=sistema] .bar-fill').first().evaluate(el=>{window.__fill=el;});
 releaseNext();
 await expect(core0).toContainText('77.0%');
 await expect(panel.locator('[data-role=sistema] .meter-row').first()).toContainText('4.0 GB / 8.0 GB');
 await expect(panel.locator('[data-role=sistema] .stat').nth(1)).toContainText('61.0%');
 await expect(panel.locator('[data-role=sistema-status]')).toHaveText(/^ultima leitura .* · (ao vivo|reconectando…) · discos e processos a cada 60s$/);
 const same=await panel.locator('[data-role=sistema] .bar-fill').first().evaluate(el=>el===window.__fill&&el.isConnected);
 expect(same).toBe(true);
 await expect(panel.locator('[data-role=sistema] .skeleton')).toHaveCount(0);
 expect(await panel.locator('[data-role=sistema] .bar-fill').first().evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
 expect(await page.evaluate(()=>window.__eventSources)).toBe(1);
 // links antigos continuam abrindo as abas certas
 await page.goto('/dashboard#atividade');
 await expect(page.getByRole('tab',{name:'Atividade',exact:true})).toHaveAttribute('aria-selected','true');
 await page.goto('/dashboard#vm');
 await expect(page.getByRole('tab',{name:'Sistema',exact:true})).toHaveAttribute('aria-selected','true');
});
