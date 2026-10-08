/*
 * How fast and with what stride an animal walks and trots, from its hip
 * height and its world's gravity: dynamic similarity (Alexander). Pure,
 * shared by the herds (gen/animals.ts) and the creature editor's bodies
 * (gen/creature.ts).
 */

/**
 * Dynamic similarity (Alexander): animals of any size move alike at equal
 * Froude numbers Fr = v²/(g·h), h the hip height, taking strides of
 * λ/h = 2.3·Fr^0.3 (Alexander 1976, the trackway formula v = 0.25·g^½·λ^1.67·h^−1.17).
 * They stroll at Fr ≈ 0.25 (people's preferred 1.4 m/s on 0.89 m legs is
 * 0.22), and quadrupeds go from an amble to a trot at Fr ≈ 1
 * (docs/research/animals.md).
 */
export const WALK_FROUDE = 0.25;
export const TROT_FROUDE = 1;
export const STRIDE_COEFFICIENT = 2.3;
export const STRIDE_EXPONENT = 0.3;
/** Earth's surface gravity, m/s² (units/s², animals' units read as metres). */
export const EARTH_G = 9.81;

/** How an animal of a species moves on a world of gravity `gravity` (Earth = 1). */
export interface AnimalGait {
  /** Hip height (units) and gravity (units/s²) it scales with. */
  readonly hip: number;
  readonly g: number;
  /** Walking and trotting speed (units/s) and stride length (units: one full cycle of every leg). */
  readonly walkSpeed: number;
  readonly trotSpeed: number;
  readonly walkStride: number;
  readonly trotStride: number;
}

/** A species' gait from its skeleton's hip height (see the dynamic similarity constants above). */
export function animalGait(skeleton: { readonly hipHeight: number }, gravity: number): AnimalGait {
  const hip = Math.max(0.05, skeleton.hipHeight);
  const g = EARTH_G * Math.max(0.05, gravity);
  const speed = (fr: number) => Math.sqrt(fr * g * hip);
  const stride = (fr: number) => STRIDE_COEFFICIENT * fr ** STRIDE_EXPONENT * hip;
  return { hip, g, walkSpeed: speed(WALK_FROUDE), trotSpeed: speed(TROT_FROUDE), walkStride: stride(WALK_FROUDE), trotStride: stride(TROT_FROUDE) };
}
