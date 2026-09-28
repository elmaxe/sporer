import { describe, expect, it } from 'vitest';
import { orbitPosition, type Orbit } from '../src/world/orbit';
import { terrainNoise } from '../src/world/noise';

describe('orbitPosition', () => {
  const flat: Orbit = { radius: 100, period: 10, phase: 0, inclination: 0 };

  it('starts at the phase angle', () => {
    const p = orbitPosition(flat, 0, { x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);
  });

  it('completes a revolution in one period', () => {
    const quarter = orbitPosition(flat, 2.5, { x: 0, y: 0, z: 0 });
    expect(quarter.x).toBeCloseTo(0);
    expect(quarter.z).toBeCloseTo(100);
    const full = orbitPosition(flat, 10, { x: 0, y: 0, z: 0 });
    expect(full.x).toBeCloseTo(100);
    expect(full.z).toBeCloseTo(0);
  });

  it('keeps the radius constant when inclined', () => {
    const tilted: Orbit = { ...flat, inclination: 0.4 };
    for (const t of [0.7, 3.1, 8.9]) {
      const p = orbitPosition(tilted, t, { x: 0, y: 0, z: 0 });
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(100);
    }
    expect(orbitPosition(tilted, 2.5, { x: 0, y: 0, z: 0 }).y).toBeGreaterThan(0);
  });
});

describe('terrainNoise', () => {
  it('is deterministic for the same input and seed', () => {
    expect(terrainNoise(0.3, -0.5, 0.8, 7)).toBe(terrainNoise(0.3, -0.5, 0.8, 7));
  });

  it('varies with the seed', () => {
    expect(terrainNoise(0.3, -0.5, 0.8, 7)).not.toBe(terrainNoise(0.3, -0.5, 0.8, 8));
  });

  it('stays within [-1, 1]', () => {
    for (let i = 0; i < 1000; i++) {
      const n = terrainNoise(Math.sin(i), Math.cos(i * 1.3), Math.sin(i * 0.7), i % 13);
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});
