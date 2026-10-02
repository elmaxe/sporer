/** Frame-time statistics over the frames kept (milliseconds). */
export interface FrameStats {
  frames: number;
  fps: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

/**
 * The durations of the latest `capacity` frames, for the debug dump's
 * performance numbers. Allocation-free per frame (a fixed ring).
 */
export class FrameTimes {
  private readonly ring: Float64Array;
  private count = 0;
  private next = 0;
  private last = -1;

  constructor(readonly capacity = 600) {
    this.ring = new Float64Array(capacity);
  }

  /** Marks a frame drawn at `nowMs` (performance.now); the gap since the last one is its duration. */
  frame(nowMs: number): void {
    if (this.last >= 0) {
      this.ring[this.next] = nowMs - this.last;
      this.next = (this.next + 1) % this.capacity;
      this.count = Math.min(this.count + 1, this.capacity);
    }
    this.last = nowMs;
  }

  /** The frame durations kept, oldest first. */
  durations(): number[] {
    const out: number[] = [];
    const start = (this.next - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) out.push(this.ring[(start + i) % this.capacity]!);
    return out;
  }

  stats(): FrameStats | null {
    const d = this.durations();
    if (d.length === 0) return null;
    const total = d.reduce((a, b) => a + b, 0);
    const sorted = d.slice().sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
    const round = (x: number) => Math.round(x * 10) / 10;
    return {
      frames: d.length,
      fps: round((1000 * d.length) / total),
      meanMs: round(total / d.length),
      p50Ms: round(at(0.5)),
      p95Ms: round(at(0.95)),
      maxMs: round(sorted[sorted.length - 1]!),
    };
  }
}
