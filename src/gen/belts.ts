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
  planets: readonly BeltPlanet[];
  /** The main belt's span, reserved by generateSystem while placing the planets (see reserveMainBelt), or null. */
  mainBelt: readonly [number, number] | null;
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
 * (3.278 AU): its outer edge is (4/2)^(2/3) = 1.587 times its inner one,
 * whatever the giant's distance. Its inner edge is 1.355 times Mars's orbit
 * (1.524 AU). generateSystem makes room for it before the first giant (see
 * reserveMainBelt), which moves the giant and everything beyond it outwards.
 */
export const MAIN_BELT_RATIO = 2 ** (2 / 3);
export const MAIN_BELT_FROM_INNER_PLANET = 2.065 / 1.524;
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

/**
 * Chances: of the systems with a giant (main belt), and with planets (outer belt). Herschel finds cold debris belts round
 * ~20% of FGK stars, but only ones ≳10× brighter than the Sun's (which has
 * two), so real belts are probably far more common: gameplay shares.
 */
export const BELT_CHANCE = { main: 0.6, kuiper: 0.45 } as const;
/** Chance of a Trojan swarm pair per giant: Jupiter (15 765 known) and Neptune (35) have them, Saturn none (gameplay shares). */
export const TROJAN_CHANCE: Record<'gasGiant' | 'iceGiant', number> = { gasGiant: 0.25, iceGiant: 0.15 };

/**
 * Inclination spread (σ of a half-Gaussian, radians) by belt, half the real
 * one so the game's compressed belts read as bands, not clouds: the main
 * belt's median inclination is 7.15° (σ ≈ 0.185), the Jupiter Trojans' 12°
 * (σ ≈ 0.31), the Kuiper belt's hot population's σ 17° (0.30; its cold one,
 * 19% of objects, 2.2°: KUIPER_COLD).
 */
export const BELT_INCLINATION: Record<BeltKind, readonly [number, number]> = {
  main: [0.085, 0.1],
  kuiper: [0.14, 0.16],
  trojan: [0.14, 0.17],
};
/** The Kuiper belt's cold classicals: their share and inclination spread (halved like the rest). */
export const KUIPER_COLD = { share: 0.19, inclination: 0.019 } as const;

/**
 * Trojans librate about L4/L5 by up to this (radians; real ones "a few
 * degrees to about 35°"), over this many of the host's orbits (linear theory:
 * 1 / √(27μ/4) = 12.5 for Jupiter, 147.8 yr).
 */
export const TROJAN_LIBRATION = [0.45, 0.61] as const;
export const TROJAN_LIBRATION_ORBITS = 12.5;
/** L4 leads L5 by about 1.5 to 1 in number (measured 1.35–1.85): the rocks are shared out so. */
export const TROJAN_L4_SHARE = 0.6;
/** A Trojan swarm's radial spread, as a share of the host's orbit (gameplay: room for its named asteroids). */
export const TROJAN_WIDTH = 0.04;

/**
 * Scenery rocks per 1000 square units of belt, and the most per belt. Stylised:
 * a real main-belt asteroid is ~10⁵–10⁶ of its own diameters from the next;
 * these are tens.
 */
export const ROCK_DENSITY = 200;
export const MAX_ROCKS = { main: 60000, kuiper: 30000, trojan: 5000 } as const;
export const MIN_ROCKS = 400;
/** The most scenery rocks in one system, over all its belts (the view's budget; belts share it by size). */
export const MAX_SYSTEM_ROCKS = 80000;

// --- Named asteroids ---

/** Real radii (km) of the named, visitable asteroids per belt: from the size where they stop being specks to the largest non-dwarf members. */
export const NAMED_RADIUS_KM: Record<BeltKind, readonly [number, number]> = {
  // Vesta 522.77 km across; Hektor's bilobed equivalent 250 km; Ixion 697 km (dwarf candidates left out).
  main: [64, 261],
  kuiper: [64, 349],
  trojan: [64, 125],
};
/** How many named asteroids a belt has. */
export const NAMED_COUNT: Record<BeltKind, readonly [number, number]> = { main: [3, 6], kuiper: [2, 4], trojan: [1, 3] };
/**
 * Share of contact binaries among the named asteroids, by belt: ~14% of
 * near-Earth asteroids (radar; they come from the main belt), 14–23% of
 * Jupiter Trojan candidates, 10–25% of cold classical KBOs (a lower limit;
 * Plutinos up to ~40%).
 */
export const CONTACT_BINARY_SHARE: Record<BeltKind, number> = { main: 0.14, kuiper: 0.25, trojan: 0.18 };
/** A single asteroid's longest over shortest axis: 15 imaged ones have a median of 1.6 (1.05 to 3.6). */
export const ASTEROID_ELONGATION = [1.2, 2.2] as const;

const EARTH_KM = 6371;

/** A named asteroid's game radius from its real one (the planets' mapping, gameRadius). */
export function asteroidRadius(km: number): number {
  return gameRadius(km / EARTH_KM);
}

/** Every belt of a system: the main belt, an outer icy belt and the giants' Trojans. Uses its own `rng` stream. */
export function generateBelts(rng: Rng, ctx: BeltContext): BeltData[] {
  const belts: BeltData[] = [];
  if (ctx.mainBelt) {
    belts.push(makeBelt(rng.fork('main', 'belt'), 'main', `${ctx.systemName} belt`, ctx.mainBelt[0], ctx.mainBelt[1], ctx, null));
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
      const share = point === 'L4' ? TROJAN_L4_SHARE : 1 - TROJAN_L4_SHARE;
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
      belts.push(makeBelt(prng, 'trojan', `${planet.name} ${point} Trojans`, r - half, r + half, ctx, host, 2 * share));
    }
  });
  const total = belts.reduce((n, b) => n + b.rocks, 0);
  if (total > MAX_SYSTEM_ROCKS) for (const b of belts) b.rocks = Math.round((b.rocks * MAX_SYSTEM_ROCKS) / total);
  return belts;
}

/** Whether a system gets a main belt (if it has a giant to hold one), from the belts' own stream. */
export function wantsMainBelt(rng: Rng): boolean {
  return rng.fork('main').chance(BELT_CHANCE.main);
}

/**
 * Room for a main belt before the first giant: from 1.355 times the orbit of
 * the planet inside it (Mars to the 4:1 resonance), or just past `edge` if
 * that is further (the planet's neighbourhood, or the stars' when the giant
 * is the first planet), out to MAIN_BELT_RATIO times that. The giant then
 * starts its neighbourhood `BELT_MARGIN` beyond the outer edge.
 */
export function reserveMainBelt(innerPlanetOrbit: number | null, edge: number): [number, number] {
  const inner = Math.max(edge + BELT_MARGIN, (innerPlanetOrbit ?? 0) * MAIN_BELT_FROM_INNER_PLANET);
  return [inner, inner * MAIN_BELT_RATIO];
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

function makeBelt(
  rng: Rng,
  kind: BeltKind,
  name: string,
  inner: number,
  outer: number,
  ctx: BeltContext,
  trojan: TrojanHost | null,
  /** Rocks relative to the area's share (a Trojan swarm's L4 / L5). */
  weight = 1,
): BeltData {
  const area = trojan ? 2 * trojan.libration * (inner + outer) * 0.5 * (outer - inner) : Math.PI * (outer * outer - inner * inner);
  const rocks = Math.round(weight * Math.min(MAX_ROCKS[kind], Math.max(MIN_ROCKS, (area / 1000) * ROCK_DENSITY)));
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
 * The share of dark (C-like) asteroids across a main belt, at log fractions
 * from its inner to outer edge: measured from albedos (dark p_V < 0.10 against
 * bright > 0.15) of numbered asteroids ≥ 5 km in the inner (2.065–2.502 AU),
 * middle (–2.825) and outer (–3.279) belt, at each zone's middle. Bright,
 * stony S-types lead inside the 3:1 for the big ones; dark wins outwards.
 */
export const CARBON_SHARE: readonly (readonly [t: number, share: number])[] = [
  [0.21, 0.55],
  [0.55, 0.68],
  [0.85, 0.87],
];

/** The class of a main-belt rock at log fraction `t` across the belt (others by belt kind), `u` a uniform draw. */
export function asteroidClass(belt: Pick<BeltData, 'kind'>, t: number, u: number): AsteroidClass {
  if (belt.kind === 'trojan') return 'dtype';
  if (belt.kind === 'kuiper') return 'icy';
  return u < carbonShare(t) ? 'carbon' : 'stony';
}

/** CARBON_SHARE interpolated (and held at the ends). */
export function carbonShare(t: number): number {
  const points = CARBON_SHARE;
  if (t <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i++) {
    const [t1, s1] = points[i]!;
    const [t0, s0] = points[i - 1]!;
    if (t <= t1) return s0 + ((s1 - s0) * (t - t0)) / (t1 - t0);
  }
  return points[points.length - 1]![1];
}

/** Log fraction across a belt for orbital radius `r`. */
export function beltFraction(belt: Pick<BeltData, 'inner' | 'outer'>, r: number): number {
  return Math.log(r / belt.inner) / Math.log(belt.outer / belt.inner);
}

/** The named asteroids: spaced out across the belt so no two orbits touch, nearest first. */
function namedAsteroids(rng: Rng, belt: BeltData, ctx: BeltContext): AsteroidData[] {
  const want = rng.int(...NAMED_COUNT[belt.kind]);
  const maxRadius = asteroidRadius(NAMED_RADIUS_KM[belt.kind][1]);
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
    const kind = asteroidClass(belt, beltFraction(belt, r), arng.next());
    const body = asteroidBody(arng.fork('body'), belt.kind, kind);
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
    return Object.defineProperties({ name: generateName(arng.fork('name')), orbit }, Object.getOwnPropertyDescriptors(body)) as AsteroidData;
  });
}

/**
 * A named asteroid's body (size, spin, shape and colours) for a belt of
 * `beltKind` and composition `kind`, all from `rng` (its own stream). The
 * shape is built on first read (see AsteroidData.shape).
 */
export function asteroidBody(rng: Rng, beltKind: BeltKind, kind: AsteroidClass): Omit<AsteroidData, 'name' | 'orbit'> {
  const [minKm, maxKm] = NAMED_RADIUS_KM[beltKind];
  const radius = asteroidRadius(logRange(rng, minKm, maxKm));
  const binary = rng.chance(CONTACT_BINARY_SHARE[beltKind]);
  const shapeOptions = { lobes: binary ? 2 : rng.chance(0.15) ? 3 : 1, binary, elongation: ASTEROID_ELONGATION };
  const shapeRng = rng.fork('shape');
  let shape: ShapeData | null = null;
  return {
    class: kind,
    radius,
    seed: rng.int(0, 1_000_000),
    // Turns in 15–60 s, like the comets and moons (the game's compressed days).
    spin: rng.range(0.1, 0.4) * rng.sign(),
    tilt: rng.range(-Math.PI / 2, Math.PI / 2),
    binary,
    get shape(): ShapeData {
      return (shape ??= generateShape(shapeRng, shapeOptions));
    },
    style: asteroidStyle(rng.fork('style'), kind),
  };
}

/**
 * Colours by class, from the Bus-DeMeo mean spectra scaled by albedo (see the
 * note): stony S-types a light reddish grey (#8b847a, p_V 0.23), C-types a
 * neutral dark grey (#464544, 0.06), D-types the same with a red-brown cast
 * (#484542), cold Kuiper belt objects red (B−R 1.70, p_V 0.15) with pale ice.
 * Stylised: the dark ones are lifted a little, or they'd vanish against space.
 */
export const ASTEROID_COLORS: Record<AsteroidClass, { hue: readonly [number, number]; sat: readonly [number, number]; low: readonly [number, number]; high: readonly [number, number] }> = {
  stony: { hue: [28, 40], sat: [0.06, 0.12], low: [0.36, 0.42], high: [0.56, 0.64] },
  carbon: { hue: [30, 45], sat: [0.01, 0.04], low: [0.19, 0.23], high: [0.32, 0.38] },
  dtype: { hue: [15, 30], sat: [0.06, 0.12], low: [0.19, 0.23], high: [0.32, 0.38] },
  icy: { hue: [25, 35], sat: [0.25, 0.4], low: [0.35, 0.42], high: [0.72, 0.82] },
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


// --- Scenery rocks ---

/**
 * One scenery rock, as the view's shader moves it (and `rockPosition` mirrors
 * it): a circular orbit tilted by `inclination` about a line of nodes at
 * `node`, `turn` of the way round at time 0, going round `rate` times as fast
 * as the belt's inner edge (Kepler: (inner / r)^1.5; Trojans 1), swinging
 * by up to `libration` turns (Trojans) over the host's libration period.
 */
export interface RockData {
  radius: number;
  /** Turns round the star at time 0 (Trojans: the host's place plus the lead and an offset). */
  turn: number;
  rate: number;
  inclination: number;
  node: number;
  /** Libration amplitude and phase, turns (0 off a Trojan swarm). */
  libration: number;
  libPhase: number;
  /** Longest reach, system units. */
  size: number;
  class: AsteroidClass;
  /** Unit spin axis and radians per second. */
  axis: [number, number, number];
  spin: number;
  /** Which of the view's rock meshes it uses. */
  mesh: number;
}

/** Scenery rocks' sizes (longest reach, system units): smaller than the named asteroids (0.8 and up). */
export const ROCK_SIZE = [0.2, 1.2] as const;
/**
 * The cumulative size slope the rocks are drawn with, N(>s) ∝ s^−q: SDSS's
 * 1.3 for main-belt asteroids of 0.4–5 km (steeper, 2.5–3, for bigger ones;
 * a steeper slope here would leave mostly specks).
 */
export const ROCK_SIZE_SLOPE = 1.3;
/** Belt edges thin out over this share of the width (log radius). */
const EDGE_TAPER = 0.12;
/** Share of rocks a Kirkwood gap removes at its centre. */
const GAP_DEPTH = 0.9;

/** The belt's scenery rocks, from its seed (pure: the same every visit). `meshes` is how many rock meshes the view has. */
export function generateRocks(belt: BeltData, rng: Rng, meshes: number): RockData[] {
  const rocks: RockData[] = [];
  const logSpan = Math.log(belt.outer / belt.inner);
  const [s0, s1] = ROCK_SIZE;
  const trojan = belt.trojan;
  for (let tries = 0; rocks.length < belt.rocks && tries < belt.rocks * 4; tries++) {
    const t = rng.next();
    const radius = belt.inner * Math.exp(t * logSpan);
    const turnDraw = rng.next();
    // Thin out at the edges and in the gaps.
    const edge = Math.min(1, t / EDGE_TAPER, (1 - t) / EDGE_TAPER);
    let keep = edge * edge * (3 - 2 * edge);
    for (const gap of belt.gaps) {
      const d = (t - gap.at) / gap.width;
      keep *= 1 - GAP_DEPTH * Math.exp(-d * d * 2);
    }
    const u = rng.next();
    if (u > keep) continue;
    // Truncated power law: N(>s) ∝ s^−q between s0 and s1.
    const q = ROCK_SIZE_SLOPE;
    const v = rng.next();
    const size = Math.pow(Math.pow(s0, -q) - v * (Math.pow(s0, -q) - Math.pow(s1, -q)), -1 / q);
    const z = rng.range(-1, 1);
    const a = rng.range(0, Math.PI * 2);
    const sz = Math.sqrt(1 - z * z);
    const cold = belt.kind === 'kuiper' && rng.chance(KUIPER_COLD.share);
    const inclination = Math.abs(rng.gaussian(0, cold ? KUIPER_COLD.inclination : belt.inclination));
    const node = rng.range(0, Math.PI * 2);
    let turn: number;
    let libration = 0;
    let libPhase = 0;
    if (trojan) {
      // Spread round the Lagrange point as the libration takes them, more near it.
      libration = (trojan.libration * Math.sqrt(rng.next())) / (Math.PI * 2);
      libPhase = rng.next();
      turn = (trojan.orbit.phase + trojan.lead) / (Math.PI * 2) + rng.gaussian(0, 0.01);
    } else {
      turn = turnDraw;
    }
    rocks.push({
      radius,
      turn,
      rate: trojan ? 1 : Math.pow(belt.inner / radius, 1.5),
      inclination,
      node,
      libration,
      libPhase,
      size,
      class: asteroidClass(belt, t, rng.next()),
      axis: [sz * Math.cos(a), sz * Math.sin(a), z],
      // Turning in ~4–20 s (the game's compressed days; real ones of 10–100 km take a median 10 h), small ones faster.
      spin: rng.range(0.3, 1.5) * rng.sign() * Math.sqrt(s0 / size),
      mesh: rng.int(0, meshes - 1),
    });
  }
  return rocks;
}

/** Turns of the belt's inner edge (Trojans: of the host) at system time `time`, as the view's shader takes them. */
export function beltTurns(belt: Pick<BeltData, 'period'>, time: number): number {
  return time / belt.period;
}

/** Turns of the libration cycle at `time` (0 without a Trojan host). */
export function librationTurns(belt: Pick<BeltData, 'trojan'>, time: number): number {
  return belt.trojan ? time / belt.trojan.librationPeriod : 0;
}

/**
 * Where a rock's centre is at `turns` of the belt's inner edge and
 * `libTurns` of the libration (the view's vertex shader does the same).
 * Writes into `out` and returns it.
 */
export function rockPosition<T extends { x: number; y: number; z: number }>(rock: RockData, turns: number, libTurns: number, out: T): T {
  const along = rock.turn + turns * rock.rate + rock.libration * Math.sin(Math.PI * 2 * (libTurns + rock.libPhase));
  // In its own plane from the line of nodes, so the longitude stays `along` whatever the node.
  const a = Math.PI * 2 * along + rock.node;
  const flat = rock.radius * Math.sin(a);
  const x = rock.radius * Math.cos(a);
  const y = flat * Math.sin(rock.inclination);
  const z = flat * Math.cos(rock.inclination);
  // Turned about +Y by the node, as keplerPosition does.
  const cn = Math.cos(rock.node);
  const sn = Math.sin(rock.node);
  out.x = x * cn + z * sn;
  out.y = y;
  out.z = -x * sn + z * cn;
  return out;
}

/** A point rocks are measured from: its position, distance from the centre and from the belt's axis, and longitude in turns. */
export interface RockEye {
  x: number;
  y: number;
  z: number;
  distance: number;
  radius: number;
  turn: number;
}

/** `point` as a RockEye (written into `out`). */
export function rockEye(point: { x: number; y: number; z: number }, out: RockEye): RockEye {
  out.x = point.x;
  out.y = point.y;
  out.z = point.z;
  out.distance = Math.hypot(point.x, point.y, point.z);
  out.radius = Math.hypot(point.x, point.z);
  out.turn = Math.atan2(point.z, point.x) / (2 * Math.PI);
  return out;
}

/**
 * Whether a rock is within `reach` of `eye` (what the view's mesh choice asks
 * of tens of thousands of rocks a few times a second). Most are rejected
 * without trigonometry: too far nearer or further from the centre, or too far
 * round (two points at distances ρ and e from the axis, Δ apart in longitude,
 * are at least 2√(ρe)·sin(Δ/2) ≥ 4·(Δ in turns)·√(ρe) apart; a rock's
 * longitude strays from its `along` by its libration and, on an inclined
 * orbit, by under i²/8π turns, and its distance from the axis is at least
 * r·cos i). The rest are placed with `rockPosition` (into `out`).
 */
export function rockWithin(
  rock: RockData,
  turns: number,
  libTurns: number,
  eye: RockEye,
  reach: number,
  out: { x: number; y: number; z: number },
): boolean {
  if (Math.abs(rock.radius - eye.distance) > reach) return false;
  let apart = rock.turn + turns * rock.rate - eye.turn;
  apart = Math.abs(apart - Math.round(apart)) - rock.libration - (rock.inclination * rock.inclination) / (8 * Math.PI);
  if (apart > 0 && 4 * apart * Math.sqrt(rock.radius * Math.cos(rock.inclination) * eye.radius) > reach) return false;
  rockPosition(rock, turns, libTurns, out);
  const dx = out.x - eye.x;
  const dy = out.y - eye.y;
  const dz = out.z - eye.z;
  return dx * dx + dy * dy + dz * dz <= reach * reach;
}

/** The space a belt's rocks keep to: an annular slab round the star's axis, plus their biggest size. */
export interface RockBounds {
  /** Nearest and furthest any rock comes to the axis (r·cos i and r). */
  minAxis: number;
  maxAxis: number;
  /** Furthest any rock gets from the belt's plane (r·sin i). */
  maxHeight: number;
  maxSize: number;
}

export function rockBounds(rocks: readonly RockData[]): RockBounds {
  const b: RockBounds = { minAxis: Infinity, maxAxis: 0, maxHeight: 0, maxSize: 0 };
  for (const r of rocks) {
    b.minAxis = Math.min(b.minAxis, r.radius * Math.cos(r.inclination));
    b.maxAxis = Math.max(b.maxAxis, r.radius);
    b.maxHeight = Math.max(b.maxHeight, r.radius * Math.abs(Math.sin(r.inclination)));
    b.maxSize = Math.max(b.maxSize, r.size);
  }
  return b;
}

/**
 * Whether no rock can be within `reach` of `eye`: the gap from the eye to the
 * bounds' slab, across (axis distances) and up (heights), is a lower bound on
 * the distance to every rock in it. Lets the view skip a whole belt's rocks.
 */
export function rocksOutOfReach(bounds: RockBounds, eye: RockEye, reach: number): boolean {
  const across = Math.max(0, bounds.minAxis - eye.radius, eye.radius - bounds.maxAxis);
  const up = Math.max(0, Math.abs(eye.y) - bounds.maxHeight);
  return across * across + up * up > reach * reach;
}
