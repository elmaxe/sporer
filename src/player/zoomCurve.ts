/*
 * The zoom value: one number in [0, 1] per level, set by the scroll wheel,
 * that decides how close the ship is to what it's looking at as well as how
 * far the camera is. 0 is the closest zoom (keep scrolling in to descend a
 * level), 1 the farthest (keep scrolling out to leave it). The camera
 * distance is log-scaled over it, so each wheel notch zooms by the same
 * factor; everything else (the planet ship's altitude, the camera pitch, the
 * system ship's parking distance) is a pure curve of it. No THREE; tested in
 * tests/zoomCurve.test.ts.
 */

/** Clamps to [0, 1]. */
export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** `a` to `b` in log space (both > 0): a·(b/a)^t, with `t` clamped to [0, 1]. */
export function logLerp(a: number, b: number, t: number): number {
  return a * Math.pow(b / a, clamp01(t));
}

/** Camera distance at `zoom`: `min` at 0 to `max` at 1, log-scaled. */
export function zoomDistance(zoom: number, min: number, max: number): number {
  return logLerp(min, max, zoom);
}

/** The zoom that puts the camera at `distance` (the inverse of `zoomDistance`), clamped to [0, 1]. */
export function distanceZoom(distance: number, min: number, max: number): number {
  return clamp01(Math.log(distance / min) / Math.log(max / min));
}

/** Planet level: how the zoom sets the ship's altitude and the camera's pitch (planet units, R = 100). */
export const planetZoomCurve = {
  /** Height above the highest terrain at zoom 0 and zoom 1: skimming the peaks up to high orbit. */
  minAltitude: 2,
  maxAltitude: 120,
  /** Camera pitch (degrees above the ship's horizon) at zoom 0 and 1: along the ground, then looking down. */
  minPitch: 10,
  maxPitch: 60,
};

export type PlanetZoomCurve = typeof planetZoomCurve;

/** The planet ship's height above the highest terrain at `zoom`: log-scaled, so it creeps near the ground. */
export function planetAltitude(zoom: number, c: PlanetZoomCurve = planetZoomCurve): number {
  return logLerp(c.minAltitude, c.maxAltitude, zoom);
}

/** The pitch (radians) the planet camera leans to at `zoom`; drags add to it. */
export function planetPitch(zoom: number, c: PlanetZoomCurve = planetZoomCurve): number {
  return ((c.minPitch + (c.maxPitch - c.minPitch) * clamp01(zoom)) * Math.PI) / 180;
}

/**
 * System level: while parked at (or flying to) a body, the camera distance
 * also sets how far above its surface the ship parks, as a multiple of the
 * body's usual clearance (standoff − radius). Pieced together in log distance:
 * `minScale` at `near` (the closest zoom), 1 at `normal` (the usual view) and
 * `maxScale` from `far` out.
 */
export const parkingCurve = {
  near: 12,
  normal: 45,
  far: 180,
  minScale: 0.5,
  maxScale: 1.5,
  /** Never park closer to the surface than this (flying into a body within 3 descends to it; the ship's radius is 2). */
  minClearance: 4.5,
};

export type ParkingCurve = typeof parkingCurve;

/** Multiple of the usual clearance to park at with the camera `distance` from the ship. */
export function parkingScale(distance: number, c: ParkingCurve = parkingCurve): number {
  if (distance <= c.normal) {
    const t = Math.log(Math.max(distance, c.near) / c.near) / Math.log(c.normal / c.near);
    return c.minScale + (1 - c.minScale) * clamp01(t);
  }
  const t = Math.log(distance / c.normal) / Math.log(c.far / c.normal);
  return 1 + (c.maxScale - 1) * clamp01(t);
}

/** A shell around a body, from `inner` to `outer` from its centre (e.g. where a moon orbits). */
export interface Shell {
  inner: number;
  outer: number;
}

/** The shell a moon of `radius` sweeps orbiting at `orbitRadius`, widened by the minimum clearance on both sides. */
export function moonShell(orbitRadius: number, radius: number, c: ParkingCurve = parkingCurve): Shell {
  return { inner: orbitRadius - radius - c.minClearance, outer: orbitRadius + radius + c.minClearance };
}

/**
 * Distance from a body's centre to park at: its surface plus the usual
 * clearance times `scale`, but never within `keepOut` (its moons' orbits,
 * where a moon would run into the ship): a distance inside one moves to its
 * nearer edge (the outer one if the inner is too close to the surface). So it
 * still never decreases as `scale` grows.
 */
export function parkingDistance(
  radius: number,
  standoff: number,
  scale: number,
  keepOut: readonly Shell[] = [],
  c: ParkingCurve = parkingCurve,
): number {
  const d = radius + Math.max((standoff - radius) * scale, c.minClearance);
  // Where shells overlap, the ship is kept out of all of them together.
  let inner = Infinity;
  let outer = -Infinity;
  for (let grown = true; grown; ) {
    grown = false;
    for (const s of keepOut) {
      const hit = inner > outer ? d > s.inner && d < s.outer : s.inner < outer && s.outer > inner;
      if (hit && (s.inner < inner || s.outer > outer)) {
        inner = Math.min(inner, s.inner);
        outer = Math.max(outer, s.outer);
        grown = true;
      }
    }
  }
  if (inner > outer) return d;
  return inner >= radius + c.minClearance && d - inner < outer - d ? inner : outer;
}
