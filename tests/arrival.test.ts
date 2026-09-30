import { describe, expect, it } from 'vitest';
import { arrivalParams, clampElevation } from '../src/levels/arrival';

const deg = Math.PI / 180;
const elevation = (v: { x: number; y: number; z: number }) => Math.atan2(v.y, Math.hypot(v.x, v.z));

describe('clampElevation', () => {
  const [low, high] = arrivalParams.shipElevation;

  it('brings a view from below the ecliptic up to just above it, keeping the heading', () => {
    const out = clampElevation({ x: 0.3, y: -0.9, z: 0.3 }, low, high, { x: 0, y: 0, z: 0 });
    expect(elevation(out)).toBeCloseTo(low);
    expect(Math.atan2(out.x, out.z)).toBeCloseTo(Math.PI / 4);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1);
  });

  it('flattens a view from high above, and leaves one already in range alone', () => {
    expect(elevation(clampElevation({ x: 0, y: 1, z: 0.1 }, low, high, { x: 0, y: 0, z: 0 }))).toBeCloseTo(high);
    const inRange = { x: Math.cos(3 * deg), y: Math.sin(3 * deg), z: 0 };
    const out = clampElevation(inRange, low, high, { x: 0, y: 0, z: 0 });
    expect(out.x).toBeCloseTo(inRange.x);
    expect(out.y).toBeCloseTo(inRange.y);
  });

  it('picks a heading when looking straight up or down', () => {
    const out = clampElevation({ x: 0, y: -1, z: 0 }, low, high, { x: 0, y: 0, z: 0 });
    expect(elevation(out)).toBeCloseTo(low);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(1);
  });

  it('can write in place', () => {
    const v = { x: 0, y: -2, z: 5 };
    clampElevation(v, low, high, v);
    expect(elevation(v)).toBeCloseTo(low);
  });

  it('never puts the ship below the ecliptic, and the camera above it', () => {
    expect(arrivalParams.shipElevation[0]).toBeGreaterThanOrEqual(0);
    expect(arrivalParams.cameraElevation[0]).toBeGreaterThan(0);
  });
});
