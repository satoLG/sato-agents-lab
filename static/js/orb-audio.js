// A quiet, locally synthesized sea bed. No audio download or decoding competes
// with WebGL. The AudioContext is created only inside the user's Play gesture.
export function createOrbAmbience({onChange=()=>{}}={}) {
  let context=null,master=null,started=false,muted=false,hidden=false,disposed=false;
  const sources=[];
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
    start() {
      if(disposed)return Promise.resolve(false);
      try {
        if(!context&&!build())return Promise.resolve(false);
        started=true;hidden=Boolean(globalThis.document?.hidden);
        // Call resume synchronously from Play for mobile autoplay rules.
        const ready=context.resume();fade();notify();
        return ready.then(()=>true).catch(()=>{muted=true;fade();notify();return false;});
      } catch {this.dispose();return Promise.resolve(false);}
    },
    toggleMuted() {
      if(!started||disposed)return;
      muted=!muted;
      if(!muted&&!hidden)context.resume().catch(()=>{});
      fade();notify();
    },
    setHidden(value) {
      hidden=value;if(!context||disposed)return;
      if(hidden){master.gain.cancelScheduledValues(context.currentTime);master.gain.setValueAtTime(0,context.currentTime);context.suspend().catch(()=>{});}
      else if(started)context.resume().then(fade).catch(()=>{});
    },
    dispose() {
      if(disposed)return;disposed=true;
      for(const source of sources){try{source.stop();source.disconnect();}catch {}}
      master?.disconnect();context?.close().catch(()=>{});notify();
    },
    get muted(){return muted;},
  };
}
