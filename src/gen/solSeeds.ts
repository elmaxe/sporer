/*
 * The Sol system's bodies' seeds (gen/sol.ts). Negative, which no generator
 * ever draws (they draw 0 – 1 000 000, or 32-bit hashes), so a seed alone says
 * "this is a real body": `terrainNoise` reads Earth's, the Moon's, Mars's and
 * Pluto's real height maps for theirs (gen/realSurface.ts), and
 * `generateGasLayout` gives the four giants their real cloud bands.
 */
export const SOL_SEEDS = {
  earth: -1001,
  moon: -1002,
  mars: -1003,
  pluto: -1004,
  mercury: -1005,
  venus: -1006,
  jupiter: -1007,
  saturn: -1008,
  uranus: -1009,
  neptune: -1010,
} as const;

/** Seeds for the other moons, Sol's comet and its named asteroids: -1100, -1101, ... in the order they're made. */
export const SOL_MINOR_SEED = -1100;
