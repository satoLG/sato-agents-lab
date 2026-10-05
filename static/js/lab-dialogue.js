import {copyMessageButton} from './chat-ui.js';
// Shared DOM balloons keep text crisp and blur the 3D scene behind the glass.
export function createSpeechBubble({role='robot',label='Resposta do robô'}={}){
 const el=document.createElement('section');el.className=`speech-anchor ${role}`;el.setAttribute('aria-label',label);
 const card=document.createElement('div');card.className='speech-card';const title=document.createElement('strong'),body=document.createElement('div');body.className='speech-text';body.tabIndex=0;card.append(title,body);el.append(card);
 const actions=document.createElement('div');actions.className='bubble-actions';let fullText='';const copy=copyMessageButton(()=>fullText);actions.append(copy);card.append(actions);
 let animation;
 return {el,card,body,actions,copy,setText(text,name='SATO AGENT',completeText=text,{animate=true}={}){
  fullText=completeText;
  if(body.textContent===text&&title.textContent===name)return;
  title.textContent=name;body.textContent=text;body.scrollTop=0;animation?.cancel();
  if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)animation=card.animate([{opacity:0,transform:'translateY(8px) scale(.84) rotate(-1.5deg)'},{opacity:1,transform:'translateY(-2px) scale(1.025) rotate(.4deg)',offset:.65},{opacity:1,transform:'translateY(0) scale(1) rotate(0)'}],{duration:420,easing:'cubic-bezier(.22,.7,.3,1)'});
 }};
}

// Screen-space cards reserve room for the chat form regardless of camera angle.
export function createDialogue(container){
 const layer=document.createElement('div');layer.className='dialogue-layer';layer.hidden=true;container.append(layer);const panels={};
 for(const role of ['user','robot']){
  const panel=createSpeechBubble({role,label:role==='user'?'Sua fala':'Resposta do robô'});layer.append(panel.el);panels[role]=panel;
 }
 function layout(){const chat=document.getElementById('chat'),bounds=container.getBoundingClientRect();layer.style.bottom=`${chat&&!chat.hidden?Math.max(12,bounds.bottom-chat.getBoundingClientRect().top+18):24}px`;}
 const observer=new ResizeObserver(layout);observer.observe(container);const chat=document.getElementById('chat');if(chat)observer.observe(chat);
 return {setMessages(entries,name){for(const role of ['user','robot']){const entry=entries.findLast(e=>e.role===role);panels[role].setText(entry?.text||(role==='user'?'Escolha uma pergunta abaixo.':'Olá!'),role==='user'?'SATO / VOCÊ':name);}layout();},setOpen(value){layer.hidden=!value;layout();},resize:layout,render:layout};
}
