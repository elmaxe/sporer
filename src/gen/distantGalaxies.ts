import { hslToHex } from './color';
import { hashSeed, Rng } from './rng';

export const DISTANT_GALAXY_COUNT = 200;

export type DistantGalaxyKind = 'spiral' | 'elliptical' | 'edgeOn' | 'irregular';

/**
 * A galaxy far outside ours, drawn on the galaxy map's sky (visual only).
 * Sizes are angles, so it looks the same from anywhere in the galaxy.
 */
export interface DistantGalaxy {
  /** Unit vector towards it. */
  direction: { x: number; y: number; z: number };
  kind: DistantGalaxyKind;
  /** Angular radius in radians. */
  size: number;
  /** Inclination in radians: 0 face-on, π/2 edge-on (ellipticals: how squashed). */
  tilt: number;
  /** Position angle on the sky (radians): how the major axis is turned. */
  rotation: number;
  /** Spiral arm count (spirals; ignored otherwise). */
  arms: number;
  /** How tightly the arms wind (log-spiral pitch factor). */
  winding: number;
  /** Disc / body colour. */
  color: string;
  /** Surface brightness, roughly 0–1 before the view's overall intensity. */
  brightness: number;
  /** Offsets the shape noise so no two look alike. */
  seed: number;
}

/** Angular radii, in radians: at 1080p with the 65° camera, one pixel is ~1.2 mrad. */
export const SMALL_SIZE: readonly [number, number] = [0.0024, 0.018];
export const LARGE_SIZE: readonly [number, number] = [0.07, 0.13];

const KIND_WEIGHTS: readonly (readonly [DistantGalaxyKind, number])[] = [
  ['spiral', 45],
  ['elliptical', 25],
  ['edgeOn', 18],
  ['irregular', 12],
];

/**
 * The background of other galaxies for the galaxy map: mostly small and faint,
 * plus one or two large, closer ones. From its own stream (the galaxy seed +
 * 'distantGalaxies'), so it never changes the stars.
 */
export function generateDistantGalaxies(galaxySeed: number, count = DISTANT_GALAXY_COUNT): DistantGalaxy[] {
  const rng = new Rng(hashSeed(galaxySeed, 'distantGalaxies'));
  const large = rng.int(1, 2);
  const out: DistantGalaxy[] = [];
  for (let i = 0; i < count; i++) {
    const g = rng.fork('galaxy', i);
    const isLarge = i < large;
    // Big ones are showpieces: spirals or edge-on discs, never a shapeless blob.
    const kind = isLarge
      ? g.weighted<DistantGalaxyKind>([
          ['spiral', 3],
          ['edgeOn', 1],
        ])
      : g.weighted(KIND_WEIGHTS);
    const [min, max] = isLarge ? LARGE_SIZE : SMALL_SIZE;
    // Log-uniform, squared towards the small end: many tiny, few big.
    const size = min * Math.pow(max / min, isLarge ? g.next() : g.next() ** 2);
    out.push({
      direction: randomDirection(g),
      kind,
      size,
      tilt: kind === 'edgeOn' ? g.range(1.4, 1.54) : kind === 'spiral' ? g.range(0, 1.15) : g.range(0, 1.05),
      rotation: g.range(0, Math.PI * 2),
      arms: g.int(2, 3),
      winding: g.range(1.2, 2.6) * g.sign(),
      color: colorFor(g, kind),
      // Big ones are closer and show their structure, so they may be a bit brighter per pixel.
      brightness: (isLarge ? g.range(0.7, 0.9) : g.range(0.45, 1)) * (kind === 'elliptical' ? 0.8 : 1),
      seed: g.range(0, 100),
    });
  }
  return out;
}

function colorFor(rng: Rng, kind: DistantGalaxyKind): string {
  switch (kind) {
    case 'elliptical':
      return hslToHex(rng.range(28, 45), rng.range(0.35, 0.6), rng.range(0.68, 0.78));
    case 'irregular':
      return hslToHex(rng.range(200, 250), rng.range(0.35, 0.6), rng.range(0.7, 0.8));
    default:
      return hslToHex(rng.range(205, 235), rng.range(0.3, 0.55), rng.range(0.72, 0.82));
  }
}

function randomDirection(rng: Rng): { x: number; y: number; z: number } {
  const y = rng.range(-1, 1);
  const t = rng.range(0, Math.PI * 2);
  const r = Math.sqrt(1 - y * y);
  return { x: r * Math.cos(t), y, z: r * Math.sin(t) };
}
