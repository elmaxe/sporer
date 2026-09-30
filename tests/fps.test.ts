import { describe, expect, it } from 'vitest';
import { FpsWindow } from '../src/ui/fps';

/** Feeds frames `dt` ms apart, `n` times, starting at `t`; returns the time after. */
const run = (w: FpsWindow, t: number, dt: number, n: number) => {
  for (let i = 0; i < n; i++) w.frame((t += dt));
  return t;
};

describe('FPS window', () => {
  it('reads steady frame rates', () => {
    const w = new FpsWindow(500);
    run(w, 0, 1000 / 60, 70);
    expect(w.fps).toBeCloseTo(60, 5);
    expect(w.longestMs).toBeCloseTo(1000 / 60, 5);
    run(w, 2000, 1000 / 30, 40);
    expect(w.fps).toBeCloseTo(30, 5);
  });

  it('reports only once per window', () => {
    const w = new FpsWindow(500);
    let readings = 0;
    for (let t = 0; t <= 2000; t += 10) if (w.frame(t)) readings++;
    expect(readings).toBe(4);
  });

  it('shows a stutter as the longest frame', () => {
    const w = new FpsWindow(500);
    let t = run(w, 0, 16, 10);
    t = run(w, t, 120, 1);
    run(w, t, 16, 30);
    expect(w.longestMs).toBe(120);
    expect(w.fps).toBeLessThan(55);
  });

  it('starts over after a long gap (tab hidden) instead of reading one huge frame', () => {
    const w = new FpsWindow(500, 1000);
    let t = run(w, 0, 16, 40);
    t += 5000;
    expect(w.frame(t)).toBe(false);
    run(w, t, 16, 40);
    expect(w.longestMs).toBe(16);
    expect(w.fps).toBeCloseTo(62.5, 5);
  });
});
