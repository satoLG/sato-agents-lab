import test from 'node:test';
import assert from 'node:assert/strict';
import {indicatorCards} from '../static/js/lab-monitors.js';
test('station indicators use dashboard readings and preserve missing versus zero',()=>{
 const channels={stats:{data:{total_calls:0,total_cost:0,fallback_rate:0,month:'2026-10',daily:[{calls:2},{calls:4}]}},events:{data:{jobs:[{}],failed_runs:0,webhooks:{available:true,routes:[{},{}]}}}};
 const model=indicatorCards('models',channels);assert.equal(model[0].value,0);assert.deepEqual(model[0].series,[2,4]);assert.equal(model[3].value,'—');
 const events=indicatorCards('cron',channels);assert.equal(events[0].value,1);assert.equal(events[1].value,2);channels.events.data.webhooks.available=false;assert.equal(indicatorCards('cron',channels)[1].value,'—');
 channels.stats.error='offline';assert.match(indicatorCards('models',channels)[0].source,/sem conexão/);
});
