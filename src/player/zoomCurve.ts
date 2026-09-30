/*
 * Zoom moves the ship, not just the camera (Spore-style): pure curves from the
 * orbit camera's distance to how far the ship is from what it's at. Unit-tested
 * in tests/zoomCurve.test.ts.
 *
 * System level: parked at (or flying to) a body, the ship keeps a gap from its
 * surface that grows with the camera distance, gap ∝ view^exponent, so
 * scrolling in brings it down towards the body (and on into the planet level)
 * and scrolling out pulls it back until it leaves the system. Each parking
 * has its own gap at the reference view: a body's standoff, or the spot the
 * ship flew in to when it arrived from the galaxy.
 *
 * Planet level: the zoom sets the altitude above the highest terrain, from
 * just over the peaks up to high orbit, and tips the camera over to look down
 * at the globe as it rises.
 */

export const zoomCurveParams = {
  /** System camera distance at which the ship parks at a body's own standoff. */
  referenceView: 45,
  /** How closely the parking gap follows the camera distance (gap ∝ view^exponent). */
  gapExponent: 0.6,
  /** Closest the ship parks to a surface (it dives into a body it comes within 3 of). */
  minGap: 4.5,
  /** Planet level: lowest altitude above the highest terrain, planet units (the UFO is ~4 wide). */
  lowAltitude: 3,
  /** Highest altitude, in globe radii, but at least `minHighAltitude`. */
  highRadii: 1.5,
  minHighAltitude: 30,
  /** > 1 keeps the ship low over most of the zoom range and climbs faster towards the top. */
  altitudeCurve: 1.6,
  /** Lowest camera pitch over the planet (radians): above the horizon down low, looking down on the globe high up. */
  lowPitch: (5 * Math.PI) / 180,
  highPitch: (50 * Math.PI) / 180,
  /** Share of the zoom range (from the top) over which the lowest pitch rises. */
  pitchRange: 0.45,
};

export type ZoomCurveParams = typeof zoomCurveParams;

/** Where `distance` sits between `min` and `max` on a log scale: 0 at min, 1 at max (clamped). */
export function zoomFraction(distance: number, min: number, max: number): number {
  if (max <= min) return 0;
  const f = Math.log(distance / min) / Math.log(max / min);
  return Math.min(1, Math.max(0, f));
}

/**
 * The gap between a parked ship and a body's surface with the camera `view`
 * from the ship, for a parking whose gap at the reference view is `gap`.
 */
export function parkGap(gap: number, view: number, p: ZoomCurveParams = zoomCurveParams): number {
  return Math.max(p.minGap, gap * Math.pow(view / p.referenceView, p.gapExponent));
}

/** The reference-view gap of a parking that should be `gap` from the surface at camera distance `view`. */
export function referenceGap(gap: number, view: number, p: ZoomCurveParams = zoomCurveParams): number {
  return gap / Math.pow(view / p.referenceView, p.gapExponent);
}

/** Highest flying altitude over a globe of `radius` (planet units). */
export function highAltitude(radius: number, p: ZoomCurveParams = zoomCurveParams): number {
  return Math.max(p.minHighAltitude, p.highRadii * radius);
}

/**
 * Altitude above the highest terrain for zoom fraction `f` (0 = closest)
 * over a globe of `radius`: log-scaled from `lowAltitude` to `highAltitude`.
 */
export function flightAltitude(f: number, radius: number, p: ZoomCurveParams = zoomCurveParams): number {
  const u = Math.pow(Math.min(1, Math.max(0, f)), p.altitudeCurve);
  return p.lowAltitude * Math.pow(highAltitude(radius, p) / p.lowAltitude, u);
}

/** Lowest camera pitch for zoom fraction `f`: rises smoothly over the top `pitchRange` of the zoom. */
export function minPitchAt(f: number, p: ZoomCurveParams = zoomCurveParams): number {
  const u = Math.min(1, Math.max(0, (f - (1 - p.pitchRange)) / p.pitchRange));
  return p.lowPitch + (p.highPitch - p.lowPitch) * u * u * (3 - 2 * u);
}
