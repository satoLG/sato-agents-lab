export const WALK_SPEED=1.65;
export const RUN_SPEED=4.4;
export function stickVector(x,y,radius=1){
  const length=Math.hypot(x,y)/radius;if(length<=.14)return {x:0,y:0};
  const strength=Math.min(1,(length-.14)/.86),angle=Math.atan2(y,x);
  return {x:Math.cos(angle)*strength,y:Math.sin(angle)*strength};
}
export function movementIntent(keys,stick,azimuth,running=false){
  let x=stick.x,y=stick.y;
  if(keys.has('a')||keys.has('arrowleft'))x--;if(keys.has('d')||keys.has('arrowright'))x++;
  if(keys.has('w')||keys.has('arrowup'))y--;if(keys.has('s')||keys.has('arrowdown'))y++;
  const length=Math.hypot(x,y),strength=Math.min(1,length);if(length>1){x/=length;y/=length;}
  return {x:x*Math.cos(azimuth)+y*Math.sin(azimuth),z:y*Math.cos(azimuth)-x*Math.sin(azimuth),strength,running:running||keys.has('shift')};
}
export function createLabControls(container,{enabled,onJump,onAttack,onInteract,onMove,onAim}){
  const keys=new Set(),move={x:0,y:0},aim={x:0,y:0};let runToggle=false;
  const ui=document.createElement('div');ui.className='player-controls';ui.hidden=true;
  ui.innerHTML=`<div class="control-help glass">WASD mover · Shift correr · mouse mirar · clique socar · Espaço pular<br>Botão direito: destino / arraste: câmera · E conversar</div><div class="touch-stick move-stick" role="group" aria-label="Analógico de movimento"><span>MOVER</span><i></i></div><div class="touch-stick aim-stick" role="group" aria-label="Analógico de mira"><span>MIRAR</span><i></i></div><div class="player-actions"><button class="glass" type="button" data-action="run" aria-pressed="false">Correr</button><button class="glass" type="button" data-action="jump">Pular</button><button class="glass" type="button" data-action="attack">Soco</button></div>`;
  container.parentElement.append(ui);
  const runButton=ui.querySelector('[data-action="run"]');
  function reset(){keys.clear();move.x=move.y=aim.x=aim.y=0;runToggle=false;runButton.setAttribute('aria-pressed','false');for(const el of ui.querySelectorAll('.touch-stick')){if(el._pointer!==null&&el.hasPointerCapture(el._pointer))el.releasePointerCapture(el._pointer);el._pointer=null;el.lastElementChild.style.transform='translate(-50%,-50%)';}}
  function bindStick(el,value){
    el._pointer=null;
    const update=e=>{const r=el.getBoundingClientRect(),radius=r.width*.35;Object.assign(value,stickVector(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2,radius));el.lastElementChild.style.transform=`translate(calc(-50% + ${value.x*radius}px),calc(-50% + ${value.y*radius}px))`;if(value===move)onMove();else onAim?.();};
    el.addEventListener('pointerdown',e=>{if(!enabled()||el._pointer!==null)return;e.preventDefault();e.stopPropagation();el._pointer=e.pointerId;el.setPointerCapture(e.pointerId);update(e);});
    el.addEventListener('pointermove',e=>{if(el._pointer===e.pointerId){e.preventDefault();update(e);}});
    const release=e=>{if(el._pointer!==e.pointerId)return;el._pointer=null;value.x=value.y=0;el.lastElementChild.style.transform='translate(-50%,-50%)';};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,release);
  }
  bindStick(ui.querySelector('.move-stick'),move);bindStick(ui.querySelector('.aim-stick'),aim);
  ui.addEventListener('pointerdown',e=>e.stopPropagation());
  ui.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!enabled()||!action)return;e.stopPropagation();if(action==='jump')onJump();if(action==='attack')onAttack();if(action==='run'){runToggle=!runToggle;runButton.setAttribute('aria-pressed',String(runToggle));}container.focus({preventScroll:true});});
  container.addEventListener('keydown',e=>{
    if(!enabled())return;const key=e.key.toLowerCase();
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key)){e.preventDefault();keys.add(key);if(key!=='shift')onMove();}
    if(key===' '){e.preventDefault();if(!e.repeat)onJump();}
    if(key==='f'){e.preventDefault();if(!e.repeat)onAttack();}
    if(key==='e'){e.preventDefault();if(!e.repeat)onInteract();}
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',reset);
  container.addEventListener('blur',()=>keys.clear());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  return {reset,aim,read:azimuth=>movementIntent(keys,move,azimuth,runToggle),setEnabled(value){if(!value&&!ui.hidden)reset();ui.hidden=!value;}};
}
