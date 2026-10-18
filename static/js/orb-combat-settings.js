// Bounded controls are shared by the renderer, physics, audio and debug UI.
export const COMBAT_CONTROLS=[
 ['chargeTime','Tempo de carga',.3,2.5,.05,1.15,'Carga'],
 ['orbSize','Tamanho da esfera',.025,.15,.005,.055,'Carga'],
 ['emission','Emissão',.2,3,.05,.7,'Carga'],
 ['noiseScale','Escala do ruído',1,12,.1,4.3,'Carga'],
 ['noiseSpeed','Fluxo do ruído',0,4,.05,1.3,'Carga'],
 ['warp','Turbulência do shader',0,8,.1,3.2,'Carga'],
 ['particles','Partículas',0,80,1,64,'Carga'],
 ['ringSize','Raio dos anéis',.6,3,.05,1.6,'Carga'],
 ['radius','Raio do projétil',.025,.16,.005,.08,'Projétil'],
 ['speed','Velocidade orbital ×',.7,1.3,.01,1.02,'Projétil'],
 ['gravity','Gravidade',1,9,.1,4.8,'Projétil'],
 ['lifetime','Duração (s)',1,10,.1,5.5,'Projétil'],
 ['gradientSpeed','Fluxo das cores',0,6,.1,1.9,'Projétil'],
 ['bandWidth','Largura das faixas',.05,2,.05,.25,'Projétil'],
 ['fresnel','Brilho da borda',0,4,.1,.7,'Projétil'],
 ['trailLength','Comprimento do rastro',.1,1.8,.05,.75,'Projétil'],
 ['trailOpacity','Opacidade do rastro',0,1,.05,.58,'Projétil'],
 ['muzzleSize','Flash do disparo',.08,.6,.01,.19,'Projétil'],
 ['waterForce','Deslocamento',0,1.3,.05,1,'Água em movimento'],
 ['waterWaves','Ondas de retorno',0,2,.05,1,'Água em movimento'],
 ['waterSpeed','Velocidade do retorno',.5,2,.05,1.25,'Água em movimento'],
 ['effectsVolume','Volume dos efeitos',0,1,.05,.7,'Som'],
];
export const COMBAT_COLORS=[['coreColor','Núcleo','#e0ffff'],['rimColor','Borda','#038dff'],['midColor','Cor intermediária','#a9ffff']];
export function createCombatSettings(){
 const defaults=Object.fromEntries([...COMBAT_CONTROLS.map(([k,,,,,v])=>[k,v]),...COMBAT_COLORS.map(([k,,v])=>[k,v])]);
 const values={...defaults};
 function set(key,value){const row=COMBAT_CONTROLS.find(r=>r[0]===key);if(row){const n=Number(value);if(Number.isFinite(n))values[key]=Math.min(row[3],Math.max(row[2],n));}else if(COMBAT_COLORS.some(r=>r[0]===key)&&/^#[\da-f]{6}$/i.test(value))values[key]=value;}
 return {values,set,reset(){Object.assign(values,defaults);},apply(data){if(data?.version===1)for(const [k,v] of Object.entries(data.values??{}))set(k,v);},export(){return JSON.stringify({version:1,values},null,2);}};
}
