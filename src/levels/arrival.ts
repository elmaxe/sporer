import type { Vec3Like } from '../gen/orbit';

/*
 * Arriving in a system from the galaxy (SceneManager.toSystem): the ship flies
 * in from far out and brakes to park near the star. Pure maths, unit-tested in
 * tests/arrival.test.ts.
 *
 * The view the zoom comes in along can point from anywhere, below the
 * ecliptic too (the galaxy camera can look from under the galactic plane, and
 * each system is tilted against it). The ship still comes in along the
 * ecliptic, just above it, and the camera settles over it, above the plane.
 */

export const arrivalParams = {
  /** Where it appears, as a share of the camera's distance from the star at the handover (so it's ahead of the camera). */
  start: 0.55,
  /** ...but at least this many times its parking distance. */
  minStart: 1.8,
  /** Seconds from appearing to parked, braking evenly all the way. */
  flightTime: 3.5,
  /** The ship's approach and parking spot: this far above the ecliptic, radians. */
  shipElevation: [(1 * Math.PI) / 180, (4 * Math.PI) / 180] as [number, number],
  /** Where the camera settles behind the ship: looking down on it from this high, radians. */
  cameraElevation: [(12 * Math.PI) / 180, (35 * Math.PI) / 180] as [number, number],
};

/**
 * `dir` (a direction in system space, +Y the ecliptic's north) with its
 * elevation above the ecliptic clamped to [min, max] radians, keeping its
 * heading. Straight up or down, the heading is +Z. Writes a unit vector into
 * `out` and returns it.
 */
export function clampElevation<T extends Vec3Like>(dir: Vec3Like, min: number, max: number, out: T): T {
  const h = Math.hypot(dir.x, dir.z);
  const hx = h > 1e-9 ? dir.x / h : 0;
  const hz = h > 1e-9 ? dir.z / h : 1;
  const elevation = Math.min(max, Math.max(min, Math.atan2(dir.y, h)));
  const c = Math.cos(elevation);
  out.x = hx * c;
  out.y = Math.sin(elevation);
  out.z = hz * c;
  return out;
}
