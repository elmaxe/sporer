import * as THREE from 'three';

/*
 * The path a weapon's projectile takes from the ship down to a point on the
 * ground (the planet buster's and the volcano bomb's), as pure maths (THREE
 * types only, no scene). Unit-tested in tests/path.test.ts.
 *
 * The shortest way: a straight line from the ship to the point when nothing
 * is in the way, else a quadratic Bézier bowed out from the globe just enough
 * to pass over the ground between. `pathControl` finds its control point once,
 * when the projectile is fired; `pathPoint` gives the points along it.
 */

export const pathParams = {
  /** The path keeps at least this far above the ground on the way (planet units), closing in at the end. */
  clearance: 2,
};

/** Path samples tested against the ground, and the most times the path is bowed further out to clear it. */
const SAMPLES = 24;
const TRIES = 30;
const point = new THREE.Vector3();
const dir = new THREE.Vector3();
const outward = new THREE.Vector3();
const across = new THREE.Vector3();

/** Point `u` (0 → 1) of the quadratic Bézier from `from` through control point `control` to `to`, written into `out`. */
export function pathPoint(from: THREE.Vector3, control: THREE.Vector3, to: THREE.Vector3, u: number, out: THREE.Vector3): THREE.Vector3 {
  const a = (1 - u) * (1 - u);
  const b = 2 * u * (1 - u);
  const c = u * u;
  return out.set(
    a * from.x + b * control.x + c * to.x,
    a * from.y + b * control.y + c * to.y,
    a * from.z + b * control.z + c * to.z,
  );
}

/**
 * The control point of the path from `from` (the ship) to `to` (a point on
 * the ground), both relative to the globe's centre, written into `out`: the
 * midpoint, so a straight line, when nothing is in the way; else pushed out
 * from the globe (through the line's midpoint) until the path passes over
 * the ground between, `ground(dir)` being its radius in a unit direction.
 * The clearance closes to nothing over the last stretch, where the
 * projectile comes down onto its point.
 */
export function pathControl(
  from: THREE.Vector3,
  to: THREE.Vector3,
  ground: (dir: THREE.Vector3) => number,
  out: THREE.Vector3,
  clearance = pathParams.clearance,
): THREE.Vector3 {
  out.addVectors(from, to).multiplyScalar(0.5);
  const reach = Math.max(from.length(), to.length());
  // Out from the globe at the middle of the way; round one side when the
  // point is (nearly) opposite the ship and the middle is near the centre.
  outward.copy(out);
  if (outward.length() < 0.25 * reach) {
    across.copy(to).addScaledVector(from, -to.dot(from) / from.lengthSq());
    if (across.lengthSq() < 1e-6 * reach * reach) across.set(from.y, -from.x, 0).add(dir.set(0, from.z, -from.y));
    outward.addScaledVector(across.normalize(), 0.5 * reach);
  }
  outward.normalize();
  let step = 0.05 * reach;
  for (let k = 0; k < TRIES && !clears(from, out, to, ground, clearance); k++) {
    out.addScaledVector(outward, step);
    step *= 1.3;
  }
  return out;
}

/** True if the path keeps `clearance` over the ground until near its end (less and less over its last fifth). */
function clears(from: THREE.Vector3, control: THREE.Vector3, to: THREE.Vector3, ground: (dir: THREE.Vector3) => number, clearance: number): boolean {
  for (let i = 1; i < SAMPLES; i++) {
    const u = i / SAMPLES;
    pathPoint(from, control, to, u, point);
    const r = point.length();
    const need = clearance * Math.min(1, (1 - u) / 0.2);
    if (r - ground(dir.copy(point).divideScalar(r)) < need) return false;
  }
  return true;
}
