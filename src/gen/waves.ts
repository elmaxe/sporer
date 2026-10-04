import { Rng } from './rng';

/**
 * Wind waves on a planet's sea (issue #88), as pure data: a handful of
 * travelling sine waves drawn from the Pierson–Moskowitz spectrum of a fully
 * developed sea, and how much slope is left over in wavelets too small to
 * draw (the sea's roughness). The view (world/seaWaves.ts) lays them over
 * the low-orbit sea's normals. See docs/research/sea-waves.md.
 */

/** Standard gravity, m/s² (CODATA). */
export const STANDARD_GRAVITY = 9.80665;

/** Pierson–Moskowitz (1964): α and β of S(ω) = α g² / ω⁵ · exp(−β (ω₀ / ω)⁴), ω₀ = g / U₁₉.₅ (WikiWaves, Ocean-Wave Spectra). */
const PM_ALPHA = 8.1e-3;
const PM_BETA = 0.74;
/** U₁₉.₅ / U₁₀, from the same page's H⅓ = 0.21 U₁₉.₅² / g ≈ 0.22 U₁₀² / g: √(0.22 / 0.21). */
const U195_PER_U10 = Math.sqrt(0.22 / 0.21);

/** The waves the view draws, per projection (the shader lays the sea out on three planes, see world/seaWaves.ts). */
export const WAVES_PER_SET = 12;
/** Sets: one per axis of the triplanar projection. */
export const WAVE_SETS = 3;
/** The longest wave drawn, as a share of the spectrum's peak frequency (a little below the peak, where the energy starts). */
const LOWEST_SHARE = 0.75;

export interface WaveComponent {
  /** Wavelength, metres. */
  length: number;
  /** Angular frequency, rad/s (deep water: ω² = g k). */
  omega: number;
  /** Direction of travel relative to the wind, radians. */
  angle: number;
  /** Slope amplitude a·k (the steepest slope of this sine). */
  slope: number;
  /** Phase at time 0, radians. */
  phase: number;
}

export interface SeaWaves {
  /** Wind speed, m/s at 10 m (0: a calm sea, no waves drawn). */
  wind: number;
  /** Surface gravity, m/s². */
  gravity: number;
  /** Peak angular frequency of the spectrum, rad/s (0 when calm). */
  peakOmega: number;
  /** The whole sea surface's mean square slope (Cox & Munk), drawn waves and wavelets together. */
  meanSquareSlope: number;
  /** WAVE_SETS sets of WAVES_PER_SET waves, longest first (empty when calm). */
  sets: WaveComponent[][];
}

/**
 * Mean square slope of the sea surface at wind speed `wind` (m/s), Cox &
 * Munk (1954), clean surface: σ² = 0.003 + 5.12·10⁻³ U. Their wind was
 * measured at 12.5 m; taken as the 10 m wind here (a few per cent apart).
 */
export function coxMunkSlope(wind: number): number {
  return COX_MUNK[0] + COX_MUNK[1] * Math.max(0, wind);
}

/** Cox & Munk's σ² = a + b U, as [a, b] (the shader mirrors coxMunkSlope with these). */
export const COX_MUNK = [0.003, 5.12e-3] as const;
/** Monahan & O'Muircheartaigh's W = c U^e, as [c, e] (the shader mirrors whitecapCover with these). */
export const WHITECAP = [3.84e-6, 3.41] as const;

/** The Pierson–Moskowitz spectrum's peak angular frequency, ω_p = 0.877 g / U₁₉.₅, at a 10 m wind `wind` (m/s). */
export function peakOmega(wind: number, gravity = STANDARD_GRAVITY): number {
  return (0.877 * gravity) / (wind * U195_PER_U10);
}

/** Significant wave height H⅓ = 0.22 U₁₀² / g of a fully developed sea, metres. */
export function significantHeight(wind: number, gravity = STANDARD_GRAVITY): number {
  return (0.22 * wind * wind) / gravity;
}

/** Deep-water wavelength (m) of angular frequency `omega`: ω² = g k. */
export function wavelength(omega: number, gravity = STANDARD_GRAVITY): number {
  return (2 * Math.PI * gravity) / (omega * omega);
}

/** Deep-water angular frequency of wavelength `length` (m). */
export function waveOmega(length: number, gravity = STANDARD_GRAVITY): number {
  return Math.sqrt((gravity * 2 * Math.PI) / length);
}

/**
 * The slope variance of the Pierson–Moskowitz sea between angular
 * frequencies `from` and `to`: ∫ k² S(ω) dω = ∫ α / ω · exp(−β (ω₀ / ω)⁴) dω
 * (k = ω² / g). Independent of gravity; ~α per e-fold of frequency above the peak.
 */
export function slopeVariance(wind: number, from: number, to: number, gravity = STANDARD_GRAVITY): number {
  if (!(to > from) || wind <= 0) return 0;
  const w0 = gravity / (wind * U195_PER_U10);
  // Midpoint rule in ln ω, where the integrand α·exp(…) is smooth.
  const steps = 200;
  const a = Math.log(from);
  const h = (Math.log(to) - a) / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const w = Math.exp(a + (i + 0.5) * h);
    sum += PM_ALPHA * Math.exp(-PM_BETA * (w0 / w) ** 4);
  }
  return sum * h;
}

/**
 * A sea's waves from its own seed: `wind` (m/s at 10 m; 0 for a calm sea,
 * e.g. no air), `gravity` (m/s²), down to waves `shortest` metres long. Each
 * of the WAVE_SETS sets covers the spectrum from just below its peak to
 * `shortest` in equal steps of ln ω, each wave carrying its band's slope
 * variance, at angles to the wind spread as cos² (Tessendorf's |k̂·ŵ|²).
 */
export function seaWaves(seed: number, wind: number, gravity: number, shortest: number): SeaWaves {
  const meanSquareSlope = coxMunkSlope(wind);
  if (wind <= 0) return { wind: 0, gravity, peakOmega: 0, meanSquareSlope, sets: [] };
  const peak = peakOmega(wind, gravity);
  const low = LOWEST_SHARE * peak;
  const high = Math.max(waveOmega(shortest, gravity), low * 1.01);
  const step = Math.log(high / low) / WAVES_PER_SET;
  const rng = new Rng(seed).fork('waves');
  const sets: WaveComponent[][] = [];
  for (let s = 0; s < WAVE_SETS; s++) {
    const r = rng.fork(s);
    const set: WaveComponent[] = [];
    for (let i = 0; i < WAVES_PER_SET; i++) {
      const from = low * Math.exp(i * step);
      const to = from * Math.exp(step);
      // Jittered within the band, so the three sets don't share wavelengths (no beating where they blend).
      const omega = from * Math.exp(r.range(0.25, 0.75) * step);
      set.push({
        length: wavelength(omega, gravity),
        omega,
        angle: cosSquaredAngle(r),
        slope: Math.sqrt(2 * slopeVariance(wind, from, to, gravity)),
        phase: r.range(0, Math.PI * 2),
      });
    }
    sets.push(set);
  }
  return { wind, gravity, peakOmega: peak, meanSquareSlope, sets };
}

/** The slope variance of one set's drawn waves (a sine of slope amplitude s has variance s² / 2). */
export function drawnVariance(set: readonly WaveComponent[]): number {
  let v = 0;
  for (const w of set) v += (w.slope * w.slope) / 2;
  return v;
}

/** An angle in (−π/2, π/2) with density ∝ cos²: most waves run with the wind, none across it. */
function cosSquaredAngle(rng: Rng): number {
  for (;;) {
    const a = rng.range(-Math.PI / 2, Math.PI / 2);
    const c = Math.cos(a);
    if (rng.next() < c * c) return a;
  }
}

/** A wave's phase at time `time` (s), wrapped to [0, 2π) in double precision so the shader's floats never see a big time. */
export function wavePhase(wave: WaveComponent, time: number): number {
  const p = (wave.phase - wave.omega * time) % (Math.PI * 2);
  return p < 0 ? p + Math.PI * 2 : p;
}

/**
 * Share of the sea covered by whitecaps at a 10 m wind `wind` (m/s):
 * Monahan & O'Muircheartaigh (1980), W = 3.84·10⁻⁶ U^3.41 (a fraction: ~1%
 * at 10 m/s). Fitted on winds mostly under 12 m/s (a tenth up to 17); past
 * that it's extrapolated, and capped at all of it.
 */
export function whitecapCover(wind: number): number {
  return Math.min(1, WHITECAP[0] * Math.max(0, wind) ** WHITECAP[1]);
}

/**
 * The wind under a storm at its full strength, m/s at 10 m: a thunderstorm's
 * gusts at the US National Weather Service's severe criterion (58 mph), a
 * cyclone at hurricane force (Beaufort 12, the Met Office's 33 m/s). Other
 * storms (dust, ash, global haze) aren't counted over the sea.
 */
export const STORM_WIND: Readonly<Record<string, number>> = {
  cell: 58 * 0.44704,
  cyclone: 33,
};

/** The wind a storm of `kind` raises at strength `strength` (0–1), m/s; 0 for kinds that don't. */
export function stormWind(kind: string, strength: number): number {
  return (STORM_WIND[kind] ?? 0) * Math.max(0, Math.min(1, strength));
}

