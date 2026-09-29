import type { ClimateData } from './climate';
import { detailedTerrain } from './noise';
import type { PlanetStyle } from './planets';
import { Rng, hashSeed } from './rng';
import type { Vec3Tuple } from './starActivity';

/*
 * How a lava sea lives: the pace of its flow and its eruptions. Pure data and
 * maths; the views are world/LavaLook.ts (the animated sea) and
 * planet/LavaEruptions.ts (the blobs thrown up in low orbit).
 *
 * Eruptions come from vents at seeded points in the lava seas. Like the
 * stars' storms (gen/starActivity.ts) they sit on a grid of time slots per
 * kind, at most one event per slot, each decided by its own seeded stream, so
 * what is erupting at any moment is known without replaying the past.
 *
 * Blobs fly on ballistic arcs over the sphere (see `ballisticPoint`). The
 * sizes are stylised, not real: an Io lava fountain is ~1.5 km tall, which at
 * the planet level's 64 km per unit would be invisible, and a real arc on a
 * small moon would take minutes. What is kept is the trend with gravity:
 * weaker gravity throws higher and slower. The arcs' gravity is √g (with a
 * floor), so for the same launch speed peaks and flight times both scale as
 * g^−½ instead of the physical 1/g, and peaks are capped at a fraction of the
 * body's radius (a small moon's fountains never tower over it). Sources
 * and the reference fountains: docs/research/lava.md.
 */

export type EruptionKind = 'fountain' | 'eruption';

export interface EruptionSpec {
  /** Seconds per slot. */
  interval: number;
  /** Chance a slot has an event. */
  chance: number;
  /** How long the vent keeps throwing blobs, seconds. */
  life: readonly [number, number];
  /** Fastest launch speed range, planet-level units per second (blobs vary below it). */
  speed: readonly [number, number];
  /** Half-angle of the launch cone about the vertical, radians. */
  spread: number;
  /** Blobs per event. */
  particles: number;
  /** Eruptions: how long the hanging glow outlasts the last blob, seconds. */
  glow: number;
}

export interface LavaActivity {
  /** Speed of the sea's flow and crust drift (1 = default). */
  pace: number;
  /** Gravity in planet-level units per second². */
  gravity: number;
  /** The body's sea-level radius in planet-level units (where blobs land). */
  radius: number;
  /** Internal heat, 0–1 (climate.geothermal). */
  heat: number;
  /** Unit directions (body frame) of the vents, all in the lava seas. */
  vents: Vec3Tuple[];
  fountain: EruptionSpec;
  eruption: EruptionSpec;
}

/** The arcs' gravity at 1 g, planet-level units per second² (a 1 g fountain thrown at 4 u/s peaks 2.7 units up and lands after 2.7 s). */
export const LAVA_GRAVITY = 3;
/** Bodies weaker than this (in g) throw like this: small moons' arcs would otherwise take half a minute. */
export const MIN_ARC_GRAVITY = 0.2;
/** Blobs never climb higher than this fraction of the body's radius, per kind. */
export const MAX_PEAK_FRACTION: Record<EruptionKind, number> = { fountain: 0.12, eruption: 0.3 };

/** Launch speed of the fastest blobs at 1 g and full heat, planet-level units per second. */
const FOUNTAIN_SPEED = [3, 4.5] as const;
const ERUPTION_SPEED = [6.5, 9] as const;

/**
 * A lava body's activity. `style` gives the sea (vents go where the detailed
 * terrain is below sea level), `climate` the gravity and internal heat,
 * `radius` the sea-level radius in planet-level units.
 */
export function lavaActivity(seed: number, style: PlanetStyle, climate: ClimateData | null | undefined, radius: number): LavaActivity {
  const g = Math.max(MIN_ARC_GRAVITY, climate?.gravity ?? 1);
  // Lava bodies are ≥ 0.8 (a lava world's heat flow is at least Io's range, see climate.ts).
  const heat = climate?.geothermal ?? 0.9;
  const rng = new Rng(hashSeed(seed, 'lava'));
  const gravity = LAVA_GRAVITY * Math.sqrt(g);
  // Hotter bodies throw faster; capped so the peak stays under MAX_PEAK_FRACTION·R.
  const scale = 0.6 + 0.4 * heat;
  const speed = (range: readonly [number, number], kind: EruptionKind): [number, number] => {
    const cap = Math.sqrt(2 * gravity * MAX_PEAK_FRACTION[kind] * radius);
    return [Math.min(cap * 0.7, range[0] * scale), Math.min(cap, range[1] * scale)];
  };
  return {
    pace: 0.8 + 0.4 * heat,
    gravity,
    radius,
    heat,
    vents: placeVents(rng, seed, style, 6 + Math.round(6 * heat)),
    fountain: {
      interval: 2.5,
      chance: 0.5 + 0.45 * heat,
      life: [6, 14],
      speed: speed(FOUNTAIN_SPEED, 'fountain'),
      spread: 0.28,
      particles: Math.round(150 + 100 * heat),
      glow: 0,
    },
    eruption: {
      interval: 16,
      chance: 0.2 + 0.4 * heat,
      life: [2.5, 4],
      speed: speed(ERUPTION_SPEED, 'eruption'),
      spread: 0.45,
      particles: Math.round(160 + 120 * heat),
      glow: 7,
    },
  };
}

/** `count` vents at random points of the lava seas, a little clear of the shore. */
function placeVents(rng: Rng, seed: number, style: PlanetStyle, count: number): Vec3Tuple[] {
  const vents: Vec3Tuple[] = [];
  const below = style.seaLevel - 0.06;
  for (let tries = 0; vents.length < count && tries < 400; tries++) {
    const v = randomDirection(rng);
    if (detailedTerrain(v[0], v[1], v[2], seed) < below) vents.push(v);
  }
  return vents;
}

export interface EruptionEvent {
  kind: EruptionKind;
  /** Slot index; the event's identity. */
  index: number;
  /** System time the first blob is thrown, seconds. */
  start: number;
  /** How long the vent throws blobs. */
  life: number;
  /** When the last blob has landed (and an eruption's glow has faded). */
  end: number;
  /** Which of `LavaActivity.vents`, and its direction. */
  vent: number;
  origin: Vec3Tuple;
  /** Fastest launch speed. */
  speed: number;
  spread: number;
  particles: number;
  /** Seeds the per-blob scatter. */
  seed: number;
}

/** Longest a `kind` event can last, from its start to its end. */
export function eruptionSpan(activity: LavaActivity, kind: EruptionKind): number {
  const spec = activity[kind];
  return spec.life[1] + flightTime(spec.speed[1], activity.gravity) + spec.glow;
}

/** The event in slot `index` of `kind` for the body with `seed`, or null if the slot is empty. */
export function eruptionEvent(activity: LavaActivity, seed: number, kind: EruptionKind, index: number): EruptionEvent | null {
  const spec = activity[kind];
  const rng = new Rng(hashSeed(seed, 'eruption', kind, index));
  if (activity.vents.length === 0 || spec.particles === 0 || !rng.chance(spec.chance)) return null;
  const start = (index + rng.next()) * spec.interval;
  const life = rng.range(spec.life[0], spec.life[1]);
  const speed = rng.range(spec.speed[0], spec.speed[1]);
  const vent = rng.int(0, activity.vents.length - 1);
  return {
    kind,
    index,
    start,
    life,
    end: start + life + flightTime(speed, activity.gravity) + spec.glow,
    vent,
    origin: activity.vents[vent]!,
    speed,
    spread: spec.spread,
    particles: spec.particles,
    seed: rng.int(0, 2 ** 31),
  };
}

/** The slot range [first, last] whose `kind` events can be under way at some time in [from, to]. */
export function eruptionSlots(activity: LavaActivity, kind: EruptionKind, from: number, to: number): [number, number] {
  const { interval } = activity[kind];
  return [Math.floor((from - eruptionSpan(activity, kind)) / interval), Math.floor(to / interval)];
}

/**
 * How brightly the vent of `event` glows at `time`, 0 when it's quiet: a
 * fountain swells, flickers and dies down; an eruption flares at once and its
 * glow hangs, fading, after the blobs have landed.
 */
export function eruptionGlow(event: EruptionEvent, time: number): number {
  const age = time - event.start;
  if (age < 0 || time >= event.end) return 0;
  if (event.kind === 'fountain') {
    const env = smoothstep(0, 1.5, age) * (1 - smoothstep(event.life - 1.5, event.life + 0.5, age));
    return 0.5 * env * (0.8 + 0.2 * Math.sin(age * 7.3 + event.index) * Math.sin(age * 3.1));
  }
  const rise = smoothstep(0, 0.3, age);
  const fade = 1 - smoothstep(0, event.end - event.start, age);
  return 1.6 * rise * fade * fade;
}

// --- Ballistic arcs over the sphere ---

/** Seconds from launch until a blob thrown up at `up` units/s lands back at launch height. */
export function flightTime(up: number, gravity: number): number {
  return (2 * up) / gravity;
}

/** Highest point above the launch height, for vertical launch speed `up`. */
export function peakHeight(up: number, gravity: number): number {
  return (up * up) / (2 * gravity);
}

/**
 * Where a blob is `t` seconds after launch from the unit direction `origin`
 * on a sphere of `radius`, thrown at `up` units/s vertically and `side`
 * units/s along the unit tangent `tangent`: it climbs and falls as
 * h = up·t − ½·g·t² while sliding round the sphere by side·t, so it lands
 * back on the surface after `flightTime`. The shader in
 * planet/LavaEruptions.ts mirrors this.
 */
export function ballisticPoint(
  origin: Vec3Tuple,
  tangent: Vec3Tuple,
  radius: number,
  up: number,
  side: number,
  gravity: number,
  t: number,
): Vec3Tuple {
  const h = up * t - 0.5 * gravity * t * t;
  const angle = (side * t) / radius;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r = radius + h;
  return [(origin[0] * c + tangent[0] * s) * r, (origin[1] * c + tangent[1] * s) * r, (origin[2] * c + tangent[2] * s) * r];
}

/**
 * A blob's launch: vertical and sideways speed (within the event's cone) and
 * the unit tangent it flies along, drawn from `rng`.
 */
export function launch(rng: Rng, event: EruptionEvent): { up: number; side: number; tangent: Vec3Tuple } {
  const speed = event.speed * rng.range(0.55, 1);
  const tilt = event.spread * Math.sqrt(rng.next());
  return { up: speed * Math.cos(tilt), side: speed * Math.sin(tilt), tangent: tangent(event.origin, rng.range(0, Math.PI * 2)) };
}

/**
 * Caches the events of a body's two kinds that are (or will soon be) under
 * way, spawning each slot as its time comes; a jump of the clock (back, or
 * far ahead) rebuilds it from the events alive then. `advance` reports the
 * new events so a view can write their blobs once.
 */
export class EruptionSchedule {
  /** Spawned events that haven't ended, oldest slot first per kind. */
  readonly events: EruptionEvent[] = [];
  private readonly next: Record<EruptionKind, number> = { fountain: 0, eruption: 0 };
  private last = Number.NaN;

  constructor(
    readonly activity: LavaActivity,
    readonly seed: number,
    /** A clock step bigger than this forward, or `maxBack` back, is a jump. */
    private readonly maxStep = 2,
    private readonly maxBack = 0.1,
  ) {}

  /**
   * Moves to `time`: drops ended events and spawns the slots that opened
   * (their events may start later in the slot). Returns true if the clock
   * jumped and everything was rebuilt; `onSpawn` sees every new event.
   */
  advance(time: number, onSpawn?: (event: EruptionEvent) => void): boolean {
    const jumped = this.jumps(time);
    if (jumped) {
      this.events.length = 0;
      for (const kind of KINDS) this.next[kind] = eruptionSlots(this.activity, kind, time, time)[0];
    }
    this.last = time;
    let kept = 0;
    for (const e of this.events) if (e.end > time) this.events[kept++] = e;
    this.events.length = kept;
    for (const kind of KINDS) {
      const { interval } = this.activity[kind];
      let slot = this.next[kind];
      for (; slot * interval <= time; slot++) {
        const event = eruptionEvent(this.activity, this.seed, kind, slot);
        if (event && event.end > time) {
          this.events.push(event);
          onSpawn?.(event);
        }
      }
      this.next[kind] = slot;
    }
    return jumped;
  }

  /** True if moving to `time` would be a jump (a rebuild from the events alive then). */
  jumps(time: number): boolean {
    return !(time >= this.last - this.maxBack && time - this.last <= this.maxStep);
  }
}

/** Most blobs a body's eruptions can have in flight or waiting at once (an upper bound, for sizing a pool). */
export function maxEruptionParticles(activity: LavaActivity): number {
  let n = 0;
  for (const kind of KINDS) {
    const spec = activity[kind];
    if (spec.particles === 0 || spec.chance === 0) continue;
    // One event per slot; its blobs are written when the slot opens and last until the event ends.
    n += (Math.ceil(eruptionSpan(activity, kind) / spec.interval) + 2) * spec.particles;
  }
  return n;
}

const KINDS: readonly EruptionKind[] = ['fountain', 'eruption'];

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A uniformly random unit vector. */
export function randomDirection(rng: Rng): Vec3Tuple {
  const y = rng.range(-1, 1);
  const lon = rng.range(0, Math.PI * 2);
  const r = Math.sqrt(1 - y * y);
  return [r * Math.cos(lon), y, r * Math.sin(lon)];
}

/** A unit tangent to the unit sphere at `u`, at angle `angle` around it. */
export function tangent(u: Vec3Tuple, angle: number): Vec3Tuple {
  const ref: Vec3Tuple = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const d = ref[0] * u[0] + ref[1] * u[1] + ref[2] * u[2];
  let a: Vec3Tuple = [ref[0] - d * u[0], ref[1] - d * u[1], ref[2] - d * u[2]];
  const l = Math.hypot(a[0], a[1], a[2]);
  a = [a[0] / l, a[1] / l, a[2] / l];
  const b: Vec3Tuple = [u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0]];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s];
}
