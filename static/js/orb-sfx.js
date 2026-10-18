// Original Web Audio synthesis, inspired by the reference's rising charge loop
// and percussive buster shot. No third-party recordings are redistributed.
export function createOrbSfx(context,destination){
 const voices=new Set(),nodes=[],loops=[];let dead=false;
 const noise=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=noise.getChannelData(0);let seed=83,last=0;
 for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;last=last*.76+(seed/2147483648-1)*.24;data[i]=last;}
 function loopNoise(frequency){const src=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();src.buffer=noise;src.loop=true;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.65;gain.gain.value=0;src.connect(filter).connect(gain).connect(destination);src.start();loops.push(src);nodes.push(src,filter,gain);return {filter,gain};}
 const water=loopNoise(560),chargeGain=context.createGain();chargeGain.gain.value=0;chargeGain.connect(destination);nodes.push(chargeGain);
 const chargeOsc=[];for(const frequency of [110,221]){const osc=context.createOscillator();osc.type='triangle';osc.frequency.value=frequency;osc.connect(chargeGain);osc.start();loops.push(osc);nodes.push(osc);chargeOsc.push(osc);}
 const waterLfo=context.createOscillator(),waterMod=context.createGain();waterLfo.frequency.value=2.7;waterMod.gain.value=140;waterLfo.connect(waterMod).connect(water.filter.frequency);waterLfo.start();loops.push(waterLfo);nodes.push(waterLfo,waterMod);
 function tone({from,to,duration=.2,volume=.1,type='triangle',noiseVoice=false,delay=0}){
  if(dead)return;const now=context.currentTime+delay,gain=context.createGain(),filter=context.createBiquadFilter(),src=noiseVoice?context.createBufferSource():context.createOscillator();
  if(noiseVoice){src.buffer=noise;filter.type='lowpass';filter.frequency.setValueAtTime(from,now);filter.frequency.exponentialRampToValueAtTime(Math.max(20,to),now+duration);}else{src.type=type;src.frequency.setValueAtTime(from,now);src.frequency.exponentialRampToValueAtTime(to,now+duration);filter.type='lowpass';filter.frequency.value=4500;}
  gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);src.connect(filter).connect(gain).connect(destination);
  const voice={stop(){try{src.stop();}catch{}src.disconnect();filter.disconnect();gain.disconnect();voices.delete(voice);}};if(voices.size>=16)voices.values().next().value.stop();voices.add(voice);src.onended=()=>voice.stop();src.start(now);src.stop(now+duration+.02);
 }
 function handle({type,strength=0,active=false,volume=.7,double=false}){
  if(dead)return;const now=context.currentTime,v=volume;
  if(type==='jump'){tone({from:double?430:230,to:double?1550:980,duration:.19,volume:.16*v,type:'square'});tone({from:120,to:50,duration:.12,volume:.15*v});tone({from:1600,to:500,duration:.13,volume:.12*v,noiseVoice:true});}
  if(type==='dash'){tone({from:1700,to:180,duration:.26,volume:.45*v,noiseVoice:true});tone({from:180,to:50,duration:.18,volume:.18*v});}
  if(type==='dash-impact'){tone({from:700,to:80,duration:.16,volume:.28*v,noiseVoice:true});}
  if(type==='charge-level'){chargeGain.gain.setTargetAtTime(active?( .025+strength*.035)*v:0,now,.05);chargeOsc.forEach((o,i)=>o.frequency.setTargetAtTime((110+strength*430)*(i+1),now,.045));}
  if(type==='charge-stop'||type==='blast')chargeGain.gain.setTargetAtTime(0,now,.018);
  if(type==='charge-ready'){tone({from:880,to:1320,duration:.13,volume:.10*v});tone({from:1320,to:1760,duration:.15,volume:.08*v,delay:.09});}
  if(type==='blast'){tone({from:720+strength*500,to:75,duration:.32,volume:.23*v,type:'sawtooth'});tone({from:3400,to:160,duration:.45,volume:.45*v,noiseVoice:true});tone({from:100,to:38,duration:.24,volume:.24*v});}
  if(type==='water-flow'){water.gain.gain.setTargetAtTime(strength*.5*v,now,.08);water.filter.frequency.setTargetAtTime(330+strength*1200,now,.12);}
 }
 return {handle,dispose(){if(dead)return;dead=true;for(const voice of [...voices])voice.stop();for(const src of loops)try{src.stop();}catch{}for(const node of nodes)node.disconnect();},get voiceCount(){return voices.size;}};
}
