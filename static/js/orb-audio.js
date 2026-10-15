// A quiet, locally synthesized sea bed. No audio download or decoding competes
// with WebGL. The AudioContext is created only inside the user's Play gesture.
export function createOrbAmbience({onChange=()=>{}}={}) {
  let context=null,master=null,started=false,muted=false,hidden=false,disposed=false;
  const sources=[],voices=new Set();let noiseBuffer=null,waterBuffer=null,lastContact=-1;
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
    noiseBuffer=buffer;
    let seed=9241,b0=0,b1=0,b2=0;
    for(let i=0;i<data.length;i++) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/2147483648-1;
      b0=.99765*b0+white*.099046;b1=.963*b1+white*.2965164;b2=.57*b2+white*1.0526913;
      data[i]=(b0+b1+b2+white*.1848)*.08;
    }
    waterBuffer=context.createBuffer(1,22050*2,22050);
    const splashData=waterBuffer.getChannelData(0);let lowWater=0;
    for(let i=0;i<splashData.length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/2147483648-1;
      lowWater+=.14*(white-lowWater);splashData[i]=white*.34+lowWater*.8;
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
    playContact({type,surface,impact=1,double=false,waterDepth=0}) {
      if(!context||!started||disposed||muted||hidden)return;
      const now=context.currentTime;if(type==='step'&&now-lastContact<.075)return;lastContact=now;
      // Wet contact wins over the ground material. Splash wash and falling
      // bubble chirps have their own envelopes, not the dry footstep patch.
      if(surface==='water'||waterDepth>.008){
        const immersion=Math.min(1,waterDepth/.27),landing=type==='land',jumping=type==='jump';
        const duration=landing?.52:jumping?.38:.28,volume=(.48+immersion*.24)*(landing?Math.min(1.7,.9+impact*.25):jumping?1.15:1);
        const gain=context.createGain(),filter=context.createBiquadFilter(),noise=context.createBufferSource(),nodes=[];
        gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(volume,now+.018);gain.gain.exponentialRampToValueAtTime(volume*.28,now+duration*.48);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
        filter.type='lowpass';filter.Q.value=.8;filter.frequency.setValueAtTime(landing?5800:4200,now);filter.frequency.exponentialRampToValueAtTime(650,now+duration);
        noise.buffer=waterBuffer;noise.connect(filter).connect(gain).connect(master);
        for(let i=0;i<(landing?4:3);i++){
          const bubble=context.createOscillator(),envelope=context.createGain(),start=now+.025+i*.047,end=start+.09;
          bubble.type='sine';bubble.frequency.setValueAtTime(620+i*170+(jumping?180:0),start);bubble.frequency.exponentialRampToValueAtTime(150+i*35,end);
          envelope.gain.setValueAtTime(.0001,start);envelope.gain.exponentialRampToValueAtTime(.045+immersion*.025,start+.009);envelope.gain.exponentialRampToValueAtTime(.0001,end);
          bubble.connect(envelope).connect(master);bubble.start(start);bubble.stop(end+.01);nodes.push(bubble,envelope);
        }
        const voice={stop(){try{noise.stop();}catch{}for(const node of nodes){try{node.stop?.();}catch{}node.disconnect();}noise.disconnect();filter.disconnect();gain.disconnect();voices.delete(voice);}};
        if(voices.size>=10)voices.values().next().value.stop();voices.add(voice);noise.onended=()=>voice.stop();noise.start(now,(now*.37)%1,duration);return;
      }
      const settings={grass:[.075,1700,.17],sand:[.11,2400,.22],rock:[.055,3600,.14],water:[.19,1900,.34]}[surface]??[.08,1500,.15];
      const duration=type==='step'?settings[0]:type==='jump'?.14:settings[0]*1.8;
      const gain=context.createGain(),filter=context.createBiquadFilter(),noise=context.createBufferSource(),tone=context.createOscillator();
      const volume=settings[2]*(type==='land'?Math.min(1.8,.8+impact*.3):type==='jump'?.8:1);
      gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(volume,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
      filter.type='lowpass';filter.frequency.setValueAtTime(settings[1],now);filter.frequency.exponentialRampToValueAtTime(surface==='water'?450:800,now+duration);filter.Q.value=surface==='rock'?1.2:.5;
      noise.buffer=noiseBuffer;noise.playbackRate.value=surface==='sand'?.85:surface==='water'?.7:1.1;
      noise.connect(filter).connect(gain).connect(master);
      const toneGain=context.createGain();toneGain.gain.setValueAtTime(type==='step'?.025:.045,now);toneGain.gain.exponentialRampToValueAtTime(.0001,now+duration);
      tone.type='sine';tone.frequency.setValueAtTime(type==='jump'?(double?330:220):surface==='rock'?330:surface==='water'?130:95,now);
      tone.frequency.exponentialRampToValueAtTime(type==='jump'?440:50,now+duration);tone.connect(toneGain).connect(master);
      const voice={stop(){try{noise.stop();tone.stop();}catch {}gain.disconnect();filter.disconnect();toneGain.disconnect();noise.disconnect();tone.disconnect();voices.delete(voice);}};
      if(voices.size>=10)voices.values().next().value.stop();voices.add(voice);noise.onended=()=>voice.stop();
      noise.start(now,(now*1.73)%20,duration);tone.start(now);tone.stop(now+duration+.01);
    },
    setHidden(value) {
      hidden=value;if(!context||disposed)return;
      if(hidden){master.gain.cancelScheduledValues(context.currentTime);master.gain.setValueAtTime(0,context.currentTime);context.suspend().catch(()=>{});}
      else if(started)context.resume().then(fade).catch(()=>{});
    },
    dispose() {
      if(disposed)return;disposed=true;
      for(const source of sources){try{source.stop();source.disconnect();}catch {}}
      for(const voice of [...voices])voice.stop();
      master?.disconnect();context?.close().catch(()=>{});notify();
    },
    get muted(){return muted;},
  };
}
