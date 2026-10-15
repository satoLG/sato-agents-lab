import * as T from '../vendor/three.module.min.js';
import {orbNoiseGLSL as noiseGLSL,orbNoiseGradientGLSL} from './orb-noise.js';
import {orbGroundGLSL} from './orb-ground.js';

export const CORE_RADIUS = 1.84;
export const WATER_RADIUS = 2.05;

// Radius and its exact gradient in sphere space. The shoreline envelope raises
// only the water over the existing beach; no terrain vertices are moved.
export const orbWaterSurfaceGLSL=`
  uniform float orbTime,orbStrength;
  uniform vec3 orbMoonDirection;
  uniform float orbInteractionTime;
  uniform vec4 orbRippleCenters[8];
  uniform float orbRippleStrengths[8];
  ${orbNoiseGradientGLSL}
  vec2 orbSmooth(float lo,float hi,float x) {
    float t=clamp((x-lo)/(hi-lo),0.,1.);
    return vec2(t*t*(3.-2.*t),6.*t*(1.-t)/(hi-lo));
  }
  vec4 orbSurface(vec3 n) {
    vec4 large=orbNoiseGradient(n*2.25+vec3(orbTime*.16,0.,orbTime*.09));
    vec4 small=orbNoiseGradient(n*6.51-vec3(0.,orbTime*.2,orbTime*.13));
    vec4 fine=orbNoiseGradient(n*13.02+vec3(5.,-orbTime*.26,0.));
    float u=dot(n,vec3(4.34,0.,2.48))+orbTime*.55;
    float v=dot(n,vec3(0.,4.96,-2.17))+orbTime*.38;
    float waves=(large.x-.5)*.21+(.68*small.x+.32*fine.x-.5)*.09+sin(u)*sin(v)*.027;
    vec3 waveGradient=large.yzw*(2.25*.21)+small.yzw*(6.51*.68*.09)+fine.yzw*(13.02*.32*.09)
      +.027*(cos(u)*sin(v)*vec3(4.34,0.,2.48)+sin(u)*cos(v)*vec3(0.,4.96,-2.17));
    vec3 moon=normalize(orbMoonDirection);
    float a=dot(n,moon),tide=.016+.046*a*a+.016*a,gain=1.+.24*a;
    vec3 tideGradient=(.092*a+.016)*moon;
    vec2 coastProtection=orbSmooth(.58,.82,n.y);
    float waveScale=1.-.985*coastProtection.x,tideScale=1.-.92*coastProtection.x;
    vec3 protectionGradient=vec3(0.,coastProtection.y,0.);
    float radius=${WATER_RADIUS.toFixed(2)}+tide*tideScale+waves*(orbStrength*1.65)*gain*waveScale;
    vec3 gradient=tideGradient*tideScale-.92*tide*protectionGradient
      +(orbStrength*1.65)*(waveGradient*gain*waveScale+waves*.24*moon*waveScale-waves*gain*.985*protectionGradient);
    float h2=dot(n.xz,n.xz);
    if(n.y>.58&&h2>.000001) {
      float h=sqrt(h2),angle=atan(n.z,n.x),ca=cos(angle),sa=sin(angle);
      vec3 angleGradient=vec3(-n.z,0.,n.x)/h2;
      float coast=.92*(1.+.09*sin(3.*angle+.7)+.055*cos(5.*angle-1.2));
      float coastDerivative=.92*(.27*cos(3.*angle+.7)-.275*sin(5.*angle-1.2));
      // A readable sand band surrounds the grass. Adjust only the water's
      // contact point, preserving every vertex of the existing island.
      float contact=.92+.014*sin(orbTime*.9+angle*3.)+.008*sin(orbTime*1.37-angle*5.);
      float contactDerivative=.042*cos(orbTime*.9+angle*3.)-.040*cos(orbTime*1.37-angle*5.);
      float d=contact*coast,dd=contact*coastDerivative+contactDerivative*coast,x=d*ca,z=d*sa;
      float dx=dd*ca-d*sa,dz=dd*sa+d*ca;
      float mound=.025*exp(-((x+.18)*(x+.18)+(z+.20)*(z+.20))/.25);
      float plateau=2.145+mound;
      float dp=-8.*mound*((x+.18)*dx+(z+.20)*dz);
      float beach=sqrt(2.072*2.072-d*d),db=-d*dd/beach;
      vec2 beachBlend=orbSmooth(.44,1.16,contact);
      float blend=beachBlend.x;
      float height=mix(plateau,beach,blend),dh=mix(dp,db,blend)+(beach-plateau)*beachBlend.y*contactDerivative;
      float level=sqrt(d*d+height*height),dl=(d*dd+height*dh)/level;
      float ratio=2.18*h/coast;
      vec3 ratioGradient=2.18*(vec3(n.x,0.,n.z)/(h*coast)-h*coastDerivative*angleGradient/(coast*coast));
      vec2 inner=orbSmooth(.25,.65,ratio),outer=orbSmooth(1.04,1.70,ratio),cap=orbSmooth(.58,.72,n.y);
      float mask=inner.x*(1.-outer.x)*cap.x;
      vec3 maskGradient=(inner.y*(1.-outer.x)-inner.x*outer.y)*cap.x*ratioGradient
        +inner.x*(1.-outer.x)*vec3(0.,cap.y,0.);
      radius+=(level-${WATER_RADIUS.toFixed(2)})*mask;
      gradient+=dl*angleGradient*mask+(level-${WATER_RADIUS.toFixed(2)})*maskGradient;
    }
    for(int i=0;i<8;i++) {
      float age=orbInteractionTime-orbRippleCenters[i].w;
      if(age<0.||age>1.6||orbRippleStrengths[i]<.001)continue;
      vec3 delta=n-orbRippleCenters[i].xyz;
      float chord=length(delta),distance=chord*2.1;
      if(distance>.65)continue;
      vec3 dg=2.1*delta/max(.001,chord);
      float front=(distance-age*.22)/.055;
      float envelope=exp(-front*front-age*2.)*smoothstep(0.,.08,age)*(1.-smoothstep(1.2,1.6,age))*orbRippleStrengths[i];
      vec4 turbulence=orbNoiseGradient(n*7.+vec3(age*.4));
      float phase=distance*45.-age*12.+turbulence.x*.7;
      radius+=.007*envelope*sin(phase);
      gradient+=.007*envelope*(cos(phase)*(45.*dg+turbulence.yzw*4.9)-sin(phase)*2.*front/.055*dg);
    }
    if(radius<${(CORE_RADIUS+.06).toFixed(2)})return vec4(${(CORE_RADIUS+.06).toFixed(2)},0.,0.,0.);
    return vec4(radius,gradient);
  }
`;

export function createOrbWater() {
  const uniforms = {
    orbTime:{value:0},orbStrength:{value:.9},orbMoonDirection:{value:new T.Vector3(1,0,0)},
    orbInteractionTime:{value:0},orbRippleCenters:{value:Array.from({length:8},()=>new T.Vector4(0,1,0,-10))},orbRippleStrengths:{value:new Float32Array(8)},
    _SceneDepth:{value:null},_SceneResolution:{value:new T.Vector2(1,1)},
    _CameraNear:{value:.05},_CameraFar:{value:150},
    _EdgeFoamWidth:{value:.035},_EdgeFoamIntensity:{value:.54},_SceneTexelSize:{value:new T.Vector2(1,1)},
    _EdgeFoamColor:{value:new T.Color(1,.97,1)},
  };
  const material = new T.MeshPhysicalMaterial({
    color:'#47b8de', metalness:0, roughness:.23,
    transmission:1, thickness:.48, ior:1.333,
    attenuationColor:'#327dae', attenuationDistance:2.8,
    clearcoat:0, specularIntensity:0, envMapIntensity:0,
    // Physical transmission draws the opaque core through the moving surface.
    transparent:true, opacity:1, depthWrite:false,
  });
  const displacement = `
    varying vec3 vOrbPosition;
    varying highp float vOrbEyeDepth;
    ${orbWaterSurfaceGLSL}
  `;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = displacement + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
      vec3 orbN = normalize(position);
      vec4 orbField=orbSurface(orbN);
      vec3 orbP=orbN*orbField.x;
      vec3 orbGradient=orbField.yzw-orbN*dot(orbN,orbField.yzw);
      vec3 objectNormal=normalize(orbN*orbField.x-orbGradient);
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
      #endif
    `);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = orbP; vOrbPosition = transformed; vOrbEyeDepth = -(modelViewMatrix * vec4(transformed,1.)).z;');
    shader.fragmentShader = `uniform float orbTime; varying vec3 vOrbPosition;
      varying highp float vOrbEyeDepth;
      uniform highp sampler2D _SceneDepth;
      uniform vec2 _SceneResolution, _SceneTexelSize;
      uniform float _CameraNear, _CameraFar, _EdgeFoamWidth, _EdgeFoamIntensity;
      uniform vec3 _EdgeFoamColor;
      // satoLG/portfolio OceanShaders.ts: stable depth linearization and
      // analytic eye depth retain the mobile precision fix from the original.
      float linearizeDepthBuffer(float depth,float near,float far) {
        return (near*far)/(far*(1.0-depth)+depth*near);
      }
      float foamSample(vec2 uv,float waterDepth,float width) {
        float depth=texture2D(_SceneDepth,uv).x;
        float gap=linearizeDepthBuffer(depth,_CameraNear,_CameraFar)-waterDepth;
        return step(0.,gap)*(1.-smoothstep(0.,width,gap))*(1.-step(.9999,depth));
      }
      float calcEdgeFoam(vec2 uv) {
        float sceneLinear=linearizeDepthBuffer(texture2D(_SceneDepth,uv).x,_CameraNear,_CameraFar);
        float gap=sceneLinear-vOrbEyeDepth;
        // Bound the projected contact band to 2.5 pixels, even on steep or
        // nearly parallel surfaces where a constant eye-depth width balloons.
        vec2 gapGradient=vec2(dFdx(gap),dFdy(gap));
        float width=max(.0005,min(_EdgeFoamWidth,length(gapGradient)*2.5));
        float foam=foamSample(uv,vOrbEyeDepth,width);
        vec2 waterGradient=vec2(dFdx(vOrbEyeDepth),dFdy(vOrbEyeDepth));
        vec2 offset=_SceneTexelSize*1.5;
        vec2 pixels=offset*_SceneResolution;
        // Neighbouring contact samples let foam softly extend past an opaque
        // silhouette instead of being cut off at the island/model boundary.
        foam=max(foam,.55*foamSample(uv+vec2(offset.x,0.),vOrbEyeDepth+waterGradient.x*pixels.x,width));
        foam=max(foam,.55*foamSample(uv-vec2(offset.x,0.),vOrbEyeDepth-waterGradient.x*pixels.x,width));
        foam=max(foam,.55*foamSample(uv+vec2(0.,offset.y),vOrbEyeDepth+waterGradient.y*pixels.y,width));
        foam=max(foam,.55*foamSample(uv-vec2(0.,offset.y),vOrbEyeDepth-waterGradient.y*pixels.y,width));
        return foam;
      }
      ${noiseGLSL}` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float orbDepth = orbNoise(vOrbPosition*1.5+vec3(0.,orbTime*.035,0.));
      diffuseColor.rgb *= mix(vec3(.52,.78,.89), vec3(.90,1.06,1.08), orbDepth);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float causticPhase = orbNoise(vOrbPosition*5.5+vec3(orbTime*.09,0.,-orbTime*.13));
      float caustic = pow(1. - abs(sin(causticPhase * 20.)), 22.);
      totalEmissiveRadiance += vec3(.03,.20,.23) * caustic * .12;
      // One white light only. Object silhouettes and environment streaks do
      // not become highlights; the water also receives no projected shadows.
      vec3 whiteLight=normalize((viewMatrix*vec4(-.32,.78,.48,0.)).xyz);
      vec3 whiteHalf=normalize(whiteLight+normalize(vViewPosition));
      totalEmissiveRadiance+=vec3(.55)*pow(max(0.,dot(normal,whiteHalf)),130.);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float orbEdgeFoamRaw=calcEdgeFoam(gl_FragCoord.xy/max(_SceneResolution,vec2(1.)));
      float edgeFoam=clamp(orbEdgeFoamRaw*_EdgeFoamIntensity,0.,1.);
      outgoingLight=mix(outgoingLight,max(outgoingLight,_EdgeFoamColor),edgeFoam);
      #include <opaque_fragment>
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_fragment>',`
      #include <transmission_fragment>
      // Rays that miss the submerged core see black space. Keep that rim blue
      // instead of drawing an apparent black reflection around the ocean.
      totalDiffuse=max(totalDiffuse,vec3(.009,.055,.10));
    `);
  };
  material.customProgramCacheKey = () => 'orb-water-one-light-living-coast-v6';
  let ripple=0;
  return {material,uniforms,emitRipple(point,amount=1){
    const n=point.clone().normalize(),i=ripple++%8;
    uniforms.orbRippleCenters.value[i].set(n.x,n.y,n.z,uniforms.orbInteractionTime.value);
    uniforms.orbRippleStrengths.value[i]=amount;
  }};
}

export function createOrbCore() {
  const time = {value:0};
  const material = new T.MeshStandardMaterial({color:'#22677b', roughness:.8, metalness:.08});
  material.onBeforeCompile = shader => {
    shader.uniforms.orbCoreTime = time;
    shader.vertexShader = 'varying vec3 vCorePosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCorePosition = position;');
    shader.fragmentShader = `varying vec3 vCorePosition; ${orbGroundGLSL}` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      diffuseColor.rgb=orbRockSurface(vCorePosition);
    `);
  };
  material.customProgramCacheKey = () => 'orb-submerged-core-continuous-v2';
  return {material, time};
}
