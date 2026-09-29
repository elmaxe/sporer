
/*
 * The seamless galaxy ↔ system zoom as a pure timeline. Both levels share
 * one camera distance, measured in system units from the star(s)' barycentre
 * (the galaxy camera is at `scale` times it, in galaxy units): the galaxy
 * draws the system's star(s) at their place, `scale` galaxy units per system
 * unit, so both views frame the star identically. The outgoing level plays
 * alone for `lead` seconds, both are crossfaded for `overlap`, then the
 * incoming level plays alone for `tail`. The distance runs in log space
 * through `handover` at the middle of the overlap without stopping there.
 */

export const seamlessZoomParams = {
  /** Seconds of the outgoing level alone, of the crossfade, and of the incoming level alone. */
  lead: 1.1,
  overlap: 0.5,
  tail: 0.9,
  /** Angular radius (radians) of the star zone at the handover, zooming in (≈ 22 px at 720p). */
  handoverAngle: 0.035,
  /** Zooming out, the handover is at least this many times farther than the system camera starts. */
  handoverOut: 1.6,
  /** Galaxy camera distance from the star at the handover, in galaxy units (neighbours are ~25 away). */
  galaxyHandover: 3,
};

/** The system ↔ planet zoom (the same timeline, framed on the body instead of the star). */
export const planetZoomParams = {
  lead: 0.9,
  overlap: 0.45,
  tail: 0.85,
  /** Angular radius (radians) of the body at the handover, going down: big, but the whole globe in view. */
  handoverAngle: 0.3,
  /** Never hand over closer than this many radii from the body's centre. */
  minRadii: 1.3,
  /** Going down, the handover is at most this fraction of the camera's starting distance from the body. */
  inFraction: 0.7,
  /** Going up, the handover is at least this many times the planet camera's starting distance. */
  outFactor: 1.3,
};

export interface SeamlessZoom {
  lead: number;
  overlap: number;
  tail: number;
  /** Camera distances (system units): at the start, mid-crossfade and at the end. */
  start: number;
  handover: number;
  end: number;
}

export interface SeamlessSample {
  /** Camera distance in system units. */
  distance: number;
  /** The incoming level's weight in the crossfade: 0 before the overlap, 1 after it. */
  blend: number;
  /** Eased progress through the lead (the outgoing level's own animation), 0–1. */
  lead: number;
  /** Eased progress through the tail (the incoming level's own animation), 0–1. */
  tail: number;
  done: boolean;
}

/** Ease-in-out on [0, 1]. */
export function ease(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

/** Total length in seconds. */
export function zoomDuration(z: SeamlessZoom): number {
  return z.lead + z.overlap + z.tail;
}

/** Camera distance for the handover zooming in from the galaxy: the star zone at `handoverAngle`. */
export function handoverIn(starZone: number, params = seamlessZoomParams): number {
  return starZone / Math.tan(params.handoverAngle);
}

/** Zooming out, from a system camera at `start`: at least as far as zooming in, and well beyond `start`. */
export function handoverOut(starZone: number, start: number, params = seamlessZoomParams): number {
  return Math.max(handoverIn(starZone, params), start * params.handoverOut);
}

/** Galaxy units per system unit that put the galaxy camera at `galaxyHandover` when the system one is at `handover`. */
export function galaxyScale(handover: number, params = seamlessZoomParams): number {
  return params.galaxyHandover / handover;
}

/**
 * Camera distance from a body's centre for the handover going down to it
 * (system units), with the camera starting `cameraDistance` from it: the body
 * at `handoverAngle`, but never farther than the camera already is.
 */
export function planetHandoverIn(radius: number, cameraDistance: number, params = planetZoomParams): number {
  const framed = radius / Math.sin(params.handoverAngle);
  return Math.max(params.minRadii * radius, Math.min(framed, params.inFraction * cameraDistance));
}

/** Going back up, from a planet camera starting `start` from its ship (system units): the same framing or farther. */
export function planetHandoverOut(radius: number, start: number, params = planetZoomParams): number {
  return Math.max(radius / Math.sin(params.handoverAngle), params.outFactor * start, params.minRadii * radius);
}

/** Where the timeline is `t` seconds in. */
export function sampleSeamlessZoom(z: SeamlessZoom, t: number): SeamlessSample {
  const total = zoomDuration(z);
  return {
    distance: Math.exp(logDistance(z, Math.min(Math.max(t, 0), total))),
    blend: z.overlap > 0 ? ease((t - z.lead) / z.overlap) : t >= z.lead ? 1 : 0,
    lead: z.lead > 0 ? ease(t / z.lead) : 1,
    tail: z.tail > 0 ? ease((t - z.lead - z.overlap) / z.tail) : t >= total ? 1 : 0,
    done: t >= total,
  };
}

/**
 * Log distance: two cubic Hermite pieces meeting at the handover, at rest at
 * both ends. The slope at the handover is the average of the two pieces'
 * mean slopes, limited so neither piece overshoots (Fritsch–Carlson). If the
 * lead heads the other way (it measures from a centre still moving towards
 * the one the tail uses, e.g. from the ship to a big planet), the tail's own
 * slope is used, so the camera doesn't stop at the handover.
 */
function logDistance(z: SeamlessZoom, t: number): number {
  const l0 = Math.log(z.start);
  const lh = Math.log(z.handover);
  const l1 = Math.log(z.end);
  const th = z.lead + z.overlap / 2;
  const t1 = zoomDuration(z);
  const m1 = th > 0 ? (lh - l0) / th : 0;
  const m2 = t1 > th ? (l1 - lh) / (t1 - th) : 0;
  const slope =
    m1 * m2 > 0 ? Math.sign(m1) * Math.min(Math.abs(m1 + m2) / 2, 3 * Math.abs(m1), 3 * Math.abs(m2)) : m2;
  return t < th ? hermite(l0, 0, lh, slope, 0, th, t) : hermite(lh, slope, l1, 0, th, t1, t);
}

/** Cubic from (t0, p0) with slope m0 to (t1, p1) with slope m1, at t. */
function hermite(p0: number, m0: number, p1: number, m1: number, t0: number, t1: number, t: number): number {
  const h = t1 - t0;
  if (h <= 0) return p1;
  const s = (t - t0) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * h * m1
  );
}
