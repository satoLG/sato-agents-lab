import {createCompanionScene} from './home-scene.js';
import {createCompanionAudio} from './home-audio.js';
import {createSpeechBubble} from './lab-dialogue.js';
import {chatIcon,copyMessageButton,thinkingPhrase,thinkingIndicator,forgetThinking} from './chat-ui.js';
import {createChatTypewriter} from './chat-typewriter.js';
import {fitChatPreview} from './chat-preview.js';

const $=id=>document.getElementById(id),API='/api/lab/hermes-chat',ROBOT='guide:hermes';
const bubble=createSpeechBubble();$('home-speech').append(bubble.el);
const speechMore=$('question-more').cloneNode(true);speechMore.id='speech-more';speechMore.hidden=true;bubble.actions.prepend(speechMore);
const speechTime=document.createElement('time'),speechMeta=document.createElement('span');speechMeta.className='bubble-meta';speechMeta.append(bubble.copy,speechTime);bubble.actions.append(speechMeta);
const preview=(text,limit)=>Array.from(text).length>limit?`${Array.from(text).slice(0,limit).join('').trimEnd()}…`:text;
const answerPreview=text=>{const lines=text.split('\n').slice(0,5).join('\n'),value=preview(lines,420);return lines!==text&&value===lines?value+'…':value;};
let scene,pose,csrf=null,authenticated=false,available=false,jobs=[],pollTimer,requesting=false,refreshing=null,navigating=false,disposed=false,lastSpoken='',reactionIndex=0;
let currentQuestion='',speechPending=false,previewTimer;
let conversations=[],conversationId=null,conversationTitle='',conversationRevision=0,historyView='sessions',hasEarlier=false,loadedEarlier=false,retryMessage=null;
const awaitingAnswers=new Set(),animatedAnswers=new Set();
const questionCopy=copyMessageButton(()=>currentQuestion,'Copiar pergunta');questionCopy.id='question-copy';$('question-copy').replaceWith(questionCopy);
const audio=createCompanionAudio(active=>{$('home-sound').setAttribute('aria-pressed',String(active));$('home-sound').setAttribute('aria-label',active?'Silenciar robô':'Ativar som do robô');});
const typing=createChatTypewriter(audio,()=>{measurePreviews();placeSpeech();historyScroll();schedulePreviewCollapse();});

function schedulePreviewCollapse(){
 if(previewTimer||!jobs.length||speechPending||!$('home-history').hidden||$('home').dataset.previewCollapsed==='true'||bubble.body.dataset.typing==='true'||document.querySelector('#home-speech:hover,#last-question:hover,#home-speech:focus-within,#last-question:focus-within'))return;
 previewTimer=setTimeout(()=>{previewTimer=null;if($('home-history').hidden&&!speechPending)setPreviewCollapsed(true);},5000);
}
function setPreviewCollapsed(collapsed){
 clearTimeout(previewTimer);previewTimer=null;
 $('home').dataset.previewCollapsed=String(collapsed);
 for(const id of ['home-speech','last-question']){$(id).inert=collapsed;$(id).setAttribute('aria-hidden',String(collapsed));}
 $('chat-peek').hidden=!jobs.length;$('chat-peek').setAttribute('aria-expanded',String(!collapsed));$('chat-peek').tabIndex=collapsed?0:-1;
 if(collapsed){typing.finishAll();if($('last-question').contains(document.activeElement)||$('home-speech').contains(document.activeElement))$('chat-peek').focus({preventScroll:true});}
}

$('chat-peek').addEventListener('click',()=>{setPreviewCollapsed(false);schedulePreviewCollapse();});
for(const id of ['home-speech','last-question']){
 $(id).addEventListener('pointerenter',()=>{clearTimeout(previewTimer);previewTimer=null;});
 $(id).addEventListener('pointerleave',schedulePreviewCollapse);
 $(id).addEventListener('focusin',()=>{clearTimeout(previewTimer);previewTimer=null;});
 $(id).addEventListener('focusout',schedulePreviewCollapse);
}

function status(text,error=false){$('home-chat-status').textContent=text;$('home-chat-status').dataset.error=String(error);$('home-chat-status').dataset.busy=String(/Enviando|preparando|Reconectando/.test(text));}
function inputState(){const canSend=authenticated&&!requesting&&!navigating;$('home-input').disabled=!canSend;$('home-send').disabled=!canSend;$('history-new').disabled=requesting;document.querySelectorAll('.session-card').forEach(button=>button.disabled=requesting);}
function layoutViewport(){
 const viewport=window.visualViewport;document.documentElement.style.setProperty('--viewport-height',`${viewport?.height||innerHeight}px`);document.documentElement.style.setProperty('--viewport-top',`${viewport?.offsetTop||0}px`);layoutComposer();
}
function layoutComposer(){const chat=$('home-chat');if(chat.hidden)return;const height=`${document.querySelector('.home-composer').offsetHeight+parseFloat(getComputedStyle(chat).bottom)}px`;if(document.documentElement.style.getPropertyValue('--composer-height')!==height)document.documentElement.style.setProperty('--composer-height',height);placeSpeech();}
function placeSpeech(){
 if(!pose)return;
 const {head,body} = pose,root=$('home').getBoundingClientRect(),touch=$('robot-touch');
 touch.style.left=`${body.left}px`;touch.style.top=`${body.top}px`;touch.style.width=`${body.right-body.left}px`;touch.style.height=`${body.bottom-body.top}px`;
 const speech=$('home-speech'),navBottom=document.querySelector('.home-header').getBoundingClientRect().bottom-root.top+16;
 const chatTop=$('home-chat').hidden?root.height:$('home-chat').getBoundingClientRect().top-root.top;
 const top=Math.max(navBottom,Math.min(head.y-speech.offsetHeight-27,chatTop-speech.offsetHeight-20));
 speech.style.left=`${Math.max(speech.offsetWidth/2+15,Math.min(root.width-speech.offsetWidth/2-15,head.x))}px`;speech.style.top=`${top}px`;
 const peek=$('chat-peek'),peekY=Math.max(navBottom+24,head.y-36);peek.style.left=`${head.x}px`;peek.style.top=`${peekY}px`;
 speech.style.setProperty('--collapse-y',`${peekY-top-speech.offsetHeight/2}px`);
 const question=$('last-question'),chat=$('home-chat').getBoundingClientRect();question.style.setProperty('--collapse-y',`${peekY-(chat.top-root.top+question.offsetTop)-question.offsetHeight/2}px`);question.style.setProperty('--collapse-x',`${head.x-(chat.left-root.left+question.offsetLeft)-question.offsetWidth/2}px`);
}
function say(text,{reaction,sound=true,pending=false,animate=false,timestamp}={}){
 if(disposed||!text)return;const indicator=pending&&speechPending?bubble.body.querySelector('.thinking-indicator'):null;lastSpoken=text;speechPending=pending;$('home-speech').hidden=false;setPreviewCollapsed(false);
 if(indicator){if(indicator.firstChild.nodeValue!==text)indicator.firstChild.nodeValue=text;}
 else{typing.finish(bubble.body);bubble.setText(animate?'':answerPreview(text),'SATO AGENT',text,{animate:false});if(pending)bubble.body.replaceChildren(thinkingIndicator(text));else typing.set(bubble.body,fitChatPreview(bubble.body,answerPreview(text)),{animate});}
 bubble.copy.hidden=pending;
 setClock(speechTime,timestamp);
 $('home-speech').hidden=false;measurePreviews();placeSpeech();schedulePreviewCollapse();if(!pending)scene?.speak(Math.min(6,Math.max(2,text.length/35)));if(reaction)scene?.react(reaction);if(sound)audio.cue(reaction||'hello');
}
function measurePreviews(){speechMore.hidden=speechPending||!(lastSpoken!==bubble.body.textContent);const q=$('last-question-text');$('question-more').hidden=!(currentQuestion!==q.textContent);}
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
function setClock(node,timestamp){const date=new Date(timestamp*1000);node.hidden=!timestamp||Number.isNaN(date.getTime());if(!node.hidden){node.dateTime=date.toISOString();node.textContent=date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}}
function showQuestion(question,timestamp){currentQuestion=question||'';$('last-question').hidden=!question;const text=preview(currentQuestion,180);if($('last-question-text').textContent!==text)$('last-question-text').textContent=text;setClock($('question-time'),timestamp);measurePreviews();layoutComposer();}
const historyEntries=new Map(),historyDays=new Map(),expandedMessages=new Set();
function historyEntry(job){
 const entry=document.createElement('article');entry.className='history-turn';entry.dataset.job=job.id;entry.views={};
 for(const role of ['question','answer']){
  const node=document.createElement('div'),name=document.createElement('h3'),text=document.createElement('p'),footer=document.createElement('footer'),time=document.createElement('time'),more=document.createElement('button');
  node.className=`history-${role}`;name.textContent=role==='question'?'VOCÊ':'SATO AGENT';more.type='button';more.className='history-more';more.hidden=true;
  const view={node,text,time,more,fullText:'',pending:false};view.copy=copyMessageButton(()=>view.fullText,role==='question'?'Copiar pergunta':'Copiar resposta');
  more.addEventListener('click',()=>{const key=`${job.id}:${role}`;if(expandedMessages.has(key))expandedMessages.delete(key);else expandedMessages.add(key);updateHistoryText(view,job.id,role);historyScroll();});
  const meta=document.createElement('span');meta.className='bubble-meta';meta.append(view.copy,time);if(role==='question')meta.append(chatIcon('check-check'));footer.append(more,meta);node.append(name,text,footer);entry.append(node);entry.views[role]=view;
 }
 return entry;
}
function updateHistoryText(view,id,role){
 const expanded=expandedMessages.has(`${id}:${role}`),limit=role==='question'?180:420;
 if(view.pending){
  const phrase=thinkingPhrase(id),indicator=view.text.querySelector('.thinking-indicator');
  if(indicator){if(indicator.firstChild.nodeValue!==phrase)indicator.firstChild.nodeValue=phrase;}else{typing.finish(view.text);view.text.replaceChildren(thinkingIndicator(phrase));}
 }else{
  const value=expanded?view.fullText:role==='answer'?answerPreview(view.fullText):preview(view.fullText.split('\n').slice(0,5).join('\n'),limit);
  view.text.dataset.collapsed=String(!expanded);
  // Measure only when the text or available width changes; polling must not
  // replace text nodes in a completed message or disturb a user's selection.
  let fitted=value;const layoutKey=`${$('home-messages').clientWidth}:${value}`;
  if(!expanded){
   if(view.previewKey!==layoutKey){
    const previous=view.text.textContent;if(!view.text.dataset.typing&&previous!==value)view.text.textContent=value;
    view.previewText=fitChatPreview(view.text,value);view.previewKey=layoutKey;
    if(!view.text.dataset.typing&&previous!==value)view.text.textContent=previous;
   }
   fitted=view.previewText;
  }
  typing.set(view.text,fitted,{animate:role==='answer'&&!expanded&&animatedAnswers.has(id)&&!$('home-history').hidden&&historyView==='thread'});
  view.displayText=fitted;
 }
 view.text.classList.toggle('history-pending',view.pending);view.text.dataset.collapsed=String(!expanded&&!view.pending);view.copy.hidden=view.pending;
 const label=expanded?'Ver menos':'Ver mais';if(view.more.textContent!==label)view.more.textContent=label;view.more.setAttribute('aria-expanded',String(expanded));
 view.more.hidden=view.pending||!(expanded||view.fullText!==view.displayText);
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
 const entries=[],keep=new Set();let previousDay='';for(const job of jobs){const date=new Date((job.created_at||0)*1000),day=job.created_at&&!Number.isNaN(date.getTime())?date.toLocaleDateString('pt-BR',{day:'numeric',month:'long'}):'';if(day&&day!==previousDay){if(!historyDays.has(day)){const label=document.createElement('p');label.className='history-day';label.textContent=day;historyDays.set(day,label);}entries.push(historyDays.get(day));previousDay=day;}if(!historyEntries.has(job.id))historyEntries.set(job.id,historyEntry(job));const entry=historyEntries.get(job.id);entries.push(entry);keep.add(job.id);}
 if(!jobs.length){const empty=log.querySelector('.history-empty')||document.createElement('p');empty.className='history-empty';empty.textContent='Sua conversa aparece aqui.';entries.push(empty);}
 let cursor=log.firstChild;for(const entry of entries){if(entry===cursor)cursor=cursor.nextSibling;else log.insertBefore(entry,cursor);}while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
 for(const job of jobs)updateHistoryEntry(historyEntries.get(job.id),job);
 for(const id of historyEntries.keys())if(!keep.has(id)){typing.finish(historyEntries.get(id).views.answer.text);historyEntries.delete(id);}
 if(atEnd)log.scrollTop=log.scrollHeight;else{const retained=historyEntries.get(anchor?.dataset.job);log.scrollTop=retained?retained.offsetTop+offset:scrollTop;}historyScroll();
}
function showLatest(){
 const latest=jobs.at(-1);if(!latest){setPreviewCollapsed(false);showQuestion('');$('home-speech').hidden=true;renderHistory();return;}
 for(const job of jobs){if(['queued','running'].includes(job.status))awaitingAnswers.add(job.id);else if(awaitingAnswers.delete(job.id)&&job.status==='done')animatedAnswers.add(job.id);}
 const incoming=animatedAnswers.has(latest.id);
 showQuestion(latest.question,latest.created_at);
 if(latest.status==='done'&&latest.answer){forgetThinking(latest.id);status('Chat conectado.');if((speechPending||lastSpoken!==latest.answer)&&!navigating)say(latest.answer,{sound:false,animate:incoming&&$('home-history').hidden,timestamp:latest.updated_at||latest.created_at});}
 else if(latest.status==='failed'){forgetThinking(latest.id);const error=latest.error||'Não consegui responder. Tente enviar novamente.';status(error,true);if((speechPending||lastSpoken!==error)&&!navigating)say(error,{sound:false});}
 else{awaitingAnswers.add(latest.id);const phrase=thinkingPhrase(latest.id);status(phrase);if((lastSpoken!==phrase||!speechPending)&&!navigating)say(phrase,{sound:false,pending:true});}
 renderHistory();animatedAnswers.clear();
}
function schedulePoll(){clearTimeout(pollTimer);if(!disposed&&authenticated)pollTimer=setTimeout(refresh,jobs.some(j=>['queued','running'].includes(j.status))?1800:15000);}
function mergeJobs(entries){const merged=new Map(jobs.map(job=>[job.id,job]));for(const job of entries)merged.set(job.id,job);jobs=[...merged.values()].sort((a,b)=>a.created_at-b.created_at||a.id.localeCompare(b.id));}
async function refresh(){
 if(disposed||!authenticated||refreshing===conversationRevision||requesting)return;if(document.hidden){schedulePoll();return;}const revision=conversationRevision,id=conversationId;refreshing=revision;
 try{if(id){const data=await api(`history?robot_id=${encodeURIComponent(ROBOT)}&conversation_id=${id}`);if(revision!==conversationRevision||requesting)return;mergeJobs(data.jobs||[]);if(!loadedEarlier)hasEarlier=!!data.has_more;$('history-earlier').hidden=!hasEarlier;showLatest();}if(historyView==='sessions'&&!$('home-history').hidden)await loadConversations();}
 catch(error){if(error.status===401){setSession({available,authenticated:false});status('Entre novamente para continuar.',true);}else status('Reconectando. Suas mensagens continuam salvas.',true);}
 finally{if(refreshing===revision)refreshing=null;if(revision===conversationRevision)schedulePoll();}
}
async function initializeChat(){try{setSession(await api('session'));if(authenticated){await loadConversations();schedulePoll();}}catch{status('Não consegui conectar ao chat. Recarregue para tentar novamente.',true);}}
function renderConversations(){
 const list=$('home-sessions');list.replaceChildren();
 for(const conversation of conversations){const button=document.createElement('button');button.type='button';button.className='session-card';button.dataset.conversation=conversation.id;button.disabled=requesting;const title=document.createElement('strong'),detail=document.createElement('small');title.textContent=conversation.title;detail.textContent=`${new Date(conversation.updated_at*1000).toLocaleDateString('pt-BR')} · ${conversation.messages} ${conversation.messages===1?'mensagem':'mensagens'}${conversation.pending?' · Respondendo…':''}`;button.append(title,detail);button.addEventListener('click',()=>openConversation(conversation));list.append(button);}
 if(!conversations.length){const empty=document.createElement('p');empty.className='history-empty';empty.textContent=authenticated?'Nenhuma conversa ainda. Comece uma nova.':'Entre para acessar suas conversas.';list.append(empty);}
}
async function loadConversations(){const data=await api('conversations');if(disposed)return;conversations=data.conversations||[];renderConversations();}
function selectConversation(id=null,title=''){
 conversationRevision++;conversationId=id;conversationTitle=title;jobs=[];setPreviewCollapsed(false);retryMessage=null;loadedEarlier=false;hasEarlier=false;clearTimeout(pollTimer);typing.finishAll();awaitingAnswers.clear();historyEntries.clear();historyDays.clear();expandedMessages.clear();lastSpoken='';speechPending=false;showQuestion('');$('home-speech').hidden=true;$('home-input').value='';$('home-input').style.height='auto';$('history-earlier').hidden=true;renderHistory();layoutComposer();
}
function setHistoryView(view){historyView=view;$('home-sessions').hidden=view!=='sessions';$('history-thread').hidden=view!=='thread';$('history-title').textContent=view==='sessions'?'Conversas':conversationTitle||'Nova conversa';$('history-title').title=$('history-title').textContent;$('history-subtitle').textContent=view==='sessions'?'Seu histórico com Sato Agent':'Sato Agent';$('history-close').setAttribute('aria-label',view==='thread'?'Voltar às conversas':'Fechar histórico');$('history-bottom').hidden=view!=='thread';historyScroll();}
async function openConversation(conversation){if(requesting)return;if(conversation.id!==conversationId)selectConversation(conversation.id,conversation.title);setHistoryView('thread');renderHistory();status('Carregando conversa…');await refresh();}
function newConversation(){if(requesting)return;selectConversation();historyOpen(false);status('Nova conversa.');schedulePoll();$('home-input').focus({preventScroll:true});}
function historyScroll(){const log=$('home-messages');$('history-bottom').hidden=historyView!=='thread'||log.scrollHeight-log.scrollTop-log.clientHeight<120;}
function historyOpen(open,role){clearTimeout(previewTimer);previewTimer=null;$('home-history').hidden=!open;typing.finishAll();$('home').dataset.history=String(open);$('home-history-toggle').setAttribute('aria-expanded',String(open));$('home-history-toggle').setAttribute('aria-label',open?'Fechar histórico da conversa':'Abrir histórico da conversa');setHistoryView(role?'thread':'sessions');layoutComposer();if(open){if(role&&jobs.length)expandedMessages.add(`${jobs.at(-1).id}:${role}`);if(!role&&authenticated)loadConversations().catch(error=>status(error.message,true));renderHistory();const target=role?$('home-messages').querySelector('.history-turn:last-child .history-'+role):null;if(target)target.scrollIntoView({block:'start'});else $('home-messages').scrollTop=$('home-messages').scrollHeight;$('history-close').focus({preventScroll:true});historyScroll();}else{$('home-history-toggle').focus({preventScroll:true});setPreviewCollapsed(false);schedulePreviewCollapse();}}
speechMore.addEventListener('click',()=>historyOpen(true,'answer'));$('question-more').addEventListener('click',()=>historyOpen(true,'question'));
$('home-messages').addEventListener('scroll',historyScroll);$('history-bottom').addEventListener('click',()=>{$('home-messages').scrollTo({top:$('home-messages').scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
$('home-history-toggle').addEventListener('click',()=>historyOpen($('home-history').hidden));$('history-close').addEventListener('click',()=>{if(historyView==='thread'){typing.finishAll();setHistoryView('sessions');loadConversations().catch(error=>status(error.message,true));}else historyOpen(false);});$('history-new').addEventListener('click',newConversation);document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('home-history').hidden)historyOpen(false);});
$('history-earlier').addEventListener('click',async()=>{const revision=conversationRevision,id=conversationId,button=$('history-earlier');button.disabled=true;try{const data=await api(`history?robot_id=${encodeURIComponent(ROBOT)}&conversation_id=${id}&before=${jobs[0].id}`);if(revision!==conversationRevision)return;mergeJobs(data.jobs||[]);loadedEarlier=true;hasEarlier=!!data.has_more;button.hidden=!hasEarlier;renderHistory();}catch(error){status(error.message,true);}finally{button.disabled=false;}});
$('home-input').addEventListener('input',()=>{$('home-input').style.height='auto';$('home-input').style.height=`${Math.min(144,$('home-input').scrollHeight)}px`;});
$('home-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('home-form').requestSubmit();}});
$('home-form').addEventListener('submit',async event=>{
 event.preventDefault();const question=$('home-input').value.trim();if(!question||!authenticated||requesting||navigating)return;
 requesting=true;inputState();clearTimeout(pollTimer);
 conversationId ||=crypto.randomUUID().replaceAll('-','');const title=question.replace(/\s+/g,' ');conversationTitle ||=title.length<=90?title:title.slice(0,87).trimEnd()+'…';
 const message=retryMessage?.question===question&&retryMessage.conversation_id===conversationId?retryMessage:{request_id:crypto.randomUUID().replaceAll('-',''),conversation_id:conversationId,robot_id:ROBOT,question};retryMessage=message;
 const optimistic={id:message.request_id,conversation_id:conversationId,robot_id:ROBOT,question,status:'queued',created_at:Date.now()/1000};mergeJobs([optimistic]);awaitingAnswers.add(optimistic.id);showLatest();
 // The input and its balloon change in the same task, before network latency.
 $('home-input').value='';$('home-input').style.height='auto';layoutComposer();status('Enviando sua mensagem…');setHistoryView(historyView);
 try{
  const result=await api('jobs',{method:'POST',headers:{'X-Chat-CSRF':csrf},body:JSON.stringify(message)});
  jobs=jobs.filter(job=>job.id!==optimistic.id);mergeJobs([result.job||{...optimistic,id:result.id,status:result.status}]);retryMessage=null;showLatest();loadConversations().catch(()=>{});
 }catch(error){
  // A lost POST response can still have saved the message. Reconcile by its
  // client-generated ID before offering a retry with that same ID.
  let saved;try{saved=await api(`jobs/${message.request_id}`);}catch{}
  if(saved){mergeJobs([saved]);retryMessage=null;showLatest();}
  else{jobs=jobs.filter(job=>job.id!==optimistic.id);awaitingAnswers.delete(optimistic.id);typing.finishAll();lastSpoken='';speechPending=false;showLatest();$('home-input').value=question;$('home-input').dispatchEvent(new Event('input'));status(error.message,true);if(error.status===401||error.status===403){setSession({available,authenticated:false});status('Entre novamente para enviar sua mensagem.',true);}}
 }
 finally{requesting=false;inputState();schedulePoll();if(authenticated)$('home-input').focus({preventScroll:true});}
});
$('home-login').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('home-login').querySelector('button');button.disabled=true;
 try{setSession(await api('login',{method:'POST',body:JSON.stringify({password:$('home-password').value})}));$('home-password').value='';if(authenticated){await loadConversations();schedulePoll();$('home-input').focus({preventScroll:true});}}
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
new ResizeObserver(layoutComposer).observe($('home-chat'));new ResizeObserver(()=>{measurePreviews();placeSpeech();}).observe($('home-speech'));window.visualViewport?.addEventListener('resize',layoutViewport);window.visualViewport?.addEventListener('scroll',layoutViewport);window.addEventListener('resize',()=>{layoutViewport();typing.finishAll();if(lastSpoken&&!speechPending)typing.set(bubble.body,fitChatPreview(bubble.body,answerPreview(lastSpoken)));renderHistory();measurePreviews();});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authenticated)refresh();});layoutViewport();
function progress(value,text){$('home-progress').value=value;$('home-loading-stage').textContent=text;}
async function start(){
 const chatReady=initializeChat();
 try{await document.fonts.load('700 16px Nunito');progress(20,'Carregando robô…');scene=await createCompanionScene($('home-scene'),{onProgress:progress,onFrame(value){pose=value;placeSpeech();},onScenario:kind=>audio.setScenario(kind)});
  let saved;try{saved=localStorage.getItem('sato-home-scenario');}catch{}if(['lab','forest'].includes(saved)){progress(85,'Preparando cenário…');document.querySelector(`[name="home-scenario"][value="${saved}"]`).checked=true;await changeScenario(saved,{immediate:true});}
 }
 catch(error){console.warn('Companion scene unavailable',error);$('home-fallback').hidden=false;}
 if(disposed)return;progress(100,'Pronto!');$('home-chat').hidden=false;layoutComposer();
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));$('home-loading').hidden=true;$('home').dataset.sceneReady='true';
 if(scene){await scene.arrive();if(disposed)return;$('robot-touch').hidden=false;}
 await chatReady;if(disposed)return;document.body.dataset.ready='true';audio.cue('hello');
}
window.addEventListener('pagehide',event=>{if(event.persisted){typing.finishAll();return;}disposed=true;clearTimeout(pollTimer);clearTimeout(navigationTimer);clearTimeout(previewTimer);typing.dispose();scene?.dispose();audio.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted){navigating=false;inputState();layoutViewport();refresh();}});
start();
