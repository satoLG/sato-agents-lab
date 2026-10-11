import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import * as T from '../static/vendor/three.module.min.js';
import {GLTFLoader} from '../static/vendor/GLTFLoader.js';

async function load(){const bytes=await fs.readFile(new URL('../static/models/sato.glb',import.meta.url)),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length);const loader=new GLTFLoader();loader.register(p=>({name:'headless',beforeRoot(){p.loadTexture=async()=>null;}}));const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');return {json,gltf,data(i){const a=json.accessors[i],v=json.bufferViews[a.bufferView],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],offset=(v.byteOffset||0)+(a.byteOffset||0);return bin.subarray(offset,offset+a.count*size*4);}};}
function parts(root){const out=[];root.traverse(o=>{if(o.isSkinnedMesh)out.push(o);});return out;}

test('face stays unchanged outside the lower brows and stronger upper lids; hair keeps its chestnut palette',async()=>{
 const {json}=await load(),expected=JSON.parse(await fs.readFile(new URL('./fixtures/sato-joints-reference.json',import.meta.url))),bytes=await fs.readFile(new URL('../static/models/sato.glb',import.meta.url)),bin=bytes.subarray(28+bytes.readUInt32LE(12));
 const sha=b=>createHash('sha256').update(b).digest('hex');
 const images=json.images.map(image=>{const v=json.bufferViews[image.bufferView],start=v.byteOffset||0;return bin.subarray(start,start+v.byteLength);});
 // Only the brow/upper-lid band may change; lower irises, nose and mouth stay exact.
 const png=images[0],compressed=[];for(let o=8;o<png.length;){const length=png.readUInt32BE(o);if(png.toString('ascii',o+4,o+8)==='IDAT')compressed.push(png.subarray(o+8,o+8+length));o+=length+12;}
 const pixels=inflateSync(Buffer.concat(compressed)),protectedRows=[];let browPixels=0;
 for(let y=0;y<256;y++){assert.equal(pixels[y*1025],0);if(y<79||y>126)protectedRows.push(pixels.subarray(y*1025,(y+1)*1025));else for(let x=0;x<256;x++){const i=y*1025+1+x*4;if(pixels[i]===81&&pixels[i+1]===56&&pixels[i+2]===46)browPixels++;}}
 assert.equal(sha(Buffer.concat(protectedRows)),expected.protectedFaceHash);assert.ok(browPixels>800,'Eyebrows must retain visible thickness');
 const hairData=[];for(let o=8;o<images[1].length;){const length=images[1].readUInt32BE(o);if(images[1].toString('ascii',o+4,o+8)==='IDAT')hairData.push(images[1].subarray(o+8,o+8+length));o+=length+12;}
 const hairPixels=inflateSync(Buffer.concat(hairData));let chestnut=0;for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=y*513+1+x*4,[r,g,b,a]=hairPixels.subarray(i,i+4);assert.equal(a,255);assert.ok(r>g&&g>b,'Hair must retain the warm brown palette');if(r===80&&g===55&&b===48)chestnut++;}assert.ok(chestnut>128*128*.20);
});

test('original bind transforms, inverse binds and untouched animation channels remain byte-identical',async()=>{
 const {json,data}=await load(),expected=JSON.parse(await fs.readFile(new URL('./fixtures/sato-rig-signature.json',import.meta.url))),revision=JSON.parse(await fs.readFile(new URL('./fixtures/sato-joints-reference.json',import.meta.url))),parents=new Map();json.nodes.forEach(n=>n.children?.forEach(i=>parents.set(i,n.name)));
 const rest=json.skins[0].joints.slice(0,53).map(i=>{const n=json.nodes[i];return {name:n.name,parent:parents.get(i),translation:n.translation,rotation:n.rotation,scale:n.scale};});assert.deepEqual(JSON.parse(JSON.stringify(rest)),expected.rest);
 assert.equal(json.skins[0].joints.length,59);assert.ok(json.skins[0].joints.slice(53).every(i=>/^DEF-support_(elbow|hip|knee)\.[LR]$/.test(json.nodes[i].name)));
 const sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(sha(data(json.skins[0].inverseBindMatrices).subarray(0,53*16*4)),expected.inverseBindHash);
 const modified=new Set(['L','R'].flatMap(s=>['shoulder','upper_arm','forearm','hand','thigh','shin','foot'].map(n=>`DEF-${n}.${s}`))),hash=createHash('sha256');let channels=0;
 for(const a of json.animations){hash.update(a.name);for(const c of a.channels){const name=json.nodes[c.target.node].name;if(name.startsWith('DEF-support_')||(/^Rig\|(Crouch|Fixing|Hit|Idle|Interact|Jog|Jump|PickUp|Pistol|Punch|Push|Sword|Walk|Sprint)/.test(a.name)&&c.target.path==='rotation'&&modified.has(name)))continue;const s=a.samplers[c.sampler];hash.update(name+':'+c.target.path+':'+s.interpolation);hash.update(data(s.input));hash.update(data(s.output));channels++;}}
 assert.equal(hash.digest('hex'),revision.untouchedMotionHash);assert.equal(channels,revision.untouchedChannels);assert.deepEqual(json.animations.map(a=>a.name),expected.clips);
});

test('arms, palms, thumbs and fingers form connected, closed surfaces with normalized weights',async()=>{
 const {gltf}=await load();for(const side of ['L','R']){
  const root=gltf.scene.getObjectByName(`Sato_arm_hand_${side}`),vertices=new Map(),edges=new Map(),adjacency=[];let count=0;
  for(const m of parts(root)){const {position,skinIndex,skinWeight}=m.geometry.attributes,ids=[];for(let i=0;i<position.count;i++){
   const key=[position.getX(i),position.getY(i),position.getZ(i)].map(v=>v.toFixed(6)).join(',');if(!vertices.has(key)){vertices.set(key,count++);adjacency.push(new Set());}ids.push(vertices.get(key));
   let sum=0;for(let c=0;c<4;c++){sum+=skinWeight.getComponent(i,c);assert.ok(skinIndex.getComponent(i,c)<59);}assert.ok(Math.abs(sum-1)<1e-6);
  }
  const index=m.geometry.index;for(let i=0;i<index.count;i+=3){const triangle=[0,1,2].map(k=>ids[index.getX(i+k)]);for(let c=0;c<3;c++){const a=triangle[c],b=triangle[(c+1)%3];if(a===b)continue;adjacency[a].add(b);adjacency[b].add(a);const key=[a,b].sort((a,b)=>a-b).join(',');edges.set(key,(edges.get(key)||0)+1);}}
  }
  const visited=new Set(),queue=[0];while(queue.length){const i=queue.pop();if(visited.has(i))continue;visited.add(i);queue.push(...[...adjacency[i]].filter(i=>!visited.has(i)));}assert.equal(visited.size,count,`${side}: detached palm or finger`);
  assert.equal([...edges.values()].filter(n=>n===1).length,0,`${side}: open surface at an articulation`);
  assert.equal([...edges.values()].filter(n=>n>2).length,0,`${side}: non-manifold branch`);
 }
});

test('deformation remains finite across every clip and the new asset embeds its pixel textures',async()=>{
 const {gltf,json}=await load();assert.equal(json.images.length,2);for(const image of json.images){assert.equal(image.mimeType,'image/png');assert.ok(image.bufferView!==undefined);assert.equal(image.uri,undefined);}assert.ok(json.samplers.every(s=>s.magFilter===9728));
 const meshes=parts(gltf.scene),mixer=new T.AnimationMixer(gltf.scene);for(const clip of gltf.animations){mixer.stopAllAction();const action=mixer.clipAction(clip).play();for(const phase of [0,.25,.5,.75,1]){action.time=clip.duration*phase;mixer.update(0);gltf.scene.updateMatrixWorld(true);for(const mesh of meshes){mesh.skeleton.update();const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i+=11){const v=new T.Vector3().fromBufferAttribute(p,i);mesh.applyBoneTransform(i,v);assert.ok(v.toArray().every(Number.isFinite),clip.name);}}}}
 const triangles=json.meshes.reduce((n,m)=>n+m.primitives.reduce((n,p)=>n+json.accessors[p.indices].count/3,0),0);assert.ok(triangles<10000);assert.ok(!json.nodes.some(n=>n.mesh!==undefined&&/^tripo_part_/.test(n.name)));
});
