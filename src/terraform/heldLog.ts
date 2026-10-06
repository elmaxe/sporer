import type { Lever } from '../gen/terraform';
import type { Terraforming } from './Terraforming';

/** A held tool is written to the log as one action a second, each at the rate the world has then (the gas rays compound). */
export const SEGMENT = 1;

/** What a held tool does over the next second: the lever and its rate a second. */
export interface HeldEffect {
  lever: Lever;
  rate: number;
}

/**
 * Writes a held tool (a magic ray, the aerosol spray) into a body's action
 * log as it's held: the action of this second grows, and each new second
 * starts a new one at the rate `next` gives for its start (null: nothing to
 * do now, e.g. nothing left to take). No THREE: the tools in low orbit call
 * `write` every frame they're held, and once more as they're let go.
 */
export class HeldLog {
  private segment: { index: number; start: number; lever: Lever; rate: number } | null = null;

  constructor(
    private readonly terraforming: Terraforming,
    private readonly key: string,
  ) {}

  /** Starts afresh: the next write begins a new action (the tool was picked up again, or what it does changed). */
  reset(): void {
    this.segment = null;
  }

  /**
   * Writes the held tool into the log up to the game time now (`last`:
   * letting go, nothing new starts). `site`: where it's aimed, a unit vector
   * in the body frame, for the looks.
   */
  write(last: boolean, next: (time: number) => HeldEffect | null, site?: [number, number, number]): void {
    const t = this.terraforming;
    const now = t.time;
    let start = now;
    const seg = this.segment;
    if (seg) {
      const end = Math.min(now, seg.start + SEGMENT);
      t.logs.update(this.key, seg.index, { lever: seg.lever, start: seg.start, duration: end - seg.start, amount: seg.rate * (end - seg.start), site });
      if (last || now < seg.start + SEGMENT) return;
      start = seg.start + SEGMENT;
    }
    if (last) return;
    const effect = next(start);
    if (!effect) {
      this.segment = null;
      return;
    }
    const duration = Math.min(now - start, SEGMENT);
    const index = t.logs.record(this.key, { lever: effect.lever, start, duration, amount: effect.rate * duration, site });
    this.segment = { index, start, lever: effect.lever, rate: effect.rate };
  }
}
