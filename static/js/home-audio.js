// Short synthesized robot syllables keep the entry scene self-contained.
// Autoplay is attempted once, then retried on a gesture if the browser blocks it.
export function createCompanionAudio(onState){
 let context,enabled=true,pending=null,sequence=0;
 function init(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;try{context ||=new Audio();return true;}catch{return false;}}
 function play(kind){
  if(!context||context.state!=='running'||!enabled||document.hidden)return false;
  const now=context.currentTime,index=sequence++,notes=kind==='dance'?[660,880,740,990]:kind==='boop'?[960,540,820]:kind==='shy'?[490,610]:[540,810,680,1040];
  notes.forEach((frequency,i)=>{const at=now+i*.11,tone=context.createOscillator(),mod=context.createOscillator(),modGain=context.createGain(),volume=context.createGain();tone.type='triangle';tone.frequency.setValueAtTime(frequency+(index%3)*35,at);tone.frequency.exponentialRampToValueAtTime(frequency*.72,at+.095);mod.type='sine';mod.frequency.value=28;modGain.gain.value=42;mod.connect(modGain).connect(tone.frequency);volume.gain.setValueAtTime(0,at);volume.gain.linearRampToValueAtTime(.045,at+.008);volume.gain.exponentialRampToValueAtTime(.0001,at+.1);tone.connect(volume).connect(context.destination);tone.onended=()=>{tone.disconnect();mod.disconnect();modGain.disconnect();volume.disconnect();};tone.start(at);mod.start(at);tone.stop(at+.11);mod.stop(at+.11);});return true;
 }
 function resume(){
  if(!enabled||!init())return;context.resume().then(()=>{onState?.(enabled&&context.state==='running');if(pending&&play(pending))pending=null;}).catch(()=>onState?.(false));
 }
 function gesture(){if(pending&&enabled)resume();}
 document.addEventListener('pointerdown',gesture);document.addEventListener('keydown',gesture);
 function visibility(){if(!context)return;if(document.hidden)context.suspend();else if(enabled)resume();}
 document.addEventListener('visibilitychange',visibility);
 return {cue(kind='hello'){if(!enabled)return;if(!play(kind)){pending=kind;resume();}},toggle(){enabled=!(enabled&&context?.state==='running');if(enabled){pending='hello';resume();}else{pending=null;context?.suspend();onState?.(false);}return enabled;},get enabled(){return enabled;},dispose(){document.removeEventListener('pointerdown',gesture);document.removeEventListener('keydown',gesture);document.removeEventListener('visibilitychange',visibility);context?.close();}};
}
