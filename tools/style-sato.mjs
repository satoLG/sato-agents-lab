// Rebuild Sato around the existing 53-joint bind pose. No rig retargeting.
// node tools/style-sato.mjs [anatomy-revision-1.glb] [output.glb]
import fs from 'node:fs';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const input=process.argv[2]||'static/models/sato.glb', output=process.argv[3]||input;
const bytes=fs.readFileSync(input),jl=bytes.readUInt32LE(12);
const doc=JSON.parse(bytes.subarray(20,20+jl));
if(doc.extras?.sato?.styleRevision===2){fs.writeFileSync(output,bytes);console.log('Sato style revision already applied.');process.exit(0);}
const bin=bytes.subarray(28+jl,28+jl+bytes.readUInt32LE(20+jl));
const loader=new GLTFLoader();loader.register(p=>({name:'authoring',beforeRoot(){p.loadTexture=async()=>null;}}));
const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
scene.updateMatrixWorld(true);
const jointNames=doc.skins[0].joints.map(i=>doc.nodes[i].name);
if(jointNames.length!==53||!doc.animations.some(a=>a.name==='Hands_Open_Close'))throw Error('Use the Quaternius Sato after the anatomy/hand revision.');
const joint=n=>{const i=jointNames.indexOf(n);if(i<0)throw Error(n);return i;};
const point=n=>scene.getObjectByName(n.replaceAll('.','')).getWorldPosition(new T.Vector3());
const V=(x,y,z)=>new T.Vector3(x,y,z),clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
const mix=(a,b,t)=>({[a]:1-t,[b]:t});
const solid=n=>({[n]:1});
const headWeight=y=>y>.726?solid('DEF-head'):mix('DEF-neck','DEF-head',clamp((y-.693)/.033,0,1));
const chunks=[bin];let length=bin.length;
function buffer(data){const padding=(4-length%4)%4;if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}const index=doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length})-1;chunks.push(data);length+=data.length;return index;}
function attribute(values,type,integer=false){const size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type],a={bufferView:buffer(Buffer.from(new (integer?Uint16Array:Float32Array)(values).buffer)),componentType:integer?5123:5126,count:values.length/size,type};if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<values.length;i++){a.min[i%3]=Math.min(a.min[i%3],values[i]);a.max[i%3]=Math.max(a.max[i%3],values[i]);}}return doc.accessors.push(a)-1;}

// Tiny deterministic pixel-art atlas authoring, kept with the mesh source.
const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
class Pixels{
 constructor(w,h,color){this.w=w;this.h=h;this.data=Buffer.alloc(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)this.dot(x,y,color);}
 dot(x,y,c){x=Math.round(x);y=Math.round(y);if(x<0||x>=this.w||y<0||y>=this.h)return;const i=(y*this.w+x)*4;this.data.set([...rgb(c),255],i);}
 polygon(points,c){for(let y=Math.floor(Math.min(...points.map(p=>p[1])));y<=Math.ceil(Math.max(...points.map(p=>p[1])));y++){const cuts=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))cuts.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}cuts.sort((a,b)=>a-b);for(let i=0;i<cuts.length;i+=2)for(let x=Math.ceil(cuts[i]);x<=Math.floor(cuts[i+1]);x++)this.dot(x,y,c);}}
 ellipse(cx,cy,rx,ry,c){for(let y=Math.floor(cy-ry);y<=cy+ry;y++)for(let x=Math.floor(cx-rx);x<=cx+rx;x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1)this.dot(x,y,c);}
 line(points,c,width=1){for(let k=1;k<points.length;k++){const a=points[k-1],b=points[k],steps=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]))*2;for(let i=0;i<=steps;i++)this.ellipse(lerp(a[0],b[0],i/steps),lerp(a[1],b[1],i/steps),width/2,width/2,c);}}
 png(){const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};const chunk=(type,data)=>{const t=Buffer.from(type),l=Buffer.alloc(4),c=Buffer.alloc(4);l.writeUInt32BE(data.length);c.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([l,t,data,c]);};const h=Buffer.alloc(13);h.writeUInt32BE(this.w);h.writeUInt32BE(this.h,4);h[8]=8;h[9]=6;const rows=[];for(let y=0;y<this.h;y++)rows.push(Buffer.from([0]),this.data.subarray(y*this.w*4,(y+1)*this.w*4));return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);}
}
const faceMap=new Pixels(256,256,'#edbd9b');
const F=(x,y)=>[(x/.2+.5)*255,(1-(y-.70)/.25)*255];
const poly=(p,c)=>faceMap.polygon(p.map(([x,y])=>F(x,y)),c);
const line=(p,c,w)=>faceMap.line(p.map(([x,y])=>F(x,y)),c,w);
poly([[-.10,.78],[-.075,.778],[-.04,.736],[.04,.736],[.075,.778],[.10,.78],[.10,.70],[-.10,.70]],'#d9a383');
for(const sign of [-1,1]){
 const p=(x,y)=>[sign*x,y],sh=(arr,c)=>poly(arr.map(([x,y])=>p(x,y)),c);
 sh([[.023,.796],[.04,.794],[.064,.796],[.072,.805],[.065,.809],[.031,.808]],'#e8ae96');
 sh([[.022,.826],[.031,.839],[.060,.842],[.074,.836],[.071,.820],[.060,.810],[.037,.811]],'#faf0db');
 sh([[.024,.826],[.032,.838],[.059,.841],[.073,.836],[.072,.832],[.058,.837],[.034,.835]],'#44302d');
 const [cx,cy]=F(sign*.047,.825);
 faceMap.ellipse(cx,cy,13,16,'#654234');faceMap.ellipse(cx,cy+4,11,11,'#966744');faceMap.ellipse(cx,cy-3,9,12,'#34272a');
 faceMap.ellipse(cx-sign*4,cy-8,3.6,3.6,'#fff6e6');faceMap.ellipse(cx+sign*4,cy+8,1.6,1.6,'#dcb482');
 sh([[.021,.851],[.031,.859],[.057,.864],[.073,.859],[.072,.855],[.054,.858],[.034,.855]],'#51382e');
 line([[sign*.028,.810],[sign*.04,.807],[sign*.061,.808]],'#ce927b',1.4);
 sh([[.077,.798],[.084,.803],[.084,.808],[.079,.806]],'#f5ccac');
 // A short, painted beard leaves the cheek planes and lips readable.
 sh([[.079,.776],[.065,.758],[.039,.739],[.018,.731],[.018,.738],[.044,.747],[.068,.768]],'#a47a64');
}
poly([[-.010,.803],[0,.795],[.009,.802],[.004,.793],[-.003,.792]],'#cd8f78');
poly([[-.004,.802],[0,.809],[.003,.802]],'#f8d4b3');
line([[-.020,.770],[-.009,.772],[0,.770],[.009,.772],[.022,.773]],'#9b6557',2);
line([[-.012,.763],[0,.761],[.013,.764]],'#f7d0ae',2);
poly([[-.014,.744],[-.008,.741],[.012,.743],[.018,.748],[.009,.746],[-.004,.746]],'#b1836b');
const hairMap=new Pixels(128,128,'#503730');
for(let k=0;k<8;k++){
 const x=k*16;hairMap.polygon([[x,0],[x+11,0],[x+15,32],[x+10,77],[x+4,105],[x+8,60]],k%2?'#573c33':'#5c4035');
 hairMap.polygon([[x+6,38],[x+12,36],[x+11,40],[x+9,43],[x+7,41],[x+4,45],[x+3,42]],'#71513e');
 hairMap.polygon([[x+1,87],[x+7,67],[x+6,92],[x,117]],'#47302b');
}

// Remove the old appearance. Bone nodes and every animation channel stay intact.
for(const n of doc.nodes){delete n.mesh;delete n.skin;}
doc.meshes=[];doc.materials=[];doc.images=[];doc.textures=[];doc.samplers=[{magFilter:9728,minFilter:9728,wrapS:33071,wrapT:33071}];
delete doc.extensionsUsed;delete doc.extensionsRequired;
function texture(name,pixels){const image=doc.images.push({name,mimeType:'image/png',bufferView:buffer(pixels.png())})-1;return doc.textures.push({source:image,sampler:0})-1;}
function material(name,color,tex=null,fill=0){const m={name,pbrMetallicRoughness:{baseColorFactor:[...new T.Color(color).toArray(),1],metallicFactor:0,roughnessFactor:1}};if(tex!==null){m.pbrMetallicRoughness.baseColorTexture={index:tex};if(fill){m.emissiveTexture={index:tex};m.emissiveFactor=[fill,fill,fill];}}return doc.materials.push(m)-1;}
const skin=material('Sato · warm peach skin','#edbd9b'),face=material('Sato · painted anime face','#ffffff',texture('Sato face · 256px',faceMap),.12);
const hair=material('Sato · painted chestnut hair','#ffffff',texture('Sato hair · 128px',hairMap),.08);
const hairShadow=material('Sato · hair underside','#402b26'),earInset=material('Sato · ear fold','#d2957e');
const shirt=material('Sato · midnight cotton','#263747'),shirtShadow=material('Sato · collar rib','#172731'),teal=material('Sato · muted jade accent','#75afa8');
const denim=material('Sato · slate denim','#536b88'),denimShadow=material('Sato · denim seams','#3c506c');
const leather=material('Sato · coffee sneakers','#735144'),leatherLight=material('Sato · warm leather facing','#956e56'),sole=material('Sato · ivory sole','#d4c9b1'),outsole=material('Sato · charcoal outsole','#393b40'),frames=material('Sato · graphite spectacles','#29323a');

class Mesh{
 constructor(name,flat=false){this.name=name;this.flat=flat;this.p=[];this.w=[];this.uv=[];this.faces=[];}
 vertex(p,w,uv=[.5,.5]){this.p.push(p.clone());this.w.push(w);this.uv.push(uv);return this.p.length-1;}
 face(ids,mat,outward){if(ids.length<3)return;const [a,b,c]=ids.map(i=>this.p[i]);if(outward&&b.clone().sub(a).cross(c.clone().sub(a)).dot(outward)<0)ids=[...ids].reverse();this.faces.push({ids,mat});}
 bridge(a,b,mat,ca,cb){if(a.length!==b.length)throw Error('Loop mismatch');const center=ca.clone().add(cb).multiplyScalar(.5);for(let k=0;k<a.length;k++){const n=(k+1)%a.length,ids=[a[k],a[n],b[n],b[k]],out=ids.reduce((v,i)=>v.add(this.p[i]),V(0,0,0)).multiplyScalar(.25).sub(center);this.face(ids,mat,out);}}
 cap(loop,mat,normal){this.face(loop,mat,normal);}
 emit(parent){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(this.p.flatMap(p=>p.toArray()),3));const index=[];for(const f of this.faces)for(let k=1;k<f.ids.length-1;k++)index.push(f.ids[0],f.ids[k],f.ids[k+1]);g.setIndex(index);g.computeVertexNormals();const primitives=[];
  // Split render corners at planar faces; keep identical positions and weights.
  for(const mat of new Set(this.faces.map(f=>f.mat))){const tri=[],corners=new Map();for(const [fi,f]of this.faces.entries()){if(f.mat!==mat)continue;const flat=typeof this.flat==='function'?this.flat(f):this.flat,n=V(0,0,0);for(let k=0;k<f.ids.length;k++)n.add(this.p[f.ids[k]].clone().cross(this.p[f.ids[(k+1)%f.ids.length]]));n.normalize();const key=i=>{const id=flat?`${fi}:${i}`:i;if(!corners.has(id))corners.set(id,{i,n:flat?n:null});return id;};for(let k=1;k<f.ids.length-1;k++){const ids=[f.ids[0],f.ids[k],f.ids[k+1]],a=this.p[ids[0]],b=this.p[ids[1]],c=this.p[ids[2]];if(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()>1e-20)tri.push(...ids.map(key));}}
   const used=[...new Set(tri)],map=new Map(used.map((i,k)=>[i,k])),pos=[],normal=[],uv=[],si=[],sw=[];
   for(const key of used){const {i,n:plane}=corners.get(key);pos.push(...this.p[i].toArray());let n=plane?.clone()||V().fromBufferAttribute(g.attributes.normal,i);if(n.lengthSq()<.01)n=V(0,1,0);normal.push(...n.normalize().toArray());uv.push(...this.uv[i]);const w=Object.entries(this.w[i]).filter(([,v])=>v>1e-7).sort((a,b)=>b[1]-a[1]).slice(0,4),total=w.reduce((a,[,v])=>a+v,0);for(let c=0;c<4;c++){si.push(w[c]?joint(w[c][0]):0);sw.push(w[c]?w[c][1]/total:0);}}
   const attributes={POSITION:attribute(pos,'VEC3'),NORMAL:attribute(normal,'VEC3'),JOINTS_0:attribute(si,'VEC4',true),WEIGHTS_0:attribute(sw,'VEC4')};if(doc.materials[mat].pbrMetallicRoughness.baseColorTexture)attributes.TEXCOORD_0=attribute(uv,'VEC2');primitives.push({attributes,indices:attribute(tri.map(i=>map.get(i)),'SCALAR',true),material:mat});
  }
  const mesh=doc.meshes.push({name:this.name,primitives})-1,node=doc.nodes.push({name:this.name,mesh,skin:0})-1;(parent===undefined?doc.scenes[doc.scene||0].nodes:(doc.nodes[parent].children??=[])).push(node);return node;
 }
}

// Head/neck loft: flat cheek planes and an explicit mandibular corner.
const headRings=[
 [.670,.033,.032,.031],[.693,.034,.034,.033],[.713,.035,.035,.034],
 [.727,.030,.064,.030],[.740,.047,.072,.041],[.757,.069,.080,.054],
 [.779,.080,.086,.065],[.802,.085,.091,.073],[.826,.089,.092,.080],
 [.851,.090,.091,.081],[.878,.087,.086,.079],[.902,.075,.073,.070],
 [.922,.052,.049,.050],[.936,.016,.014,.015]
];
function profile(rows,y){for(let i=1;i<rows.length;i++)if(y<=rows[i][0]){const a=rows[i-1],b=rows[i],t=clamp((y-a[0])/(b[0]-a[0]),0,1);return a.map((v,k)=>lerp(v,b[k],t));}return rows.at(-1);}
function headAt(y,a){const [,rx,f,b]=profile(headRings,y),s=Math.sin(a),c=Math.cos(a);const x=rx*s;let z=(c>=0?f:b)*Math.sign(c)*Math.abs(c)**(c>=0?.38:.7);const nose=clamp(1-Math.abs(x)/.014,0,1)*clamp(1-Math.abs(y-.802)/.029,0,1);z+=c>0?.015*nose:0;return V(x,y,z);}
const angles=[-Math.PI,-2.65,-2.15,-Math.PI/2,-1.15,-.8,-.4,-.13,0,.13,.4,.8,1.15,Math.PI/2,2.15,2.65],hn=angles.length;
const hm=new Mesh('Sato_clean_face',f=>f.ids.every(i=>hm.p[i].y>=.726&&hm.p[i].y<=.779)),hr=[];
for(const [y]of headRings)hr.push(angles.map(a=>{const p=headAt(y,a);return hm.vertex(p,headWeight(y),[p.x/.2+.5,1-(y-.70)/.25]);}));
for(let j=0;j<hr.length-1;j++)for(let i=0;i<hn;i++){const k=(i+1)%hn,mid=(angles[i]+(k?angles[k]:Math.PI))/2;hm.face([hr[j][i],hr[j][k],hr[j+1][k],hr[j+1][i]],j>=2&&Math.abs(mid)<1.41?face:skin,V(Math.sin(mid),0,Math.cos(mid)));}
hm.cap(hr[0],skin,V(0,-1,0));hm.cap(hr.at(-1),skin,V(0,1,0));hm.emit();
for(const s of [-1,1]){
 const ear=new Mesh(`Sato_ear_${s}`),outline=[[-.014,-.021],[-.018,.002],[-.012,.023],[.002,.028],[.012,.017],[.011,-.010],[.003,-.026]],rings=[];
 for(const [x,scale,z]of [[.083,.79,.002],[.098,1,.006],[.106,.82,.012]])rings.push(outline.map(([dz,dy])=>ear.vertex(V(s*x,.818+dy*scale,z+dz*scale),solid('DEF-head'))));
 for(let j=1;j<rings.length;j++)ear.bridge(rings[j-1],rings[j],skin,V(s*.09,.818,0),V(s*.098,.818,.01));ear.cap(rings[0],skin,V(-s,0,0));ear.cap(rings.at(-1),earInset,V(s,0,1));ear.emit();
}

const hairRings=[[.730,.045,.065,.049],[.750,.063,.079,.069],[.775,.083,.092,.080],[.805,.096,.103,.090],[.850,.101,.108,.096],[.889,.103,.112,.095],[.916,.092,.104,.085],[.940,.062,.071,.059],[.954,.010,.013,.011]];
function hairAt(y,a,offset=0){const [,rx,f,b]=profile(hairRings,y),s=Math.sin(a),c=Math.cos(a);return V((rx+offset)*Math.sign(s)*Math.abs(s)**.9,y,(c>=0?f+offset:b+offset)*Math.sign(c)*Math.abs(c)**.75);}
function hairline(a){const t=Math.abs(a);if(t<1.55){const heights=[.817,.846,.834,.865,.847,.878,.858,.883,.874,.900,.888,.867,.865,.837,.820],u=clamp(a/(Math.PI/16)+7,0,14),i=Math.min(13,Math.floor(u));return lerp(heights[i],heights[i+1],u-i);}const rows=[[1.55,.814],[1.6,.811],[1.92,.784],[2.4,.747],[Math.PI,.736]];for(let i=1;i<rows.length;i++)if(t<=rows[i][0])return lerp(rows[i-1][1],rows[i][1],(t-rows[i-1][0])/(rows[i][0]-rows[i-1][0]));return .736;}
const hc=new Mesh('Sato_hair_cap',f=>f.ids.every(i=>hc.p[i].z>0)),hloops=[],N=32;
for(let j=0;j<=7;j++){const loop=[];for(let i=0;i<=N;i++){const a=-Math.PI+i*2*Math.PI/N,base=hairline(a)+.002*Math.sin(a*7),y=lerp(base,.954,j/7),p=hairAt(y,a);if(Math.abs(a)<1.55&&j>=6)p.y+=.005*Math.sin(a*3+1.2)*(j-5)/2;loop.push(hc.vertex(p,solid('DEF-head'),[i/N,1-j/8]));}hloops.push(loop);}
for(let j=1;j<hloops.length;j++)hc.bridge(hloops[j-1],hloops[j],hair,V(0,.85,0),V(0,.87,0));hc.cap(hloops.at(-1),hair,V(0,1,0));
const inner=hloops[0].map(i=>{const p=hc.p[i].clone();p.x*=.92;p.z*=.92;return hc.vertex(p,solid('DEF-head'));});hc.bridge(inner,hloops[0],hairShadow,V(0,.83,0),V(0,.83,0));hc.emit();
const locks=new Mesh('Sato_hair_locks',true);
// The cap itself supplies the jagged fringe. Shallow ridges lie on that
// continuous surface, so the wisps cannot float apart from the hairstyle.
for(const [k,tipAngle]of [-1.178,-.982,-.589,-.196,.196,.785,1.178].entries()){
 let prev,pc;
 for(const [j,t]of [.75,.45,.18,0].entries()){
  const a=tipAngle+.20*t,base=hairline(a)+.002*Math.sin(a*7),y=lerp(base,.954,t),center=hairAt(y,a),half=[.14,.17,.10,.002][j],depth=[.001,.004,.006,.001][j],front=[],back=[];
  for(let i=0;i<3;i++){const theta=a+(i-1)*half,yy=Math.max(hairline(theta)+.002*Math.sin(theta*7),y),p=hairAt(yy,theta);p.z+=i===1?depth:.0005;front.push(locks.vertex(p,solid('DEF-head'),[(k+i/2)*.125,.85-.74*(1-t)]));back.push(locks.vertex(p.clone().add(V(0,0,-.002)),solid('DEF-head')));}
  const ring=[...front,...back.toReversed()];if(prev)locks.bridge(prev,ring,hair,pc,center);else locks.cap(ring,hairShadow,V(0,1,0));prev=ring;pc=center;
 }
 locks.cap(prev,hairShadow,V(0,-1,0));
}
locks.emit();

// Spectacles use slim polygonal rims so the painted sclera and iris stay visible.
const glasses=new Mesh('Sato_glasses');
function rod(m,a,b,r,mat,w=solid('DEF-head'),sides=6){const axis=b.clone().sub(a).normalize(),u=axis.clone().cross(Math.abs(axis.y)<.9?V(0,1,0):V(0,0,1)).normalize(),v=axis.clone().cross(u).normalize(),rings=[a,b].map(p=>Array.from({length:sides},(_,i)=>m.vertex(p.clone().addScaledVector(u,r*Math.cos(i*2*Math.PI/sides)).addScaledVector(v,r*Math.sin(i*2*Math.PI/sides)),w)));m.bridge(rings[0],rings[1],mat,a,b);m.cap(rings[0],mat,axis.clone().negate());m.cap(rings[1],mat,axis);}
for(const s of [-1,1]){
 const p=[[.012,.841],[.071,.844],[.082,.834],[.074,.806],[.023,.805],[.013,.816]].map(([x,y])=>V(s*x,y,.105-.030*(x/.09)**2));
 for(let i=0;i<p.length;i++)rod(glasses,p[i],p[(i+1)%p.length],i<3?.0015:.00115,frames);
 rod(glasses,p[2],V(s*.098,.831,.004),.0014,frames);rod(glasses,V(s*.098,.831,.004),V(s*.097,.818,-.008),.0015,frames);
}
rod(glasses,V(-.012,.837,.104),V(0,.842,.108),.0014,frames);rod(glasses,V(0,.842,.108),V(.012,.837,.104),.0014,frames);glasses.emit();

const spineWeight=y=>{const stations=[['DEF-hips',.4195],['DEF-spine.001',.4754],['DEF-spine.002',.5312],['DEF-spine.003',.587]];for(let i=1;i<stations.length;i++)if(y<stations[i][1])return mix(stations[i-1][0],stations[i][0],clamp((y-stations[i-1][1])/(stations[i][1]-stations[i-1][1]),0,1));return solid('DEF-spine.003');};
const sm=new Mesh('Sato_shirt',true),sr=[],sn=24,shirtRings=[[.432,.092,.056],[.442,.092,.056],[.488,.074,.048],[.537,.078,.051],[.583,.094,.056],[.621,.096,.053],[.650,.098,.049],[.685,.106,.043],[.708,.110,.039]];
const cross=(s,power=.6)=>Math.sign(s)*Math.abs(s)**power;
for(const [y,rx,rz]of shirtRings)sr.push(Array.from({length:sn},(_,i)=>{const a=i*2*Math.PI/sn,x=rx*cross(Math.sin(a)),drop=y>.70?(Math.cos(a)>0?.030:.021)*Math.cos(a)**2+.008*Math.sin(a)**2:y>.68?(Math.cos(a)>0?.017:.009)*Math.cos(a)**2:0,yy=y-drop,p=V(x,yy,rz*cross(Math.cos(a))+.010);let w=spineWeight(y);if(y>.62&&Math.abs(x)>.070){const t=clamp((Math.abs(x)-.070)/.051,0,1),s=x>0?'L':'R';w={'DEF-spine.003':1-t,[`DEF-shoulder.${s}`]:t*.35,[`DEF-upper_arm.${s}`]:t*.65};}return sm.vertex(p,w);}));
for(let j=0;j<sr.length-1;j++)for(let i=0;i<sn;i++){const cut=j>=6&&([4,5,6,7,16,17,18,19].includes(i));if(!cut)sm.face([sr[j][i],sr[j][(i+1)%sn],sr[j+1][(i+1)%sn],sr[j+1][i]],j===0?shirtShadow:shirt,V(Math.sin((i+.5)*Math.PI/12),0,Math.cos((i+.5)*Math.PI/12)));}
const collar=Array.from({length:sn},(_,i)=>{const a=i*2*Math.PI/sn;return sm.vertex(V(.036*Math.sin(a),.700-.005*Math.max(0,Math.cos(a)),.034*Math.cos(a)+.010),solid('DEF-spine.003'));});
for(let i=0;i<sn;i++)sm.face([sr.at(-1)[i],sr.at(-1)[(i+1)%sn],collar[(i+1)%sn],collar[i]],shirt,V(0,1,0));const collarInner=collar.map(i=>{const p=sm.p[i].clone();p.x*=.92;p.y-=.003;p.z=.010+(p.z-.010)*.92;return sm.vertex(p,solid('DEF-spine.003'));});sm.bridge(collar,collarInner,shirtShadow,V(0,.7,.01),V(0,.7,.01));
sm.cap(sr[0],shirtShadow,V(0,-1,0));
for(const [side,start,sign]of [['L',4,1],['R',16,-1]]){
 const loop=[...Array.from({length:5},(_,i)=>sr[6][start+i]),sr[7][start+4],sr[8][start+4],...Array.from({length:4},(_,i)=>sr[8][start+3-i]),sr[7][start]],center=V(sign*.105,.680,.010);let prev=loop,prevCenter=center;
 const angular=loop.map(i=>Math.atan2(sm.p[i].z-center.z,sm.p[i].y-center.y));
 for(const [x,ry,rz]of [[.139,.028,.029],[.172,.027,.028],[.197,.025,.027],[.201,.025,.027]]){const cy=lerp(.6984,.6803,(x-.1074)/(.2768-.1074)),c=V(sign*x,cy,.010),w=solid(`DEF-upper_arm.${side}`),ring=angular.map(a=>sm.vertex(c.clone().add(V(0,ry*cross(Math.cos(a),.8),rz*cross(Math.sin(a),.8))),w));sm.bridge(prev,ring,x>.198?shirtShadow:shirt,prevCenter,c);prev=ring;prevCenter=c;}
}
sm.emit();
const badge=new Mesh('Sato_chest_mark'),bw=solid('DEF-spine.003');
for(const [x,y]of [[.038,.608],[.054,.608],[.054,.592],[.038,.592]])badge.vertex(V(x,y,.064),bw);badge.face([0,1,2,3],teal,V(0,0,1));badge.emit();

// Forearms, wrists, palms, four finger branches and thumb share one surface.
for(const [s,sign]of [['L',1],['R',-1]]){
 const am=new Mesh(`Sato_arm_hand_${s}`,f=>f.ids.every(i=>Math.abs(am.p[i].x)<.394)),hand=`DEF-hand.${s}`,fore=`DEF-forearm.${s}`,upper=`DEF-upper_arm.${s}`;
 const fingers=['pinky','ring','middle','index'].map(f=>({f,n:[1,2,3].map(i=>`DEF-f_${f}.0${i}.${s}`)}));
 for(const f of fingers){f.points=f.n.map(n=>{const p=point(n);p.z=.001+(p.z-.001)*1.50;return p;});f.base=f.points[0].clone().add(V(sign*.004,0,0));f.radius=({pinky:.0048,ring:.0057,middle:.0060,index:.0058})[f.f];f.loop=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return am.vertex(f.base.clone().add(V(0,cross(Math.cos(a),.55)*f.radius*.85,cross(Math.sin(a),.55)*f.radius)),mix(hand,f.n[0],.15));});}
 const top=fingers.flatMap(f=>[6,7,0,1,2].map(i=>f.loop[i])),bottom=fingers.flatMap(f=>[6,5,4,3,2].map(i=>f.loop[i]));
 const zmin=am.p[top[0]].z,zmax=am.p[top.at(-1)].z,columns=top.length,rows=[0,.25,.60,1],tg=[],bg=[];
 for(let r=0;r<rows.length;r++){const t=rows[r],tt=[],bb=[];for(let c=0;c<columns;c++){
  if(r===rows.length-1){tt.push(top[c]);bb.push(bottom[c]);continue;}
  const distal=am.p[top[c]],u=(distal.z-zmin)/(zmax-zmin),z=lerp(lerp(-.016,.018,u),distal.z,t),x=lerp(.39398,Math.abs(distal.x),t),cy=lerp(.6780,distal.y-(distal.y-.678)*t,t),thick=(.0095+.001*Math.sin(t*Math.PI))*Math.min(1,Math.sin(u*Math.PI)*3);
  const w=t>.6?mix(hand,fingers[Math.floor(c/5)].n[0],.08):solid(hand),p=V(sign*x,cy+thick,z),q=V(sign*x,cy-thick,z),ti=am.vertex(p,w);tt.push(ti);bb.push(thick<1e-9?ti:am.vertex(q,w));
 }tg.push(tt);bg.push(bb);}
 const thumbColumn=columns-6,thumbBoundary=[];
 for(let r=0;r<rows.length-1;r++)for(let c=0;c<columns-1;c++){
  am.face([tg[r][c],tg[r][c+1],tg[r+1][c+1],tg[r+1][c]],skin,V(0,1,0));
  if(!(r>=0&&r<=1&&c>=thumbColumn&&c<thumbColumn+2))am.face([bg[r][c],bg[r+1][c],bg[r+1][c+1],bg[r][c+1]],skin,V(0,-1,0));
 }
 thumbBoundary.push(bg[0][thumbColumn],bg[0][thumbColumn+1],bg[0][thumbColumn+2],bg[1][thumbColumn+2],bg[2][thumbColumn+2],bg[2][thumbColumn+1],bg[2][thumbColumn],bg[1][thumbColumn]);
 let wrist=[...tg[0],...bg[0].slice(1,-1).toReversed()],wCenter=V(sign*.39398,.678,.001);
 // Match the beveled forearm rings to the exact palm perimeter, no wrist seam.
 const wristAngles=wrist.map(i=>Math.atan2((am.p[i].z-.001)/.017, (am.p[i].y-.678)/.0095));
 let prev,pc;
 const stations=[[.190,.022,.022],[.219,.021,.021],[.248,.020,.020],[.267,.018,.019],[.277,.018,.019],[.287,.020,.021],[.312,.024,.023],[.351,.019,.021],[.382,.012,.018]];
 for(const [x,ry,rz]of stations){const cy=x<.277?lerp(.6984,.6803,(x-.1074)/.1694):lerp(.6803,.678,(x-.2768)/.1172),cz=lerp(.010,.003,(x-.197)/(.394-.197)),c=V(sign*x,cy,cz);let w=x<.260?solid(upper):x<.294?mix(upper,fore,clamp((x-.260)/.034,0,1)):x<.375?solid(fore):mix(fore,hand,clamp((x-.375)/.025,0,1));const ring=wristAngles.map(a=>am.vertex(c.clone().add(V(0,ry*cross(Math.cos(a)),rz*cross(Math.sin(a)))),w));if(prev)am.bridge(prev,ring,skin,pc,c);else am.cap(ring,skin,V(-sign,0,0));prev=ring;pc=c;}
 am.bridge(prev,wrist,skin,pc,wCenter);
 function digit(names,points,startLoop,startCenter,radius){let previous=startLoop,center=startCenter;
  const last=points[2].clone().add(points[2].clone().sub(points[1]).normalize().multiplyScalar(radius*.65));
  const specs=[[points[0].clone().lerp(points[1],.35),mix(names[0],names[1],.08),radius],[points[1].clone().lerp(points[0],.13),mix(names[0],names[1],.35),radius*.95],[points[1].clone().lerp(points[2],.13),mix(names[0],names[1],.75),radius*.93],[points[1].clone().lerp(points[2],.65),solid(names[1]),radius*.89],[points[2].clone().lerp(points[1],.13),mix(names[1],names[2],.35),radius*.86],[points[2].clone().lerp(last,.25),mix(names[1],names[2],.80),radius*.83],[last.clone().lerp(points[2],.15),solid(names[2]),radius*.60],[last,solid(names[2]),radius*.26]];
  for(const [p,w,r]of specs){const axis=last.clone().sub(points[0]).normalize(),u=V(0,1,0).addScaledVector(axis,-axis.y).normalize(),v=axis.clone().cross(u).normalize();const ring=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return am.vertex(p.clone().addScaledVector(u,r*.85*cross(Math.cos(a),.55)).addScaledVector(v,r*cross(Math.sin(a),.55)),w);});
   // Match the inherited branch winding, including the mirrored hand.
   if(previous===startLoop){const a=previous.map(i=>am.p[i].clone().sub(center));let best=ring,score=Infinity;for(const dir of [1,-1])for(let offset=0;offset<8;offset++){const ordered=ring.map((_,i)=>ring[(offset+dir*i+16)%8]),d=ordered.reduce((sum,k,i)=>sum+a[i].clone().normalize().distanceTo(am.p[k].clone().sub(p).normalize()),0);if(d<score){score=d;best=ordered;}}am.bridge(previous,best,skin,center,p);previous=best;}
   else {let best=ring,score=Infinity;for(const dir of [1,-1])for(let offset=0;offset<8;offset++){const ordered=ring.map((_,i)=>ring[(offset+dir*i+16)%8]),d=ordered.reduce((sum,k,i)=>sum+am.p[previous[i]].clone().sub(center).normalize().distanceTo(am.p[k].clone().sub(p).normalize()),0);if(d<score){score=d;best=ordered;}}am.bridge(previous,best,skin,center,p);previous=best;}center=p;
  }am.cap(previous,skin,last.clone().sub(points[2]));
 }
 for(const f of fingers)digit(f.n,f.points,f.loop,f.base,f.radius);
 const tn=[1,2,3].map(i=>`DEF-thumb.0${i}.${s}`),tp=tn.map(point),tc=thumbBoundary.reduce((p,i)=>p.add(am.p[i]),V(0,0,0)).multiplyScalar(1/8);
 digit(tn,tp,thumbBoundary,tc,.0062);am.emit();
}

// Two trouser legs share the crotch seam; the pelvis is one connected surface.
const pm=new Mesh('Sato_trousers',true),legTops=[],waistParts=[];
const sharedCrotch=new Map(),pn=16;
for(const [s,sign]of [['L',1],['R',-1]]){
 const thigh=`DEF-thigh.${s}`,shin=`DEF-shin.${s}`,foot=`DEF-foot.${s}`,tops=[];
 for(let i=0;i<pn;i++){const a=i*2*Math.PI/pn;let p,w;if(i<=8){p=V(sign*.102*cross(Math.sin(a),.85),.401-.016*Math.abs(Math.cos(a)),.010+.056*cross(Math.cos(a),.7));const t=Math.sin(a)*.38;w={'DEF-hips':1-t,[thigh]:t};}else{p=V(0,.385-.039*(-Math.sin(a)),.010+.056*cross(Math.cos(a),.7));w=solid('DEF-hips');}
  const key=p.toArray().map(v=>v.toFixed(7)).join(',');if((i===0||i>=8)&&sharedCrotch.has(key))tops.push(sharedCrotch.get(key));else{const id=pm.vertex(p,w);tops.push(id);if(i===0||i>=8)sharedCrotch.set(key,id);}
 }legTops.push(tops);let prev=tops,pc=V(sign*.062,.385,.01);
 const stations=[[.337,.043,.048],[.295,.044,.049],[.252,.039,.043],[.237,.035,.038],[.227,.035,.037],[.217,.034,.037],[.192,.034,.037],[.145,.032,.034],[.096,.030,.031],[.069,.028,.029],[.063,.028,.029]];
 for(const [y,rx,rz]of stations){const t=clamp((.4148-y)/(.4148-.2288),0,1),x=y>.2288?lerp(.0666,.07785,t):lerp(.07785,.07524,(.2288-y)/(.2288-.0331)),z=y>.2288?lerp(.0256,.0082,t):lerp(.0082,-.0084,(.2288-y)/(.2288-.0331));let w=y>.252?solid(thigh):y>.205?mix(thigh,shin,clamp((.252-y)/.047,0,1)):y>.08?solid(shin):mix(shin,foot,clamp((.08-y)/.045,0,.45));const c=V(sign*x,y,z),ring=Array.from({length:pn},(_,i)=>{const a=i*2*Math.PI/pn;return pm.vertex(c.clone().add(V(sign*rx*cross(Math.sin(a),.7),0,rz*cross(Math.cos(a),.7))),w);});pm.bridge(prev,ring,y<.070?denimShadow:denim,pc,c);prev=ring;pc=c;}
 pm.cap(prev,denimShadow,V(0,-1,0));
 const half=Array.from({length:9},(_,i)=>{const a=i*Math.PI/8;return pm.vertex(V(sign*.088*cross(Math.sin(a),.7),.442,.010+.053*cross(Math.cos(a),.7)),solid('DEF-hips'));});waistParts.push(half);for(let i=0;i<8;i++)pm.face([half[i],tops[i],tops[i+1],half[i+1]],denim,V(sign*Math.sin((i+.5)*Math.PI/8),0,Math.cos((i+.5)*Math.PI/8)));
}
// Geometric welding also unifies the two waist endpoints.
pm.cap([...waistParts[0],...waistParts[1].slice(1,-1).toReversed()],denimShadow,V(0,1,0));pm.emit();

for(const [s,sign]of [['L',1],['R',-1]]){
 const shoe=new Mesh(`Sato_sneaker_${s}`),cx=sign*.076,foot=`DEF-foot.${s}`,toe=`DEF-toe.${s}`,rings=[],centers=[];
 const outline=[[-.55,-1],[-.9,-.8],[-1,-.35],[-1,.5],[-.78,.9],[-.4,1],[.4,1],[.78,.9],[1,.5],[1,-.35],[.9,-.8],[.55,-1]];
 for(const [y,rx,back,front]of [[.009,.029,-.041,.073],[.014,.031,-.043,.075],[.021,.030,-.042,.074],[.029,.028,-.038,.068],[.044,.026,-.033,.049],[.060,.021,-.027,.018]]){
  const center=V(cx,y,(back+front)/2),ring=outline.map(([x,z])=>{const zz=z>0?lerp((back+front)/2,front,z):lerp((back+front)/2,back,-z),heelBevel=y<=.014?.002*clamp((.005-zz)/.04,0,1):0,p=V(cx+x*rx,y+heelBevel,zz),w=mix(foot,toe,clamp((zz-.020)/.039,0,1));return shoe.vertex(p,w);});rings.push(ring);centers.push(center);
 }
 for(let j=1;j<rings.length;j++)shoe.bridge(rings[j-1],rings[j],j===1?outsole:j===2?sole:j===5?leatherLight:leather,centers[j-1],centers[j]);shoe.cap(rings[0],outsole,V(0,-1,0));shoe.cap(rings.at(-1),leather,V(0,1,0));
 for(const [y,z]of [[.045,.044],[.049,.034],[.053,.024]])rod(shoe,V(cx-.014,y,z),V(cx+.014,y,z),.0012,sole,mix(foot,toe,clamp((z-.020)/.039,0,1)),4);
 shoe.emit();
}

// Repack only referenced views. Original animation/IBM bytes are copied exactly.
const sourceBin=Buffer.concat(chunks),usedAccessors=new Set();
for(const s of doc.skins)usedAccessors.add(s.inverseBindMatrices);
for(const a of doc.animations)for(const s of a.samplers){usedAccessors.add(s.input);usedAccessors.add(s.output);}
for(const m of doc.meshes)for(const p of m.primitives){usedAccessors.add(p.indices);for(const a of Object.values(p.attributes))usedAccessors.add(a);}
const accessors=[...usedAccessors].sort((a,b)=>a-b),amap=new Map(accessors.map((a,i)=>[a,i])),views=new Set(doc.images.map(i=>i.bufferView));
for(const i of accessors)views.add(doc.accessors[i].bufferView);
const viewIds=[...views].sort((a,b)=>a-b),vmap=new Map(viewIds.map((v,i)=>[v,i])),packed=[];let packedLength=0;
const newViews=viewIds.map(i=>{const old=doc.bufferViews[i],padding=(4-packedLength%4)%4;if(padding){packed.push(Buffer.alloc(padding));packedLength+=padding;}const view={...old,buffer:0,byteOffset:packedLength};packed.push(sourceBin.subarray(old.byteOffset||0,(old.byteOffset||0)+old.byteLength));packedLength+=old.byteLength;return view;});
doc.accessors=accessors.map(i=>({...doc.accessors[i],bufferView:vmap.get(doc.accessors[i].bufferView)}));doc.bufferViews=newViews;
for(const s of doc.skins)s.inverseBindMatrices=amap.get(s.inverseBindMatrices);
for(const a of doc.animations)for(const s of a.samplers){s.input=amap.get(s.input);s.output=amap.get(s.output);}
for(const m of doc.meshes)for(const p of m.primitives){p.indices=amap.get(p.indices);for(const k of Object.keys(p.attributes))p.attributes[k]=amap.get(p.attributes[k]);}
for(const i of doc.images)i.bufferView=vmap.get(i.bufferView);
for(const m of doc.meshes)for(const p of m.primitives){doc.bufferViews[doc.accessors[p.indices].bufferView].target=34963;for(const a of Object.values(p.attributes))doc.bufferViews[doc.accessors[a].bufferView].target=34962;}
// Drop abandoned appearance nodes while preserving every live parent transform.
const live=new Set([...doc.skins.flatMap(s=>[...s.joints,...(s.skeleton===undefined?[]:[s.skeleton])]),...doc.animations.flatMap(a=>a.channels.map(c=>c.target.node))]);
doc.nodes.forEach((n,i)=>{if(n.mesh!==undefined)live.add(i);});let previousSize;do{previousSize=live.size;doc.nodes.forEach((n,i)=>{if(n.children?.some(c=>live.has(c)))live.add(i);});}while(live.size!==previousSize);
const kept=[...live].sort((a,b)=>a-b),nmap=new Map(kept.map((n,i)=>[n,i]));doc.nodes=kept.map(i=>{const n=doc.nodes[i];if(n.children)n.children=n.children.filter(c=>live.has(c)).map(c=>nmap.get(c));return n;});
for(const s of doc.scenes)s.nodes=s.nodes.filter(n=>live.has(n)).map(n=>nmap.get(n));for(const s of doc.skins){s.joints=s.joints.map(n=>nmap.get(n));if(s.skeleton!==undefined)s.skeleton=nmap.get(s.skeleton);}for(const a of doc.animations)for(const c of a.channels)c.target.node=nmap.get(c.target.node);
doc.buffers=[{byteLength:packedLength}];doc.asset.generator='Sato connected low-poly authoring · style-sato.mjs';
doc.extras={...doc.extras,sato:{...doc.extras?.sato,styleRevision:2,style:'Painted anime low poly; planar tapered clothing; compact beveled hands; angular jaw; lifted asymmetric fringe and full nape cap.',rigPreservation:'53 joints, inverse binds and all 46 animation clips unchanged.'}};
let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);let binary=Buffer.concat(packed);binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
const header=Buffer.alloc(20),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
fs.writeFileSync(output,Buffer.concat([header,json,bh,binary]));
const directory=path.dirname(output);fs.writeFileSync(path.join(directory,'sato-style-face.png'),faceMap.png());fs.writeFileSync(path.join(directory,'sato-style-hair.png'),hairMap.png());
console.log(JSON.stringify({file:output,bones:jointNames.length,clips:doc.animations.length,meshes:doc.meshes.length,triangles:doc.meshes.reduce((n,m)=>n+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),0),bytes:fs.statSync(output).size}));
