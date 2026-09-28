import { describe, expect, it } from 'vitest';
import { ease, samplePhase } from '../src/levels/transition';

describe('samplePhase', () => {
  const phase = { from: 10, to: 1000, duration: 2, fadeFrom: 0, fadeTo: 1 };

  it('starts and ends at the given distance and fade', () => {
    expect(samplePhase(phase, 0)).toEqual({ distance: 10, fade: 0 });
    const end = samplePhase(phase, 2);
    expect(end.distance).toBeCloseTo(1000);
    expect(end.fade).toBe(1);
    expect(samplePhase(phase, 5).distance).toBeCloseTo(1000);
  });

  it('zooms in log space: halfway in time is the geometric mean', () => {
    expect(samplePhase(phase, 1).distance).toBeCloseTo(100);
  });

  it('eases in and out', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.1)).toBeLessThan(0.1);
    expect(ease(0.9)).toBeGreaterThan(0.9);
  });
});
