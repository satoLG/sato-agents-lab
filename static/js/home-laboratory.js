import * as T from '../vendor/three.module.min.js';
import {createHousing,createWorkstation,createServiceRack} from './scene-equipment.js';
import {createChamberMaterials} from './lab-chamber-materials.js';
import {createContactShadows} from './scene-grove.js';

// A compact test chamber inspired by the supplied tiled-room reference.
export function createHomeLaboratory(root,art){
 const {box,cylinder,ring,rod,sphere,mesh,mat,glow,geo}=art,chamber=createChamberMaterials();
 const white=chamber.equipment('#e6edf0',.3,.35),dark=chamber.equipment('#26333e',.65,.38),steel=chamber.equipment('#87959d',.75,.28),cyan=glow('#5ed6ff'),amber=glow('#ffca73');
 const obstacles=[],contacts=[];
 const solid=(x,z,w,d)=>{obstacles.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2});contacts.push({x,z,y:-.06,radius:Math.max(w,d)*.65});};
 const floor=chamber.floor;floor.map.repeat.set(9,10);floor.bumpMap.repeat.set(9,10);
 box(root,18,.12,20,floor,0,-.13,0).name='test-chamber-floor';
 box(root,18,.14,20,chamber.wall(36,40),0,5.42,0).name='test-chamber-ceiling';
 for(const z of [-7,-1,5]){box(root,17.5,.16,.25,steel,0,5.22,z);box(root,8,.025,.4,glow('#e3f2ff'),0,5.13,z);}
 for(const [x,z,w,d] of [[0,-10,18,.3],[0,10,18,.3],[-9,0,.3,20],[9,0,.3,20]]){
  const wall=box(root,w,5.4,d,chamber.wall(Math.max(w,d)*4,5.4*4),x,2.57,z);wall.name='test-chamber-wall';
  box(root,w+.01,.18,d+.01,dark,x,.01,z);box(root,w+.01,.16,d+.01,steel,x,5.18,z);
 }
 // Panel seams, inset observation windows, rails and warm overhead luminaires.
 for(const side of [-1,1])for(const z of [-7,-2,3,8]){
  box(root,.26,5.1,.13,steel,side*8.77,2.5,z);
  box(root,.1,.8,2.5,dark,side*8.78,3.48,z-1.8);
  box(root,.12,.65,2.28,mat('#284653',.6,.2),side*8.69,3.48,z-1.8);
  for(let i=0;i<3;i++)box(root,.13,.018,2.05,cyan,side*8.6,3.27+i*.17,z-1.8);
  box(root,1.5,.16,3,dark,side*7.6,4.55,z);
  box(root,1.3,.025,2.7,glow('#fff0cf'),side*7.6,4.45,z);
 }
 function label(parent,text,x,y,z,color='#b0e9ff',width=1.8){
  const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#142531';ctx.fillRect(0,0,512,128);ctx.fillStyle=color;ctx.font='600 54px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64);
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;const sign=mesh(parent,new T.PlaneGeometry(width,width/4),new T.MeshBasicMaterial({map}),x,y,z);return sign;
 }
 const housing=(...args)=>createHousing(art,...args);
 const console=(x,z,angle=0)=>createWorkstation(root,art,{x,z,angle,onSolid:solid});
 console(-6,-1,.3);console(6,3,-Math.PI/2);console(-5.9,6,Math.PI);
 // Service racks: individual cartridges, louvers, cables and status lights.
 for(const x of [5.1,7]){
  createServiceRack(root,art,{x,z:-7.9});solid(x,-7.9,1.5,1.2);
  rod(root,[x-.5,2.85,-7.9],[x-.5,3.45,-7.9],.045,steel);rod(root,[x-.5,3.45,-7.9],[x-.5,3.45,-9.7],.045,steel);
 }
 // Central dividing bay keeps an open passage on either side.
 box(root,.3,3.1,3.5,chamber.wall(14,12),-3.1,1.48,-6.9);solid(-3.1,-6.9,.4,3.5);
 box(root,.42,.12,3.6,steel,-3.1,3.08,-6.9);
 // Recessed circular test gate, concentric mechanical rings and segmented rim.
 const gate=new T.Group();gate.position.set(.4,1.9,-9.65);root.add(gate);gate.name='circular-test-gate';
 housing(gate,3.5,3.8,.32,white,0,0,0);mesh(gate,new T.CircleGeometry(1.43,64),dark,0,0,.21);
 ring(gate,1.39,.11,steel,0,0,.28);ring(gate,1.18,.035,cyan,0,0,.3);
 for(let i=0;i<12;i++){const a=i*Math.PI/6,b=box(gate,.12,.27,.12,i%3?steel:amber,Math.sin(a)*1.38,Math.cos(a)*1.38,.32);b.rotation.z=-a;}
 box(gate,.04,2.25,.02,steel,0,0,.25);label(gate,'TEST / 01',0,1.68,.23,'#b0e9ff',1.9);solid(.4,-9.6,3.5,.65);
 // Glass specimen pedestal and an emissive helical field, like the reference.
 const coil=new T.Group();coil.position.set(-6.25,0,-6.8);root.add(coil);coil.name='helical-field-generator';
 cylinder(coil,1.02,.28,dark,0,.1,0);cylinder(coil,.84,.13,steel,0,.29,0);ring(coil,.75,.03,cyan,0,.37,0,true);
 cylinder(coil,.78,.2,dark,0,3.32,0);cylinder(coil,.63,.14,steel,0,3.5,0);
 for(const x of [-.88,.88])rod(coil,[x,.2,0],[x,3.34,0],.055,steel);
 const helix=[];for(let i=0;i<=240;i++){const a=i/240*Math.PI*12;helix.push(new T.Vector3(Math.sin(a)*.55,.42+i/240*2.7,Math.cos(a)*.55));}
 mesh(coil,new T.TubeGeometry(new T.CatmullRomCurve3(helix),240,.013,5,false),new T.MeshBasicMaterial({color:'#61b6ff'}));
 const glass=new T.MeshPhysicalMaterial({color:'#89dfff',transparent:true,opacity:.1,roughness:.12,metalness:.2,depthWrite:false,side:T.DoubleSide});
 cylinder(coil,.7,2.8,glass,0,1.78,0);sphere(coil,.22,white,0,1.78,0);ring(coil,.35,.016,cyan,0,1.78,0);solid(-6.25,-6.8,2.1,2.1);
 label(root,'FIELD LAB',-6.2,3.7,-9.78,'#b0e9ff',2.5);
 // Forward-facing side is modeled too: supply crates, power cells and a hatch.
 for(const [i,x]of [-4.5,-2.8,4.8].entries()){
  housing(root,1.2,.85,1.1,white,x,.36,8.1);box(root,1.25,.09,1.15,dark,x,.82,8.1);
  for(const sx of [-.42,.42])box(root,.085,.84,1.14,steel,x+sx,.36,8.1);
  solid(x,8.1,1.3,1.2);
 }
 for(const x of [6,7.5]){cylinder(root,.38,1.65,steel,x,.78,7.7);ring(root,.38,.045,cyan,x,1.32,7.7,true);cylinder(root,.25,.17,dark,x,1.69,7.7);solid(x,7.7,.9,.9);}
 const hatch=new T.Group();hatch.position.set(0,1.65,9.76);hatch.rotation.y=Math.PI;root.add(hatch);
 housing(hatch,2.7,3.5,.18,dark,0,0,0);housing(hatch,2.35,3.16,.16,steel,0,0,.12);box(hatch,.035,3.1,.03,cyan,0,0,.23);label(hatch,'SERVICE',0,1.3,.24,'#ffcf85',1.6);
 for(const x of [-1.45,1.45])box(root,.06,.01,15,cyan,x,-.064,-.8);
 for(let i=0;i<7;i++){const stripe=box(root,.3,.012,.14,mat('#eab752'),-6.2+i*.35,-.061,-4.8);stripe.rotation.y=-.5;}
 createContactShadows(root,contacts);
 return {navigation:{minX:-8.8,maxX:8.8,minZ:-9.8,maxZ:9.8,obstacles},groundHeight:()=>0};
}
