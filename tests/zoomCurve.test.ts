import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../src/gen/galaxy';
import { generateSystem, systemExtent } from '../src/gen/system';
import {
  SYSTEM_VIEW_EXTENTS,
  flightAltitude,
  highAltitude,
  hoverGap,
  maxLookUpAt,
  minPitchAt,
  systemMaxView,
  parkGap,
  zoomCurveParams as params,
  zoomFraction,
} from '../src/player/zoomCurve';

describe('zoomFraction', () => {
  it('is 0 at min zoom, 1 at max and log-scaled between', () => {
    expect(zoomFraction(8, 8, 260)).toBe(0);
    expect(zoomFraction(260, 8, 260)).toBe(1);
    expect(zoomFraction(Math.sqrt(8 * 260), 8, 260)).toBeCloseTo(0.5);
    expect(zoomFraction(2, 8, 260)).toBe(0);
    expect(zoomFraction(1000, 8, 260)).toBe(1);
  });
});

describe('system hover gap', () => {
  it('is the hover gap at the reference view', () => {
    expect(parkGap(10, params.referenceView)).toBeCloseTo(10);
  });

  it('grows with the camera distance, continuously and monotonically', () => {
    let last = 0;
    for (let view = 12; view <= 2500; view *= 1.05) {
      const gap = parkGap(10, view);
      expect(gap).toBeGreaterThanOrEqual(last);
      if (last > params.minGap) expect(gap / last).toBeLessThan(1.05);
      last = gap;
    }
    // Zooming in brings it down towards the body; zoomed all the way out it has hardly climbed.
    expect(parkGap(10, 12)).toBeLessThan(6);
    expect(parkGap(10, 2500)).toBeGreaterThan(10);
    expect(parkGap(10, 2500)).toBeLessThan(20);
  });

  it('never parks close enough to dive into the body', () => {
    // The system level descends into a body the ship comes within 3 of.
    for (const gap of [6, 10, 25]) expect(parkGap(gap, 12)).toBeGreaterThan(3);
  });
});

describe('planet flight altitude', () => {
  it('runs from just over the peaks to high orbit', () => {
    expect(flightAltitude(0, 100)).toBeCloseTo(params.lowAltitude);
    expect(flightAltitude(1, 100)).toBeCloseTo(highAltitude(100));
    expect(highAltitude(100)).toBeCloseTo(150);
    // Small moons still get room to climb.
    expect(highAltitude(10)).toBe(params.minHighAltitude);
  });

  it('rises monotonically with the zoom and stays low over most of the range', () => {
    let last = 0;
    for (let f = 0; f <= 1.0001; f += 0.01) {
      const a = flightAltitude(f, 100);
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
    // Around the default view (the camera 45 from the ship, zoom ≈ 0.5), still low orbit (~12).
    const f45 = zoomFraction(45, 8, 260);
    expect(flightAltitude(f45, 100)).toBeGreaterThan(8);
    expect(flightAltitude(f45, 100)).toBeLessThan(16);
  });

  it('tips the camera over to look down only near the top of the zoom', () => {
    expect(minPitchAt(0)).toBeCloseTo(params.lowPitch);
    expect(minPitchAt(0.5)).toBeCloseTo(params.lowPitch);
    expect(minPitchAt(1)).toBeCloseTo(params.highPitch);
    expect(minPitchAt(0.8)).toBeGreaterThan(params.lowPitch);
    expect(minPitchAt(0.8)).toBeLessThan(params.highPitch);
  });

  it('lets the view tip up to the sky down low, and not at all at the top (where it leaves for the system)', () => {
    expect(maxLookUpAt(0)).toBeCloseTo(params.lookUp);
    expect(maxLookUpAt(0.5)).toBeCloseTo(params.lookUp);
    expect(maxLookUpAt(0.8)).toBeGreaterThan(0);
    expect(maxLookUpAt(0.8)).toBeLessThan(params.lookUp);
    expect(maxLookUpAt(1)).toBeCloseTo(0);
  });
});

describe('hoverGap', () => {
  it('is a share of the radius, never closer than the least gap nor farther than the cap', () => {
    expect(hoverGap(10)).toBeCloseTo(params.hoverRadii * 10);
    expect(hoverGap(0.5)).toBe(params.minGap);
    // A star or a giant: capped, so the ship hovers low over it too.
    expect(hoverGap(31)).toBe(params.maxHoverGap);
    expect(hoverGap(300)).toBe(params.maxHoverGap);
  });
});

describe('systemMaxView', () => {
  const galaxy = generateGalaxy(1337);

  it('never zooms out less than the base', () => {
    expect(systemMaxView(100, 2500)).toBe(2500);
  });

  it('takes in every system whole, with room round it (star 2470 reaches 2328 out)', () => {
    for (const id of [2470, 3309, 0, 42]) {
      const extent = systemExtent(generateSystem(galaxy.stars[id]!));
      expect(systemMaxView(extent, 2500)).toBeGreaterThanOrEqual(SYSTEM_VIEW_EXTENTS * extent);
      // The edge of the system is within 25° of the view's centre (half the vertical field of view is 32.5°).
      expect(Math.atan(extent / systemMaxView(extent, 2500))).toBeLessThan((25 * Math.PI) / 180);
    }
    expect(systemExtent(generateSystem(galaxy.stars[2470]!))).toBeGreaterThan(2000);
  });
});
