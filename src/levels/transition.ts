/** One leg of a level transition: a camera zoom plus a fade, over `duration` seconds. */
export interface TransitionPhase {
  /** Camera distances at the start and end (interpolated in log space). */
  from: number;
  to: number;
  duration: number;
  /** Overlay opacity at the start and end (0 = clear, 1 = black). */
  fadeFrom: number;
  fadeTo: number;
}

/** Ease-in-out on [0, 1]. */
export function ease(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
}

/** Camera distance and fade `elapsed` seconds into `phase`. */
export function samplePhase(phase: TransitionPhase, elapsed: number): { distance: number; fade: number } {
  const u = phase.duration > 0 ? Math.min(1, elapsed / phase.duration) : 1;
  return {
    // Equal zoom ratios per unit time, like the wheel zoom.
    distance: phase.from * Math.pow(phase.to / phase.from, ease(u)),
    fade: phase.fadeFrom + (phase.fadeTo - phase.fadeFrom) * u,
  };
}
