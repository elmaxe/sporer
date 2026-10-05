import * as THREE from 'three';

/*
 * The ground under the UFO in low orbit (step 24): pure maths, unit-tested in
 * tests/ground.test.ts. A *ground height* is the radius of what the UFO
 * must stay above in a unit direction from the planet's centre: the terrain
 * as drawn, or the sea's surface over water (and lava), the globe's radius
 * over a gas giant.
 */

/** The radius of the ground in unit direction `dir`. */
export type GroundHeight = (dir: THREE.Vector3) => number;

export const groundParams = {
  /** Zoom fractions (0 = closest) between which the ship stops following the ground and flies above the peaks again. */
  followFrom: 0.2,
  followTo: 0.55,
  /** The ship looks this many seconds ahead along its velocity for rising ground... */
  lookAhead: 1,
  /** ...and at least this far (planet units: about the UFO's own size) along its heading. */
  footprint: 3,
  /** Ground samples along that stretch. */
  samples: 4,
  /** Seconds to close ~63% of the gap to a higher / lower altitude (rising is quicker than sinking). */
  climbTime: 0.25,
  sinkTime: 0.7,
  /** The hull never comes closer than this to the ground beneath it, whatever the smoothing says. */
  minClearance: 1.2,
  /** Picking the ground with a ray: step as a share of the height above the ground, its limits, and bisection steps. */
  rayStepShare: 0.4,
  rayMinStep: 0.25,
  rayMaxStep: 8,
  rayRefine: 14,
  rayMaxSteps: 6000,
};

/**
 * The UFO's hull as obstacles meet it: a disc this wide (radius) whose underside
 * is half an ellipsoid this deep below its centre (player/Ship.ts buildUfoMesh:
 * a sphere of radius 2 squashed to 0.28 of its height).
 */
export const HULL_RADIUS = 2;
export const HULL_DEPTH = 0.56;

/**
 * Things standing on the ground (plants) that the ship flies through, shaking
 * them as it goes (surface/plantShake.ts), queried along the stretch it covered.
 */
export interface Obstacles {
  /**
   * Calls `visit` with the unit direction of everything standing on the
   * ground that the hull, its centre `radius` from the planet's centre, passes
   * through anywhere on the short arc from unit direction `from` to `to`.
   */
  touchAlong(from: THREE.Vector3, to: THREE.Vector3, radius: number, visit: (x: number, y: number, z: number) => void): void;
}

const scratch = new THREE.Vector3();
const point = new THREE.Vector3();

/**
 * How much the ship follows the ground at zoom fraction `f`: 1 down low
 * (a fixed clearance over what is beneath it), 0 from `followTo` up (flying
 * above the highest peak), smoothly between.
 */
export function followWeight(f: number, p = groundParams): number {
  const t = Math.min(1, Math.max(0, (f - p.followFrom) / (p.followTo - p.followFrom)));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * The radius to fly at: `zoomRadius` (the peaks' radius `top` plus the zoom's
 * altitude) lowered by `follow` of the way down to `ground` (the highest
 * ground under or ahead of the ship). With `follow` 0 it is `zoomRadius`, with 1
 * it is the zoom's altitude above the ground.
 */
export function flightRadius(zoomRadius: number, top: number, ground: number, follow: number): number {
  return zoomRadius + follow * (ground - top);
}

/**
 * The highest ground under the ship at unit direction `u` and over a stretch
 * ahead of it: `footprint` plus `lookAhead` seconds of its velocity `vel`
 * (tangent to the sphere of `radius`), along `heading` (a unit tangent)
 * when it is nearly still. So it rises before a slope instead of into it.
 */
export function groundAhead(
  height: GroundHeight,
  u: THREE.Vector3,
  vel: THREE.Vector3,
  heading: THREE.Vector3,
  radius: number,
  p = groundParams,
): number {
  let highest = height(u);
  for (let k = 1; k <= p.samples; k++) highest = Math.max(highest, height(aheadDirection(u, vel, heading, radius, k / p.samples, scratch, p)));
  return highest;
}

/**
 * The unit direction `share` of the way along the stretch `groundAhead`
 * looks over (`footprint` plus `lookAhead` seconds of `vel`, along `heading`
 * when nearly still), written into `out`.
 */
export function aheadDirection(
  u: THREE.Vector3,
  vel: THREE.Vector3,
  heading: THREE.Vector3,
  radius: number,
  share: number,
  out: THREE.Vector3,
  p = groundParams,
): THREE.Vector3 {
  const speed = vel.length();
  const reach = p.footprint + speed * p.lookAhead;
  const toward = speed > 1 ? point.copy(vel).divideScalar(speed) : point.copy(heading);
  const angle = (reach * share) / radius;
  return out.copy(u).multiplyScalar(Math.cos(angle)).addScaledVector(toward, Math.sin(angle));
}

/**
 * The lowest radius at which the hull's centre clears an obstacle anywhere on
 * the short arc from unit direction `from` to `to` (taken as the straight
 * chord, a few hull widths at most): an upright cylinder `crown` wide (radius)
 * round unit direction (`bx`, `by`, `bz`), up to radius `top` from the
 * planet's centre. Over the cylinder the hull's lowest point just touches its
 * top; nearer its rim the hull's underside is shallower, so it may come lower.
 * -Infinity if the hull never passes over it. A hull flying lower than this
 * goes through it.
 */
export function obstacleClearance(
  bx: number,
  by: number,
  bz: number,
  crown: number,
  top: number,
  from: THREE.Vector3,
  to: THREE.Vector3,
): number {
  const ex = to.x - from.x;
  const ey = to.y - from.y;
  const ez = to.z - from.z;
  const length2 = ex * ex + ey * ey + ez * ez;
  let t = length2 > 0 ? ((bx - from.x) * ex + (by - from.y) * ey + (bz - from.z) * ez) / length2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  // How far the hull's axis passes from the obstacle's, at the obstacle's top.
  const offset = Math.hypot(bx - from.x - ex * t, by - from.y - ey * t, bz - from.z - ez * t) * top - crown;
  if (offset >= HULL_RADIUS) return -Infinity;
  const rim = offset <= 0 ? 0 : offset / HULL_RADIUS;
  return top + HULL_DEPTH * Math.sqrt(1 - rim * rim);
}

/**
 * One step of the altitude towards `target`: quicker up than down, and never
 * below `floor` (the lowest radius that clears the ground right under the hull).
 */
export function climbStep(current: number, target: number, floor: number, dt: number, p = groundParams): number {
  const time = target > current ? p.climbTime : p.sinkTime;
  return Math.max(floor, current + (target - current) * (1 - Math.exp(-dt / time)));
}

const origin = new THREE.Vector3();
const direction = new THREE.Vector3();

/**
 * Where a ray meets the ground, for clicking the globe: marches inside the
 * shell below the highest peak (`top`), with steps in proportion to the height
 * above the ground so far, then bisects the last one. Writes the point on the
 * ground into `out` and returns the distance along the ray, or null if the ray
 * misses the globe. `ray.direction` is unit length. The globe is centred on the origin.
 */
export function groundHit(ray: THREE.Ray, height: GroundHeight, top: number, out: THREE.Vector3, p = groundParams): number | null {
  origin.copy(ray.origin);
  direction.copy(ray.direction);
  // Where the ray is inside the sphere of the peaks.
  const b = origin.dot(direction);
  const disc = b * b - (origin.lengthSq() - top * top);
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const far = -b + root;
  if (far < 0) return null;
  let t = Math.max(0, -b - root);

  const above = (distance: number): number => {
    point.copy(origin).addScaledVector(direction, distance);
    const r = point.length();
    return r - height(point.multiplyScalar(1 / r));
  };

  let previous = t;
  for (let i = 0; i < p.rayMaxSteps && t <= far; i++) {
    const h = above(t);
    if (h <= 0) {
      if (i === 0) previous = t;
      let lo = previous;
      let hi = t;
      for (let k = 0; k < p.rayRefine; k++) {
        const mid = (lo + hi) / 2;
        if (above(mid) > 0) lo = mid;
        else hi = mid;
      }
      out.copy(origin).addScaledVector(direction, hi);
      // Report the point on the ground, not a hair under it.
      out.setLength(height(point.copy(out).normalize()));
      return hi;
    }
    previous = t;
    t += Math.min(p.rayMaxStep, Math.max(p.rayMinStep, h * p.rayStepShare));
  }
  return null;
}
