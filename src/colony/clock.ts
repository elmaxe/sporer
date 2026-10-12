/*
 * The clock colonies grow by (gen/colony.ts): the device's, in ms since 1970,
 * so a colony keeps growing while the player is in another system or away
 * from the game (the systems' own clocks start afresh with every visit).
 * `offset` winds it: a debug dump restores the moment it was saved, and the
 * smoke test fast-forwards a colony to see it grow.
 */
export const colonyClock = {
  /** Added to the device's clock (ms). */
  offset: 0,
  now(): number {
    return Date.now() + colonyClock.offset;
  },
};
