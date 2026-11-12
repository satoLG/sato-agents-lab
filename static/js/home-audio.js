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
 // Crunchy UI foley: short pitched blips for body, and noise transients pushed
 // through a stepped waveshaper for the bit-crushed "crunch" on top.
 let uiOut,crunchIn,noise,pendingUi=null;const uiRecent=new Map();
 function uiGraph(){
  if(uiOut)return;
  const length=Math.floor(context.sampleRate*.4);noise=context.createBuffer(1,length,context.sampleRate);const data=noise.getChannelData(0);let seed=91;for(let i=0;i<length;i++){seed=(seed*16807)%2147483647;data[i]=seed/1073741823.5-1;}
  const shaper=context.createWaveShaper(),curve=new Float32Array(2048);for(let i=0;i<curve.length;i++){const x=i/(curve.length-1)*2-1;curve[i]=Math.round(Math.tanh(x*2.4)*6)/6;}shaper.curve=curve;shaper.oversample='none';
  const crunchGain=context.createGain(),soft=context.createBiquadFilter();crunchGain.gain.value=.45;soft.type='lowpass';soft.frequency.value=7600;
  uiOut=context.createGain();uiOut.gain.value=.1;crunchIn=context.createGain();crunchIn.gain.value=1;
  crunchIn.connect(shaper).connect(soft).connect(crunchGain).connect(uiOut);uiOut.connect(context.destination);
 }
 function blip(at,from,to,length,level,type='sine',crunchy=false){
  const tone=context.createOscillator(),volume=context.createGain();tone.type=type;tone.frequency.setValueAtTime(from,at);tone.frequency.exponentialRampToValueAtTime(to,at+length*.85);
  volume.gain.setValueAtTime(0,at);volume.gain.linearRampToValueAtTime(level,at+.004);volume.gain.exponentialRampToValueAtTime(.0001,at+length);
  tone.connect(volume).connect(crunchy?crunchIn:uiOut);tone.onended=()=>{tone.disconnect();volume.disconnect();};tone.start(at);tone.stop(at+length+.01);
 }
 function grit(at,length,type,frequency,q,level){
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),volume=context.createGain();source.buffer=noise;filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;
  volume.gain.setValueAtTime(level,at);volume.gain.exponentialRampToValueAtTime(.0001,at+length);
  source.connect(filter).connect(volume).connect(crunchIn);source.onended=()=>{source.disconnect();filter.disconnect();volume.disconnect();};source.start(at,Math.random()*.3);source.stop(at+length+.01);
 }
 const recipes={
  pop(at,p){blip(at,380*p,920*p,.09,.9);grit(at,.028,'bandpass',3300*p,1.3,2.4);},
  message(at,p){blip(at,420*p,880*p,.08,.8);blip(at+.075,620*p,1320*p,.1,.7);grit(at,.03,'bandpass',3000*p,1.2,2.2);grit(at+.075,.026,'bandpass',4200*p,1.4,1.8);},
  send(at,p){blip(at,300*p,1050*p,.12,.75);grit(at,.07,'highpass',3600,.7,1.4);grit(at+.08,.025,'bandpass',3800*p,1.4,2);},
  out(at,p){blip(at,760*p,240*p,.11,.55,'triangle');grit(at+.02,.06,'lowpass',2200*p,.8,2.6);},
  click(at,p){grit(at,.02,'bandpass',2300*p,.9,3.2);blip(at,210*p,110*p,.035,.6,'square',true);},
  toggle(at,p){grit(at,.018,'bandpass',2800*p,1,2.8);blip(at+.01,700*p,1050*p,.06,.55);},
  key(at,p){const pitch=p*(.9+Math.random()*.25);grit(at,.012+Math.random()*.01,'bandpass',(2500+Math.random()*1600)*pitch,1.5,3);blip(at,160*pitch,90*pitch,.022,.4,'sine',true);},
 };
 function playUi(kind,pitch,delay){
  const recipe=recipes[kind];if(!recipe)return;uiGraph();
  const at=context.currentTime+.005+delay/1000,recent=uiRecent.get(kind)||[];
  // Sounds scheduled at the same instant (duplicate pops) collapse into one.
  if(recent.some(time=>Math.abs(time-at)<(kind==='key'?.018:.03)))return;
  uiRecent.set(kind,[...recent.filter(time=>time>context.currentTime-.2),at]);recipe(at,pitch);
 }
 function ui(kind,{pitch=1,delay=0}={}){
  if(!enabled||disposed||document.hidden)return;
  if(!context||context.state!=='running'){pendingUi={kind,pitch,delay,at:performance.now()};resume();return;}
  playUi(kind,pitch,delay);
 }
 function init(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;try{context ||=new Audio();return true;}catch{return false;}}
 function play(kind){
  if(!context||context.state!=='running'||!enabled||document.hidden)return false;
  const now=context.currentTime,index=sequence++,notes=kind==='dance'?[660,880,740,990]:kind==='boop'?[960,540,820]:kind==='shy'?[490,610]:[540,810,680,1040];
  notes.forEach((frequency,i)=>{const at=now+i*.11,tone=context.createOscillator(),mod=context.createOscillator(),modGain=context.createGain(),volume=context.createGain();tone.type='triangle';tone.frequency.setValueAtTime(frequency+(index%3)*35,at);tone.frequency.exponentialRampToValueAtTime(frequency*.72,at+.095);mod.type='sine';mod.frequency.value=28;modGain.gain.value=42;mod.connect(modGain).connect(tone.frequency);volume.gain.setValueAtTime(0,at);volume.gain.linearRampToValueAtTime(.045,at+.008);volume.gain.exponentialRampToValueAtTime(.0001,at+.1);tone.connect(volume).connect(context.destination);tone.onended=()=>{tone.disconnect();mod.disconnect();modGain.disconnect();volume.disconnect();};tone.start(at);mod.start(at);tone.stop(at+.11);mod.stop(at+.11);});return true;
 }
 function resume(){
  if(!enabled||disposed||!init())return;context.resume().then(()=>{if(disposed)return;onState?.(enabled&&context.state==='running');if(pending&&play(pending))pending=null;if(pendingUi&&performance.now()-pendingUi.at<300&&context.state==='running')playUi(pendingUi.kind,pendingUi.pitch,0);pendingUi=null;ambient();}).catch(()=>onState?.(false));
 }
 function gesture(){if(pending&&enabled)resume();}
 document.addEventListener('pointerdown',gesture);document.addEventListener('keydown',gesture);
 function visibility(){if(!context)return;if(document.hidden){revision++;stopAmbient();stopTyping();context.suspend();}else if(enabled)resume();}
 document.addEventListener('visibilitychange',visibility);
 return {startTyping,stopTyping,ui,cue(kind='hello'){if(!enabled||disposed)return;if(!play(kind)){pending=kind;resume();}},setScenario(kind){scenario=kind;ambient();},toggle(){enabled=!(enabled&&context?.state==='running');if(enabled){pending='hello';resume();}else{pending=null;revision++;stopAmbient();stopTyping();context?.suspend();onState?.(false);}return enabled;},get enabled(){return enabled;},dispose(){disposed=true;revision++;requests.abort();stopAmbient();stopTyping();document.removeEventListener('pointerdown',gesture);document.removeEventListener('keydown',gesture);document.removeEventListener('visibilitychange',visibility);context?.close();}};
}
