/*
 * Zoom moves the ship, not just the camera (Spore-style): pure curves from the
 * orbit camera's distance to how far the ship is from what it's at. Unit-tested
 * in tests/zoomCurve.test.ts.
 *
 * System level: hovering above (or flying to) a body, the ship keeps a gap
 * from its surface that follows the camera distance, gap ∝ view^exponent:
 * scrolling in brings it down towards the body (and on into the planet
 * level), scrolling out lifts it only a little (a gentler exponent), so it
 * stays over the body as the view takes in the system. At the reference view
 * the gap is a share of the body's radius, capped for big ones (`hoverGap`).
 *
 * Planet level: the zoom sets the altitude above the highest terrain, from
 * just over the peaks up to high orbit, and tips the camera over to look down
 * at the globe as it rises.
 */

export const zoomCurveParams = {
  /** System camera distance at which the ship hovers `hoverRadii` above a body. */
  referenceView: 45,
  /** The hover's gap from the surface at the reference view, in the body's radii (at least `minGap`)... */
  hoverRadii: 0.8,
  /** ...but no more than this, so it hovers low over stars and giants too. */
  maxHoverGap: 12,
  /** How closely the gap follows the camera distance zooming in from the reference view (gap ∝ view^exponent)... */
  gapExponent: 0.6,
  /** ...and zooming out from it: barely, so the ship doesn't climb away from the body. */
  gapOutExponent: 0.1,
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

/**
 * The gap between the ship hovering above a body of `radius` and its surface
 * at the reference view. Straight above the body nothing orbits (moons stay
 * near the ecliptic, rings in the equator), so it only depends on the size.
 */
export function hoverGap(radius: number, p: ZoomCurveParams = zoomCurveParams): number {
  return Math.max(p.minGap, Math.min(p.maxHoverGap, p.hoverRadii * radius));
}

/** Where `distance` sits between `min` and `max` on a log scale: 0 at min, 1 at max (clamped). */
export function zoomFraction(distance: number, min: number, max: number): number {
  if (max <= min) return 0;
  const f = Math.log(distance / min) / Math.log(max / min);
  return Math.min(1, Math.max(0, f));
}

/**
 * The gap between a hovering ship and a body's surface with the camera `view`
 * from the ship, for a hover whose gap at the reference view is `gap`.
 */
export function parkGap(gap: number, view: number, p: ZoomCurveParams = zoomCurveParams): number {
  const exponent = view < p.referenceView ? p.gapExponent : p.gapOutExponent;
  return Math.max(p.minGap, gap * Math.pow(view / p.referenceView, exponent));
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
