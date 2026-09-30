import * as THREE from 'three';
import { EARTH_GAME_RADIUS, EARTH_GLOBE_RADIUS, GLOBE_SIZE_FACTOR } from '../gen/planets';

/*
 * Maths linking the planet level to the system it sits in. Pure (THREE maths
 * types only, no scene), unit-tested in tests/planet.test.ts.
 *
 * The planet level works in the body's own frame: the planet sits at the
 * origin, tilted and spinning with it, so the ground stays put while the sky
 * turns overhead. It is the system view magnified by one factor for every
 * body (PLANET_SCALE), while the ship, its altitude and the camera keep the
 * same size: so a dwarf is a small ball under the ship and a gas giant a
 * nearly flat horizon.
 */

export { EARTH_GLOBE_RADIUS };

/** Mountains are exaggerated a little up close, where the system view's relief reads as flat. */
export const RELIEF_SCALE = 1.6;

/** Planet-level units per system unit, the same for every body. */
export const PLANET_SCALE = EARTH_GLOBE_RADIUS / EARTH_GAME_RADIUS;

/** A planet or moon's radius in planet-level units: EARTH_GLOBE_RADIUS for Earth, 0.1× that for the smallest moons, 4.25× for the biggest giants. */
export function globeRadius(systemRadius: number): number {
  return systemRadius * PLANET_SCALE;
}

/**
 * Autopilot speed factor over a globe: √(radius / Earth's), within
 * [0.5, 2.1]. A giant's surface still takes longer to cross than a dwarf's,
 * just not 17× longer. Times √GLOBE_SIZE_FACTOR: on bigger globes the UFO
 * is faster, though not by the whole factor, so a crossing takes a little
 * longer and the ground doesn't race by under the (relatively smaller) ship.
 */
export function travelScale(radius: number): number {
  return Math.sqrt(GLOBE_SIZE_FACTOR) * Math.min(2.1, Math.max(0.5, Math.sqrt(radius / EARTH_GLOBE_RADIUS)));
}

/** The low-orbit camera's max distance from the ship: `max` for Earth-sized and up, less for small globes (never below `min`). */
export function maxViewDistance(radius: number, max: number, min = 100 * GLOBE_SIZE_FACTOR): number {
  return Math.min(max, Math.max(min, (max * radius) / EARTH_GLOBE_RADIUS));
}

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const tilted = new THREE.Quaternion();
const spun = new THREE.Quaternion();

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
