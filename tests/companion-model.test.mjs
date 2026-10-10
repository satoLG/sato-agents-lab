import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../static/vendor/three.module.min.js';
import {GLTFLoader} from '../static/vendor/GLTFLoader.js';
import {createCompanionModel} from '../static/js/companion-model.js';

globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
test('editable companion keeps the home hull, separate meshes, joints and floating poses',()=>{
 const {scene,animations}=createCompanionModel();let meshes=0,bones=0;scene.traverse(n=>{if(n.isMesh)meshes++;if(n.isBone)bones++;});
 assert.equal(meshes,43);assert.equal(bones,8);assert.ok(scene.getObjectByName('spherical-hull_15'));
 assert.deepEqual(animations.map(c=>c.name),['Float_Idle','Float_Forward','Float_Backward','Float_Left','Float_Right']);
 const mixer=new T.AnimationMixer(scene),spine=scene.getObjectByName('spine_2');
 for(const [name,pitch,bank]of [['Float_Forward',.23,0],['Float_Backward',-.23,0],['Float_Left',0,.23],['Float_Right',0,-.23]]){
  mixer.stopAllAction();mixer.clipAction(animations.find(c=>c.name===name)).play();mixer.update(.5);
  assert.ok(Math.abs(spine.rotation.x-pitch)<.001);assert.ok(Math.abs(spine.rotation.z-bank)<.001);
  for(const side of ['flipper_L_38','flipper_R_41'])assert.ok(Math.abs(scene.getObjectByName(side).rotation.x)<.001);
 }
 scene.updateMatrixWorld(true);scene.traverse(n=>assert.ok(n.matrixWorld.elements.every(Number.isFinite)));
});
test('downloaded companion GLB preserves all editable pieces and clips after reimport',async()=>{
 const loader=new GLTFLoader();loader.register(p=>({name:'headless',beforeRoot(){p.loadTexture=async()=>null;}}));
 const b=await fs.readFile(new URL('../static/models/companion.glb',import.meta.url));
 const g=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 let meshes=0;g.scene.traverse(n=>{if(n.isMesh)meshes++;});assert.equal(meshes,43);assert.equal(g.animations.length,5);
 const mixer=new T.AnimationMixer(g.scene);mixer.clipAction(g.animations[1]).play();mixer.update(.5);
 assert.ok(Math.abs(g.scene.getObjectByName('spine_2').rotation.x-.23)<.001);
 assert.ok(g.scene.getObjectByName('optic-shutter-0_9'));assert.ok(g.scene.getObjectByName('magnetic-core_44'));
});
