// One schema drives the live shader, CPU contacts, UI and exported preset.
export const WATER_CONTROLS=[
  ['frequency','Frequência espacial',.25,2.5,.05,1,'orbWaveFrequency','water'],
  ['height','Altura das ondas',0,2,.05,1,'orbWaveHeight','water'],
  ['amplitude','Amplitude geral',0,1.5,.05,.9,'orbStrength','water'],
  ['speed','Velocidade das ondas',0,2,.05,1,'orbWaveSpeed','water'],
  ['opacity','Opacidade',.05,1,.01,1,null,'water'],
  ['reflectivity','Reflexividade',0,3,.05,1,'orbReflectivity','water'],
  ['foamWidth','Espessura da espuma',.25,3,.05,1,'orbFoamWidth','water'],
  ['rippleIntensity','Ondinhas · intensidade',0,3,.05,1,'orbRippleIntensity','robot'],
  ['rippleWidth','Ondinhas · espessura',.25,3,.05,1,'orbRippleWidth','robot'],
  ['rippleCount','Ondinhas · quantidade',0,8,1,3,'orbRippleCount','robot'],
  ['foamIntensity','Partículas · intensidade',0,1.5,.05,1,null,'robot'],
  ['foamSize','Partículas · tamanho',.25,3,.05,1,null,'robot'],
  ['foamAmount','Partículas · quantidade',0,3,.1,1,null,'robot'],
];
export function createWaterSettings(uniforms,material) {
  const values={};
  function set(key,value) {
    const control=WATER_CONTROLS.find(c=>c[0]===key);if(!control||!Number.isFinite(Number(value)))return false;
    const [, ,min,max,step,,uniform]=control;
    value=Number((Math.round(Math.max(min,Math.min(max,Number(value)))/step)*step).toFixed(3));values[key]=value;
    if(uniform)uniforms[uniform].value=value;
    if(key==='opacity')material.opacity=value;
    return true;
  }
  function reset(){for(const [key,,,,,value] of WATER_CONTROLS)set(key,value);}
  function apply(preset){if(!preset||typeof preset!=='object')return;for(const [key,value] of Object.entries(preset))set(key,value);}
  reset();return {values,set,apply,reset,export:()=>JSON.stringify({version:1,...values},null,2)};
}
