import type { StarRef } from '../gen/galaxy';
import { hashSeed } from '../gen/rng';
import type { StarData } from '../gen/stars';
import type { PlanetType } from '../gen/planets';

/**
 * Diameter of one star's dot on the galaxy map, in galaxy units. Follows its
 * radius (giants big, dwarfs small). Neighbouring stars are ~25 units apart,
 * so a G star (~1.25) stays a dot.
 */
export function galaxyMemberSize(star: StarData): number {
  return 0.5 + star.radius / 40;
}

/** Distance between a binary's dots, as a multiple of their summed diameters: a clear gap between them. */
const BINARY_SPACING = 0.6;
/** Seconds per turn of a binary on the map (hashed per star, so pairs don't turn in step). */
const BINARY_PERIOD: readonly [number, number] = [30, 90];

/**
 * How a binary is drawn: each member's distance from the pair's centre of
 * mass (galaxy units, so heavier stars move less), plus a turn phase and
 * speed (rad/s). The pair turns in the view plane, so it always reads as two
 * dots; from far away both shrink to the minimum dot size and merge.
 */
export interface BinaryLayout {
  offsets: readonly [number, number];
  phase: number;
  speed: number;
}

export function binaryLayout(ref: StarRef): BinaryLayout | null {
  const [a, b] = ref.stars;
  if (!a || !b) return null;
  const separation = BINARY_SPACING * (galaxyMemberSize(a) + galaxyMemberSize(b));
  const total = a.mass + b.mass;
  // Visual only: hashed from the id rather than drawn from generation streams.
  const h = hashSeed(ref.id, 'binary');
  const period = BINARY_PERIOD[0] + (BINARY_PERIOD[1] - BINARY_PERIOD[0]) * ((h & 0xffff) / 0xffff);
  return {
    offsets: [(separation * b.mass) / total, (separation * a.mass) / total],
    phase: ((h >>> 16) / 0xffff) * Math.PI * 2,
    speed: (Math.PI * 2) / period,
  };
}

/**
 * Diameter of a star system on the map, in galaxy units: its dot, or the
 * circle that holds both of a binary's dots wherever they are in their turn.
 */
export function galaxyStarSize(ref: StarRef): number {
  if (ref.stars.length === 0) return ROGUE_DOT_SIZE;
  const layout = binaryLayout(ref);
  if (!layout) return galaxyMemberSize(ref.stars[0]!);
  return (
    2 *
    Math.max(
      layout.offsets[0] + galaxyMemberSize(ref.stars[0]!) / 2,
      layout.offsets[1] + galaxyMemberSize(ref.stars[1]!) / 2,
    )
  );
}

/** Glow of the galaxy's disc and of its bulge (the galaxy map's glows, and the band in each system's sky). */
export const DISC_GLOW_COLOR = '#6f86c8';
export const BULGE_GLOW_COLOR = '#ffd9a0';

/** A rogue planet's ring on the galaxy map, galaxy units: about a small star's dot. */
export const ROGUE_DOT_SIZE = 1.1;

/** A rogue's ring colour by its surface: dull, so it reads as a cold world, not a star. */
export function rogueColor(type: PlanetType): string {
  switch (type) {
    case 'lava':
      return '#d8703c';
    case 'ocean':
      return '#5aa6b8';
    case 'ice':
      return '#8fb0d0';
    default:
      return '#9a9088';
  }
}

/**
 * Glow closer to the camera than this is left out (see createGlowVolume), so
 * the view from inside the disc isn't fogged; ~10 star spacings.
 */
export const GLOW_NEAR = 250;

/** One of the galaxy map's glow volumes (see createGlowVolume): a Gaussian ellipsoid round the centre, axis-aligned in galaxy coordinates. */
export interface GalaxyGlow {
  radii: { x: number; y: number; z: number };
  color: string;
  faceOnOpacity: number;
  maxBrightness: number;
}

/**
 * The map's glows for a galaxy of radius `r`: faint light over the whole,
 * thin disc and a warmer, brighter, flattened bulge (matching the star
 * distributions in gen/galaxy.ts). Both are symmetric about +Y, so the
 * root's spin doesn't change how their shader sees them. The nebulas use
 * them too, to keep the glow in front of a dark nebula undimmed.
 */
export function galaxyGlows(r: number): GalaxyGlow[] {
  return [
    { radii: { x: r * 1.3, y: r * 0.06, z: r * 1.3 }, color: DISC_GLOW_COLOR, faceOnOpacity: 0.16, maxBrightness: 0.28 },
    { radii: { x: r * 0.45, y: r * 0.2, z: r * 0.45 }, color: BULGE_GLOW_COLOR, faceOnOpacity: 0.45, maxBrightness: 0.8 },
  ];
}
