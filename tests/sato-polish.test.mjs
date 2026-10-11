import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from '../static/vendor/three.module.min.js';
import {GLTFLoader} from '../static/vendor/GLTFLoader.js';

async function load(){const bytes=await fs.readFile(new URL('../static/models/sato.glb',import.meta.url)),loader=new GLTFLoader();loader.register(p=>({name:'headless',beforeRoot(){p.loadTexture=async()=>null;}}));return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
function parts(root){const out=[];root.traverse(o=>{if(o.isSkinnedMesh)out.push(o);});return out;}
function posed(mesh,i,p=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i)){mesh.applyBoneTransform(i,p);return p.applyMatrix4(mesh.matrixWorld);}
function update(g){g.scene.updateMatrixWorld(true);g.scene.traverse(m=>{if(m.isSkinnedMesh)m.skeleton.update();});}
const point=(g,n)=>g.scene.getObjectByName(n).getWorldPosition(new T.Vector3());

test('relaxed idle narrows the stance, lowers shoulders and angles hands inward without lifting the feet',async()=>{
 const g=await load(),expected=JSON.parse(await fs.readFile(new URL('./fixtures/sato-polish-reference.json',import.meta.url))),clip=g.animations.find(c=>c.name==='Rig|Idle_Loop'),mixer=new T.AnimationMixer(g.scene),action=mixer.clipAction(clip).setLoop(T.LoopOnce,1).play();action.clampWhenFinished=true;
 for(const sample of expected.idleContacts){action.time=clip.duration*sample.phase;mixer.update(0);update(g);
  const ankles=['L','R'].map(s=>point(g,'DEF-foot'+s)),oldSpan=sample.sides[0].foot[0]-sample.sides[1].foot[0];assert.ok(ankles[0].x-ankles[1].x<oldSpan*.70,'The feet are still too far apart');
  for(const [i,s]of ['L','R'].entries()){
   const ref=sample.sides[i],foot=g.scene.getObjectByName('DEF-foot'+s),hip=point(g,'DEF-thigh'+s),knee=point(g,'DEF-shin'+s),ankle=point(g,'DEF-foot'+s),shoulder=point(g,'DEF-upper_arm'+s),elbow=point(g,'DEF-forearm'+s),wrist=point(g,'DEF-hand'+s);
   assert.ok(Math.abs(ankle.y-ref.foot[1])<.00005&&Math.abs(ankle.z-ref.foot[2])<.00005,'The narrower stance must keep the feet grounded');assert.ok(foot.getWorldQuaternion(new T.Quaternion()).angleTo(new T.Quaternion().fromArray(ref.rotation))<.002,'Idle correction changed sole pitch');
   const kneeLine=T.MathUtils.lerp(hip.x,ankle.x,(hip.y-knee.y)/(hip.y-ankle.y)),elbowLine=T.MathUtils.lerp(shoulder.x,wrist.x,(shoulder.y-elbow.y)/(shoulder.y-wrist.y));
   assert.ok(Math.abs(knee.x-kneeLine)<.010,'The knees still bow outward');assert.ok(Math.abs(elbow.x-elbowLine)<.010,'The arms still bow sideways');assert.ok(shoulder.y<ref.shoulder[1]-.025,'The shoulders must settle visibly below their previous height');
   const fingers=point(g,'DEF-f_middle01'+s).sub(wrist),sign=s==='L'?1:-1;assert.ok(fingers.y<-.04&&fingers.x*sign<-.004,'The hands must angle gently toward the body');
  }
  const collar=[],shoulders=[[],[]];for(const mesh of parts(g.scene.getObjectByName('Sato_shirt'))){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(y>.69&&y<.70&&Math.abs(x)<.045&&Math.abs(z-.003)<.047)collar.push(posed(mesh,i).y);if(Math.abs(x)>.09&&Math.abs(x)<.13&&y>.68)shoulders[x>0?0:1].push(posed(mesh,i).y);}}
  const collarY=collar.reduce((a,b)=>a+b)/collar.length;for(const heights of shoulders)assert.ok(collarY-Math.max(...heights)>.008,'The shirt silhouette must fall from the neckline toward the shoulders');
 }
});

test('trousers taper from the upper thigh and the torso has a straighter male silhouette',async()=>{
 const g=await load();
 function span(root,y){const xs=[];for(const m of parts(root)){const p=m.geometry.attributes.position,index=m.geometry.index;for(let k=0;k<index.count;k+=3)for(let e=0;e<3;e++){const a=new T.Vector3().fromBufferAttribute(p,index.getX(k+e)),b=new T.Vector3().fromBufferAttribute(p,index.getX(k+(e+1)%3));if((a.y-y)*(b.y-y)<=0&&Math.abs(a.y-b.y)>1e-8){const x=T.MathUtils.lerp(a.x,b.x,(y-a.y)/(b.y-a.y));if(x>0)xs.push(x);}}}assert.ok(xs.length);return Math.max(...xs)-Math.min(...xs);}
 const trousers=g.scene.getObjectByName('Sato_trousers');assert.ok(span(trousers,.332)>span(trousers,.292)+.004,'The thigh must not swell below its top');assert.ok(span(trousers,.332)/span(trousers,.145)>1.25&&span(trousers,.332)/span(trousers,.145)<1.6,'Thighs must be fuller than the calves without becoming inflated');
 const shirt=parts(g.scene.getObjectByName('Sato_shirt')).flatMap(m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(m.geometry.attributes.position,i))),width=y=>Math.max(...shirt.filter(p=>Math.abs(p.y-y)<1e-5).map(p=>Math.abs(p.x)));
 assert.ok(width(.488)/width(.583)>.90,'The waist must not pinch below a protruding chest');
 const legPositions=parts(trousers).flatMap(m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(m.geometry.attributes.position,i))).filter(p=>p.y>.30&&p.y<.42);assert.ok(Math.max(...legPositions.map(p=>Math.abs(p.x)))<=width(.442)+.002,'Upper thighs must fit beneath the torso silhouette');
 for(const s of ['L','R']){const arm=parts(g.scene.getObjectByName('Sato_arm_hand_'+s)).flatMap(m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(m.geometry.attributes.position,i))),diameter=x=>{const row=arm.filter(p=>Math.abs(Math.abs(p.x)-x)<1e-5);return Math.max(...row.map(p=>p.y))-Math.min(...row.map(p=>p.y));};assert.ok(diameter(.312)<diameter(.219)*1.05,'The forearm must not bulge wider than the upper arm');}
});

test('central palms and backs are solid flat surfaces and approved finger shafts stay identical',async()=>{
 const g=await load(),expected=JSON.parse(await fs.readFile(new URL('./fixtures/sato-polish-reference.json',import.meta.url)));
 for(const side of ['L','R']){const points=new Set(),rows=new Map();for(const m of parts(g.scene.getObjectByName('Sato_arm_hand_'+side))){const {position:p,skinIndex,skinWeight}=m.geometry.attributes;
  for(let i=0;i<p.count;i++){
   if(Math.abs(p.getX(i))>.455)points.add([...new T.Vector3().fromBufferAttribute(p,i).toArray(),...[0,1,2,3].flatMap(c=>[skinIndex.getComponent(i,c),skinWeight.getComponent(i,c)])].map(v=>v.toFixed(7)).join(','));
   if(Math.abs(p.getX(i))>.405&&Math.abs(p.getX(i))<.430&&p.getZ(i)<.004&&p.getZ(i)>-.012&&skinWeight.getX(i)>.999){const key=p.getX(i).toFixed(6)+':'+Math.sign(p.getY(i)-.678);if(!rows.has(key))rows.set(key,[]);rows.get(key).push(p.getY(i));assert.equal(m.skeleton.bones[skinIndex.getX(i)].name,'DEF-hand'+side);}
  }
 }assert.ok(rows.size>=4);for(const ys of rows.values())assert.ok(Math.max(...ys)-Math.min(...ys)<.00001,'Finger ridges extend into the palm');assert.equal(createHash('sha256').update([...points].sort().join('\n')).digest('hex'),expected.fingerSurfaces[side]);}
});

test('chin remodeling preserves the original mouth and nose surface',async()=>{
 const g=await load(),expected=JSON.parse(await fs.readFile(new URL('./fixtures/sato-polish-reference.json',import.meta.url))),vertices=new Set();
 for(const m of parts(g.scene.getObjectByName('Sato_clean_face'))){const {position:p,uv}=m.geometry.attributes;for(let i=0;i<p.count;i++)if(p.getY(i)>=.757-1e-6&&p.getY(i)<=.802+1e-6&&p.getZ(i)>.03&&Math.abs(p.getX(i))<.06)vertices.add([p.getX(i),p.getY(i),p.getZ(i),uv.getX(i),uv.getY(i)].map(v=>v.toFixed(7)).join(','));}
 assert.equal(createHash('sha256').update([...vertices].sort().join('\n')).digest('hex'),expected.mouthSurface,'Only the chin and lower jaw may project; the mouth must retain its previous surface');
});

test('compact hair is one connected surface and covers the skull without reversed faces',async()=>{
 const g=await load(),hair=parts(g.scene.getObjectByName('Sato_hair_cap')),head=parts(g.scene.getObjectByName('Sato_clean_face')),vertices=new Map(),neighbors=[],triangles=[];
 for(const mesh of hair){const p=mesh.geometry.attributes.position,index=mesh.geometry.index,ids=[];for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(',');if(!vertices.has(key)){vertices.set(key,vertices.size);neighbors.push(new Set());}ids.push(vertices.get(key));}for(let i=0;i<index.count;i+=3){const indices=[0,1,2].map(c=>index.getX(i+c));triangles.push(indices.map(k=>new T.Vector3().fromBufferAttribute(p,k)));for(let c=0;c<3;c++){const a=ids[indices[c]],b=ids[indices[(c+1)%3]];neighbors[a].add(b);neighbors[b].add(a);}}}
 const visited=new Set(),queue=[0];while(queue.length){const i=queue.pop();if(visited.has(i))continue;visited.add(i);queue.push(...[...neighbors[i]].filter(k=>!visited.has(k)));}assert.equal(visited.size,vertices.size,'Fringe and tips must belong to one connected surface');assert.equal(g.scene.getObjectByName('Sato_hair_locks'),undefined);
 const headTriangles=head.flatMap(mesh=>{const p=mesh.geometry.attributes.position,index=mesh.geometry.index;return Array.from({length:index.count/3},(_,i)=>[0,1,2].map(c=>new T.Vector3().fromBufferAttribute(p,index.getX(i*3+c))));}),ray=new T.Ray(),hit=new T.Vector3(),normal=new T.Vector3();
 for(const y of [.900,.912,.925,.933])for(let k=0;k<64;k++){const a=k*2*Math.PI/64;ray.set(new T.Vector3(0,y,0),new T.Vector3(Math.sin(a),0,Math.cos(a)));let hairDistance=Infinity,headDistance=Infinity,nearest;
  for(const t of triangles)if(ray.intersectTriangle(...t,false,hit)){const d=ray.origin.distanceTo(hit);if(d<hairDistance){hairDistance=d;nearest=t;}}
  for(const t of headTriangles)if(ray.intersectTriangle(...t,false,hit))headDistance=Math.min(headDistance,ray.origin.distanceTo(hit));
  assert.ok(Number.isFinite(hairDistance)&&hairDistance>headDistance+.001,'The scalp must stay covered at the crown and temples');T.Triangle.getNormal(...nearest,normal);assert.ok(normal.dot(ray.direction)>0,'An inverted hair panel would expose the skull');
 }
 const points=hair.flatMap(m=>Array.from({length:m.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(m.geometry.attributes.position,i)));assert.ok(Math.max(...points.map(p=>p.y))<.980,'Hair must follow the skull instead of forming a tall crown');
});

test('the neckline clears the neck at the front and nape across moving poses',async()=>{
 const g=await load(),head=parts(g.scene.getObjectByName('Sato_clean_face')),shirt=parts(g.scene.getObjectByName('Sato_shirt')),rim=[],seen=new Set();
 for(const mesh of shirt){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=(x/.043)**2+((z-.003)/.046)**2,key=[x,y,z].map(v=>v.toFixed(7)).join(',');if(y>.690&&y<.700&&r>.91&&r<1.01&&!seen.has(key)){seen.add(key);rim.push([mesh,i]);}}}assert.equal(rim.length,48);
 const mixer=new T.AnimationMixer(g.scene),ray=new T.Ray(),hit=new T.Vector3();
 for(const name of ['Idle_Loop','Walk_Loop','Sprint_Loop','Crouch_Fwd_Loop','Punch_Jab','Punch_Cross','Sword_Attack','Pistol_Idle_Loop','Jump_Start']){
  mixer.stopAllAction();const clip=g.animations.find(c=>c.name==='Rig|'+name),action=mixer.clipAction(clip).play();
  for(const phase of [0,.25,.5,.75]){action.time=clip.duration*phase;mixer.update(0);update(g);const triangles=[];for(const mesh of head){const p=mesh.geometry.attributes.position,index=mesh.geometry.index,positions=Array.from({length:p.count},(_,i)=>posed(mesh,i));for(let i=0;i<index.count;i+=3)triangles.push([positions[index.getX(i)],positions[index.getX(i+1)],positions[index.getX(i+2)]]);}
   // Offset the center slightly so a ray cannot land exactly on a shared triangle edge.
   for(const [mesh,i]of rim){const p=mesh.geometry.attributes.position,origin=posed(mesh,i),center=posed(mesh,i,new T.Vector3(.000017,p.getY(i)+.000023,.000011)),distance=origin.distanceTo(center);ray.set(origin,center.sub(origin).normalize());let nearest=Infinity;for(const triangle of triangles)if(ray.intersectTriangle(...triangle,false,hit))nearest=Math.min(nearest,origin.distanceTo(hit));assert.ok(nearest>.001&&nearest<distance,`${name} phase ${phase}: neckline intersects the neck; bind ${[p.getX(i),p.getY(i),p.getZ(i)]}, clearance ${nearest}, center distance ${distance}`);}
  }
 }
});

test('elbow cross-sections retain volume through every clip, including the sword twist',async()=>{
 const g=await load(),rings=[];
 for(const s of ['L','R'])for(const x of [.260,.269,.277,.285,.296]){
  const unique=new Map();for(const m of parts(g.scene.getObjectByName('Sato_arm_hand_'+s))){const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++)if(Math.abs(Math.abs(p.getX(i))-x)<1e-5){const v=new T.Vector3().fromBufferAttribute(p,i);unique.set(v.toArray().join(','),{m,i,v});}}
  const ring=[...unique.values()],center=ring.reduce((p,r)=>p.add(r.v),new T.Vector3()).divideScalar(ring.length);assert.ok(ring.length>=8);ring.sort((a,b)=>Math.atan2(a.v.y-center.y,a.v.z-center.z)-Math.atan2(b.v.y-center.y,b.v.z-center.z));rings.push(ring);
 }
 function area(r,animated){const points=r.map(({m,i,v})=>animated?posed(m,i,v.clone()):v.clone()),center=points.reduce((a,b)=>a.add(b),new T.Vector3()).divideScalar(points.length),normal=new T.Vector3();for(let i=0;i<points.length;i++)normal.add(points[i].clone().sub(center).cross(points[(i+1)%points.length].clone().sub(center)));return normal.length()/2;}
 const reference=rings.map(r=>area(r,false)),mixer=new T.AnimationMixer(g.scene);
 for(const clip of g.animations){const action=mixer.clipAction(clip).setLoop(T.LoopOnce,1).play();action.clampWhenFinished=true;for(let k=0;k<=20;k++){action.time=clip.duration*k/20;mixer.update(0);update(g);rings.forEach((r,i)=>assert.ok(area(r,true)/reference[i]>.45,`${clip.name} phase ${k/20}: collapsed elbow section`));}mixer.stopAllAction();}
});

test('flexed hips have filled volume between the pelvis and upper thigh',async()=>{
 const g=await load(),meshes=parts(g.scene.getObjectByName('Sato_trousers')),mixer=new T.AnimationMixer(g.scene),ray=new T.Ray(),hit=new T.Vector3();
 for(const name of ['Sprint_Loop','Crouch_Fwd_Loop','Punch_Cross','Sword_Attack','Fixing_Kneeling']){
  const clip=g.animations.find(c=>c.name==='Rig|'+name),action=mixer.clipAction(clip).setLoop(T.LoopOnce,1).play();action.clampWhenFinished=true;
  for(let f=0;f<=8;f++){action.time=clip.duration*f/8;mixer.update(0);update(g);const triangles=meshes.flatMap(m=>{const p=m.geometry.attributes.position,index=m.geometry.index,positions=Array.from({length:p.count},(_,i)=>posed(m,i));return Array.from({length:index.count/3},(_,i)=>[0,1,2].map(c=>positions[index.getX(i*3+c)]));});
   for(const s of ['L','R']){const hip=point(g,'DEF-thigh'+s),axis=point(g,'DEF-shin'+s).sub(hip).normalize(),u=axis.clone().cross(new T.Vector3(0,0,1)).normalize(),v=axis.clone().cross(u).normalize();for(const d of [.008,.02,.035])for(let k=0;k<16;k++){
    ray.set(hip.clone().addScaledVector(axis,d),u.clone().multiplyScalar(Math.cos(k*Math.PI/8)).addScaledVector(v,Math.sin(k*Math.PI/8)));let nearest=Infinity;for(const t of triangles)if(ray.intersectTriangle(...t,false,hit))nearest=Math.min(nearest,ray.origin.distanceTo(hit));assert.ok(Number.isFinite(nearest)&&nearest>(d<.03?.012:.001),`${name} phase ${f/8}: unfilled hip ${s}, depth ${d}, ray ${k}`);
   }}
  }mixer.stopAllAction();
 }
});


