const sprite=new URL('../icons/lucide.svg',import.meta.url).href;
export function chatIcon(name){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');
 svg.setAttribute('aria-hidden','true');svg.setAttribute('viewBox','0 0 24 24');use.setAttribute('href',`${sprite}#${name}`);svg.append(use);return svg;
}
export function copyMessageButton(getText,label='Copiar mensagem'){
 const button=document.createElement('button');button.type='button';button.className='copy-button';button.title=label;button.setAttribute('aria-label',label);button.append(chatIcon('copy'));
 button.addEventListener('click',async()=>{
  const text=getText();if(!text)return;
  try{
   if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
   else{
    const active=document.activeElement,selection=getSelection(),ranges=[];for(let i=0;i<selection.rangeCount;i++)ranges.push(selection.getRangeAt(i).cloneRange());
    const field=document.createElement('textarea');field.value=text;field.style.cssText='position:fixed;top:0;left:-9999px';document.body.append(field);
    try{field.select();if(!document.execCommand('copy'))throw new Error('Clipboard unavailable');}
    finally{field.remove();active?.focus({preventScroll:true});selection.removeAllRanges();ranges.forEach(range=>selection.addRange(range));}
   }
   button.dataset.copied='true';button.setAttribute('aria-label','Mensagem copiada');button.title='Mensagem copiada';button.replaceChildren(chatIcon('check'));
   setTimeout(()=>{button.dataset.copied='false';button.setAttribute('aria-label',label);button.title=label;button.replaceChildren(chatIcon('copy'));},1800);
  }catch{button.setAttribute('aria-label','Não foi possível copiar. Tente novamente');button.title='Não foi possível copiar. Tente novamente';}
 });return button;
}
const thinkingPhrases=['Organizando as ideias','Analisando sua pergunta','Conectando as informações','Preparando uma resposta','Pensando em como explicar','Deixa eu pensar'];
const pending=new Map();let previous=-1;
export function thinkingPhrase(id){
 let state=pending.get(id);
 if(!state||Date.now()>=state.next){
  const index=(previous+1+Math.floor(Math.random()*(thinkingPhrases.length-1)))%thinkingPhrases.length;previous=index;
  state={text:thinkingPhrases[index],next:Date.now()+8000};pending.set(id,state);
 }
 return state.text;
}
export function forgetThinking(id){pending.delete(id);}
export function thinkingIndicator(text){
 const span=document.createElement('span');span.className='thinking-indicator';
 const dots=document.createElementNS('http://www.w3.org/2000/svg','svg');dots.setAttribute('viewBox','0 0 24 8');dots.setAttribute('aria-hidden','true');dots.classList.add('thinking-dots');
 for(let i=0;i<3;i++){const dot=document.createElementNS(dots.namespaceURI,'circle');dot.setAttribute('cx',String(4+i*8));dot.setAttribute('cy','4');dot.setAttribute('r','2');dots.append(dot);}
 span.append(document.createTextNode(text),dots);return span;
}
