/**
 * Work a constructor can put off: building meshes, textures and shaders that
 * aren't needed until the thing is first drawn. A level built for a zoom into
 * it hands its `Jobs.defer` down, and the scene manager runs the jobs a few
 * per frame while the outgoing level plays alone, so building it doesn't
 * freeze a frame; everywhere else (labs, tests) `now` runs them at once.
 */
export type Defer = (job: () => void) => void;

/** Runs the job at once. */
export const now: Defer = (job) => job();

/** Jobs in the order they were put off (a job may put off more, which run after the rest). */
export class Jobs {
  private readonly queue: (() => void)[] = [];
  private next = 0;

  readonly defer: Defer = (job) => {
    this.queue.push(job);
  };

  get done(): boolean {
    return this.next >= this.queue.length;
  }

  get left(): number {
    return this.queue.length - this.next;
  }

  /** Runs jobs until `budget` ms have gone (always at least one, if any are left). */
  run(budget: number, clock: () => number = () => performance.now()): void {
    const end = clock() + budget;
    do {
      if (this.done) break;
      this.queue[this.next++]!();
    } while (clock() < end);
    if (this.done) this.queue.length = this.next = 0;
  }

  /** Runs every job left. */
  runAll(): void {
    this.run(Infinity);
  }
}
