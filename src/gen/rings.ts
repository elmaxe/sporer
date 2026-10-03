/*
 * A ring system's structure, and the rocks and ice chunks it is made of up
 * close (issue #72). Pure data, no THREE; unit-tested in tests/rings.test.ts.
 *
 * The flat ring (world/planetGeometry.ts createRings) draws the radial
 * profile: how opaque and how bright the ring is from its inner to its outer
 * edge. Near the camera in low orbit the same profile decides how many rocks
 * there are (planet/RingRocks.ts), so the gaps are gaps in both.
 *
 * The rocks follow the real rings' size distribution, n(a) ∝ a^-3 (see
 * docs/research/rings.md): integrated over an octave of size (a to 2a), that
 * is 4× fewer rocks per area than in the octave below. Shown out to a
 * distance proportional to their size (so every rock is about as big on
 * screen when it appears), each octave then has the same number of rocks in
 * view: 4× fewer per area over 4× the area. So octave k is a grid of cells
 * `cellSize(k)` across, twice the size of the octave below's, with the same
 * few rocks tried in each, shown out to `octaveReach(k)`, a fixed number of
 * cells. Nothing is stored: a cell's rocks come from its address and the
 * ring's seed alone.
 *
 * The rocks orbit: each ring of cells (an annulus one cell wide) turns about
 * the planet's axis at its own rate, slower further out (Kepler's Ω ∝ r^-1.5,
 * at a stylised speed), so the rocks of a cell stay in it and the choice of
 * what's near holds at any time.
 */

import type { RingData } from './system';
import { Rng, hashSeed } from './rng';

export interface RingSample {
  /** How much of the ring's opacity this part has (0–1). */
  alpha: number;
  /** Brightness factor of the ring's colour here. */
  light: number;
}

/** Samples of a generated ring's profile (seeded gaps and brightness), evenly spaced from the inner to the outer edge. */
const PROFILE_SAMPLES = 16;
/** Without a real profile, the inner and outer edges fade over this share of the ring's width. */
const EDGE_FADE = 1 / 8;

/**
 * The ring's radial profile: a real ring's own (Saturn's, Uranus's) or seeded
 * gaps and bands. The same `seed` always gives the same profile.
 */
export function ringProfile(rings: RingData, seed: number): readonly RingSample[] {
  if (rings.profile) return rings.profile;
  const rng = new Rng(hashSeed(seed, 'rings'));
  return Array.from({ length: PROFILE_SAMPLES }, () => ({
    alpha: rng.chance(0.15) ? 0.1 : rng.range(0.5, 1),
    light: rng.range(0.75, 1.15),
  }));
}

/**
 * The ring at `t` (0 at its inner edge, 1 at its outer) written into `out`:
 * its opacity (the profile's, times the ring's `opacity`, faded at the edges
 * of a generated ring) and brightness. Allocation-free.
 */
export function ringAt(rings: RingData, profile: readonly RingSample[], t: number, out: RingSample): RingSample {
  if (!(t >= 0 && t <= 1)) {
    out.alpha = 0;
    out.light = 1;
    return out;
  }
  const f = t * (profile.length - 1);
  const i = Math.floor(f);
  const a = profile[i]!;
  const b = profile[Math.min(i + 1, profile.length - 1)]!;
  const w = f - i;
  const edge = rings.profile ? 1 : Math.min(1, t / EDGE_FADE, (1 - t) / EDGE_FADE);
  out.alpha = rings.opacity * (a.alpha + (b.alpha - a.alpha) * w) * edge;
  out.light = a.light + (b.light - a.light) * w;
  return out;
}

export const ringRockParams = {
  /** The smallest rocks' radius, planet units (the UFO is ~4 wide)... */
  minSize: 0.3,
  /** ...and how many octaves of size there are above it (each twice the one below; a rock is 1–2× its octave's size). */
  octaves: 5,
  /** A rock is shown out to this many times its octave's size (about 5 px across at 720p, then it shrinks away). */
  reach: 120,
  /** Cells across a rock's reach: an octave's cells are `reach / cells` times its size. */
  cells: 8,
  /** Rocks tried per cell, each kept with the ring's opacity there. */
  perCell: 5,
  /** Half the thickness of the layer of rocks, planet units (stylised: the real rings are ~10 m thick). */
  thickness: 6,
  /** How fast the rocks at the ring's inner edge orbit, planet units per second (stylised); slower further out. */
  speed: 3,
  /** Fastest tumble, radians per second, of the smallest rocks (bigger ones turn slower, ∝ 1/√size). */
  spin: 0.8,
  /** Most rocks drawn at once: the biggest octaves are chosen first, so a budget cut thins the gravel nearest the camera. */
  maxRocks: 6000,
};

export type RingRockParams = typeof ringRockParams;

/** Octave `k`'s size: rocks' radii are 1–2× this. */
export function octaveSize(k: number, p: RingRockParams = ringRockParams): number {
  return p.minSize * 2 ** k;
}

/** How far octave `k`'s rocks are shown from the camera. */
export function octaveReach(k: number, p: RingRockParams = ringRockParams): number {
  return octaveSize(k, p) * p.reach;
}

/** Octave `k`'s cells' size, radially and round the ring. */
export function cellSize(k: number, p: RingRockParams = ringRockParams): number {
  return octaveReach(k, p) / p.cells;
}

/** How far out any rock is shown: the biggest octave's reach. */
export function maxReach(p: RingRockParams = ringRockParams): number {
  return octaveReach(p.octaves - 1, p);
}

/**
 * Angular speed (radians per second) of the rocks at radius `r` in a ring
 * starting at `inner`: `speed` at the inner edge, Ω ∝ r^-1.5 outwards
 * (Kepler), turning the planet's way (`direction` ±1).
 */
export function orbitRate(r: number, inner: number, direction: number, p: RingRockParams = ringRockParams): number {
  return (direction * p.speed * Math.pow(inner / r, 1.5)) / inner;
}

/** One rock, as `ringRocksNear` hands it out (the same object, rewritten for the next). */
export interface RingRock {
  /** Distance from the planet's axis. */
  radius: number;
  /** Angle about the axis at time 0 (radians; the point is (r cos a, height, −r sin a), so a growing angle turns about +y). */
  angle: number;
  /** Radians per second about the axis. */
  rate: number;
  /** Above (+) or below the ring plane. */
  height: number;
  /** Its radius. */
  size: number;
  /** How far from the camera it's shown (its octave's reach). */
  reach: number;
  /** Tumbling axis (unit) and speed, radians per second. */
  axisX: number;
  axisY: number;
  axisZ: number;
  spin: number;
  /** Ice (vs rock): drawn paler and shinier. */
  ice: boolean;
  /** Which of the view's shapes (0 to SHAPES − 1 within rock or ice). */
  shape: number;
  /** Brightness: the profile's here, varied per rock. */
  light: number;
  /** Its octave, and a number unique to it in the ring (for tests). */
  octave: number;
  id: number;
}

/** Shapes per material in the view (rock or ice). */
export const RING_ROCK_SHAPES = 2;

/** A ring's rocks: how icy, which way they turn, and the profile. */
export interface RingRockField {
  rings: RingData;
  profile: readonly RingSample[];
  seed: number;
  /** Share of the rocks that are ice (0–1, see `iceShare`). */
  ice: number;
  /** +1 turning about +y (with a planet spinning that way), −1 the other way. */
  direction: number;
}

/** A ring's rocks from its data and the planet's seed and spin (rings turn the way their planet spins); how icy from `rings.ice`, else its colour. */
export function ringRockField(rings: RingData, seed: number, spin: number): RingRockField {
  return { rings, profile: ringProfile(rings, seed), seed: hashSeed(seed, 'ring rocks'), ice: rings.ice ?? iceShare(rings.color), direction: spin < 0 ? -1 : 1 };
}

/**
 * How much of a ring is ice, from how bright its colour is: Saturn's bright
 * rings are almost all water ice, Uranus's dark ones barely any (see
 * docs/research/rings.md). `color` is '#rrggbb'.
 */
export function iceShare(color: string): number {
  const n = Number.parseInt(color.replace('#', ''), 16);
  if (!Number.isFinite(n)) return 0.5;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
  const t = Math.min(1, Math.max(0, (lightness - 0.35) / 0.4));
  return 0.1 + 0.85 * t * t * (3 - 2 * t);
}

/** The camera, in the ring's frame (y along the planet's axis). */
export interface RingEye {
  x: number;
  y: number;
  z: number;
}

/** The point of `rock` at time `time` (in the ring's frame), written into `out`. What the view's shader does. */
export function ringRockPosition(rock: RingRock, time: number, out: RingEye): RingEye {
  const a = rock.angle + rock.rate * time;
  out.x = rock.radius * Math.cos(a);
  out.y = rock.height;
  out.z = -rock.radius * Math.sin(a);
  return out;
}

/** True when nothing of the ring's rocks can be within reach of `eye`: skip the search. */
export function ringOutOfReach(field: RingRockField, eye: RingEye, p: RingRockParams = ringRockParams): boolean {
  const reach = maxReach(p) + cellSize(p.octaves - 1, p) + p.thickness;
  const r = Math.hypot(eye.x, eye.z);
  return Math.abs(eye.y) > reach || r < field.rings.inner - reach || r > field.rings.outer + reach;
}

const rock: RingRock = {
  radius: 0,
  angle: 0,
  rate: 0,
  height: 0,
  size: 0,
  reach: 0,
  axisX: 0,
  axisY: 1,
  axisZ: 0,
  spin: 0,
  ice: false,
  shape: 0,
  light: 1,
  octave: 0,
  id: 0,
};
const sample: RingSample = { alpha: 0, light: 1 };
const at: RingEye = { x: 0, y: 0, z: 0 };

/**
 * Hands `visit` every rock within its octave's reach (plus `margin` times its
 * cell size, for the camera and the rocks moving until the next search) of
 * `eye` at time `time`, the biggest octaves first; stops after `limit` (or
 * when `visit` returns false). The rock object is reused: copy what you keep.
 * Allocation-free. Returns how many were visited.
 */
export function ringRocksNear(
  field: RingRockField,
  eye: RingEye,
  time: number,
  visit: (rock: RingRock) => boolean | void,
  margin = 1,
  limit = Infinity,
  p: RingRockParams = ringRockParams,
): number {
  if (ringOutOfReach(field, eye, p)) return 0;
  const { inner, outer } = field.rings;
  const width = outer - inner;
  const eyeR = Math.hypot(eye.x, eye.z);
  const eyeAngle = Math.atan2(-eye.z, eye.x);
  let count = 0;
  for (let k = p.octaves - 1; k >= 0; k--) {
    const cell = cellSize(k, p);
    const size = octaveSize(k, p);
    const reach = octaveReach(k, p);
    const within = reach + margin * cell;
    const dy = Math.max(0, Math.abs(eye.y) - p.thickness);
    if (dy > within) continue;
    // How far across the ring plane a rock can be and still be within reach.
    const across = Math.sqrt(within * within - dy * dy);
    const rings = Math.ceil(width / cell);
    const first = Math.max(0, Math.floor((eyeR - across - inner) / cell));
    const last = Math.min(rings - 1, Math.floor((eyeR + across - inner) / cell));
    for (let i = first; i <= last; i++) {
      const r0 = inner + i * cell;
      const centre = Math.min(outer, r0 + cell / 2);
      const around = Math.max(1, Math.round((2 * Math.PI * centre) / cell));
      const step = (2 * Math.PI) / around;
      const rate = orbitRate(centre, inner, field.direction, p);
      // The eye's angle in this annulus's turning frame, and how far round the reach goes.
      const turned = eyeAngle - rate * time;
      const half = across >= eyeR + r0 ? Math.PI : Math.min(Math.PI, Math.asin(Math.min(1, across / Math.max(r0, 1e-6))) + step);
      let j0 = Math.floor((turned - half) / step);
      let j1 = Math.floor((turned + half) / step);
      if (j1 - j0 + 1 > around) {
        j0 = 0;
        j1 = around - 1;
      }
      for (let jj = j0; jj <= j1; jj++) {
        const j = ((jj % around) + around) % around;
        let s = cellHash(field.seed, k, i, j);
        for (let n = 0; n < p.perCell; n++) {
          s = nextState(s);
          const r = r0 + cell * unit(s);
          s = nextState(s);
          const keep = unit(s);
          if (r > outer) continue;
          ringAt(field.rings, field.profile, (r - inner) / width, sample);
          // Draws for the rest come after the keep test, so a kept rock is the same whatever the opacity.
          s = nextState(s);
          const angle = (j + unit(s)) * step;
          s = nextState(s);
          const h = unit(s) + unit(nextState(s)) - 1;
          s = nextState(nextState(s));
          const grow = 1 + unit(s);
          s = nextState(s);
          const iceDraw = unit(s);
          s = nextState(s);
          const shapeDraw = unit(s);
          s = nextState(s);
          const lightDraw = unit(s);
          s = nextState(s);
          const z = 2 * unit(s) - 1;
          s = nextState(s);
          const phi = 2 * Math.PI * unit(s);
          s = nextState(s);
          const spinDraw = unit(s);
          if (keep >= sample.alpha) continue;
          rock.radius = r;
          rock.angle = angle;
          rock.rate = rate;
          rock.height = h * p.thickness;
          rock.size = size * grow;
          rock.reach = reach;
          // Is it within reach now?
          ringRockPosition(rock, time, at);
          const dx = at.x - eye.x;
          const dz = at.z - eye.z;
          const dyy = at.y - eye.y;
          if (dx * dx + dyy * dyy + dz * dz > within * within) continue;
          const xy = Math.sqrt(1 - z * z);
          rock.axisX = xy * Math.cos(phi);
          rock.axisY = z;
          rock.axisZ = xy * Math.sin(phi);
          rock.spin = (p.spin * (spinDraw * 2 - 1)) / Math.sqrt(rock.size / p.minSize);
          rock.ice = iceDraw < field.ice;
          rock.shape = Math.min(RING_ROCK_SHAPES - 1, Math.floor(shapeDraw * RING_ROCK_SHAPES));
          rock.light = sample.light * (0.8 + 0.4 * lightDraw);
          rock.octave = k;
          rock.id = ((k * 100_003 + i) * 1_000_003 + j) * 8 + n;
          count++;
          if (visit(rock) === false || count >= limit) return count;
        }
      }
    }
  }
  return count;
}

/** A cell's starting state, from the ring's seed and the cell's address (numbers only: no strings, nothing allocated). */
function cellHash(seed: number, k: number, i: number, j: number): number {
  let h = seed ^ 0x9e3779b9;
  h = Math.imul(h ^ (k + 0x7f4a7c15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (i * 0x27d4eb2d), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ (j * 0x165667b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The next state of a small counter-based generator (a splitmix32 step). */
function nextState(s: number): number {
  return (s + 0x6d2b79f5) >>> 0;
}

/** A state turned into a float in [0, 1) (mulberry32's output mix). */
function unit(s: number): number {
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
