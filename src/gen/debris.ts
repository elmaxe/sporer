import { hashSeed, Rng } from './rng';
import type { PlanetStyle } from './planets';

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
 */

/** The field's outer edge, in the body's radii (inside the nearest moon's orbit, 1.5 radii and more). */
export const DEBRIS_REACH = 1.4;
/** The dust goes a little further than the rocks. */
export const DUST_REACH = 1.6;

export const debrisParams = {
  /** Time constant of the blast's outward throw, seconds. */
  throwTime: 1.1,
  /** Seconds for the chunks' glow to fall to 1/e (they come out molten). */
  coolTime: 3.5,
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

export interface DebrisData {
  /** Biggest first. */
  chunks: DebrisChunk[];
  motes: DebrisMote[];
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

/** How hot the chunks still glow (1 → 0), `t` seconds after the blast. */
export function debrisHeat(t: number, p = debrisParams): number {
  return t <= 0 ? 0 : Math.exp(-t / p.coolTime);
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
