import { hashSeed, Rng } from './rng';
import type { PlanetStyle, SizeClass } from './planets';
import { EARTH_ESCAPE_VELOCITY, bodyMass, earthRadii } from './climate';

/*
 * What a planet buster leaves of a planet or moon: a debris field of rock
 * chunks and dust, as pure data from the body's seed. Both views draw it
 * (world/DebrisField.ts), the system view with the biggest chunks only, and
 * where everything is follows from the time since the blast alone, so a
 * field looks the same whenever and from wherever it's seen. All lengths are
 * in the body's radii. Unit-tested in tests/buster.test.ts.
 *
 * The blast throws every piece from inside the body (`from`) out to where it
 * ends up (`to`), quickly at first and braking (1 − e^(−t/τ)); after that the
 * field drifts round the old axis, inner pieces faster (like orbits,
 * ∝ r^−1.5), and every chunk tumbles. The field is a little flattened
 * towards the old equator, and nothing reaches past DEBRIS_REACH radii.
 *
 * How hot it all is comes from the body's size (`debrisLook`): the energy
 * that disperses a body grows with its escape velocity squared, so a big
 * planet melts and partly vaporises, Mars-sized ones half melt and small
 * moons shatter cold; giants turn to gas. Melt crusts over within seconds
 * but keeps glowing through fissures, droplets cool, vapour spreads, cools
 * and condenses. See docs/research/shattered-planets.md.
 */

/** The field's outer edge, in the body's radii (inside the nearest moon's orbit, 1.5 radii and more). */
export const DEBRIS_REACH = 1.4;
/** The dust goes a little further than the rocks. */
export const DUST_REACH = 1.6;

export const debrisParams = {
  /** Time constant of the blast's outward throw, seconds. */
  throwTime: 1.1,
  /** The field's drift round the old axis at one radius, radians per second. */
  swirl: 0.03,
  /** The old equator's squash: heights are this share of the rest. */
  flatten: 0.72,
};

/** One rock of the field. */
export interface DebrisChunk {
  /** Unit direction from the centre (before the squash). */
  dir: [number, number, number];
  /** Distance from the centre before the blast (inside the body) and once it has settled, in radii. */
  from: number;
  to: number;
  /** How fast it gets there (× the blast's pace). */
  pace: number;
  /** Its size (how far it reaches from its own centre) in radii, and its squash per axis (at most 1). */
  size: number;
  shape: [number, number, number];
  /** Tumble: unit axis, a starting angle, a spin after the blast and a slow one forever (radians, rad/s). */
  axis: [number, number, number];
  angle: number;
  kick: number;
  spin: number;
  /** Index into the field's palette and how light it is (× the colour). */
  shade: number;
  light: number;
}

/** A dust mote of the field (drawn as a soft point). */
export interface DebrisMote {
  dir: [number, number, number];
  from: number;
  to: number;
  pace: number;
}

/** A puff of the vapour cloud (or a giant's gas): where it sits (it spreads as the cloud expands) and how big it is. */
export interface VapourPuff {
  dir: [number, number, number];
  /** Distance from the centre and size, in radii, at the blast; both grow with the cloud. */
  distance: number;
  size: number;
  /** For its look: which of the palette's colours tints it, and a seed for its billows. */
  shade: number;
  seed: number;
}

export interface DebrisData {
  /** Biggest first. */
  chunks: DebrisChunk[];
  motes: DebrisMote[];
}

/** The vapour cloud's puffs, from the body's `seed` (their own stream, so the rocks don't change). */
export function generateVapour(seed: number, count: number): VapourPuff[] {
  const rng = new Rng(hashSeed(seed, 'vapour'));
  return Array.from({ length: count }, (_, i) => {
    const r = rng.fork('puff', i);
    return {
      dir: unitVector(r),
      distance: 0.15 + 0.85 * Math.sqrt(r.next()),
      size: r.range(0.25, 0.6),
      shade: r.int(0, 3),
      seed: r.range(0, 100),
    };
  });
}

/** How many rocks a field has; fewer are drawn as its biggest ones. */
export const DEBRIS_CHUNKS = 1100;
/** Share of the rocks thrown in a few clumps (the rest anywhere), so the field is a mess, not a ball. */
const CLUMPED = 0.55;

/**
 * The field from a body's `seed`: its `chunks` biggest rocks (the same ones
 * however many are asked for, so the system view's few are low orbit's
 * biggest) and `motes` dust motes.
 */
export function generateDebris(seed: number, chunks: number, motes: number): DebrisData {
  const rng = new Rng(hashSeed(seed, 'debris'));
  const lobes = Array.from({ length: rng.int(4, 7) }, () => unitVector(rng));
  const rocks: DebrisChunk[] = [];
  for (let i = 0; i < Math.max(chunks, DEBRIS_CHUNKS); i++) {
    const r = rng.fork('chunk', i);
    // Many small pieces and a few big ones.
    const size = 0.01 + 0.14 * Math.pow(r.next(), 6);
    const to = 0.18 + (DEBRIS_REACH - size - 0.18) * Math.pow(r.next(), 0.8);
    rocks.push({
      dir: r.chance(CLUMPED) ? near(r, r.pick(lobes), 0.4) : unitVector(r),
      // Inside the body (and its tallest mountains) until the blast, in the same order as they end up.
      from: (to / DEBRIS_REACH) * (0.9 - size),
      to,
      pace: r.range(0.7, 1.4),
      size,
      shape: [r.range(0.6, 1), r.range(0.45, 0.9), r.range(0.6, 1)],
      axis: unitVector(r),
      angle: r.range(0, Math.PI * 2),
      kick: r.range(1, 7),
      spin: r.range(0.05, 0.5) * r.sign(),
      shade: r.weighted<number>([
        [0, 4],
        [1, 2.5],
        [2, 2.5],
        [3, 1],
      ]),
      light: r.range(0.6, 1.15),
    });
  }
  rocks.sort((a, b) => b.size - a.size);
  rocks.length = Math.min(rocks.length, chunks);
  const dust: DebrisMote[] = [];
  for (let i = 0; i < motes; i++) {
    const r = rng.fork('mote', i);
    const to = 0.1 + (DUST_REACH - 0.1) * Math.pow(r.next(), 0.7);
    dust.push({ dir: unitVector(r), from: (to / DUST_REACH) * 0.9, to, pace: r.range(0.5, 1.6) });
  }
  return { chunks: rocks, motes: dust };
}

/** How far a piece has come from `from` to `to` (0 → 1), `t` seconds after the blast at `pace`. */
export function debrisThrow(t: number, pace: number, p = debrisParams): number {
  return t <= 0 ? 0 : 1 - Math.exp((-t * pace) / p.throwTime);
}

/** How far round the old axis a piece `radius` radii out has drifted, `t` seconds after the blast. */
export function debrisSwirl(t: number, radius: number, p = debrisParams): number {
  return t <= 0 ? 0 : (p.swirl * t) / Math.pow(Math.max(radius, 0.2), 1.5);
}

/**
 * Writes where a piece is `t` seconds after the blast into `out` (in radii):
 * thrown out along its direction, squashed towards the equator and drifted
 * round the axis (+Y).
 */
export function debrisPosition<T extends { x: number; y: number; z: number }>(
  piece: { dir: readonly number[]; from: number; to: number; pace: number },
  t: number,
  out: T,
  p = debrisParams,
): T {
  const r = piece.from + (piece.to - piece.from) * debrisThrow(t, piece.pace, p);
  const x = piece.dir[0]! * r;
  const z = piece.dir[2]! * r;
  const a = debrisSwirl(t, piece.to, p);
  const c = Math.cos(a);
  const s = Math.sin(a);
  out.x = c * x + s * z;
  out.y = piece.dir[1]! * r * p.flatten;
  out.z = -s * x + c * z;
  return out;
}

/** The field's colours (hex): deep rock, the body's lowlands, highlands and sea (or ice); a giant's from its bands. */
export function debrisPalette(style: PlanetStyle, bands: readonly string[] | null | undefined): [string, string, string, string] {
  if (bands && bands.length > 0) {
    const at = (f: number) => bands[Math.min(bands.length - 1, Math.floor(f * bands.length))]!;
    return [at(0.1), at(0.35), at(0.6), at(0.85)];
  }
  return ['#3b3532', style.low, style.high, style.sea ?? style.low];
}

/** A unit vector scattered round `dir` by about `spread` radians. */
function near(rng: Rng, dir: readonly [number, number, number], spread: number): [number, number, number] {
  const x = dir[0] + rng.gaussian(0, spread);
  const y = dir[1] + rng.gaussian(0, spread);
  const z = dir[2] + rng.gaussian(0, spread);
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

function unitVector(rng: Rng): [number, number, number] {
  // Uniform on the sphere.
  const y = rng.range(-1, 1);
  const a = rng.range(0, Math.PI * 2);
  const s = Math.sqrt(1 - y * y);
  return [s * Math.cos(a), y, s * Math.sin(a)];
}

// --- How hot the blast leaves it (see docs/research/shattered-planets.md) ---

/** Specific energies of forsterite (Mg₂SiO₄), the mantle's main mineral, J/kg. See docs/research/shattered-planets.md. */
export const ROCK = {
  /** Heating from 300 K to the melting point (Dulong–Petit heat capacity, 1241 J/kg/K) plus fusion (142 kJ/mol, Richet et al. 1993). */
  meltEnergy: 3.32e6,
  /**
   * Turning the melt to vapour in vacuum: twice the latent heat of 50% vaporisation at the triple point,
   * 2163 K × (7616 − 3474) J/K/kg (Davies et al. 2020, Table 6).
   */
  vapourEnergy: 17.9e6,
  /** Triple point (≈ melting point) and critical point, K (Davies et al. 2021). */
  triplePoint: 2163,
  criticalPoint: 6240,
};

/** Below this, solids don't visibly glow: the Draper point, 798 K. */
export const DRAPER_POINT = 798;

export const blastParams = {
  /**
   * Share of the energy that disperses the body (its gravitational binding energy) that ends up as heat on top.
   * Stylised (an open question): it puts an Earth a third vaporised, Mars half molten and the Moon barely warm.
   */
  heatShare: 0.25,
  /** A crust's hot area once it has formed: 3.6% of a Hawaiian flow's surface still glowed after emplacement. */
  hotArea: 0.036,
  /** Seconds (game time, compressed from hours) for the melt's surface to crust over. */
  crustTime: 6,
  /** Seconds (game time) for a molten droplet to lose a fifth of its temperature (a real millimetre droplet: about a second). */
  dropletTime: 1.5,
  /** Seconds (game time) for the vapour cloud to double its size (real: about ten minutes for an Earth at escape speed). */
  vapourTime: 8,
};

/** What the blast does to a body: how much of it melts and vaporises, and whether it was gas to begin with. */
export interface DebrisLook {
  /** Heat per kg the blast leaves (J/kg). */
  heat: number;
  /** Share of the rock that melts (0–1): how much of the rubble glows, and how many droplets. */
  melt: number;
  /** Share of the rock that vaporises (0–1): the glowing cloud, and fewer rocks. */
  vapour: number;
  /** A giant: all gas (no rocks), a cloud that lingers. */
  gas: boolean;
  /** The vapour's temperature as it's released (K): hotter the more energy is left after vaporising it. */
  vapourTemperature: number;
}

/**
 * The blast's heat from a body's escape velocity (km/s): the binding energy per kg of a uniform sphere,
 * (3/5) GM/R = (3/10) v_esc², times `heatShare`. Earth: 0.3 × 11.19² = 37.5 MJ/kg of binding energy.
 */
export function blastHeat(escapeVelocity: number, p = blastParams): number {
  const v = escapeVelocity * 1000;
  return p.heatShare * 0.3 * v * v;
}

/** What the renderers know of a body: enough to tell its real size and mass (see gen/climate.ts). */
export interface BlastBody {
  radius: number;
  type: string;
  size?: SizeClass | null;
  bands?: readonly string[] | null;
  climate?: { escapeVelocity: number } | null;
}

/** `debrisLook` for a body: its escape velocity from its climate, or else from its size (giants are all gas). */
export function debrisLookFor(body: BlastBody, p = blastParams): DebrisLook {
  const gas = (body.bands?.length ?? 0) > 0;
  let v = body.climate?.escapeVelocity;
  if (v === undefined) {
    const R = earthRadii(body.radius);
    const giant = body.size === 'gasGiant' || body.size === 'iceGiant';
    const M = bodyMass(R, !giant && body.type === 'ice', body.size === 'gasGiant');
    v = EARTH_ESCAPE_VELOCITY * Math.sqrt(M / R);
  }
  return debrisLook(v, gas, p);
}

export function debrisLook(escapeVelocity: number, gas: boolean, p = blastParams): DebrisLook {
  const heat = blastHeat(escapeVelocity, p);
  const melt = gas ? 1 : Math.min(1, heat / ROCK.meltEnergy);
  const spare = Math.max(0, heat - ROCK.meltEnergy);
  const vapour = gas ? 1 : Math.min(1, spare / ROCK.vapourEnergy);
  // What's left after vaporising it all heats the vapour, up to the critical point (supercritical beyond).
  const left = Math.max(0, spare - ROCK.vapourEnergy);
  const vapourTemperature = Math.min(ROCK.criticalPoint, ROCK.triplePoint + left / (1.35 * 1241));
  return { heat, melt, vapour, gas, vapourTemperature: gas ? ROCK.criticalPoint : vapourTemperature };
}

/** Share of a chunk's surface still glowing `t` seconds after the blast: all of its melt at first, crusting over to `hotArea`. */
export function hotArea(t: number, melt: number, p = blastParams): number {
  if (t <= 0) return 0;
  return melt * (p.hotArea + (1 - p.hotArea) * Math.exp(-t / p.crustTime));
}

/**
 * A molten droplet's temperature `t` seconds after the blast: radiative cooling, dT/dt ∝ −T⁴, from the
 * triple point, T = T₀ (1 + t/τ)^(−1/3) (τ = `dropletTime` makes it lose about a fifth in τ).
 */
export function dropletTemperature(t: number, p = blastParams): number {
  return ROCK.triplePoint * Math.pow(1 + Math.max(0, t) / p.dropletTime, -1 / 3);
}

/**
 * The vapour cloud `t` seconds after the blast: its size (× its start) grows steadily, and as it expands
 * adiabatically (a monatomic gas, γ = 5/3, T ∝ V^(−2/3) ∝ size^(−2)) it cools; at the triple point it
 * condenses (to droplets and dust) and fades. A giant's gas lingers as a thin cloud.
 */
export function vapourState(t: number, look: DebrisLook, p = blastParams): { size: number; temperature: number; density: number } {
  if (t <= 0 || look.vapour <= 0) return { size: 1, temperature: 0, density: 0 };
  const size = 1 + t / p.vapourTime;
  const temperature = look.vapourTemperature / (size * size);
  // Thinner as it spreads (∝ 1/size³), and gone once condensed, but for a giant's own gas.
  const condensed = temperature < ROCK.triplePoint ? Math.max(0, 1 - (ROCK.triplePoint - temperature) / 1500) : 1;
  const density = look.vapour * Math.max(look.gas ? 0.25 : 0, condensed / (size * size * size));
  return { size, temperature, density };
}

/**
 * Blackbody colour (linear RGB with sRGB primaries, 0–1, brightest channel 1) of temperature `T` K:
 * Mitchell Charity's table (CIE 1964 10° observer), interpolated in log T. Below 1000 K, the 1000 K colour (its brightness says how much it glows).
 */
export function glowColor(T: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const table = BLACKBODY;
  const t = Math.min(Math.max(T, table[0]![0]), table[table.length - 1]![0]);
  let i = 0;
  while (i < table.length - 2 && table[i + 1]![0] < t) i++;
  const [t0, r0, g0, b0] = table[i]!;
  const [t1, r1, g1, b1] = table[i + 1]!;
  const f = Math.log(t / t0) / Math.log(t1 / t0);
  out[0] = r0 + (r1 - r0) * f;
  out[1] = g0 + (g1 - g0) * f;
  out[2] = b0 + (b1 - b0) * f;
  return out;
}

/**
 * How bright a glow at `T` K is, relative to melt at the triple point: the visible power (Charity's table,
 * ∝ T^~10 in this range) compressed to its fourth root so the screen can show it; 0 below the Draper point.
 */
export function glowBrightness(T: number): number {
  if (T <= DRAPER_POINT) return 0;
  const power = (k: number) => {
    // log-log interpolation of the table's power column
    const table = BLACKBODY;
    const x = Math.min(Math.max(k, table[0]![0]), table[table.length - 1]![0]);
    let i = 0;
    while (i < table.length - 2 && table[i + 1]![0] < x) i++;
    const a = table[i]!;
    const b = table[i + 1]!;
    const f = Math.log(x / a[0]) / Math.log(b[0] / a[0]);
    return Math.exp(Math.log(a[4]) + (Math.log(b[4]) - Math.log(a[4])) * f);
  };
  // Below 1000 K, fall to nothing at the Draper point.
  const fade = T < 1000 ? (T - DRAPER_POINT) / (1000 - DRAPER_POINT) : 1;
  return fade * Math.pow(power(T) / power(ROCK.triplePoint), 0.25);
}

/** Temperature (K), linear r, g, b (sRGB primaries, 0–1) and visible power (arbitrary units): Mitchell Charity's blackbody table (10° CMFs). */
const BLACKBODY: readonly (readonly [number, number, number, number, number])[] = [
  [1000, 1, 0.0401, 0, 2.525e6],
  [1200, 1, 0.086, 0, 1.314e8],
  [1500, 1, 0.1515, 0, 7.333e9],
  [1800, 1, 0.2097, 0, 1.118e11],
  [2000, 1, 0.2484, 0.0061, 4.431e11],
  [2200, 1, 0.293, 0.0257, 1.377e12],
  [2500, 1, 0.3577, 0.064, 5.422e12],
  [3000, 1, 0.4589, 0.1483, 2.939e13],
  [3500, 1, 0.5515, 0.252, 9.939e13],
  [4000, 1, 0.6354, 0.3684, 2.496e14],
  [5000, 1, 0.7792, 0.618, 9.17e14],
  [6000, 1, 0.8952, 0.8666, 2.208e15],
  [6500, 1, 0.9445, 0.9853, 3.108e15],
];
