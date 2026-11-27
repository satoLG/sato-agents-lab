import * as T from '../vendor/three.module.min.js';
import {createSceneArt} from './scene-art.js';
import {createCompanionBot,poseCompanion} from './companion-bot.js';

// kanbagent Time page: the home companion robot, one per agent, in the agent's
// shell and LED colours. A single small WebGL renderer draws each bot in turn and
// copies the frame into that bot's <canvas data-bot> elements, so a page with many
// avatars holds one GL context. Runs at 24 fps, only for bots on screen and only
// while the tab is visible; with reduced motion it draws one still frame.
const SIZE=192,FPS=24,STEP=1/FPS;

function stage(){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
 renderer.setPixelRatio(1);renderer.setSize(SIZE,SIZE,false);renderer.setClearColor('#000',0);
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 const scene=new T.Scene();
 scene.add(new T.HemisphereLight('#e3f4ff','#536775',1.9));
 const key=new T.DirectionalLight('#fff3e5',3.2);key.position.set(-3,5,4);scene.add(key);
 const rim=new T.DirectionalLight('#9fd6ff',2.4);rim.position.set(2,3,-4);scene.add(rim);
 const camera=new T.PerspectiveCamera(32,1,.1,20);camera.position.set(0,1.3,3.25);camera.lookAt(0,1.17,0);
 return {renderer,scene,camera,art:createSceneArt()};
}

function addBot(view,shell,led,reduced){
 const rig=createCompanionBot(view.art,{reduced,shell,led});
 rig.root.rotation.y=(Math.random()-.5)*.5;view.scene.add(rig.root);
 return {rig,time:Math.random()*10,canvases:[]};
}

function draw(view,bots,bot){
 for(const other of bots)other.rig.root.visible=other===bot;
 view.renderer.render(view.scene,view.camera);
 for(const canvas of bot.canvases){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(view.renderer.domElement,0,0,canvas.width,canvas.height);
  canvas.closest('.kb-bot')?.classList.add('kb-bot-live');
 }
}

export function mountTeamBots(root=document){
 const canvases=[...root.querySelectorAll('canvas[data-bot]')];
 if(!canvases.length)return null;
 let view;
 try{view=stage();}catch{return null;}      // sem WebGL: fica a imagem parada
 const motion=matchMedia('(prefers-reduced-motion: reduce)'),reduced=()=>motion.matches;
 const bots=new Map();
 for(const canvas of canvases){
  const {bot:slug,botShell:shell,botLed:led}=canvas.dataset;
  if(!bots.has(slug))bots.set(slug,addBot(view,shell,led,reduced));
  const size=Math.min(SIZE,Math.round(canvas.clientWidth*Math.min(devicePixelRatio||1,2))||SIZE);
  canvas.width=canvas.height=size;bots.get(slug).canvases.push(canvas);
 }
 const list=[...bots.values()],shown=new Set(list);
 const owner=new Map(list.flatMap(bot=>bot.canvases.map(c=>[c,bot])));
 // Off-screen bots stop; a bot is drawn while any of its canvases is visible.
 const seen=new Map();
 const observer=new IntersectionObserver(entries=>{
  for(const e of entries)seen.set(e.target,e.isIntersecting);
  shown.clear();for(const [c,bot]of owner)if(seen.get(c)!==false)shown.add(bot);
 });
 owner.forEach((_,c)=>observer.observe(c));
 // Hover looks at the pointer; a click makes the bot happy and wave.
 for(const [canvas,bot]of owner){
  const box=canvas.closest('.kb-bot')||canvas;
  box.addEventListener('pointermove',e=>{const r=box.getBoundingClientRect();bot.rig.face.look((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);});
  box.addEventListener('pointerleave',()=>bot.rig.face.look(null));
  box.addEventListener('click',()=>{bot.rig.face.mood('happy',1.4);bot.rig.gesture('wave',1.4);});
 }
 const step=(bot,dt)=>{bot.time+=dt;poseCompanion(bot.rig,bot.time,dt,{reduced:reduced()});};
 if(reduced()){for(const bot of list){for(let i=0;i<30;i++)step(bot,STEP);draw(view,list,bot);}return {dispose(){observer.disconnect();}};}
 let last=performance.now(),raf=0;
 const frame=now=>{
  raf=requestAnimationFrame(frame);
  const dt=(now-last)/1000;
  if(document.hidden||dt<STEP*.9)return;
  last=now;
  for(const bot of shown){step(bot,Math.min(dt,.1));draw(view,list,bot);}
 };
 raf=requestAnimationFrame(frame);
 return {dispose(){cancelAnimationFrame(raf);observer.disconnect();view.renderer.dispose();}};
}

// Uma imagem parada do robô (gera os avatares PNG padrão dos agentes).
export function stillBot(shell,led,size=256){
 const view=stage();view.renderer.setSize(size,size,false);
 const bot=addBot(view,shell,led,()=>true);bot.rig.root.rotation.y=.18;
 for(let i=0;i<40;i++){bot.time+=STEP;poseCompanion(bot.rig,bot.time,STEP,{reduced:true});}
 view.renderer.render(view.scene,view.camera);
 const url=view.renderer.domElement.toDataURL('image/png');view.renderer.dispose();return url;
}
