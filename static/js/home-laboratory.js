import {createChamberMaterials} from './lab-chamber-materials.js';

// The laboratory backdrop is only the tiled test chamber: floor, ceiling and
// four checkered walls, with no equipment inside. Six boxes keep it cheap.
export function createHomeLaboratory(root,art){
 const {box}=art,chamber=createChamberMaterials();
 const floor=chamber.floor;floor.map.repeat.set(9,10);floor.bumpMap.repeat.set(9,10);
 box(root,18,.12,20,floor,0,-.13,0).name='test-chamber-floor';
 box(root,18,.14,20,chamber.wall(36,40),0,5.42,0).name='test-chamber-ceiling';
 for(const [x,z,w,d] of [[0,-10,18,.3],[0,10,18,.3],[-9,0,.3,20],[9,0,.3,20]]){
  const wall=box(root,w,5.4,d,chamber.wall(Math.max(w,d)*4,5.4*4),x,2.57,z);wall.name='test-chamber-wall';
 }
 return {navigation:{minX:-8.8,maxX:8.8,minZ:-9.8,maxZ:9.8,obstacles:[]},groundHeight:()=>0};
}
