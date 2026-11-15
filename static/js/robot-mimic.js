import {MIMIC_PRESETS,MIMIC_LIBRARY} from './mimic-contract.js';
export {validMimicPlan} from './mimic-contract.js';
export const RABBIT_MIMIC=MIMIC_PRESETS.rabbit;
const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const aliases=new Map(Object.entries(MIMIC_LIBRARY).flatMap(([id,entry])=>entry.aliases.map(alias=>[normalize(alias),id])));
export function planMimic(text){
 const value=normalize(text),command=value.match(/^\/mimic(?:\s+(.*))?$/),natural=value.match(/^(?:sato(?: agent)?[,!]?\s+)?(?:(?:por favor|voce pode|voce consegue|pode|consegue)\s+)?(?:imite|imita|imitar|finja ser|finja que e|aja como|faca uma imitacao de)\s+(.+?)[?!.]*$/);
 if(!command&&!natural)return null;
 const target=(command?command[1]:natural[1])?.replace(/^(?:um|uma|o|a)\s+/,'').replace(/[?!.]+$/,'').replace(/\s+(?:por favor|pra mim|para mim)$/,'').trim();
 if(['parar','pare','cancelar','stop'].includes(target))return {stop:true};
 if(!target)return {ok:false,answer:'Me diga o que você quer que eu imite. Que tal um coelho?'};
 const preset=MIMIC_PRESETS[aliases.get(target)];
 if(preset)return {ok:true,plan:structuredClone(preset),answer:`Vou representar ${preset.label} com meu visor e meus braços.`};
 return {needsPlanning:true,target};
}
