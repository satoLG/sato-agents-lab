import * as T from '../vendor/three.module.min.js';

export function createOrbTrails(water) {
  const group=new T.Group();group.name='orb-sato-trails';group.userData.orbFoamExclude=true;
  const footprintCount=96,particleCount=80;
  const footprintGeometry=new T.PlaneGeometry(.032,.055);
  const birth=new T.InstancedBufferAttribute(new Float32Array(footprintCount).fill(-100),1);footprintGeometry.setAttribute('printBirth',birth);
  const time={value:0},footprintMaterial=new T.ShaderMaterial({uniforms:{trailTime:time},transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,
    vertexShader:'uniform float trailTime;attribute float printBirth;varying vec2 vUv;varying float vFade;void main(){vUv=uv;vFade=clamp(1.-(trailTime-printBirth)/18.,0.,1.);gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;varying float vFade;void main(){vec2 p=(vUv-.5)*2.;float d=length(p/vec2(.88,.95));float mask=1.-smoothstep(.77,1.,d);float rim=exp(-pow((d-.78)*12.,2.));gl_FragColor=vec4(mix(vec3(.34,.27,.15),vec3(.73,.64,.43),rim*.7),mask*vFade*.42);}`});
  const footprints=new T.InstancedMesh(footprintGeometry,footprintMaterial,footprintCount);footprints.name='sato-sand-footprints';footprints.frustumCulled=false;group.add(footprints);
  const particleMaterial=new T.MeshBasicMaterial({color:'#e9ffff',transparent:true,opacity:.8,depthWrite:false,toneMapped:false});
  const particles=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),particleMaterial,particleCount);particles.name='sato-foam-particles';particles.frustumCulled=false;group.add(particles);
  const dummy=new T.Object3D(),matrix=new T.Matrix4(),right=new T.Vector3(),forward=new T.Vector3(),normal=new T.Vector3();
  const slots=Array.from({length:particleCount},()=>({position:new T.Vector3(),velocity:new T.Vector3(),age:10,life:0,size:0}));
  let printIndex=0,particleIndex=0,seed=4129;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  dummy.scale.setScalar(0);dummy.updateMatrix();for(let i=0;i<footprintCount;i++)footprints.setMatrixAt(i,dummy.matrix);for(let i=0;i<particleCount;i++)particles.setMatrixAt(i,dummy.matrix);
  function footprint(event) {
    const i=printIndex++%footprintCount;normal.copy(event.normal).normalize();forward.copy(event.heading).addScaledVector(normal,-event.heading.dot(normal)).normalize();
    right.crossVectors(normal,forward).normalize();matrix.makeBasis(right,forward.clone().negate(),normal);dummy.quaternion.setFromRotationMatrix(matrix);
    dummy.position.copy(event.point).addScaledVector(normal,.0015);dummy.scale.setScalar(1);dummy.updateMatrix();footprints.setMatrixAt(i,dummy.matrix);
    birth.setX(i,time.value);birth.needsUpdate=true;footprints.instanceMatrix.needsUpdate=true;
  }
  function splash(event) {
    const count=event.type==='step'?3:event.double?8:event.type==='land'?24:18;
    water.emitRipple(event.point,event.type==='step'?.5:event.type==='land'?1.15:.85);
    for(let j=0;j<count;j++) {
      const particle=slots[particleIndex++%particleCount],a=random()*Math.PI*2;
      right.crossVectors(event.up,Math.abs(event.up.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0)).normalize();forward.crossVectors(right,event.up).normalize();
      particle.position.copy(event.point).addScaledVector(event.up,.012);
      particle.velocity.copy(event.up).multiplyScalar((event.type==='step'?.13:.3)+random()*.38).addScaledVector(right,Math.cos(a)*(.08+random()*.32)).addScaledVector(forward,Math.sin(a)*(.08+random()*.32));
      particle.age=0;particle.life=.32+random()*.38;particle.size=.004+random()*.007;
    }
  }
  function emit(event) {if(event.surface==='sand'&&event.type==='step')footprint(event);if(event.surface==='water')splash(event);}
  function update(dt,seconds) {
    time.value=seconds;water.uniforms.orbInteractionTime.value=seconds;let visible=false;
    for(let i=0;i<slots.length;i++) {
      const particle=slots[i];particle.age+=dt;
      if(particle.age<particle.life){particle.velocity.addScaledVector(particle.position.clone().normalize(),-3.2*dt);particle.position.addScaledVector(particle.velocity,dt);dummy.position.copy(particle.position);dummy.scale.setScalar(particle.size*(1-particle.age/particle.life));visible=true;}
      else dummy.scale.setScalar(0);
      dummy.quaternion.identity();dummy.updateMatrix();particles.setMatrixAt(i,dummy.matrix);
    }
    particles.visible=visible;particles.instanceMatrix.needsUpdate=true;
  }
  return {group,footprints,particles,emit,update,get activeParticles(){return slots.filter(p=>p.age<p.life).length;},get footprintTotal(){return printIndex;}};
}
