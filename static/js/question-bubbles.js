// Independent balloons travel from/to the question mark, including rapid toggles.
export function createQuestionBubbles(root,toggle){
 const buttons=[...root.querySelectorAll('button')],reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let open=false,revision=0,animations=[];
 function position(){
  root.style.setProperty('--question-shift','0px');root.style.setProperty('--question-y','0px');
  const rect=root.getBoundingClientRect(),viewport=window.visualViewport,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight,top=viewport?.offsetTop||0;
  root.style.setProperty('--question-shift',`${Math.max(12-rect.left,Math.min(0,width-12-rect.right))}px`);
  root.style.setProperty('--question-y',`${Math.max(top+12-rect.top,Math.min(0,top+height-12-rect.bottom))}px`);
 }
 function set(value){
  value=!!value;if(value===open)return;open=value;const current=++revision;
  const visible=!root.hidden,from=buttons.map(button=>{const style=getComputedStyle(button);return {translate:style.translate,scale:style.scale,opacity:style.opacity};});
  animations.forEach(animation=>animation.cancel());animations=[];
  toggle.setAttribute('aria-expanded',String(open));root.inert=!open;root.dataset.state=open?'opening':'closing';
  if(!open&&root.contains(document.activeElement))toggle.focus({preventScroll:true});
  if(reduced.matches){root.hidden=!open;if(open)position();root.dataset.state=open?'open':'closed';return;}
  root.hidden=false;position();const origin=toggle.getBoundingClientRect();
  for(const [index,button]of buttons.entries()){
   const rect=button.getBoundingClientRect(),collapsed={translate:`${origin.x+origin.width/2-rect.x-rect.width/2}px ${origin.y+origin.height/2-rect.y-rect.height/2}px`,scale:.1,opacity:0},expanded={translate:'0px 0px',scale:1,opacity:1};
   const initial=visible?from[index]:collapsed;
   const animation=button.animate([initial,open?expanded:collapsed],{duration:open?340:240,delay:(open?index:buttons.length-1-index)*45,easing:open?'cubic-bezier(.18,.84,.25,1.15)':'cubic-bezier(.4,0,.8,.3)',fill:'both'});
   animations.push(animation);
  }
  Promise.allSettled(animations.map(animation=>animation.finished)).then(()=>{if(revision!==current)return;root.hidden=!open;root.dataset.state=open?'open':'closed';});
 }
 return {set,position,get open(){return open;},dispose(){revision++;animations.forEach(animation=>animation.cancel());}};
}
