import { fbm } from './beltDust';

/**
 * A disc's clumps, baked once into a polar texture (so a disc filling the
 * screen costs one lookup per pixel instead of noise): u runs round the disc
 * (wrapping: the noise is sampled round a circle), v across it in log radius
 * from the inner edge (0) to the outer (1). Each texel holds the factor on the
 * dust, 0.45–1.55 (texel / 255 × CLUMP_SCALE). Pure (no THREE).
 */
export const CLUMP_SCALE = 2;

export function bakeDiscClumps(seed: number, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  const offset = (seed % 1000) / 97;
  // How far the disc runs across, in the noise's units (log radius, like the old per-pixel noise).
  for (let j = 0; j < height; j++) {
    const v = (j + 0.5) / height;
    for (let i = 0; i < width; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / width;
      const coarse = fbm(Math.cos(a) * 3, Math.sin(a) * 3, v * 5 + offset, 3);
      const fine = fbm(Math.cos(a) * 11, Math.sin(a) * 11, v * 19 + offset * 1.7, 2);
      const factor = 0.45 + 1.1 * coarse * (0.6 + 0.8 * fine);
      out[j * width + i] = Math.round((255 * Math.min(CLUMP_SCALE, factor)) / CLUMP_SCALE);
    }
  }
  return out;
}
