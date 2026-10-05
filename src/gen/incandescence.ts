/**
 * How hot rock glows: a black body's colour from Planck's law through the
 * CIE 1931 observer, a cheap per-channel fit of it for shaders, and how fast
 * a lava crust's surface cools. Pure maths; see docs/research/lava.md.
 */

/** Planck's constant (J s), the speed of light (m/s) and Boltzmann's constant (J/K), exact in the SI (NIST). */
const H = 6.62607015e-34;
const C = 299792458;
const K = 1.380649e-23;

/** Wyman, Sloan & Shirley (2013)'s piecewise Gaussian fit of the CIE 1931 colour matching functions (λ in nm). */
function lobe(w: number, mean: number, below: number, above: number): number {
  const t = (w - mean) * (w < mean ? below : above);
  return Math.exp(-0.5 * t * t);
}
const cieX = (w: number): number => 0.362 * lobe(w, 442.0, 0.0624, 0.0374) + 1.056 * lobe(w, 599.8, 0.0264, 0.0323) - 0.065 * lobe(w, 501.1, 0.049, 0.0382);
const cieY = (w: number): number => 0.821 * lobe(w, 568.8, 0.0213, 0.0247) + 0.286 * lobe(w, 530.9, 0.0613, 0.0322);
const cieZ = (w: number): number => 1.217 * lobe(w, 437.0, 0.0845, 0.0278) + 0.681 * lobe(w, 459.0, 0.0385, 0.0725);

/** XYZ → linear sRGB (D65), as CSS Color 4 gives it. */
const XYZ_TO_SRGB = [
  [12831 / 3959, -329 / 214, -1974 / 3959],
  [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
  [705 / 12673, -2585 / 12673, 705 / 667],
] as const;

/** A black body's spectral radiance at wavelength `nm` and temperature `T` (K), W/(m² sr m). */
export function planck(nm: number, T: number): number {
  const l = nm * 1e-9;
  return (2 * H * C * C) / l ** 5 / Math.expm1((H * C) / (l * K * T));
}

/** A black body's CIE 1931 XYZ at `T` (K), summed over 360–830 nm in 1 nm steps (unnormalised). */
export function blackbodyXyz(T: number): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let w = 360; w <= 830; w++) {
    const L = planck(w, T);
    x += L * cieX(w);
    y += L * cieY(w);
    z += L * cieZ(w);
  }
  return [x, y, z];
}

/** A black body's linear sRGB at `T` (K), relative to the luminance (Y) of one at `ref` K; out-of-gamut channels are negative. */
export function blackbodyRgb(T: number, ref: number): [number, number, number] {
  const xyz = blackbodyXyz(T);
  const y = blackbodyXyz(ref)[1];
  const [r, g, b] = XYZ_TO_SRGB.map((row) => (row[0] * xyz[0] + row[1] * xyz[1] + row[2] * xyz[2]) / y);
  return [r!, g!, b!];
}

/** A channel fitted as exp(ln − c/T): Wien's approximation at an effective wavelength. */
export interface GlowChannel {
  ln: number;
  c: number;
}

/**
 * The red and green of `blackbodyRgb(T, ref)` each fitted as exp(ln − c/T),
 * by least squares on their logarithms at every 25 K from `from` to `to` K.
 * What the lava shader evaluates (blue is out of gamut this cool).
 */
export function fitGlow(ref: number, from = 1000, to = 1500): { r: GlowChannel; g: GlowChannel } {
  const sums = [0, 1].map(() => ({ n: 0, x: 0, y: 0, xx: 0, xy: 0 }));
  for (let T = from; T <= to; T += 25) {
    const rgb = blackbodyRgb(T, ref);
    sums.forEach((s, ch) => {
      const x = 1 / T;
      const y = Math.log(rgb[ch]!);
      s.n++;
      s.x += x;
      s.y += y;
      s.xx += x * x;
      s.xy += x * y;
    });
  }
  const [r, g] = sums.map((s) => {
    const slope = (s.n * s.xy - s.x * s.y) / (s.n * s.xx - s.x * s.x);
    return { ln: (s.y - slope * s.x) / s.n, c: -slope };
  });
  return { r: r!, g: g! };
}

/** A fitted channel's value at `T` (K). */
export function glowAt(channel: GlowChannel, T: number): number {
  return Math.exp(channel.ln - channel.c / T);
}

/**
 * A pāhoehoe crust's surface temperature `age` seconds after it formed, K:
 * Hon et al. (1994)'s fit, T = 303 − 140·log10(age in hours) °C, never above
 * the melt's `meltT`.
 */
export function crustSurfaceT(age: number, meltT: number): number {
  return Math.min(273.15 + 303 - 140 * Math.log10(age / 3600), meltT);
}
