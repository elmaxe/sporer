import * as THREE from 'three';
import { SIMPLEX_GLSL } from './noiseGlsl';
import { GAS_EDGE_START, GAS_MAX_STRIPES, gasStripes } from './planetGeometry';

/*
 * A gas giant's cloud tops painted per pixel, the same pattern as `gasPainter`
 * (which the maps use): stripes by latitude with noise-wobbled edges, plus thin
 * wavy streaks and, close up, turbulence finer and finer. Vertex colours would
 * smear the stripe edges across the triangles (and cost a mesh the size of the
 * finest detail), so the lit sphere gets its colour from the direction of each
 * pixel instead. Streaks and fine octaves fade out once they get narrower than
 * a few pixels (by the screen-space change of the direction), so a far giant
 * doesn't shimmer.
 */

const GAS_GLSL = /* glsl */ `
  uniform vec3 uGasStripes[${GAS_MAX_STRIPES}];
  uniform float uGasCount;
  uniform vec3 uGasPhaseA;
  uniform vec3 uGasPhaseFine;
  varying vec3 vGasDir;
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

  vec3 gasColor(vec3 d) {
    // Width of a pixel in direction units: detail narrower than a few of them fades out.
    float px = max(length(fwidth(d)), 1e-6);
    // Clouds: billowy turbulence, stretched along the bands (latitude changes fastest) and swirled
    // by warping the lookup with a coarser pass of itself. Octaves narrower than a few pixels fade out.
    vec3 off = uGasPhaseFine * 3.0;
    vec3 q = vec3(d.x * 5.0, d.y * 15.0, d.z * 5.0) + off;
    vec3 warp = vec3(snoise(q * 0.45), snoise(q * 0.45 + 17.0), snoise(q * 0.45 + 41.0));
    q += 0.3 * warp;
    float n = 0.0;
    float amp = 0.5;
    float total = 0.0;
    float freq = 1.0;
    for (int o = 0; o < 8; o++) {
      float fade = smoothstep(1.5, 5.0, (1.0 / (freq * 15.0)) / px);
      if (fade <= 0.0) break;
      n += amp * fade * snoise(q * freq);
      total += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    n /= total * 0.6;
    // Puffs lighter than the band, gaps between them darker, softly.
    float cloud = smoothstep(-0.5, 0.7, n);
    float shade = mix(-0.11, 0.1, cloud);
    float lat = d.y + 0.05 * gasNoise(vec3(d.x * 1.2, d.y * 2.0, d.z * 1.2), uGasPhaseA) + 0.02 * n;
    float s = clamp((lat + 1.0) * 0.5, 0.0, 0.9999) * uGasCount;
    int k = int(floor(s));
    float edge = ${GAS_EDGE_START.toFixed(2)};
    // Softened to at least a pixel so the edge doesn't alias.
    float soft = max(1.0 - edge, px * uGasCount * 0.5);
    vec3 col = mix(uGasStripes[k], uGasStripes[k + 1], smoothstep(1.0 - soft, 1.0, s - float(k)));

    return col * (1.0 + shade);
  }
`;

/** The colour of a gas giant's haze: the bands' average, lightened (the air scatters more than the clouds reflect). */
export function gasHazeColor(bands: readonly string[]): string {
  const mean = new THREE.Color(0, 0, 0);
  for (const b of bands) mean.add(new THREE.Color(b));
  mean.multiplyScalar(1 / Math.max(1, bands.length));
  return '#' + mean.lerp(new THREE.Color(1, 1, 1), 0.1).getHexString();
}

const TAU = Math.PI * 2;

/** `seed * factors` (one per axis), wrapped to [0, 2π) so the GPU's sine keeps its precision. */
function phases(seed: number, fx: number, fy: number, fz: number): THREE.Vector3 {
  const wrap = (v: number) => ((v % TAU) + TAU) % TAU;
  return new THREE.Vector3(wrap(seed * fx), wrap(seed * fy), wrap(seed * fz));
}

/**
 * The lit material of a gas giant's smooth sphere (see `createGasGeometry`),
 * coloured per pixel from the pixel's direction from the planet's centre.
 */
export function createGasMaterial(seed: number, bands: readonly string[]): THREE.MeshStandardMaterial {
  const { stripes, order } = gasStripes(seed, bands);
  const colours = Array.from({ length: GAS_MAX_STRIPES }, (_, i) => order[Math.min(i, order.length - 1)]!.clone());
  const uniforms = {
    uGasStripes: { value: colours },
    uGasCount: { value: stripes },
    // terrainNoise's phases for the seeds the painter uses (seed), and the clouds' offset in the noise.
    uGasPhaseA: { value: phases(seed, 1.3, 2.7, 0.7) },
    uGasPhaseFine: { value: phases(seed, 3.1, 1.9, 0.3) },
  };
  const material = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGasDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGasDir = normalize(position);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GAS_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= gasColor(normalize(vGasDir));');
  };
  material.customProgramCacheKey = () => 'gas-giant';
  return material;
}
