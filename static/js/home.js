import {createCompanionScene} from './home-scene.js';
import {createCompanionAudio} from './home-audio.js';
import {createSpeechBubble} from './lab-dialogue.js';

const $=id=>document.getElementById(id),API='/api/lab/hermes-chat',ROBOT='guide:hermes';
const bubble=createSpeechBubble();$('home-speech').append(bubble.el);
let scene,pose,csrf=null,authenticated=false,available=false,jobs=[],pollTimer,requesting=false,refreshing=false,navigating=false,disposed=false,welcomeUntil=0,lastSpoken='',reactionIndex=0;
const audio=createCompanionAudio(active=>{$('home-sound').setAttribute('aria-pressed',String(active));$('home-sound').setAttribute('aria-label',active?'Silenciar robô':'Ativar som do robô');});

function status(text,error=false){$('home-chat-status').textContent=text;$('home-chat-status').dataset.error=String(error);}
function inputState(){const canSend=authenticated&&!requesting&&!navigating;$('home-input').disabled=!canSend;$('home-send').disabled=!canSend;}
function layoutViewport(){
 const viewport=window.visualViewport;document.documentElement.style.setProperty('--viewport-height',`${viewport?.height||innerHeight}px`);document.documentElement.style.setProperty('--viewport-top',`${viewport?.offsetTop||0}px`);layoutComposer();
}
function layoutComposer(){const chat=$('home-chat');if(chat.hidden)return;document.documentElement.style.setProperty('--composer-height',`${chat.offsetHeight+parseFloat(getComputedStyle(chat).bottom)}px`);placeSpeech();}
function placeSpeech(){
 if(!pose)return;
 const {head,body} = pose,root=$('home').getBoundingClientRect(),touch=$('robot-touch');
 touch.style.left=`${body.left}px`;touch.style.top=`${body.top}px`;touch.style.width=`${body.right-body.left}px`;touch.style.height=`${body.bottom-body.top}px`;
 const speech=$('home-speech'),navBottom=document.querySelector('.home-header').getBoundingClientRect().bottom-root.top+16;
 const chatTop=$('home-chat').hidden?root.height:$('home-chat').getBoundingClientRect().top-root.top;
 const top=Math.max(navBottom,Math.min(head.y-speech.offsetHeight-27,chatTop-speech.offsetHeight-20));
 speech.style.left=`${Math.max(speech.offsetWidth/2+15,Math.min(root.width-speech.offsetWidth/2-15,head.x))}px`;speech.style.top=`${top}px`;
}
function say(text,{reaction,sound=true}={}){
 if(disposed||!text)return;lastSpoken=text;bubble.setText(text,'SATO AGENT / HERMES');$('home-speech').hidden=false;placeSpeech();scene?.speak(Math.min(6,Math.max(2,text.length/35)));if(reaction)scene?.react(reaction);if(sound)audio.cue(reaction||'hello');
}
async function api(path,options={}){
 try{
  const response=await fetch(`${API}/${path}`,{...options,credentials:'same-origin',signal:AbortSignal.timeout(12000),headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  const data=await response.json();if(!response.ok){const error=new Error(data.error||'Não consegui conversar com Hermes agora.');error.status=response.status;throw error;}return data;
 }catch(error){if(error.status)throw error;throw new Error('Não consegui conectar ao Hermes. Tente novamente.');}
}
function setSession(data){
 available=!!data.available;authenticated=!!data.authenticated;csrf=data.csrf;
 $('home-login').hidden=!available||authenticated;$('home-form').hidden=available&&!authenticated;inputState();
 if(!available)status('Hermes ainda não está disponível para conversar.',true);
 else if(!authenticated)status('Use o acesso do chat para começar.');
 else status('Pergunte, descubra, converse.');
 layoutComposer();
}
function showQuestion(question){$('last-question').hidden=!question;$('last-question-text').textContent=question||'';layoutComposer();}
function historyEntry(job){
 const entry=document.createElement('article');entry.className='history-turn';entry.dataset.job=job.id;
 const question=document.createElement('div');question.className='history-question';const qName=document.createElement('h3'),qText=document.createElement('p');qName.textContent='VOCÊ';qText.textContent=job.question;question.append(qName,qText);
 const answer=document.createElement('div');answer.className='history-answer';const aName=document.createElement('h3'),aText=document.createElement('p');aName.textContent='HERMES';aText.textContent=job.answer||job.error||(job.status==='failed'?'Não consegui responder. Tente novamente.':'Preparando a resposta…');if(!job.answer)aText.className='history-pending';answer.append(aName,aText);entry.append(question,answer);return entry;
}
let historySignature='';
function renderHistory(){
 const log=$('home-messages'),signature=JSON.stringify(jobs.map(j=>[j.id,j.question,j.status,j.answer,j.error]));if(signature===historySignature)return;historySignature=signature;
 const atEnd=log.scrollHeight-log.scrollTop-log.clientHeight<40;
 log.replaceChildren(...jobs.map(historyEntry));if(!jobs.length){const empty=document.createElement('p');empty.className='history-empty';empty.textContent='Sua conversa aparece aqui.';log.append(empty);}if(atEnd)log.scrollTop=log.scrollHeight;
}
function showLatest(){
 renderHistory();const latest=jobs.at(-1);if(!latest)return;
 showQuestion(latest.question);
 if(latest.status==='done'&&latest.answer){status('Pergunte, descubra, converse.');if(Date.now()>=welcomeUntil&&lastSpoken!==latest.answer&&!navigating)say(latest.answer);}
 else if(latest.status==='failed'){status(latest.error||'Não consegui responder. Tente enviar novamente.',true);}
 else{status('Hermes está preparando a resposta…');if(Date.now()>=welcomeUntil&&lastSpoken!=='Deixa eu pensar…'&&!navigating)say('Deixa eu pensar…',{sound:false});}
}
function schedulePoll(){clearTimeout(pollTimer);if(!disposed&&authenticated)pollTimer=setTimeout(refresh,jobs.some(j=>['queued','running'].includes(j.status))?1800:15000);}
async function refresh(){
 if(disposed||!authenticated||refreshing)return;if(document.hidden){schedulePoll();return;}refreshing=true;
 try{const data=await api(`history?robot_id=${encodeURIComponent(ROBOT)}`);jobs=data.jobs||[];showLatest();}
 catch(error){if(error.status===401){setSession({available,authenticated:false});status('Entre novamente para continuar.',true);}else status('Reconectando. Suas mensagens continuam salvas.',true);}
 finally{refreshing=false;schedulePoll();}
}
async function initializeChat(){try{setSession(await api('session'));if(authenticated)await refresh();}catch{status('Não consegui conectar ao Hermes. Recarregue para tentar novamente.',true);}}
function historyOpen(open){$('home-history').hidden=!open;$('home-history-toggle').setAttribute('aria-expanded',String(open));if(open)$('home-messages').scrollTop=$('home-messages').scrollHeight;else $('home-history-toggle').focus({preventScroll:true});}
$('home-history-toggle').addEventListener('click',()=>historyOpen($('home-history').hidden));$('history-close').addEventListener('click',()=>historyOpen(false));document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('home-history').hidden)historyOpen(false);});
$('home-input').addEventListener('input',()=>{$('home-input').style.height='auto';$('home-input').style.height=`${Math.min(120,$('home-input').scrollHeight)}px`;});
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
let navigationTimer;
document.querySelectorAll('[data-destination]').forEach(link=>link.addEventListener('click',event=>{
 if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();if(navigating)return;navigating=true;inputState();
 say(link.dataset.destination==='lab'?'Vou te levar ao laboratório. Vem comigo!':'Vou te levar ao dashboard. Vem comigo!',{reaction:'wave'});
 navigationTimer=setTimeout(()=>location.assign(link.href),1400);
}));
new ResizeObserver(layoutComposer).observe($('home-chat'));new ResizeObserver(placeSpeech).observe($('home-speech'));window.visualViewport?.addEventListener('resize',layoutViewport);window.visualViewport?.addEventListener('scroll',layoutViewport);window.addEventListener('resize',layoutViewport);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authenticated)refresh();});layoutViewport();
function progress(value,text){$('home-progress').value=value;$('home-loading-stage').textContent=text;}
async function start(){
 const chatReady=initializeChat();
 try{await document.fonts.load('700 16px Nunito');progress(20,'Preparando seu companheiro…');scene=await createCompanionScene($('home-scene'),{onProgress:progress,onFrame(value){pose=value;placeSpeech();}});$('robot-touch').hidden=false;}
 catch(error){console.warn('Companion scene unavailable',error);$('home-fallback').hidden=false;}
 await chatReady;if(disposed)return;progress(100,'Pronto!');$('home-chat').hidden=false;layoutComposer();
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));$('home-loading').hidden=true;document.body.dataset.ready='true';welcomeUntil=Date.now()+3500;say('Hello, im a Sato Agent',{reaction:'hello'});
 setTimeout(()=>{if(!disposed&&jobs.length)showLatest();},3550);
}
window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;clearTimeout(pollTimer);clearTimeout(navigationTimer);scene?.dispose();audio.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted){navigating=false;inputState();layoutViewport();refresh();say('Que bom ter você de volta!',{reaction:'wave'});}});
start();
