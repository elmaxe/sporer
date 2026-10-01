import { flatTilt, type Quat } from './galactic';
import { BELT_MARGIN, generateBelts, reserveMainBelt, wantsMainBelt, type BeltData } from './belts';
import { generateComets, type CometData } from './comets';
import { atmosphereTint, generateClimate, type ClimateData } from './climate';
import type { GalaxyData, StarRef } from './galaxy';
import type { NebulaData } from './nebulas';
import { hexToRgb, hslToHex, rgbToHex } from './color';
import { romanNumeral } from './names';
import type { Orbit } from './orbit';
import {
  EARTH_GAME_RADIUS,
  MOON_COUNT_WEIGHTS,
  atmosphereColor,
  chooseSizeClass,
  isGiant,
  choosePlanetType,
  gasBands,
  gasStyle,
  moonRadius,
  planetRadius,
  planetStyle,
  type MoonType,
  type PlanetStyle,
  type PlanetType,
  type SizeClass,
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
  /** Glow colour from the climate's atmosphere, or null when there's too little air to see. */
  atmosphere: string | null;
  climate: ClimateData;
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
  /** Size class: dwarf to gas giant (see gen/planets.ts). */
  size: SizeClass;
  radius: number;
  seed: number;
  spin: number;
  orbit: Orbit;
  style: PlanetStyle;
  /** Gas giant band colours, darkest first; null for solid worlds. */
  bands: string[] | null;
  /** Glow colour, or null for airless worlds (and gas giants, whose bands carry the look). */
  atmosphere: string | null;
  /** Temperature, atmosphere and internal heat; null for gas giants (see gen/climate.ts). */
  climate: ClimateData | null;
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
  /** The nebula the system sits in, if any (from its StarRef). */
  nebula: NebulaData | null;
  /** Asteroid belts, outer icy belts and Trojan swarms, with their named asteroids (see gen/belts.ts). */
  belts: BeltData[];
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
  // A main belt goes before the first giant, which moves out to make room (its own stream, so no planet draw changes).
  const beltRng = rng.fork('belts');
  const wantsBelt = wantsMainBelt(beltRng);
  let mainBelt: [number, number] | null = null;
  for (let i = 0; i < planetCount; i++) {
    const prng = rng.fork('planet', i);
    const name = `${ref.name} ${romanNumeral(i + 1)}`;
    const gap = prng.range(20, 50) * (1 + i * 0.4);

    // The type depends on distance, but the final distance depends on the
    // planet's extent, so classify at the nearest possible orbit. The size
    // class has its own stream; the type and radius take one draw each from
    // prng, as they always did, so the planet's other draws stay put.
    const zone = (edge + gap) / habitableRadius;
    const size = chooseSizeClass(prng.fork('size'), zone);
    const type = choosePlanetType(prng, zone, size);
    if (wantsBelt && !mainBelt && isGiant(size)) {
      mainBelt = reserveMainBelt(planets[i - 1]?.orbit.radius ?? null, edge);
      edge = mainBelt[1] + BELT_MARGIN;
    }
    const radius = planetRadius(prng, size);
    const rings =
      type === 'gas'
        ? prng.chance(0.45)
          ? generateRings(prng, radius)
          : null
        : // Own stream, so the draws of gas giants and everything else stay as they were.
          generateSolidRings(prng.fork('rings'), type, radius);
    const moonOrbits = generateMoons(prng.fork('moons'), name, size, radius, rings);
    const extent = Math.max(
      radius,
      rings?.outer ?? 0,
      ...moonOrbits.map((m) => m.orbit.radius + m.radius),
    );
    const orbitRadius = edge + gap + extent;
    let bands: string[] | null = null;
    let style: PlanetStyle;
    if (type === 'gas') {
      bands = gasBands(prng, size === 'iceGiant');
      style = gasStyle(bands);
    } else {
      style = planetStyle(prng, type);
      if (rings) rings.color = solidRingColor(prng.fork('rings', 'color'), type, style);
    }

    // Own streams, so adding climate changed no other draw. Starlight falls
    // off as 1 / zone², the same zone the types are chosen from.
    const insolation = (habitableRadius / orbitRadius) ** 2;
    const climate =
      type === 'gas' ? null : generateClimate(prng.fork('climate'), { type, kind: size, radius, insolation });
    const moons = moonOrbits.map((moon, j): MoonData => {
      const crng = prng.fork('climate', 'moon', j);
      const moonClimate = generateClimate(crng, {
        type: moon.type,
        kind: 'moon',
        radius: moon.radius,
        insolation,
        host: { radius, size, orbitRadius: moon.orbit.radius },
      });
      return { ...moon, atmosphere: atmosphereTint(crng, moonClimate), climate: moonClimate };
    });

    planets.push({
      name,
      type,
      size,
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
      atmosphere: climateAtmosphere(prng, type, climate),
      climate,
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

  // Own stream too: belts sit in the gaps the planets left.
  const belts = generateBelts(beltRng, {
    systemName: ref.name,
    starZone,
    planets,
    mainBelt,
    period: (r) => keplerPeriod(r, totalMass),
  });

  return {
    id: ref.id,
    name: ref.name,
    seed: ref.seed,
    stars,
    planets,
    starZone,
    habitableRadius,
    galacticTilt: flatTilt(rng.fork('galactic')),
    comets,
    nebula: ref.nebula ?? null,
    belts,
  };
}

/**
 * The atmosphere's colour, from the climate. The old colour draw is kept in
 * its place so the draws after it (the tilt) stay put.
 */
function climateAtmosphere(prng: Rng, type: PlanetType, climate: ClimateData | null): string | null {
  atmosphereColor(prng, type);
  return climate ? atmosphereTint(prng.fork('climate', 'tint'), climate) : null;
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

export function generateRings(rng: Rng, radius: number): RingData {
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
export function generateSolidRings(rng: Rng, type: Exclude<PlanetType, 'gas'>, radius: number): RingData | null {
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
export function solidRingColor(rng: Rng, type: Exclude<PlanetType, 'gas'>, style: PlanetStyle): string {
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

/** Gaps between moon orbits for an Earth-sized planet; they scale with √(radius / 8), so bigger planets spread their moons wider. */
const MOON_GAP: readonly [number, number] = [3, 8];

/** A planet's moons, without their climates. `count` overrides the drawn number (tools; it changes the draws). */
export function generateMoons(
  rng: Rng,
  planetName: string,
  size: SizeClass,
  radius: number,
  rings: RingData | null,
  count = rng.weighted<number>(MOON_COUNT_WEIGHTS[size]),
): Omit<MoonData, 'atmosphere' | 'climate'>[] {
  const gapScale = Math.sqrt(radius / EARTH_GAME_RADIUS);

  const moons: Omit<MoonData, 'atmosphere' | 'climate'>[] = [];
  let edge = Math.max(radius * 1.5, rings ? rings.outer + 2 : 0);
  for (let i = 0; i < count; i++) {
    const moonType = rng.weighted<MoonType>([
      ['barren', 6],
      ['ice', 3],
      ['lava', 1],
    ]);
    const r = moonRadius(rng, radius, size);
    const orbitRadius = edge + r + rng.range(MOON_GAP[0], MOON_GAP[1]) * gapScale;
    moons.push({
      name: `${planetName}-${String.fromCharCode(97 + i)}`,
      type: moonType,
      radius: r,
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
    edge = orbitRadius + r;
  }
  return moons;
}

function keplerPeriod(orbitRadius: number, mass: number): number {
  return (REFERENCE_PERIOD * Math.pow(orbitRadius / REFERENCE_ORBIT, 1.5)) / Math.sqrt(Math.max(mass, 0.2));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Short label for UI, e.g. "Ice giant", "Ocean world · super-Earth". */
export function describeSized(type: PlanetType, size: SizeClass): string {
  switch (size) {
    case 'gasGiant':
      return 'Gas giant';
    case 'iceGiant':
      return 'Ice giant';
    case 'dwarf':
      return `${describePlanet(type)} · dwarf`;
    case 'small':
      return `${describePlanet(type)} · small`;
    case 'earth':
      return `${describePlanet(type)} · Earth-sized`;
    case 'superEarth':
      return `${describePlanet(type)} · super-Earth`;
  }
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
export type { ClimateData } from './climate';
export type { BeltData, CometData, PlanetStyle, PlanetType, MoonType, SizeClass };
