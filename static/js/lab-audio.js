// Local Portal 2 samples, with per-source attenuation and short voice budgets.
const FILES=['machineFan','machineMotor','stream','robotBlink','click','node','chat','answer','error','door','arrival','drop','pickup','walk1','walk2','walk3','walk4'];
const VARIANTS={walk:4,run:4,land:2,robotStep:3,robotServo:2,jump:2,punch:2,typing:2,computer:2,equipment:2,energy:2,robotVoice:3};
for(const [kind,count] of Object.entries(VARIANTS))for(let i=1;i<=count;i++)if(!FILES.includes(`${kind}${i}`))FILES.push(`${kind}${i}`);
const VOLUME={click:.16,node:.12,chat:.12,answer:.10,error:.12,door:.10,arrival:.06,drop:.10,pickup:.07,walk:.13,run:.18,jump:.10,land:.17,punch:.12,robotStep:.07,robotServo:.035,typing:.07,computer:.035,equipment:.055,energy:.045,robotVoice:.18,robotBlink:.035};
const RANGE={robotStep:7,robotServo:6,typing:6,computer:7,equipment:10,energy:11,robotVoice:8,robotBlink:3,drop:8,pickup:8,door:12};
export const AUDIO_FILES=Object.freeze([...FILES]);
export function distanceGain(distance,range=12){const t=Math.max(0,1-distance/range);return t*t;}
export function spatialMix(listener,position,range=12){
  if(!position)return {gain:1,pan:0};
  const dx=position.x-listener.x,dz=position.z-listener.z,distance=Math.hypot(dx,dz);
  return {gain:distanceGain(distance,range),pan:Math.max(-1,Math.min(1,(dx*Math.cos(listener.yaw||0)-dz*Math.sin(listener.yaw||0))/Math.max(2,distance)))};
}
export function createLabAudio(){
  let ctx,master,enabled=false,loading;const variants=new Map();const buffers=new Map(),last=new Map(),voices=new Set(),loops=new Map(),listener={x:0,z:46,yaw:0};
  function init(){
    const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return false;
    ctx=new Context();master=ctx.createGain();master.gain.value=.55;master.connect(ctx.destination);
    loading=Promise.allSettled(FILES.map(async key=>{const r=await fetch(new URL(`../audio/portal2/${key}.wav`,import.meta.url));if(r.ok)buffers.set(key,await ctx.decodeAudioData(await r.arrayBuffer()));}));return true;
  }
  async function toggle(){if(!ctx&&!init())return false;enabled=!enabled;if(enabled){last.clear();await ctx.resume();await loading;cue('click');}else {silence();await ctx.suspend();}return enabled;}
  function cue(kind,position,id=kind){
    if(!enabled||!ctx||document.hidden||voices.size>=12)return false;
    if(position&&[...voices].filter(v=>v.position).length>=6)return false;
    const range=RANGE[kind]??12,mix=spatialMix(listener,position,range);if(mix.gain<=.002)return false;
    const t=ctx.currentTime,interval={walk:.20,run:.13,robotStep:.14,robotServo:.8,typing:.18,computer:3.5,equipment:3.1,energy:3.7,robotVoice:.6,robotBlink:1,punch:.23}[kind]??.12;
    if(t-(last.get(id)??-10)<interval)return false;
    const index=(variants.get(kind)??0)% (VARIANTS[kind]??1)+1;
    const key=VARIANTS[kind]?`${kind}${index}`:kind,buffer=buffers.get(key);if(!buffer)return false;variants.set(kind,index);
    // Only audible sources occupy a voice or advance the cooldown.
    last.set(id,t);const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();source.buffer=buffer;
    source.playbackRate.value=kind==='robotVoice'?.85+(hash(id)%7)*.055:1+(Math.random()-.5)*.06;
    const volume=VOLUME[kind]??.1;gain.gain.value=volume*mix.gain;pan.pan.value=mix.pan;source.connect(gain).connect(pan).connect(master);
    const voice={source,gain,pan,volume,range,position:position?{x:position.x,z:position.z}:null};voices.add(voice);
    source.onended=()=>{voices.delete(voice);source.disconnect();gain.disconnect();pan.disconnect();};source.start();if(kind==='robotVoice'||kind==='robotServo')chirp(kind,position,id);return true;
  }
  function hash(id){return [...String(id)].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);}
  function chirp(kind,position,id){
    if(voices.size>=12)return;
    const mix=spatialMix(listener,position,6);if(mix.gain<.01)return;
    const source=ctx.createOscillator(),gain=ctx.createGain(),pan=ctx.createStereoPanner(),time=ctx.currentTime;
    const voice={source,gain,pan,volume:0,range:6,position:null};
    source.type='sine';const base=kind==='robotVoice'?430+(hash(id)%5)*65:115;
    source.frequency.setValueAtTime(base,time);source.frequency.exponentialRampToValueAtTime(base*1.4,time+.07);source.frequency.exponentialRampToValueAtTime(base*.8,time+.18);
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(.015*mix.gain,time+.012);gain.gain.exponentialRampToValueAtTime(.0001,time+.22);pan.pan.value=mix.pan;
    source.connect(gain).connect(pan).connect(master);voices.add(voice);source.onended=()=>{voices.delete(voice);source.disconnect();gain.disconnect();pan.disconnect();};source.start(time);source.stop(time+.24);
  }
  function silence(){
    for(const v of [...voices,...loops.values()])try{v.source.stop();}catch{}
    loops.clear();
  }
  function ambient(sources,active=true){
    if(!ctx||!enabled||document.hidden||!active){for(const v of loops.values())v.source.stop();loops.clear();return;}
    const nearest=sources.map(s=>({...s,mix:spatialMix(listener,s.position,s.range||10)})).filter(s=>s.mix.gain>.008).sort((a,b)=>b.mix.gain-a.mix.gain).slice(0,4),keep=new Set();
    for(const s of nearest){
      const buffer=buffers.get(s.kind);if(!buffer)continue;keep.add(s.id);let v=loops.get(s.id);
      if(!v){const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();source.buffer=buffer;source.loop=true;source.playbackRate.value=.96+(hash(s.id)%5)*.02;gain.gain.value=0;source.connect(gain).connect(pan).connect(master);v={source,gain,pan};loops.set(s.id,v);source.onended=()=>{source.disconnect();gain.disconnect();pan.disconnect();};source.start(0,(hash(s.id)%100)/100*buffer.duration);}
      v.gain.gain.setTargetAtTime((s.volume??.045)*s.mix.gain,ctx.currentTime,.25);v.pan.pan.setTargetAtTime(s.mix.pan,ctx.currentTime,.08);
    }
    for(const [id,v]of loops)if(!keep.has(id)){v.gain.gain.setTargetAtTime(0,ctx.currentTime,.05);v.source.stop(ctx.currentTime+.2);loops.delete(id);}
  }
  document.addEventListener('visibilitychange',()=>{if(ctx){if(document.hidden){silence();ctx.suspend();}else if(enabled)ctx.resume();}});
  return {toggle,cue,ambient,get enabled(){return enabled;},setListener(x,z,yaw=0){Object.assign(listener,{x,z,yaw});},tick(){
    if(!ctx||!enabled)return;const t=ctx.currentTime;
    for(const v of voices){if(!v.volume)continue;const mix=spatialMix(listener,v.position,v.range);v.gain.gain.setTargetAtTime(v.volume*mix.gain,t,.035);v.pan.pan.setTargetAtTime(mix.pan,t,.035);}
    for(const [id,time]of last)if(t-time>30)last.delete(id);
  }};
}
