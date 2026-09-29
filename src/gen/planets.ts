import { hslToHex, jitterHsl, type Hsl } from './color';
import type { Rng } from './rng';

export type PlanetType = 'lava' | 'barren' | 'desert' | 'terran' | 'ocean' | 'ice' | 'gas';
export type MoonType = 'barren' | 'ice' | 'lava';

/** Surface colouring for the terrain generator (see world/Planet.ts). */
export interface PlanetStyle {
  /** Liquid colour (water, lava, ice sheets) or null for none. */
  sea: string | null;
  /** Noise threshold in [-1, 1] below which the surface is liquid. */
  seaLevel: number;
  low: string;
  high: string;
  /** Terrain height as a fraction of the radius. */
  relief: number;
}

/**
 * Size classes, smallest first. A planet draws its class from its zone, then
 * its type given the class, so big worlds keep their air and small ones don't.
 */
export type SizeClass = 'dwarf' | 'small' | 'earth' | 'superEarth' | 'iceGiant' | 'gasGiant';
export const SIZE_CLASSES: readonly SizeClass[] = ['dwarf', 'small', 'earth', 'superEarth', 'iceGiant', 'gasGiant'];

/** Game units per Earth radius at Earth size (see gameRadius). */
export const EARTH_GAME_RADIUS = 8;

/**
 * Real radius (Earth radii) → game radius. Square-root compression: Earth is
 * 8, Mercury 4.9, Neptune 15.7, Jupiter 26.8, so a Jupiter is ~3× an Earth
 * instead of 11× and a Ceres still reads as a world. Deliberately stylised;
 * the order and the real class boundaries are kept.
 * See docs/research/body-sizes.md.
 */
export function gameRadius(earthRadii: number): number {
  return EARTH_GAME_RADIUS * Math.sqrt(earthRadii);
}

/**
 * Class boundaries in Earth radii (docs/research/body-sizes.md): dwarfs
 * Ceres..Pluto, small Moon..Mars, Earth-sized up to the 1.5 R⊕ rocky limit
 * (Fulton et al. 2017), super-Earths (with the sub-Neptunes) to 3 R⊕, ice
 * giants to Borucki et al.'s 6 R⊕ Neptune/Jupiter divide, gas giants to
 * 1.6 R_J (inflated hot Jupiters).
 */
export const SIZE_CLASS_EARTH_RADII: Record<SizeClass, readonly [number, number]> = {
  dwarf: [0.0625, 0.19],
  small: [0.19, 0.5625],
  earth: [0.5625, 1.5],
  superEarth: [1.5, 3],
  iceGiant: [3, 6],
  gasGiant: [6, 17.9],
};

/** The same boundaries in game units: dwarf 2–3.5, small 3.5–6, Earth 6–9.8, super 9.8–13.9, ice giant 13.9–19.6, gas giant 19.6–33.8. */
export const SIZE_CLASS_RADIUS = Object.fromEntries(
  SIZE_CLASSES.map((c) => [c, SIZE_CLASS_EARTH_RADII[c].map(gameRadius) as [number, number]]),
) as unknown as Record<SizeClass, readonly [number, number]>;

export function isGiant(size: SizeClass): size is 'iceGiant' | 'gasGiant' {
  return size === 'iceGiant' || size === 'gasGiant';
}

/**
 * Size class weights by zone (see chooseSizeClass). Giants keep the share gas
 * giants had before (none hot, 10% temperate, 45% cold, 55% frozen), ice
 * giants mostly far out. Gameplay weights, not occurrence rates.
 */
const SIZE_WEIGHTS: readonly (readonly [maxZone: number, weights: Record<SizeClass, number>])[] = [
  [0.5, { dwarf: 15, small: 35, earth: 35, superEarth: 15, iceGiant: 0, gasGiant: 0 }],
  [1.6, { dwarf: 6, small: 18, earth: 42, superEarth: 24, iceGiant: 3, gasGiant: 7 }],
  [3.5, { dwarf: 12, small: 20, earth: 13, superEarth: 10, iceGiant: 18, gasGiant: 27 }],
  [Infinity, { dwarf: 20, small: 15, earth: 6, superEarth: 4, iceGiant: 27, gasGiant: 28 }],
];

/**
 * Chooses a size class from the distance to the star, measured in habitable
 * zone radii: <0.5 hot, 0.5–1.6 temperate, 1.6–3.5 cold, beyond that frozen.
 */
export function chooseSizeClass(rng: Rng, zone: number): SizeClass {
  const weights = SIZE_WEIGHTS.find(([max]) => zone < max)![1];
  return rng.weighted(SIZE_CLASSES.map((c) => [c, weights[c]] as const));
}

type SolidType = Exclude<PlanetType, 'gas'>;

/** Solid types by zone, before the size factor. */
const TYPE_WEIGHTS: readonly (readonly [maxZone: number, weights: Partial<Record<SolidType, number>>])[] = [
  [0.5, { lava: 55, desert: 25, barren: 20 }],
  [1.6, { terran: 40, ocean: 15, desert: 20, barren: 15 }],
  [3.5, { ice: 35, barren: 20 }],
  [Infinity, { ice: 45 }],
];

/**
 * How much more (or less) likely each solid type is in a size class: small
 * bodies can't hold on to air or oceans, so they are mostly barren, icy or
 * volcanic; super-Earths are mostly ocean or terran.
 */
const SIZE_AFFINITY: Record<Exclude<SizeClass, 'iceGiant' | 'gasGiant'>, Record<SolidType, number>> = {
  dwarf: { lava: 1, barren: 3, desert: 0.2, terran: 0, ocean: 0, ice: 1.5 },
  small: { lava: 1.2, barren: 2, desert: 0.8, terran: 0.3, ocean: 0.1, ice: 1.3 },
  earth: { lava: 0.8, barren: 0.6, desert: 1, terran: 1.3, ocean: 1, ice: 1 },
  superEarth: { lava: 0.6, barren: 0.2, desert: 0.6, terran: 1.5, ocean: 3, ice: 1 },
};

/**
 * Chooses a planet type given its zone (as in chooseSizeClass) and size
 * class: giants are gas, solid worlds weigh the zone's types by the size
 * factor. Always exactly one draw from `rng`.
 */
export function choosePlanetType(rng: Rng, zone: number, size: SizeClass): PlanetType {
  if (isGiant(size)) return rng.weighted<PlanetType>([['gas', 1]]);
  const weights = TYPE_WEIGHTS.find(([max]) => zone < max)![1];
  const affinity = SIZE_AFFINITY[size];
  const entries = (Object.entries(weights) as [SolidType, number][]).map(([t, w]) => [t, w * affinity[t]] as const);
  return rng.weighted<PlanetType>(entries);
}

/** Log-uniform in [min, max), so the small end isn't crowded out. One draw. */
export function logRange(rng: Rng, min: number, max: number): number {
  return min * Math.pow(max / min, rng.next());
}

/** A radius inside the class, log-uniform. One draw. */
export function planetRadius(rng: Rng, size: SizeClass): number {
  const [min, max] = SIZE_CLASS_RADIUS[size];
  return logRange(rng, min, max);
}

/** Moons: pebbles (~64 km) to the odd one bigger than Mercury (see generateMoons). */
export const MOON_RADIUS = { min: gameRadius(0.01), regularMax: 3.5, bigMin: 4, max: 6 } as const;

/**
 * A moon is at most this fraction of its planet's radius: the Earth–Moon pair
 * in game units (0.27 real → 0.52), the largest among the planets.
 */
export const MOON_MAX_FRACTION = 0.5;

/**
 * Chance per moon of a big one (Moon, Io, Callisto, Titan, Ganymede size).
 * Only big hosts have room (MOON_MAX_FRACTION). Kept rare so they stand out:
 * about one gas giant in four has one (Jupiter and Saturn both do).
 */
export const BIG_MOON_CHANCE: Record<SizeClass, number> = {
  dwarf: 0,
  small: 0,
  earth: 0.06,
  superEarth: 0.1,
  iceGiant: 0.08,
  gasGiant: 0.12,
};

/** How many moons a planet of a size class has, by weight. */
export const MOON_COUNT_WEIGHTS: Record<SizeClass, readonly (readonly [number, number])[]> = {
  dwarf: [
    [0, 8],
    [1, 2],
  ],
  small: [
    [0, 6],
    [1, 3],
    [2, 1],
  ],
  earth: [
    [0, 5],
    [1, 4],
    [2, 1],
  ],
  superEarth: [
    [0, 3],
    [1, 4],
    [2, 3],
  ],
  iceGiant: [
    [0, 1],
    [1, 3],
    [2, 3],
    [3, 2],
  ],
  gasGiant: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 3],
    [4, 2],
  ],
};

/** A moon's radius around a planet of `planetRadius` and class `size`. */
export function moonRadius(rng: Rng, planetRadius: number, size: SizeClass): number {
  const cap = Math.min(MOON_RADIUS.max, planetRadius * MOON_MAX_FRACTION);
  if (rng.chance(BIG_MOON_CHANCE[size]) && cap > MOON_RADIUS.bigMin) return logRange(rng, MOON_RADIUS.bigMin, cap);
  return logRange(rng, MOON_RADIUS.min, Math.max(MOON_RADIUS.min, Math.min(MOON_RADIUS.regularMax, cap)));
}

/** Gas giants get their style from their bands (see gasBands). */
export function gasStyle(bands: readonly string[]): PlanetStyle {
  return { sea: null, seaLevel: -1, low: bands[0]!, high: bands[bands.length - 1]!, relief: 0.015 };
}

/** Colours and terrain parameters for a solid planet or moon of the given type. */
export function planetStyle(rng: Rng, type: Exclude<PlanetType, 'gas'> | MoonType): PlanetStyle {
  switch (type) {
    case 'lava': {
      const h = rng.range(5, 30);
      return {
        sea: hslToHex(h, 1, rng.range(0.45, 0.55)),
        seaLevel: rng.range(-0.3, 0.1),
        low: hslToHex(h, 0.25, 0.1),
        high: hslToHex(h, 0.15, rng.range(0.25, 0.35)),
        relief: rng.range(0.04, 0.06),
      };
    }
    case 'barren': {
      const h = rng.range(0, 360);
      const s = rng.range(0.05, 0.25);
      return {
        sea: null,
        seaLevel: -1,
        low: hslToHex(h, s, rng.range(0.2, 0.3)),
        high: hslToHex(h + rng.range(-20, 20), s, rng.range(0.55, 0.7)),
        relief: rng.range(0.04, 0.07),
      };
    }
    case 'desert': {
      const h = rng.range(15, 45);
      return {
        sea: rng.chance(0.3) ? hslToHex(rng.range(170, 200), 0.5, 0.35) : null,
        seaLevel: -0.6,
        low: hslToHex(h, rng.range(0.45, 0.6), rng.range(0.35, 0.45)),
        high: hslToHex(h + 10, rng.range(0.35, 0.5), rng.range(0.65, 0.75)),
        relief: rng.range(0.03, 0.05),
      };
    }
    case 'terran':
    case 'ocean': {
      // One in five worlds has alien (non-green) vegetation.
      const vegetation: Hsl = rng.chance(0.2) ? [rng.range(0, 360), 0.5, 0.38] : [rng.range(85, 140), 0.45, 0.35];
      return {
        sea: jitterHsl(rng, [rng.range(195, 225), 0.65, 0.36]),
        seaLevel: type === 'ocean' ? rng.range(0.25, 0.4) : rng.range(-0.15, 0.15),
        low: jitterHsl(rng, vegetation),
        high: jitterHsl(rng, [rng.range(30, 50), 0.2, 0.85]),
        relief: rng.range(0.03, 0.05),
      };
    }
    case 'ice': {
      const h = rng.range(185, 215);
      return {
        sea: hslToHex(h, 0.45, rng.range(0.6, 0.7)),
        seaLevel: rng.range(-0.4, 0.1),
        low: hslToHex(h, 0.25, rng.range(0.78, 0.86)),
        high: '#ffffff',
        relief: rng.range(0.025, 0.045),
      };
    }
  }
}

/**
 * 4–6 related band colours, darkest first. Mostly Jupiter-like browns,
 * sometimes blue or exotic; ice giants mostly blue, like Uranus and Neptune.
 * The same draws either way.
 */
export function gasBands(rng: Rng, iceGiant = false): string[] {
  const hue = rng.weighted<number>([
    [rng.range(20, 45), iceGiant ? 15 : 60],
    [rng.range(190, 230), iceGiant ? 70 : 25],
    [rng.range(0, 360), 15],
  ]);
  const count = rng.int(4, 6);
  const bands: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    bands.push(hslToHex(hue + rng.range(-12, 12), rng.range(0.35, 0.6), 0.3 + 0.5 * t));
  }
  return bands;
}

/** Atmosphere glow colour, or null for airless worlds. */
export function atmosphereColor(rng: Rng, type: PlanetType): string | null {
  switch (type) {
    case 'terran':
    case 'ocean':
      return hslToHex(rng.range(195, 215), 0.8, 0.7);
    case 'desert':
      return rng.chance(0.6) ? hslToHex(rng.range(25, 40), 0.7, 0.65) : null;
    case 'gas':
      return null; // gas giants are all atmosphere; bands carry the look
    case 'ice':
      return rng.chance(0.3) ? hslToHex(200, 0.5, 0.85) : null;
    case 'lava':
      return rng.chance(0.4) ? hslToHex(15, 0.9, 0.5) : null;
    case 'barren':
      return null;
  }
}
