export const WALK_SPEED=2.7;
export const RUN_SPEED=6.2;
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
  const icon=path=>`<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  ui.innerHTML=`<div class="control-help glass">WASD mover · Shift correr · mova o mouse para mirar · clique socar · Espaço pular<br>Botão direito: destino / arraste: câmera · E interagir</div><div class="touch-zone move-zone" role="group" aria-label="Arraste na área esquerda para andar"><div class="touch-stick move-stick"><span>MOVER</span><i></i></div></div><div class="touch-zone aim-zone" role="group" aria-label="Arraste na área direita para mirar"><div class="touch-stick aim-stick"><span>MIRAR</span><i></i></div></div><div class="player-actions"><button class="glass" type="button" data-action="run" aria-label="Correr" title="Correr" aria-pressed="false">${icon('<circle cx="15" cy="4" r="2"/><path d="m12 8 4 2 3-1M7 10l4-3 3 6-4 3-3 5m7-8 3 4 4 2M3 7h4M2 12h3"/>')}</button><button class="glass" type="button" data-action="jump" aria-label="Pular" title="Pular">${icon('<path d="m8 6 4-4 4 4M12 2v9m-7 6 4-3 3 2 3-2 4 3M9 14l-2 7m8-7 2 7"/><circle cx="12" cy="11" r="2"/>')}</button><button class="glass" type="button" data-action="attack" aria-label="Socar" title="Socar">${icon('<path d="M6 12V6a2 2 0 0 1 4 0v4-6a2 2 0 0 1 4 0v6-4a2 2 0 0 1 4 0v5-2a2 2 0 0 1 4 0v5l-4 7H9l-6-6a2 2 0 0 1 3-3l3 2M9 21h9"/>')}</button></div>`;
  container.parentElement.append(ui);
  const runButton=ui.querySelector('[data-action="run"]');
  function reset(){keys.clear();move.x=move.y=aim.x=aim.y=0;runToggle=false;runButton.setAttribute('aria-pressed','false');for(const el of ui.querySelectorAll('.touch-zone')){const pointer=el._pointer;el._pointer=null;if(pointer!==null&&el.hasPointerCapture(pointer))el.releasePointerCapture(pointer);el.classList.remove('active');el.firstElementChild.lastElementChild.style.transform='translate(-50%,-50%)';}}
  function bindStick(el,value){
    el._pointer=null;const stick=el.firstElementChild;let origin={x:0,y:0};
    const update=e=>{const radius=stick.clientWidth*.35;Object.assign(value,stickVector(e.clientX-origin.x,e.clientY-origin.y,radius));stick.lastElementChild.style.transform=`translate(calc(-50% + ${value.x*radius}px),calc(-50% + ${value.y*radius}px))`;if(value===move)onMove();else onAim?.();};
    el.addEventListener('pointerdown',e=>{if(!enabled()||el._pointer!==null||e.pointerType==='mouse')return;e.preventDefault();e.stopPropagation();el._pointer=e.pointerId;const r=el.getBoundingClientRect(),half=stick.clientWidth/2;origin={x:e.clientX,y:e.clientY};const visualX=Math.max(half,Math.min(r.width-half,e.clientX-r.left)),visualY=Math.max(half,Math.min(r.height-half-16,e.clientY-r.top));stick.style.left=`${visualX}px`;stick.style.top=`${visualY}px`;el.classList.add('active');el.setPointerCapture(e.pointerId);update(e);});
    el.addEventListener('pointermove',e=>{if(el._pointer===e.pointerId){e.preventDefault();update(e);}});
    const release=e=>{if(el._pointer!==e.pointerId)return;el._pointer=null;value.x=value.y=0;el.classList.remove('active');stick.lastElementChild.style.transform='translate(-50%,-50%)';};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,release);
  }
  bindStick(ui.querySelector('.move-zone'),move);bindStick(ui.querySelector('.aim-zone'),aim);
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
