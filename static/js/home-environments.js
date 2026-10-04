import * as T from '../vendor/three.module.min.js';
import {createChamberMaterials,createExteriorFade} from './lab-chamber-materials.js';
import {createGardenTree,createRockMaterial} from './lab-nature.js';
import {batchStatic} from './lab-batch.js';

// Tiny sets made from the lab's finishes and garden assets, built once on demand.
export function createMiniEnvironment(kind,art){
 const root=new T.Group();root.name=`companion-${kind}`;root.scale.setScalar(kind==='lab'?.52:.58);
 const {box,cylinder,ring,sphere,mat,glow}=art;
 if(kind==='lab'){
  const chamber=createChamberMaterials();
  const floor=chamber.floor.clone();floor.map=chamber.floor.map.clone();floor.map.repeat.set(3,2);
  box(root,5.8,.09,3.7,floor,0,-.09,-.8);
  box(root,5.8,4.2,.12,chamber.wall(5.8,4.2),0,2.05,-2.5);
  for(const x of [-2.75,2.75]){
   box(root,.16,4.2,.3,chamber.equipment('#526e61',.65),x,2.05,-2.35);
   box(root,.045,3.5,.035,glow('#76d9ff'),x,2.05,-2.17);
  }
  const desk=new T.Group();desk.position.set(-1.65,0,-1.7);root.add(desk);
  box(desk,1.45,.12,.65,chamber.equipment('#c7d3c7'),0,.76,0);
  for(const x of [-.5,.5])box(desk,.11,.76,.5,chamber.equipment('#384f5e'),x,.36,0);
  box(desk,1.08,.63,.12,chamber.equipment('#26333e'),0,1.15,-.08);
  box(desk,.95,.49,.02,mat('#10232e'),0,1.15,0);
  for(let i=0;i<4;i++)box(desk,.45+i*.08,.018,.025,glow(i%2?'#76d9ff':'#79cbb3'),-.12,1.32-i*.1,.018);
  const cabinet=chamber.equipment('#435d54');box(root,.8,1.8,.68,cabinet,2,.86,-1.8);
  for(let i=0;i<6;i++){box(root,.65,.15,.04,chamber.equipment('#24333c'),2,.3+i*.23,-1.44);sphere(root,.025,glow('#76d9ff'),2.24,.3+i*.23,-1.4);}
 }else if(kind==='forest'){
  cylinder(root,3.15,.12,mat('#293b29',0,1),0,-.13,-.75);
  for(const [x,z,height,radius]of [[-2.35,-1.55,3.2,1.05],[2.45,-1.75,3.65,1.2],[-.55,-2.75,3.9,1.1]])createGardenTree(root,art,{x,y:-.05,z,height,radius});
  for(const [x,z,r]of [[-1.75,.15,.38],[2,.2,.42],[1.15,-2,.3]]){
   const rock=sphere(root,r,createRockMaterial(),x,.06,z,[1.5,.65,1]);rock.rotation.y=x;
  }
  for(const x of [-2.25,1.8]){cylinder(root,.035,.32,mat('#b8a17e',0,1),x,.05,.45);sphere(root,.12,mat('#aa7351',0,.9),x,.23,.45,[1,.45,1]);}
  ring(root,2.98,.015,mat('#3d5140',0,1),0,-.055,-.75,true);
 }
 batchStatic(root);
 const fade=createExteriorFade(root);fade(1);
 return {root,setLevel(level){fade(1-level);}};
}
