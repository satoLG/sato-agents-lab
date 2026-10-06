// Short synthesized robot syllables keep the entry scene self-contained.
// Autoplay is attempted once, then retried on a gesture if the browser blocks it.
export function createCompanionAudio(onState){
 let context,enabled=true,pending=null,sequence=0,scenario='black',revision=0,disposed=false;
 const buffers=new Map(),loops=new Map(),requests=new AbortController();
 let typingVoice;
 function stopTyping(){if(!typingVoice)return;try{typingVoice.source.stop();}catch{}typingVoice=null;}
 function startTyping(){
  if(typingVoice||!enabled||!context||context.state!=='running'||document.hidden||disposed)return;
  // A short texture of keyboard clicks loops for the visible preview only.
  const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);
  let seed=17;for(let click=0;click<18;click++){const at=Math.floor((click*.109+.008*(click%3))*context.sampleRate);for(let n=0;n<context.sampleRate*.026&&at+n<data.length;n++){seed=(seed*16807)%2147483647;data[at+n]=(seed/2147483647*2-1)*Math.exp(-n/(context.sampleRate*.004));}}
  const source=context.createBufferSource(),gain=context.createGain(),filter=context.createBiquadFilter();source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=3200;gain.gain.value=.055;source.connect(filter).connect(gain).connect(context.destination);typingVoice={source,gain,filter};source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start();
 }
 function stopAmbient(){for(const voice of loops.values())try{voice.source.stop();}catch{}loops.clear();}
 async function ambient(){
  const current=++revision,kind=scenario==='lab'?'hum':scenario==='forest'?'nature':null;
  for(const [key,voice]of loops)if(key!==kind){voice.gain.gain.setTargetAtTime(0,context.currentTime,.18);voice.source.stop(context.currentTime+.8);loops.delete(key);}
  if(!kind||!enabled||!context||context.state!=='running'||document.hidden||disposed)return;
  const path=kind==='hum'?'../audio/amb_machinery_factory_lp_01.ogg':`../audio/portal2/${kind}.wav`;
  if(!buffers.has(kind))buffers.set(kind,(async()=>{const response=await fetch(new URL(path,import.meta.url),{signal:requests.signal});if(!response.ok)throw new Error('Ambient audio unavailable');return context.decodeAudioData(await response.arrayBuffer());})().catch(()=>{buffers.delete(kind);return null;}));
  const buffer=await buffers.get(kind);if(!buffer||current!==revision||!enabled||disposed||document.hidden||context.state!=='running')return;
  if(!loops.has(kind)){
   const source=context.createBufferSource(),gain=context.createGain(),filter=context.createBiquadFilter();source.buffer=buffer;source.loop=true;gain.gain.value=0;filter.type='lowpass';filter.frequency.value=kind==='nature'?1700:20000;filter.Q.value=.4;source.connect(filter).connect(gain).connect(context.destination);
   const voice={source,gain,filter};loops.set(kind,voice);source.onended=()=>{source.disconnect();gain.disconnect();filter.disconnect();if(loops.get(kind)===voice)loops.delete(kind);};source.start();
  }
  loops.get(kind).gain.gain.setTargetAtTime(kind==='hum'?.028:.025,context.currentTime,.35);
 }
 function init(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;try{context ||=new Audio();return true;}catch{return false;}}
 function play(kind){
  if(!context||context.state!=='running'||!enabled||document.hidden)return false;
  const now=context.currentTime,index=sequence++,notes=kind==='dance'?[660,880,740,990]:kind==='boop'?[960,540,820]:kind==='shy'?[490,610]:[540,810,680,1040];
  notes.forEach((frequency,i)=>{const at=now+i*.11,tone=context.createOscillator(),mod=context.createOscillator(),modGain=context.createGain(),volume=context.createGain();tone.type='triangle';tone.frequency.setValueAtTime(frequency+(index%3)*35,at);tone.frequency.exponentialRampToValueAtTime(frequency*.72,at+.095);mod.type='sine';mod.frequency.value=28;modGain.gain.value=42;mod.connect(modGain).connect(tone.frequency);volume.gain.setValueAtTime(0,at);volume.gain.linearRampToValueAtTime(.045,at+.008);volume.gain.exponentialRampToValueAtTime(.0001,at+.1);tone.connect(volume).connect(context.destination);tone.onended=()=>{tone.disconnect();mod.disconnect();modGain.disconnect();volume.disconnect();};tone.start(at);mod.start(at);tone.stop(at+.11);mod.stop(at+.11);});return true;
 }
 function resume(){
  if(!enabled||disposed||!init())return;context.resume().then(()=>{if(disposed)return;onState?.(enabled&&context.state==='running');if(pending&&play(pending))pending=null;ambient();}).catch(()=>onState?.(false));
 }
 function gesture(){if(pending&&enabled)resume();}
 document.addEventListener('pointerdown',gesture);document.addEventListener('keydown',gesture);
 function visibility(){if(!context)return;if(document.hidden){revision++;stopAmbient();stopTyping();context.suspend();}else if(enabled)resume();}
 document.addEventListener('visibilitychange',visibility);
 return {startTyping,stopTyping,cue(kind='hello'){if(!enabled||disposed)return;if(!play(kind)){pending=kind;resume();}},setScenario(kind){scenario=kind;ambient();},toggle(){enabled=!(enabled&&context?.state==='running');if(enabled){pending='hello';resume();}else{pending=null;revision++;stopAmbient();stopTyping();context?.suspend();onState?.(false);}return enabled;},get enabled(){return enabled;},dispose(){disposed=true;revision++;requests.abort();stopAmbient();stopTyping();document.removeEventListener('pointerdown',gesture);document.removeEventListener('keydown',gesture);document.removeEventListener('visibilitychange',visibility);context?.close();}};
}
