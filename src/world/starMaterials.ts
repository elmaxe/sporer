import * as THREE from 'three';
import type { StarActivity } from '../gen/starActivity';

/** Global multipliers over each star's own activity (debug tuning). */
export const starParams = {
  /** Scales every star's animation pace. */
  pace: 1,
  granulation: 1,
  spots: 1,
  limbDarkening: 0.65,
  corona: 1,
};

/**
 * 3D simplex noise, from Ashima Arts / Stefan Gustavson's webgl-noise
 * (MIT licence). Returns roughly [-1, 1].
 */
const simplex = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;

/*
 * Star surface. The large, slow features (spots, supergranulation swell) are
 * low-frequency, so they're sampled per vertex on a fine sphere and
 * interpolated; only the granulation is per pixel.
 */
const surfaceVertex = /* glsl */ `
  uniform float uTime;        // already scaled by the star's pace
  uniform float uSpinTime;    // system time, for differential rotation
  uniform float uDiffRate;    // radians per second the poles lag the equator
  uniform float uGranulation;
  uniform vec3 uOffset;       // per-star noise offset
  varying vec3 vDir;          // differentially rotated surface direction
  varying float vSpot;
  varying float vSwell;
  varying vec3 vNormal;
  varying vec3 vView;
  ${simplex}

  void main() {
    vec3 d = normalize(position);
    // The mesh turns at the equator's rate, higher latitudes lag.
    float lag = uSpinTime * uDiffRate * d.y * d.y;
    float c = cos(lag), s = sin(lag);
    vDir = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
    // Spots: a slow, low-frequency field (thresholded per pixel).
    vSpot = snoise(vDir * 1.7 + uOffset * 0.37 + vec3(0.0, uTime * 0.006, 0.0)) * 0.7
          + snoise(vDir * 4.1 - uOffset * 0.21) * 0.3;
    // Supergranulation: a broad, slow brightness swell under the cells.
    vSwell = snoise(vDir * uGranulation * 0.25 - uOffset + vec3(0.0, uTime * 0.03, 0.0));
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const surfaceFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uExposure;    // star intensity × eye adaptation
  uniform float uTime;
  uniform float uGranulation;
  uniform float uContrast;
  uniform float uSpots;
  uniform float uLimb;
  uniform vec3 uOffset;
  varying vec3 vDir;
  varying float vSpot;
  varying float vSwell;
  varying vec3 vNormal;
  varying vec3 vView;
  ${simplex}

  void main() {
    vec3 p = normalize(vDir);
    // Granulation: bright convection cells with dark lanes, churning with time.
    vec3 q = p * uGranulation + uOffset;
    float n1 = snoise(q + vec3(0.0, 0.0, uTime * 0.12));
    float n2 = snoise(q * 2.3 + vec3(uTime * 0.2, 0.0, 0.0));
    // Dark lanes where the noise crosses zero, bright cell centres between them.
    float lanes = smoothstep(0.0, 0.3, abs(n1));
    float bright = 1.0 + uContrast * (lanes * 0.8 + 0.2 * n2 - 0.65) + uContrast * 0.35 * vSwell;

    // Sunspots: dark umbrae with a penumbra, avoiding the poles.
    float threshold = mix(1.0, 0.2, uSpots);
    float penumbra = smoothstep(threshold, threshold + 0.07, vSpot);
    float umbra = smoothstep(threshold + 0.08, threshold + 0.16, vSpot);
    float belt = 1.0 - smoothstep(0.55, 0.85, abs(p.y));
    bright *= 1.0 - belt * (penumbra * 0.35 + umbra * 0.4);

    // Limb darkening, redder towards the edge.
    float mu = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
    float limb = mix(1.0, 0.35 + 0.65 * pow(mu, 0.55), uLimb);
    vec3 col = uColor * bright * limb;
    col *= mix(vec3(1.0, 0.72, 0.55), vec3(1.0), smoothstep(0.0, 0.6, mu) * 0.6 + 0.4);
    // Overexposed light bleeds into white, like a bright light on film: before
    // the eye adapts the disc is white-hot with a coloured limb; adapted, the
    // surface shows at its plain colours.
    col *= uExposure;
    float over = max(max(col.r, col.g), col.b);
    col = mix(min(col, vec3(1.0)), vec3(1.0), smoothstep(1.0, 2.4, over));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/*
 * The corona covers a large billboard, so the fragment shader is just the soft
 * glow texture. The streamers are worked out per vertex on a fine ring mesh
 * (see createCoronaGeometry) and interpolated.
 */
const coronaVertex = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;       // 1 ± amplitude, from the CPU
  uniform float uStreamers;
  uniform vec3 uOffset;
  varying vec2 vUv;
  varying float vGain;
  void main() {
    vUv = uv;
    vec2 c = uv * 2.0 - 1.0;
    float r = length(c);
    float a = atan(c.y, c.x);
    // Radial rays from a few drifting sines of the angle.
    float rays = 0.45 * sin(a * 7.0 + uOffset.x + uTime * 0.11)
               + 0.3 * sin(a * 12.0 + uOffset.y - uTime * 0.07 + 1.3 * sin(uTime * 0.05))
               + 0.25 * sin(a * 19.0 + uOffset.z + uTime * 0.17);
    float band = smoothstep(0.12, 0.25, r) * (1.0 - smoothstep(0.35, 1.0, r));
    vGain = uPulse * max(0.0, 1.0 + uStreamers * rays * band * 2.5);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const coronaFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uGlare;       // from the exposure: a blazing star has a stronger halo
  varying vec2 vUv;
  varying float vGain;
  void main() {
    gl_FragColor = vec4(uColor * texture2D(uMap, vUv).a * vGain * uOpacity * uGlare, 1.0);
    #include <colorspace_fragment>
  }
`;

/** A unit-wide disc with enough angular and radial vertices for smooth streamers. */
export function createCoronaGeometry(): THREE.BufferGeometry {
  return new THREE.RingGeometry(0, 0.5, 96, 8);
}

/** Per-star noise offset, so stars of one type don't share a surface. */
function noiseOffset(seed: number): THREE.Vector3 {
  return new THREE.Vector3(((seed % 997) / 997) * 50, (((seed >>> 10) % 991) / 991) * 50, (((seed >>> 20) % 983) / 983) * 50);
}

/** Unlit animated star surface: granulation, drifting spots, limb darkening. */
export function createStarSurfaceMaterial(color: string, activity: StarActivity, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: surfaceVertex,
    fragmentShader: surfaceFragment,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uSpinTime: { value: 0 },
      // Poles lag by ~20% of the equator's rate.
      uDiffRate: { value: (0.2 * 2 * Math.PI) / activity.rotationPeriod },
      uGranulation: { value: activity.granulation },
      uContrast: { value: activity.contrast },
      uSpots: { value: activity.spots },
      uLimb: { value: starParams.limbDarkening },
      uOffset: { value: noiseOffset(seed) },
      uExposure: { value: 1 },
    },
  });
}

/** Additive corona billboard: the soft glow texture plus drifting streamers, pulsing. */
export function createCoronaMaterial(
  color: string,
  opacity: number,
  seed: number,
  glowTexture: THREE.Texture,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: coronaVertex,
    fragmentShader: coronaFragment,
    uniforms: {
      uMap: { value: glowTexture },
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uPulse: { value: 1 },
      uStreamers: { value: 0.35 },
      uOffset: { value: noiseOffset(seed ^ 0x5bd1e995) },
      uGlare: { value: 1 },
    },
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}

/** Updates both materials' uniforms for system time `time`. */
export function animateStarMaterials(
  surface: THREE.ShaderMaterial,
  corona: THREE.ShaderMaterial,
  activity: StarActivity,
  time: number,
): void {
  const t = time * activity.pace * starParams.pace;
  const s = surface.uniforms;
  s.uTime!.value = t;
  s.uSpinTime!.value = time;
  s.uGranulation!.value = activity.granulation * starParams.granulation;
  s.uSpots!.value = Math.min(1, activity.spots * starParams.spots);
  s.uLimb!.value = starParams.limbDarkening;
  const c = corona.uniforms;
  c.uTime!.value = t;
  c.uPulse!.value = 1 + activity.pulse * starParams.corona * Math.sin((2 * Math.PI * time) / activity.pulsePeriod);
  c.uStreamers!.value = 0.35 * starParams.corona;
}

/**
 * Sets how bright the star looks: `exposure` is the surface brightness
 * multiplier (star intensity × eye adaptation; 1 = plain colours). The halo
 * grows with its square root.
 */
export function setStarExposure(surface: THREE.ShaderMaterial, corona: THREE.ShaderMaterial, exposure: number): void {
  surface.uniforms.uExposure!.value = exposure;
  corona.uniforms.uGlare!.value = Math.sqrt(exposure);
}
