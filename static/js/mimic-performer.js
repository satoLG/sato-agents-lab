import {compileMimicPlan,neutralArm,neutralBody} from './mimic-contract.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
const unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
function direction(a,b,t){
 a=unit(a);b=unit(b);const dot=clamp(a.reduce((s,x,i)=>s+x*b[i],0),-1,1);
 if(dot>.999)return unit(a.map((x,i)=>lerp(x,b[i],t)));
 if(dot<-.999){const axis=Math.abs(a[1])<.8?[0,1,0]:[0,0,1],cross=unit([a[1]*axis[2]-a[2]*axis[1],a[2]*axis[0]-a[0]*axis[2],a[0]*axis[1]-a[1]*axis[0]]);return a.map((x,i)=>x*Math.cos(Math.PI*t)+cross[i]*Math.sin(Math.PI*t));}
 const angle=Math.acos(dot),s=Math.sin(angle);return a.map((x,i)=>(x*Math.sin((1-t)*angle)+b[i]*Math.sin(t*angle))/s);
}
function lineDistance(x,y,[ax,ay,bx,by]){const dx=bx-ax,dy=by-ay,t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-ax-dx*t,y-ay-dy*t);}
export function rasterizeDrawing(shapes){
 const data=new Uint8Array(34*19*4);
 for(let y=0;y<19;y++)for(let x=0;x<34;x++){
  let distance=16;
  for(const shape of shapes){
   let d;
   if(shape.type==='line')d=lineDistance(x+.5,y+.5,shape.points)-shape.width/2;
   else{
    const dx=x+.5-shape.center[0],dy=y+.5-shape.center[1];
    if(shape.type==='ellipse')d=(Math.hypot(dx/shape.radius[0],dy/shape.radius[1])-1)*Math.min(...shape.radius);
    else{const r=Math.min(shape.radius,...shape.size.map(n=>n/2)),qx=Math.abs(dx)-shape.size[0]/2+r,qy=Math.abs(dy)-shape.size[1]/2+r;d=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r;}
    if(shape.width)d=Math.abs(d)-shape.width/2;
   }
   distance=Math.min(distance,d);
  }
  const offset=(y*34+x)*4,value=clamp(Math.round(distance*8+128),0,255);data[offset]=data[offset+1]=data[offset+2]=value;data[offset+3]=255;
 }
 return data;
}

export function createMimicPerformer(rig){
 let active=null;
 function stop(status='cancelled'){
  if(!active)return;const previous=active;active=null;rig.face.draw(null,null,0,0);rig.face.mood('normal');rig.gesture('sides');previous.onState?.(status);
 }
 function start(plan,time,{onState}={}){
  const compiled=compileMimicPlan(plan);stop();active={plan:compiled,at:time,onState,drawings:compiled.drawings.map(rasterizeDrawing)};onState?.('started');return true;
 }
 function update(time,{reduced=false}={}){
  if(!active)return null;const {plan,at,drawings}=active,elapsed=time-at;
  if(elapsed>=plan.duration){stop('completed');return null;}
  const phase=reduced?.5:1-Math.abs(2*((elapsed/plan.duration*plan.cycles)%1)-1);
  let index=0;while(index<plan.frames.length-2&&phase>plan.frames[index+1].at)index++;
  const a=plan.frames[index],b=plan.frames[index+1],blend=smooth((phase-a.at)/(b.at-a.at)),weight=reduced?1:Math.min(smooth(elapsed/.3),smooth((plan.duration-elapsed)/.4));
  rig.face.draw(drawings[a.drawing]||null,drawings[b.drawing]||null,blend,weight);
  for(let i=0;i<2;i++){
   const from=a.arms[i],to=b.arms[i],base=neutralArm(i?1:-1),pose={spot:direction(base.position,direction(from.position,to.position,blend),weight),aim:direction(base.aim,direction(from.aim,to.aim,blend),weight)};
   for(const key of ['shape','length','width','reach','twist'])pose[key]=lerp(base[key],lerp(from[key],to[key],blend),weight);
   rig.setArms(i,{...pose,spin:0,tumble:0});
  }
  const body=neutralBody();if(!reduced)for(const key of Object.keys(body))body[key]=lerp(a.body[key],b.body[key],blend)*weight;
  return body;
 }
 return {start,update,stop,get active(){return !!active;},get id(){return active?.plan.id;}};
}
