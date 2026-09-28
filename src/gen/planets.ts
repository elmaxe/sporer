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
 * Chooses a planet type from its distance to the star, measured in habitable
 * zone radii: <0.5 hot, 0.5–1.6 temperate, 1.6–3.5 cold, beyond that frozen.
 */
export function choosePlanetType(rng: Rng, zone: number): PlanetType {
  if (zone < 0.5) {
    return rng.weighted<PlanetType>([
      ['lava', 55],
      ['desert', 25],
      ['barren', 20],
    ]);
  }
  if (zone < 1.6) {
    return rng.weighted<PlanetType>([
      ['terran', 40],
      ['ocean', 15],
      ['desert', 20],
      ['barren', 15],
      ['gas', 10],
    ]);
  }
  if (zone < 3.5) {
    return rng.weighted<PlanetType>([
      ['gas', 45],
      ['ice', 35],
      ['barren', 20],
    ]);
  }
  return rng.weighted<PlanetType>([
    ['gas', 55],
    ['ice', 45],
  ]);
}

const RADIUS: Record<PlanetType, readonly [number, number]> = {
  lava: [4, 8],
  barren: [3, 8],
  desert: [5, 10],
  terran: [7, 11],
  ocean: [7, 12],
  ice: [4, 9],
  gas: [14, 24],
};

export function planetRadius(rng: Rng, type: PlanetType): number {
  const [min, max] = RADIUS[type];
  return rng.range(min, max);
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

/** 4–6 related band colours, darkest first. Mostly Jupiter-like browns, sometimes blue or exotic. */
export function gasBands(rng: Rng): string[] {
  const hue = rng.weighted<number>([
    [rng.range(20, 45), 60],
    [rng.range(190, 230), 25],
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
