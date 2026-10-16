import * as T from '../vendor/three.module.min.js';

// Small position-based cloth: fixed collar, structural/shear/bend constraints,
// body collision and inertial drag. All motion stays in the robot's local frame.
export function createOrbCape() {
  const cols=24,rows=12,rest=[],positions=[],previous=[],links=[],indices=[],uv=[];
  const index=(x,y)=>y*(cols+1)+x;
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
    const u=x/cols,v=y/rows,a=.20+u*5.10,spread=Math.sin(Math.min(1,v*4)*Math.PI/2),hem=.035*Math.sin(x*2.3)+.025*Math.sin(x*5.7);
    const length=.56+.20*Math.sin(Math.PI*u)+.09*u,rx=.21+.16*spread+.10*v,rz=.16+.08*spread+.13*v;
    const p=new T.Vector3(Math.sin(a)*rx,.235-v*length+hem*Math.pow(v,8),Math.cos(a)*rz+.015*Math.sin(a*7)*v);
    rest.push(p);positions.push(p.clone());previous.push(p.clone());uv.push(u,v);
    if(x&&y){const b=index(x,y),a0=index(x-1,y-1),c=index(x,y-1),d=index(x-1,y);if(!(y===rows&&(x===5||x===18))){indices.push(a0,d,c,c,d,b);}}
  }
  function link(a,b,stiffness=1){links.push({a,b,length:rest[a].distanceTo(rest[b]),stiffness});}
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
    if(x<cols)link(index(x,y),index(x+1,y));if(y<rows)link(index(x,y),index(x,y+1));
    if(x<cols&&y<rows){link(index(x,y),index(x+1,y+1),.7);link(index(x+1,y),index(x,y+1),.7);}
    if(y<rows-1)link(index(x,y),index(x,y+2),.25);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(rest.flatMap(p=>p.toArray()),3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const material=new T.MeshStandardMaterial({color:'#bca67b',roughness:1,side:T.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 capeUv;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncapeUv=uv;');
    shader.fragmentShader='varying vec2 capeUv;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat weave=sin(capeUv.x*590.)*sin(capeUv.y*520.);float wear=sin(capeUv.x*51.+capeUv.y*12.)*sin(capeUv.y*34.);diffuseColor.rgb*=.96+.025*weave+.055*wear;');
  };
  material.customProgramCacheKey=()=> 'orb-woven-cape-v1';
  const mesh=new T.Mesh(geometry,material);mesh.name='sato-torn-cloth-cape';mesh.frustumCulled=false;mesh.userData.orbFoamExclude=true;
  const delta=new T.Vector3(),old=new T.Vector3(),lastVelocity=new T.Vector3(),axis=new T.Vector3(),nearest=new T.Vector3(),separation=new T.Vector3();let accumulator=0,clock=0;
  function reset(){positions.forEach((p,i)=>{p.copy(rest[i]);previous[i].copy(p);});lastVelocity.set(0,0,0);accumulator=0;}
  function step(h,{speed,verticalSpeed,turn,power,reduced,colliders,floor}){
    clock+=h;const velocity=new T.Vector3(turn*.9,verticalSpeed,speed),acceleration=velocity.clone().sub(lastVelocity).multiplyScalar(1/h).clampLength(0,12);lastVelocity.copy(velocity);
    for(let i=cols+1;i<positions.length;i++){
      const p=positions[i],v=Math.floor(i/(cols+1))/rows;old.copy(p);delta.copy(p).sub(previous[i]).multiplyScalar(.975);
      const flutter=reduced?0:Math.sin(clock*8+i*.27)*(.8+speed*1.5);
      p.add(delta);p.x+=(-acceleration.x*.25+turn*v+flutter*.35)*h*h;
      p.y+=(-4.5-acceleration.y*.35+power*3*v)*h*h;
      p.z+=(-speed*(4+v*7)-acceleration.z*.32+flutter-power*8)*h*h;
      previous[i].copy(old);
    }
    for(let pass=0;pass<5;pass++){
      for(const {a,b,length,stiffness} of links){delta.copy(positions[b]).sub(positions[a]);const d=delta.length();if(d<1e-7)continue;delta.multiplyScalar((d-length)/d*stiffness);const pinA=a<=cols,pinB=b<=cols;if(!pinA)positions[a].addScaledVector(delta,pinB?1:.5);if(!pinB)positions[b].addScaledVector(delta,pinA?-1:-.5);}
      for(let i=0;i<=cols;i++)positions[i].copy(rest[i]);
      for(let i=cols+1;i<positions.length;i++){
        const p=positions[i];
        // Elliptic torso and hip envelope keeps cloth outside the armor.
        if(p.y>-.42&&p.y<.20){const rx=p.y>-.16?.29:.22,rz=.19,d=Math.hypot(p.x/rx,p.z/rz);if(d<1){p.x/=Math.max(.05,d);p.z/=Math.max(.05,d);}}
        // Posed arm capsules let the cloth slide over elbows and hands.
        for(const {a,b,radius} of colliders){
          axis.copy(b).sub(a);const t=T.MathUtils.clamp(separation.copy(p).sub(a).dot(axis)/Math.max(1e-8,axis.lengthSq()),0,1);
          nearest.copy(a).addScaledVector(axis,t);separation.copy(p).sub(nearest);const d=separation.length();
          if(d<radius){if(d<1e-6)separation.set(0,0,1);else separation.multiplyScalar(1/d);p.copy(nearest).addScaledVector(separation,radius);}
        }
        p.y=Math.max(floor,p.y);
      }
    }
  }
  function update(dt,{speed=0,verticalSpeed=0,turn=0,power=0,reduced=false,colliders=[],floor=-.65}={}){
    accumulator+=Math.min(.05,Math.max(0,dt));while(accumulator>=1/90){step(1/90,{speed,verticalSpeed,turn,power,reduced,colliders,floor});accumulator-=1/90;}
    const p=geometry.attributes.position;positions.forEach((v,i)=>p.setXYZ(i,v.x,v.y,v.z));p.needsUpdate=true;geometry.computeVertexNormals();
  }
  return {mesh,update,reset,positions,rest};
}
