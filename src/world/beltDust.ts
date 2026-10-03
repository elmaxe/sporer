import type { BeltData } from '../gen/belts';

/**
 * The pattern of a belt's dusty band, baked once into a texture (so the band,
 * which can cover the whole screen, costs a lookup per pixel instead of noise):
 * u runs round the belt (the whole way, or across a Trojan swarm's arc), v
 * across it in log radius from the inner edge (0) to the outer (1). It holds
 * the soft edges, the Kirkwood gaps, the swarm's arc and clumps drawn out
 * along the orbit, divided by `DUST_PATTERN_SCALE` to fit 0–1. Pure (no THREE).
 */
export const DUST_PATTERN_SCALE = 1.5;

/** A Trojan swarm's dust spreads this many librations either side of the Lagrange point. */
export const TROJAN_DUST_SPREAD = 1.25;
/** The swarm's dust, exp(−2·(off / spread)²), is all but gone (under 1%) this many spreads out. */
const ARC_REACH = 1.6;

export interface DustPattern {
  width: number;
  height: number;
  /** One byte per texel, row by row (v), starting at v = 0. */
  data: Uint8Array;
  /** The local angle (radians, atan(z, x) in the belt's plane) at u = 0, and the angle u spans. */
  start: number;
  span: number;
  /** Whether u wraps round (a full ring) or stops at the arc's ends. */
  wraps: boolean;
}

/** The half-width (radians) of a Trojan swarm's dust arc, centred on its Lagrange point; null for a full ring. */
export function dustArcHalfWidth(data: BeltData): number | null {
  return data.trojan ? data.trojan.libration * TROJAN_DUST_SPREAD * ARC_REACH : null;
}

export function bakeDustPattern(data: BeltData, width: number, height: number): DustPattern {
  const half = dustArcHalfWidth(data);
  const spread = data.trojan ? data.trojan.libration * TROJAN_DUST_SPREAD : 0;
  const start = half === null ? -Math.PI : -half;
  const span = half === null ? 2 * Math.PI : 2 * half;
  const seed = (data.seed % 1000) / 100;
  const gapWidth = data.gaps[0]?.width ?? 0.05;
  const out = new Uint8Array(width * height);
  for (let j = 0; j < height; j++) {
    const t = (j + 0.5) / height;
    let across = smoothstep(0, 0.18, t) * (1 - smoothstep(0.82, 1, t));
    for (const g of data.gaps.slice(0, 3)) across *= 1 - 0.55 * Math.exp(-(((t - g.at) / gapWidth) ** 2) * 2);
    for (let i = 0; i < width; i++) {
      // At the texel's centre (a full ring's last texel meets its first: the noise wraps round the circle).
      const angle = start + (span * (i + 0.5)) / width;
      let a = across;
      if (spread > 0) a *= Math.exp(-((angle / spread) ** 2) * 2);
      // Clumps drawn out along the orbit: noise round a circle (so it wraps) and across the belt.
      a *= 0.35 + 1.1 * fbm(Math.cos(angle) * 9, Math.sin(angle) * 9, t * 6 + seed, 3);
      out[j * width + i] = Math.round(255 * Math.min(1, a / DUST_PATTERN_SCALE));
    }
  }
  return { width, height, data: out, start, span, wraps: half === null };
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const fract = (x: number) => x - Math.floor(x);

/** world/noiseGlsl.ts's hash13 and value-noise fbm, in JS (normalised to [0, 1)). */
function hash13(x: number, y: number, z: number): number {
  x = fract(x * 0.3183099 + 0.1) * 17;
  y = fract(y * 0.3183099 + 0.1) * 17;
  z = fract(z * 0.3183099 + 0.1) * 17;
  return fract(x * y * z * (x + y + z));
}

function valueNoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fy = y - iy;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  return mix(
    mix(mix(hash13(ix, iy, iz), hash13(ix + 1, iy, iz), fx), mix(hash13(ix, iy + 1, iz), hash13(ix + 1, iy + 1, iz), fx), fy),
    mix(
      mix(hash13(ix, iy, iz + 1), hash13(ix + 1, iy, iz + 1), fx),
      mix(hash13(ix, iy + 1, iz + 1), hash13(ix + 1, iy + 1, iz + 1), fx),
      fy,
    ),
    fz,
  );
}

export function fbm(x: number, y: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x, y, z);
    total += amp;
    x = x * 2.03 + 1.7;
    y = y * 2.03 + 1.7;
    z = z * 2.03 + 1.7;
    amp *= 0.5;
  }
  return sum / total;
}
