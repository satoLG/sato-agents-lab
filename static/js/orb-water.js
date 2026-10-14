import * as T from '../vendor/three.module.min.js';

export const CORE_RADIUS = 1.84;
export const WATER_RADIUS = 2.05;

// Continuous 3D value noise: no UV seam at the poles or the back of the globe.
const noiseGLSL = `
float orbHash(vec3 p) {
  p = fract(p * .3183099 + vec3(.13, .27, .41));
  p *= 17.;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float orbNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(
    mix(mix(orbHash(i), orbHash(i + vec3(1,0,0)), f.x),
        mix(orbHash(i + vec3(0,1,0)), orbHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(orbHash(i + vec3(0,0,1)), orbHash(i + vec3(1,0,1)), f.x),
        mix(orbHash(i + vec3(0,1,1)), orbHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float orbFbm(vec3 p) {
  return .57 * orbNoise(p) + .29 * orbNoise(p * 2.07 + 5.) + .14 * orbNoise(p * 4.13 + 11.);
}
`;

export function createOrbWater() {
  const uniforms = {
    orbTime:{value:0},orbStrength:{value:.9},orbMoonDirection:{value:new T.Vector3(1,0,0)},
    _SceneDepth:{value:null},_SceneResolution:{value:new T.Vector2(1,1)},
    _CameraNear:{value:.05},_CameraFar:{value:150},
    _EdgeFoamWidth:{value:.065},_EdgeFoamIntensity:{value:.62},
    _EdgeFoamColor:{value:new T.Color(1,.97,1)},
  };
  const material = new T.MeshPhysicalMaterial({
    color:'#47b8de', metalness:0, roughness:.16,
    transmission:1, thickness:.48, ior:1.333,
    attenuationColor:'#327dae', attenuationDistance:2.8,
    clearcoat:1, clearcoatRoughness:.13, envMapIntensity:1.15,
    // Physical transmission draws the opaque core through the moving surface.
    transparent:true, opacity:1, depthWrite:false,
  });
  const displacement = `
    uniform float orbTime;
    uniform float orbStrength;
    uniform vec3 orbMoonDirection;
    varying vec3 vOrbPosition;
    varying highp float vOrbEyeDepth;
    ${noiseGLSL}
    vec3 orbDisplace(vec3 p) {
      vec3 n = normalize(p);
      vec3 q = n * 3.1;
      float largeWave = (orbNoise(n * 2.25 + vec3(orbTime*.16, 0., orbTime*.09)) - .5) * .21;
      float smallWave = (orbFbm(q * 2.1 - vec3(0., orbTime*.2, orbTime*.13)) - .5) * .09;
      float swell = sin(q.x*1.4 + q.z*.8 + orbTime*.55) * sin(q.y*1.6 - q.z*.7 + orbTime*.38) * .027;
      // The beach remains readable even when the open ocean is rough.
      float shore = 1. - .66 * smoothstep(.84, .97, n.y);
      float alignment = dot(n, normalize(orbMoonDirection));
      // Both tidal lobes remain above the resting radius. The lunar side
      // rises slightly more; the far side and the equator keep moving too.
      float tide = .012 + .028 * alignment * alignment + .008 * alignment;
      float waveGain = 1. + .18 * alignment;
      float radius = ${WATER_RADIUS.toFixed(2)} + tide * shore + (largeWave + smallWave + swell) * (orbStrength * 1.65) * shore * waveGain;
      radius = max(${(CORE_RADIUS+.06).toFixed(2)}, radius);
      return n * radius;
    }
  `;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = displacement + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
      vec3 orbN = normalize(position);
      vec3 orbT = normalize(cross(abs(orbN.y) > .98 ? vec3(1.,0.,0.) : vec3(0.,1.,0.), orbN));
      vec3 orbB = normalize(cross(orbN, orbT));
      vec3 orbP = orbDisplace(position);
      // Reconstruct the normal from displaced neighbours, so reflections wobble too.
      vec3 orbPT = orbDisplace(position + orbT * .012);
      vec3 orbPB = orbDisplace(position + orbB * .012);
      vec3 objectNormal = normalize(cross(orbPT - orbP, orbPB - orbP));
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
      #endif
    `);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = orbDisplace(position); vOrbPosition = transformed; vOrbEyeDepth = -(modelViewMatrix * vec4(transformed,1.)).z;');
    shader.fragmentShader = `uniform float orbTime; varying vec3 vOrbPosition;
      varying highp float vOrbEyeDepth;
      uniform highp sampler2D _SceneDepth;
      uniform vec2 _SceneResolution;
      uniform float _CameraNear, _CameraFar, _EdgeFoamWidth, _EdgeFoamIntensity;
      uniform vec3 _EdgeFoamColor;
      // satoLG/portfolio OceanShaders.ts: stable depth linearization and
      // analytic eye depth retain the mobile precision fix from the original.
      float linearizeDepthBuffer(float depth,float near,float far) {
        return (near*far)/(far*(1.0-depth)+depth*near);
      }
      float calcEdgeFoam(vec2 screenUv) {
        float sceneDepth=texture2D(_SceneDepth,screenUv).x;
        if(sceneDepth>=.9999)return 0.;
        float sceneLinear=linearizeDepthBuffer(sceneDepth,_CameraNear,_CameraFar);
        float depthDiff=sceneLinear-vOrbEyeDepth;
        if(depthDiff<=0.)return 0.;
        return 1.-smoothstep(0.,_EdgeFoamWidth,depthDiff);
      }
      ${noiseGLSL}` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float orbDepth = orbFbm(vOrbPosition * 1.5 + vec3(0., orbTime*.035, 0.));
      diffuseColor.rgb *= mix(vec3(.52,.78,.89), vec3(.90,1.06,1.08), orbDepth);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float causticPhase = orbFbm(vOrbPosition * 5.5 + vec3(orbTime*.09, 0., -orbTime*.13));
      float caustic = pow(1. - abs(sin(causticPhase * 20.)), 22.);
      totalEmissiveRadiance += vec3(.03,.20,.23) * caustic * .12;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float orbEdgeFoamRaw=calcEdgeFoam(gl_FragCoord.xy/max(_SceneResolution,vec2(1.)));
      float edgeFoam=clamp(orbEdgeFoamRaw*_EdgeFoamIntensity,0.,1.);
      outgoingLight=mix(outgoingLight,max(outgoingLight,_EdgeFoamColor),edgeFoam);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => 'orb-physical-water-lunar-tides-v3';
  return {material, uniforms};
}

export function createOrbCore() {
  const time = {value:0};
  const material = new T.MeshStandardMaterial({color:'#22677b', roughness:.8, metalness:.08});
  material.onBeforeCompile = shader => {
    shader.uniforms.orbCoreTime = time;
    shader.vertexShader = 'varying vec3 vCorePosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCorePosition = position;');
    shader.fragmentShader = `uniform float orbCoreTime; varying vec3 vCorePosition; ${noiseGLSL}` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float rock = orbFbm(vCorePosition * 2.7);
      float detail = orbNoise(vCorePosition * 17.);
      diffuseColor.rgb = mix(vec3(.028,.13,.20), vec3(.085,.36,.38), rock);
      diffuseColor.rgb *= .85 + detail * .25;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float lightNoise = orbFbm(vCorePosition * 5. + vec3(orbCoreTime*.075, orbCoreTime*.04, 0.));
      float lightLines = pow(1. - abs(sin(lightNoise * 21.)), 16.);
      totalEmissiveRadiance += vec3(.018,.15,.19) * lightLines;
    `);
  };
  material.customProgramCacheKey = () => 'orb-submerged-core-v1';
  return {material, time};
}
