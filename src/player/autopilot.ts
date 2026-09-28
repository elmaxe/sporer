import type { Vec3Like } from '../gen/orbit';

export interface ArriveParams {
  /** Cruise speed relative to the target, units per second. */
  maxSpeed: number;
  /** Largest velocity change per second the autopilot may apply. */
  accel: number;
  /** How early to slow down: desired closing speed = distance * gain (1/s). */
  gain: number;
  /** The body's linear damping, compensated so the ship can hold cruise speed. */
  damping: number;
}

/**
 * "Arrive" steering towards a (possibly moving) target: aim for the target's
 * velocity plus a closing speed that shrinks near the destination, then take
 * the velocity change needed to get there, limited to `accel * dt`.
 * `remaining` is the distance left to the final destination when `target` is
 * only a waypoint on the way (defaults to the distance to `target`).
 * Writes the impulse (for a body of mass 1) into `out` and returns it.
 */
export function arriveImpulse<T extends Vec3Like>(
  pos: Vec3Like,
  vel: Vec3Like,
  target: Vec3Like,
  targetVel: Vec3Like,
  p: ArriveParams,
  dt: number,
  out: T,
  remaining?: number,
): T {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dy, dz);
  const closing = dist > 1e-6 ? Math.min(p.maxSpeed, (remaining ?? dist) * p.gain) / dist : 0;

  // Rapier damps velocity by 1 / (1 + damping * dt) each step; pre-scale to cancel it.
  const hold = 1 + p.damping * dt;
  out.x = (targetVel.x + dx * closing) * hold - vel.x;
  out.y = (targetVel.y + dy * closing) * hold - vel.y;
  out.z = (targetVel.z + dz * closing) * hold - vel.z;

  const max = p.accel * dt;
  const len = Math.hypot(out.x, out.y, out.z);
  if (len > max) {
    const s = max / len;
    out.x *= s;
    out.y *= s;
    out.z *= s;
  }
  return out;
}

export interface Obstacle {
  readonly position: Vec3Like;
  readonly radius: number;
}

/** How far beyond an obstacle's keep-out radius the detour waypoint sits. */
const DETOUR_SCALE = 1.15;

/**
 * If the straight path from `pos` to `dest` passes within `clearance` of an
 * obstacle's surface, writes a detour waypoint beside the first such obstacle
 * into `out` and returns true. Re-evaluated every step, the waypoint slides
 * around the obstacle until the path is clear. Obstacles whose keep-out zone
 * already contains the ship or the destination are ignored.
 */
export function detourWaypoint(
  pos: Vec3Like,
  dest: Vec3Like,
  obstacles: readonly Obstacle[],
  clearance: number,
  out: Vec3Like,
): boolean {
  const dx = dest.x - pos.x;
  const dy = dest.y - pos.y;
  const dz = dest.z - pos.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1e-9) return false;

  let first = Infinity;
  for (const o of obstacles) {
    const c = o.position;
    const r = o.radius + clearance;
    const r2 = r * r;
    if ((c.x - pos.x) ** 2 + (c.y - pos.y) ** 2 + (c.z - pos.z) ** 2 < r2) continue;
    if ((c.x - dest.x) ** 2 + (c.y - dest.y) ** 2 + (c.z - dest.z) ** 2 < r2) continue;

    // Closest point on the segment to the obstacle's centre.
    const t = Math.min(1, Math.max(0, ((c.x - pos.x) * dx + (c.y - pos.y) * dy + (c.z - pos.z) * dz) / len2));
    if (t >= first) continue;
    let nx = pos.x + dx * t - c.x;
    let ny = pos.y + dy * t - c.y;
    let nz = pos.z + dz * t - c.z;
    const miss = Math.hypot(nx, ny, nz);
    if (miss >= r) continue;

    if (miss > 1e-6) {
      nx /= miss;
      ny /= miss;
      nz /= miss;
    } else {
      // Dead centre: sidestep horizontally, perpendicular to the path.
      const h = Math.hypot(dx, dz);
      nx = h > 1e-6 ? -dz / h : 1;
      ny = 0;
      nz = h > 1e-6 ? dx / h : 0;
    }
    first = t;
    out.x = c.x + nx * r * DETOUR_SCALE;
    out.y = c.y + ny * r * DETOUR_SCALE;
    out.z = c.z + nz * r * DETOUR_SCALE;
  }
  return first !== Infinity;
}

/**
 * Point where the ship should park next to a body: `standoff` from its centre,
 * on the side the ship is approaching from. Writes into `out` and returns it.
 */
export function standoffPoint<T extends Vec3Like>(ship: Vec3Like, body: Vec3Like, standoff: number, out: T): T {
  let dx = ship.x - body.x;
  let dy = ship.y - body.y;
  let dz = ship.z - body.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) {
    dx = 0;
    dy = 0;
    dz = 1;
  } else {
    dx /= len;
    dy /= len;
    dz /= len;
  }
  out.x = body.x + dx * standoff;
  out.y = body.y + dy * standoff;
  out.z = body.z + dz * standoff;
  return out;
}
