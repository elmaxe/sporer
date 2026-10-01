import * as THREE from 'three';
import type { AtmosphereSun } from './atmosphereShell';
import { SIMPLEX_GLSL } from './noiseGlsl';
import { GAS_EDGE_START, GAS_MAX_STRIPES, gasStripes } from './planetGeometry';

/*
 * A gas giant is a volume, not a painted ball: there is no surface to stand on.
 * The sphere the game draws (radius R, the cloud tops) is only the boundary of a
 * slab of gas that runs down to DEEP·R. Each pixel marches its view ray through
 * the slab, taking the band colour and a patch of cloud at every step, thicker
 * and darker the deeper it goes, and lets the gas thicken until it hides the
 * murky core. So the picture changes with the viewpoint (the layers slide over
 * one another as the camera moves) and the limb thins out into see-through gas
 * instead of ending at a hard edge, like the volumetric gas giants of KSP's
 * visual mods. The band pattern is still the one `gasPainter` gives the maps.
 */

/** How far down the gas goes, as a fraction of the radius. */
export const GAS_DEPTH = 0.12;
/** Ray-march steps through the slab. */
const STEPS = 14;
/** Optical depth straight down through the slab: how soon the gas stops being see-through. */
const OPTICAL_DEPTH = 3.2;

const GAS_GLSL = /* glsl */ `
  #define STEPS ${STEPS}
  uniform vec3 uGasStripes[${GAS_MAX_STRIPES}];
  uniform float uGasCount;
  uniform vec3 uGasPhaseA;
  uniform vec3 uGasPhaseFine;
  uniform vec3 uGasMean;
  uniform float uTop;
  uniform float uDeep;
  varying vec3 vLocal;
  varying vec3 vOrigin;
  varying vec3 vLight;
${SIMPLEX_GLSL}

  // gen/noise.ts terrainNoise, with the seed's phases worked out on the CPU.
  float gasNoise(vec3 p, vec3 ph) {
    float sum = 0.0;
    float amp = 1.0;
    float freq = 1.3;
    float total = 0.0;
    for (int o = 0; o < 3; o++) {
      sum += amp * sin(p.x * freq * 1.7 + ph.x) * sin(p.y * freq * 2.1 + ph.y + p.z * freq * 0.6) * sin(p.z * freq * 1.9 + ph.z + p.x * freq);
      total += amp;
      amp *= 0.5;
      freq *= 2.2;
    }
    return clamp(sum / total * 1.8, -1.0, 1.0);
  }

  // The stripe colour at latitude 'lat' (-1..1), edges blended softly.
  vec3 stripeColor(float lat) {
    float s = clamp((lat + 1.0) * 0.5, 0.0, 0.9999) * uGasCount;
    int k = int(floor(s));
    return mix(uGasStripes[k], uGasStripes[k + 1], smoothstep(${GAS_EDGE_START.toFixed(2)}, 1.0, s - float(k)));
  }

  // Where the ray (origin o, direction d) crosses the sphere of radius r: (near, far), or far < near if it misses.
  vec2 sphereHit(vec3 o, vec3 d, float r) {
    float b = dot(o, d);
    float disc = b * b - (dot(o, o) - r * r);
    if (disc <= 0.0) return vec2(1.0, -1.0);
    float h = sqrt(disc);
    return vec2(-b - h, -b + h);
  }
`;

const VERTEX = /* glsl */ `
  uniform vec3 sun;
  uniform float sunIsPoint;
  varying vec3 vLocal;
  varying vec3 vOrigin;
  varying vec3 vLight;
  void main() {
    // Everything is worked out in the planet's own frame, where the bands are fixed.
    mat4 inv = inverse(modelMatrix);
    vLocal = position;
    vOrigin = (inv * vec4(cameraPosition, 1.0)).xyz;
    vec3 toSun = sunIsPoint > 0.5 ? sun - modelMatrix[3].xyz : sun;
    vLight = normalize((inv * vec4(toSun, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAGMENT = /* glsl */ `
  ${GAS_GLSL}
  void main() {
    vec3 o = vOrigin;
    vec3 d = normalize(vLocal - vOrigin);
    vec2 top = sphereHit(o, d, uTop);
    if (top.y <= top.x) discard;
    float t0 = max(top.x, 0.0);
    // The ray runs down to the core, or out of the far side of the slab if it skims past it.
    vec2 deep = sphereHit(o, d, uDeep);
    bool core = deep.y > deep.x && deep.x > t0;
    float thickness = uTop - uDeep;
    // A ray skimming the slab is mostly stopped within a few thicknesses; marching all of it would only spread the steps thin.
    float t1 = core ? deep.x : min(top.y, t0 + thickness * 3.0);
    float dt = (t1 - t0) / float(STEPS);
    // Dither the sample positions so the layers don't band.
    float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    // Pixel size in direction units, so detail finer than a few pixels is left out.
    float px = max(length(fwidth(normalize(vLocal))), 1e-6);
    vec3 off = uGasPhaseFine * 3.0;

    vec3 colour = vec3(0.0);
    float T = 1.0;
    for (int i = 0; i < STEPS; i++) {
      vec3 p = o + d * (t0 + dt * (float(i) + jitter));
      float r = length(p);
      vec3 dir = p / r;
      float depth = clamp((uTop - r) / thickness, 0.0, 1.0);
      // Deeper gas turns at its own pace: the layers shear against each other.
      float a = depth * 0.35;
      vec3 q = vec3(dir.x * cos(a) - dir.z * sin(a), dir.y, dir.x * sin(a) + dir.z * cos(a));
      float lat = q.y + 0.05 * gasNoise(vec3(q.x * 1.2, q.y * 2.0, q.z * 1.2), uGasPhaseA);
      vec3 n3 = vec3(q.x * 5.0, q.y * 15.0, q.z * 5.0) + off + depth * 7.0;
      // Swirls: the lookup is shoved about by a slow noise, then streaked along the bands.
      vec3 swirl = vec3(snoise(n3 * 0.22 + 5.0), 0.0, snoise(n3 * 0.22 + 23.0));
      n3 += swirl * vec3(2.2, 0.0, 2.2);
      float cloud = snoise(n3 * 0.5) * 0.65;
      if ((1.0 / 30.0) / px > 2.0) cloud += snoise(n3 * 1.7) * 0.35;
      lat += 0.025 * cloud;
      // Gas thickens with depth, and in the clouds.
      float density = clamp(0.45 + 1.0 * cloud, 0.03, 1.8) * (0.25 + 1.6 * depth);
      float tau = density * (dt / thickness) * ${OPTICAL_DEPTH.toFixed(2)};
      float opacity = 1.0 - exp(-tau);
      float lit = mix(0.3, 1.0, smoothstep(-0.25, 0.35, dot(dir, vLight)));
      // Darker and murkier the deeper it is; the top of the clouds is lightest.
      vec3 base = stripeColor(lat) * (1.0 + 0.45 * cloud);
      vec3 layer = mix(base * (1.15 - 0.6 * depth), uGasMean * 0.45, depth * 0.6) * lit;
      colour += T * opacity * layer;
      T *= 1.0 - opacity;
      if (T < 0.01) break;
    }
    float alpha = 1.0 - T;
    if (core) {
      vec3 cdir = normalize(o + d * t1);
      float lit = mix(0.3, 1.0, smoothstep(-0.25, 0.35, dot(cdir, vLight)));
      colour += T * uGasMean * 0.3 * lit;
      alpha = 1.0;
    }
    gl_FragColor = vec4(colour, alpha);
    // Space shows through where the ray left the slab without reaching the core, so those pixels don't hide what's behind.
    gl_FragDepth = core ? gl_FragCoord.z : 1.0;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** The colour of a gas giant's haze: the bands' average, lightened (the air scatters more than the clouds reflect). */
export function gasHazeColor(bands: readonly string[]): string {
  return '#' + meanBand(bands).lerp(new THREE.Color(1, 1, 1), 0.1).getHexString();
}

function meanBand(bands: readonly string[]): THREE.Color {
  const mean = new THREE.Color(0, 0, 0);
  for (const b of bands) mean.add(new THREE.Color(b));
  return mean.multiplyScalar(1 / Math.max(1, bands.length));
}

const TAU = Math.PI * 2;

/** `seed * factors` (one per axis), wrapped to [0, 2π) so the GPU's sine keeps its precision. */
function phases(seed: number, fx: number, fy: number, fz: number): THREE.Vector3 {
  const wrap = (v: number) => ((v % TAU) + TAU) % TAU;
  return new THREE.Vector3(wrap(seed * fx), wrap(seed * fy), wrap(seed * fz));
}

/**
 * The material of a gas giant's sphere (see `createGasGeometry`, of `radius`):
 * the boundary of the gas volume, which each pixel marches through. Draws
 * before the atmosphere and everything else that's blended.
 */
export function createGasMaterial(seed: number, bands: readonly string[], radius: number, sun: AtmosphereSun): THREE.ShaderMaterial {
  const { stripes, order } = gasStripes(seed, bands);
  const colours = Array.from({ length: GAS_MAX_STRIPES }, (_, i) => order[Math.min(i, order.length - 1)]!.clone());
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uGasStripes: { value: colours },
      uGasCount: { value: stripes },
      // terrainNoise's phases for the painter's seed, and the clouds' offset in the noise.
      uGasPhaseA: { value: phases(seed, 1.3, 2.7, 0.7) },
      uGasPhaseFine: { value: phases(seed, 3.1, 1.9, 0.3) },
      uGasMean: { value: meanBand(bands) },
      uTop: { value: radius },
      uDeep: { value: radius * (1 - GAS_DEPTH) },
      sun: { value: sun.vector },
      sunIsPoint: { value: sun.point ? 1 : 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  return material;
}

/** Gas giants draw before the atmosphere (order 1) and the rings. */
export const GAS_RENDER_ORDER = -1;
