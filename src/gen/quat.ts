import type { Vec3Like } from './orbit';
import type { Rng } from './rng';

/* Unit quaternions as plain data (no THREE), for generated orientations. */

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** A uniformly random rotation (Shoemake's method). */
export function randomRotation(rng: Rng): Quat {
  const u1 = rng.next();
  const u2 = rng.range(0, Math.PI * 2);
  const u3 = rng.range(0, Math.PI * 2);
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3), w: b * Math.cos(u3) };
}

/** Rotates `v` by the unit quaternion `q` into `out` (which may be `v`). */
export function rotate<T extends Vec3Like>(q: Quat, v: Vec3Like, out: T): T {
  // t = 2 q.xyz × v; v' = v + w t + q.xyz × t
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  const x = v.x + q.w * tx + (q.y * tz - q.z * ty);
  const y = v.y + q.w * ty + (q.z * tx - q.x * tz);
  const z = v.z + q.w * tz + (q.x * ty - q.y * tx);
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function conjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}
