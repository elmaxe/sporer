/**
 * Frames per second over windows of `windowMs`, from the times frames were
 * drawn (ms, e.g. performance.now()), plus the longest frame in the window
 * (a stutter shows there before it shows in the average). A gap longer than
 * `resetMs` (the tab was hidden, the page paused) starts over rather than
 * reading as one very slow frame.
 */
export class FpsWindow {
  /** The latest reading: frames per second, and the longest frame in ms. */
  fps = 0;
  longestMs = 0;
  private start = -1;
  private last = -1;
  private frames = 0;
  private longest = 0;

  constructor(
    private readonly windowMs = 500,
    private readonly resetMs = 1000,
  ) {}

  /** Counts a frame drawn at `now`; true when a new reading is ready. */
  frame(now: number): boolean {
    const gap = now - this.last;
    if (this.last < 0 || gap > this.resetMs) {
      this.start = this.last = now;
      this.frames = 0;
      this.longest = 0;
      return false;
    }
    this.last = now;
    this.frames++;
    this.longest = Math.max(this.longest, gap);
    const span = now - this.start;
    if (span < this.windowMs) return false;
    this.fps = (this.frames * 1000) / span;
    this.longestMs = this.longest;
    this.start = now;
    this.frames = 0;
    this.longest = 0;
    return true;
  }
}
