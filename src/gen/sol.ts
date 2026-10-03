import { MAX_SYSTEM_ROCKS, asteroidRadius, asteroidStyle, BELT_MARGIN, makeBelt, type AsteroidClass, type AsteroidData, type BeltContext, type BeltData, type TrojanHost } from './belts';
import { hslToHex } from './color';
import { evaluateClimate, type ClimateData, type Composition } from './climate';
import { cometNucleus, type CometData } from './comets';
import type { DustDiscData } from './discs';
import { flatTilt } from './galactic';
import type { StarRef } from './galaxy';
import { gameRadius, gasStyle, type MoonType, type PlanetStyle, type PlanetType, type SizeClass } from './planets';
import { hashSeed, Rng } from './rng';
import { generateShape, type ShapeOptions } from './shape';
import { SOL_MINOR_SEED, SOL_SEEDS } from './solSeeds';
import type { StarData } from './stars';
import { keplerPeriod, type MoonData, type PlanetData, type RingData, type SystemData } from './system';

/*
 * The Sol system: our own Sun, its eight planets and their major moons, Pluto
 * and Charon, the asteroid belt with Ceres and Vesta, Jupiter's Trojans, the
 * Kuiper belt and Halley's comet. Hand-made from the real bodies instead of
 * generated (docs/research/sol.md has every number and its source), in the
 * game's units and compressions:
 *
 * - Sizes: the game's square-root compression of real radii (gameRadius), as
 *   for every generated body. Phobos and Deimos are drawn bigger (as small as
 *   the game's comet nuclei), or they'd vanish next to the UFO.
 * - Distances: log-interpolated between hand-placed orbits (solOrbit), which
 *   keep the order and leave room for each planet's moons and rings; the real
 *   ones (0.39–30 AU) don't fit a game system. Moons sit at √(a / R) planet
 *   radii (the Moon closer, or the inner planets wouldn't fit).
 * - Days and moon months are the game's compressed ones; axial tilts,
 *   inclinations, climates and looks are real. Earth, the Moon, Mars and Pluto
 *   have real maps (gen/realSurface.ts); the giants real cloud bands
 *   (gen/gasGiants.ts) and Saturn real rings.
 */

const DEG = Math.PI / 180;
/** Earth's equatorial radius, km (NASA fact sheet: 12 756 km across), the unit of gameRadius as in docs/research/body-sizes.md. */
const EARTH_KM = 12756 / 2;

/** The Sun: a G2V star (5772 K, 1 L☉, 1 M☉), in the middle of the game's G class (radius 27–32). */
export const SUN: StarData = {
  kind: 'mainSequence',
  spectralClass: 'G',
  color: hslToHex(42, 1, 0.74),
  radius: 29.5,
  luminosity: 1,
  mass: 1,
};

/**
 * Where the planets' orbits go, real semi-major axis (AU) → system units.
 * Earth sits at the habitable radius; the rest are placed so each planet's
 * neighbourhood (moons, rings) clears its neighbours'. Between them the
 * mapping is log-linear, so belts and comets fall in the right gaps.
 */
const ORBIT_ANCHORS: readonly (readonly [au: number, radius: number])[] = [
  [0.387, 82],
  [0.723, 115],
  [1, 160],
  [1.524, 215],
  [5.203, 620],
  [9.537, 1000],
  [19.19, 1340],
  [30.07, 1560],
];

/** A real distance from the Sun (AU) in system units (see ORBIT_ANCHORS); beyond the ends, the end pieces' slope. */
export function solOrbit(au: number): number {
  const a = ORBIT_ANCHORS;
  let i = 1;
  while (i < a.length - 1 && au > a[i]![0]) i++;
  const [a0, r0] = a[i - 1]!;
  const [a1, r1] = a[i]!;
  const t = Math.log(au / a0) / Math.log(a1 / a0);
  return r0 * Math.pow(r1 / r0, t);
}

/** Earth's orbit, where the light is Earth's (the habitable radius). */
export const SOL_HABITABLE_RADIUS = 160;

interface ClimateSpec {
  /** Sunlight relative to Earth's: 1 / a² (AU). */
  insolation: number;
  /** Surface gravity, g. */
  gravity: number;
  /** Escape velocity, km/s. */
  escape: number;
  /** Heat flow from inside, W/m². */
  heat: number;
  /** Bond albedo of the surface (thick air puts its clouds' on top). */
  albedo: number;
  pressure?: number;
  composition?: Composition;
  water?: number;
}

function climate(c: ClimateSpec): ClimateData {
  return evaluateClimate(
    { insolation: c.insolation, gravity: c.gravity, escapeVelocity: c.escape, heatFlow: c.heat },
    { pressure: c.pressure ?? 0, composition: c.composition ?? 'none', greenhouse: 1, water: c.water ?? 0, surfaceAlbedo: c.albedo },
  );
}

/** A solid body's colours. */
function style(low: string, high: string, relief: number, sea: string | null = null, seaLevel = -1): PlanetStyle {
  return { sea, seaLevel, low, high, relief };
}

/**
 * The game's compressed day from the real one: Jupiter's 9.9 h turns at 0.35
 * rad/s (the top of the generated range), slower days as √ of their length.
 */
function spinOf(hours: number): number {
  return 0.35 * Math.sqrt(9.925 / hours);
}

/** A moon's game month at `orbit` units from its planet: the Moon's 25 s at 22, longer outwards (Kepler's 3/2 power). */
function monthOf(orbit: number): number {
  return 25 * Math.pow(orbit / 22, 1.5);
}

/** A moon's climate: its gravity and escape velocity follow from its mass (JPL's GM, km³/s²) and radius. */
type MoonClimate = Omit<ClimateSpec, 'insolation' | 'gravity' | 'escape'> & { gm: number };

/** Surface gravity (g) and escape velocity (km/s) of a body of this GM (km³/s²) and radius (km). */
export function surfaceGravity(gm: number, km: number): { gravity: number; escape: number } {
  return { gravity: ((gm / (km * km)) * 1000) / STANDARD_GRAVITY, escape: Math.sqrt((2 * gm) / km) };
}

/** Standard gravity, m/s² (CGPM 1901). */
const STANDARD_GRAVITY = 9.80665;

interface MoonSpec {
  name: string;
  type: MoonType;
  km: number;
  /** Real semi-major axis in planet radii. */
  a: number;
  low: string;
  high: string;
  relief?: number;
  climate: MoonClimate;
  atmosphere?: string;
  /** Inclination to the ecliptic (default: in the planet's equator). */
  inclination?: number;
  /** Drawn at this game radius instead (tiny moons). */
  radius?: number;
  shape?: ShapeOptions;
  /** A reserved seed (the Moon's, for its map); else the next minor body seed. */
  seed?: number;
  sea?: string;
  seaLevel?: number;
}

interface PlanetSpec {
  name: string;
  type: PlanetType;
  size: SizeClass;
  km: number;
  au: number;
  /** Mean longitude at J2000 (degrees), as the orbit's starting angle. */
  longitude: number;
  /** Inclination to the ecliptic, degrees. */
  inclination: number;
  /** Axial tilt, degrees (over 90: it spins backwards). */
  tilt: number;
  /** Real day, hours. */
  day: number;
  seed: number;
  style: PlanetStyle;
  bands?: string[];
  climate?: ClimateSpec;
  atmosphere?: string;
  rings?: RingData;
  moons: MoonSpec[];
  /** How far out the moons sit: game orbit = R · (a / R)^moonSpread (√ for most). */
  moonSpread?: number;
}

/** Saturn's rings across their real radii (planet radii): D, C, B, the Cassini division, A with the Encke gap (NASA Saturn fact sheet). */
function saturnRings(radius: number): RingData {
  const real = (x: number): number => Math.sqrt(x);
  const inner = 1.11;
  const outer = 2.27;
  const samples = 64;
  const profile = Array.from({ length: samples }, (_, i) => {
    // The game ring spans √(real) planet radii, like the moons.
    const g = real(inner) + ((real(outer) - real(inner)) * (i + 0.5)) / samples;
    const x = g * g;
    if (x < 1.24) return { alpha: 0.06, light: 0.6 }; // D ring
    if (x < 1.53) return { alpha: 0.22 + 0.1 * Math.sin(x * 60), light: 0.72 }; // C ring
    if (x < 1.95) return { alpha: 0.85 + 0.12 * Math.sin(x * 45), light: 1.08 }; // B ring
    if (x < 2.03) return { alpha: 0.06, light: 0.7 }; // Cassini division
    if (x > 2.205 && x < 2.225) return { alpha: 0.1, light: 0.8 }; // Encke gap
    return { alpha: 0.62, light: 0.94 }; // A ring
  });
  // Ice ≳ 95% by mass (docs/research/rings.md).
  return { inner: radius * real(inner), outer: radius * real(outer), color: '#d9c7a2', opacity: 1, profile, ice: 0.95 };
}

/** Uranus's narrow, dark rings (1.64–2.0 planet radii), the ε ring brightest at the outside. */
function uranusRings(radius: number): RingData {
  const samples = 24;
  const profile = Array.from({ length: samples }, (_, i) => {
    const t = i / (samples - 1);
    const ring = i === samples - 2 ? 1 : i % 5 === 2 ? 0.45 : 0.04;
    return { alpha: ring, light: 0.9 + 0.2 * t };
  });
  // Dark as charcoal (albedo ~0.02 against Saturn's 0.4–0.6): not ice on the outside (docs/research/rings.md).
  return { inner: radius * Math.sqrt(1.64), outer: radius * Math.sqrt(2.0), color: '#9aa3a8', opacity: 0.5, profile, ice: 0.05 };
}

/** The planets, Sun outwards (docs/research/sol.md for the numbers). */
function planetSpecs(): PlanetSpec[] {
  const ins = (au: number): number => 1 / (au * au);
  return [
    {
      name: 'Mercury',
      type: 'barren',
      size: 'small',
      km: 4879 / 2,
      au: 0.387,
      longitude: 252.25,
      inclination: 7.0,
      tilt: 0.03,
      day: 4222.6,
      seed: SOL_SEEDS.mercury,
      style: style('#4f4a45', '#b1aaa1', 0.04),
      climate: { insolation: ins(0.387), gravity: 0.378, escape: 4.25, heat: 0.025, albedo: 0.088 },
      moons: [],
    },
    {
      name: 'Venus',
      type: 'desert',
      size: 'earth',
      km: 12104 / 2,
      au: 0.723,
      longitude: 181.98,
      inclination: 3.39,
      tilt: 177.4,
      day: 2802,
      seed: SOL_SEEDS.venus,
      style: style('#6f4b2e', '#b98a5a', 0.03),
      // 92 bar of CO₂ under a sulphuric-acid cloud deck (the climate model's calibration: 737 K).
      climate: { insolation: ins(0.723), gravity: 0.904, escape: 10.36, heat: 0.06, albedo: 0.1, pressure: 92, composition: 'carbonDioxide' },
      atmosphere: '#ead8a0',
      moons: [],
    },
    {
      name: 'Earth',
      type: 'terran',
      size: 'earth',
      km: 12756 / 2,
      au: 1,
      longitude: 100.46,
      inclination: 0,
      tilt: 23.44,
      day: 24,
      seed: SOL_SEEDS.earth,
      style: style('#3d6b2a', '#d8d0c0', 0.025, '#0d2a5c', 0),
      climate: { insolation: 1, gravity: 1, escape: 11.186, heat: 0.092, albedo: 0.294, pressure: 1.014, composition: 'oxygenNitrogen', water: 0.71 },
      atmosphere: '#7fb6f0',
      moonSpread: 0.268,
      moons: [
        {
          name: 'Moon',
          type: 'barren',
          seed: SOL_SEEDS.moon,
          km: 1737.4,
          a: 60.3,
          low: '#56534f',
          high: '#b8b4ad',
          relief: 0.03,
          inclination: 5.16 * DEG,
          climate: { gm: 4902.8, heat: 0.018, albedo: 0.11 },
        },
      ],
    },
    {
      name: 'Mars',
      type: 'desert',
      size: 'small',
      km: 6792 / 2,
      au: 1.524,
      longitude: 355.45,
      inclination: 1.85,
      tilt: 25.19,
      day: 24.62,
      seed: SOL_SEEDS.mars,
      style: style('#6b3f28', '#c88a5a', 0.045),
      climate: { insolation: ins(1.524), gravity: 0.379, escape: 5.03, heat: 0.019, albedo: 0.25, pressure: 0.0064, composition: 'carbonDioxide', water: 0.05 },
      atmosphere: '#d9a070',
      moons: [
        {
          name: 'Phobos',
          type: 'barren',
          km: 11.08,
          a: 2.77,
          radius: 0.9,
          low: '#3b342e',
          high: '#6e6359',
          shape: { lobes: 1, binary: false, elongation: [1.4, 1.55] },
          climate: { gm: 0.0007087, heat: 0.001, albedo: 0.07 },
        },
        {
          name: 'Deimos',
          type: 'barren',
          km: 6.2,
          a: 6.92,
          radius: 0.6,
          low: '#41392f',
          high: '#7a6c5d',
          shape: { lobes: 1, binary: false, elongation: [1.3, 1.4] },
          climate: { gm: 9.62e-05, heat: 0.001, albedo: 0.07 },
        },
      ],
    },
    {
      name: 'Jupiter',
      type: 'gas',
      size: 'gasGiant',
      km: 142984 / 2,
      au: 5.203,
      longitude: 34.4,
      inclination: 1.3,
      tilt: 3.13,
      day: 9.925,
      seed: SOL_SEEDS.jupiter,
      style: gasStyle(JUPITER_BANDS),
      bands: JUPITER_BANDS,
      moons: [
        {
          name: 'Io',
          type: 'lava',
          km: 1821.49,
          a: 5.9,
          low: '#b8913a',
          high: '#ece0a0',
          relief: 0.025,
          sea: '#ff6a1a',
          seaLevel: -0.82,
          climate: { gm: 5959.91547, heat: 2.24, albedo: 0.63 },
        },
        {
          name: 'Europa',
          type: 'ice',
          km: 1560.8,
          a: 9.39,
          low: '#a98c6c',
          high: '#f1ebe0',
          relief: 0.012,
          climate: { gm: 3202.7121, heat: 0.05, albedo: 0.68, water: 1 },
        },
        {
          name: 'Ganymede',
          type: 'ice',
          km: 2631.2,
          a: 14.97,
          low: '#5d5249',
          high: '#c9c0b3',
          relief: 0.02,
          climate: { gm: 9887.83275, heat: 0.01, albedo: 0.44, water: 0.5 },
        },
        {
          name: 'Callisto',
          type: 'ice',
          km: 2410.3,
          a: 26.33,
          low: '#3a322b',
          high: '#9a8d7d',
          relief: 0.02,
          climate: { gm: 7179.2834, heat: 0.005, albedo: 0.22, water: 0.4 },
        },
      ],
    },
    {
      name: 'Saturn',
      type: 'gas',
      size: 'gasGiant',
      km: 120536 / 2,
      au: 9.537,
      longitude: 49.94,
      inclination: 2.49,
      tilt: 26.73,
      day: 10.66,
      seed: SOL_SEEDS.saturn,
      style: gasStyle(SATURN_BANDS),
      bands: SATURN_BANDS,
      rings: saturnRings(gameRadius(60268 / EARTH_KM)),
      moons: [
        icyMoon('Mimas', 198.2, 3.08, '#9a9690', '#d9d6d0', { gm: 2.50349, heat: 0.002, albedo: 0.6 }),
        // Enceladus's south-pole plumes: heat flow inside the measured 0.019–0.050 W/m² (gen/climate.ts).
        icyMoon('Enceladus', 252.1, 3.95, '#dfe9ef', '#ffffff', { gm: 7.21037, heat: 0.03, albedo: 0.81 }),
        icyMoon('Tethys', 531.1, 4.89, '#b9b6b0', '#efedea', { gm: 41.21353, heat: 0.003, albedo: 0.8 }),
        icyMoon('Dione', 561.4, 6.26, '#a19e98', '#e3e1dd', { gm: 73.11607, heat: 0.003, albedo: 0.7 }),
        icyMoon('Rhea', 763.5, 8.75, '#9c9893', '#dedbd6', { gm: 153.94175, heat: 0.003, albedo: 0.7 }),
        {
          name: 'Titan',
          type: 'ice',
          km: 2574.76,
          a: 20.27,
          low: '#3d3024',
          high: '#9b7a52',
          relief: 0.015,
          // Methane lakes round the poles.
          sea: '#2a2620',
          seaLevel: -0.55,
          climate: { gm: 8978.1371, heat: 0.005, albedo: 0.2, pressure: 1.467, composition: 'nitrogen', water: 0.3 },
          atmosphere: '#d99a4a',
        },
        // Iapetus's orbit leans 15° from Saturn's equator.
        { ...icyMoon('Iapetus', 734.3, 59.08, '#3b3128', '#d6d0c6', { gm: 120.51511, heat: 0.002, albedo: 0.2 }), inclination: (26.73 - 15.5) * DEG },
      ],
    },
    {
      name: 'Uranus',
      type: 'gas',
      size: 'iceGiant',
      km: 51118 / 2,
      au: 19.19,
      longitude: 313.23,
      inclination: 0.77,
      tilt: 97.77,
      day: 17.24,
      seed: SOL_SEEDS.uranus,
      style: gasStyle(URANUS_BANDS),
      bands: URANUS_BANDS,
      rings: uranusRings(gameRadius(25559 / EARTH_KM)),
      moons: [
        icyMoon('Miranda', 235.8, 5.06, '#8f8d8a', '#d3d1cd', { gm: 4.3, heat: 0.002, albedo: 0.2 }, 0.03),
        icyMoon('Ariel', 578.9, 7.47, '#8d8a86', '#d7d4cf', { gm: 83.5, heat: 0.003, albedo: 0.23 }),
        icyMoon('Umbriel', 584.7, 10.41, '#4a4744', '#8c8781', { gm: 85.1, heat: 0.003, albedo: 0.1 }),
        icyMoon('Titania', 788.9, 17.06, '#7c7670', '#c6bfb6', { gm: 226.9, heat: 0.003, albedo: 0.17 }),
        icyMoon('Oberon', 761.4, 22.83, '#6b635c', '#b5aba0', { gm: 205.3, heat: 0.003, albedo: 0.14 }),
      ],
    },
    {
      name: 'Neptune',
      type: 'gas',
      size: 'iceGiant',
      km: 49528 / 2,
      au: 30.07,
      longitude: 304.88,
      inclination: 1.77,
      tilt: 28.32,
      day: 16.11,
      seed: SOL_SEEDS.neptune,
      style: gasStyle(NEPTUNE_BANDS),
      bands: NEPTUNE_BANDS,
      moons: [
        {
          // Retrograde, 157° from Neptune's equator. Its nitrogen plumes are sunlight-driven; heat flow stands in for that, so they erupt.
          ...icyMoon('Triton', 1352.6, 14.33, '#b89a8c', '#efe6de', { gm: 1428.49546, heat: 0.02, albedo: 0.76, pressure: 1.4e-5, composition: 'nitrogen' }),
          inclination: 130 * DEG,
        },
      ],
    },
    {
      name: 'Pluto',
      type: 'ice',
      size: 'dwarf',
      km: 2376 / 2,
      au: 39.48,
      longitude: 238.9,
      inclination: 17.16,
      tilt: 119.5,
      day: 153.3,
      seed: SOL_SEEDS.pluto,
      style: style('#6a3d2c', '#f3ebe0', 0.02),
      climate: { insolation: ins(39.48), gravity: 0.7 / 9.8, escape: 1.3, heat: 0.003, albedo: 0.72, pressure: 1e-5, composition: 'nitrogen', water: 0.3 },
      moons: [icyMoon('Charon', 606, 16.49, '#6f6a66', '#c2bdb6', { gm: 106.1, heat: 0.001, albedo: 0.25 })],
    },
  ];
}

/** A grey-white icy moon in its planet's equator. */
function icyMoon(name: string, km: number, a: number, low: string, high: string, c: MoonClimate, relief = 0.025): MoonSpec {
  return { name, type: 'ice', km, a, low, high, relief, climate: { water: 0.8, ...c } };
}

/** Band colours, darkest first: Jupiter's brown belts to cream zones, Saturn's butterscotch, Uranus's pale cyan, Neptune's deep blue. */
const JUPITER_BANDS = ['#5e3f2a', '#94683f', '#c09468', '#dcc29c', '#efe4cf'];
const SATURN_BANDS = ['#7d6743', '#a88d5e', '#c8ad7b', '#ddc89a', '#ece0bd'];
const URANUS_BANDS = ['#7fb3bf', '#93c6cf', '#a8d6dc', '#c0e4e7'];
const NEPTUNE_BANDS = ['#22408f', '#2f56b0', '#4170cc', '#6f97e0'];

/** Is this star reference the Sol system? */
export function isSol(ref: Pick<StarRef, 'real'>): boolean {
  return ref.real === 'sol';
}

/** The Sol system. Pure and deterministic like a generated one; `ref` places it in the galaxy. */
export function solSystem(ref: StarRef): SystemData {
  const period = (r: number): number => keplerPeriod(r, SUN.mass);
  let minorSeed = SOL_MINOR_SEED;
  const planets = planetSpecs().map((p): PlanetData => {
    const radius = gameRadius(p.km / EARTH_KM);
    const tilt = p.tilt * DEG;
    const insolation = 1 / (p.au * p.au);
    const spread = p.moonSpread ?? 0.5;
    const moons = p.moons.map((m, j): MoonData => {
      const r = m.radius ?? gameRadius(m.km / EARTH_KM);
      const orbitRadius = radius * Math.pow(m.a, spread);
      const seed = m.seed ?? minorSeed--;
      const moonClimate = climate({ insolation, ...m.climate, ...surfaceGravity(m.climate.gm, m.km) });
      return {
        name: m.name,
        type: m.type,
        radius: r,
        seed,
        spin: (2 * Math.PI) / monthOf(orbitRadius),
        orbit: {
          radius: orbitRadius,
          period: monthOf(orbitRadius),
          phase: 1.3 + j * 2.1,
          // In the planet's equator: the planet leans about Z, so its equatorial orbits are its tilt turned a quarter about Y (Orbit.node).
          ...(m.inclination === undefined ? { inclination: tilt, node: Math.PI / 2 } : { inclination: m.inclination }),
        },
        style: style(m.low, m.high, m.relief ?? 0.03, m.sea ?? null, m.seaLevel ?? -1),
        atmosphere: m.atmosphere ?? null,
        climate: moonClimate,
        shape: m.shape ? generateShape(new Rng(hashSeed('sol', m.name, 'shape')), m.shape) : null,
        hostDistance: m.a,
      };
    });
    const extent = Math.max(radius, p.rings?.outer ?? 0, ...moons.map((m) => m.orbit.radius + m.radius));
    const orbitRadius = solOrbit(p.au);
    return {
      name: p.name,
      type: p.type,
      size: p.size,
      radius,
      seed: p.seed,
      spin: spinOf(p.day),
      orbit: { radius: orbitRadius, period: period(orbitRadius), phase: p.longitude * DEG, inclination: p.inclination * DEG },
      style: p.style,
      bands: p.bands ?? null,
      atmosphere: p.atmosphere ?? null,
      climate: p.climate ? climate(p.climate) : null,
      rings: p.rings ?? null,
      moons,
      extent,
      tilt,
    };
  });

  const ctx: BeltContext = {
    systemName: 'Sol',
    starZone: SUN.radius,
    planets,
    mainBelt: null,
    period,
  };
  const rng = new Rng(hashSeed('sol', 'belts'));
  const jupiter = planets.findIndex((p) => p.name === 'Jupiter');
  const neptune = planets.find((p) => p.name === 'Neptune')!;
  const named = (belt: BeltData, list: AsteroidSpec[]): BeltData => {
    belt.asteroids = list.map((a) => namedAsteroid(a, minorSeed--, period, belt.trojan));
    return belt;
  };
  // The main belt from Jupiter's 4:1 resonance (2.065 AU) to its 2:1 (3.278 AU).
  const main = named(makeBelt(rng.fork('main'), 'main', 'Asteroid belt', solOrbit(2.065), solOrbit(3.278), ctx, null), [
    { name: 'Vesta', class: 'stony', km: 262.7, au: 2.362, inclination: 7.14, shape: { lobes: 1, binary: false, elongation: [1.1, 1.2] } },
    { name: 'Ceres', class: 'carbon', km: 469.7, au: 2.767, inclination: 10.59, shape: { lobes: 1, binary: false, elongation: [1.0, 1.04] } },
    { name: 'Pallas', class: 'carbon', km: 256, au: 2.81, inclination: 34.84, shape: { lobes: 1, binary: false, elongation: [1.1, 1.2] } },
    { name: 'Hygiea', class: 'carbon', km: 216.5, au: 3.139, inclination: 3.83, shape: { lobes: 1, binary: false, elongation: [1.0, 1.1] } },
  ]);
  // Jupiter's Trojans, 60° ahead (the Greek camp, L4) and behind (the Trojan camp, L5).
  const host = planets[jupiter]!;
  const trojans = (['L4', 'L5'] as const).map((point) => {
    const lead = point === 'L4' ? Math.PI / 3 : -Math.PI / 3;
    const half = host.orbit.radius * 0.04;
    const trojan: TrojanHost = { planet: jupiter, orbit: host.orbit, lead, libration: 0.5, librationPeriod: host.orbit.period * 12.5 };
    const belt = makeBelt(rng.fork('trojans', point), 'trojan', `Jupiter ${point} Trojans`, host.orbit.radius - half, host.orbit.radius + half, ctx, trojan, point === 'L4' ? 1.2 : 0.8);
    return named(
      belt,
      point === 'L4'
        ? [
            { name: 'Hektor', class: 'dtype', km: 112, au: 0, offset: -0.4, inclination: 18.2, shape: { lobes: 2, binary: true, elongation: [1.2, 1.4] } },
            { name: 'Achilles', class: 'dtype', km: 65, au: 0, offset: 0.5, inclination: 10.3, shape: { lobes: 1, binary: false } },
          ]
        : [{ name: 'Patroclus', class: 'dtype', km: 70, au: 0, offset: 0.2, inclination: 22.0, shape: { lobes: 2, binary: true, elongation: [1.1, 1.3] } }],
    );
  });
  // The Kuiper belt, from just past Neptune's neighbourhood out to 50 AU, round Pluto.
  const kuiper = named(makeBelt(rng.fork('kuiper'), 'kuiper', 'Kuiper belt', neptune.orbit.radius + neptune.extent + BELT_MARGIN, solOrbit(50), ctx, null), [
    { name: 'Haumea', class: 'icy', km: 816, au: 43.1, inclination: 28.2, shape: { lobes: 1, binary: false, elongation: [1.9, 2.0] } },
    { name: 'Quaoar', class: 'icy', km: 555, au: 43.7, inclination: 8.0, shape: { lobes: 1, binary: false, elongation: [1.0, 1.1] } },
    { name: 'Arrokoth', class: 'icy', km: 18, au: 44.6, inclination: 2.45, radius: 0.8, shape: { lobes: 2, binary: true, elongation: [1.5, 1.8] } },
    { name: 'Makemake', class: 'icy', km: 715, au: 45.8, inclination: 29.0, shape: { lobes: 1, binary: false, elongation: [1.0, 1.05] } },
  ]);

  const belts = [main, ...trojans, kuiper];
  // The same cap on scenery rocks as every system's (gen/belts.ts).
  const total = belts.reduce((n, b) => n + b.rocks, 0);
  if (total > MAX_SYSTEM_ROCKS) for (const b of belts) b.rocks = Math.round((b.rocks * MAX_SYSTEM_ROCKS) / total);

  return {
    id: ref.id,
    name: ref.name,
    seed: ref.seed,
    stars: [{ ...SUN, orbit: { radius: 0, period: 1, phase: 0, inclination: 0 } }],
    planets,
    starZone: SUN.radius,
    habitableRadius: SOL_HABITABLE_RADIUS,
    galacticTilt: flatTilt(new Rng(hashSeed('sol', 'galactic'))),
    comets: [halley(minorSeed--, period)],
    nebula: ref.nebula ?? null,
    belts,
    dust: zodiacalCloud(),
  };
}

/**
 * Our zodiacal cloud: warm dust from asteroid collisions and Jupiter-family
 * comets, its density falling off as r^−1.34 (COBE's fit, Kelsall et al.
 * 1998) from near the Sun, thinning out past the asteroid belt, in a fan
 * whose density halves 13.7° off the ecliptic (σ ≈ 0.21 r). Fainter than the
 * debris discs telescopes see round other stars (docs/research/dust.md).
 */
function zodiacalCloud(): DustDiscData {
  return {
    kind: 'debris',
    inner: SUN.radius * 1.5,
    outer: solOrbit(5.2),
    slope: 1.34,
    taper: solOrbit(3.5),
    aspect: 0.21,
    flare: 1,
    depth: 0.5,
    gaps: [],
    rings: [],
    spiral: 0,
    pitch: 0,
    color: '#ece2d0',
    seed: hashSeed('sol', 'zodiacal'),
  };
}

interface AsteroidSpec {
  name: string;
  class: AsteroidClass;
  km: number;
  /** Semi-major axis, AU (Trojans: their host's). */
  au: number;
  inclination: number;
  shape: ShapeOptions;
  /** Drawn at this game radius instead (tiny ones). */
  radius?: number;
  /** Trojans: where in the swarm, as a share of its libration (−1 … 1). */
  offset?: number;
}

function namedAsteroid(a: AsteroidSpec, seed: number, period: (r: number) => number, trojan: TrojanHost | null): AsteroidData {
  const rng = new Rng(hashSeed('sol', a.name));
  const shapeRng = rng.fork('shape');
  let shape: ReturnType<typeof generateShape> | null = null;
  const offset = a.offset ?? 0;
  const host = trojan?.orbit;
  const r = host ? host.radius * (1 + 0.01 * offset) : solOrbit(a.au);
  const orbit = host
    ? { radius: r, period: host.period, phase: host.phase + trojan.lead + offset * trojan.libration * 0.6, inclination: a.inclination * DEG }
    : { radius: r, period: period(r), phase: rng.range(0, Math.PI * 2), inclination: a.inclination * DEG };
  return {
    name: a.name,
    class: a.class,
    radius: a.radius ?? asteroidRadius(a.km),
    seed,
    spin: rng.range(0.1, 0.4) * rng.sign(),
    tilt: rng.range(-Math.PI / 2, Math.PI / 2),
    binary: a.shape.binary ?? false,
    get shape() {
      return (shape ??= generateShape(shapeRng, a.shape));
    },
    style: asteroidStyle(rng.fork('style'), a.class),
    orbit,
  };
}

/**
 * Halley's comet: perihelion 0.575 AU, aphelion 35.3 AU, retrograde at 162°
 * (JPL Small-Body Database), its peanut-shaped nucleus (15 × 8 km, Giotto).
 * The perihelion stays outside the Sun's glow, as every comet's does.
 */
function halley(seed: number, period: (a: number) => number): CometData {
  const q = Math.max(solOrbit(0.575), SUN.radius * 3.6);
  const Q = solOrbit(35.3);
  const semiMajor = (q + Q) / 2;
  const rng = new Rng(hashSeed('sol', 'Halley'));
  return {
    ...cometNucleus(rng.fork('nucleus')),
    seed,
    shape: generateShape(rng.fork('shape'), { lobes: 2, binary: true, elongation: [1.6, 1.9] }),
    name: "Halley's Comet",
    radius: 1.6,
    orbit: {
      semiMajor,
      eccentricity: (Q - q) / (Q + q),
      period: period(semiMajor),
      // On its way in.
      phase: -0.35,
      inclination: 162 * DEG,
      argPerihelion: 112 * DEG,
      node: 59.1 * DEG,
    },
    ionColor: '#8fb0ff',
    dustColor: '#fff1d6',
  };
}
