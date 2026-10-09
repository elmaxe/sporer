import type { AnimalGait, AnimalPose, HerdPath } from './animals';
import { hashSeed } from './rng';

/*
 * Herds panicking (issue #156): an animal the ship comes too close to bolts,
 * and its herd with it. Herds otherwise walk as pure functions of the clock
 * (gen/animals.ts `HerdPath`); a panic is laid over that walk as an offset
 * along the ground, itself a function of the time since the herd was
 * startled: each animal freezes for its reaction time, gallops away from
 * the threat, stops, turns to watch it, and once it has gone (`hold` stops
 * being called) walks back to where its herd's walk has it, after which the
 * panic is over and nothing of it is left. So a herd far from the ship is
 * exactly where the clock says, and a panic never needs replaying.
 *
 * Real numbers (docs/research/animal-panic-and-calls.md): animals look up
 * at the alert distance, further out than the flight initiation distance
 * at which they flee (Ruddock & Whitfield's definitions); bulls kept a
 * constant distance from a trolley invading their flight zone (Kilgour
 * 1971), so a herd flees until it is that far again and runs again if
 * followed; and mammals of every size gallop at the same Froude number, 2–3
 * (Alexander 1984). Real flight distances (Dall's sheep fled helicopters
 * from up to ~3 km, Frid) would empty the planet in front of the UFO, so
 * the distances here are stylised to the scene: a few UFO widths.
 */

export const panicParams = {
  /** Animals bolt when the threat (the ship) comes within this many units of one of them (stylised, see above). */
  fleeRadius: 18,
  /** They look up, stop grazing, out to this many flee radii (alert distance > flight distance). */
  alertFactor: 2,
  /** How far they run: until this many flee radii from where the threat was (stylised). */
  fleeFactor: 1.6,
  /** The Froude number they gallop at: Alexander's asymmetric gaits, Fr 2–3. */
  fleeFroude: 2.5,
  /** Seconds to get up to speed or stop (stylised). */
  accel: 0.5,
  /** Each animal's reaction time, seconds: frozen, then off (stylised). */
  reactMin: 0.1,
  reactMax: 0.6,
  /** Each animal's flight turns this far either way from straight away (radians): the herd scatters a little. */
  scatter: 0.35,
  /** Seconds they keep watching after the threat has gone before walking back (stylised). */
  calm: 4,
};

/** Where a panic has an animal at a moment. */
export type PanicPhase = 'none' | 'startled' | 'fleeing' | 'watching' | 'returning';

/** One animal's part of a panic at a moment: its offset from where its herd's walk has it and its velocity (units, units/s, in the herd's tangent basis), the stride cycles the panic added, and its phase. */
export interface PanicState {
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  cycles: number;
  phase: PanicPhase;
  /** Seconds into the phase. */
  since: number;
}

/** A move of `distance` at top speed `speed`, reaching it and stopping over `accel` seconds (a triangle if too short to): its duration. */
export function moveDuration(distance: number, speed: number, accel: number): number {
  if (distance <= 0 || speed <= 0) return 0;
  const a = speed / Math.max(1e-3, accel);
  const ramp = Math.min(accel, Math.sqrt(distance / a));
  const peak = a * ramp;
  return 2 * ramp + (distance - a * ramp * ramp) / peak;
}

/** How far that move has gone `t` seconds in, and how fast it goes then (written to `out`). */
export function moveAt(distance: number, speed: number, accel: number, t: number, out: { d: number; v: number }): { d: number; v: number } {
  out.d = 0;
  out.v = 0;
  if (distance <= 0 || speed <= 0 || t <= 0) return out;
  const a = speed / Math.max(1e-3, accel);
  const ramp = Math.min(accel, Math.sqrt(distance / a));
  const peak = a * ramp;
  const reach = a * ramp * ramp * 0.5;
  const cruise = (distance - 2 * reach) / peak;
  const total = 2 * ramp + cruise;
  if (t < ramp) {
    out.d = 0.5 * a * t * t;
    out.v = a * t;
  } else if (t < ramp + cruise) {
    out.d = reach + peak * (t - ramp);
    out.v = peak;
  } else if (t < total) {
    const left = total - t;
    out.d = distance - 0.5 * a * left * left;
    out.v = a * left;
  } else out.d = distance;
  return out;
}

/** Galloping speed (units/s) for a gait: the same Froude number for every size (Alexander). */
export function fleeSpeed(gait: AnimalGait, p = panicParams): number {
  return Math.sqrt(p.fleeFroude * gait.g * gait.hip);
}

/** Which way member `k` turns round: its mother's way, if it has one. */
function side(mothers: ArrayLike<number> | null, k: number): number {
  const m = mothers?.[k] ?? -1;
  return m >= 0 ? m : k;
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * One herd's panic: when it was last startled, each animal's flight (a
 * reaction time, a direction scattered about straight away from the threat,
 * a distance) from where the last panic had it, and when it walks back.
 * `startle` (re)starts it, `hold` keeps it watching while the threat stays
 * near, `state` and `apply` say where each animal is; `over` once all have
 * walked back.
 */
export class HerdPanic {
  /** When it was last startled (seconds, the clock's), and when the walk back starts (pushed on by `hold`). */
  start = -Infinity;
  returnAt = Infinity;
  /** How many times it has been startled. */
  startles = 0;
  /** The last flight's direction, straight away from the threat (unit, tangent basis). */
  readonly away = { x: 1, y: 0 };
  private fleeEnd = -Infinity;
  private longestReturn = 0;
  private readonly o0: Float64Array;
  private readonly dir: Float64Array;
  private readonly dist: Float64Array;
  private readonly delay: Float64Array;
  private readonly c0: Float64Array;
  private readonly run: number;
  private readonly move = { d: 0, v: 0 };
  private readonly scratch: PanicState = { ox: 0, oy: 0, vx: 0, vy: 0, cycles: 0, phase: 'none', since: 0 };

  constructor(
    readonly seed: number,
    readonly count: number,
    readonly gait: AnimalGait,
    /** The adult each member keeps beside (-1: none; `HerdPath.mothers`): a young one runs where its mother runs. */
    readonly mothers: ArrayLike<number> | null = null,
    readonly params = panicParams,
  ) {
    this.o0 = new Float64Array(count * 2);
    this.dir = new Float64Array(count * 2);
    this.dist = new Float64Array(count);
    this.delay = new Float64Array(count);
    this.c0 = new Float64Array(count);
    this.run = fleeSpeed(gait, params);
  }

  /** True while any animal is still running away (a new `startle` does nothing until they stop). */
  fleeing(t: number): boolean {
    return t >= this.start && t < this.fleeEnd;
  }

  /** True once every animal is back where its herd's walk has it (or it never panicked). */
  over(t: number): boolean {
    return this.start === -Infinity || t >= this.returnAt + this.params.reactMax + this.longestReturn;
  }

  /**
   * Startles the herd at `t`: every animal flees `fleeFactor` flee radii from
   * where it is now (its offset carried over), along (`ax`, `ay`) (a unit
   * vector away from the threat in the herd's tangent basis) turned by up to
   * `scatter`. False (nothing changes) while they're still running.
   */
  startle(t: number, ax: number, ay: number): boolean {
    if (this.fleeing(t)) return false;
    const p = this.params;
    const s = this.scratch;
    for (let k = 0; k < this.count; k++) {
      this.state(k, t, s);
      this.o0[k * 2] = s.ox;
      this.o0[k * 2 + 1] = s.oy;
      this.c0[k] = s.cycles;
    }
    this.startles++;
    this.start = t;
    this.away.x = ax;
    this.away.y = ay;
    let fleeEnd = t;
    let longestReturn = 0;
    const range = p.fleeRadius * p.fleeFactor;
    for (let k = 0; k < this.count; k++) {
      // A young one runs with its mother: her way, as far, a moment after her.
      const m = this.mothers?.[k] ?? -1;
      const h = hashSeed(this.seed, 'panic', this.startles, m >= 0 ? m : k);
      const u1 = (h & 0x3ff) / 0x3ff;
      const u2 = ((h >>> 10) & 0x3ff) / 0x3ff;
      const u3 = ((h >>> 20) & 0x3ff) / 0x3ff;
      const delay = (this.delay[k] = p.reactMin + u1 * (p.reactMax - p.reactMin) + (m >= 0 ? 0.15 : 0));
      const turn = (u2 - 0.5) * 2 * p.scatter;
      const c = Math.cos(turn);
      const sn = Math.sin(turn);
      const dx = (this.dir[k * 2] = ax * c - ay * sn);
      const dy = (this.dir[k * 2 + 1] = ax * sn + ay * c);
      const d = (this.dist[k] = range * (0.85 + 0.3 * u3));
      fleeEnd = Math.max(fleeEnd, t + delay + moveDuration(d, this.run, p.accel));
      const ex = this.o0[k * 2]! + dx * d;
      const ey = this.o0[k * 2 + 1]! + dy * d;
      longestReturn = Math.max(longestReturn, moveDuration(Math.hypot(ex, ey), this.gait.walkSpeed, 2 * p.accel));
    }
    this.fleeEnd = fleeEnd;
    this.longestReturn = longestReturn;
    this.returnAt = fleeEnd + p.calm;
    return true;
  }

  /** The threat is still near at `t`: they keep watching it (until `calm` seconds after the last call) instead of walking back. */
  hold(t: number): void {
    if (this.start !== -Infinity && t < this.returnAt) this.returnAt = Math.max(this.returnAt, t + this.params.calm);
  }

  /** Animal `k`'s part of the panic at `t` (written to `out`). */
  state(k: number, t: number, out: PanicState): PanicState {
    out.ox = out.oy = out.vx = out.vy = out.cycles = out.since = 0;
    out.phase = 'none';
    if (this.start === -Infinity || k >= this.count) return out;
    const p = this.params;
    const { move } = this;
    const ox = this.o0[k * 2]!;
    const oy = this.o0[k * 2 + 1]!;
    const dx = this.dir[k * 2]!;
    const dy = this.dir[k * 2 + 1]!;
    const d = this.dist[k]!;
    const into = t - this.start - this.delay[k]!;
    if (into < 0) {
      out.ox = ox;
      out.oy = oy;
      out.cycles = this.c0[k]!;
      out.phase = 'startled';
      out.since = t - this.start;
      return out;
    }
    const flight = moveDuration(d, this.run, p.accel);
    if (into < flight) {
      moveAt(d, this.run, p.accel, into, move);
      out.ox = ox + dx * move.d;
      out.oy = oy + dy * move.d;
      out.vx = dx * move.v;
      out.vy = dy * move.v;
      out.cycles = this.c0[k]! + move.d / this.gait.trotStride;
      out.phase = 'fleeing';
      out.since = into;
      return out;
    }
    const ex = ox + dx * d;
    const ey = oy + dy * d;
    const fled = this.c0[k]! + d / this.gait.trotStride;
    const back = t - this.returnAt - this.delay[k]!;
    if (back < 0) {
      out.ox = ex;
      out.oy = ey;
      out.cycles = fled;
      out.phase = 'watching';
      out.since = into - flight;
      return out;
    }
    const length = Math.hypot(ex, ey);
    moveAt(length, this.gait.walkSpeed, 2 * p.accel, back, move);
    if (length < 1e-6 || move.d >= length) return out;
    const left = 1 - move.d / length;
    out.ox = ex * left;
    out.oy = ey * left;
    out.vx = (-ex / length) * move.v;
    out.vy = (-ey / length) * move.v;
    out.cycles = fled + move.d / this.gait.walkStride;
    out.phase = 'returning';
    out.since = back;
    return out;
  }

  /**
   * Moves `pose` (animal `k` of `path`'s herd at `t`, as the walk has it,
   * `path.speed` its speed) by the panic: where it is, which way it faces
   * (where it goes; watching, turned round towards the threat), how it moves
   * (strides, trot, head up). Returns its phase.
   */
  apply(path: HerdPath, k: number, t: number, pose: AnimalPose): PanicPhase {
    const s = this.state(k, t, this.scratch);
    if (s.phase === 'none') return 'none';
    const { e1, e2 } = path;
    const R = path.plan.radius;
    let x = pose.x + (e1.x * s.ox + e2.x * s.oy) / R;
    let y = pose.y + (e1.y * s.ox + e2.y * s.oy) / R;
    let z = pose.z + (e1.z * s.ox + e2.z * s.oy) / R;
    const l = Math.hypot(x, y, z);
    x /= l;
    y /= l;
    z /= l;
    // Its velocity: the walk's plus the panic's.
    const base = path.speed;
    let vx = pose.hx * base + e1.x * s.vx + e2.x * s.vy;
    let vy = pose.hy * base + e1.y * s.vx + e2.y * s.vy;
    let vz = pose.hz * base + e1.z * s.vx + e2.z * s.vy;
    const up = vx * x + vy * y + vz * z;
    vx -= up * x;
    vy -= up * y;
    vz -= up * z;
    const speed = Math.hypot(vx, vy, vz);
    // Its own size's gait, as `HerdPath.pose` has it.
    const size = path.scales[k] ?? 1;
    const root = Math.sqrt(size);
    const walk = this.gait.walkSpeed * root;
    let hx = pose.hx;
    let hy = pose.hy;
    let hz = pose.hz;
    if (speed > 0.2 * walk) {
      hx = vx / speed;
      hy = vy / speed;
      hz = vz / speed;
    } else if (s.phase === 'watching') {
      // Turned from the way it ran right round to face the threat (through its side: about the up axis).
      const ax = e1.x * this.away.x + e2.x * this.away.y;
      const ay = e1.y * this.away.x + e2.y * this.away.y;
      const az = e1.z * this.away.x + e2.z * this.away.y;
      const a = Math.PI * smoothstep(0, 1.5, s.since) * (side(this.mothers, k) % 2 === 0 ? 1 : -1);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      hx = ax * c + (y * az - z * ay) * sn;
      hy = ay * c + (z * ax - x * az) * sn;
      hz = az * c + (x * ay - y * ax) * sn;
    }
    const dot = hx * x + hy * y + hz * z;
    hx -= dot * x;
    hy -= dot * y;
    hz -= dot * z;
    const hl = Math.hypot(hx, hy, hz) || 1;
    pose.x = x;
    pose.y = y;
    pose.z = z;
    pose.hx = hx / hl;
    pose.hy = hy / hl;
    pose.hz = hz / hl;
    pose.trot = smoothstep(walk, this.gait.trotSpeed * root, speed);
    pose.stride = Math.min(1, speed / (walk * 0.6));
    pose.cycle += s.cycles / size;
    pose.graze = 0;
    return s.phase;
  }
}
