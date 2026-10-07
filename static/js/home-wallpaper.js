// Original Popsy drawings, each attached to a damped spring. Adjacent springs
// share collision forces so a growing drawing pushes and releases its neighbors.
export async function createHomeWallpaper(home,layer){
 const response=await fetch(new URL('../images/robot-doodles.svg',import.meta.url));if(!response.ok)return {dispose(){}};
 const source=new DOMParser().parseFromString(await response.text(),'image/svg+xml'),ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('aria-hidden','true');svg.append(document.importNode(source.querySelector('defs'),true));
 const originals=[...source.documentElement.children].filter(el=>el.tagName==='use');layer.append(svg);layer.classList.add('interactive-wallpaper');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let drawings=[],grid=new Map(),frame=0,last=0,hover=null,disposed=false;
 function layout(){
  hover=null;svg.querySelectorAll(':scope > g').forEach(el=>el.remove());drawings=[];grid=new Map();
  const {width,height}=home.getBoundingClientRect(),scale=.9,pitch=27,ox=(width-540)/2,oy=(height-540)/2;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  for(let ty=Math.floor(-oy/540)-1;ty<=Math.ceil((height-oy)/540);ty++)for(let tx=Math.floor(-ox/540)-1;tx<=Math.ceil((width-ox)/540);tx++)for(const original of originals){
   const w=+original.getAttribute('width'),h=+original.getAttribute('height'),cx=+original.getAttribute('x')+w/2,cy=+original.getAttribute('y')+h/2;
   const x=ox+tx*540+cx*scale,y=oy+ty*540+cy*scale;if(x< -40||y< -40||x>width+40||y>height+40)continue;
   const el=document.createElementNS(ns,'g'),glyph=document.createElementNS(ns,'g'),use=document.importNode(original,true);
   use.setAttribute('x',-w/2);use.setAttribute('y',-h/2);use.setAttribute('transform',`rotate(${original.getAttribute('transform').match(/rotate\(([^ ]+)/)[1]})`);
   glyph.setAttribute('transform',`scale(${scale})`);glyph.append(use);el.append(glyph);svg.append(el);
   const column=Math.round((x-ox-pitch/2)/pitch),row=Math.round((y-oy-pitch/2)/pitch),d={el,x,y,dx:0,dy:0,vx:0,vy:0,s:1,vs:0,r:12.5,column,row};
   el.setAttribute('transform',`translate(${x} ${y})`);drawings.push(d);grid.set(`${column},${row}`,d);
  }
 }
 const visible=()=>home.dataset.scenario==='black'&&home.dataset.history!=='true'&&!document.querySelector('dialog[open]')&&!document.hidden;
 function touch(event){
  if(!visible()||event.target.closest('button,a,input,textarea,dialog,#home-chat,#home-speech,#home-history')){hover=null;wake();return;}
  const rect=home.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;let distance=19,nearest=null;
  for(const d of drawings){const length=Math.hypot(x-d.x-d.dx,y-d.y-d.dy);if(length<distance){distance=length;nearest=d;}}hover=nearest;wake();
 }
 const leave=()=>{hover=null;wake();},release=event=>{if(event.pointerType!=='mouse')leave();};
 function wake(){if(!frame&&!disposed){last=performance.now();frame=requestAnimationFrame(update);}}
 function update(stamp){
  frame=0;if(disposed)return;const elapsed=Math.min(.1,(stamp-last)/1000||.016),steps=Math.ceil(elapsed/.016),dt=elapsed/steps;last=stamp;if(!visible())hover=null;let moving=false;
  const scaleTarget=d=>d===hover?(reduced.matches?1.3:1.9):1;
  for(let step=0;step<steps;step++){
  for(const d of drawings){d.vs+=((scaleTarget(d)-d.s)*240-d.vs*(reduced.matches?34:13))*dt;d.s+=d.vs*dt;d.vx+=(-d.dx*85-d.vx*12)*dt;d.vy+=(-d.dy*85-d.vy*12)*dt;}
  for(const d of drawings)for(const [dc,dr] of [[1,0],[0,1],[1,1],[-1,1]]){
   const other=grid.get(`${d.column+dc},${d.row+dr}`);if(!other)continue;
   const x=other.x+other.dx-d.x-d.dx,y=other.y+other.dy-d.y-d.dy,length=Math.max(.1,Math.hypot(x,y)),overlap=d.r*d.s+other.r*other.s+1.4-length;
   if(overlap>0){const force=overlap*170*dt;d.vx-=x/length*force;d.vy-=y/length*force;other.vx+=x/length*force;other.vy+=y/length*force;}
  }
  for(const d of drawings){d.dx+=d.vx*dt;d.dy+=d.vy*dt;}
  }
  for(const d of drawings){
   const energetic=Math.abs(d.vx)+Math.abs(d.vy)+Math.abs(d.vs)+Math.abs(d.s-scaleTarget(d))>.008;
   if(energetic){moving=true;d.el.setAttribute('transform',`translate(${(d.x+d.dx).toFixed(2)} ${(d.y+d.dy).toFixed(2)}) scale(${d.s.toFixed(4)})`);}
   else if(d!==hover){d.dx=d.dy=d.vx=d.vy=d.vs=0;d.s=1;d.el.setAttribute('transform',`translate(${d.x} ${d.y})`);}
  }
  if(moving)frame=requestAnimationFrame(update);
 }
 const observer=new ResizeObserver(()=>{layout();wake();});observer.observe(home);layout();
 const events=[['pointermove',touch],['pointerdown',touch],['pointerleave',leave],['pointerup',release],['pointercancel',leave]];events.forEach(([event,fn])=>home.addEventListener(event,fn));
 return {dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();events.forEach(([event,fn])=>home.removeEventListener(event,fn));svg.remove();}};
}
