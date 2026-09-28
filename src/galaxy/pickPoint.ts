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
