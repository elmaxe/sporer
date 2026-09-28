import { describe, expect, it } from 'vitest';
import { FixedStep } from '../src/core/FixedStep';

describe('FixedStep', () => {
  const STEP = 1 / 60;

  it('runs no steps until a full step has accumulated', () => {
    const fs = new FixedStep(STEP);
    expect(fs.advance(STEP * 0.5)).toBe(0);
    expect(fs.alpha).toBeCloseTo(0.5);
    expect(fs.advance(STEP * 0.5)).toBe(1);
    expect(fs.alpha).toBeCloseTo(0);
  });

  it('runs multiple steps for a long frame and keeps the remainder', () => {
    const fs = new FixedStep(STEP);
    expect(fs.advance(STEP * 2.25)).toBe(2);
    expect(fs.alpha).toBeCloseTo(0.25);
  });

  it('caps steps and drops the backlog after a stall', () => {
    const fs = new FixedStep(STEP, 5);
    expect(fs.advance(1)).toBe(5);
    expect(fs.alpha).toBe(0);
  });

  it('ignores negative frame times', () => {
    const fs = new FixedStep(STEP);
    expect(fs.advance(-1)).toBe(0);
    expect(fs.alpha).toBe(0);
  });

  it('simulates the right total time at 144 Hz', () => {
    const fs = new FixedStep(STEP);
    let steps = 0;
    for (let i = 0; i < 144; i++) steps += fs.advance(1 / 144);
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(60);
  });
});
