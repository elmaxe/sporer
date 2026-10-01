import { hslToHex } from './color';
import { generateName } from './names';
import { perihelion, type KeplerOrbit } from './orbit';
import type { PlanetStyle } from './planets';
import { Rng, hashSeed } from './rng';
import { generateShape, shapeNormal, type ShapeData } from './shape';
import type { Vec3Tuple } from './starActivity';

export interface CometData {
  name: string;
  /** Nucleus radius in system units: its longest reach from the centre (see `shape`). */
  radius: number;
  orbit: KeplerOrbit;
  /** Ion tail (straight, anti-sunward) and dust tail (curved, lagging) colours. */
  ionColor: string;
  dustColor: string;
  /** Seeds the nucleus's surface detail and jets. */
  seed: number;
  /** Radians per second about its own axis, and the axis's tilt (radians, as a planet's). */
  spin: number;
  tilt: number;
  /** The nucleus's irregular shape (see gen/shape.ts). */
  shape: ShapeData;
  /** Dark, dusty colours (no sea). */
  style: PlanetStyle;
}

/** What comet generation needs to know about the rest of the system. */
export interface CometContext {
  systemName: string;
  /** Radius around the barycentre occupied by the star(s). */
  starZone: number;
  /** Largest star radius: perihelia stay outside its glow. */
  starRadius: number;
  /** Outer edge of the outermost planet's neighbourhood (0 with no planets). */
  outerEdge: number;
  /** Orbital period (seconds) for a semi-major axis, from the system's Kepler law. */
  period: (semiMajor: number) => number;
}

/** Nucleus radius range, system units (its longest reach). */
export const NUCLEUS_RADIUS = [0.8, 1.8] as const;

/** Perihelia start at least this many star radii from the barycentre (outside the glow). */
export const COMET_MIN_PERIHELION_RADII = 3.5;

/**
 * Up to three comets (often none) on long, inclined elliptical orbits: perihelion just outside
 * the star's glow, aphelion beyond the outermost planet. Uses its own Rng
 * stream (`rng.fork('comets')`), so adding comets changed nothing else.
 */
export function generateComets(rng: Rng, ctx: CometContext): CometData[] {
  const count = rng.weighted<number>([
    [0, 4],
    [1, 4],
    [2, 2],
    [3, 1],
  ]);
  const minPerihelion = Math.max(ctx.starZone + ctx.starRadius * 2, ctx.starRadius * COMET_MIN_PERIHELION_RADII);
  const outer = Math.max(ctx.outerEdge, minPerihelion * 4);

  const comets: CometData[] = [];
  for (let i = 0; i < count; i++) {
    const q = minPerihelion * rng.range(1, 1.8);
    const Q = outer * rng.range(1.1, 1.6);
    const semiMajor = (q + Q) / 2;
    comets.push({
      // Visitable since step 25: the nucleus from its own stream, so the draws above didn't change.
      ...cometNucleus(rng.fork('nucleus', i)),
      // Named like a discoverer's comet; a separate stream so the orbit draws don't depend on it.
      name: `Comet ${generateName(rng.fork('name', i))}`,
      radius: rng.range(...NUCLEUS_RADIUS),
      orbit: {
        semiMajor,
        eccentricity: (Q - q) / (Q + q),
        period: ctx.period(semiMajor),
        // The first comet is always on its way in, so most systems show one
        // with a growing tail; the rest are anywhere on their orbits.
        phase: i === 0 ? -rng.range(0.15, 0.6) : rng.range(0, Math.PI * 2),
        // Mostly near the ecliptic, sometimes steep; some retrograde.
        inclination: rng.chance(0.15) ? rng.range(Math.PI * 0.6, Math.PI) : Math.abs(rng.gaussian(0, 0.45)),
        argPerihelion: rng.range(0, Math.PI * 2),
        node: rng.range(0, Math.PI * 2),
      },
      ionColor: rng.pick(['#7cc4ff', '#8fb0ff', '#79e0ff']),
      dustColor: rng.pick(['#ffe6b8', '#fff1d6', '#ffd9a8']),
    });
  }
  return comets;
}

/** Nucleus colours: grey-brown and very dark, comet nuclei reflecting ~2–6% of the light (see docs/research/comets.md). */
export const NUCLEUS_LIGHTNESS = { low: [0.12, 0.16], high: [0.2, 0.27] } as const;

/** A comet's nucleus (seed, spin, shape, colours), all from `rng` (its own stream). */
export function cometNucleus(rng: Rng): Pick<CometData, 'seed' | 'spin' | 'tilt' | 'shape' | 'style'> {
  const hue = rng.range(20, 45);
  return {
    seed: rng.int(0, 1_000_000),
    // Turns in 15–60 s, like the moons (the game's compressed days; real nuclei turn in ~6–50 h).
    spin: rng.range(0.1, 0.4) * rng.sign(),
    tilt: rng.range(-Math.PI / 2, Math.PI / 2),
    shape: generateShape(rng.fork('shape')),
    style: {
      sea: null,
      seaLevel: 0,
      low: hslToHex(hue, rng.range(0.05, 0.12), rng.range(...NUCLEUS_LIGHTNESS.low)),
      high: hslToHex(hue + rng.range(-8, 8), rng.range(0.04, 0.1), rng.range(...NUCLEUS_LIGHTNESS.high)),
      // Fine detail over the shape's lumps, as a share of the radius.
      relief: rng.range(0.025, 0.045),
    },
  };
}

/** The HUD line for a comet, e.g. "Comet · returns every 12 min · closest pass 180 u". */
export function describeComet(comet: Pick<CometData, 'orbit'>): string {
  const minutes = Math.max(1, Math.round(comet.orbit.period / 60));
  return `Comet · returns every ${minutes} min · closest pass ${Math.round(perihelion(comet.orbit))} u`;
}

// --- Activity ---

/**
 * Where a comet wakes up, in habitable radii (≈ AU) from its star: water ice
 * sublimates strongly inside ~3 AU, so jets and the coma fade in from
 * ACTIVITY_LIMIT to ACTIVITY_FULL and follow the tails' 1/r² inside that
 * (see docs/research/comets.md).
 */
export const ACTIVITY_LIMIT = 3;
export const ACTIVITY_FULL = 2.5;

/**
 * How active a comet is `distance` (system units) from its star, 0–1: the
 * tails' 1/r² (1 at `reference` habitable radii and closer), switched off
 * beyond ACTIVITY_LIMIT habitable radii.
 */
export function cometActivity(distance: number, habitableRadius: number, reference: number): number {
  const zone = distance / habitableRadius;
  const strength = Math.min(1, (reference / Math.max(zone, 1e-6)) ** 2);
  const t = Math.min(1, Math.max(0, (ACTIVITY_LIMIT - zone) / (ACTIVITY_LIMIT - ACTIVITY_FULL)));
  return strength * t * t * (3 - 2 * t);
}

/** A jet's source on the nucleus. */
export interface CometVent {
  /** Unit direction from the centre (body frame). */
  dir: Vec3Tuple;
  /** Outward surface normal there (the jet's axis). */
  normal: Vec3Tuple;
  /** Relative output, 0.4–1. */
  strength: number;
  /** Half-angle of the jet's cone, radians. */
  spread: number;
}

/** Vents per nucleus (most of a nucleus is inactive; jets come from a few spots, see docs/research/comets.md). */
export const VENT_COUNT = [4, 9] as const;

/** A nucleus's vents, from its seed and shape (pure: the same every visit). */
export function cometVents(seed: number, shape: ShapeData): CometVent[] {
  const rng = new Rng(hashSeed(seed, 'vents'));
  const count = rng.int(VENT_COUNT[0], VENT_COUNT[1]);
  const vents: CometVent[] = [];
  for (let i = 0; i < count; i++) {
    const z = rng.range(-1, 1);
    const a = rng.range(0, Math.PI * 2);
    const s = Math.sqrt(1 - z * z);
    const dir: Vec3Tuple = [s * Math.cos(a), s * Math.sin(a), z];
    vents.push({ dir, normal: shapeNormal(shape, dir, [0, 0, 0]), strength: rng.range(0.4, 1), spread: rng.range(0.08, 0.2) });
  }
  return vents;
}

/** The low-orbit HUD's line for a comet, e.g. "Contact binary nucleus · jets active" (activity 0–1). */
export function describeNucleus(shape: Pick<ShapeData, 'binary' | 'lobes'>, activity: number): string {
  const body = shape.binary ? 'Contact binary nucleus' : 'Irregular nucleus';
  const state = activity > 0.5 ? 'jets active' : activity > 0.02 ? 'jets waking' : 'dormant, frozen';
  return `${body} · ${state}`;
}
