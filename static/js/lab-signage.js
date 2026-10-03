import * as T from '../vendor/three.module.min.js';
import {ZONES,AREAS,FLOOR,deckHeight,ENERGY_ROUTES} from './lab-layout.js';
export async function loadSectorIcons(){const icons={};await Promise.all(Object.entries(ZONES).map(async([id,z])=>{const img=new Image();img.src=new URL(`../icons/lucide/${z.icon}.svg`,import.meta.url).href;await img.decode();icons[id]=img;}));return icons;}
function canvasTexture(canvas){const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;return tex;}
export function createSectorSign(parent,id,art,icons,obstacles){
 const {box,mesh,textPlane}=art,z=ZONES[id],g=new T.Group();g.name=`sector-${z.number}-indicator`;g.position.set(z.sign[0],deckHeight(...z.sign)??FLOOR,z.sign[1]);parent.add(g);
 box(g,2.75,5.55,.44,'#25313a',0,2.775,0);box(g,2.56,5.32,.03,'#e7e8e0',0,2.78,.24);
 const canvas=document.createElement('canvas');canvas.width=640;canvas.height=1152;const c=canvas.getContext('2d');c.fillStyle='#eceee7';c.fillRect(0,0,640,1152);c.fillStyle='#16232c';c.font='800 31px Nunito';c.fillText(z.area,42,64);
 c.save();c.scale(.84,1);c.font='800 380px Nunito';c.fillText(z.number,24,425);c.restore();c.fillRect(42,477,555,2);
 for(let i=0;i<36;i++)c.fillRect(43+i*8,503,i%3===0?5:2,39);c.font='700 27px Nunito';c.fillText(`${z.number} / 07`,425,533);
 c.strokeStyle='#667079';c.lineWidth=2;c.strokeRect(44,607,170,170);c.drawImage(icons[id],69,632,120,120);c.font='800 36px Nunito';c.fillText(z.name,43,848,552);c.font='600 21px Nunito';c.fillText('SATO / AGENT RESEARCH',43,985);
 const panel=mesh(g,new T.PlaneGeometry(2.47,4.45),new T.MeshBasicMaterial({map:canvasTexture(canvas)}),0,3.07,.278,false);panel.userData.station=id;
 box(g,2.51,.57,.08,'#111c24',0,.47,.27);const screen=textPlane(g,z.name,2.36,.43,0,.47,.326,{color:'#8cddff',background:'#071b25',size:140,digital:true});screen.userData.station=id;
 g.traverse(o=>{o.userData.station=id;});obstacles.push({x:g.position.x,z:g.position.z,w:2.85,d:.6});return g;
}
export function createSectorMap(parent,{box,mesh},icons){
 const c=document.createElement('canvas');c.width=2048;c.height=1056;const p=c.getContext('2d');p.fillStyle='#edf0e9';p.fillRect(0,0,c.width,c.height);p.fillStyle='#182932';p.font='800 60px Nunito';p.fillText('00—07 / LAB DIRECTORY',55,84);p.font='600 25px Nunito';p.fillText('GATEWAY → INFRA → CORE → ÁREAS',58,130);
 const left=65,top=190,sx=16,sz=11;const pos=(x,z)=>[left+(x+32)*sx,top+(z+31)*sz];
 for(const a of [...AREAS,{name:'CORE',x:0,z:-3,w:20,d:17},{name:'GATEWAY',x:ZONES.gateway.x,z:22,w:15,d:7}]){const [x,y]=pos(a.x-a.w/2,a.z-a.d/2);p.strokeStyle='#9ca8aa';p.lineWidth=2;p.beginPath();p.roundRect(x,y,a.w*sx,a.d*sz,14);p.stroke();p.font='800 17px Nunito';p.fillStyle='#50616b';p.fillText(a.name,x+10,y+23);}
 for(const route of ENERGY_ROUTES){p.strokeStyle='#2b94bf';p.lineWidth=3;p.setLineDash([5,7]);p.beginPath();route.forEach(([x,z],i)=>{const q=pos(x,z);i?p.lineTo(...q):p.moveTo(...q);});p.stroke();}p.setLineDash([]);
 for(const [id,z]of Object.entries(ZONES)){const [x,y]=pos(z.x,z.z);p.fillStyle='#f9faf7';p.fillRect(x-19,y-20,43,36);p.fillStyle='#142d3c';p.font='800 27px Nunito';p.fillText(z.number,x-17,y+7);}
 p.fillStyle='#253641';p.font='700 22px Nunito';p.fillText('↑ PAREDE DE ATIVIDADES',80,176);p.fillText('↓ ENTRADA / VOCÊ ESTÁ AQUI',260,977);
 Object.entries(ZONES).forEach(([id,z],i)=>{const y=210+i*94;p.drawImage(icons[id],1220,y-33,45,45);p.fillStyle='#172b36';p.font='800 39px Nunito';p.fillText(z.number,1300,y);p.font='800 28px Nunito';p.fillText(z.name,1390,y);p.font='600 18px Nunito';p.fillStyle='#5a717c';p.fillText(z.area,1390,y+27);});
 box(parent,17.4,8.05,.22,'#24343d',17,4.37,18.38);const plane=mesh(parent,new T.PlaneGeometry(17,7.72),new T.MeshBasicMaterial({map:canvasTexture(c)}),17,4.37,18.52,false);plane.name='numbered-sector-map';return plane;
}
