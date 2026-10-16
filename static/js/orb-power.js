import * as T from '../vendor/three.module.min.js';

export function createOrbPower(water){
  const group=new T.Group();group.name='sato-power-effects';group.userData.orbFoamExclude=true;
  const coreMaterial=new T.MeshBasicMaterial({color:'#dcfaff',transparent:true,opacity:.95,depthWrite:false,toneMapped:false});
  const glowMaterial=new T.MeshBasicMaterial({color:'#25aaff',transparent:true,opacity:.24,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
  const orb=new T.Mesh(new T.SphereGeometry(1,24,16),coreMaterial);orb.name='sato-charge-orb';group.add(orb);
  const halo=new T.Mesh(new T.SphereGeometry(1,24,16),glowMaterial);group.add(halo);
  const beamRoot=new T.Group();group.add(beamRoot);
  const tube=new T.CylinderGeometry(1,1,1,16,1,true).rotateX(Math.PI/2).translate(0,0,.5);
  const beam=new T.Mesh(tube,coreMaterial),glow=new T.Mesh(tube,glowMaterial);beamRoot.add(beam,glow);beam.name='sato-laser-core';
  const windMaterial=new T.MeshBasicMaterial({color:'#a8e9ff',transparent:true,opacity:.32,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
  const wind=[];for(let i=0;i<5;i++){const ring=new T.Mesh(new T.TorusGeometry(1,.007,4,64,Math.PI*1.45),windMaterial);group.add(ring);wind.push(ring);}
  const motes=new T.InstancedMesh(new T.SphereGeometry(1,6,4),glowMaterial,48);motes.frustumCulled=false;group.add(motes);
  const dummy=new T.Object3D(),up=new T.Vector3(0,1,0),forward=new T.Vector3(0,0,1),origin=new T.Vector3(),muzzle=new T.Vector3(),right=new T.Vector3();
  let state='idle',charge=0,chargeTime=0,beamTime=0,strength=0,age=0,recovery=0;
  const uniforms=water.uniforms;
  function begin(){if(state!=='idle')return false;state='charging';chargeTime=0;return true;}
  function release(){if(state!=='charging')return;strength=.25+.75*charge;beamTime=0;state='firing';}
  function cancel(){state='idle';charge=0;chargeTime=0;beamTime=0;strength=0;recovery=0;uniforms.orbPowerCharge.value=uniforms.orbPowerBeam.value=uniforms.orbPowerLength.value=0;group.visible=false;}
  function update(dt,{position,heading,normal,muzzlePosition,reduced=false}={}){
    dt=Math.min(.05,Math.max(0,dt));age+=dt;
    // A tap can press and release between animation frames. Capture its pose
    // on the first firing tick as well as throughout a held charge.
    if(state==='charging'||state==='firing'&&beamTime===0){origin.copy(position);up.copy(normal);forward.copy(heading);muzzle.copy(muzzlePosition);}
    if(state==='charging'){
      chargeTime+=dt;charge=Math.min(1,chargeTime/1.25);
      if(chargeTime>=3)release();
    }
    if(state==='firing'){
      beamTime+=dt;muzzle.copy(muzzlePosition);
      if(beamTime>.85+strength*.8){state='recovering';recovery=0;}
    }
    if(state==='recovering'){recovery+=dt;if(recovery>1.5){state='idle';charge=0;}}
    const fire=state==='firing'?Math.min(1,beamTime/.12)*strength:0;
    const returnFlow=state==='recovering'?Math.pow(1-T.MathUtils.smoothstep(recovery,0,1.5),2):1;
    const chargeForce=state==='charging'?charge:state==='firing'?charge*.75:state==='recovering'?charge*.75*returnFlow:0;
    const channelForce=state==='firing'?fire:state==='recovering'?strength*returnFlow:0;
    uniforms.orbPowerUp.value.copy(up);uniforms.orbPowerForward.value.copy(forward);uniforms.orbPowerCharge.value=chargeForce;uniforms.orbPowerBeam.value=channelForce;
    uniforms.orbPowerLength.value=state==='charging'?0:Math.min(2.6,beamTime*7)*(.55+.45*strength);
    group.visible=state!=='idle';if(!group.visible)return;
    const pulse=reduced?1:1+.05*Math.sin(age*22),size=(.014+charge*.025)*pulse;
    orb.position.copy(muzzle);halo.position.copy(muzzle);orb.scale.setScalar(size);halo.scale.setScalar(size*1.9);orb.visible=halo.visible=state==='charging'||state==='firing';
    beamRoot.visible=state==='firing';beamRoot.position.copy(muzzle);beamRoot.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),forward);
    beam.scale.set(.012+fire*.025,.012+fire*.025,uniforms.orbPowerLength.value);glow.scale.set(.03+fire*.045,.03+fire*.045,uniforms.orbPowerLength.value);
    right.crossVectors(up,forward).normalize();
    for(let i=0;i<wind.length;i++){
      const phase=(age*(reduced?.35:1.2)+i/wind.length)%1,r=.10+phase*(.25+chargeForce*.50);
      wind[i].position.copy(origin).addScaledVector(up,.02+Math.sin(phase*Math.PI)*.08);wind[i].quaternion.setFromUnitVectors(new T.Vector3(0,0,1),up);wind[i].rotateZ(age*(i%2?1:-1)+i);wind[i].scale.setScalar(r);wind[i].visible=chargeForce>.01;
    }
    windMaterial.opacity=.30*chargeForce;
    for(let i=0;i<48;i++){
      const phase=(age*(reduced?.4:1.3)+i/48)%1,a=i*2.399+age*.8,r=(.15+phase*.60)*chargeForce;
      dummy.position.copy(origin).addScaledVector(up,.04+phase*.2).addScaledVector(right,Math.cos(a)*r).addScaledVector(forward,Math.sin(a)*r);dummy.scale.setScalar(.004*chargeForce*(1-phase));dummy.updateMatrix();motes.setMatrixAt(i,dummy.matrix);
    }
    motes.instanceMatrix.needsUpdate=true;
  }
  cancel();return {group,begin,release,cancel,update,get state(){return state;},get charge(){return charge;},get firing(){return state==='firing'?strength:0;},get active(){return state!=='idle';},get locked(){return state==='charging'||state==='firing';}};
}
