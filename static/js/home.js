import {createCompanionScene} from './home-scene.js';
import {createCompanionAudio} from './home-audio.js';
import {createSpeechBubble} from './lab-dialogue.js';
import {chatIcon,copyMessageButton,thinkingPhrase,thinkingIndicator,forgetThinking} from './chat-ui.js';

const $=id=>document.getElementById(id),API='/api/lab/hermes-chat',ROBOT='guide:hermes';
const bubble=createSpeechBubble();$('home-speech').append(bubble.el);
const speechMore=$('question-more').cloneNode(true);speechMore.id='speech-more';speechMore.hidden=true;bubble.actions.prepend(speechMore);
const preview=(text,limit)=>Array.from(text).length>limit?`${Array.from(text).slice(0,limit).join('').trimEnd()}…`:text;
let scene,pose,csrf=null,authenticated=false,available=false,jobs=[],pollTimer,requesting=false,refreshing=false,navigating=false,disposed=false,welcomeUntil=0,lastSpoken='',reactionIndex=0;
let currentQuestion='',speechPending=false;
const questionCopy=copyMessageButton(()=>currentQuestion,'Copiar pergunta');questionCopy.id='question-copy';$('question-copy').replaceWith(questionCopy);
const audio=createCompanionAudio(active=>{$('home-sound').setAttribute('aria-pressed',String(active));$('home-sound').setAttribute('aria-label',active?'Silenciar robô':'Ativar som do robô');});

function status(text,error=false){$('home-chat-status').textContent=text;$('home-chat-status').dataset.error=String(error);$('home-chat-status').dataset.busy=String(/Enviando|preparando|Reconectando/.test(text));}
function inputState(){const canSend=authenticated&&!requesting&&!navigating;$('home-input').disabled=!canSend;$('home-send').disabled=!canSend;}
function layoutViewport(){
 const viewport=window.visualViewport;document.documentElement.style.setProperty('--viewport-height',`${viewport?.height||innerHeight}px`);document.documentElement.style.setProperty('--viewport-top',`${viewport?.offsetTop||0}px`);layoutComposer();
}
function layoutComposer(){const chat=$('home-chat');if(chat.hidden)return;const height=`${chat.offsetHeight+parseFloat(getComputedStyle(chat).bottom)}px`;if(document.documentElement.style.getPropertyValue('--composer-height')!==height){document.documentElement.style.setProperty('--composer-height',height);scene?.resize();}placeSpeech();}
function placeSpeech(){
 if(!pose)return;
 const {head,body} = pose,root=$('home').getBoundingClientRect(),touch=$('robot-touch');
 touch.style.left=`${body.left}px`;touch.style.top=`${body.top}px`;touch.style.width=`${body.right-body.left}px`;touch.style.height=`${body.bottom-body.top}px`;
 const speech=$('home-speech'),navBottom=document.querySelector('.home-header').getBoundingClientRect().bottom-root.top+16;
 const chatTop=$('home-chat').hidden?root.height:$('home-chat').getBoundingClientRect().top-root.top;
 const top=Math.max(navBottom,Math.min(head.y-speech.offsetHeight-27,chatTop-speech.offsetHeight-20));
 speech.style.left=`${Math.max(speech.offsetWidth/2+15,Math.min(root.width-speech.offsetWidth/2-15,head.x))}px`;speech.style.top=`${top}px`;
}
function say(text,{reaction,sound=true,pending=false}={}){
 if(disposed||!text)return;const indicator=pending&&speechPending?bubble.body.querySelector('.thinking-indicator'):null;lastSpoken=text;speechPending=pending;
 if(indicator){if(indicator.firstChild.nodeValue!==text)indicator.firstChild.nodeValue=text;}
 else{bubble.setText(preview(text,420),'SATO AGENT',text,{animate:!pending});if(pending)bubble.body.replaceChildren(thinkingIndicator(text));}
 bubble.copy.hidden=pending;
 $('home-speech').hidden=false;measurePreviews();placeSpeech();if(!pending)scene?.speak(Math.min(6,Math.max(2,text.length/35)));if(reaction)scene?.react(reaction);if(sound)audio.cue(reaction||'hello');
}
function measurePreviews(){speechMore.hidden=speechPending||!(lastSpoken.length>420||bubble.body.scrollHeight>bubble.body.clientHeight+2);const q=$('last-question-text');$('question-more').hidden=!(currentQuestion.length>180||q.scrollHeight>q.clientHeight+2);}
async function api(path,options={}){
 try{
  const response=await fetch(`${API}/${path}`,{...options,credentials:'same-origin',signal:AbortSignal.timeout(12000),headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  const data=await response.json();if(!response.ok){const error=new Error(data.error||'Não consegui conversar com Sato Agent agora.');error.status=response.status;throw error;}return data;
 }catch(error){if(error.status)throw error;throw new Error('Não consegui conectar ao chat. Tente novamente.');}
}
function setSession(data){
 available=!!data.available;authenticated=!!data.authenticated;csrf=data.csrf;
 $('home-login').hidden=!available||authenticated;$('home-form').hidden=available&&!authenticated;inputState();
 document.querySelector('.home-composer').dataset.login=String(available&&!authenticated);
 if(!available)status('Sato Agent ainda não está disponível para conversar.',true);
 else if(!authenticated)status('Use o acesso do chat para começar.');
 else status('Chat conectado.');
 layoutComposer();
}
function showQuestion(question){currentQuestion=question||'';$('last-question').hidden=!question;const text=preview(currentQuestion,180);if($('last-question-text').textContent!==text)$('last-question-text').textContent=text;measurePreviews();layoutComposer();}
const historyEntries=new Map(),historyDays=new Map(),expandedMessages=new Set();
function historyEntry(job){
 const entry=document.createElement('article');entry.className='history-turn';entry.dataset.job=job.id;entry.views={};
 for(const role of ['question','answer']){
  const node=document.createElement('div'),name=document.createElement('h3'),text=document.createElement('p'),footer=document.createElement('footer'),time=document.createElement('time'),more=document.createElement('button');
  node.className=`history-${role}`;name.textContent=role==='question'?'VOCÊ':'SATO AGENT';more.type='button';more.className='history-more';more.hidden=true;
  const view={node,text,time,more,fullText:'',pending:false};view.copy=copyMessageButton(()=>view.fullText,role==='question'?'Copiar pergunta':'Copiar resposta');
  more.addEventListener('click',()=>{const key=`${job.id}:${role}`;if(expandedMessages.has(key))expandedMessages.delete(key);else expandedMessages.add(key);updateHistoryText(view,job.id,role);historyScroll();});
  footer.append(more,view.copy,time);if(role==='question')footer.append(chatIcon('check-check'));node.append(name,text,footer);entry.append(node);entry.views[role]=view;
 }
 return entry;
}
function updateHistoryText(view,id,role){
 const expanded=expandedMessages.has(`${id}:${role}`),limit=role==='question'?180:420;
 if(view.pending){
  const phrase=thinkingPhrase(id),indicator=view.text.querySelector('.thinking-indicator');
  if(indicator){if(indicator.firstChild.nodeValue!==phrase)indicator.firstChild.nodeValue=phrase;}else view.text.replaceChildren(thinkingIndicator(phrase));
 }else{
  const value=expanded?view.fullText:preview(view.fullText.split('\n').slice(0,5).join('\n'),limit);if(view.text.textContent!==value)view.text.textContent=value;
 }
 view.text.classList.toggle('history-pending',view.pending);view.text.dataset.collapsed=String(!expanded&&!view.pending);view.copy.hidden=view.pending;
 const label=expanded?'Ver menos':'Ver mais';if(view.more.textContent!==label)view.more.textContent=label;view.more.setAttribute('aria-expanded',String(expanded));
 view.more.hidden=view.pending||!(expanded||view.fullText.length>limit||view.fullText.split('\n').length>5||view.text.scrollHeight>view.text.clientHeight+2);
}
function updateHistoryEntry(entry,job){
 for(const role of ['question','answer']){
  const view=entry.views[role];view.pending=role==='answer'&&['queued','running'].includes(job.status);view.fullText=role==='question'?job.question||'':job.answer||job.error||(job.status==='failed'?'Não consegui responder. Tente novamente.':'');updateHistoryText(view,job.id,role);
  // Pending updates must not change the clock or recreate footer icons.
  const timestamp=role==='question'||view.pending?job.created_at:job.updated_at||job.created_at;
  if(view.timestamp!==timestamp){view.timestamp=timestamp;const date=new Date(timestamp*1000);view.time.hidden=!timestamp||Number.isNaN(date.getTime());if(!view.time.hidden){view.time.dateTime=date.toISOString();view.time.textContent=date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}}
 }
}
function renderHistory(){
 const log=$('home-messages');
 const atEnd=log.scrollHeight-log.scrollTop-log.clientHeight<40,scrollTop=log.scrollTop,anchor=[...log.querySelectorAll('.history-turn')].find(el=>el.offsetTop+el.offsetHeight>scrollTop),offset=anchor?scrollTop-anchor.offsetTop:0;
 const entries=[],keep=new Set();let previousDay='';for(const job of jobs){const date=new Date((job.created_at||0)*1000),day=job.created_at&&!Number.isNaN(date.getTime())?date.toLocaleDateString('pt-BR',{day:'numeric',month:'long'}):'';if(day&&day!==previousDay){if(!historyDays.has(day)){const label=document.createElement('p');label.className='history-day';label.textContent=day;historyDays.set(day,label);}entries.push(historyDays.get(day));previousDay=day;}if(!historyEntries.has(job.id))historyEntries.set(job.id,historyEntry(job));const entry=historyEntries.get(job.id);updateHistoryEntry(entry,job);entries.push(entry);keep.add(job.id);}
 if(!jobs.length){const empty=log.querySelector('.history-empty')||document.createElement('p');empty.className='history-empty';empty.textContent='Sua conversa aparece aqui.';entries.push(empty);}
 let cursor=log.firstChild;for(const entry of entries){if(entry===cursor)cursor=cursor.nextSibling;else log.insertBefore(entry,cursor);}while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
 for(const id of historyEntries.keys())if(!keep.has(id))historyEntries.delete(id);
 if(atEnd)log.scrollTop=log.scrollHeight;else{const retained=historyEntries.get(anchor?.dataset.job);log.scrollTop=retained?retained.offsetTop+offset:scrollTop;}historyScroll();
}
function showLatest(){
 renderHistory();const latest=jobs.at(-1);if(!latest)return;
 showQuestion(latest.question);
 if(latest.status==='done'&&latest.answer){forgetThinking(latest.id);status('Chat conectado.');if(Date.now()>=welcomeUntil&&(speechPending||lastSpoken!==latest.answer)&&!navigating)say(latest.answer);}
 else if(latest.status==='failed'){forgetThinking(latest.id);const error=latest.error||'Não consegui responder. Tente enviar novamente.';status(error,true);if(speechPending&&!navigating)say(error,{sound:false});}
 else{const phrase=thinkingPhrase(latest.id);status(phrase);if(Date.now()>=welcomeUntil&&(lastSpoken!==phrase||!speechPending)&&!navigating)say(phrase,{sound:false,pending:true});}
}
function schedulePoll(){clearTimeout(pollTimer);if(!disposed&&authenticated)pollTimer=setTimeout(refresh,jobs.some(j=>['queued','running'].includes(j.status))?1800:15000);}
async function refresh(){
 if(disposed||!authenticated||refreshing)return;if(document.hidden){schedulePoll();return;}refreshing=true;
 try{const data=await api(`history?robot_id=${encodeURIComponent(ROBOT)}`);jobs=data.jobs||[];showLatest();}
 catch(error){if(error.status===401){setSession({available,authenticated:false});status('Entre novamente para continuar.',true);}else status('Reconectando. Suas mensagens continuam salvas.',true);}
 finally{refreshing=false;schedulePoll();}
}
async function initializeChat(){try{setSession(await api('session'));if(authenticated)await refresh();}catch{status('Não consegui conectar ao chat. Recarregue para tentar novamente.',true);}}
function historyScroll(){const log=$('home-messages');$('history-bottom').hidden=log.scrollHeight-log.scrollTop-log.clientHeight<120;}
function historyOpen(open,role){$('home-history').hidden=!open;$('home').dataset.history=String(open);$('home-history-toggle').setAttribute('aria-expanded',String(open));$('home-history-toggle').setAttribute('aria-label',open?'Fechar histórico da conversa':'Abrir histórico da conversa');layoutComposer();if(open){if(role&&jobs.length)expandedMessages.add(`${jobs.at(-1).id}:${role}`);renderHistory();const target=role?$('home-messages').querySelector('.history-turn:last-child .history-'+role):null;if(target)target.scrollIntoView({block:'start'});else $('home-messages').scrollTop=$('home-messages').scrollHeight;$('history-close').focus({preventScroll:true});historyScroll();}else $('home-history-toggle').focus({preventScroll:true});}
speechMore.addEventListener('click',()=>historyOpen(true,'answer'));$('question-more').addEventListener('click',()=>historyOpen(true,'question'));
$('home-messages').addEventListener('scroll',historyScroll);$('history-bottom').addEventListener('click',()=>{$('home-messages').scrollTo({top:$('home-messages').scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
$('home-history-toggle').addEventListener('click',()=>historyOpen($('home-history').hidden));$('history-close').addEventListener('click',()=>historyOpen(false));document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('home-history').hidden)historyOpen(false);});
$('home-input').addEventListener('input',()=>{$('home-input').style.height='auto';$('home-input').style.height=`${Math.min(144,$('home-input').scrollHeight)}px`;});
$('home-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('home-form').requestSubmit();}});
$('home-form').addEventListener('submit',async event=>{
 event.preventDefault();const question=$('home-input').value.trim();if(!question||!authenticated||requesting||navigating)return;
 requesting=true;inputState();showQuestion(question);status('Enviando sua mensagem…');welcomeUntil=0;
 try{
  const result=await api('jobs',{method:'POST',headers:{'X-Chat-CSRF':csrf},body:JSON.stringify({robot_id:ROBOT,question})});
  jobs.push({id:result.id,robot_id:ROBOT,question,status:result.status,created_at:Date.now()/1000});$('home-input').value='';$('home-input').style.height='auto';showLatest();schedulePoll();
 }catch(error){status(error.message,true);if(error.status===401||error.status===403){setSession({available,authenticated:false});status('Entre novamente para enviar sua mensagem.',true);}}
 finally{requesting=false;inputState();if(authenticated)$('home-input').focus({preventScroll:true});}
});
$('home-login').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('home-login').querySelector('button');button.disabled=true;
 try{setSession(await api('login',{method:'POST',body:JSON.stringify({password:$('home-password').value})}));$('home-password').value='';if(authenticated){await refresh();$('home-input').focus({preventScroll:true});}}
 catch(error){status(error.message,true);}finally{button.disabled=false;}
});
const reactions=[{kind:'wave',text:'Oi! Que bom te ver por aqui.'},{kind:'boop',text:'Bip-bip! Acho que você achou meu botão de cócegas.'},{kind:'dance',text:'Um passinho de robô pra alegrar o dia!'}, {kind:'shy',text:'Hehe… agora fiquei tímido.'}];
$('robot-touch').addEventListener('click',()=>{if(navigating)return;const reaction=reactions[reactionIndex++%reactions.length];say(reaction.text,{reaction:reaction.kind});});
$('home-sound').addEventListener('click',()=>audio.toggle());
const settings=$('home-settings');let settingsRevision=0;
$('home-settings-toggle').addEventListener('click',()=>settings.showModal());$('settings-close').addEventListener('click',()=>settings.close());settings.addEventListener('click',event=>{if(event.target!==settings)return;const r=settings.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)settings.close();});settings.addEventListener('close',()=>{$('home-settings-toggle').focus({preventScroll:true});});
async function changeScenario(kind,options){const revision=++settingsRevision;$('settings-status').textContent='Carregando cenário…';try{if(!scene)throw new Error('O cenário precisa de WebGL 2.');const applied=await scene.setScenario(kind,options);if(applied&&revision===settingsRevision){try{localStorage.setItem('sato-home-scenario',kind);}catch{}$('settings-status').textContent='';}}catch(error){if(revision===settingsRevision){$('settings-status').textContent=error.message;const current=$('home-scene').dataset.scenario||'black';document.querySelector(`[name="home-scenario"][value="${current}"]`).checked=true;}}}
document.querySelectorAll('[name="home-scenario"]').forEach(input=>input.addEventListener('change',()=>changeScenario(input.value)));
function changeTheme(theme){if(!['cyan','mint','violet','amber'].includes(theme))return;$('home').dataset.theme=theme;document.querySelector(`[name="home-theme"][value="${theme}"]`).checked=true;try{localStorage.setItem('sato-home-theme',theme);}catch{}}
document.querySelectorAll('[name="home-theme"]').forEach(input=>input.addEventListener('change',()=>changeTheme(input.value)));
try{changeTheme(localStorage.getItem('sato-home-theme')||'cyan');}catch{}
let navigationTimer;
document.querySelectorAll('[data-destination]').forEach(link=>link.addEventListener('click',event=>{
 if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();if(navigating)return;navigating=true;inputState();
 say(link.dataset.destination==='lab'?'Vou te levar ao laboratório. Vem comigo!':'Vou te levar ao dashboard. Vem comigo!',{reaction:'wave'});
 navigationTimer=setTimeout(()=>location.assign(link.href),1400);
}));
new ResizeObserver(layoutComposer).observe($('home-chat'));new ResizeObserver(()=>{measurePreviews();placeSpeech();}).observe($('home-speech'));window.visualViewport?.addEventListener('resize',layoutViewport);window.visualViewport?.addEventListener('scroll',layoutViewport);window.addEventListener('resize',layoutViewport);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authenticated)refresh();});layoutViewport();
function progress(value,text){$('home-progress').value=value;$('home-loading-stage').textContent=text;}
async function start(){
 welcomeUntil=Infinity;const chatReady=initializeChat();
 try{await document.fonts.load('700 16px Nunito');progress(20,'Carregando robô…');scene=await createCompanionScene($('home-scene'),{onProgress:progress,onFrame(value){pose=value;placeSpeech();},onScenario:kind=>audio.setScenario(kind),onArrival(stage){if(stage==='ouch')say('Ouch! Acho que a entrega foi um pouco rápida…',{sound:false});}});
  let saved;try{saved=localStorage.getItem('sato-home-scenario');}catch{}if(['lab','forest'].includes(saved)){progress(85,'Preparando cenário…');document.querySelector(`[name="home-scenario"][value="${saved}"]`).checked=true;await changeScenario(saved,{immediate:true});}
 }
 catch(error){console.warn('Companion scene unavailable',error);$('home-fallback').hidden=false;}
 if(disposed)return;progress(100,'Pronto!');$('home-chat').hidden=false;layoutComposer();
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));$('home-loading').hidden=true;$('home').dataset.sceneReady='true';
 if(scene){await scene.arrive();if(disposed)return;$('robot-touch').hidden=false;}
 await chatReady;if(disposed)return;document.body.dataset.ready='true';welcomeUntil=Date.now()+3500;say('Hello, im a Sato Agent',{reaction:'hello'});
 setTimeout(()=>{if(!disposed&&jobs.length)showLatest();},3550);
}
window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;clearTimeout(pollTimer);clearTimeout(navigationTimer);scene?.dispose();audio.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted){navigating=false;inputState();layoutViewport();refresh();say('Que bom ter você de volta!',{reaction:'wave'});}});
start();
