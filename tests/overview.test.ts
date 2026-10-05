import { describe, expect, it } from 'vitest';
import { aimFrom, overviewDistance, overviewOffset, overviewParams, steerAim } from '../src/debug/overview';

describe('third-person overview', () => {
  it('starts on the side the real camera is, a little above it', () => {
    const aim = aimFrom(10, 0, 0);
    const out = { x: 0, y: 0, z: 0 };
    overviewOffset(aim, 1, out);
    expect(out.x).toBeGreaterThan(0.8);
    expect(out.y).toBeCloseTo(Math.sin(overviewParams.startPitch));
    expect(Math.abs(out.z)).toBeLessThan(1e-9);
    expect(aim.zoom).toBe(1);
  });

  it('puts the offset at the asked distance, never past the pole', () => {
    const aim = aimFrom(0, 1, 0);
    expect(aim.pitch).toBeLessThanOrEqual(overviewParams.maxPitch);
    const out = { x: 0, y: 0, z: 0 };
    overviewOffset({ yaw: 0.7, pitch: -0.4, zoom: 1 }, 5, out);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(5);
    steerAim(aim, 0, 1e6, 0);
    expect(aim.pitch).toBe(overviewParams.maxPitch);
    steerAim(aim, 0, -1e6, 0);
    expect(aim.pitch).toBe(-overviewParams.maxPitch);
  });

  it('zooms by the wheel within its limits', () => {
    const aim = aimFrom(0, 0, 1);
    steerAim(aim, 0, 0, overviewParams.zoomPixels);
    expect(aim.zoom).toBeCloseTo(2);
    steerAim(aim, 0, 0, -1e6);
    expect(aim.zoom).toBe(overviewParams.minZoom);
  });

  it('frames the whole sphere at zoom 1 and keeps out of a globe', () => {
    const d = overviewDistance(100, 60, 1, 0);
    // The sphere's edge subtends at most half the view.
    expect(Math.asin(100 / d)).toBeLessThan(Math.PI / 6);
    expect(overviewDistance(100, 60, 0.01, 105)).toBe(105);
  });
});
