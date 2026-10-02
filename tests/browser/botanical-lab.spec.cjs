const {test,expect}=require('@playwright/test');

test('raised garden remains navigable, robot joints keep clearance and opt-in audio decodes',async({page})=>{
 test.setTimeout(150000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{
  window.decodedSamples=0;window.startedLoops=0;
  const make=AudioContext.prototype.createBufferSource;AudioContext.prototype.createBufferSource=function(){const s=make.call(this),start=s.start;s.start=function(...args){if(s.loop)window.startedLoops++;return start.apply(s,args);};return s;};
  const decode=AudioContext.prototype.decodeAudioData;
  AudioContext.prototype.decodeAudioData=async function(...args){const b=await decode.apply(this,args);window.decodedSamples++;return b;};
 });
 await page.route('**/js/lab-scene.js*',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('renderer.render(world,camera);','window.botanicalQA={world,campus,hall,robots,parcels,obstacles,avatar,stopWalking,groundAt,audio,visitRobot,canInteract,beginChat,emote};renderer.render(world,camera);')});
 });
 await page.goto('/lab');await page.waitForFunction(()=>window.botanicalQA,null,{timeout:90000});await page.locator('#lab-play').click();
 await page.evaluate(()=>{const q=botanicalQA;q.stopWalking();q.avatar.position.set(0,q.groundAt(0,0),0);});
 await expect.poll(()=>page.evaluate(()=>botanicalQA.campus.hallLight),{timeout:30000}).toBeGreaterThan(.99);
 const result=await page.evaluate(async()=>{
  const q=botanicalQA,{poseRig}=await import('/static/js/lab-rigs.js'),{clearSegment,findPath}=await import('/static/js/lab-navigation.js'),{ZONES}=await import('/static/js/lab-layout.js');
  const rig=[...q.robots.values()].find(r=>r.worker.sector==='hermes').rig;
  let blinkCount=0,minHandClearance=Infinity;const modes=new Set();
  for(let t=0;t<18;t+=.04){poseRig(rig,t,.04,{work:t<6?0:1,talk:t>12});if(rig.blinked)blinkCount++;modes.add(rig.root.userData.animation);rig.root.updateMatrixWorld(true);
   for(const arm of rig.arms){const hand=arm.lower.localToWorld(new rig.root.position.constructor(0,-.35,.03));rig.spine.worldToLocal(hand);minHandClearance=Math.min(minHandClearance,Math.abs(hand.x));}
  }
  const phase=rig.gaitPhase;poseRig(rig,20,1,{speed:1});const slow=rig.gaitPhase-phase;poseRig(rig,21,.5,{speed:2});const fast=rig.gaitPhase-phase-slow;
  const paths=q.parcels.couriers.every(c=>c.curve.curves.length>0&&c.curve.curves.every(s=>clearSegment(s.v1,s.v2,q.obstacles,[])));
  const sectors=Object.entries(ZONES).filter(([id])=>id!=='gateway').map(([id,z])=>[id,findPath({x:0,z:24},{x:z.x,z:z.z+(id==='rag'?9:4)},q.obstacles,[]).length]);
  return {blinkCount,minHandClearance,modes:[...modes],slow,fast,paths,sectors,board:q.world.getObjectByName('elevated-activity-board')?.position.y,stream:!!q.world.getObjectByName('laboratory-stream')};
 });
 expect(result.paths).toBe(true);expect(result.sectors.every(([id,n])=>n>0)).toBe(true);expect(result.board).toBe(12);expect(result.stream).toBe(true);
 expect(result.blinkCount).toBeGreaterThan(1);expect(result.minHandClearance).toBeGreaterThan(.58);expect(result.modes).toContain('operate');expect(result.modes).toContain('talk');expect(result.slow).toBeCloseTo(result.fast,6);
 await page.locator('#sound-toggle').click();await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','true',{timeout:30000});
 const audio=await page.evaluate(async()=>{const {AUDIO_FILES}=await import('/static/js/lab-audio.js');return {decoded:window.decodedSamples,expected:AUDIO_FILES.length};});expect(audio.decoded).toBe(audio.expected);
 await expect.poll(()=>page.evaluate(()=>window.startedLoops)).toBeGreaterThan(0);
 // Stand next to a robot: a reply must emit an actual audio cue, not just change the icon.
 const reply=await page.evaluate(async()=>{const q=botanicalQA,id='guide:hermes',r=q.robots.get(id);q.avatar.position.set(r.rig.root.position.x+1,q.groundAt(r.rig.root.position.x+1,r.rig.root.position.z),r.rig.root.position.z);let played=false;const cue=q.audio.cue;q.audio.cue=(kind,...args)=>{const result=cue(kind,...args);if(kind==='robotVoice'&&result)played=true;return result;};q.beginChat(id);played=false;await new Promise(resolve=>setTimeout(resolve,750));q.emote('answer');return played;});expect(reply).toBe(true);
 await page.locator('#sound-toggle').click();await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed','false');expect(errors).toEqual([]);
});
