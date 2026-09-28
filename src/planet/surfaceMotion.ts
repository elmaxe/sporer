import * as THREE from 'three';
import { arriveImpulse, type ArriveParams } from '../player/autopilot';

/*
 * Moving over a sphere: a position is a unit direction `u`, a velocity is a
 * vector tangent to the sphere at `u` (units per second at the flying
 * radius). Pure maths, unit-tested in tests/planet.test.ts.
 */

const axis = new THREE.Vector3();
const toward = new THREE.Vector3();
const goal = new THREE.Vector3();
const ORIGIN = new THREE.Vector3();

/**
 * Unit tangent at `u` pointing along the shortest great circle to `target`
 * (both unit vectors), written into `out`. Returns the angle between them.
 * At the antipode every direction is equally short, so any tangent is used.
 */
export function greatCircleDirection(u: THREE.Vector3, target: THREE.Vector3, out: THREE.Vector3): number {
  const cos = THREE.MathUtils.clamp(u.dot(target), -1, 1);
  out.copy(target).addScaledVector(u, -cos);
  if (out.lengthSq() < 1e-12) {
    // At the target (or its antipode): pick any tangent.
    out.set(1, 0, 0).addScaledVector(u, -u.x);
    if (out.lengthSq() < 1e-6) out.set(0, 0, 1).addScaledVector(u, -u.z);
  }
  out.normalize();
  return Math.acos(cos);
}

/**
 * The rotation that carries a body at `u` moving with tangent velocity `v`
 * over the sphere of `radius` for `dt` seconds. Apply it to `u`, `v` and
 * anything else riding along (a heading): that transports them parallel, so
 * they stay tangent and don't twist.
 */
export function sphereStep(
  u: THREE.Vector3,
  v: THREE.Vector3,
  radius: number,
  dt: number,
  out: THREE.Quaternion,
): THREE.Quaternion {
  const speed = v.length();
  if (speed < 1e-9) return out.identity();
  axis.crossVectors(u, v).normalize();
  return out.setFromAxisAngle(axis, (speed * dt) / radius);
}

/**
 * Arrive steering along the surface: the same `arriveImpulse` as the system
 * autopilot, applied in the tangent plane with the distance measured as arc
 * length along the great circle to `target`. Writes the (tangent) velocity
 * change into `out` and returns the arc length left.
 */
export function surfaceArriveImpulse(
  u: THREE.Vector3,
  v: THREE.Vector3,
  target: THREE.Vector3,
  radius: number,
  params: ArriveParams,
  dt: number,
  out: THREE.Vector3,
): number {
  const arc = greatCircleDirection(u, target, toward) * radius;
  goal.copy(toward).multiplyScalar(arc);
  arriveImpulse(ORIGIN, v, goal, ORIGIN, params, dt, out);
  // v and the goal are both tangent, so the impulse is too; remove rounding drift.
  out.addScaledVector(u, -out.dot(u));
  return arc;
}
