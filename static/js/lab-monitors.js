import * as T from '../vendor/three.module.min.js';
export {indicatorCards} from './telemetry-indicators.js';
export const MONITOR_LAYOUT={width:2.5,height:1.5,columns:3,rows:2};
export function createMonitorBank(parent,{box,mesh,mat},{x=0,y=0,z=-1.65,sector='',wallMounted=false}={}){
 const bank=new T.Group();bank.name='dashboard-monitor-bank';bank.userData.sector=sector;bank.position.set(x,y,z);parent.add(bank);
 const {width,height,columns,rows}=MONITOR_LAYOUT,displays=[];
 box(bank,8.25,3.35,.15,mat('#233844',.7,.3),0,3.3,-.11);
 if(!wallMounted)for(const x of [-3.6,3.6])box(bank,.13,4.65,.13,'#687b87',x,2.325,-.18);
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const monitor=new T.Group();monitor.position.set((col-1)*(width+.16),4.13-row*(height+.16),0);bank.add(monitor);
  box(monitor,width+.055,height+.055,.09,'#233844');
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=576;const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const plane=mesh(monitor,new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map:texture}),0,0,.058,false);plane.name='dashboard-indicator-screen';plane.userData.dynamic=true;plane.userData.sectorIndicator=true;
  displays.push({canvas,texture,key:''});
 }
 let cards=[],status='Aguardando dados',catalog=null;
 function paint(){displays.forEach((d,i)=>{const c=cards[i],skillPanel=sector==='memory'&&i===5&&catalog,key=JSON.stringify([c,c?status:'',skillPanel]);if(key===d.key)return;d.key=key;const ctx=d.canvas.getContext('2d');ctx.setTransform(d.canvas.width/640,0,0,d.canvas.height/384,0,0);ctx.fillStyle='#0c252f';ctx.fillRect(0,0,640,384);
  if(skillPanel){
    ctx.fillStyle='#9ae4b5';ctx.font='800 32px Nunito';ctx.fillText('OFICINA DE SKILLS',32,55);
    ctx.fillStyle='#ecfaff';ctx.font='700 40px Nunito';ctx.fillText(skillPanel.available?`${skillPanel.count} itens`:'Sem catálogo',32,123);
    ctx.font='500 25px Nunito';skillPanel.items.slice(0,4).forEach((item,n)=>ctx.fillText(String(item.name).slice(0,35),32,177+n*42));
    d.texture.needsUpdate=true;return;
  }
  if(!c){d.texture.needsUpdate=true;return;}
  function text(value,y,size,color){ctx.font=`600 ${size}px Nunito`;ctx.fillStyle=color;let s=String(value??'');while(ctx.measureText(s).width>570&&s.length>1)s=s.slice(0,-2)+'…';ctx.fillText(s,32,y);}
  text(c.title,55,34,'#78dfff');text(c.value,155,84,'#ecfaff');text(c.detail,208,26,'#a5c6c4');
  if(typeof c.progress==='number'){ctx.fillStyle='#284650';ctx.fillRect(32,243,576,32);ctx.fillStyle=c.progress>90?'#ffb16d':'#72e2bd';ctx.fillRect(32,243,576*Math.max(0,Math.min(100,c.progress))/100,32);}
  if(c.lines?.length){c.lines.forEach((line,n)=>text(line,244+n*23,21,'#c7e8dd'));}
  if(c.series?.length>1){const values=c.series.filter(Number.isFinite),max=Math.max(1,...values);ctx.strokeStyle='#78e6b1';ctx.lineWidth=4;ctx.beginPath();values.forEach((v,n)=>{const x=32+n*576/(values.length-1),y=283-v/max*68;n?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
  text(status,c.lines?.length?343:326,20,'#b1c2c8');text(`/dashboard · ${c.source}`,362,18,'#6f9da8');d.texture.needsUpdate=true;
 });}
 paint();return {root:bank,setCatalog(value){catalog=value;paint();},update(lines){status=lines.slice(0,2).join(' · ');paint();},indicators(value){cards=value;paint();}};
}
