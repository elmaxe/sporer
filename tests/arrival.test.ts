import { describe, expect, it } from 'vitest';
import { arrivalParams, clampElevation, hoverViewElevation } from '../src/levels/arrival';

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

describe('hoverViewElevation', () => {
  // How far below the view's centre the body's centre shows, from a camera `d` from a ship `h` above it.
  const offAxis = (d: number, h: number, e: number) => {
    const camera = { x: d * Math.cos(e), y: d * Math.sin(e) };
    const look = { x: -camera.x / d, y: -camera.y / d };
    const toBody = { x: -camera.x, y: -h - camera.y };
    return Math.acos((look.x * toBody.x + look.y * toBody.y) / Math.hypot(toBody.x, toBody.y));
  };

  it('looks down just far enough to bring the body to the given angle below the centre', () => {
    for (const [d, h] of [
      [90, 240],
      [45, 25],
      [12, 60],
    ] as const) {
      const e = hoverViewElevation(d, h, 16 * deg);
      expect(e).toBeGreaterThan(0);
      expect(offAxis(d, h, e)).toBeCloseTo(16 * deg);
      // Any lower and the body is farther down the screen.
      expect(offAxis(d, h, e - 0.05)).toBeGreaterThan(16 * deg);
    }
  });

  it('needs no elevation when the body is already in view looking level', () => {
    expect(hoverViewElevation(1000, 30, 16 * deg)).toBe(0);
  });
});
