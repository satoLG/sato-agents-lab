// A quiet synthesized sea bed and the owner's JDSherbert footstep recordings.
// Fetch the small clips during loading; create/resume audio only on Play.
export function createOrbAmbience({onChange=()=>{}}={}) {
  let context=null,master=null,started=false,muted=false,hidden=false,disposed=false;
  const sources=[],voices=new Set(),clips=new Map(),indices=new Map(),abort=new AbortController();
  let lastContact=-1,encoded=null,decoded=null;
  const categories=['grass','sand','stone','water','puddle'];
  function prepare(){
    if(!encoded)encoded=Promise.all(categories.flatMap(kind=>[1,2].map(async index=>{
      const name=`${kind}-${index}`,response=await fetch(new URL(`../audio/orb-foley/${name}.mp3`,import.meta.url),{signal:abort.signal});
      if(!response.ok)throw new Error(`Unable to load orb foley: ${name}`);
      return [name,await response.arrayBuffer()];
    }))).catch(error=>{encoded=null;throw error;});
    return encoded;
  }
  function decode(){
    if(!decoded)decoded=prepare().then(files=>Promise.all(files.map(async([name,bytes])=>{
      const buffer=await context.decodeAudioData(bytes.slice(0));if(disposed)return;
      // Trim encoder padding/leading silence, keeping the actual recording.
      const samples=buffer.getChannelData(0);let peak=0;for(const v of samples)peak=Math.max(peak,Math.abs(v));
      let first=0,last=samples.length-1;while(first<last&&Math.abs(samples[first])<peak*.012)first++;while(last>first&&Math.abs(samples[last])<peak*.006)last--;
      clips.set(name,{buffer,offset:Math.max(0,first/buffer.sampleRate-.006),length:Math.min(buffer.duration,(last-first)/buffer.sampleRate+.025),gain:Math.min(2,.65/Math.max(peak,.01))});
    })));
    return decoded;
  }
  function notify(){onChange({muted,available:Boolean(context)&&!disposed});}
  function fade() {
    if(!context||disposed)return;
    const now=context.currentTime,target=muted||hidden?0:1;
    master.gain.cancelScheduledValues(now);master.gain.setValueAtTime(master.gain.value,now);
    master.gain.linearRampToValueAtTime(target,now+(target?1.6:.12));
  }
  function build() {
    const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Audio)return false;
    context=new Audio({latencyHint:'playback'});
    const buffer=context.createBuffer(1,22050*24,22050),data=buffer.getChannelData(0);
    let seed=9241,b0=0,b1=0,b2=0;
    for(let i=0;i<data.length;i++) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/2147483648-1;
      b0=.99765*b0+white*.099046;b1=.963*b1+white*.2965164;b2=.57*b2+white*1.0526913;
      data[i]=(b0+b1+b2+white*.1848)*.08;
    }
    // Blend the loop join rather than repeating a click every 24 seconds.
    const seam=1024,first=data[0];for(let i=0;i<seam;i++){const t=i/(seam-1),end=data.length-seam+i;data[end]=data[end]*(1-t)+first*t;}
    const source=context.createBufferSource();source.buffer=buffer;source.loop=true;
    const high=context.createBiquadFilter();high.type='highpass';high.frequency.value=110;high.Q.value=.5;
    const low=context.createBiquadFilter();low.type='lowpass';low.frequency.value=1700;low.Q.value=.45;
    const wash=context.createGain();wash.gain.value=.075;
    master=context.createGain();master.gain.value=0;
    source.connect(high).connect(low).connect(wash).connect(master).connect(context.destination);
    // Two different, very slow cycles make a soft irregular ebb and wash.
    for(const [frequency,amount] of [[.073,.025],[.117,.012]]) {
      const oscillator=context.createOscillator(),gain=context.createGain();
      oscillator.frequency.value=frequency;gain.gain.value=amount;
      oscillator.connect(gain).connect(wash.gain);oscillator.start();sources.push(oscillator);
    }
    source.start();sources.push(source);return true;
  }
  return {
    prepare,
    start() {
      if(disposed)return Promise.resolve(false);
      try {
        if(!context&&!build())return Promise.resolve(false);
        started=true;hidden=Boolean(globalThis.document?.hidden);
        // Call resume synchronously from Play for mobile autoplay rules.
        const ready=context.resume();fade();notify();
        return Promise.all([ready,decode()]).then(()=>!disposed).catch(()=>{muted=true;fade();notify();return false;});
      } catch {this.dispose();return Promise.resolve(false);}
    },
    toggleMuted() {
      if(!started||disposed)return;
      muted=!muted;
      if(!muted&&!hidden)context.resume().catch(()=>{});
      fade();notify();
    },
    playContact({type,surface,impact=1,waterDepth=0}) {
      if(!context||!started||disposed||muted||hidden)return;
      const now=context.currentTime;if(type==='step'&&now-lastContact<.075)return;lastContact=now;
      const wet=surface==='water'||waterDepth>.008;
      const kind=wet?(waterDepth>.10?'water':'puddle'):surface==='rock'?'stone':surface;
      const index=indices.get(kind)??0;indices.set(kind,index+1);
      const clip=clips.get(`${kind}-${1+index%2}`);if(!clip)return;
      const landing=type==='land',jumping=type==='jump';
      const rate=(landing?.88:jumping?1.12:1)*(1+(index%5-2)*.018);
      const release=jumping?.58:landing?1:wet?.92:.82;
      const duration=Math.min(clip.length/rate*release,wet?.85:.65);
      const base=wet?.68:kind==='grass'?.42:kind==='sand'?.48:.38;
      const volume=base*clip.gain*(landing?Math.min(1.45,.9+impact*.22):jumping?.78:1)*(wet?1+Math.min(.25,waterDepth)*.8:1);
      const gain=context.createGain(),source=context.createBufferSource();source.buffer=clip.buffer;source.playbackRate.value=rate;
      gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.004);
      gain.gain.setValueAtTime(volume,now+Math.max(.005,duration-.07));gain.gain.linearRampToValueAtTime(0,now+duration);
      source.connect(gain).connect(master);
      const voice={stop(){try{source.stop();}catch{}source.disconnect();gain.disconnect();voices.delete(voice);}};
      if(voices.size>=10)voices.values().next().value.stop();voices.add(voice);source.onended=()=>voice.stop();
      source.start(now,clip.offset);source.stop(now+duration);
    },
    setHidden(value) {
      hidden=value;if(!context||disposed)return;
      if(hidden){master.gain.cancelScheduledValues(context.currentTime);master.gain.setValueAtTime(0,context.currentTime);context.suspend().catch(()=>{});}
      else if(started)context.resume().then(fade).catch(()=>{});
    },
    dispose() {
      if(disposed)return;disposed=true;abort.abort();clips.clear();
      for(const source of sources){try{source.stop();source.disconnect();}catch {}}
      for(const voice of [...voices])voice.stop();
      master?.disconnect();context?.close().catch(()=>{});notify();
    },
    get muted(){return muted;},
  };
}
