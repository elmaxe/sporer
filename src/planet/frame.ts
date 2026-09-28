import * as THREE from 'three';

/*
 * Maths linking the planet level to the system it sits in. Pure (THREE maths
 * types only, no scene), unit-tested in tests/planet.test.ts.
 *
 * The planet level works in the body's own frame: the planet sits at the
 * origin with radius PLANET_RADIUS whatever its system radius, tilted and
 * spinning with it, so the ground stays put while the sky turns overhead.
 */

/** A planet or moon's radius in planet-level units. */
export const PLANET_RADIUS = 100;

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const tilted = new THREE.Quaternion();
const spun = new THREE.Quaternion();

/** Planet-level units per system unit for a body of the given system radius. */
export function planetScale(systemRadius: number): number {
  return PLANET_RADIUS / systemRadius;
}

/**
 * The body frame's orientation in system space: the axial tilt about Z, then
 * the spin about the tilted axis (like the system view's tilted group holding
 * the spinning surface).
 */
export function bodyFrame(tilt: number, spinAngle: number, out: THREE.Quaternion): THREE.Quaternion {
  tilted.setFromAxisAngle(Z, tilt);
  spun.setFromAxisAngle(Y, spinAngle);
  return out.multiplyQuaternions(tilted, spun);
}

/** A planet-level point in system space: `center + frame · local / scale`. */
export function localToSystem(
  local: THREE.Vector3,
  center: THREE.Vector3,
  frame: THREE.Quaternion,
  scale: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  return out.copy(local).applyQuaternion(frame).divideScalar(scale).add(center);
}

/**
 * Unit direction from the body towards `star`, in the body frame (`inverse`
 * is the inverted body frame). Where the planet level's sunlight comes from.
 */
export function lightDirection(
  star: THREE.Vector3,
  body: THREE.Vector3,
  inverse: THREE.Quaternion,
  out: THREE.Vector3,
): THREE.Vector3 {
  return out.subVectors(star, body).normalize().applyQuaternion(inverse);
}

/** Angle between the centre and the edge of a sphere of `radius` seen from `distance`. */
export function angularRadius(radius: number, distance: number): number {
  return distance <= radius ? Math.PI / 2 : Math.asin(radius / distance);
}

/**
 * How much to enlarge a body in the sky so it covers at least `minAngle`
 * (its true size when it's already bigger than that): distant planets stay
 * visible as small bright dots, like planets in a night sky.
 */
export function skyScale(radius: number, distance: number, minAngle: number): number {
  if (angularRadius(radius, distance) >= minAngle) return 1;
  return (distance * Math.sin(minAngle)) / radius;
}
