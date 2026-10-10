// Refine the existing Quaternius-skinned Sato without retargeting its animations.
// Usage: node tools/refine-sato.mjs input.glb [output.glb]
import filesystem from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const input=process.argv[2]||'static/models/sato.glb',output=process.argv[3]||'static/models/sato.glb';
const bytes=filesystem.readFileSync(input),jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength));
if(gltf.extras?.sato?.anatomyRevision===1){filesystem.writeFileSync(output,bytes);console.log('Sato anatomy revision already applied.');process.exit(0);}
const binary=bytes.subarray(28+jsonLength,28+jsonLength+bytes.readUInt32LE(20+jsonLength));
const loader=new GLTFLoader();loader.register(p=>({name:'headless',beforeRoot(){p.loadTexture=async()=>null;}}));
const {scene,animations:sourceAnimations}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
scene.updateMatrixWorld(true);
const skin=gltf.skins[0],jointNames=skin.joints.map(i=>gltf.nodes[i].name);
if(jointNames.length!==53||!jointNames.includes('DEF-f_index.01.R'))throw new Error('Expected the 53-bone Quaternius Sato.');
const bone=name=>scene.getObjectByName(name.replaceAll('.',''));
const point=name=>bone(name).getWorldPosition(new T.Vector3());
const chunks=[binary];let length=binary.length;
const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const types={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
function read(index){
 const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],Type=types[a.componentType],size=sizes[a.type];
 const out=new Type(a.count*size),stride=v.byteStride||Type.BYTES_PER_ELEMENT*size;
 const start=(v.byteOffset||0)+(a.byteOffset||0),view=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
 const method={5121:'getUint8',5123:'getUint16',5125:'getUint32',5126:'getFloat32'}[a.componentType];
 for(let i=0;i<a.count;i++)for(let c=0;c<size;c++)out[i*size+c]=view[method](start+i*stride+c*Type.BYTES_PER_ELEMENT,true);
 return out;
}
function append(values,type,componentType=5126,bounds=false){
 const data=Buffer.from(new types[componentType](values).buffer),pad=(4-length%4)%4;
 if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}
 const bufferView=gltf.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length})-1;chunks.push(data);length+=data.length;
 const a={bufferView,componentType,count:values.length/sizes[type],type};
 if(bounds){a.min=Array(sizes[type]).fill(Infinity);a.max=Array(sizes[type]).fill(-Infinity);for(let i=0;i<values.length;i++){const c=i%sizes[type];a.min[c]=Math.min(a.min[c],values[i]);a.max[c]=Math.max(a.max[c],values[i]);}}
 return gltf.accessors.push(a)-1;
}
const node=name=>gltf.nodes.find(n=>n.name===name);
function geometry(p){
 const g=new T.BufferGeometry();
 for(const [semantic,name]of Object.entries({POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',JOINTS_0:'skinIndex',WEIGHTS_0:'skinWeight'})){
  const a=gltf.accessors[p.attributes[semantic]];if(a)g.setAttribute(name,new T.BufferAttribute(read(p.attributes[semantic]),sizes[a.type]));
 }
 if(p.indices!==undefined)g.setIndex(new T.BufferAttribute(read(p.indices),1));return g;
}
function primitive(g,material){
 // Drop orphaned vertices from cuts and collapsed mouth corners.
 const sourceIndex=g.index?.array||Array.from({length:g.attributes.position.count},(_,i)=>i),used=[...new Set(sourceIndex)],map=new Map(used.map((old,i)=>[old,i]));
 const packed=new T.BufferGeometry();for(const [name,a]of Object.entries(g.attributes)){
  const values=new a.array.constructor(used.length*a.itemSize);used.forEach((old,i)=>{for(let c=0;c<a.itemSize;c++)values[i*a.itemSize+c]=a.getComponent(old,c);});packed.setAttribute(name,new T.BufferAttribute(values,a.itemSize));
 }packed.setIndex(Array.from(sourceIndex,i=>map.get(i)));g=packed;
 const textured=Object.keys(gltf.materials[material]).some(k=>k.endsWith('Texture'))||Object.keys(gltf.materials[material].pbrMetallicRoughness||{}).some(k=>k.endsWith('Texture'));
 if(!textured)g.deleteAttribute('uv');
 g.computeBoundingBox();if(!g.attributes.normal)g.computeVertexNormals();
 const normals=g.attributes.normal;
 for(let i=0;i<normals.count;i++){
  const n=new T.Vector3().fromBufferAttribute(normals,i);if(n.lengthSq()<1e-10)n.set(0,1,0);else n.normalize();normals.setXYZ(i,...n.toArray());
  if(g.attributes.skinWeight)for(let c=0;c<4;c++)if(g.attributes.skinWeight.getComponent(i,c)===0)g.attributes.skinIndex.setComponent(i,c,0);
 }
 if(gltf.materials[material].normalTexture&&g.attributes.uv){
  g.computeTangents();const tangents=g.attributes.tangent;
  for(let i=0;i<tangents.count;i++){
   const n=new T.Vector3().fromBufferAttribute(normals,i),t=new T.Vector3().fromBufferAttribute(tangents,i);
   if(t.lengthSq()<1e-10)t.set(Math.abs(n.x)<.8?1:0,Math.abs(n.x)<.8?0:1,0).addScaledVector(n,-t.dot(n));t.normalize();tangents.setXYZ(i,...t.toArray());
  }
 }
 const attributes={};for(const [name,semantic,type]of [['position','POSITION','VEC3'],['normal','NORMAL','VEC3'],['uv','TEXCOORD_0','VEC2'],['skinIndex','JOINTS_0','VEC4'],['skinWeight','WEIGHTS_0','VEC4']]){
  if(g.attributes[name])attributes[semantic]=append(g.attributes[name].array,type,name==='skinIndex'?5123:5126,name==='position');
 }
 if(g.attributes.tangent)attributes.TANGENT=append(g.attributes.tangent.array,'VEC4');
 return {attributes,indices:append(g.index?.array||Array.from({length:g.attributes.position.count},(_,i)=>i),'SCALAR',5125),material};
}
function replace(name,parts){gltf.meshes[node(name).mesh].primitives=parts.map(([g,m])=>primitive(g,m));}
function add(name,parts){
 const mesh=gltf.meshes.push({name,primitives:parts.map(([g,m])=>primitive(g,m))})-1;
 gltf.scenes[gltf.scene||0].nodes.push(gltf.nodes.push({name,mesh,skin:0})-1);
}
function remove(name){const n=node(name);if(n){delete n.mesh;delete n.skin;}}
const joint=name=>jointNames.indexOf(name);
function rigid(g,name){
 const count=g.attributes.position.count,indices=new Uint16Array(count*4),weights=new Float32Array(count*4);
 for(let i=0;i<count;i++){indices[i*4]=joint(name);weights[i*4]=1;}
 g.setAttribute('skinIndex',new T.BufferAttribute(indices,4));g.setAttribute('skinWeight',new T.BufferAttribute(weights,4));return g;
}
function surfaceGeometry(vertices,faces,name='DEF-head'){
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices.flatMap(v=>v.toArray?v.toArray():v),3));
 const indices=[];for(const f of faces)for(let i=1;i<f.length-1;i++){
  const [a,b,c]=[f[0],f[i],f[i+1]],va=new T.Vector3().fromBufferAttribute(g.attributes.position,a),vb=new T.Vector3().fromBufferAttribute(g.attributes.position,b),vc=new T.Vector3().fromBufferAttribute(g.attributes.position,c);
  if(vb.sub(va).cross(vc.sub(va)).lengthSq()>1e-18)indices.push(a,b,c);
 }
 g.setIndex(indices);g.computeVertexNormals();return rigid(g,name);
}

// Front, cheekbone, mandibular angle and chin are separate contour stations.
// The rear skull narrows above the neck; beard never wraps around the occiput.
const rings=[
 [.712,.030,.077,.030],[.725,.052,.092,.043],[.741,.072,.104,.053],
 [.752,.080,.109,.059],[.768,.086,.112,.065],[.788,.092,.113,.072],
 [.809,.099,.114,.078],[.835,.104,.115,.083],[.862,.103,.110,.086],
 [.888,.094,.099,.082],[.915,.072,.077,.068],[.936,.039,.043,.040],[.945,.004,.005,.005],
];
function profile(y){
 for(let i=1;i<rings.length;i++)if(y<=rings[i][0]){const a=rings[i-1],b=rings[i],t=T.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);return a.map((v,c)=>v+(b[c]-v)*t);}
 return rings.at(-1);
}
function head(y,theta,offset=0){
 const [,rx,front,back]=profile(y),s=Math.sin(theta),c=Math.cos(theta);
 return new T.Vector3((rx+offset)*Math.sign(s)*Math.abs(s)**.84,y,(c>=0?front+offset:back+offset)*Math.sign(c)*Math.abs(c)**.65);
}
function face(x,y,offset=0){const [,rx]=profile(y);return head(y,Math.asin(Math.sign(x)*Math.min(.999,Math.abs(x/rx)**(1/.84))),offset);}
const mouthAngle=.48,angles=[...Array.from({length:64},(_,i)=>-Math.PI+i*Math.PI/32),-mouthAngle,mouthAngle].sort((a,b)=>a-b);
const N=angles.length,vs=[],fs=[],lower=[],upper=[];
for(let j=0;j<rings.length;j++)for(let i=0;i<N;i++){
 const theta=angles[i],u=theta/mouthAngle;let y=rings[j][0];
 if(Math.abs(u)<=1){if(j===3)y=.752+.021*u*u;if(j===4)y=.768+.005*u*u;}
 const v=head(y,theta);vs.push(v);
 if(Math.abs(u)<=1){if(j===3)lower.push(v);if(j===4)upper.push(v);}
}
for(let j=0;j<rings.length-1;j++)for(let i=0;i<N;i++){
 const next=(i+1)%N,mid=(angles[i]+(next?angles[next]:Math.PI))/2;
 if(j===3&&Math.abs(mid)<mouthAngle)continue; // A real mouth aperture, no skin behind the teeth.
 fs.push([j*N+i,j*N+next,(j+1)*N+next,(j+1)*N+i]);
}
fs.push([...Array(N).keys()].reverse(),Array.from({length:N},(_,i)=>(rings.length-1)*N+i));
const beardEdge=theta=>{
 const a=Math.abs(theta),rows=[[0,.746],[.35,.754],[.65,.774],[1,.794],[1.35,.813],[1.54,.823],[1.75,.758],[1.92,.68],[Math.PI,.68]];
 for(let i=1;i<rows.length;i++)if(a<=rows[i][0]){const [x,y]=rows[i-1],[xx,yy]=rows[i];return y+(yy-y)*(a-x)/(xx-x);}return .68;
};
// Split the shared surface exactly at the beard edge. There is no beard shell.
const headParts=[[],[]],headFaces=[[],[]];
function clip(poly,sign){const out=[];for(let i=0;i<poly.length;i++){
 const a=poly[i],b=poly[(i+1)%poly.length],fa=a.field*sign,fb=b.field*sign;
 if(fa>=0)out.push(a);if((fa>=0)!==(fb>=0))out.push({p:a.p.clone().lerp(b.p,fa/(fa-fb)),field:0});
 }return out;}
for(const f of fs){const poly=f.map(i=>({p:vs[i],field:vs[i].y-beardEdge(angles[i%N])}));
 for(const [part,sign]of [[0,1],[1,-1]]){const p=clip(poly,sign);if(p.length<3)continue;const start=headParts[part].length;headParts[part].push(...p.map(v=>v.p));headFaces[part].push(p.map((_,i)=>start+i));}
}
function smoothHead(g){
 const p=g.attributes.position,n=g.attributes.normal;
 for(let i=0;i<p.count;i++){
  const v=new T.Vector3().fromBufferAttribute(p,i),[,rx,df,db]=profile(v.y);
  const theta=Math.atan2(Math.sign(v.x)*Math.abs(v.x/rx)**(1/.84),Math.sign(v.z)*Math.abs(v.z/(v.z>=0?df:db))**(1/.65));
  const normal=head(v.y,theta+.001).sub(head(v.y,theta-.001)).cross(head(v.y+.0005,theta).sub(head(v.y-.0005,theta))).normalize();
  n.setXYZ(i,...normal.toArray());
 }return g;
}
replace('Sato_clean_face',headParts.map((v,i)=>[smoothHead(surfaceGeometry(v,headFaces[i])),i?6:5]));
// Remove remaining textured head fragments from a source part shared with the belt.
{
 const mesh=gltf.meshes[node('tripo_part_4').mesh];mesh.primitives=mesh.primitives.map(p=>{
  const g=geometry(p),ids=[];for(let i=0;i<g.index.count;i+=3){const tri=[0,1,2].map(k=>g.index.getX(i+k));if(tri.every(k=>g.attributes.position.getY(k)<.68))ids.push(...tri);}g.setIndex(ids);return primitive(g,p.material);
 });
 const neck=gltf.meshes[node('Sato_neck').mesh];neck.primitives=neck.primitives.map(p=>{
  const g=geometry(p),a=g.attributes.position;for(let i=0;i<a.count;i++)if(a.getY(i)>.724)a.setY(i,.724+(a.getY(i)-.724)*.36);g.computeVertexNormals();return primitive(g,p.material);
 });
}

// Recessed cavity and curved ivory teeth have a physical depth gap.
const mouthVertices=[],mouthFaces=[],loop=[...lower,...upper.toReversed()];
for(const p of loop)mouthVertices.push(p.clone());
for(const p of loop)mouthVertices.push(new T.Vector3(p.x*.96,.760+(p.y-.760)*.92,p.z-.012));
for(let i=0;i<loop.length;i++)mouthFaces.push([i,(i+1)%loop.length,(i+1)%loop.length+loop.length,i+loop.length]);
mouthFaces.push(Array.from({length:loop.length},(_,i)=>i+loop.length));
replace('Sato_smile',[[surfaceGeometry(mouthVertices,mouthFaces),11]]);
const tv=[],tf=[];
for(let row=0;row<2;row++)for(let i=0;i<lower.length;i++){
 const a=lower[i],b=upper[i],height=b.y-a.y,p=b.clone();p.y-=height*(row?.48:.12);p.z-=.0035;tv.push(p);
}
for(let i=0;i<lower.length-1;i++)tf.push([i+lower.length,i+1+lower.length,i+1,i]);
replace('Sato_teeth',[[surfaceGeometry(tv,tf),12]]);
const mv=[],mf=[];
for(const row of [0,1])for(let i=0;i<=24;i++){
 const u=-1+2*i/24,x=.041*u,y=(row?.781:.776)+.002*Math.sin(Math.abs(u)*Math.PI)-.002*Math.abs(u)**4;
 mv.push(face(x,y,.0015));
}
for(let i=0;i<24;i++)mf.push([i,i+1,i+26,i+25]);
replace('Sato_moustache',[[surfaceGeometry(mv,mf),6]]);
// Reproject the brows onto the new forehead while preserving the existing eyes/glasses.
for(const name of ['Sato_eyebrow_-1','Sato_eyebrow_1']){
 const mesh=gltf.meshes[node(name).mesh];mesh.primitives=mesh.primitives.map(p=>{const g=geometry(p),a=g.attributes.position;for(let i=0;i<a.count;i++)a.setZ(i,face(a.getX(i),a.getY(i),.0018).z);g.computeVertexNormals();return primitive(g,p.material);});
}
for(const side of [-1,1])for(const highlight of [false,true]){
 const x=side*.05-(highlight?.0032:0),y=highlight?.830:.824;
 const g=new T.SphereGeometry(1,24,12),p=g.attributes.position;
 for(let i=0;i<p.count;i++){
  const xx=x+p.getX(i)*(highlight?.0016:.0115),yy=y+p.getY(i)*(highlight?.0016:.014);
  p.setXYZ(i,xx,yy,face(xx,yy).z+(highlight?.0035:.0012)+p.getZ(i)*(highlight?.0007:.002));
 }
 g.computeVertexNormals();replace(`Sato_eye_${highlight?'glint_':''}${side}`,[[rigid(g,'DEF-head'),highlight?10:9]]);
}

// Keep Sato's original spiky hairstyle, trimming only the neck-length fragments.
// All retained hair follows the head rigidly, eliminating old shoulder weights.
const hairNames=[1,7,9,12,13,15,21,22,23,25,27,33,40,41,46].map(i=>`tripo_part_${i}`);
for(const name of hairNames){
 const n=node(name);if(!n||n.mesh===undefined)continue;const parts=[];
 for(const p of gltf.meshes[n.mesh].primitives){
  const g=geometry(p),a=g.attributes.position,indices=g.index.array,vertices=[],faces=[];
  for(let i=0;i<indices.length;i+=3){
   let poly=Array.from(indices.slice(i,i+3),k=>{const v=new T.Vector3().fromBufferAttribute(a,k);const front=T.MathUtils.smoothstep(v.z,.035,.10),floor=.827+.044*front;return {p:v,field:v.y-floor};});
   poly=clip(poly,1);if(poly.length<3)continue;const start=vertices.length;
   for(const v of poly){const pt=v.p;const [,rx,df,db]=profile(pt.y),depth=pt.z>=0?df:db;
    const theta=Math.atan2(Math.sign(pt.x)*Math.abs(pt.x/rx)**(1/.84),Math.sign(pt.z)*Math.abs(pt.z/depth)**(1/.65));
    const h=head(pt.y,theta,.002),ratio=Math.hypot(pt.x,pt.z)/Math.max(1e-6,Math.hypot(h.x,h.z));
    if(ratio<1){pt.x=h.x;pt.z=h.z;}vertices.push(pt);
   }
   faces.push(poly.map((_,k)=>start+k));
  }
  if(vertices.length)parts.push([surfaceGeometry(vertices,faces),p.material]);
 }
 if(parts.length)replace(name,parts);else remove(name);
}

// Fit footwear to the ankle/toe span instead of the much larger source shoes.
const shoeNames=['tripo_part_14','tripo_part_16','tripo_part_35','tripo_part_48'];
function fitShoe(p){const side=Math.sign(p.x);return p.set(side*(.07524+(Math.abs(p.x)-.092)*.50),.006+p.y*.70,(p.z+.0805)*.53-.043);}
for(const name of shoeNames){
 const mesh=gltf.meshes[node(name).mesh];mesh.primitives=mesh.primitives.map(p=>{
  const g=geometry(p),a=g.attributes.position;for(let i=0;i<a.count;i++){
   const v=fitShoe(new T.Vector3().fromBufferAttribute(a,i));a.setXYZ(i,...v.toArray());
   const toe=T.MathUtils.smoothstep(v.z,.018,.054),side=v.x>0?'L':'R';
   for(let c=0;c<4;c++){g.attributes.skinIndex.setComponent(i,c,c===0?joint(`DEF-foot.${side}`):c===1?joint(`DEF-toe.${side}`):0);g.attributes.skinWeight.setComponent(i,c,c===0?1-toe:c===1?toe:0);}
  }g.computeVertexNormals();scene.getObjectByName(name).geometry=g;return primitive(g,p.material);
 });
}
// Taper the trouser cuffs into the smaller boots without changing the knees.
{
 const mesh=gltf.meshes[node('tripo_part_3').mesh];mesh.primitives=mesh.primitives.map(p=>{
  const g=geometry(p),a=g.attributes.position;for(let i=0;i<a.count;i++){
   const v=new T.Vector3().fromBufferAttribute(a,i),t=1-T.MathUtils.smoothstep(v.y,.055,.125),fitted=fitShoe(v.clone());
   v.x=T.MathUtils.lerp(v.x,fitted.x,t);v.z=T.MathUtils.lerp(v.z,fitted.z,t);a.setXYZ(i,...v.toArray());
  }g.computeVertexNormals();return primitive(g,p.material);
 });
}

// Remove the old rigid fingers and clip the forearm at the wrist.
for(const name of ['tripo_part_24','tripo_part_29','tripo_part_30'])remove(name);
{
 const mesh=gltf.meshes[node('tripo_part_5').mesh];mesh.primitives=mesh.primitives.map(p=>{
  const g=geometry(p),attributes=Object.keys(g.attributes),out=Object.fromEntries(attributes.map(n=>[n,[]]));
  for(let i=0;i<g.index.count;i+=3){
   let poly=[0,1,2].map(k=>{const index=g.index.getX(i+k);return Object.fromEntries(attributes.map(n=>[n,Array.from({length:g.attributes[n].itemSize},(_,c)=>g.attributes[n].getComponent(index,c))]));});
   for(const sign of [1,-1]){
    const clipped=[];for(let k=0;k<poly.length;k++){
     const a=poly[k],b=poly[(k+1)%poly.length],fa=.3965-sign*a.position[0],fb=.3965-sign*b.position[0];
     if(fa>=0)clipped.push(a);if((fa>=0)!==(fb>=0)){
      const t=fa/(fa-fb),v=Object.fromEntries(attributes.map(n=>[n,a[n].map((value,c)=>n==='skinIndex'?value:T.MathUtils.lerp(value,b[n][c],t))]));
      // Wrist cut vertices use one hand bone, so interpolated joint IDs cannot differ.
      v.skinIndex=[joint(`DEF-hand.${sign>0?'L':'R'}`),0,0,0];v.skinWeight=[1,0,0,0];clipped.push(v);
     }
    }poly=clipped;
   }
   for(let k=1;k<poly.length-1;k++)for(const v of [poly[0],poly[k],poly[k+1]]){
    const p=v.position.slice(),t=T.MathUtils.smoothstep(Math.abs(p[0]),.33,.3965);
    p[1]=.67801+(p[1]-.67801)*(1-t*.55);p[2]=.00317+(p[2]-.00317)*(1-t*.48);
    for(const name of attributes)out[name].push(...(name==='position'?p:v[name]));
   }
  }
  const clipped=new T.BufferGeometry();for(const name of attributes)clipped.setAttribute(name,new (name==='skinIndex'?T.Uint16BufferAttribute:T.Float32BufferAttribute)(out[name],g.attributes[name].itemSize));
  clipped.computeVertexNormals();return primitive(clipped,p.material);
 });
}
function weightedGeometry(vertices,faces,weights){
 const g=surfaceGeometry(vertices,faces),si=g.attributes.skinIndex,sw=g.attributes.skinWeight;
 weights.forEach((w,i)=>{for(let c=0;c<4;c++){si.setComponent(i,c,w[c]?joint(w[c][0]):0);sw.setComponent(i,c,w[c]?.[1]||0);}});return g;
}
function tube(centers,radii,influences){
 const vertices=[],faces=[],weights=[],segments=10;
 for(let j=0;j<centers.length;j++){
  const dir=(j===centers.length-1?centers[j].clone().sub(centers[j-1]):centers[j+1].clone().sub(centers[j])).normalize();
  const a=new T.Vector3(0,1,0).addScaledVector(dir,-dir.y).normalize(),b=dir.clone().cross(a).normalize();
  for(let i=0;i<segments;i++){const angle=i*2*Math.PI/segments;vertices.push(centers[j].clone().addScaledVector(a,Math.cos(angle)*radii[j]).addScaledVector(b,Math.sin(angle)*radii[j]));weights.push(influences[j]);}
 }
 for(let j=0;j<centers.length-1;j++)for(let i=0;i<segments;i++)faces.push([j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i]);
 faces.push(Array.from({length:segments},(_,i)=>i).reverse(),Array.from({length:segments},(_,i)=>(centers.length-1)*segments+i));
 return weightedGeometry(vertices,faces,weights);
}
const handParts=[];
for(const side of ['L','R']){
 const sign=side==='L'?1:-1,wrist=point(`DEF-hand.${side}`),handName=`DEF-hand.${side}`;
 const palmVertices=[],palmFaces=[],palmWeights=[];
 for(const [dx,depth,halfWidth,z]of [[-.007,.014,.016,.001],[.012,.011,.022,.002],[.035,.008,.024,.001],[.051,.006,.021,.001]])for(let i=0;i<12;i++){
  const a=i*2*Math.PI/12;palmVertices.push(wrist.clone().add(new T.Vector3(sign*dx,Math.cos(a)*depth,z+Math.sin(a)*halfWidth)));palmWeights.push([[handName,1]]);
 }
 for(let j=0;j<3;j++)for(let i=0;i<12;i++)palmFaces.push([j*12+i,j*12+(i+1)%12,(j+1)*12+(i+1)%12,(j+1)*12+i]);
 palmFaces.push([...Array(12).keys()].reverse(),Array.from({length:12},(_,i)=>36+i));
 handParts.push([weightedGeometry(palmVertices,sign>0?palmFaces:palmFaces.map(f=>f.toReversed()),palmWeights),5]);
 for(const finger of ['index','middle','ring','pinky','thumb']){
  const names=[1,2,3].map(i=>finger==='thumb'?`DEF-thumb.0${i}.${side}`:`DEF-f_${finger}.0${i}.${side}`),points=names.map(point);
  const end=points[2].clone().addScaledVector(points[2].clone().sub(points[1]),finger==='thumb'?.64:.72);
  const centers=[points[0].clone().lerp(wrist,.10),points[0],points[0].clone().lerp(points[1],.5),points[1],points[1].clone().lerp(points[2],.5),points[2],points[2].clone().lerp(end,.7),end];
  const radius=finger==='thumb'?.007:finger==='pinky'?.0048:.0055;
  const radii=[radius*.96,radius,radius*.97,radius*.93,radius*.87,radius*.82,radius*.70,radius*.32];
  const influences=[[[handName,.6],[names[0],.4]],[[handName,.15],[names[0],.85]],[[names[0],1]],[[names[0],.5],[names[1],.5]],[[names[1],1]],[[names[1],.5],[names[2],.5]],[[names[2],1]],[[names[2],1]]];
  handParts.push([tube(centers,radii,influences),5]);
 }
}
add('Sato_articulated_hands',handParts);

// Existing pistol clips already contain trigger and support-hand articulation.
// Sword/punch source clips left their fingers extended: author actual grip keys.
const pistol=gltf.animations.find(a=>a.name==='Rig|Pistol_Idle_Loop');
function fingerRotation(name,curl){
 const n=node(name),q=new T.Quaternion().fromArray(n.rotation||[0,0,0,1]);
 if(name.includes('thumb')){
  const right=node(name.replace('.L','.R')),c=pistol.channels.find(c=>c.target.node===gltf.nodes.indexOf(right)&&c.target.path==='rotation');
  const closed=new T.Quaternion().fromArray(read(pistol.samplers[c.sampler].output).slice(0,4));
  if(name.endsWith('.L')){closed.y*=-1;closed.z*=-1;}
  const part=Number(name.match(/\.0([123])\./)[1]);closed.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),[0,.35,.30][part-1]));
  return q.slerp(closed,curl).normalize().toArray();
 }
 const part=Number(name.match(/\.0([123])\./)[1]);
 const angle=[1.35,1.65,1.15][part-1]*curl;
 return q.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),angle)).normalize().toArray();
}
const fingerNodes=skin.joints.filter(i=>/DEF-(f_|thumb)/.test(gltf.nodes[i].name));
for(const animation of gltf.animations){
 if(!/\|(Punch_|Sword_|Idle_Torch)/.test(animation.name))continue;
 const punch=animation.name.includes('Punch_'),sword=animation.name.includes('Sword_');
 for(const channel of animation.channels){
  if(channel.target.path!=='rotation'||!fingerNodes.includes(channel.target.node))continue;
  const name=gltf.nodes[channel.target.node].name;if(!punch&&name.endsWith('.L'))continue;
  const sampler=animation.samplers[channel.sampler],times=read(sampler.input),duration=times.at(-1),values=[];
  for(const time of times){let curl=sword?.82:.95;
   if(punch){const t=time/duration;curl=.65+.35*Math.sin(Math.PI*T.MathUtils.clamp(t*1.25,0,1));}
   values.push(...fingerRotation(name,curl));
  }
  sampler.output=append(values,'VEC4');sampler.interpolation='LINEAR';
 }
}
const gripTimes=[0,.25,.65,1,1.25,1.6],gripValues=[0,0,1,1,0,0],grip={name:'Hands_Open_Close',samplers:[],channels:[]};
const gripInput=append(gripTimes,'SCALAR',5126,true);
for(const index of fingerNodes){
 const name=gltf.nodes[index].name,values=gripValues.flatMap(c=>fingerRotation(name,c));
 const sampler=grip.samplers.push({input:gripInput,output:append(values,'VEC4'),interpolation:'LINEAR'})-1;
 grip.channels.push({sampler,target:{node:index,path:'rotation'}});
}
gltf.animations.push(grip);

// Bake leg IK at ground contact. Toe skinning handles toe-off; the residual lift
// keeps soles above zero while preserving the thigh/shin lengths and foot pitch.
// Root, hips, horizontal motion and the original rig rest pose are untouched.
const mixer=new T.AnimationMixer(scene),shoes=shoeNames.map(name=>scene.getObjectByName(name));
function worldRotation(b,q){const parent=b.parent.getWorldQuaternion(new T.Quaternion());b.quaternion.copy(parent.invert().multiply(q));scene.updateMatrixWorld(true);}
function aimSegment(b,child,target){
 const origin=b.getWorldPosition(new T.Vector3()),from=child.getWorldPosition(new T.Vector3()).sub(origin).normalize(),to=target.clone().sub(origin).normalize();
 worldRotation(b,new T.Quaternion().setFromUnitVectors(from,to).multiply(b.getWorldQuaternion(new T.Quaternion())));
}
function liftFoot(side,lift){
 if(lift<1e-8)return;
 const thigh=bone(`DEF-thigh.${side}`),shin=bone(`DEF-shin.${side}`),foot=bone(`DEF-foot.${side}`);
 const hip=thigh.getWorldPosition(new T.Vector3()),knee=shin.getWorldPosition(new T.Vector3()),ankle=foot.getWorldPosition(new T.Vector3());
 const footRotation=foot.getWorldQuaternion(new T.Quaternion()),a=hip.distanceTo(knee),b=knee.distanceTo(ankle),target=ankle.clone();target.y+=lift;
 const axis=target.clone().sub(hip),distance=axis.length();if(distance>a+b+1e-5)throw new Error(`${side} corrected foot is out of reach`);axis.normalize();
 const d=Math.min(distance,a+b-1e-7),bend=knee.clone().sub(hip);bend.addScaledVector(axis,-bend.dot(axis));
 if(bend.lengthSq()<1e-10){bend.set(0,0,1);bend.addScaledVector(axis,-bend.dot(axis));}bend.normalize();
 const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
 const nextKnee=hip.clone().addScaledVector(axis,along).addScaledVector(bend,height);
 aimSegment(thigh,shin,nextKnee);aimSegment(shin,foot,target);worldRotation(foot,footRotation);
}
let maxFootLift=0;
for(const animation of gltf.animations){
 if(/Death|Driving|Roll|Swim|Sitting|Jump_Loop|Hands_/.test(animation.name))continue;
 const source=sourceAnimations.find(a=>a.name===animation.name);if(!source)continue;
 mixer.stopAllAction();const action=mixer.clipAction(source).setLoop(T.LoopOnce,1).play();action.clampWhenFinished=true;
 const frames=Math.ceil(source.duration*120),times=[],legNodes=['L','R'].flatMap(side=>['thigh','shin','foot'].map(part=>`DEF-${part}.${side}`)),values=new Map(legNodes.map(name=>[name,[]]));
 for(let frame=0;frame<=frames;frame++){
  const time=source.duration*frame/frames;times.push(time);action.time=time;mixer.update(0);scene.updateMatrixWorld(true);
  const floor={L:Infinity,R:Infinity};
  for(const mesh of shoes){
   mesh.skeleton.update();const p=mesh.geometry.attributes.position;
   for(let i=0;i<p.count;i++){
    const side=p.getX(i)>0?'L':'R',v=new T.Vector3().fromBufferAttribute(p,i);mesh.applyBoneTransform(i,v);v.applyMatrix4(mesh.matrixWorld);floor[side]=Math.min(floor[side],v.y);
   }
  }
  for(const side of ['L','R']){
   const lift=Math.max(0,.0025-floor[side]);maxFootLift=Math.max(maxFootLift,lift);liftFoot(side,lift);
  }
  for(const name of legNodes)values.get(name).push(...bone(name).quaternion.toArray());
 }
 const input=append(times,'SCALAR',5126,true);
 for(const name of legNodes){
  const index=gltf.nodes.indexOf(node(name)),channel=animation.channels.find(c=>c.target.node===index&&c.target.path==='rotation');
  const sampler=animation.samplers[channel.sampler];sampler.input=input;sampler.output=append(values.get(name),'VEC4');sampler.interpolation='LINEAR';
 }
}
gltf.extras={...gltf.extras,sato:{...gltf.extras?.sato,anatomyRevision:1,sourceClips:45,handClip:'Hands_Open_Close',mouth:'Open topology, recessed cavity and separate ivory teeth',footwear:'Fitted to ankle/toe span, toe articulation and length-preserving leg IK at contact',maxFootLift}};

// Pack only referenced geometry/channels; embedded images and original body clips stay intact.
const all=Buffer.concat(chunks);
function compact(items,used){const map=new Map([...used].sort((a,b)=>a-b).map((old,i)=>[old,i]));return {items:[...map.keys()].map(i=>items[i]),map};}
const animatedNodes=new Set(gltf.animations.flatMap(a=>a.channels.map(c=>c.target.node)));
const cn=compact(gltf.nodes,new Set(gltf.nodes.map((n,i)=>n.mesh!==undefined||n.children?.length||skin.joints.includes(i)||animatedNodes.has(i)?i:null).filter(i=>i!==null)));
gltf.nodes=cn.items;for(const n of gltf.nodes)if(n.children)n.children=n.children.filter(i=>cn.map.has(i)).map(i=>cn.map.get(i));
for(const s of gltf.scenes)s.nodes=s.nodes.filter(i=>cn.map.has(i)).map(i=>cn.map.get(i));skin.joints=skin.joints.map(i=>cn.map.get(i));if(skin.skeleton!==undefined)skin.skeleton=cn.map.get(skin.skeleton);
for(const a of gltf.animations)for(const c of a.channels)c.target.node=cn.map.get(c.target.node);
const usedMeshes=new Set(gltf.nodes.filter(n=>n.mesh!==undefined).map(n=>n.mesh)),cm=compact(gltf.meshes,usedMeshes);gltf.meshes=cm.items;for(const n of gltf.nodes)if(n.mesh!==undefined)n.mesh=cm.map.get(n.mesh);
const usedMaterials=new Set(gltf.meshes.flatMap(m=>m.primitives.map(p=>p.material))),cma=compact(gltf.materials,usedMaterials);gltf.materials=cma.items;for(const m of gltf.meshes)for(const p of m.primitives)p.material=cma.map.get(p.material);
const usedAccessors=new Set(skin.inverseBindMatrices===undefined?[]:[skin.inverseBindMatrices]);
for(const m of gltf.meshes)for(const p of m.primitives){for(const a of Object.values(p.attributes))usedAccessors.add(a);if(p.indices!==undefined)usedAccessors.add(p.indices);}
for(const a of gltf.animations)for(const s of a.samplers){usedAccessors.add(s.input);usedAccessors.add(s.output);}
const ca=compact(gltf.accessors,usedAccessors);gltf.accessors=ca.items;
skin.inverseBindMatrices=ca.map.get(skin.inverseBindMatrices);
for(const m of gltf.meshes)for(const p of m.primitives){for(const k of Object.keys(p.attributes))p.attributes[k]=ca.map.get(p.attributes[k]);if(p.indices!==undefined)p.indices=ca.map.get(p.indices);}
for(const a of gltf.animations)for(const s of a.samplers){s.input=ca.map.get(s.input);s.output=ca.map.get(s.output);}
const usedViews=new Set(gltf.accessors.map(a=>a.bufferView));for(const i of gltf.images||[])if(i.bufferView!==undefined)usedViews.add(i.bufferView);
const cv=compact(gltf.bufferViews,usedViews),packed=[];let packedLength=0;
gltf.bufferViews=cv.items.map(v=>{const pad=(4-packedLength%4)%4;if(pad){packed.push(Buffer.alloc(pad));packedLength+=pad;}const offset=packedLength;packed.push(all.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));packedLength+=v.byteLength;return {...v,byteOffset:offset};});
for(const a of gltf.accessors)a.bufferView=cv.map.get(a.bufferView);for(const i of gltf.images||[])if(i.bufferView!==undefined)i.bufferView=cv.map.get(i.bufferView);
for(const m of gltf.meshes)for(const p of m.primitives){for(const index of Object.values(p.attributes))gltf.bufferViews[gltf.accessors[index].bufferView].target=34962;gltf.bufferViews[gltf.accessors[p.indices].bufferView].target=34963;}
gltf.buffers=[{byteLength:packedLength}];
let jb=Buffer.from(JSON.stringify(gltf));jb=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,32)]);let bb=Buffer.concat(packed);bb=Buffer.concat([bb,Buffer.alloc((4-bb.length%4)%4)]);
const header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jb.length+bb.length,8);header.writeUInt32LE(jb.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(bb.length);binHeader.writeUInt32LE(0x004e4942,4);
filesystem.writeFileSync(output,Buffer.concat([header,jb,binHeader,bb]));console.log(`Sato: 53 original bones, 45 original clips + open/close hands. Wrote ${output}.`);
