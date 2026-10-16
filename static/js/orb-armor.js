import * as T from '../vendor/three.module.min.js';

// A continuous shell grows from the recessed visor lip to the back of the head.
// The aperture, cheeks, swept brow and dome share vertices and smooth normals.
function helmetCurve(a){
  const profiles=[[.245,.183,.225],[.273,.207,.274],[.326,.272,.205],[.339,.30,.015],[.282,.253,-.18],[.15,.15,-.285],[0,0,-.315]];
  const c=Math.sign(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),.82),s=Math.sign(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),.85);
  return new T.CatmullRomCurve3(profiles.map(([rx,ry,z],i)=>new T.Vector3(rx*c*(s<0?1-.15*(-s):1),ry*s-(s>0?Math.pow(s,9)*.075*(1-i/6):Math.pow(-s,5)*.025),z+(i<3?.018*Math.abs(c):0))));
}
export function helmetGeometry() {
  const positions=[],indices=[],segments=64,rings=30;
  for(let j=0;j<=segments;j++){
    const curve=helmetCurve(j/segments*Math.PI*2);
    for(let k=0;k<=rings;k++){const p=curve.getPoint(k/rings);positions.push(p.x,p.y,p.z);if(j&&k){const b=j*(rings+1)+k,a0=b-rings-1;indices.push(a0-1,a0,b-1,b-1,a0,b);}}
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const normals=geometry.attributes.normal;
  for(let k=0;k<=rings;k++){const end=segments*(rings+1)+k,n=new T.Vector3().fromBufferAttribute(normals,k).add(new T.Vector3().fromBufferAttribute(normals,end)).normalize();normals.setXYZ(k,n.x,n.y,n.z);normals.setXYZ(end,n.x,n.y,n.z);}
  return geometry;
}

// The blue crown follows the helmet surface from the brow over the dome.
export function crownGeometry(){
  const positions=[],indices=[],rows=24,cols=16;
  for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++){
    const t=j/rows,width=.10+.32*Math.pow(Math.sin(t*Math.PI),.6),a=Math.PI/2+(k/cols*2-1)*width;
    const p=helmetCurve(a).getPoint(.08+t*.55);p.addScaledVector(p.clone().normalize(),.004);positions.push(...p.toArray());
    if(j&&k){const b=j*(cols+1)+k,a0=b-cols-1;indices.push(a0-1,b-1,a0,b-1,b,a0);}
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

// Profiles are [height, half-width, half-depth, forward offset].
export function armorLoft(profiles,{segments=24,rings=24}={}) {
  const contour=new T.CatmullRomCurve3(profiles.map(([y,x,z,offset=0])=>new T.Vector3(x,y,z))),positions=[],indices=[];
  for(let j=0;j<=rings;j++){
    const t=j/rings,p=contour.getPoint(t),f=t*(profiles.length-1),i=Math.min(profiles.length-2,Math.floor(f));
    const offset=T.MathUtils.lerp(profiles[i][3]||0,profiles[i+1][3]||0,f-i);
    for(let k=0;k<=segments;k++){const a=k/segments*Math.PI*2;positions.push(Math.cos(a)*Math.max(.001,p.x),p.y,Math.sin(a)*Math.max(.001,p.z)+offset);if(j&&k){const b=j*(segments+1)+k,a0=b-segments-1;indices.push(a0-1,b-1,a0,b-1,b,a0);}}
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function roundedPlate(points,depth=.08,bevel=.025) {
  const shape=new T.Shape();
  points.forEach(([x,y],i)=>{
    const previous=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
    const enter=[T.MathUtils.lerp(x,previous[0],.16),T.MathUtils.lerp(y,previous[1],.16)],leave=[T.MathUtils.lerp(x,next[0],.16),T.MathUtils.lerp(y,next[1],.16)];
    if(i)shape.lineTo(...enter);else shape.moveTo(...enter);shape.quadraticCurveTo(x,y,...leave);
  });shape.closePath();
  const geometry=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:4,steps:1,curveSegments:12});geometry.translate(0,0,-depth/2);return geometry;
}
export function sweptHorn(side) {
  const curve=new T.CatmullRomCurve3([[side*.235,0,-.06],[side*.29,.08,-.09],[side*.30,.18,-.17],[side*.27,.255,-.255]].map(p=>new T.Vector3(...p)));
  const geometry=new T.TubeGeometry(curve,24,1,12,false),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){const row=Math.floor(i/13),t=row/24,center=curve.getPointAt(t),width=.061*Math.pow(1-t,.62)+.006;const v=new T.Vector3().fromBufferAttribute(p,i).sub(center).multiplyScalar(width).add(center);p.setXYZ(i,v.x,v.y,v.z);}
  geometry.computeVertexNormals();return geometry;
}
