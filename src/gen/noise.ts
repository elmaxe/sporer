/**
 * Cheap deterministic 3D noise for low-poly planet terrain. Not Perlin, but
 * smooth, seedable and good enough at planet scale. Returns a value in [-1, 1],
 * roughly uniform-ish: about 25% of the surface is below -0.25, 50% below 0.
 * Pass a unit direction vector for seamless results on a sphere.
 */
export function terrainNoise(x: number, y: number, z: number, seed: number): number {
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
