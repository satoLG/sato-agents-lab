import Typewriter from '../vendor/typewriter.module.js';

// The official library owns timing. Its text-node callback keeps model output
// literal, including HTML, backticks, emoji and Typed-style pause sequences.
export function createChatTypewriter(audio,onLayout=()=>{}){
 const active=new Map(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function finish(body){const entry=active.get(body);if(!entry)return;entry.writer.stop();body.textContent=entry.text;delete body.dataset.typing;active.delete(body);if(!active.size)audio.stopTyping();onLayout();}
 function set(body,text,{animate=false}={}){
  if(active.get(body)?.text===text)return;
  if(!active.has(body)&&body.textContent===text)return;
  finish(body);if(!animate||reduced.matches||document.hidden||!text){body.textContent=text;return;}
  const chars=Array.from(text);let index=0;
  body.replaceChildren();body.dataset.typing='true';
  const writer=new Typewriter(body,{delay:10,loop:false,cursor:'',skipAddStyles:true,
   onCreateTextNode:()=>{onLayout();return document.createTextNode(chars[index++]||'');}});
  active.set(body,{writer,text});audio.startTyping();
  writer.typeString('x'.repeat(chars.length)).callFunction(()=>finish(body)).start();
 }
 const visibility=()=>{if(document.hidden)for(const body of [...active.keys()])finish(body);};
 const motion=()=>{if(reduced.matches)for(const body of [...active.keys()])finish(body);};
 document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',motion);
 return {set,finish,finishAll(){for(const body of [...active.keys()])finish(body);},dispose(){this.finishAll();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',motion);}};
}
