// Adapted from Christian Ortiz, cortiz2894/charged-blast-vfx.
// See docs/orb-combat.md for source revision and adaptation notes.
// ─── ChargeOrb shared shaders ─────────────────────────────────────────────────

export const BASE_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vObjPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vObjPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const GLOW_FRAG = /* glsl */ `
  uniform vec3  uColorInner;
  uniform vec3  uColorOuter;
  uniform float uEmission;
  uniform float uProgress;
  uniform float uFalloffPower;
  uniform float uEdgeSoftness;
  varying vec3  vNormal;

  void main() {
    float f    = 1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
    float glow = pow(clamp(1.0 - f, 0.0, 1.0), uFalloffPower);
    vec3  col  = mix(uColorInner, uColorOuter, pow(f, uEdgeSoftness));
    float alpha = glow * uEmission * uProgress;
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

export const FRESNEL_FRAG = /* glsl */ `
  uniform vec3  uCoreColor;
  uniform vec3  uRimColor;
  uniform float uEmission;
  uniform float uProgress;
  uniform float uFresnelPower;
  uniform float uBodyFalloff;
  uniform float uCoreFalloff;
  uniform float uCoreBoost;
  varying vec3  vNormal;

  void main() {
    float f    = 1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
    float body = pow(max(0.0, 1.0 - f), uBodyFalloff);
    float core = pow(max(0.0, 1.0 - f * uCoreFalloff), 4.0);
    vec3  col  = mix(uCoreColor, uRimColor, pow(f, uFresnelPower));
    float bright = (body + core * uCoreBoost) * uEmission * uProgress;
    gl_FragColor = vec4(col * bright, bright);
  }
`;

export const NOISE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform vec3  uColor;
  uniform float uNoiseScale;
  uniform float uNoiseSpeed;
  uniform float uFlowIntensity;
  uniform float uWarpStrength;
  varying vec3  vNormal;
  varying vec3  vObjPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i),                  hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    float f = 1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
    vec2 p = vObjPos.xy * uNoiseScale;
    vec2 q = vec2(fbm(p + uTime * uNoiseSpeed),
                  fbm(p + vec2(3.7, 2.1) + uTime * uNoiseSpeed * 0.7));
    vec2 r = vec2(fbm(p + uWarpStrength * q + vec2(1.7, 9.2) + uTime * uNoiseSpeed * 0.5),
                  fbm(p + uWarpStrength * q + vec2(8.3, 2.8) + uTime * uNoiseSpeed * 0.9));
    float nv = fbm(p + uWarpStrength * r);
    float cloud = smoothstep(0.3, 0.75, nv);
    float mask  = smoothstep(0.05, 0.4, f) * (1.0 - smoothstep(0.35, 1.0, f));
    float alpha = cloud * mask * uFlowIntensity * uProgress;
    gl_FragColor = vec4(uColor * alpha, alpha);
  }
`;

// ─── Projectile gradient shader ───────────────────────────────────────────────

export const PROJECTILE_VERT = /* glsl */ `
  varying float vPosY;
  varying vec3  vNormal;
  void main() {
    vPosY   = position.y;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const PROJECTILE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uGradientSpeed;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform float uBandWidth;
  uniform float uTipY;
  uniform float uTailY;
  uniform vec3  uFresnelColor;
  uniform float uFresnelPower;
  uniform float uFresnelEmission;
  varying float vPosY;
  varying vec3  vNormal;

  void main() {
    // t: 0 at dome tip (+Y), 1 at tail tip (-Y)
    float t        = (uTipY - vPosY) / max(0.001, uTipY - uTailY);
    float scrolled = fract(t - uTime * uGradientSpeed);

    // A -> C -> B -> C -> A via sine wave — seamless loop, no hard cut
    float wave  = sin(scrolled * 3.14159265);
    float blend = pow(max(0.0, wave), max(0.01, 1.0 / uBandWidth));
    // 3-stop: A(0) → C(0.5) → B(1)
    float t1  = clamp(blend * 2.0,       0.0, 1.0);
    float t2  = clamp(blend * 2.0 - 1.0, 0.0, 1.0);
    vec3  col = mix(mix(uColorA, uColorC, t1), uColorB, t2);

    // Fresnel rim on top
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), uFresnelPower);
    col += uFresnelColor * fresnel * uFresnelEmission;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Muzzle flash shader ──────────────────────────────────────────────────────

export const MUZZLE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const MUZZLE_FRAG = /* glsl */ `
  uniform vec3  uColor;
  uniform float uEmission;
  uniform float uInnerRadius;   // 0 → 1: agujero crece hasta consumir el disco
  uniform float uEdgeSoftness;
  uniform float uNumRays;       // cantidad de rayos
  uniform float uRayWidth;      // fracción angular de cada sector que ocupa el rayo (0..0.5)
  uniform float uRaySoftness;   // suavidad en los bordes angulares del rayo
  varying vec2  vUv;

  void main() {
    vec2  dir = vUv - 0.5;
    float d   = length(dir) * 2.0;   // 0 = centro, 1 = borde del círculo

    // Corte exterior duro
    float outer = step(d, 1.0);

    // Agujero interior con borde suave, crece desde el centro hacia afuera
    float inner = smoothstep(uInnerRadius - uEdgeSoftness, uInnerRadius, d);

    // Máscara angular con bordes suaves — uRaySoftness=0 equivale al step duro anterior
    float angle   = atan(dir.y, dir.x);
    float sector  = fract(angle / 6.28318 * uNumRays);
    float edge    = abs(sector - 0.5);
    float soft    = max(uRaySoftness, 0.0001);
    float rayMask = 1.0 - smoothstep(uRayWidth - soft, uRayWidth + soft, edge);

    float alpha = outer * inner * rayMask * uEmission;
    gl_FragColor = vec4(uColor * alpha, alpha);
  }
`;

// ─── Normal projectile shader (color flat + fresnel, sin gradiente) ───────────

export const TRAIL_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv     = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
