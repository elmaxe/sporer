import { atmosphereTint, type ClimateData } from '../gen/climate';
import { LATITUDE_SWING } from '../gen/plants';
import type { MoonType, PlanetStyle, PlanetType } from '../gen/planets';
import { Rng, hashSeed } from '../gen/rng';
import { POLAR_SNOW_OFFSET, SNOW_TEMPERATURE } from '../gen/terranGround';
import { weatherKind } from '../gen/weather';

/*
 * How a terraformed world looks, from its climate now (docs/design/
 * terraforming.md, "The world changes"). Pure: the views (world/Planet.ts,
 * planet/PlanetGlobe.ts) turn it into their atmosphere, clouds, seas and ice.
 * Only bodies something was done to follow it, so every untouched body
 * looks exactly as generated.
 *
 * - The atmosphere's colour follows its composition (atmosphereTint, seeded
 *   by the body; the generated colour while the composition is the one it
 *   was generated with) and its thickness the climate (gen/atmosphere.ts).
 * - The weather is the climate's (gen/weather.ts), rebuilt when its kind or
 *   its temperature and pressure move on by a step (`weatherKey`).
 * - The sea covers a share of the surface that rises and falls with the
 *   water inventory (`seaCoverage`), none once it's boiled or gone; it
 *   freezes from the poles where the latitude's mean is below sea water's
 *   freezing point (`freezeLine`), and on an ice world thaws from the
 *   equator the same way.
 * - Ice caps lie on the land where it's cold enough for snow all year (the
 *   green worlds' snow line, gen/terranGround.ts), as far as there's water
 *   for them (`capLine`).
 */

/**
 * Sea water freezes at −1.9 °C (salinity 35 g/kg at the surface: TEOS-10,
 * IOC et al. 2010, gsw_t_freezing), K.
 */
export const SEA_FREEZING = 271.25;

/** Ice caps can cover at most this share of the surface per unit of water (tunable: water 0.1 ices the poles from ~65°). */
export const CAP_PER_WATER = 1.0;

/** The most of the surface a sea can cover (a world all ocean keeps its highest peaks as islands). */
export const MAX_SEA_COVERAGE = 0.97;

/**
 * The sine of the latitude poleward of which the annual mean
 * (localTemperature: mean + SWING (cos 2φ − 1/3)) is below `threshold` K
 * minus `polar` K × sin²φ: 0 when it's colder everywhere, above 1 when
 * nowhere is (with cos 2φ = 1 − 2 sin²φ it's a square root).
 */
export function freezeLine(mean: number, threshold: number, polar = 0): number {
  const denom = 2 * LATITUDE_SWING - polar;
  const s2 = (mean + (2 / 3) * LATITUDE_SWING - threshold) / denom;
  if (s2 <= 0) return 0;
  if (s2 >= 1) return 1.01;
  return Math.sqrt(s2);
}

/**
 * The sine of the latitude of the land's ice caps' edge (above 1: none):
 * where snow lies all year (the snow line of gen/terranGround.ts at sea
 * level), but no further than the water makes ice for (CAP_PER_WATER of
 * the surface per unit of water; the share poleward of φ is 1 − sin φ).
 */
export function capLine(climate: Pick<ClimateData, 'temperature' | 'water'>): number {
  if (!(climate.water > 0)) return 1.01;
  const cold = freezeLine(climate.temperature, SNOW_TEMPERATURE, POLAR_SNOW_OFFSET);
  const water = 1 - Math.min(1, CAP_PER_WATER * climate.water);
  return Math.max(cold, water);
}

/**
 * The share of the surface under the sea: the generated share (`base`, at
 * the water the body was generated with) moved by as much as the water
 * inventory has, none once the water has boiled off or is gone.
 */
export function seaCoverage(base: number, baseWater: number, climate: Pick<ClimateData, 'water' | 'waterState'>): number {
  if (climate.waterState === 'none' || climate.waterState === 'steam') return 0;
  return Math.min(MAX_SEA_COVERAGE, Math.max(0, base + (climate.water - baseWater)));
}

/** The value below which a share `c` (0–1) of the sorted values `sorted` lie. */
export function quantile(sorted: ArrayLike<number>, c: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const i = Math.min(n - 1, Math.max(0, c * n - 0.5));
  const lo = Math.floor(i);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

/** The share of the sorted values `sorted` below `value`. */
export function shareBelow(sorted: ArrayLike<number>, value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  return sorted.length ? lo / sorted.length : 0;
}

/** `n` unit directions spread evenly over the sphere (a Fibonacci lattice), as x, y, z triples. */
export function fibonacciDirections(n: number): Float64Array {
  const out = new Float64Array(n * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const a = golden * i;
    out[i * 3] = Math.cos(a) * r;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(a) * r;
  }
  return out;
}

/** What a body's look needs of it. */
export interface LookBody {
  type: PlanetType | MoonType;
  seed: number;
  style: PlanetStyle;
  /** The generated atmosphere's colour. */
  atmosphere?: string | null;
  /** The generated climate. */
  climate?: ClimateData | null;
}

/** The atmosphere's colour with climate `climate`: the generated one while it's the generated composition, else its own tint (null: too thin to see). */
export function liveAtmosphereColor(body: LookBody, climate: ClimateData): string | null {
  const base = body.climate;
  if (body.atmosphere && base && base.composition === climate.composition) return climate.pressure >= 0.005 ? body.atmosphere : null;
  return atmosphereTint(new Rng(hashSeed(body.seed, 'terraform-tint', climate.composition)), climate);
}

/** Changes when the atmosphere's look does by a step worth redrawing: composition, 5% of pressure, 10 K. */
export function airKey(body: LookBody, climate: ClimateData): string {
  const color = liveAtmosphereColor(body, climate);
  if (!color) return 'none';
  return `${color}:${Math.round(Math.log10(climate.pressure) * 40)}:${Math.round(climate.temperature / 10)}`;
}

/** Changes when the weather does by a step worth rebuilding: its kind, 10 K, a factor of ~1.8 of pressure, the water's state. */
export function weatherKey(body: LookBody, climate: ClimateData): string {
  const kind = weatherKind(body.type, climate);
  if (!kind) return 'none';
  return `${kind}:${Math.round(climate.temperature / 10)}:${Math.round(Math.log10(Math.max(climate.pressure, 1e-6)) * 4)}:${climate.waterState}`;
}

/** The sea's colour on a world that had none: Earth's open ocean (as the generator paints water seas). */
export const NEW_SEA_COLOR = '#1f4f86';
/** Sea ice (snow-covered floes) and a thawed ice world's open water. */
export const SEA_ICE_COLOR = '#dfeaf2';
export const THAWED_WATER_COLOR = '#1d4a78';
