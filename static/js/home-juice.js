// Home-page "juice": bouncy pop-ins, light shrink pop-outs with particles, and
// crunchy UI sounds. Elements keep using `el.hidden`; watched elements get an
// instance accessor so the logical state flips at once while the visual exit
// can play out. Reduced motion skips every animation and particle.
export function createHomeJuice(root,audio){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),still=()=>reduced.matches;
 const states=new WeakMap(),lastPop=new WeakMap(),batch=new Map();
 let intro=true,flushQueued=false,disposed=false;
 root.dataset.juiceIntro='pending';
 const introFallback=setTimeout(()=>reveal(),20000);

 // ---- particles -----------------------------------------------------------
 const canvas=document.createElement('canvas');canvas.className='juice-particles';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
 const ctx=canvas.getContext('2d');let particles=[],frame=0,last=0,dpr=1;
 function resize(){dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);}
 resize();addEventListener('resize',resize);
 function palette(){const style=getComputedStyle(root);return [style.getPropertyValue('--accent').trim()||'#b1e9fb','#ffffff',style.getPropertyValue('--muted').trim()||'#bbd0db'];}
 function burst(rect,{count}={}){
  if(still()||disposed||!rect?.width||!rect?.height)return;
  const colors=palette(),area=rect.width*rect.height,large=area>140000,cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
  const total=count??Math.round(Math.min(28,Math.max(10,Math.sqrt(area)/6)));
  for(let i=0;i<total;i++){
   let x,y;
   if(large){const t=Math.random()*2*(rect.width+rect.height);if(t<rect.width){x=rect.left+t;y=rect.top;}else if(t<rect.width*2){x=rect.left+t-rect.width;y=rect.bottom;}else if(t<rect.width*2+rect.height){x=rect.left;y=rect.top+t-rect.width*2;}else{x=rect.right;y=rect.top+t-rect.width*2-rect.height;}}
   else{x=rect.left+rect.width*(.15+Math.random()*.7);y=rect.top+rect.height*(.15+Math.random()*.7);}
   const angle=Math.atan2(y-cy||-1,x-cx)+(Math.random()-.5)*1.1,speed=110+Math.random()*230;
   particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-120,age:0,ttl:.45+Math.random()*.4,size:2+Math.random()*3.6,rot:Math.random()*6.3,spin:(Math.random()-.5)*14,shape:i%3,color:colors[i%colors.length]});
  }
  if(particles.length>260)particles.splice(0,particles.length-260);
  if(!frame){last=performance.now();frame=requestAnimationFrame(tick);}
 }
 function tick(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
  particles=particles.filter(p=>(p.age+=dt)<p.ttl);
  for(const p of particles){
   const drag=Math.pow(.08,dt);p.vx*=drag;p.vy=p.vy*drag+620*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=p.spin*dt;
   const life=p.age/p.ttl,size=p.size*(1-life*.55);ctx.globalAlpha=1-life*life;ctx.fillStyle=p.color;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.beginPath();
   if(p.shape===0)ctx.arc(0,0,size,0,Math.PI*2);
   else if(p.shape===1)ctx.roundRect?ctx.roundRect(-size,-size,size*2,size*2,size*.45):ctx.rect(-size,-size,size*2,size*2);
   else{for(let k=0;k<8;k++){const r=k%2?size*.45:size*1.5,a=k*Math.PI/4;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();}
   ctx.fill();ctx.restore();
  }
  ctx.globalAlpha=1;frame=particles.length&&!disposed?requestAnimationFrame(tick):0;if(!frame)ctx.clearRect(0,0,canvas.width,canvas.height);
 }

 // ---- motion ---------------------------------------------------------------
 const visible=el=>el.isConnected&&(el.checkVisibility?el.checkVisibility({checkVisibilityCSS:true}):el.getClientRects().length>0);
 const isBig=rect=>rect.width*rect.height>120000;
 function sound(kind,options){if(kind)audio.ui?.(kind,options);}
 function pop(el,{sound:kind,pitch=1,delay=0,fade=true}={}){
  if(!el||disposed)return false;const now=performance.now();if(now-(lastPop.get(el)||-1e9)<90||!visible(el))return false;lastPop.set(el,now);
  sound(kind,{pitch,delay});if(still())return true;
  const big=isBig(el.getBoundingClientRect()),scales=big?[.94,1.025,.995,1,1]:[.5,1.13,.94,1.03,1];
  el.animate(scales.map((value,index)=>({transform:`scale(${value})`,offset:[0,.42,.66,.84,1][index]})),{duration:big?380:520,delay,easing:'cubic-bezier(.25,.8,.35,1)',composite:'add',fill:'backwards'});
  if(fade)el.animate([{opacity:0},{opacity:1,offset:.32},{opacity:1}],{duration:big?380:520,delay,fill:'backwards'});
  return true;
 }
 function press(el){if(still()||!el)return;el.getAnimations().forEach(animation=>{if(animation.id==='juice-press')animation.cancel();});const animation=el.animate([{transform:'scale(1)'},{transform:'scale(.86)'}],{duration:90,easing:'ease-out',composite:'add',fill:'forwards'});animation.id='juice-press';}
 function release(el){if(!el)return;el.getAnimations().forEach(animation=>{if(animation.id==='juice-press')animation.cancel();});if(still())return;el.animate([{transform:'scale(.86)'},{transform:'scale(1.09)',offset:.45},{transform:'scale(.97)',offset:.75},{transform:'scale(1)'}],{duration:340,easing:'ease-out',composite:'add'});}
 // Light shrink: a small anticipation swell, then a quick ease-in collapse.
 function shrink(el,rect,{target=el,burstAt='middle',burstRect=rect}={}){
  const big=isBig(rect),end=big?.95:.76,duration=big?240:210;
  const animations=[target.animate([{transform:'scale(1)'},{transform:'scale(1.045)',offset:.28},{transform:`scale(${end})`}],{duration,easing:'cubic-bezier(.5,0,.8,.3)',composite:'add',fill:'forwards'}),el.animate([{opacity:1},{opacity:1,offset:.28},{opacity:0}],{duration,easing:'ease-in',fill:'forwards'})];
  if(burstAt==='middle')setTimeout(()=>burst(burstRect),duration*.55);
  return animations;
 }

 // ---- hidden accessor ------------------------------------------------------
 function watch(el,options={}){
  if(!(el instanceof HTMLElement)||states.has(el))return el;
  const state={logical:el.hasAttribute('hidden'),exit:null,options};states.set(el,state);
  Object.defineProperty(el,'hidden',{configurable:true,enumerable:true,get(){return state.logical;},set(value){value=!!value;if(value===state.logical)return;change(el,state,value);}});
  return el;
 }
 const exiting=new Map();
 function stopExit(el,state){if(!state.exit)return;const animations=state.exit;state.exit=null;exiting.delete(el);delete el.dataset.juiceOut;animations.forEach(animation=>animation.cancel());}
 function startExit(el,state,rect){
  el.dataset.juiceOut='';const {shrink:selector,burst:burstSelector}=state.options,target=selector&&el.querySelector(selector)||el,burstNode=burstSelector&&el.querySelector(burstSelector);
  const animations=shrink(el,rect,{target,burstRect:burstNode?burstNode.getBoundingClientRect():rect});state.exit=animations;
  const done=Promise.all(animations.map(animation=>animation.finished)).then(()=>{if(state.exit!==animations)return;state.exit=null;exiting.delete(el);delete el.dataset.juiceOut;if(state.logical)el.setAttribute('hidden','');animations.forEach(animation=>animation.cancel());},()=>{});
  exiting.set(el,done);
 }
 function change(el,state,hide){
  // A child hidden in the same task its container appears never painted: no exit.
  const revealed=[...batch].some(([other,record])=>other!==el&&!record.shown&&other.contains(el));
  if(!batch.has(el)){const shown=!state.deferred&&!revealed&&!el.hasAttribute('hidden')&&visible(el)&&!el.parentElement?.closest('[data-juice-out]');batch.set(el,{shown,rect:shown?el.getBoundingClientRect():null});}
  const before=batch.get(el);state.logical=hide;
  if(!hide){
   if(state.exit)stopExit(el,state);
   else if(!state.deferred)el.removeAttribute('hidden');
  }else{
   state.deferred=false;
   if(!state.exit){if(before.shown&&!still())startExit(el,state,before.rect);else el.setAttribute('hidden','');}
  }
  if(!flushQueued){flushQueued=true;queueMicrotask(flush);}
 }
 // Swaps run in sequence: whatever leaves the same spot finishes its exit
 // before the newcomer pops in, so the two never overlap.
 function enter(el,state){
  if(pop(el,{sound:intro?'pop':state.options.sound,fade:state.options.fade??true}))stagger(el,state.options.stagger);
 }
 function flush(){
  flushQueued=false;const entries=[...batch];batch.clear();
  for(const [el,before] of entries){
   const state=states.get(el),shown=!state.logical;
   if(!before.shown&&shown){
    const blockers=[...exiting].filter(([other])=>other!==el&&!other.contains(el)&&other.parentElement?.contains(el)).map(([,done])=>done);
    if(!blockers.length||still()){enter(el,state);continue;}
    const focused=el.contains(document.activeElement)?document.activeElement:null;
    state.deferred=true;el.setAttribute('hidden','');
    Promise.all(blockers).then(()=>{if(!state.deferred||state.logical)return;state.deferred=false;el.removeAttribute('hidden');enter(el,state);if(focused&&el.contains(focused)&&document.activeElement===document.body)focused.focus({preventScroll:true});});
   }
   else if(before.shown&&!shown&&intro)sound('out');
  }
 }
 // Text in place (titles): the old words shrink away, then the new ones pop in.
 const swaps=new WeakMap();
 function text(el,value,onChange){
  const current=swaps.get(el)?.value??el.textContent;if(current===value)return;
  swaps.get(el)?.animation?.cancel();
  const apply=()=>{swaps.delete(el);el.textContent=value;onChange?.(value);};
  if(still()||!visible(el)){apply();return;}
  const options={duration:150,easing:'ease-in',fill:'forwards'},fade=el.animate([{opacity:1},{opacity:0}],options),animation=el.animate([{transform:'scale(1)'},{transform:'scale(.82)'}],{...options,composite:'add'}),entry={value,animation:{cancel(){fade.cancel();animation.cancel();}}};swaps.set(el,entry);
  animation.finished.then(()=>{if(swaps.get(el)!==entry)return;apply();entry.animation.cancel();lastPop.delete(el);pop(el,{fade:true});},()=>{});
 }
 function settled(){return Promise.all([...exiting.values()]);}
 function inView(el){const rect=el.getBoundingClientRect();return rect.bottom>0&&rect.top<innerHeight&&rect.width>0;}
 function stagger(container,selector,{sounds=true}={}){
  if(!selector)return;
  const items=[...container.querySelectorAll(selector)].filter(el=>visible(el)&&inView(el)).slice(0,10);
  items.forEach((el,index)=>pop(el,{sound:sounds&&index<6?'pop':null,pitch:1+index*.07,delay:70+index*48}));
 }

 // Lists: animate only items whose key is new while the list is on screen.
 function list(container,{selector,key,sound='message'}){
  const seen=new Set([...container.children].filter(node=>node.matches?.(selector)).map(key));
  const observer=new MutationObserver(records=>{
   const added=[];for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&node.matches(selector)){const id=key(node);if(!seen.has(id)){seen.add(id);added.push(node);}}
   if(!added.length||!visible(container))return;const shown=added.filter(node=>inView(node));
   if(shown.length===1)pop(shown[0],{sound:intro?'pop':sound});
   else shown.slice(-10).forEach((node,index)=>pop(node,{sound:index<6?'pop':null,pitch:1+index*.07,delay:index*48}));
  });
  observer.observe(container,{childList:true});return observer;
 }

 // Dialogs pop open and shrink closed; particles land once the top layer is gone.
 function dialog(el){
  const nativeOpen=HTMLDialogElement.prototype.showModal,nativeClose=HTMLDialogElement.prototype.close;let closing=null;
  el.showModal=function(){if(closing){stopClosing();return;}nativeOpen.call(this);pop(this,{fade:false});if(!still())try{this.animate([{opacity:0},{opacity:1}],{duration:220,pseudoElement:'::backdrop'});}catch{}};
  function stopClosing(){const animations=closing;closing=null;delete el.dataset.juiceOut;animations?.forEach(animation=>animation.cancel());}
  el.close=function(value){
   if(!this.open||closing)return;if(still()){nativeClose.call(this,value);return;}
   const rect=this.getBoundingClientRect();this.dataset.juiceOut='';const animations=shrink(this,rect,{burstAt:'end'});closing=animations;
   try{animations.push(this.animate([{opacity:1},{opacity:0}],{duration:200,pseudoElement:'::backdrop',fill:'forwards'}));}catch{}
   Promise.all(animations.map(animation=>animation.finished)).then(()=>{if(closing!==animations)return;closing=null;delete this.dataset.juiceOut;nativeClose.call(this,value);animations.forEach(animation=>animation.cancel());burst(rect);},()=>{});
  };
  el.addEventListener('cancel',event=>{event.preventDefault();el.close();});
 }

 // ---- input feedback -------------------------------------------------------
 const pressable='button,a[href],.scene-option,.theme-option';
 const pressTarget=el=>el.querySelector(':scope>.scene-preview,:scope>.theme-swatch')||el;
 let pressed=null,lastPointer=0;
 function pointerDown(event){
  const el=event.target.closest?.(pressable);if(!el||!root.contains(el)||el.id==='robot-touch'||el.disabled||event.button>0)return;
  pressed=pressTarget(el);lastPointer=performance.now();press(pressed);sound(el.matches('.scene-option,.theme-option')?'toggle':'click');
 }
 function pointerUp(){if(pressed){release(pressed);pressed=null;}}
 function click(event){
  if(event.detail!==0)return;const el=event.target.closest?.('button,a[href]');if(!el||!root.contains(el)||el.id==='robot-touch')return;
  sound('click');release(el);
 }
 function radioChange(event){if(event.target.type==='radio'&&performance.now()-lastPointer>350){sound('toggle');const option=event.target.closest('.scene-option,.theme-option');if(option)release(pressTarget(option));}}
 const typingKeys=new Set(['Backspace','Delete','Enter',' ']);
 function keydown(event){
  if(!event.target.matches?.('#home-input,#home-password')||event.isComposing||event.ctrlKey||event.metaKey)return;
  if(event.key.length===1||typingKeys.has(event.key))sound('key',{pitch:event.key==='Backspace'||event.key==='Delete'?.82:event.key==='Enter'?.7:event.key===' '?.9:1});
 }
 root.addEventListener('pointerdown',pointerDown);addEventListener('pointerup',pointerUp);addEventListener('pointercancel',pointerUp);
 root.addEventListener('click',click);root.addEventListener('change',radioChange);root.addEventListener('keydown',keydown);

 // ---- intro ----------------------------------------------------------------
 function reveal(){
  clearTimeout(introFallback);if(root.dataset.juiceIntro!=='pending')return;delete root.dataset.juiceIntro;
  [...root.querySelectorAll('.home-header>*')].forEach((el,index)=>pop(el,{sound:'pop',pitch:1+index*.12,delay:index*80}));
 }

 return {watch,pop,burst,list,dialog,stagger,reveal,text,settled,
  endIntro(){setTimeout(()=>{intro=false;},1500);},
  get intro(){return intro;},
  dispose(){disposed=true;clearTimeout(introFallback);cancelAnimationFrame(frame);frame=0;particles=[];canvas.remove();removeEventListener('resize',resize);removeEventListener('pointerup',pointerUp);removeEventListener('pointercancel',pointerUp);}};
}
