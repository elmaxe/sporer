import { gaussianPath } from '../gen/nebulas';
import type { Vec3Like } from '../gen/orbit';
import { GLOW_NEAR } from './appearance';
import { GAUSSIAN_K, GAUSSIAN_PATH_GLSL } from './glowVolume';

/**
 * The dust lanes (GalaxyDust) smoothed into one thin ring of dust in the
 * galactic plane, which dims the stars' dots seen through it: the lanes
 * themselves can only dim what's drawn before them (the glow and the gas),
 * so without this, edge-on, the stars behind a lane speckle it. The density
 * is the difference of two Gaussian ellipsoids, both `thickness` high, out
 * to `outer` and `inner` (fractions of the galaxy radius): zero in the
 * middle, where there are no lanes, and positive everywhere else.
 */
export const DISC_DUST = {
  /** Half-height (the ellipsoid's y radius; σ is a third of it), × galaxy radius. */
  thickness: 0.015,
  outer: 1.5,
  inner: 0.45,
  /** Optical depth straight through the ring where it's densest. */
  faceOnDepth: 0.2,
  /** Stars stay at least this bright, so none vanishes from the map. */
  minTransmittance: 0.2,
} as const;

/** Densest point of exp(-K r²/outer²) - exp(-K r²/inner²), in units of the galaxy radius. */
function ringPeak(): number {
  let best = 0;
  for (let r = 0; r <= DISC_DUST.outer; r += 0.001) {
    const g = Math.exp((-GAUSSIAN_K * r * r) / DISC_DUST.outer ** 2) - Math.exp((-GAUSSIAN_K * r * r) / DISC_DUST.inner ** 2);
    best = Math.max(best, g);
  }
  return best;
}

/** Optical depth per galaxy unit of column (of the unit-peak profile), for a galaxy of `radius`. */
function density(radius: number): number {
  const faceOnColumn = ringPeak() * DISC_DUST.thickness * radius * Math.sqrt(Math.PI / GAUSSIAN_K);
  return DISC_DUST.faceOnDepth / faceOnColumn;
}

/**
 * The share of a star's light at `to` that reaches `from` (galaxy
 * coordinates), as the shader works it out. Dust within GLOW_NEAR of `from`
 * doesn't dim, like the disc's glow, so the view from inside stays clear.
 */
export function discDustTransmittance(from: Vec3Like, to: Vec3Like, radius: number): number {
  const ray = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const len = Math.hypot(ray.x, ray.y, ray.z);
  if (len <= GLOW_NEAR) return 1;
  const column = (scale: number) => {
    const r = { x: scale * radius, y: DISC_DUST.thickness * radius, z: scale * radius };
    const o = { x: from.x / r.x, y: from.y / r.y, z: from.z / r.z };
    const d = { x: ray.x / len / r.x, y: ray.y / len / r.y, z: ray.z / len / r.z };
    return gaussianPath(o, d, GAUSSIAN_K, GLOW_NEAR) - gaussianPath(o, d, GAUSSIAN_K, len);
  };
  const depth = density(radius) * Math.max(column(DISC_DUST.outer) - column(DISC_DUST.inner), 0);
  return DISC_DUST.minTransmittance + (1 - DISC_DUST.minTransmittance) * Math.exp(-depth);
}

/**
 * GLSL: `discDustTransmittance(from, to)` for a galaxy of `radius` (see the
 * TypeScript version). Brings its own copy of GAUSSIAN_PATH_GLSL.
 */
export function discDustGlsl(radius: number): string {
  const f = (v: number) => v.toFixed(6);
  return /* glsl */ `
    ${GAUSSIAN_PATH_GLSL}

    float discDustColumn(vec3 o, vec3 d, float len, vec3 radii) {
      vec3 ou = o / radii;
      vec3 du = d / radii;
      return gaussianPath(ou, du, ${GAUSSIAN_K.toFixed(1)}, ${f(GLOW_NEAR)}) - gaussianPath(ou, du, ${GAUSSIAN_K.toFixed(1)}, len);
    }

    float discDustTransmittance(vec3 from, vec3 to) {
      vec3 ray = to - from;
      float len = length(ray);
      if (len <= ${f(GLOW_NEAR)}) return 1.0;
      vec3 d = ray / len;
      float h = ${f(DISC_DUST.thickness * radius)};
      float column = discDustColumn(from, d, len, vec3(${f(DISC_DUST.outer * radius)}, h, ${f(DISC_DUST.outer * radius)}))
        - discDustColumn(from, d, len, vec3(${f(DISC_DUST.inner * radius)}, h, ${f(DISC_DUST.inner * radius)}));
      float depth = ${f(density(radius))} * max(column, 0.0);
      return mix(${f(DISC_DUST.minTransmittance)}, 1.0, exp(-depth));
    }
  `;
}
