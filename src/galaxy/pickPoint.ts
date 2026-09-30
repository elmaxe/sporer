import type { Vec3Like } from '../gen/orbit';

/**
 * Index of the point that appears closest to a ray (smallest angle from it),
 * as long as that angle is within `maxAngle` radians; -1 if none. `positions`
 * holds xyz triples; `dir` must be a unit vector. Points behind the origin are
 * skipped.
 */
export function pickPoint(origin: Vec3Like, dir: Vec3Like, positions: ArrayLike<number>, maxAngle: number): number {
  let best = -1;
  let bestTan = Math.tan(maxAngle);
  for (let i = 0, n = positions.length / 3; i < n; i++) {
    const vx = positions[i * 3]! - origin.x;
    const vy = positions[i * 3 + 1]! - origin.y;
    const vz = positions[i * 3 + 2]! - origin.z;
    const depth = vx * dir.x + vy * dir.y + vz * dir.z;
    if (depth <= 0) continue;
    const perp = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - depth * depth));
    const tan = perp / depth;
    if (tan < bestTan) {
      bestTan = tan;
      best = i;
    }
  }
  return best;
}

/** Share of a nebula's radius a ray must pass within to pick it: its visible, denser middle. */
const NEBULA_PICK_REACH = 0.6;

/**
 * Index of the nebula (a sphere of `radius` round `position`) whose centre
 * a ray passes closest to, relative to its size, if it passes within
 * NEBULA_PICK_REACH of its radius; -1 if none. Nebulas behind the origin or
 * containing it are skipped (from inside, one is all round you).
 */
export function pickNebula(
  origin: Vec3Like,
  dir: Vec3Like,
  nebulas: readonly { position: Vec3Like; radius: number }[],
): number {
  let best = -1;
  let bestRatio = NEBULA_PICK_REACH;
  nebulas.forEach((n, i) => {
    const vx = n.position.x - origin.x;
    const vy = n.position.y - origin.y;
    const vz = n.position.z - origin.z;
    const dist2 = vx * vx + vy * vy + vz * vz;
    if (dist2 <= n.radius * n.radius) return;
    const depth = vx * dir.x + vy * dir.y + vz * dir.z;
    if (depth <= 0) return;
    const ratio = Math.sqrt(Math.max(0, dist2 - depth * depth)) / n.radius;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = i;
    }
  });
  return best;
}
