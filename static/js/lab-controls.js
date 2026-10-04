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
export function createLabControls(container,{enabled,onJump,onAttack,onInteract,onMove,onInputType}){
  const keys=new Set(),move={x:0,y:0};let runToggle=false;
  const ui=document.createElement('div');ui.className='player-controls';ui.hidden=true;
  const icon=name=>`<img src="${new URL(`../icons/game-icons/${name}.svg`,import.meta.url).href}" alt="" draggable="false">`;
  ui.innerHTML=`<div class="control-help glass">WASD mover · Shift correr · clique / F socar · Espaço pular<br>Botão direito: destino / arraste: câmera · E interagir</div><div class="touch-zone move-zone" role="group" aria-label="Arraste na área esquerda para andar"><div class="touch-stick move-stick"><span>MOVER</span><i></i></div></div><div class="player-actions" hidden><button class="glass" type="button" data-action="run" aria-label="Correr" title="Correr" aria-pressed="false">${icon('run')}</button><button class="glass" type="button" data-action="jump" aria-label="Pular" title="Pular">${icon('jump')}</button><button class="glass" type="button" data-action="attack" aria-label="Socar" title="Socar">${icon('punch')}</button></div>`;
  container.parentElement.append(ui);
  const runButton=ui.querySelector('[data-action="run"]'),actions=ui.querySelector('.player-actions'),el=ui.querySelector('.move-zone'),stick=el.firstElementChild;
  let inputType=matchMedia('(pointer:coarse)').matches?'touch':'keyboard',pointer=null,origin={x:0,y:0};
  function setInputType(type){inputType=type;ui.dataset.input=type;onInputType?.(type);if(type!=='touch')resetStick();}
  function resetStick(){const id=pointer;pointer=null;move.x=move.y=0;actions.hidden=true;el.classList.remove('active');stick.lastElementChild.style.transform='translate(-50%,-50%)';if(id!==null&&el.hasPointerCapture(id))el.releasePointerCapture(id);}
  function reset(){keys.clear();resetStick();runToggle=false;runButton.setAttribute('aria-pressed','false');}
  function update(e){const radius=stick.clientWidth*.35;Object.assign(move,stickVector(e.clientX-origin.x,e.clientY-origin.y,radius));stick.lastElementChild.style.transform=`translate(calc(-50% + ${move.x*radius}px),calc(-50% + ${move.y*radius}px))`;actions.hidden=Math.hypot(move.x,move.y)<=.01;onMove();}
  function beginStick(e){if(!enabled()||pointer!==null||e.pointerType==='mouse')return;e.preventDefault();e.stopPropagation();pointer=e.pointerId;const r=el.getBoundingClientRect(),half=stick.clientWidth/2;origin={x:e.clientX,y:e.clientY};stick.style.left=`${Math.max(half,Math.min(r.width-half,e.clientX-r.left))}px`;stick.style.top=`${Math.max(half,Math.min(r.height-half-16,e.clientY-r.top))}px`;el.classList.add('active');el.setPointerCapture(e.pointerId);update(e);}
  el.addEventListener('pointerdown',beginStick);
  el.addEventListener('pointermove',e=>{if(pointer===e.pointerId){e.preventDefault();update(e);}});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,e=>{if(pointer===e.pointerId)resetStick();});
  function performAction(e){const action=e.target.closest('[data-action]')?.dataset.action;if(!enabled()||!action)return; e.preventDefault();e.stopPropagation();if(action==='jump')onJump();if(action==='attack')onAttack();if(action==='run'){runToggle=!runToggle;runButton.setAttribute('aria-pressed',String(runToggle));}container.focus({preventScroll:true});}
  // Touch actions fire on pointerdown, including a second finger while the stick is captured.
  ui.addEventListener('pointerdown',e=>{e.stopPropagation();performAction(e);});
  ui.addEventListener('click',e=>{if(e.detail===0)performAction(e);});
  document.addEventListener('pointerdown',e=>{
    const touch=e.pointerType==='touch'||e.pointerType==='pen';setInputType(touch?'touch':'keyboard');
    // On a hybrid device the first touch may hit the canvas before the zone is shown.
    if(touch&&container.contains(e.target)){const r=el.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)beginStick(e);}
  },{capture:true});
  container.addEventListener('keydown',e=>{
    if(!enabled())return;setInputType('keyboard');const key=e.key.toLowerCase();
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key)){e.preventDefault();keys.add(key);if(key!=='shift')onMove();}
    if(key===' '){e.preventDefault();if(!e.repeat)onJump();}
    if(key==='f'){e.preventDefault();if(!e.repeat)onAttack();}
    if(key==='e'){e.preventDefault();if(!e.repeat)onInteract();}
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',reset);
  container.addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  setInputType(inputType);
  return {reset,read:azimuth=>movementIntent(keys,move,azimuth,runToggle),setEnabled(value){if(!value&&!ui.hidden)reset();ui.hidden=!value;}};
}
