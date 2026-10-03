import test from 'node:test';
import assert from 'node:assert/strict';
import {indicatorCards,MONITOR_LAYOUT} from '../static/js/lab-monitors.js';
test('station indicators use dashboard readings and preserve missing versus zero',()=>{
 const channels={stats:{data:{total_calls:0,total_cost:0,fallback_rate:0,month:'2026-10',daily:[{calls:2},{calls:4}]}},events:{data:{jobs:[{}],failed_runs:0,webhooks:{available:true,routes:[{},{}]}}}};
 const model=indicatorCards('models',channels);assert.equal(model[0].value,0);assert.deepEqual(model[0].series,[2,4]);assert.equal(model.length,3);
 const events=indicatorCards('cron',channels);assert.equal(events[0].value,1);assert.equal(events[1].value,2);channels.events.data.webhooks.available=false;assert.equal(indicatorCards('cron',channels).some(c=>c.title==='WEBHOOKS'),false);
 channels.stats.error='offline';assert.deepEqual(indicatorCards('models',channels),[]);
});
test('no unavailable or unrelated indicators fill empty screens',()=>{
 assert.deepEqual(indicatorCards('rag',{}),[]);
 const channels={stats:{data:{total_calls:4,total_cost:0,fallback_rate:null}},vm:{data:{cpu:{total:0},memory:{total:0,used_percent:0}}}};
 assert.equal(indicatorCards('models',channels).some(c=>c.title==='FALLBACK'),false);
 assert.equal(indicatorCards('rag',channels).length,0);
 assert.equal(indicatorCards('vm',channels).some(c=>c.title==='RAM'),false);
 assert.equal(MONITOR_LAYOUT.columns*MONITOR_LAYOUT.rows,6);assert.ok(MONITOR_LAYOUT.width>=2.5);
});
