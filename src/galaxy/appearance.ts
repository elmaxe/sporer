import type { StarRef } from '../gen/galaxy';

/**
 * Diameter of a star's dot on the galaxy map, in galaxy units. Follows the
 * primary's radius (giants big, dwarfs small); binaries are a bit bigger.
 * Neighbouring stars are ~25 units apart, so a G star (~1.25) stays a dot.
 */
export function galaxyStarSize(ref: StarRef): number {
  const size = 0.5 + ref.stars[0]!.radius / 40;
  return ref.stars.length > 1 ? size * 1.15 : size;
}
