import * as T from '../vendor/three.module.min.js';
import {createChamberMaterials} from './lab-chamber-materials.js';
const finishes=new WeakMap();
function chamberFor(art){if(!finishes.has(art))finishes.set(art,createChamberMaterials());return finishes.get(art);}
export function createHousing(art,parent,w,h,d,finish,x,y,z){
  const {geo,mesh}=art;
  const key=`lab-bevel-${w}-${h}-${d}`,geometry=geo(key,()=>{
   const shape=new T.Shape();shape.moveTo(-w/2,-h/2);shape.lineTo(w/2,-h/2);shape.lineTo(w/2,h/2);shape.lineTo(-w/2,h/2);shape.closePath();
   const g=new T.ExtrudeGeometry(shape,{depth:d-.08,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.035,bevelThickness:.04});g.translate(0,0,-(d-.08)/2);return g;
  });return mesh(parent,geometry,finish,x,y,z);
 }
export function createWorkstation(root,art,{x=0,z=0,angle=0,onSolid=()=>{}}={}){
  const {box,cylinder,sphere,mat,glow}=art,chamber=chamberFor(art);
  const white=chamber.equipment('#e6edf0',.3,.35),dark=chamber.equipment('#26333e',.65,.38),steel=chamber.equipment('#87959d',.75,.28),cyan=glow('#5ed6ff'),amber=glow('#ffca73');
  const group=new T.Group();group.position.set(x,0,z);group.rotation.y=angle;root.add(group);group.name='bevelled-workstation';
  createHousing(art,group,2.2,.55,.95,white,0,.88,0);box(group,1.75,.75,.6,dark,0,.25,0);box(group,2.12,.04,.94,steel,0,1.18,0);
  for(const sx of [-.64,.64]){
   cylinder(group,.055,.32,steel,sx,1.34,-.24);createHousing(art,group,.95,.66,.12,dark,sx,1.68,-.24);
   box(group,.84,.55,.016,mat('#12303f'),sx,1.68,-.169);
   for(let i=0;i<5;i++)box(group,.37+(i%3)*.1,.018,.018,i%2?cyan:amber,sx-.09,1.85-i*.073,-.155);
  }
  for(let i=0;i<8;i++)for(let j=0;j<3;j++)box(group,.1,.018,.08,steel,-.52+i*.14,1.215,.15+j*.11);
  for(const sx of [-.86,.86])sphere(group,.03,cyan,sx,.88,.5);
  onSolid(x,z,2.4,1.4);return group;
 }

export function createServiceRack(parent,art,{x=0,z=0,angle=0,doubleSided=false}={}){
 const {box,sphere,glow}=art,chamber=chamberFor(art),dark=chamber.equipment('#26333e',.65,.38),steel=chamber.equipment('#87959d',.75,.28);
 const rack=new T.Group();rack.name='working-server-cabinet';rack.position.set(x,0,z);rack.rotation.y=angle;parent.add(rack);
 createHousing(art,rack,1.4,2.8,1.05,dark,0,1.4,0);
 const lights=[];
 for(const side of doubleSided?[-1,1]:[1])for(let i=0;i<7;i++){
  createHousing(art,rack,1.16,.27,.1,steel,0,.32+i*.36,side*.58);
  for(let j=0;j<6;j++)box(rack,.1,.025,.03,dark,-.45+j*.17,.32+i*.36,side*.65);
  const led=sphere(rack,.022,glow(i%3?'#5ed6ff':'#ffca73'),.5,.41+i*.36,side*.68);led.userData.dynamic=true;lights.push(led);
 }
 return {root:rack,lights};
}
