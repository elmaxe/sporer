import { Rng, hashSeed } from './rng';
import type { StarData } from './stars';

/*
 * How a star lives: surface look (granulation, spots, rotation, corona pulse)
 * and its storms (prominence loops and flares/CMEs). Pure data and maths; the
 * view is world/Star.ts. Everything is a function of the system clock, so a
 * star looks the same whenever you pose it at a given time.
 *
 * Storm events are placed on a grid of time slots per kind: slot i covers
 * [i·interval, (i+1)·interval) and holds at most one event, decided by its
 * own seeded stream. So the events alive at any time can be found without
 * replaying the past (fast-forwarding and the planet level's sky both jump).
 */

export type StormKind = 'prominence' | 'flare';

export interface StormSpec {
  /** Seconds per slot. */
  interval: number;
  /** Chance a slot has an event. */
  chance: number;
  /** Event duration range, seconds. */
  life: readonly [number, number];
  /**
   * Prominences: loop height in star radii. Flares: half-angle of the
   * ejection cone in radians.
   */
  size: readonly [number, number];
  /** Flares: outward speed in star radii per second (unused by prominences). */
  speed: readonly [number, number];
  /** Particles per event. */
  particles: number;
}

export interface StarActivity {
  /** Surface animation speed (granulation churn, corona flicker). */
  pace: number;
  /** Granulation cells' frequency on the unit sphere (low = giant cells). */
  granulation: number;
  /** Granulation brightness contrast, 0–1. */
  contrast: number;
  /** Sunspot coverage, 0 (none) to 1 (heavily spotted). */
  spots: number;
  /** Seconds per turn at the equator (higher latitudes lag behind). */
  rotationPeriod: number;
  /** Corona brightness pulse amplitude, and its period in seconds. */
  pulse: number;
  pulsePeriod: number;
  prominence: StormSpec;
  flare: StormSpec;
}

const NONE = [0, 0] as const;

/** Per-kind behaviour: dwarfs flicker fast and flare often and small, giants churn slowly and erupt big. */
export function starActivity(star: StarData): StarActivity {
  switch (star.kind) {
    case 'redDwarf':
      return {
        pace: 1.5,
        granulation: 16,
        contrast: 0.3,
        spots: 0.8,
        rotationPeriod: 40,
        pulse: 0.1,
        pulsePeriod: 5,
        prominence: { interval: 6, chance: 0.45, life: [5, 9], size: [0.15, 0.35], speed: NONE, particles: 160 },
        flare: { interval: 2.5, chance: 0.7, life: [1.5, 3], size: [0.25, 0.5], speed: [0.8, 1.6], particles: 120 },
      };
    case 'whiteDwarf':
      return {
        pace: 2.5,
        granulation: 22,
        contrast: 0.12,
        spots: 0,
        rotationPeriod: 10,
        pulse: 0.15,
        pulsePeriod: 2.5,
        prominence: { interval: 10, chance: 0, life: [1, 1], size: NONE, speed: NONE, particles: 0 },
        flare: { interval: 10, chance: 0.35, life: [1.2, 2.4], size: [0.3, 0.6], speed: [1.5, 2.5], particles: 90 },
      };
    case 'redGiant':
      return {
        pace: 0.3,
        granulation: 3.2,
        contrast: 0.55,
        spots: 0.25,
        rotationPeriod: 500,
        pulse: 0.12,
        pulsePeriod: 24,
        prominence: { interval: 14, chance: 0.6, life: [25, 40], size: [0.3, 0.7], speed: NONE, particles: 320 },
        flare: { interval: 25, chance: 0.5, life: [14, 22], size: [0.35, 0.6], speed: [0.08, 0.15], particles: 480 },
      };
    case 'blueGiant':
      return {
        pace: 0.6,
        granulation: 6,
        contrast: 0.2,
        spots: 0,
        rotationPeriod: 150,
        pulse: 0.08,
        pulsePeriod: 12,
        prominence: { interval: 12, chance: 0.4, life: [14, 24], size: [0.3, 0.6], speed: NONE, particles: 280 },
        flare: { interval: 5, chance: 0.7, life: [8, 12], size: [0.3, 0.5], speed: [0.25, 0.45], particles: 280 },
      };
    case 'mainSequence':
      return mainSequence(star.spectralClass);
  }
}

function mainSequence(cls: StarData['spectralClass']): StarActivity {
  // Hot, massive stars have no convective spots; cooler ones get more.
  const hot = cls === 'O' || cls === 'B';
  const spots = hot ? 0 : cls === 'A' ? 0.05 : cls === 'F' ? 0.3 : cls === 'G' ? 0.5 : 0.6;
  return {
    pace: hot ? 0.7 : cls === 'A' ? 0.85 : 1,
    granulation: hot ? 7 : cls === 'K' ? 15 : 13,
    contrast: hot ? 0.22 : cls === 'A' ? 0.25 : 0.35,
    spots,
    rotationPeriod: hot ? 60 : 90,
    pulse: 0.07,
    pulsePeriod: 8,
    prominence: {
      interval: hot ? 5 : 3,
      chance: hot ? 0.6 : 0.8,
      life: [8, 14],
      size: [0.25, 0.6],
      speed: NONE,
      particles: 240,
    },
    flare: {
      interval: hot ? 6 : 9,
      chance: hot ? 0.6 : 0.5,
      life: [3.5, 6],
      size: [0.25, 0.5],
      speed: [0.4, 0.8],
      particles: 200,
    },
  };
}

export type Vec3Tuple = [number, number, number];

export interface StormEvent {
  kind: StormKind;
  /** Slot index; the event's identity. */
  index: number;
  /** System time it starts, seconds. */
  start: number;
  life: number;
  /** Unit vector (star-local): prominence footpoint or flare origin. */
  origin: Vec3Tuple;
  /** Prominences: the other footpoint (unit). Flares: the ejection axis (= origin). */
  end: Vec3Tuple;
  /** See `StormSpec.size`. */
  size: number;
  speed: number;
  particles: number;
  /** Seeds the per-particle scatter. */
  seed: number;
}

/** The event in slot `index` of `kind` for the star with `seed`, or null if the slot is empty. */
export function stormEvent(activity: StarActivity, seed: number, kind: StormKind, index: number): StormEvent | null {
  const spec = activity[kind];
  const rng = new Rng(hashSeed(seed, kind, index));
  if (spec.particles === 0 || !rng.chance(spec.chance)) return null;
  const life = rng.range(spec.life[0], spec.life[1]);
  // Starts anywhere in its slot.
  const start = (index + rng.next()) * spec.interval;
  // Activity belts: mostly low latitudes.
  const origin = activeRegion(rng);
  let end: Vec3Tuple = origin;
  if (kind === 'prominence') {
    // The second footpoint 0.15–0.45 rad away, in a random direction.
    const t = tangent(origin, rng.range(0, Math.PI * 2));
    const span = rng.range(0.15, 0.45);
    end = normalize([
      origin[0] * Math.cos(span) + t[0] * Math.sin(span),
      origin[1] * Math.cos(span) + t[1] * Math.sin(span),
      origin[2] * Math.cos(span) + t[2] * Math.sin(span),
    ]);
  }
  return {
    kind,
    index,
    start,
    life,
    origin,
    end,
    size: rng.range(spec.size[0], spec.size[1]),
    speed: rng.range(spec.speed[0], spec.speed[1]),
    particles: spec.particles,
    seed: rng.int(0, 2 ** 31),
  };
}

/** The slot range [first, last] whose events can be alive at some time in [from, to]. */
export function stormSlots(spec: StormSpec, from: number, to: number): [number, number] {
  return [Math.floor((from - spec.life[1]) / spec.interval), Math.floor(to / spec.interval)];
}

/** True if `event` is under way at `time`. */
export function stormAlive(event: StormEvent, time: number): boolean {
  return time >= event.start && time < event.start + event.life;
}

/** Most particles a star's storms can hold at once (an upper bound, for sizing the pool). */
export function maxStormParticles(activity: StarActivity): number {
  let n = 0;
  for (const spec of [activity.prominence, activity.flare]) {
    if (spec.particles === 0 || spec.chance === 0) continue;
    // One event per slot. The pool takes a slot's particles when the slot opens and
    // they last until its event ends, up to one interval + one lifetime later.
    n += (Math.ceil(spec.life[1] / spec.interval) + 2) * spec.particles;
  }
  return n;
}

function activeRegion(rng: Rng): Vec3Tuple {
  const lat = Math.max(-1.2, Math.min(1.2, rng.gaussian(0, 0.4)));
  const lon = rng.range(0, Math.PI * 2);
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
}

/** A unit tangent to the unit sphere at `u`, at angle `angle` around it. */
function tangent(u: Vec3Tuple, angle: number): Vec3Tuple {
  // Any vector not parallel to u, then Gram–Schmidt.
  const ref: Vec3Tuple = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const d = ref[0] * u[0] + ref[1] * u[1] + ref[2] * u[2];
  const a = normalize([ref[0] - d * u[0], ref[1] - d * u[1], ref[2] - d * u[2]]);
  const b: Vec3Tuple = [u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0]];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s];
}

function normalize(v: Vec3Tuple): Vec3Tuple {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
