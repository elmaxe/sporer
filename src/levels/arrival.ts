import type { Vec3Like } from '../gen/orbit';

/*
 * Arriving in a system from the galaxy (SceneManager.toSystem): the ship flies
 * in from far out and brakes to hover above the star. Coming back up from a
 * planet it hovers above that. Pure maths, unit-tested in tests/arrival.test.ts.
 *
 * The view the zoom comes in along can point from anywhere, below the
 * ecliptic too (the galaxy camera can look from under the galactic plane, and
 * each system is tilted against it). The ship still comes in along the
 * ecliptic, just above it, and the camera settles over it, looking down far
 * enough to keep the body under the ship in view (`hoverViewElevation`).
 */

export const arrivalParams = {
  /** Where it appears, as a share of the camera's distance from the star at the handover (so it's ahead of the camera). */
  start: 0.55,
  /** ...but at least this many times its parking distance. */
  minStart: 1.8,
  /** Seconds from appearing to parked, braking evenly all the way. */
  flightTime: 3.5,
  /** Where the ship appears and flies in from: this far above the ecliptic, radians. */
  shipElevation: [(1 * Math.PI) / 180, (4 * Math.PI) / 180] as [number, number],
  /** Where the camera settles behind the hovering ship: looking down on it from this high, radians. */
  cameraElevation: [(20 * Math.PI) / 180, (75 * Math.PI) / 180] as [number, number],
  /** ...over a star, which the camera looks at: from this high, radians. */
  starElevation: (20 * Math.PI) / 180,
  /** ...high enough that the centre of the body under the ship is at most this far below the view's centre, radians. */
  bodyBelowCentre: (16 * Math.PI) / 180,
};

/** Coming back up from a planet (SceneManager.leavePlanet): where the camera ends, zoomed out from the ship above it. */
export const leaveParams = {
  /** At least this many times the handover distance, so the zoom keeps going out after the crossfade. */
  pastHandover: 1.3,
  /** ...and far enough to take in the planet's moons: this many times the farthest one's distance (or its standoff). */
  reach: 2.2,
  /** Never farther than this (the system camera's max is 2500, past which is the galaxy). */
  maxDistance: 1200,
};

/**
 * Going down to a planet (SceneManager.toPlanet): the ship arrives in low
 * orbit on the camera's side of the globe, but no nearer the poles than this
 * (radians from the ecliptic). The camera looks down on a ship hovering over
 * the body, so without it every descent would end up over the north pole.
 */
export const descentParams = {
  maxLatitude: (30 * Math.PI) / 180,
};

/**
 * The lowest elevation (radians above the ecliptic) of a camera `distance`
 * from a ship hovering `height` above a body's centre, looking at the ship,
 * that shows the body's centre at most `angle` below the middle of the view.
 * The body's centre is atan2(h cos e, d + h sin e) off the view's axis, so
 * that equals `angle` where cos(e + angle) = d sin(angle) / h; 0 if it's
 * already in view looking level.
 */
export function hoverViewElevation(distance: number, height: number, angle: number): number {
  const c = (distance * Math.sin(angle)) / Math.max(height, 1e-9);
  return c >= 1 ? 0 : Math.max(0, Math.acos(c) - angle);
}

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
