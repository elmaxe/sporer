import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../src/gen/galaxy';
import { ARRIVAL_DIAMETERS, arrivalDistance, findHomeSystem, generateSystem } from '../src/gen/system';
import {
  flightAltitude,
  highAltitude,
  minPitchAt,
  parkGap,
  referenceGap,
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

describe('system parking gap', () => {
  it("is the body's own standoff at the reference view", () => {
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
    // Zoomed all the way out, the ship has pulled well back from the body.
    expect(parkGap(10, 2500)).toBeGreaterThan(80);
  });

  it('never parks close enough to dive into the body', () => {
    // The system level descends into a body the ship comes within 3 of.
    for (const gap of [6, 10, 25]) expect(parkGap(gap, 12)).toBeGreaterThan(3);
  });

  it('inverts: a parking made at one zoom is back where it was at that zoom', () => {
    expect(parkGap(referenceGap(180, 90), 90)).toBeCloseTo(180);
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
});

describe('arrivalDistance', () => {
  const galaxy = generateGalaxy(1337);
  const systems = [findHomeSystem(galaxy), ...galaxy.stars.slice(0, 60)].map(generateSystem);
  const directions = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: -1 },
    { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 },
    { x: 0.6, y: 0.8, z: 0 },
    { x: 0, y: -1, z: 0 },
  ];

  it('parks clear of every orbit, near a few star diameters out', () => {
    for (const system of systems) {
      for (const dir of directions) {
        const d = arrivalDistance(system, dir);
        expect(d).toBeGreaterThan(system.starZone + 20);
        for (const p of system.planets) {
          // Sample the orbit: no planet (with its moons) passes within its extent of the parked ship.
          let closest = Infinity;
          for (let k = 0; k < 360; k++) {
            const a = (k / 360) * 2 * Math.PI;
            const { radius: r, inclination: i } = p.orbit;
            const x = r * Math.cos(a) - d * dir.x;
            const y = r * Math.sin(a) * Math.sin(i) - d * dir.y;
            const z = r * Math.sin(a) * Math.cos(i) - d * dir.z;
            closest = Math.min(closest, Math.hypot(x, y, z));
          }
          expect(closest).toBeGreaterThan(p.extent);
        }
      }
    }
  });

  it('keeps the ideal distance when it is already clear', () => {
    // Straight above the ecliptic nothing orbits.
    const system = systems[0]!;
    expect(arrivalDistance(system, { x: 0, y: 1, z: 0 })).toBeCloseTo(ARRIVAL_DIAMETERS * 2 * system.starZone);
  });
});
