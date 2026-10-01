import { hslToHex } from './color';
import { generateName } from './names';
import type { Orbit } from './orbit';
import { gameRadius, isGiant, logRange, type PlanetStyle, type SizeClass } from './planets';
import type { Rng } from './rng';
import { generateShape, type ShapeData } from './shape';

/*
 * Asteroid belts (step 26): a ring of rocks between the rocky planets and the
 * first giant, sometimes an icy one beyond the outermost planet (Kuiper-style),
 * and Trojan swarms 60° ahead of and behind giants. Pure data; the rocks
 * themselves are drawn from the belt's seed by world/AsteroidBelt.ts, and a few
 * named asteroids per belt are visitable bodies built on step 25's shapes.
 * Numbers, sources and the mapping to game units: docs/research/asteroid-belts.md.
 *
 * Real belts are almost empty (main-belt asteroids above 1 km are about a
 * million km apart); the game's are dense-looking on purpose.
 */

export type BeltKind = 'main' | 'kuiper' | 'trojan';

/**
 * What a rock is made of, by where it formed: stony S-types dominate the inner
 * main belt, dark carbonaceous C-types the outer, dark red D-types the Jupiter
 * Trojans, and red, icy bodies the Kuiper belt.
 */
export type AsteroidClass = 'stony' | 'carbon' | 'dtype' | 'icy';

export interface AsteroidData {
  name: string;
  class: AsteroidClass;
  /** Longest reach from the centre, system units (see `shape`). */
  radius: number;
  seed: number;
  /** Radians per second about its own axis, and the axis's tilt. */
  spin: number;
  tilt: number;
  /** Two lobes joined by a neck (known without building the shape). */
  binary: boolean;
  /**
   * Its irregular shape (gen/shape.ts). Built on first read and kept: measuring
   * a shape takes ~1 ms, and most systems' asteroids are never looked at.
   */
  readonly shape: ShapeData;
  style: PlanetStyle;
  /** Round the star (Trojans: the host's period and a phase 60° from it). */
  orbit: Orbit;
}

/** A Trojan swarm's host: the giant it shares an orbit with, and which Lagrange point. */
export interface TrojanHost {
  /** Index of the host in the system's planets. */
  planet: number;
  /** The host's orbit: the swarm follows it. */
  orbit: Orbit;
  /** Angle ahead of the host (radians): +π/3 at L4, −π/3 at L5. */
  lead: number;
  /** Largest swing about the Lagrange point, radians (each rock librates by up to this). */
  libration: number;
  /** Seconds per libration (a fixed number of the host's orbits). */
  librationPeriod: number;
}

export interface BeltData {
  kind: BeltKind;
  /** E.g. "Kreu belt", "Kreu outer belt", "Kreu V L4 Trojans". */
  name: string;
  /** Orbital radii of the rocks, system units. */
  inner: number;
  outer: number;
  /** Spread of the rocks' orbital inclinations (σ of a Gaussian, radians): the belt's thickness. */
  inclination: number;
  /** Seconds per orbit at `inner`; further out it follows Kepler's third law (Trojans: the host's period). */
  period: number;
  /** Scenery rocks (drawn by the view from `seed`). */
  rocks: number;
  /** Seeds the scenery rocks. */
  seed: number;
  /** Where along the belt (0 = inner edge, 1 = outer, in log radius) the rocks thin out: Kirkwood gaps. */
  gaps: { at: number; width: number }[];
  /** Rock colours by class, as shares of the belt, e.g. stony inside, carbon outside. */
  classes: AsteroidClass[];
  icy: boolean;
  trojan: TrojanHost | null;
  /** Visitable asteroids, nearest the star first. */
  asteroids: AsteroidData[];
}

/** What belt generation needs to know about the rest of the system. */
export interface BeltContext {
  systemName: string;
  /** Radius around the barycentre occupied by the star(s). */
  starZone: number;
  /** Inner edge of where the first planet could be (as in generateSystem). */
  firstEdge: number;
  planets: readonly BeltPlanet[];
  /** Seconds per orbit at a radius, from the system's Kepler law. */
  period: (radius: number) => number;
}

/** The planet facts belts are placed by. */
export interface BeltPlanet {
  name: string;
  size: SizeClass;
  orbit: Orbit;
  /** Radius of its neighbourhood: rings and moons included. */
  extent: number;
}

// --- Placement (docs/research/asteroid-belts.md) ---

/**
 * The main belt runs from Jupiter's 4:1 resonance (2.065 AU) to its 2:1
 * (3.278 AU), Mars at 1.524 and Jupiter at 5.204: in log radius between the
 * last rocky planet's orbit and the first giant's, that's 0.247 to 0.624 of
 * the way. The game's orbits are compressed differently from real ones, so the
 * belt keeps these log fractions between whichever planets bracket it.
 */
export const MAIN_BELT_SPAN = [0.247, 0.624] as const;
/**
 * The Kirkwood gaps inside the main belt (3:1 at 2.502 AU, 5:2 at 2.825, 7:3
 * at 2.956), as log fractions from its inner to outer edge, and their widths.
 */
export const KIRKWOOD_GAPS = [
  { at: 0.415, width: 0.05 },
  { at: 0.678, width: 0.04 },
  { at: 0.778, width: 0.025 },
] as const;
/**
 * The Kuiper belt, from Neptune's 3:2 resonance (39.4 AU) to the edge of the
 * classical belt (~50 AU), Neptune at 30.07: 1.31–1.66 times the outermost
 * planet's orbit.
 */
export const KUIPER_SPAN = [1.31, 1.66] as const;
/** Belts keep this clear of a planet's neighbourhood (system units: more than an asteroid's standoff). */
export const BELT_MARGIN = 10;
/** Narrower than this and there is no belt (system units). */
export const MIN_BELT_WIDTH = 12;

/** Chances, of the systems where one fits: gameplay shares (debris discs are common, see the note). */
export const BELT_CHANCE = { main: 0.6, kuiper: 0.3 } as const;
/** Chance of a Trojan swarm pair per giant: Jupiter and Neptune both have them, Saturn none. */
export const TROJAN_CHANCE: Record<'gasGiant' | 'iceGiant', number> = { gasGiant: 0.25, iceGiant: 0.15 };

/**
 * Inclination spread (σ, radians) by belt: the real belts' are wider (see the
 * note), halved so the game's compressed belts read as bands, not clouds.
 */
export const BELT_INCLINATION: Record<BeltKind, readonly [number, number]> = {
  main: [0.05, 0.08],
  kuiper: [0.06, 0.1],
  trojan: [0.08, 0.12],
};

/** Trojans librate about L4/L5 by up to this (radians), over this many of the host's orbits (Jupiter's: ~150 yr / 11.86 yr). */
export const TROJAN_LIBRATION = [0.25, 0.45] as const;
export const TROJAN_LIBRATION_ORBITS = 12.6;
/** A Trojan swarm's radial spread, as a share of the host's orbit. */
export const TROJAN_WIDTH = 0.04;

/** Scenery rocks per 1000 square units of belt (stylised: real belts are almost empty), and the most per belt. */
export const ROCK_DENSITY = 50;
export const MAX_ROCKS = { main: 6000, kuiper: 6000, trojan: 1200 } as const;
export const MIN_ROCKS = 400;
/** The most scenery rocks in one system, over all its belts (the view's budget; belts share it by size). */
export const MAX_SYSTEM_ROCKS = 12000;

// --- Named asteroids ---

/** Real radii (km) of the named, visitable asteroids per belt: from the size where they stop being specks to the largest non-dwarf members. */
export const NAMED_RADIUS_KM: Record<BeltKind, readonly [number, number]> = {
  main: [64, 265],
  kuiper: [64, 400],
  trojan: [64, 113],
};
/** How many named asteroids a belt has. */
export const NAMED_COUNT: Record<BeltKind, readonly [number, number]> = { main: [3, 6], kuiper: [2, 4], trojan: [1, 3] };
/** Share of contact binaries among the named asteroids, by belt (see the note). */
export const CONTACT_BINARY_SHARE: Record<BeltKind, number> = { main: 0.2, kuiper: 0.3, trojan: 0.2 };
/** A single asteroid's longest over shortest axis. */
export const ASTEROID_ELONGATION = [1.2, 2.2] as const;

const EARTH_KM = 6371;

/** A named asteroid's game radius from its real one (the planets' mapping, gameRadius). */
export function asteroidRadius(km: number): number {
  return gameRadius(km / EARTH_KM);
}

/** Every belt of a system: the main belt, an outer icy belt and the giants' Trojans. Uses its own `rng` stream. */
export function generateBelts(rng: Rng, ctx: BeltContext): BeltData[] {
  const belts: BeltData[] = [];
  const main = mainBeltSpan(ctx);
  if (main && rng.fork('main').chance(BELT_CHANCE.main)) {
    belts.push(makeBelt(rng.fork('main', 'belt'), 'main', `${ctx.systemName} belt`, main[0], main[1], ctx, null));
  }
  const outer = kuiperSpan(ctx);
  if (outer && rng.fork('kuiper').chance(BELT_CHANCE.kuiper)) {
    belts.push(makeBelt(rng.fork('kuiper', 'belt'), 'kuiper', `${ctx.systemName} outer belt`, outer[0], outer[1], ctx, null));
  }
  ctx.planets.forEach((planet, i) => {
    if (!isGiant(planet.size)) return;
    const trng = rng.fork('trojans', i);
    if (!trng.chance(TROJAN_CHANCE[planet.size])) return;
    for (const [point, lead] of [['L4', Math.PI / 3], ['L5', -Math.PI / 3]] as const) {
      const prng = trng.fork(point);
      const r = planet.orbit.radius;
      const host: TrojanHost = {
        planet: i,
        orbit: planet.orbit,
        lead,
        libration: prng.range(...TROJAN_LIBRATION),
        librationPeriod: planet.orbit.period * TROJAN_LIBRATION_ORBITS,
      };
      // Kept clear of the neighbours' neighbourhoods.
      const prev = ctx.planets[i - 1];
      const next = ctx.planets[i + 1];
      let half = r * TROJAN_WIDTH;
      if (prev) half = Math.min(half, r - (prev.orbit.radius + prev.extent + BELT_MARGIN));
      if (next) half = Math.min(half, next.orbit.radius - next.extent - BELT_MARGIN - r);
      if (half < MIN_BELT_WIDTH / 4) return;
      belts.push(makeBelt(prng, 'trojan', `${planet.name} ${point} Trojans`, r - half, r + half, ctx, host));
    }
  });
  const total = belts.reduce((n, b) => n + b.rocks, 0);
  if (total > MAX_SYSTEM_ROCKS) for (const b of belts) b.rocks = Math.round((b.rocks * MAX_SYSTEM_ROCKS) / total);
  return belts;
}

/** Where a main belt would go: between the last planet inside the first giant and the giant, or null if it doesn't fit. */
export function mainBeltSpan(ctx: BeltContext): [number, number] | null {
  const g = ctx.planets.findIndex((p) => isGiant(p.size));
  if (g < 0) return null;
  const giant = ctx.planets[g]!;
  const prev = ctx.planets[g - 1];
  const a0 = prev ? prev.orbit.radius : ctx.firstEdge;
  const a1 = giant.orbit.radius;
  const free0 = (prev ? prev.orbit.radius + prev.extent : ctx.firstEdge) + BELT_MARGIN;
  const free1 = a1 - giant.extent - BELT_MARGIN;
  const span = Math.log(a1 / a0);
  const inner = Math.max(free0, a0 * Math.exp(MAIN_BELT_SPAN[0] * span));
  const outer = Math.min(free1, a0 * Math.exp(MAIN_BELT_SPAN[1] * span));
  return outer - inner >= MIN_BELT_WIDTH ? [inner, outer] : null;
}

/** Where an outer, icy belt would go beyond the last planet, or null with no planets. */
export function kuiperSpan(ctx: BeltContext): [number, number] | null {
  const last = ctx.planets[ctx.planets.length - 1];
  if (!last) return null;
  const a = last.orbit.radius;
  const inner = Math.max(a * KUIPER_SPAN[0], a + last.extent + BELT_MARGIN);
  const outer = Math.max(a * KUIPER_SPAN[1], inner + MIN_BELT_WIDTH);
  return [inner, outer];
}

function makeBelt(rng: Rng, kind: BeltKind, name: string, inner: number, outer: number, ctx: BeltContext, trojan: TrojanHost | null): BeltData {
  const area = trojan ? 2 * trojan.libration * (inner + outer) * 0.5 * (outer - inner) : Math.PI * (outer * outer - inner * inner);
  const rocks = Math.round(Math.min(MAX_ROCKS[kind], Math.max(MIN_ROCKS, (area / 1000) * ROCK_DENSITY)));
  const classes: AsteroidClass[] = kind === 'main' ? ['stony', 'carbon'] : kind === 'trojan' ? ['dtype'] : ['icy'];
  const belt: BeltData = {
    kind,
    name,
    inner,
    outer,
    inclination: rng.range(...BELT_INCLINATION[kind]),
    period: trojan ? trojan.orbit.period : ctx.period(inner),
    rocks,
    seed: rng.int(0, 1_000_000),
    gaps: kind === 'main' ? KIRKWOOD_GAPS.map((g) => ({ ...g })) : [],
    classes,
    icy: kind === 'kuiper',
    trojan,
    asteroids: [],
  };
  belt.asteroids = namedAsteroids(rng.fork('named'), belt, ctx);
  return belt;
}

/**
 * Where across a main belt (0 inner edge, 1 outer, in log radius) the stony
 * S-types give way to carbonaceous C-types: the crossover sits near 2.7 AU
 * (DeMeo & Carry 2014), 0.585 of the way from 2.065 to 3.278 AU.
 */
export const STONY_TO_CARBON = 0.585;

/** The class of a main-belt rock at log fraction `t` across the belt (others by belt kind), with a blurred crossover. */
export function asteroidClass(belt: Pick<BeltData, 'kind'>, t: number, u: number): AsteroidClass {
  if (belt.kind === 'trojan') return 'dtype';
  if (belt.kind === 'kuiper') return 'icy';
  // The share of C-types climbs from ~20% at the inner edge to ~80% at the outer.
  const carbon = 0.2 + 0.6 * smoothstep(STONY_TO_CARBON - 0.35, STONY_TO_CARBON + 0.35, t);
  return u < carbon ? 'carbon' : 'stony';
}

/** Log fraction across a belt for orbital radius `r`. */
export function beltFraction(belt: Pick<BeltData, 'inner' | 'outer'>, r: number): number {
  return Math.log(r / belt.inner) / Math.log(belt.outer / belt.inner);
}

/** The named asteroids: spaced out across the belt so no two orbits touch, nearest first. */
function namedAsteroids(rng: Rng, belt: BeltData, ctx: BeltContext): AsteroidData[] {
  const want = rng.int(...NAMED_COUNT[belt.kind]);
  const [minKm, maxKm] = NAMED_RADIUS_KM[belt.kind];
  const maxRadius = asteroidRadius(maxKm);
  // Orbits at least two of the biggest apart, so neighbours can never touch.
  const spacing = 2 * maxRadius + 1;
  const slots = Math.max(1, Math.floor((belt.outer - belt.inner) / spacing));
  const count = Math.min(want, slots);
  // Pick distinct slots, then jitter inside each.
  const free = Array.from({ length: slots }, (_, i) => i);
  const chosen: number[] = [];
  for (let i = 0; i < count; i++) chosen.push(free.splice(rng.int(0, free.length - 1), 1)[0]!);
  chosen.sort((a, b) => a - b);
  const width = (belt.outer - belt.inner) / slots;

  return chosen.map((slot, i) => {
    const arng = rng.fork('asteroid', i);
    const r = belt.inner + width * (slot + 0.5) + arng.range(-0.5, 0.5) * Math.max(0, width - spacing);
    const t = beltFraction(belt, r);
    const kind = asteroidClass(belt, t, arng.next());
    const radius = asteroidRadius(logRange(arng, minKm, maxKm));
    const binary = arng.chance(CONTACT_BINARY_SHARE[belt.kind]);
    const shapeOptions = { lobes: binary ? 2 : arng.chance(0.15) ? 3 : 1, binary, elongation: ASTEROID_ELONGATION };
    const shapeRng = arng.fork('shape');
    let shape: ShapeData | null = null;
    let orbit: Orbit;
    if (belt.trojan) {
      const host = belt.trojan.orbit;
      orbit = {
        radius: r,
        period: host.period,
        phase: host.phase + belt.trojan.lead + arng.range(-1, 1) * belt.trojan.libration * 0.6,
        inclination: host.inclination + arng.gaussian(0, belt.inclination),
      };
    } else {
      orbit = { radius: r, period: ctx.period(r), phase: arng.range(0, Math.PI * 2), inclination: arng.gaussian(0, belt.inclination) };
    }
    return {
      name: generateName(arng.fork('name')),
      class: kind,
      radius,
      seed: arng.int(0, 1_000_000),
      // Turns in 15–60 s, like the comets and moons (the game's compressed days).
      spin: arng.range(0.1, 0.4) * arng.sign(),
      tilt: arng.range(-Math.PI / 2, Math.PI / 2),
      binary,
      get shape(): ShapeData {
        return (shape ??= generateShape(shapeRng, shapeOptions));
      },
      style: asteroidStyle(arng.fork('style'), kind),
      orbit,
    };
  });
}

/**
 * Colours by class (see the note): stony S-types a light reddish grey,
 * carbonaceous C-types and D-types dark (C neutral grey, D red-brown),
 * icy outer-belt bodies red with pale ice.
 */
export const ASTEROID_COLORS: Record<AsteroidClass, { hue: readonly [number, number]; sat: readonly [number, number]; low: readonly [number, number]; high: readonly [number, number] }> = {
  stony: { hue: [20, 40], sat: [0.12, 0.22], low: [0.3, 0.38], high: [0.5, 0.6] },
  carbon: { hue: [25, 45], sat: [0.03, 0.08], low: [0.13, 0.17], high: [0.24, 0.3] },
  dtype: { hue: [8, 22], sat: [0.25, 0.4], low: [0.14, 0.18], high: [0.26, 0.32] },
  icy: { hue: [10, 25], sat: [0.3, 0.45], low: [0.3, 0.38], high: [0.72, 0.82] },
};

/** A named asteroid's colours and fine relief. */
export function asteroidStyle(rng: Rng, kind: AsteroidClass): PlanetStyle {
  const c = ASTEROID_COLORS[kind];
  const hue = rng.range(...c.hue);
  return {
    sea: null,
    seaLevel: 0,
    low: hslToHex(hue, rng.range(...c.sat), rng.range(...c.low)),
    high: kind === 'icy' ? hslToHex(rng.range(190, 215), rng.range(0.1, 0.25), rng.range(...c.high)) : hslToHex(hue + rng.range(-6, 6), rng.range(...c.sat), rng.range(...c.high)),
    relief: rng.range(0.03, 0.05),
  };
}

/** The tooltip line for a named asteroid, e.g. "Stony asteroid · contact binary · Kreu belt". */
export function describeAsteroid(asteroid: Pick<AsteroidData, 'class' | 'binary'>, belt: Pick<BeltData, 'name'>): string {
  const kind = ASTEROID_CLASS_NAMES[asteroid.class];
  return [kind, ...(asteroid.binary ? ['contact binary'] : []), belt.name].join(' · ');
}

export const ASTEROID_CLASS_NAMES: Record<AsteroidClass, string> = {
  stony: 'Stony asteroid',
  carbon: 'Carbonaceous asteroid',
  dtype: 'Dark red Trojan',
  icy: 'Icy outer-belt body',
};

/** The tooltip line for a belt, e.g. "Asteroid belt · 4 named asteroids". */
export function describeBelt(belt: Pick<BeltData, 'kind' | 'asteroids'>): string {
  const kind = belt.kind === 'main' ? 'Asteroid belt' : belt.kind === 'kuiper' ? 'Icy outer belt' : 'Trojan swarm';
  const n = belt.asteroids.length;
  return `${kind} · ${n} named ${n === 1 ? 'asteroid' : 'asteroids'}`;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
