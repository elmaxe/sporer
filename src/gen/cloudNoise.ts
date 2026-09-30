import { Rng } from './rng';

/*
 * The clouds' texture: tileable 3D value-noise fBm, equalised so its values
 * are uniform on [0, 1] (a threshold of 1 − c then covers a share c of it).
 * Two independent fields in one RGBA texel, so a cloud pixel reads both with
 * one fetch: R the cloud shapes, G finer detail (4× the frequency). Pure;
 * world/weatherLook.ts uploads it once as a repeating 3D texture that every
 * cloud layer samples, so no noise is computed per pixel.
 */

/** Lattice periods of the octaves, in cells per texture edge (each divides `size`), and their weights. */
const SHAPES = [
  [4, 1],
  [8, 0.5],
  [16, 0.25],
  [32, 0.125],
] as const;
const DETAIL = [
  [16, 1],
  [32, 0.5],
] as const;

/** A `size`³ RGBA texture of bytes (x fastest), tileable along every axis: R shapes, G detail, B and A spare (zero). */
export function tileableCloudNoise(size = 64, seed = 1): Uint8Array {
  const rng = new Rng(seed);
  const shapes = equalise(fbm(size, SHAPES, rng));
  const detail = equalise(fbm(size, DETAIL, rng));
  const out = new Uint8Array(size * size * size * 4);
  for (let i = 0; i < shapes.length; i++) {
    out[i * 4] = shapes[i]!;
    out[i * 4 + 1] = detail[i]!;
  }
  return out;
}

function fbm(size: number, octaves: readonly (readonly [number, number])[], rng: Rng): Float32Array {
  const field = new Float32Array(size * size * size);
  for (const [period, weight] of octaves) {
    const lattice = new Float32Array(period * period * period);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
    const cell = size / period;
    const at = (x: number, y: number, z: number) => lattice[((z % period) * period + (y % period)) * period + (x % period)]!;
    for (let z = 0; z < size; z++) {
      const fz = z / cell;
      const z0 = Math.floor(fz);
      const tz = fade(fz - z0);
      for (let y = 0; y < size; y++) {
        const fy = y / cell;
        const y0 = Math.floor(fy);
        const ty = fade(fy - y0);
        for (let x = 0; x < size; x++) {
          const fx = x / cell;
          const x0 = Math.floor(fx);
          const tx = fade(fx - x0);
          const c00 = lerp(at(x0, y0, z0), at(x0 + 1, y0, z0), tx);
          const c10 = lerp(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), tx);
          const c01 = lerp(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), tx);
          const c11 = lerp(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), tx);
          field[(z * size + y) * size + x]! += weight * lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
        }
      }
    }
  }
  return field;
}

/** Maps each value to its rank (as a byte), so the result is uniform on [0, 255]. */
function equalise(field: Float32Array): Uint8Array {
  let min = Infinity;
  let max = -Infinity;
  for (const v of field) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const bins = 4096;
  const hist = new Uint32Array(bins);
  const bin = (v: number) => Math.min(bins - 1, Math.floor(((v - min) / (max - min || 1)) * bins));
  for (const v of field) hist[bin(v)]!++;
  // Each bin's value is the middle of its share of the cumulative distribution.
  const cdf = new Float32Array(bins);
  let acc = 0;
  for (let i = 0; i < bins; i++) {
    cdf[i] = (acc + hist[i]! / 2) / field.length;
    acc += hist[i]!;
  }
  const out = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i++) out[i] = Math.round(cdf[bin(field[i]!)]! * 255);
  return out;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
