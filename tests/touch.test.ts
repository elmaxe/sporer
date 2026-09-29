import { describe, expect, it } from 'vitest';
import { PINCH_WHEEL_PX, STICK_DEADZONE, TAP_SLOP_PX, TouchGestures, stickAxes } from '../src/core/touch';

function recorder() {
  const log = { dx: 0, dy: 0, wheel: 0, taps: [] as [number, number][] };
  const gestures = new TouchGestures({
    drag: (dx, dy) => {
      log.dx += dx;
      log.dy += dy;
    },
    zoom: (px) => {
      log.wheel += px;
    },
    tap: (x, y) => {
      log.taps.push([x, y]);
    },
  });
  return { log, gestures };
}

describe('TouchGestures', () => {
  it('a still finger is a tap, not a drag', () => {
    const { log, gestures } = recorder();
    gestures.down(1, 100, 100);
    gestures.move(1, 103, 102);
    expect(gestures.dragging).toBe(false);
    gestures.up(1, 103, 102);
    expect(log.taps).toEqual([[103, 102]]);
    expect(log.dx).toBe(0);
    expect(gestures.count).toBe(0);
  });

  it('a moving finger drags by its movement once past the slop, and never taps', () => {
    const { log, gestures } = recorder();
    gestures.down(1, 100, 100);
    gestures.move(1, 100 + TAP_SLOP_PX, 100);
    expect(gestures.dragging).toBe(true);
    gestures.move(1, 130, 95);
    gestures.up(1, 130, 95);
    expect(log.dx).toBe(30);
    expect(log.dy).toBe(-5);
    expect(log.taps).toEqual([]);
    expect(gestures.dragging).toBe(false);
  });

  it('spreading two fingers to twice the distance is a zoom in of ln 2 wheel units', () => {
    const { log, gestures } = recorder();
    gestures.down(1, 100, 100);
    gestures.down(2, 200, 100);
    gestures.move(2, 300, 100);
    expect(log.wheel).toBeCloseTo(-Math.log(2) * PINCH_WHEEL_PX);
    gestures.move(1, 200, 100); // back to 100 apart: net zero
    expect(log.wheel).toBeCloseTo(0);
    expect(log.dx).toBe(0);
  });

  it('a pinch never taps, and the finger left behind drags on without a jump', () => {
    const { log, gestures } = recorder();
    gestures.down(1, 100, 100);
    gestures.down(2, 200, 100);
    gestures.up(2, 200, 100);
    gestures.move(1, 104, 100);
    expect(log.dx).toBe(4);
    gestures.up(1, 104, 100);
    expect(log.taps).toEqual([]);
  });

  it('ignores pointers it is not tracking, and a cancelled touch never taps', () => {
    const { log, gestures } = recorder();
    expect(gestures.move(9, 1, 1)).toBe(false);
    gestures.up(9, 1, 1);
    gestures.down(1, 10, 10);
    gestures.up(1, 10, 10, true);
    expect(log.taps).toEqual([]);
  });
});

describe('stickAxes', () => {
  const out = { x: 0, y: 0 };

  it('is zero in the dead zone', () => {
    expect(stickAxes(0, 0, 40, out)).toEqual({ x: 0, y: 0 });
    expect(stickAxes(40 * STICK_DEADZONE, 0, 40, out)).toEqual({ x: 0, y: 0 });
  });

  it('reaches 1 at full travel, with +y up', () => {
    const a = stickAxes(0, -40, 40, out);
    expect(a.x).toBeCloseTo(0);
    expect(a.y).toBeCloseTo(1);
    const d = stickAxes(-60, 60, 40, out);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(d.x).toBeLessThan(0);
    expect(d.y).toBeLessThan(0);
  });

  it('grows from 0 just past the dead zone', () => {
    const a = stickAxes(40 * (STICK_DEADZONE + 0.01), 0, 40, out);
    expect(a.x).toBeGreaterThan(0);
    expect(a.x).toBeLessThan(0.05);
  });
});
