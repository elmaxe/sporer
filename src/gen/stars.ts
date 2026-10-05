import { generateBlackHole, nominalBlackHole, type AccretionDisc } from './blackHoles';
import { hexToRgb, hslToHex, jitterHsl, rgbToHsl, type Hsl } from './color';
import type { Rng } from './rng';
import type { StarActivity } from './starActivity';

export type SpectralClass = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';
/** `blackHole`: a stellar black hole with its accretion disc (gen/blackHoles.ts), chosen apart from the rest. */
export type StarKind = 'mainSequence' | 'redDwarf' | 'whiteDwarf' | 'redGiant' | 'blueGiant' | 'blackHole';

export interface StarData {
  kind: StarKind;
  spectralClass: SpectralClass;
  color: string;
  /** In system-scene units (a G-class star is ~30). */
  radius: number;
  /**
   * Relative to a G-class star = 1. Drives light intensity and the habitable zone.
   * A black hole's is its disc's; its `radius` is its shadow's, `color` and
   * `spectralClass` its disc's (gen/blackHoles.ts blackHoleStar).
   */
  luminosity: number;
  /** Relative to a G-class star = 1. Drives orbital periods. */
  mass: number;
  /**
   * How it lives (surface, spots, storms) instead of what its kind and class
   * give (gen/starActivity.ts): the star lab's edits. Absent for every
   * generated star.
   */
  activity?: StarActivity;
  /** A black hole's accretion disc (gen/blackHoles.ts). Absent for every other kind. */
  disc?: AccretionDisc;
}

interface StarSpec {
  spectralClass: SpectralClass;
  radius: readonly [number, number];
  luminosity: number;
  mass: number;
  /** Stylised, more saturated than real blackbody colours. */
  color: Hsl;
}

/** Main-sequence classes. Weights favour interesting stars over realism (real life is ~76% M). */
const MAIN_SEQUENCE: readonly (readonly [StarSpec, number])[] = [
  [{ spectralClass: 'O', radius: [50, 60], luminosity: 30, mass: 12, color: [222, 1, 0.74] }, 2],
  [{ spectralClass: 'B', radius: [42, 50], luminosity: 12, mass: 6, color: [216, 1, 0.8] }, 5],
  [{ spectralClass: 'A', radius: [36, 42], luminosity: 4, mass: 2, color: [212, 0.8, 0.9] }, 10],
  [{ spectralClass: 'F', radius: [32, 36], luminosity: 1.8, mass: 1.3, color: [50, 1, 0.9] }, 18],
  [{ spectralClass: 'G', radius: [27, 32], luminosity: 1, mass: 1, color: [42, 1, 0.74] }, 30],
  [{ spectralClass: 'K', radius: [22, 27], luminosity: 0.5, mass: 0.75, color: [30, 1, 0.64] }, 35],
];

const OTHER_KINDS: Record<Exclude<StarKind, 'mainSequence' | 'blackHole'>, StarSpec> = {
  redDwarf: { spectralClass: 'M', radius: [13, 19], luminosity: 0.12, mass: 0.35, color: [14, 1, 0.6] },
  whiteDwarf: { spectralClass: 'A', radius: [6, 9], luminosity: 0.05, mass: 0.7, color: [210, 0.7, 0.95] },
  redGiant: { spectralClass: 'M', radius: [75, 110], luminosity: 8, mass: 1.5, color: [8, 1, 0.58] },
  blueGiant: { spectralClass: 'B', radius: [65, 85], luminosity: 20, mass: 10, color: [222, 1, 0.68] },
};

/** Every kind, and every main-sequence class, in the order tools list them. */
export const STAR_KINDS: readonly StarKind[] = ['mainSequence', 'redDwarf', 'whiteDwarf', 'redGiant', 'blueGiant', 'blackHole'];
export const MAIN_SEQUENCE_CLASSES: readonly SpectralClass[] = MAIN_SEQUENCE.map(([s]) => s.spectralClass);

/** The base colour (no jitter) of a kind or, on the main sequence, a class, as [hue°, saturation, lightness]. */
export function starBaseColor(kind: StarKind, spectralClass: SpectralClass): Hsl {
  if (kind === 'blackHole') return rgbToHsl(...hexToRgb(nominalBlackHole().color));
  if (kind !== 'mainSequence') return OTHER_KINDS[kind].color;
  return (MAIN_SEQUENCE.find(([s]) => s.spectralClass === spectralClass) ?? MAIN_SEQUENCE[4]!)[0].color;
}

/** Black holes are left out: a few systems become one afterwards (gen/blackHoles.ts chooseBlackHoles). */
const KIND_WEIGHTS: readonly (readonly [StarKind, number])[] = [
  ['mainSequence', 60],
  ['redDwarf', 22],
  ['whiteDwarf', 7],
  ['redGiant', 7],
  ['blueGiant', 4],
];

/**
 * A random star (of `kind`, if given). `spectralClass` picks a main-sequence
 * star's class instead of drawing it (tools: the star lab; it skips that draw).
 */
export function generateStar(rng: Rng, kind: StarKind = rng.weighted(KIND_WEIGHTS), spectralClass?: SpectralClass): StarData {
  if (kind === 'blackHole') return generateBlackHole(rng);
  const chosen = kind === 'mainSequence' && spectralClass ? MAIN_SEQUENCE.find(([s]) => s.spectralClass === spectralClass)?.[0] : undefined;
  const spec = chosen ?? (kind === 'mainSequence' ? rng.weighted(MAIN_SEQUENCE) : OTHER_KINDS[kind]);
  const size = rng.next();
  return {
    kind,
    spectralClass: spec.spectralClass,
    color: jitterHsl(rng, spec.color, 5, 0.05, 0.04),
    radius: spec.radius[0] + (spec.radius[1] - spec.radius[0]) * size,
    // Bigger stars within a class are a bit brighter and heavier.
    luminosity: spec.luminosity * (0.85 + 0.3 * size),
    mass: spec.mass * (0.9 + 0.2 * size),
  };
}

/**
 * A typical star of a kind (and, for the main sequence, a class): the middle
 * of its size range and its base colour, no jitter. For tools like the planet
 * lab that want "a G star" rather than a generated one.
 */
export function nominalStar(kind: StarKind, spectralClass: SpectralClass = 'G'): StarData {
  if (kind === 'blackHole') return nominalBlackHole();
  const spec =
    kind === 'mainSequence'
      ? (MAIN_SEQUENCE.find(([s]) => s.spectralClass === spectralClass)?.[0] ?? MAIN_SEQUENCE[4]![0])
      : OTHER_KINDS[kind];
  return {
    kind,
    spectralClass: spec.spectralClass,
    color: hslToHex(...spec.color),
    radius: (spec.radius[0] + spec.radius[1]) / 2,
    luminosity: spec.luminosity,
    mass: spec.mass,
  };
}

/** Companion in a binary: never a giant, so the pair stays readable on screen. */
export function generateCompanion(rng: Rng): StarData {
  return generateStar(
    rng,
    rng.weighted<StarKind>([
      ['mainSequence', 50],
      ['redDwarf', 35],
      ['whiteDwarf', 15],
    ]),
  );
}

/**
 * The colour of a star's light on what it lights (planets, moons, the UFO):
 * a black body at its class's temperature (Stellar classification's
 * representative values: O 50,000 K, B 20,000, A 8,750, F 6,650, G 5,600,
 * K 4,450, M 3,050), white-balanced to the Sun's 5,772 K as eyes adapted to
 * daylight would see it. Not `StarData.color`, which is deliberately more
 * saturated so the star itself reads well: lit by that, a K star turned a
 * blue planet orange and black. See docs/research/star-light.md.
 */
const LIGHT_COLORS: Record<SpectralClass, string> = {
  O: '#8fb1ff',
  B: '#9cbcff',
  A: '#c7dbff',
  F: '#e7f0ff',
  G: '#fffdf9',
  K: '#ffeacb',
  M: '#ffc57b',
};

export function starLightColor(star: StarData): string {
  return LIGHT_COLORS[star.spectralClass];
}

export function describeStar(star: StarData): string {
  switch (star.kind) {
    case 'mainSequence':
      return `${star.spectralClass}-class star`;
    case 'redDwarf':
      return 'Red dwarf';
    case 'whiteDwarf':
      return 'White dwarf';
    case 'redGiant':
      return 'Red giant';
    case 'blueGiant':
      return 'Blue giant';
    case 'blackHole':
      return 'Black hole';
  }
}

/** A system's star(s) for UI, e.g. "G-class star" or "Binary: B-class star + Red dwarf". */
export function describeStars(stars: readonly StarData[]): string {
  const names = stars.map(describeStar).join(' + ');
  return stars.length > 1 ? `Binary: ${names}` : names;
}
