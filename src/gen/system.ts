import { randomRotation, type Quat } from './galactic';
import { generateComets, type CometData } from './comets';
import type { GalaxyData, StarRef } from './galaxy';
import { hexToRgb, hslToHex, rgbToHex } from './color';
import { romanNumeral } from './names';
import type { Orbit } from './orbit';
import {
  atmosphereColor,
  choosePlanetType,
  gasBands,
  gasStyle,
  planetRadius,
  planetStyle,
  type MoonType,
  type PlanetStyle,
  type PlanetType,
} from './planets';
import { Rng } from './rng';
import type { StarData } from './stars';

/*
 * System-scene units: a G-class star has radius ~30, the UFO is ~4 across.
 * Distances are compressed (as in Spore) so a system spans a few thousand units.
 */

export interface SystemStar extends StarData {
  /** Orbit around the system's barycentre; radius 0 for a single star. */
  orbit: Orbit;
}

export interface MoonData {
  name: string;
  type: MoonType;
  radius: number;
  seed: number;
  /** Radians per second around its own axis. */
  spin: number;
  /** Relative to its planet. */
  orbit: Orbit;
  style: PlanetStyle;
}

export interface RingData {
  inner: number;
  outer: number;
  color: string;
  opacity: number;
}

export interface PlanetData {
  name: string;
  type: PlanetType;
  radius: number;
  seed: number;
  spin: number;
  orbit: Orbit;
  style: PlanetStyle;
  /** Gas giant band colours, darkest first; null for solid worlds. */
  bands: string[] | null;
  atmosphere: string | null;
  rings: RingData | null;
  moons: MoonData[];
  /** Radius of the planet's "neighbourhood": rings and moon orbits included. */
  extent: number;
  /** Axial tilt in radians (rings lie in the tilted equatorial plane). */
  tilt: number;
}

export interface SystemData {
  id: number;
  name: string;
  seed: number;
  stars: SystemStar[];
  planets: PlanetData[];
  /** Radius around the barycentre occupied by the star(s). */
  starZone: number;
  /** Distance with Earth-like temperatures. Drives planet types. */
  habitableRadius: number;
  /**
   * Rotation from system space into galaxy space: how the system's ecliptic
   * is tilted against the galactic plane (see gen/galactic.ts).
   */
  galacticTilt: Quat;
  /** On long elliptical orbits; scenery only (not visitable). */
  comets: CometData[];
}

/** G-class period at the reference distance; other orbits follow Kepler's third law. */
const REFERENCE_ORBIT = 90;
const REFERENCE_PERIOD = 50;

/** Generates a star's full system. Pure and deterministic: same ref, same system. */
export function generateSystem(ref: StarRef): SystemData {
  const rng = new Rng(ref.seed);
  const stars = placeStars(rng.fork('stars'), ref.stars);
  const totalMass = ref.stars.reduce((m, s) => m + s.mass, 0);
  const totalLuminosity = ref.stars.reduce((l, s) => l + s.luminosity, 0);
  const starZone = Math.max(...stars.map((s) => s.orbit.radius + s.radius));
  const habitableRadius = clamp(140 * Math.sqrt(totalLuminosity), 60, 600);

  const planetCount = rng.weighted<number>([
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 5],
    [4, 6],
    [5, 6],
    [6, 5],
    [7, 3],
    [8, 2],
  ]);

  const planets: PlanetData[] = [];
  // Inner edge of the free space where the next planet's neighbourhood can start.
  let edge = starZone * 1.5 + 25;
  for (let i = 0; i < planetCount; i++) {
    const prng = rng.fork('planet', i);
    const name = `${ref.name} ${romanNumeral(i + 1)}`;
    const gap = prng.range(20, 50) * (1 + i * 0.4);

    // The type depends on distance, but the final distance depends on the
    // planet's extent, so classify at the nearest possible orbit.
    const type = choosePlanetType(prng, (edge + gap) / habitableRadius);
    const radius = planetRadius(prng, type);
    const rings =
      type === 'gas'
        ? prng.chance(0.45)
          ? generateRings(prng, radius)
          : null
        : // Own stream, so the draws of gas giants and everything else stay as they were.
          generateSolidRings(prng.fork('rings'), type, radius);
    const moons = generateMoons(prng.fork('moons'), name, type, radius, rings);
    const extent = Math.max(
      radius,
      rings?.outer ?? 0,
      ...moons.map((m) => m.orbit.radius + m.radius),
    );
    const orbitRadius = edge + gap + extent;
    let bands: string[] | null = null;
    let style: PlanetStyle;
    if (type === 'gas') {
      bands = gasBands(prng);
      style = gasStyle(bands);
    } else {
      style = planetStyle(prng, type);
      if (rings) rings.color = solidRingColor(prng.fork('rings', 'color'), type, style);
    }

    planets.push({
      name,
      type,
      radius,
      seed: prng.int(0, 1_000_000),
      spin: prng.range(0.05, 0.35) * prng.sign(),
      orbit: {
        radius: orbitRadius,
        period: keplerPeriod(orbitRadius, totalMass),
        phase: prng.range(0, Math.PI * 2),
        inclination: prng.gaussian(0, 0.03),
      },
      style,
      bands,
      atmosphere: atmosphereColor(prng, type),
      rings,
      moons,
      extent,
      // Drawn last so adding it didn't change any earlier planet properties.
      tilt: prng.gaussian(0, 0.2),
    });
    edge = orbitRadius + extent;
  }

  // Own stream, so adding comets changed nothing above.
  const last = planets[planets.length - 1];
  const comets = generateComets(rng.fork('comets'), {
    systemName: ref.name,
    starZone,
    starRadius: Math.max(...stars.map((s) => s.radius)),
    outerEdge: last ? last.orbit.radius + last.extent : 0,
    period: (a) => keplerPeriod(a, totalMass),
  });

  return {
    id: ref.id,
    name: ref.name,
    seed: ref.seed,
    stars,
    planets,
    starZone,
    habitableRadius,
    galacticTilt: randomRotation(rng.fork('galactic')),
    comets,
  };
}

/** Where to put the player when arriving: in the first gap between planets, clear of moons. */
export function spawnDistance(system: SystemData): number {
  const [a, b] = system.planets;
  if (a && b) return (a.orbit.radius + a.extent + b.orbit.radius - b.extent) / 2;
  if (a) return a.orbit.radius + a.extent + 40;
  return system.starZone * 2 + 40;
}

/**
 * The starting system: a lone, sun-like star in the middle of the disc with
 * at least four planets, one of them habitable. Deterministic for a galaxy.
 */
export function findHomeSystem(galaxy: GalaxyData): StarRef {
  for (const ref of galaxy.stars) {
    const [star, companion] = ref.stars;
    if (companion || star!.kind !== 'mainSequence' || !['G', 'K'].includes(star!.spectralClass)) continue;
    const d = Math.hypot(ref.position.x, ref.position.z) / galaxy.radius;
    if (d < 0.35 || d > 0.75) continue;
    const system = generateSystem(ref);
    if (system.planets.length >= 4 && system.planets.some((p) => p.type === 'terran' || p.type === 'ocean')) {
      return ref;
    }
  }
  return galaxy.stars[0]!;
}

function placeStars(rng: Rng, stars: StarData[]): SystemStar[] {
  const still: Orbit = { radius: 0, period: 1, phase: 0, inclination: 0 };
  if (stars.length === 1) return [{ ...stars[0]!, orbit: still }];

  // Binary: both orbit the barycentre, the lighter star further out.
  const [a, b] = stars as [StarData, StarData];
  const separation = (a.radius + b.radius) * rng.range(1.6, 2.4);
  const total = a.mass + b.mass;
  const period = rng.range(40, 80);
  const phase = rng.range(0, Math.PI * 2);
  return [
    { ...a, orbit: { radius: (separation * b.mass) / total, period, phase, inclination: 0 } },
    { ...b, orbit: { radius: (separation * a.mass) / total, period, phase: phase + Math.PI, inclination: 0 } },
  ];
}

function generateRings(rng: Rng, radius: number): RingData {
  return {
    inner: radius * rng.range(1.3, 1.5),
    outer: radius * rng.range(1.9, 2.5),
    color: gasBands(rng)[1]!,
    opacity: rng.range(0.4, 0.8),
  };
}

/** Chance of rings around a solid planet, by type: icy worlds hold on to them, hot ones rarely. */
export const SOLID_RING_CHANCE: Record<Exclude<PlanetType, 'gas'>, number> = {
  ice: 0.22,
  barren: 0.14,
  desert: 0.1,
  terran: 0.08,
  ocean: 0.08,
  lava: 0.05,
};

/** Narrow rings (outer edge ≤ 2 R) for a solid planet, or null. The colour is set from its style later. */
function generateSolidRings(rng: Rng, type: Exclude<PlanetType, 'gas'>, radius: number): RingData | null {
  if (!rng.chance(SOLID_RING_CHANCE[type])) return null;
  const inner = radius * rng.range(1.3, 1.5);
  return {
    inner,
    outer: Math.min(radius * 2, inner + radius * rng.range(0.2, 0.5)),
    color: '',
    opacity: rng.range(0.35, 0.65),
  };
}

/** Icy white for ice worlds, otherwise dusty: a paler, greyer blend of the planet's own ground colours. */
function solidRingColor(rng: Rng, type: Exclude<PlanetType, 'gas'>, style: PlanetStyle): string {
  if (type === 'ice') return hslToHex(rng.range(190, 215), rng.range(0.15, 0.35), rng.range(0.8, 0.9));
  const low = hexToRgb(style.low);
  const high = hexToRgb(style.high);
  const t = rng.range(0.4, 0.7);
  const [r, g, b] = low.map((c, i) => c + (high[i]! - c) * t) as [number, number, number];
  const grey = (r + g + b) / 3;
  // Halfway to grey, and never too dark to see against space.
  const lift = Math.max(0, 0.45 - grey);
  return rgbToHex((r + grey) / 2 + lift, (g + grey) / 2 + lift, (b + grey) / 2 + lift);
}

function generateMoons(
  rng: Rng,
  planetName: string,
  type: PlanetType,
  radius: number,
  rings: RingData | null,
): MoonData[] {
  const count =
    type === 'gas'
      ? rng.weighted<number>([
          [0, 1],
          [1, 3],
          [2, 3],
          [3, 2],
          [4, 1],
        ])
      : rng.weighted<number>([
          [0, 6],
          [1, 3],
          [2, 1],
        ]);

  const moons: MoonData[] = [];
  let edge = Math.max(radius * 1.5, rings ? rings.outer + 2 : 0);
  for (let i = 0; i < count; i++) {
    const moonType = rng.weighted<MoonType>([
      ['barren', 6],
      ['ice', 3],
      ['lava', 1],
    ]);
    const moonRadius = rng.range(1.2, Math.max(1.5, Math.min(3.5, radius * 0.35)));
    const orbitRadius = edge + moonRadius + rng.range(3, 8);
    moons.push({
      name: `${planetName}-${String.fromCharCode(97 + i)}`,
      type: moonType,
      radius: moonRadius,
      seed: rng.int(0, 1_000_000),
      spin: rng.range(0.1, 0.5),
      orbit: {
        radius: orbitRadius,
        period: rng.range(15, 30) * Math.sqrt(orbitRadius / 20),
        phase: rng.range(0, Math.PI * 2),
        inclination: rng.gaussian(0, 0.12),
      },
      style: planetStyle(rng, moonType),
    });
    edge = orbitRadius + moonRadius;
  }
  return moons;
}

function keplerPeriod(orbitRadius: number, mass: number): number {
  return (REFERENCE_PERIOD * Math.pow(orbitRadius / REFERENCE_ORBIT, 1.5)) / Math.sqrt(Math.max(mass, 0.2));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Short label for UI, e.g. "Gas giant", "Terran world". */
export function describePlanet(type: PlanetType): string {
  switch (type) {
    case 'lava':
      return 'Lava world';
    case 'barren':
      return 'Barren rock';
    case 'desert':
      return 'Desert world';
    case 'terran':
      return 'Terran world';
    case 'ocean':
      return 'Ocean world';
    case 'ice':
      return 'Ice world';
    case 'gas':
      return 'Gas giant';
  }
}

// Re-exported so callers can import all generation types from one place.
export type { CometData, PlanetStyle, PlanetType, MoonType };
