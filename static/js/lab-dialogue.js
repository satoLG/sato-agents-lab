// Screen-space cards reserve room for the chat form regardless of camera angle.
export function createDialogue(container){
 const layer=document.createElement('div');layer.className='dialogue-layer';layer.hidden=true;container.append(layer);const panels={};
 for(const role of ['user','robot']){
  const el=document.createElement('section');el.className=`speech-anchor ${role}`;el.setAttribute('aria-label',role==='user'?'Sua fala':'Resposta do robô');
  const card=document.createElement('div');card.className='speech-card';const title=document.createElement('strong'),body=document.createElement('div');body.className='speech-text';body.tabIndex=0;card.append(title,body);el.append(card);layer.append(el);panels[role]={title,body};
 }
 function layout(){const chat=document.getElementById('chat'),bounds=container.getBoundingClientRect();layer.style.bottom=`${chat&&!chat.hidden?Math.max(12,bounds.bottom-chat.getBoundingClientRect().top+18):24}px`;}
 const observer=new ResizeObserver(layout);observer.observe(container);const chat=document.getElementById('chat');if(chat)observer.observe(chat);
 return {setMessages(entries,name){for(const role of ['user','robot']){const p=panels[role],entry=entries.findLast(e=>e.role===role);p.title.textContent=role==='user'?'SATO / VOCÊ':name;p.body.textContent=entry?.text||(role==='user'?'Escolha uma pergunta abaixo.':'Olá!');p.body.scrollTop=0;}layout();},setOpen(value){layer.hidden=!value;layout();},resize:layout,render:layout};
}
