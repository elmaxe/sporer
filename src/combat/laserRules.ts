/*
 * The laser's rules (pure): how wide it's drawn, what it reaches round where
 * it meets the ground, and how what it kills burns away. combat/Laser.ts
 * draws and fires it.
 */

export const laserParams = {
  /** The beam's core radius up close (planet units); never thinner than `minAngle` of its distance from the camera. */
  width: 0.12,
  /** Its radius as a share of its distance from the camera, at least: about two pixels across on a 720 px view (65° field of view). */
  minAngle: 0.0018,
  /** Animals and plants this far (units) round where it meets the ground are hit too: it sweeps a little, so it's easy to aim. */
  reach: 1.2,
  /** Seconds a plant takes to burn down to ash, and an animal to fall, burn and sink away. */
  plantBurn: 1.8,
  animalBurn: 2.4,
  /** Sparks and puffs of smoke thrown a second where it meets the ground. */
  sparks: 90,
  smoke: 14,
};

/** The beam's core radius where it's `distance` from the camera. */
export function laserWidth(distance: number, p = laserParams): number {
  return Math.max(p.width, distance * p.minAngle);
}

/** How a killed animal or plant is burning `age` seconds after the hit, over `duration` seconds: each part 0 to 1. */
export interface Burn {
  /** Blackened. */
  char: number;
  /** Glowing embers (up quickly, then dying out). */
  glow: number;
  /** An animal falling onto its side. */
  topple: number;
  /** Crumbling or sinking away into the ground. */
  gone: number;
  /** Over: take it away. */
  done: boolean;
}

/** The burn at `age` seconds of `duration`, into `out`. */
export function burnAt(age: number, duration: number, out: Burn): Burn {
  const u = Math.max(0, age / duration);
  out.char = smooth(0, 0.35, u);
  out.glow = smooth(0, 0.08, u) * (1 - smooth(0.2, 0.6, u));
  out.topple = smooth(0, 0.22, u);
  out.gone = smooth(0.5, 1, u);
  out.done = u >= 1;
  return out;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
