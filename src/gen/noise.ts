import { GLOBE_SIZE_FACTOR } from './planets';
import { realSurface, surfaceHeight } from './realSurface';

/**
 * Cheap deterministic 3D noise for low-poly planet terrain. Not Perlin, but
 * smooth, seedable and good enough at planet scale. Returns a value in [-1, 1],
 * roughly uniform-ish: about 25% of the surface is below -0.25, 50% below 0.
 * Pass a unit direction vector for seamless results on a sphere.
 */
export function terrainNoise(x: number, y: number, z: number, seed: number): number {
  // A real body (the Sol system's Earth, Moon, Mars, Pluto) reads its height map instead (gen/realSurface.ts).
  const real = realSurface(seed);
  if (real) return surfaceHeight(real, x, y, z);
  let sum = 0;
  let amp = 1;
  let freq = 1.3;
  let total = 0;
  for (let octave = 0; octave < 3; octave++) {
    sum +=
      amp *
      Math.sin(x * freq * 1.7 + seed * 1.3) *
      Math.sin(y * freq * 2.1 + seed * 2.7 + z * freq * 0.6) *
      Math.sin(z * freq * 1.9 + seed * 0.7 + x * freq);
    total += amp;
    amp *= 0.5;
    freq *= 2.2;
  }
  // The raw sum clusters within ±0.55; stretch it to use the full range.
  return Math.max(-1, Math.min(1, (sum / total) * 1.8));
}

/** Largest amount `detailedTerrain` differs from `terrainNoise` (before clamping to [-1, 1]). */
export const DETAIL_AMPLITUDE = 0.15;

/** Each detail octave's frequency is this many times the last one's. */
const DETAIL_LACUNARITY = 2.3;

/**
 * `detailedTerrain`'s octaves: three at the original scale (Earth radius 100,
 * the finest hills ~5 units apart), plus one per 2.3× bigger globes, so the
 * finest hills stay about that size next to the UFO however big the globes are.
 */
export const DETAIL_OCTAVES = 3 + Math.max(0, Math.round(Math.log(GLOBE_SIZE_FACTOR) / Math.log(DETAIL_LACUNARITY)));

/**
 * `terrainNoise` plus a few higher-frequency octaves at small amplitude, for
 * the close-up planet surface. Continents and seas stay where the system
 * view puts them; only hills and coastline wiggles are added.
 */
export function detailedTerrain(x: number, y: number, z: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 11;
  let total = 0;
  for (let octave = 0; octave < DETAIL_OCTAVES; octave++) {
    sum +=
      amp *
      Math.sin(x * freq * 1.7 + seed * 3.1) *
      Math.sin(y * freq * 2.1 + seed * 1.9 + z * freq * 0.6) *
      Math.sin(z * freq * 1.9 + seed * 0.3 + x * freq);
    total += amp;
    amp *= 0.5;
    freq *= DETAIL_LACUNARITY;
  }
  // Stretched like terrainNoise (the raw sum clusters near 0), then scaled down.
  const detail = DETAIL_AMPLITUDE * Math.max(-1, Math.min(1, (sum / total) * 2.5));
  // A real body keeps only some of the detail (RealSurface.detail).
  const real = realSurface(seed);
  return Math.max(-1, Math.min(1, terrainNoise(x, y, z, seed) + detail * (real ? real.detail : 1)));
}
