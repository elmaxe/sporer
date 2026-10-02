import { flatTilt, type Quat } from './galactic';
import { BELT_MARGIN, generateBelts, reserveMainBelt, wantsMainBelt, type BeltData } from './belts';
import { generateComets, type CometData } from './comets';
import { generateDebrisDisc, generateProtoplanetaryDisc, type DiscContext, type DustDiscData, type DustGap, type DustRing, type FormingPlanet } from './discs';
import { atmosphereTint, generateClimate, type ClimateData } from './climate';
import type { GalaxyData, StarRef } from './galaxy';
import type { NebulaData } from './nebulas';
import { hexToRgb, hslToHex, rgbToHex } from './color';
import { romanNumeral } from './names';
import type { Orbit } from './orbit';
import type { ShapeData } from './shape';
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
import { isSol, SOL_HABITABLE_RADIUS, solOrbit, solSystem } from './sol';
import {
  ROGUE_HEAT,
  ROGUE_MOON_WEIGHTS,
  ROGUE_SIZE_WEIGHTS,
  ROGUE_TYPE_WEIGHTS,
  isRogue,
  rogueClimate,
  rogueHydrogen,
} from './rogues';
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
  /** An irregular small moon's shape (gen/shape.ts; Mars's Phobos and Deimos); `radius` is its longest reach. Absent: round. */
  shape?: ShapeData | null;
}

export interface RingData {
  inner: number;
  outer: number;
  color: string;
  opacity: number;
  /**
   * A real ring system's structure (Saturn's B ring, the Cassini division, ...):
   * opacity and brightness factors evenly spaced from the inner to the outer
   * edge. Without it the view draws seeded gaps.
   */
  profile?: readonly { alpha: number; light: number }[];
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
  /** None for a rogue planet (see gen/rogues.ts). */
  stars: SystemStar[];
  /** A rogue's one planet sits still at the centre (orbit radius 0). */
  planets: PlanetData[];
  /** Radius around the barycentre occupied by the star(s); a rogue's planet's radius. */
  starZone: number;
  /** Distance with Earth-like temperatures. Drives planet types. 0 for a rogue (no starlight anywhere). */
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
  /** A young star's protoplanetary disc, a mature system's faint debris disc, or none (see gen/discs.ts). */
  dust: DustDiscData | null;
}

/** G-class period at the reference distance; other orbits follow Kepler's third law. */
const REFERENCE_ORBIT = 90;
const REFERENCE_PERIOD = 50;

/** Generates a star's full system. Pure and deterministic: same ref, same system. */
export function generateSystem(ref: StarRef): SystemData {
  if (isSol(ref)) return solSystem(ref);
  if (isRogue(ref)) return generateRogueSystem(ref);
  if (ref.young) return generateYoungSystem(ref);
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

  // Own stream: a faint debris disc along the planets' plane in some systems.
  let extent = starZone;
  for (const p of planets) extent = Math.max(extent, p.orbit.radius + p.extent);
  for (const b of belts) extent = Math.max(extent, b.outer);
  const dust = generateDebrisDisc(rng.fork('dust'), discContext(stars, starZone, habitableRadius), extent);

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
    dust,
  };
}

/** What a system's dust is generated from: real AU mapped as Sol's are, in units of its habitable radius. */
export function discContext(stars: readonly StarData[], starZone: number, habitableRadius: number): DiscContext {
  return { stars, starZone, habitableRadius, toSystem: (au) => (solOrbit(au) / SOL_HABITABLE_RADIUS) * habitableRadius };
}

/**
 * A young star's system (roadmap step 29): the star wrapped in its
 * protoplanetary disc, with one to three planets still forming in the gaps
 * they've cleared: molten rocky bodies (a magma ocean under a thin crust)
 * inside the snow line, young giants outside it. No moons, rings, belts or
 * comets yet: the disc is all of them. See gen/discs.ts.
 */
export function generateYoungSystem(ref: StarRef): SystemData {
  const rng = new Rng(ref.seed);
  const stars = placeStars(rng.fork('stars'), ref.stars);
  const totalMass = ref.stars.reduce((m, s) => m + s.mass, 0);
  const totalLuminosity = ref.stars.reduce((l, s) => l + s.luminosity, 0);
  const starZone = Math.max(...stars.map((s) => s.orbit.radius + s.radius));
  const habitableRadius = clamp(140 * Math.sqrt(totalLuminosity), 60, 600);
  const { disc, planets: forming } = generateProtoplanetaryDisc(rng.fork('disc'), discContext(stars, starZone, habitableRadius));
  const planets: PlanetData[] = [];
  const gaps: DustGap[] = [];
  const rings: DustRing[] = [];
  // The outer edge of the last gap's bright ring: the next gap starts beyond it.
  let clear = disc.inner;
  forming.forEach((f, i) => {
    const planet = formingPlanet(rng.fork('planet', i), `${ref.name} ${romanNumeral(planets.length + 1)}`, f, habitableRadius, totalMass);
    // Stylised: a rocky planet's real gap would be narrower than the planet is drawn, so every gap clears the planet.
    const gap = disc.gaps[i]!;
    gap.width = Math.max(gap.width, planet.radius * MIN_GAP_RADII);
    const ring = disc.rings[i]!;
    ring.at = Math.max(ring.at, gap.at + gap.width * 1.6);
    ring.width = Math.max(ring.width, gap.width * 0.4);
    // Gaps that would run into the last one's ring, or out of the disc, are left out (with their planets).
    if (gap.at - gap.width < clear || ring.at + ring.width > disc.outer) return;
    clear = ring.at + 2 * ring.width;
    planets.push(planet);
    gaps.push(gap);
    rings.push(ring);
  });
  disc.gaps = gaps;
  disc.rings = rings;
  return {
    id: ref.id,
    name: ref.name,
    seed: ref.seed,
    stars,
    planets,
    starZone,
    habitableRadius,
    galacticTilt: flatTilt(rng.fork('galactic')),
    comets: [],
    nebula: ref.nebula ?? null,
    belts: [],
    dust: disc,
  };
}

/** A forming planet's gap is at least this many of its radii either side of it. */
export const MIN_GAP_RADII = 4;

/** A planet forming in a young disc's gap: a molten rocky body or a young giant, with no moons or rings yet. */
function formingPlanet(prng: Rng, name: string, f: FormingPlanet, habitableRadius: number, totalMass: number): PlanetData {
  const size: SizeClass = f.giant ? 'gasGiant' : prng.weighted<SizeClass>([['small', 1], ['earth', 2], ['superEarth', 1]]);
  const type: PlanetType = f.giant ? 'gas' : 'lava';
  const radius = planetRadius(prng, size);
  let bands: string[] | null = null;
  let style: PlanetStyle;
  if (type === 'gas') {
    bands = gasBands(prng);
    style = gasStyle(bands);
  } else {
    style = planetStyle(prng, 'lava');
    // A magma ocean: mostly molten, a thin crust over the highest ground.
    style.seaLevel = prng.range(0.15, 0.45);
  }
  const insolation = (habitableRadius / f.at) ** 2;
  const climate = type === 'gas' ? null : generateClimate(prng.fork('climate'), { type, kind: size, radius, insolation });
  return {
    name,
    type,
    size,
    radius,
    seed: prng.int(0, 1_000_000),
    spin: prng.range(0.05, 0.35) * prng.sign(),
    orbit: { radius: f.at, period: keplerPeriod(f.at, totalMass), phase: prng.range(0, Math.PI * 2), inclination: prng.gaussian(0, 0.01) },
    style,
    bands,
    atmosphere: climate ? atmosphereTint(prng.fork('climate', 'tint'), climate) : null,
    climate,
    rings: null,
    moons: [],
    extent: radius,
    tilt: prng.gaussian(0, 0.2),
  };
}

/** An orbit that stays put at the centre: a rogue planet's. */
const STILL: Orbit = { radius: 0, period: 1, phase: 0, inclination: 0 };

/**
 * A rogue planet's "system": no star, one planet still at the centre, maybe
 * a moon or two. The planet is a frozen world lit only from inside: ice or
 * bare rock, now and then a young one still molten in its cracks, and,
 * under a thick hydrogen envelope warm enough for it, a hidden sea (an ice
 * world whose water comes out liquid is an ocean world). See gen/rogues.ts.
 */
/**
 * How far out a system reaches from its barycentre (system units): its
 * outermost planet's neighbourhood (moons, rings) or belt edge, whichever is
 * further. Comets on their long orbits are left out.
 */
export function systemExtent(system: SystemData): number {
  let extent = system.starZone;
  for (const p of system.planets) extent = Math.max(extent, p.orbit.radius + p.extent);
  for (const b of system.belts) extent = Math.max(extent, b.outer);
  return extent;
}

export function generateRogueSystem(ref: StarRef): SystemData {
  const rng = new Rng(ref.seed);
  const prng = rng.fork('planet', 0);
  const size = prng.weighted(ROGUE_SIZE_WEIGHTS);
  const draft = prng.weighted(ROGUE_TYPE_WEIGHTS);
  const radius = planetRadius(prng, size);
  const heat = prng.range(ROGUE_HEAT[0], ROGUE_HEAT[1]);
  const hydrogen = draft === 'lava' ? 0 : rogueHydrogen(prng.fork('hydrogen'), size);
  const climate = rogueClimate(prng.fork('climate'), { type: draft, kind: size, radius }, heat, hydrogen);
  const type: PlanetType = draft === 'ice' && climate.waterState === 'liquid' ? 'ocean' : draft;
  const style = planetStyle(prng, type);
  if (type === 'lava') {
    // Mostly a cold crust, molten only down in the cracks and basins.
    style.seaLevel = prng.range(-0.75, -0.45);
  } else if (type === 'ocean') {
    // No light, no plants: the land is bare rock round a dark sea.
    style.low = hslToHex(prng.range(20, 40), 0.1, prng.range(0.18, 0.26));
    style.high = hslToHex(prng.range(20, 40), 0.08, prng.range(0.4, 0.5));
  }
  const moonCount = prng.weighted(ROGUE_MOON_WEIGHTS);
  const moonOrbits = generateMoons(prng.fork('moons'), ref.name, size, radius, null, moonCount);
  const moons = moonOrbits.map((moon, j): MoonData => {
    const moonClimate = rogueClimate(
      prng.fork('climate', 'moon', j),
      { type: moon.type, kind: 'moon', radius: moon.radius, host: { radius, size, orbitRadius: moon.orbit.radius } },
      heat,
      0,
    );
    return { ...moon, atmosphere: null, climate: moonClimate };
  });
  const extent = Math.max(radius, ...moonOrbits.map((m) => m.orbit.radius + m.radius));
  const planet: PlanetData = {
    name: ref.name,
    type,
    size,
    radius,
    seed: prng.int(0, 1_000_000),
    spin: prng.range(0.05, 0.35) * prng.sign(),
    orbit: { ...STILL },
    style,
    bands: null,
    atmosphere: atmosphereTint(prng.fork('climate', 'tint'), climate),
    climate,
    rings: null,
    moons,
    extent,
    tilt: prng.gaussian(0, 0.2),
  };
  return {
    id: ref.id,
    name: ref.name,
    seed: ref.seed,
    stars: [],
    planets: [planet],
    starZone: radius,
    habitableRadius: 0,
    galacticTilt: flatTilt(rng.fork('galactic')),
    comets: [],
    belts: [],
    nebula: ref.nebula ?? null,
    dust: null,
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
    // The real Sol system is somewhere to visit, not where the game starts.
    if (isSol(ref) || ref.young || companion || star!.kind !== 'mainSequence' || !['G', 'K'].includes(star!.spectralClass)) continue;
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

/** Seconds per orbit at `orbitRadius` round `mass` (G star = 1): Kepler's third law from the reference orbit. */
export function keplerPeriod(orbitRadius: number, mass: number): number {
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
