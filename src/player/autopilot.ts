import type { Vec3Like } from '../gen/orbit';

export interface ArriveParams {
  /** Cruise speed relative to the target, units per second. */
  maxSpeed: number;
  /** Largest velocity change per second the autopilot may apply. */
  accel: number;
  /**
   * Stiffness of the final settle (1/s): within the last few units the closing
   * speed is distance * gain, so the ship eases in without overshooting.
   */
  gain: number;
  /** The body's linear damping, compensated so the ship can hold cruise speed. */
  damping: number;
}

/** Share of `accel` the braking curve plans with; the rest is headroom for tracking a moving target. */
const BRAKE_SHARE = 0.5;

/**
 * Closing speed that stops exactly at the destination `dist` away: cruise, then
 * brake at a constant deceleration (speed ∝ √distance, so it arrives in finite
 * time rather than creeping in exponentially), then a short linear settle.
 */
export function closingSpeed(dist: number, p: ArriveParams): number {
  return Math.min(p.maxSpeed, Math.sqrt(2 * BRAKE_SHARE * p.accel * dist), dist * p.gain);
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
  const closing = dist > 1e-6 ? closingSpeed(remaining ?? dist, p) / dist : 0;

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

/** How far beyond the keep-out radius the detour waypoint sits (sets how far round the obstacle it is). */
const DETOUR_SCALE = 1.15;
/** Share of `clearance` the keep-out may shrink to when the ship or destination is already closer than that. */
const MIN_CLEARANCE_SHARE = 0.5;

/**
 * If the straight path from `pos` to `dest` passes within `clearance` of an
 * obstacle's surface, writes a detour waypoint for the first such obstacle
 * into `out` and returns true. The waypoint is where the tangent from the
 * ship to the keep-out sphere reaches `DETOUR_SCALE` times its radius, in the
 * plane through the ship, the obstacle and the destination: flying straight
 * at it never enters the keep-out zone, even from right beside the obstacle
 * (a moon behind the planet the ship is parked at). Re-evaluated every step,
 * the waypoint slides round the obstacle until the path is clear. When the
 * ship or the destination is closer than `clearance`, the keep-out shrinks to
 * fit, down to half of it; obstacles closer than that are ignored.
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
    // Ship and destination relative to the obstacle's centre.
    const px = pos.x - c.x;
    const py = pos.y - c.y;
    const pz = pos.z - c.z;
    const qx = dest.x - c.x;
    const qy = dest.y - c.y;
    const qz = dest.z - c.z;
    const dp = Math.hypot(px, py, pz);
    const dq = Math.hypot(qx, qy, qz);
    const r = Math.min(o.radius + clearance, dp, dq);
    if (r < o.radius + clearance * MIN_CLEARANCE_SHARE) continue;

    // Closest point on the segment to the obstacle's centre.
    const t = Math.min(1, Math.max(0, -(px * dx + py * dy + pz * dz) / len2));
    if (t >= first) continue;
    const miss = Math.hypot(px + dx * t, py + dy * t, pz + dz * t);
    // (A start or end on the shrunk sphere itself doesn't count as entering it.)
    if (miss >= r * (1 - 1e-9)) continue;

    // In-plane unit vectors: u towards the ship, w perpendicular to it towards the destination.
    const ux = px / dp;
    const uy = py / dp;
    const uz = pz / dp;
    const along = qx * ux + qy * uy + qz * uz;
    let wx = qx - along * ux;
    let wy = qy - along * uy;
    let wz = qz - along * uz;
    let wl = Math.hypot(wx, wy, wz);
    if (wl < 1e-6 * dq) {
      // Destination straight behind the obstacle: go round horizontally.
      const h = Math.hypot(ux, uz);
      wx = h > 1e-6 ? -uz / h : 1;
      wy = 0;
      wz = h > 1e-6 ? ux / h : 0;
      wl = 1;
    }
    wx /= wl;
    wy /= wl;
    wz /= wl;

    // Tangent from the ship to the sphere, then on to the waypoint's radius.
    const rw = r * DETOUR_SCALE;
    const angle = Math.acos(Math.min(1, r / dp)) + Math.acos(1 / DETOUR_SCALE);
    const cos = Math.cos(angle) * rw;
    const sin = Math.sin(angle) * rw;
    first = t;
    out.x = c.x + ux * cos + wx * sin;
    out.y = c.y + uy * cos + wy * sin;
    out.z = c.z + uz * cos + wz * sin;
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
