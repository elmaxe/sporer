import { describe, expect, it } from 'vitest';
import { climbToward } from '../src/planet/surfaceMotion';
import { PLANET_VIEW_DISTANCE, planetCameraParams } from '../src/levels/PlanetLevel';
import { generateGalaxy } from '../src/gen/galaxy';
import { generateSystem } from '../src/gen/system';
import { cameraParams } from '../src/player/OrbitCamera';
import {
  distanceZoom,
  moonShell,
  parkingCurve,
  parkingDistance,
  parkingScale,
  planetAltitude,
  planetPitch,
  planetZoomCurve,
  zoomDistance,
} from '../src/player/zoomCurve';

const steps = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

/** Checks `f` rises over [0, 1] (strictly if `strict`) with no step bigger than `maxJump`. */
function expectRisingAndContinuous(f: (z: number) => number, maxJump: number, strict = true): void {
  const zs = steps(1000);
  for (let i = 1; i < zs.length; i++) {
    const a = f(zs[i - 1]!);
    const b = f(zs[i]!);
    if (strict) expect(b).toBeGreaterThan(a);
    else expect(b).toBeGreaterThanOrEqual(a);
    expect(b - a).toBeLessThan(maxJump);
  }
}

describe('zoom ↔ camera distance', () => {
  const { minDistance: min, maxDistance: max } = planetCameraParams;

  it('hits the limits at the ends, where the level handovers trigger', () => {
    expect(zoomDistance(0, min, max)).toBeCloseTo(min, 9);
    expect(zoomDistance(1, min, max)).toBeCloseTo(max, 9);
    expect(zoomDistance(-1, min, max)).toBeCloseTo(min, 9);
    expect(zoomDistance(2, min, max)).toBeCloseTo(max, 9);
  });

  it('is log-scaled, monotonic and continuous', () => {
    expectRisingAndContinuous((z) => Math.log(zoomDistance(z, min, max)), Math.log(max / min) / 900);
    // Equal zoom steps multiply the distance by the same factor.
    const r1 = zoomDistance(0.3, min, max) / zoomDistance(0.2, min, max);
    const r2 = zoomDistance(0.8, min, max) / zoomDistance(0.7, min, max);
    expect(r1).toBeCloseTo(r2, 9);
  });

  it('inverts, clamped to [0, 1] past the limits', () => {
    for (const z of steps(20)) expect(distanceZoom(zoomDistance(z, min, max), min, max)).toBeCloseTo(z, 9);
    expect(distanceZoom(min / 2, min, max)).toBe(0);
    expect(distanceZoom(max * 3, min, max)).toBe(1);
  });
});

describe('planet zoom curve', () => {
  const c = planetZoomCurve;

  it('takes the ship from just over the peaks up to high orbit', () => {
    expect(planetAltitude(0)).toBeCloseTo(c.minAltitude, 9);
    expect(planetAltitude(1)).toBeCloseTo(c.maxAltitude, 9);
    expect(c.minAltitude).toBeGreaterThan(0);
    // High orbit: well over a radius up (the globe's radius is 100), yet below the camera's farthest zoom.
    expect(c.maxAltitude).toBeGreaterThanOrEqual(100);
    expect(c.maxAltitude).toBeLessThan(planetCameraParams.maxDistance);
  });

  it('is monotonic and continuous in altitude and pitch', () => {
    expectRisingAndContinuous((z) => planetAltitude(z), 0.5);
    expectRisingAndContinuous((z) => planetPitch(z), 0.01);
    expect(planetPitch(0)).toBeCloseTo((c.minPitch * Math.PI) / 180, 9);
    expect(planetPitch(1)).toBeCloseTo((c.maxPitch * Math.PI) / 180, 9);
  });

  it('keeps the camera farther from the ship than the ship is from the peaks, more so down low', () => {
    const { minDistance: min, maxDistance: max } = planetCameraParams;
    const ratio = (z: number) => zoomDistance(z, min, max) / planetAltitude(z);
    for (const z of steps(50)) expect(ratio(z)).toBeGreaterThan(1);
    expect(ratio(0)).toBeGreaterThan(ratio(1));
  });

  it('arrives in low orbit, as before', () => {
    const { minDistance: min, maxDistance: max } = planetCameraParams;
    const h = planetAltitude(distanceZoom(PLANET_VIEW_DISTANCE, min, max));
    expect(h).toBeGreaterThan(8);
    expect(h).toBeLessThan(20);
  });
});

describe('parking distance in the system', () => {
  const c = parkingCurve;

  it('runs from minScale at the closest zoom through 1 at the usual view to maxScale', () => {
    expect(c.near).toBe(cameraParams.minDistance);
    expect(parkingScale(cameraParams.minDistance)).toBeCloseTo(c.minScale, 9);
    expect(parkingScale(c.near / 2)).toBeCloseTo(c.minScale, 9);
    expect(parkingScale(c.normal)).toBeCloseTo(1, 9);
    expect(parkingScale(c.far)).toBeCloseTo(c.maxScale, 9);
    expect(parkingScale(cameraParams.maxDistance)).toBeCloseTo(c.maxScale, 9);
  });

  it('is monotonic and continuous over the camera range', () => {
    const { minDistance: min, maxDistance: max } = cameraParams;
    expectRisingAndContinuous((z) => parkingScale(zoomDistance(z, min, max)), 0.01, false);
  });

  it('never parks closer to the surface than the minimum clearance', () => {
    for (const [radius, standoff] of [
      [3, 9],
      [10, 20],
      [24, 34],
      [12, 60],
    ] as const) {
      for (const d of [5, 12, 20, 45, 100, 180, 2500]) {
        const p = parkingDistance(radius, standoff, parkingScale(d));
        expect(p - radius).toBeGreaterThanOrEqual(c.minClearance - 1e-9);
      }
      expect(parkingDistance(radius, standoff, 1)).toBeCloseTo(standoff, 9);
    }
    // Closer in as you zoom in, where the clearance allows.
    expect(parkingDistance(12, 60, parkingScale(12))).toBeLessThan(parkingDistance(12, 60, 1));
    expect(parkingDistance(12, 60, parkingScale(500))).toBeGreaterThan(parkingDistance(12, 60, 1));
  });
});

describe('parking clear of moons', () => {
  const shells = [
    { inner: 20, outer: 30 },
    { inner: 28, outer: 36 },
    { inner: 50, outer: 58 },
  ];

  it('moves a distance inside a moon shell to its nearer edge, overlapping shells counting as one', () => {
    // radius 10, standoff 70: clearance 60, so scale s parks at 10 + 60 s.
    const at = (d: number) => parkingDistance(10, 70, (d - 10) / 60, shells);
    expect(at(18)).toBeCloseTo(18, 9);
    expect(at(22)).toBe(20);
    expect(at(29)).toBe(36);
    expect(at(33)).toBe(36);
    expect(at(40)).toBeCloseTo(40, 9);
    expect(at(53)).toBe(50);
    expect(at(55)).toBe(58);
    // An inner edge too close to the surface is never used.
    expect(parkingDistance(18, 70, 0.1, shells)).toBe(36);
  });

  it('never decreases as the scale grows', () => {
    let last = 0;
    for (let s = 0; s <= 2; s += 0.001) {
      const d = parkingDistance(10, 70, s, shells);
      expect(d).toBeGreaterThanOrEqual(last);
      for (const shell of shells) expect(d > shell.inner && d < shell.outer).toBe(false);
      last = d;
    }
  });

  it("keeps every generated planet's ship clear of its surface and moons at every zoom", () => {
    const galaxy = generateGalaxy(1337, 150);
    let dived = 0;
    let planets = 0;
    for (const ref of galaxy.stars) {
      for (const p of generateSystem(ref).planets) {
        // StarSystem's standoff: the planet's extent (rings and moons) plus 10.
        const standoff = p.extent + 10;
        const keepOut = p.moons.map((m) => moonShell(m.orbit.radius, m.radius));
        const near = parkingDistance(p.radius, standoff, parkingScale(cameraParams.minDistance), keepOut);
        expect(parkingDistance(p.radius, standoff, 1, keepOut)).toBeCloseTo(standoff, 9);
        for (const d of [near, parkingDistance(p.radius, standoff, parkingScale(cameraParams.maxDistance), keepOut)]) {
          expect(d - p.radius).toBeGreaterThanOrEqual(parkingCurve.minClearance - 1e-9);
          for (const m of p.moons) {
            // Clear of the moon wherever it is on its orbit.
            expect(Math.abs(d - m.orbit.radius)).toBeGreaterThanOrEqual(m.radius + parkingCurve.minClearance - 1e-9);
          }
        }
        planets++;
        if (near < standoff - 1) dived++;
      }
    }
    // Scrolling in brings the ship in at nearly every planet.
    expect(dived / planets).toBeGreaterThan(0.9);
  });
});

describe('climbToward', () => {
  it('glides to the target without passing it, so it stays above the terrain', () => {
    const top = 104;
    const dt = 1 / 60;
    const low = top + planetZoomCurve.minAltitude;
    const high = top + planetZoomCurve.maxAltitude;
    // Down from high orbit to skimming the peaks, and back up.
    let r = high;
    for (let i = 0; i < 600; i++) {
      const next = climbToward(r, low, dt, 0.25);
      expect(next).toBeLessThanOrEqual(r);
      expect(next).toBeGreaterThanOrEqual(low);
      r = next;
    }
    expect(r).toBeCloseTo(low, 3);
    for (let i = 0; i < 600; i++) {
      const next = climbToward(r, high, dt, 0.25);
      expect(next).toBeGreaterThanOrEqual(r);
      expect(next).toBeLessThanOrEqual(high);
      r = next;
    }
    expect(r).toBeCloseTo(high, 3);
    // ~63% of the way in one time constant, whatever the frame rate.
    const a = climbToward(0, 1, 0.25, 0.25);
    let b = 0;
    for (let i = 0; i < 15; i++) b = climbToward(b, 1, 0.25 / 15, 0.25);
    expect(a).toBeCloseTo(1 - Math.exp(-1), 9);
    expect(b).toBeCloseTo(a, 9);
    expect(climbToward(3, 7, dt, 0)).toBe(7);
  });
});
