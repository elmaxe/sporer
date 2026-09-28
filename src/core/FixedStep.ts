/**
 * Fixed-timestep accumulator. Feed it real frame time; it tells you how many
 * fixed steps to simulate and the interpolation factor for rendering.
 */
export class FixedStep {
  private accumulator = 0;

  constructor(
    readonly step: number,
    /** Cap on steps per frame, prevents a "spiral of death" after a stall. */
    readonly maxSteps = 5,
  ) {}

  /** Returns the number of fixed steps to run for this frame. */
  advance(frameDt: number): number {
    this.accumulator += Math.max(0, frameDt);
    let steps = Math.floor(this.accumulator / this.step);
    if (steps > this.maxSteps) {
      steps = this.maxSteps;
      // Drop the backlog rather than trying to catch up forever.
      this.accumulator = 0;
    } else {
      this.accumulator -= steps * this.step;
    }
    return steps;
  }

  /** Fraction of a step left over after `advance`, in [0, 1). */
  get alpha(): number {
    return this.accumulator / this.step;
  }
}
