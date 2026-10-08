/*
 * The scanner's rules (pure): how long a scan takes and what happens to one
 * whose target slips away. The scanner itself is scan/Scanner.ts.
 */

export const scanParams = {
  /** Seconds the scanner must be held on an animal or a plant to read it. */
  time: 2.2,
  /** Seconds a scan keeps its progress after the pointer slips off what it was reading (an animal walking off, a shaky hand). */
  grace: 0.5,
  /** How fast the progress drains after that (whole scans per second). */
  drain: 0.8,
  /** The beam's foot: as wide as this share of what it reads (its reach across). */
  footWidth: 1.4,
};

/** A scan under way: how far it is (0–1) and how long it has been off its target (s). */
export interface ScanState {
  progress: number;
  lost: number;
}

/**
 * One step of a scan, `dt` seconds long: it fills while `onTarget` (in
 * `scanParams.time`), holds for `grace` seconds after slipping off, then
 * drains. Returns whether it completed in this step (progress reaches 1).
 */
export function stepScan(state: ScanState, dt: number, onTarget: boolean, params = scanParams): boolean {
  if (onTarget) {
    state.lost = 0;
    const before = state.progress;
    state.progress = Math.min(1, state.progress + dt / Math.max(params.time, 1e-3));
    return before < 1 && state.progress >= 1;
  }
  state.lost += dt;
  if (state.lost > params.grace) state.progress = Math.max(0, state.progress - params.drain * dt);
  return false;
}

/** The scan's progress as the hint line says it: a whole percentage, never 100 before it's done. */
export function scanPercent(progress: number): number {
  return progress >= 1 ? 100 : Math.min(99, Math.floor(progress * 100));
}
