import type { Rng } from './rng';

/** A rotation as a unit quaternion (plain data, so it serialises with the rest of the generation). */
export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** The ecliptic's normal is at most this far (radians) from the galactic pole. */
export const MAX_GALACTIC_TILT = (75 * Math.PI) / 180;

/**
 * How a system sits in the galaxy: the rotation from system space into galaxy
 * space. The system is first turned about its own pole by a random angle,
 * then its ecliptic is tipped by up to MAX_GALACTIC_TILT about a random axis
 * in the galactic plane (cos-uniform, i.e. uniform over that cap of
 * directions), so the galaxy's band crosses most systems' skies at a slant.
 */
export function galacticTilt(rng: Rng): QuatLike {
  const spin = rng.range(0, Math.PI * 2);
  const tilt = Math.acos(rng.range(Math.cos(MAX_GALACTIC_TILT), 1));
  const axisAngle = rng.range(0, Math.PI * 2);
  // Tip about the in-plane axis (cos a, 0, sin a), after spinning about +Y.
  const tip = axisQuat(Math.cos(axisAngle), 0, Math.sin(axisAngle), tilt);
  const turn = axisQuat(0, 1, 0, spin);
  return multiply(tip, turn);
}

/** Applies `q` to the vector (x, y, z). */
export function rotate(q: QuatLike, x: number, y: number, z: number): { x: number; y: number; z: number } {
  // v' = v + 2w (u × v) + 2 u × (u × v), with u the quaternion's vector part.
  const cx = q.y * z - q.z * y;
  const cy = q.z * x - q.x * z;
  const cz = q.x * y - q.y * x;
  return {
    x: x + 2 * (q.w * cx + q.y * cz - q.z * cy),
    y: y + 2 * (q.w * cy + q.z * cx - q.x * cz),
    z: z + 2 * (q.w * cz + q.x * cy - q.y * cx),
  };
}

function axisQuat(x: number, y: number, z: number, angle: number): QuatLike {
  const s = Math.sin(angle / 2);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(angle / 2) };
}

/** a · b: rotate by b, then by a. */
function multiply(a: QuatLike, b: QuatLike): QuatLike {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
