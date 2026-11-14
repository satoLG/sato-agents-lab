// Translate a visitor's request into a small, authored capability, never code.
const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export const RABBIT_MIMIC=Object.freeze({id:'rabbit',face:'rabbit',gesture:'rabbit',motion:'hop',duration:5.6});
export function planMimic(text){
 const value=normalize(text),command=value.match(/^\/mimic(?:\s+(.*))?$/),natural=value.match(/^(?:(?:por favor|voce pode|pode)\s+)?(?:imite|imita|imitar|finja ser|finja que e|aja como|faca uma imitacao de)\s+(.+?)[?!.]*$/);
 if(!command&&!natural)return null;
 const target=(command?command[1]:natural[1])?.replace(/^(?:um|uma|o|a)\s+/,'').replace(/[?!.]+$/,'').trim();
 if(target&&/^(?:coelho|coelhinho|rabbit|bunny)$/.test(target))return {ok:true,plan:RABBIT_MIMIC,answer:'Olha o meu coelhinho: orelhas em pé, focinho no painel e uns pulinhos!'};
 return {ok:false,answer:target?'Essa imitação ainda não cabe nos meus movimentos. Posso fazer um coelho — quer ver?':'Me diga o que você quer que eu imite. Que tal um coelho?'};
}
export function validMimicPlan(plan){
 return !!plan&&Object.keys(RABBIT_MIMIC).every(key=>plan[key]===RABBIT_MIMIC[key]);
}
