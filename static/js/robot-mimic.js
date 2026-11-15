import {MIMIC_PRESETS} from './mimic-contract.js';
export {validMimicPlan} from './mimic-contract.js';
export const RABBIT_MIMIC=MIMIC_PRESETS.rabbit;
const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function planMimic(text){
 const value=normalize(text),command=value.match(/^\/mimic(?:\s+(.*))?$/),natural=value.match(/^(?:sato(?: agent)?[,!]?\s+)?(?:(?:por favor|voce pode|voce consegue|pode|consegue)\s+)?(?:imite|imita|imitar|finja ser|finja que e|aja como|faca uma imitacao de)\s+(.+?)[?!.]*$/);
 if(!command&&!natural)return null;
 const target=(command?command[1]:natural[1])?.replace(/^(?:um|uma|o|a)\s+/,'').replace(/[?!.]+$/,'').replace(/\s+(?:por favor|pra mim|para mim)$/,'').trim();
 if(['parar','pare','cancelar','stop'].includes(target))return {stop:true};
 if(!target)return {ok:false,answer:'Me diga o que você quer que eu imite. Que tal um coelho?'};
 if(target&&/^(?:coelho|coelhinho|rabbit|bunny)$/.test(target))return {ok:true,plan:RABBIT_MIMIC,answer:'Olha o meu coelhinho: orelhas em pé, focinho no painel e uns pulinhos!'};
 return {needsPlanning:true,target};
}
