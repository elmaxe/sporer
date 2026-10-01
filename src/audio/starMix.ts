import type { StarKind } from '../gen/stars';

/**
 * How the stars sound from where the camera is (tunables in the 'Star sound'
 * debug folder). Heights are measured from a star's surface in units of
 * `radius + scale`, so a white dwarf (r≈7) isn't drowned out by the ship
 * hovering a few of its radii away, while a giant still sounds near from
 * further out than a red dwarf.
 */
export const starSoundParams = {
  /** System units added to a star's radius to make the height unit. */
  scale: 30,
  /** Height (in those units) at which the star is at half strength. */
  reach: 6,
  /** Below this height only the near sound plays… */
  nearFrom: 0.4,
  /** …and above this one only the far sound. */
  nearTo: 3,
};

/** Playback rate per star kind (one pair of files for all: giants deeper, dwarfs higher). */
export const starPitch: Record<StarKind, number> = {
  mainSequence: 1,
  redDwarf: 0.9,
  whiteDwarf: 1.2,
  redGiant: 0.8,
  blueGiant: 1.05,
};

export interface StarMix {
  /** Level (0–1) of the near loop. */
  near: number;
  /** Level (0–1) of the far loop. */
  far: number;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * One star's near and far levels for a listener `distance` from its centre,
 * written into `out`. Its strength falls off as 1 / (1 + (h / reach)²) with
 * height h above the surface, and is shared between the two loops with an
 * equal-power crossfade from near (low) to far (high).
 */
export function starMix(distance: number, radius: number, out: StarMix, params = starSoundParams): StarMix {
  const h = Math.max(0, distance - radius) / (radius + params.scale);
  const strength = 1 / (1 + (h / params.reach) ** 2);
  const angle = smoothstep(params.nearFrom, params.nearTo, h) * (Math.PI / 2);
  out.near = strength * Math.cos(angle);
  out.far = strength * Math.sin(angle);
  return out;
}

const one: StarMix = { near: 0, far: 0 };

/**
 * The levels of several stars together (a binary), star i `distances[i]`
 * away with radius `radii[i]`: their powers add, capped at 1, since they all
 * play through the same two loops. Allocation-free.
 */
export function starsMix(
  distances: ArrayLike<number>,
  radii: ArrayLike<number>,
  out: StarMix,
  params = starSoundParams,
): StarMix {
  let near = 0;
  let far = 0;
  for (let i = 0; i < distances.length; i++) {
    starMix(distances[i]!, radii[i]!, one, params);
    near += one.near * one.near;
    far += one.far * one.far;
  }
  out.near = Math.min(1, Math.sqrt(near));
  out.far = Math.min(1, Math.sqrt(far));
  return out;
}
