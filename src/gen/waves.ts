import { Rng } from './rng';

/**
 * Wind waves on a planet's sea (issue #88), as pure data: cascades of
 * travelling waves drawn from the Pierson–Moskowitz spectrum of a fully
 * developed sea, each band on a square tile that repeats, and how much slope
 * is left over in wavelets too small to draw (the sea's roughness). The view
 * bakes the tiles on the GPU (world/waveTiles.ts) and lays them over the
 * low-orbit sea's normals (world/seaWaves.ts). See docs/research/sea-waves.md.
 */

/** Standard gravity, m/s² (CODATA). */
export const STANDARD_GRAVITY = 9.80665;

/** Pierson–Moskowitz (1964): α and β of S(ω) = α g² / ω⁵ · exp(−β (ω₀ / ω)⁴), ω₀ = g / U₁₉.₅ (WikiWaves, Ocean-Wave Spectra). */
const PM_ALPHA = 8.1e-3;
const PM_BETA = 0.74;
/** U₁₉.₅ / U₁₀, from the same page's H⅓ = 0.21 U₁₉.₅² / g ≈ 0.22 U₁₀² / g: √(0.22 / 0.21). */
const U195_PER_U10 = Math.sqrt(0.22 / 0.21);

/**
 * The view draws the waves as tiles that repeat (world/seaWaves.ts): this many
 * cascades, each a square of its own size holding one band of the spectrum,
 * the sizes in irrational ratios so their repeats never line up (as FFT
 * oceans do: Pensionerov's FFT-Ocean, Ryan's ocean rendering notes).
 */
export const CASCADES = 3;
/** Waves per cascade (an FFT ocean holds every point of the lattice; a few dozen drawn from the spectrum look alike). */
export const WAVES_PER_CASCADE = 48;
/** The longest wave drawn, as a share of the spectrum's peak frequency (a little below the peak, where the energy starts). */
const LOWEST_SHARE = 0.75;
/** A cascade's tile is this many times its longest wave, so even that one has a few directions on the lattice to choose from. */
const TILE_WAVES = 2.5;
/** Cascade c's tile is also stretched by φ^(c/2), so no two tiles' sizes are in a simple ratio. */
const GOLDEN = (1 + Math.sqrt(5)) / 2;

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
  /** Its wavevector on its cascade's tile, in whole waves across it (along the wind, and across it): the tile repeats. */
  nx: number;
  nz: number;
}

/** One band of the spectrum on a square tile that repeats. */
export interface WaveCascade {
  /** The tile's side, metres. */
  size: number;
  /** Its waves, longest first. */
  waves: WaveComponent[];
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
  /** CASCADES cascades, longest first (empty when calm). */
  cascades: WaveCascade[];
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
 * e.g. no air), `gravity` (m/s²), down to waves `shortest` metres long. The
 * spectrum from just below its peak to `shortest` is split into CASCADES
 * bands of equal steps in ln ω, each on its own repeating tile. A band's
 * waves cover it in equal steps of ln ω, each carrying its step's slope
 * variance, at angles to the wind drawn from Hasselmann et al.'s (1980)
 * cos^2s(θ/2) spreading, then moved to the nearest wavevector the tile
 * repeats with.
 */
export function seaWaves(seed: number, wind: number, gravity: number, shortest: number): SeaWaves {
  const meanSquareSlope = coxMunkSlope(wind);
  if (wind <= 0) return { wind: 0, gravity, peakOmega: 0, meanSquareSlope, cascades: [] };
  const peak = peakOmega(wind, gravity);
  const low = LOWEST_SHARE * peak;
  const high = Math.max(waveOmega(shortest, gravity), low * 1.01);
  const band = Math.log(high / low) / CASCADES;
  const rng = new Rng(seed).fork('waves');
  const cascades: WaveCascade[] = [];
  for (let c = 0; c < CASCADES; c++) {
    const r = rng.fork(c);
    const bottom = low * Math.exp(c * band);
    const size = TILE_WAVES * wavelength(bottom, gravity) * GOLDEN ** (c / 2);
    const step = band / WAVES_PER_CASCADE;
    const waves: WaveComponent[] = [];
    for (let i = 0; i < WAVES_PER_CASCADE; i++) {
      const from = bottom * Math.exp(i * step);
      const to = from * Math.exp(step);
      // Jittered within its step, so neighbouring cascades' waves don't share lengths.
      const target = from * Math.exp(r.range(0.25, 0.75) * step);
      const angle = spreadAngle(r, target / peak);
      // The nearest wavevector the tile repeats with (never none).
      const n = (size * target * target) / gravity / (Math.PI * 2);
      let nx = Math.round(n * Math.cos(angle));
      const nz = Math.round(n * Math.sin(angle));
      if (nx === 0 && nz === 0) nx = 1;
      const k = (Math.PI * 2 * Math.hypot(nx, nz)) / size;
      waves.push({
        length: (Math.PI * 2) / k,
        omega: Math.sqrt(gravity * k),
        angle: Math.atan2(nz, nx),
        slope: Math.sqrt(2 * slopeVariance(wind, from, to, gravity)),
        phase: r.range(0, Math.PI * 2),
        nx,
        nz,
      });
    }
    waves.sort((x, y) => y.length - x.length);
    cascades.push({ size, waves });
  }
  return { wind, gravity, peakOmega: peak, meanSquareSlope, cascades };
}

/** The slope variance of some drawn waves (a sine of slope amplitude s has variance s² / 2). */
export function drawnVariance(waves: readonly WaveComponent[]): number {
  let v = 0;
  for (const w of waves) v += (w.slope * w.slope) / 2;
  return v;
}

/** The slope variance of all a sea's drawn waves. */
export function seaVariance(waves: SeaWaves): number {
  return waves.cascades.reduce((sum, c) => sum + drawnVariance(c.waves), 0);
}

/**
 * Hasselmann et al. (1980), JONSWAP's directional spreading: D(θ) ∝
 * cos^2s(θ/2), narrowest at the peak, s = 6.97 (ω/ω_p)^4.06 below it and
 * 9.77 (ω/ω_p)^−2.52 above (as WAFO gives them).
 */
export function spreadPower(ratio: number): number {
  return ratio < 1 ? 6.97 * ratio ** 4.06 : 9.77 * ratio ** -2.52;
}

/** An angle to the wind in (−π, π] with density ∝ cos^2s(θ/2) at frequency `ratio` × the peak's (rejection sampling). */
function spreadAngle(rng: Rng, ratio: number): number {
  const s = spreadPower(ratio);
  for (;;) {
    const a = rng.range(-Math.PI, Math.PI);
    if (rng.next() < Math.abs(Math.cos(a / 2)) ** (2 * s)) return a;
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


// --- Shore waves (shoaling) ---

/**
 * McCowan's (1894) breaker index: a wave breaks in water about this much
 * deeper than it is high (H_b / h_b ≈ 0.78), so in the surf zone its height
 * is capped at it. See docs/research/sea-waves.md.
 */
export const BREAKER_INDEX = 0.78;

/**
 * Wavenumber (1/m) of a wave of angular frequency `omega` in water `depth`
 * metres deep, from the dispersion relation ω² = g k tanh(k h) by Fenton &
 * McKee's (1990) explicit approximation, k h = k₀h · coth((k₀h)^¾)^⅔ (k₀ the
 * deep-water ω²/g). The shader mirrors it.
 */
export function shoalWavenumber(omega: number, depth: number, gravity = STANDARD_GRAVITY): number {
  const k0 = (omega * omega) / gravity;
  const x = k0 * Math.max(depth, 1e-9);
  return k0 * Math.pow(1 / Math.tanh(Math.pow(x, 0.75)), 2 / 3);
}

/**
 * How much higher a wave is in water `depth` m deep than in deep water, by
 * energy flux: K_s = √(c_g0 / c_g), c_g = (ω/k)·½(1 + 2kh / sinh 2kh), which
 * with ω² = g k₀ is √(k / (k₀ (1 + 2kh / sinh 2kh))). Green's law (h^−¼) in
 * the shallows. The shader mirrors it.
 */
export function shoalingCoefficient(omega: number, depth: number, gravity = STANDARD_GRAVITY): number {
  const k0 = (omega * omega) / gravity;
  const k = shoalWavenumber(omega, depth, gravity);
  const kh2 = 2 * k * Math.max(depth, 1e-9);
  const g = kh2 > 30 ? 0 : kh2 / Math.sinh(kh2);
  return Math.sqrt(k / (k0 * (1 + g)));
}

/**
 * The phase (radians) a wave of `omega` gains running out from the
 * waterline to `depth` metres over a seabed sloping `slope` (m of depth per
 * m out): θ(d) = ∫₀^d k(h) dh / slope. Its crests lie along the depth
 * contours (a wave refracts until it does) and bunch up as the water shoals.
 * Integrated in s = √h, where the shallow-water k ∝ h^−½ is smooth.
 */
export function shorePhase(omega: number, depth: number, slope: number, gravity = STANDARD_GRAVITY): number {
  if (depth <= 0) return 0;
  const steps = 64;
  const top = Math.sqrt(depth);
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const s = ((i + 0.5) / steps) * top;
    sum += shoalWavenumber(omega, s * s, gravity) * 2 * s;
  }
  return (sum * top) / steps / slope;
}

/** The two swells that run up a shore: at the spectrum's peak and a shorter one, each with half the energy of a sea of significant height H⅓. */
export const SHORE_SWELLS = [1, 1.3] as const;

export interface ShoreSwell {
  /** Angular frequency, rad/s. */
  omega: number;
  /** Height in deep water, m. */
  height: number;
}

/** The swells running up a sea's shores at its wind (none when calm). */
export function shoreSwells(waves: SeaWaves): ShoreSwell[] {
  if (waves.peakOmega <= 0) return [];
  const height = significantHeight(waves.wind, waves.gravity) / Math.SQRT2;
  return SHORE_SWELLS.map((f) => ({ omega: waves.peakOmega * f, height }));
}
