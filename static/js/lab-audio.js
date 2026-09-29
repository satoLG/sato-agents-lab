// Small local samples selected from sourcesounds/portal2; decoded once on opt-in.
const FILES={click:'click',node:'node',chat:'chat',answer:'answer',error:'error',door:'door',arrival:'arrival',drop:'drop',pickup:'pickup',hum:'hum',walk1:'walk1',walk2:'walk2',walk3:'walk3',walk4:'walk4'};
const VOLUME={click:.2,node:.16,chat:.16,answer:.14,error:.15,door:.12,arrival:.1,drop:.15,pickup:.09,walk:.15};
export function createLabAudio(){
 let ctx,master,room,nature,enabled=false,loading,walk=0;const buffers=new Map(),last=new Map(),listener={x:0,z:46};let interior=0;
 function init(){const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return false;ctx=new Context();master=ctx.createGain();master.gain.value=.55;master.connect(ctx.destination);room=ctx.createGain();room.gain.value=0;room.connect(master);nature=ctx.createGain();nature.gain.value=.15;nature.connect(master);
  const noise=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate),data=noise.getChannelData(0);let n=0;for(let i=0;i<data.length;i++){n=(n+(Math.random()*2-1)*.02)/1.02;data[i]=n;}const wind=ctx.createBufferSource();wind.buffer=noise;wind.loop=true;wind.connect(nature);wind.start();
  loading=Promise.allSettled(Object.entries(FILES).map(async([key,file])=>{const r=await fetch(new URL(`../audio/portal2/${file}.wav`,import.meta.url));if(!r.ok)return;buffers.set(key,await ctx.decodeAudioData(await r.arrayBuffer()));})).then(()=>{if(buffers.has('hum')){const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffers.get('hum');source.loop=true;gain.gain.value=.045;source.connect(gain).connect(room);source.start();}});return true;
 }
 async function toggle(){if(!ctx&&!init())return false;enabled=!enabled;if(enabled){await ctx.resume();await loading;cue('click');}else await ctx.suspend();return enabled;}
 function cue(kind,position){if(!enabled||!ctx||document.hidden)return;const t=ctx.currentTime,interval=kind==='walk'?.26:kind==='drop'?.25:.13;if(t-(last.get(kind)??-10)<interval)return;last.set(kind,t);const key=kind==='walk'?`walk${++walk%4+1}`:kind,buffer=buffers.get(key);if(!buffer)return;
  const distance=position?Math.hypot(listener.x-position.x,listener.z-position.z):0;if(distance>23)return;const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.playbackRate.value=kind==='walk'?.96+Math.random()*.08:1;gain.gain.value=(VOLUME[kind]??.12)/(1+distance*.15);source.connect(gain).connect(master);source.start();source.onended=()=>{source.disconnect();gain.disconnect();};
 }
 document.addEventListener('visibilitychange',()=>{if(ctx){if(document.hidden)ctx.suspend();else if(enabled)ctx.resume();}});
 return {toggle,cue,get enabled(){return enabled;},setListener(x,z){listener.x=x;listener.z=z;},tick(inside,light=1){interior=inside;if(!ctx||!enabled)return;const t=ctx.currentTime;nature.gain.setTargetAtTime((1-interior)*.15,t,.5);room.gain.setTargetAtTime(interior*(.35+light*.65),t,.7);}};
}
