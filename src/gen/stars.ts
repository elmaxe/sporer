import { jitterHsl, type Hsl } from './color';
import type { Rng } from './rng';

export type SpectralClass = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';
export type StarKind = 'mainSequence' | 'redDwarf' | 'whiteDwarf' | 'redGiant' | 'blueGiant';

export interface StarData {
  kind: StarKind;
  spectralClass: SpectralClass;
  color: string;
  /** In system-scene units (a G-class star is ~30). */
  radius: number;
  /** Relative to a G-class star = 1. Drives light intensity and the habitable zone. */
  luminosity: number;
  /** Relative to a G-class star = 1. Drives orbital periods. */
  mass: number;
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

const OTHER_KINDS: Record<Exclude<StarKind, 'mainSequence'>, StarSpec> = {
  redDwarf: { spectralClass: 'M', radius: [13, 19], luminosity: 0.12, mass: 0.35, color: [14, 1, 0.6] },
  whiteDwarf: { spectralClass: 'A', radius: [6, 9], luminosity: 0.05, mass: 0.7, color: [210, 0.7, 0.95] },
  redGiant: { spectralClass: 'M', radius: [75, 110], luminosity: 8, mass: 1.5, color: [8, 1, 0.58] },
  blueGiant: { spectralClass: 'B', radius: [65, 85], luminosity: 20, mass: 10, color: [222, 1, 0.68] },
};

const KIND_WEIGHTS: readonly (readonly [StarKind, number])[] = [
  ['mainSequence', 60],
  ['redDwarf', 22],
  ['whiteDwarf', 7],
  ['redGiant', 7],
  ['blueGiant', 4],
];

export function generateStar(rng: Rng, kind: StarKind = rng.weighted(KIND_WEIGHTS)): StarData {
  const spec = kind === 'mainSequence' ? rng.weighted(MAIN_SEQUENCE) : OTHER_KINDS[kind];
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
  }
}

/** A system's star(s) for UI, e.g. "G-class star" or "Binary: B-class star + Red dwarf". */
export function describeStars(stars: readonly StarData[]): string {
  const names = stars.map(describeStar).join(' + ');
  return stars.length > 1 ? `Binary: ${names}` : names;
}
