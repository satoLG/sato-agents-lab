import {COMBAT_CONTROLS,COMBAT_COLORS} from './orb-combat-settings.js';
export function createCombatDebug(settings,{preview=()=>false,fire=()=>{},stop=()=>{}}={}){
 const panel=document.createElement('details'),storage='sato-orb-combat-v1';panel.id='orb-combat-debug';panel.className='orb-debug';
 panel.innerHTML='<summary>Ataque · VFX</summary><div class="water-debug-content"><header><strong>Charged blast</strong><span>Segure F para carregar; solte para disparar. Ajustes salvos neste navegador.</span></header><div class="combat-fields"></div><div class="water-debug-actions"><button type="button" data-reset>Restaurar</button><button type="button" data-copy>Copiar valores</button></div><p role="status" class="water-debug-status"></p><textarea aria-label="Valores VFX para copiar" readonly hidden></textarea></div>';
 try{settings.apply(JSON.parse(localStorage.getItem(storage)));}catch{}
 const fields=new Map(),sections=new Map(),status=panel.querySelector('[role=status]');
 const previews=document.createElement('div');previews.className='water-debug-actions';previews.innerHTML='<button type="button" data-preview>Prévia da carga</button><button type="button" data-fire>Disparar</button><button type="button" data-stop>Parar</button>';panel.querySelector('header').after(previews);
 previews.querySelector('[data-preview]').addEventListener('click',()=>{status.textContent=preview()?'Carga mantida: ajuste os controles e dispare quando quiser.':'Acorde Sato e aguarde ele estar no chão, livre para atacar.';});
 previews.querySelector('[data-fire]').addEventListener('click',fire);previews.querySelector('[data-stop]').addEventListener('click',stop);
 function section(name){if(!sections.has(name)){const el=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=name;el.append(legend);panel.querySelector('.combat-fields').append(el);sections.set(name,el);}return sections.get(name);}
 function save(){try{localStorage.setItem(storage,settings.export());status.textContent='Ajuste salvo.';}catch{status.textContent='Use Copiar valores para guardar.';}}
 function sync(){for(const [key,inputs] of fields)for(const input of inputs)input.value=settings.values[key];}
 for(const [key,label,min,max,step,,group] of COMBAT_CONTROLS){
  const row=document.createElement('label');row.className='water-debug-row';row.innerHTML=`<span>${label}</span><input aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}"><input aria-label="${label}: valor" type="number" min="${min}" max="${max}" step="${step}">`;
  const inputs=[...row.querySelectorAll('input')];fields.set(key,inputs);for(const input of inputs)input.addEventListener('input',()=>{if(input.value!==''&&input.validity.valid){settings.set(key,input.value);sync();save();}});section(group).append(row);
 }
 for(const [key,label] of COMBAT_COLORS){const row=document.createElement('label');row.className='water-debug-row';row.innerHTML=`<span>${label}</span><input type="color" aria-label="${label}">`;const input=row.querySelector('input');fields.set(key,[input]);input.addEventListener('input',()=>{settings.set(key,input.value);save();});section('Cores').append(row);}
 panel.querySelector('[data-reset]').addEventListener('click',()=>{settings.reset();sync();save();});
 panel.querySelector('[data-copy]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(settings.export());status.textContent='Valores copiados.';}catch{const area=panel.querySelector('textarea');area.hidden=false;area.value=settings.export();area.focus();area.select();}});
 panel.addEventListener('toggle',()=>{if(panel.open)document.getElementById('orb-water-debug').open=false;});
 sync();document.getElementById('orb-experience').append(panel);return {dispose(){panel.remove();}};
}
