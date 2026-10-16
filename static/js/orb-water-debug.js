import {WATER_CONTROLS} from './orb-water-settings.js';

export function createWaterDebug(settings,onChange) {
  const storageKey='sato-orb-water-v1',panel=document.createElement('details');
  panel.id='orb-water-debug';panel.open=innerWidth>760;
  panel.innerHTML='<summary>Água · debug</summary><div class="water-debug-content"><header><strong>Ajuste ao vivo</strong><span>Valores salvos neste navegador</span></header><fieldset data-section="water"><legend>Água</legend></fieldset><fieldset data-section="robot"><legend>Interação do robô</legend></fieldset><div class="water-debug-actions"><button type="button" data-action="print" aria-pressed="false">Modo print</button><button type="button" data-action="copy">Copiar valores</button><button type="button" data-action="reset">Restaurar</button></div><p class="water-debug-status" role="status" aria-live="polite"></p><textarea aria-label="Valores para copiar" readonly hidden></textarea></div>';
  try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved?.version===1)settings.apply(saved);}catch{}
  const fields=new Map();
  for(const [key,label,min,max,step,,,section] of WATER_CONTROLS){
    const row=document.createElement('label');row.className='water-debug-row';row.htmlFor=`water-${key}`;
    row.innerHTML=`<span>${label}</span><input type="range" id="water-${key}" min="${min}" max="${max}" step="${step}"><input type="number" aria-label="${label}: valor" min="${min}" max="${max}" step="${step}">`;
    panel.querySelector(`[data-section="${section}"]`).append(row);
    const [range,number]=row.querySelectorAll('input');fields.set(key,{range,number});
    const change=event=>{if(event.target.value===''||!event.target.validity.valid)return;settings.set(key,event.target.value);sync();save();onChange();};
    range.addEventListener('input',change);number.addEventListener('input',change);number.addEventListener('change',sync);
  }
  const status=panel.querySelector('[role="status"]'),fallback=panel.querySelector('textarea');
  function sync(){for(const [key,{range,number}] of fields){range.value=number.value=settings.values[key];}fallback.value=settings.export();}
  function save(){try{localStorage.setItem(storageKey,settings.export());status.textContent='Salvo neste navegador.';}catch{status.textContent='Copie os valores para guardar este ajuste.';}}
  panel.querySelector('[data-action="print"]').addEventListener('click',event=>{
    const printing=panel.classList.toggle('water-debug-print');event.target.setAttribute('aria-pressed',String(printing));event.target.textContent=printing?'Voltar aos controles':'Modo print';
  });
  panel.querySelector('[data-action="reset"]').addEventListener('click',()=>{settings.reset();sync();save();onChange();});
  panel.querySelector('[data-action="copy"]').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(settings.export());status.textContent='Valores copiados. Pode colar no chat.';fallback.hidden=true;}
    catch{fallback.hidden=false;fallback.focus();fallback.select();status.textContent='Selecione e copie os valores abaixo.';}
  });
  sync();document.getElementById('orb-experience').append(panel);
  return {dispose(){panel.remove();}};
}
