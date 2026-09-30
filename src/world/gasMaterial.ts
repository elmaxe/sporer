import * as THREE from 'three';
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
  uniform vec3 uGasPhaseB;
  uniform vec3 uGasPhaseC;
  uniform vec3 uGasPhaseFine;
  varying vec3 vGasDir;

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
    float lat = d.y + 0.05 * gasNoise(vec3(d.x * 1.2, d.y * 2.0, d.z * 1.2), uGasPhaseA);
    float s = clamp((lat + 1.0) * 0.5, 0.0, 0.9999) * uGasCount;
    int k = int(floor(s));
    float edge = ${GAS_EDGE_START.toFixed(2)};
    // Softened to at least a pixel so the edge doesn't alias.
    float soft = max(1.0 - edge, px * uGasCount * 0.5);
    vec3 col = mix(uGasStripes[k], uGasStripes[k + 1], smoothstep(1.0 - soft, 1.0, s - float(k)));

    float wave = gasNoise(vec3(d.x * 4.0, d.y * 6.0, d.z * 4.0), uGasPhaseB);
    float swirl = gasNoise(vec3(d.x * 12.0, d.y * 40.0, d.z * 12.0), uGasPhaseC);
    float band = smoothstep(2.0, 6.0, 0.07 / px);
    float shade = 0.08 * sin(lat * 90.0 + 4.0 * wave) * band + 0.06 * swirl * smoothstep(2.0, 6.0, 0.15 / px);

    // Fine turbulence stretched along the bands (latitude changes fastest), swirled by the wave.
    float freq = 60.0;
    float amp = 0.1;
    for (int o = 0; o < 5; o++) {
      float fade = smoothstep(2.0, 6.0, (6.2831853 / (freq * 2.5)) / px);
      if (fade <= 0.0) break;
      float n = sin(d.y * freq * 3.1 + (d.x * 1.7 + d.z * 0.9) * freq * 0.3 + uGasPhaseFine.x + 0.6 * float(o) + 2.0 * wave)
              * sin((d.x * 1.1 - d.z * 1.3) * freq * 0.5 + d.y * freq * 0.4 + uGasPhaseFine.y)
              * sin(d.y * freq * 1.3 + d.z * freq * 0.4 + uGasPhaseFine.z);
      shade += fade * amp * 2.5 * n;
      freq *= 2.3;
      amp *= 0.82;
    }
    return col * (1.0 + shade);
  }
`;

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
    // terrainNoise's phases for the seeds the painter uses (seed, seed + 1, seed + 2), and the fine octaves'.
    uGasPhaseA: { value: phases(seed, 1.3, 2.7, 0.7) },
    uGasPhaseB: { value: phases(seed + 1, 1.3, 2.7, 0.7) },
    uGasPhaseC: { value: phases(seed + 2, 1.3, 2.7, 0.7) },
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
