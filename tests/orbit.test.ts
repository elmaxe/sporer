import { describe, expect, it } from 'vitest';
import {
  aphelion,
  keplerPosition,
  orbitPosition,
  perihelion,
  solveKepler,
  type KeplerOrbit,
  type Vec3Like,
} from '../src/gen/orbit';

const vec = (): Vec3Like => ({ x: 0, y: 0, z: 0 });
const dist = (a: Vec3Like, b: Vec3Like) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const len = (a: Vec3Like) => Math.hypot(a.x, a.y, a.z);

const comet: KeplerOrbit = {
  semiMajor: 600,
  eccentricity: 0.85,
  period: 900,
  phase: 1.1,
  inclination: 0.4,
  argPerihelion: 2.2,
  node: -0.7,
};

describe('solveKepler', () => {
  it("solves Kepler's equation for any mean anomaly and eccentricity", () => {
    for (const e of [0, 0.1, 0.5, 0.8, 0.95, 0.99]) {
      for (let m = -10; m <= 10; m += 0.37) {
        const E = solveKepler(m, e);
        const wrapped = m - 2 * Math.PI * Math.round(m / (2 * Math.PI));
        expect(E - e * Math.sin(E)).toBeCloseTo(wrapped, 9);
      }
    }
  });

  it('is the identity for a circle', () => {
    expect(solveKepler(1.234, 0)).toBeCloseTo(1.234, 12);
  });
});

describe('keplerPosition', () => {
  it('matches orbitPosition for a circular orbit', () => {
    const circle = { radius: 150, period: 70, phase: 0.8, inclination: 0.3 };
    const kepler: KeplerOrbit = { ...circle, semiMajor: 150, eccentricity: 0, argPerihelion: 0, node: 0 };
    for (let t = 0; t < 140; t += 3.3) {
      expect(dist(keplerPosition(kepler, t, vec()), orbitPosition(circle, t, vec()))).toBeLessThan(1e-9);
    }
  });

  it('closes after one period', () => {
    for (let t = 0; t < 900; t += 47) {
      expect(dist(keplerPosition(comet, t, vec()), keplerPosition(comet, t + comet.period, vec()))).toBeLessThan(1e-6);
    }
  });

  it('ranges from perihelion to aphelion, closest at mean anomaly 0', () => {
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < 2000; i++) {
      const r = len(keplerPosition(comet, (i / 2000) * comet.period, vec()));
      min = Math.min(min, r);
      max = Math.max(max, r);
    }
    expect(min).toBeGreaterThanOrEqual(perihelion(comet) - 1e-6);
    expect(min).toBeLessThan(perihelion(comet) * 1.02);
    expect(max).toBeLessThanOrEqual(aphelion(comet) + 1e-6);
    expect(max).toBeGreaterThan(aphelion(comet) * 0.999);
    // Time when the mean anomaly is 0.
    const tPeri = (-comet.phase / (2 * Math.PI)) * comet.period;
    expect(len(keplerPosition(comet, tPeri, vec()))).toBeCloseTo(perihelion(comet), 6);
  });

  it('moves fastest at perihelion and slowest at aphelion', () => {
    const speed = (t: number) => dist(keplerPosition(comet, t, vec()), keplerPosition(comet, t + 0.01, vec())) / 0.01;
    const tPeri = (-comet.phase / (2 * Math.PI)) * comet.period;
    const tAph = tPeri + comet.period / 2;
    let fastest = 0;
    let slowest = Infinity;
    for (let i = 0; i < 500; i++) {
      const s = speed((i / 500) * comet.period);
      fastest = Math.max(fastest, s);
      slowest = Math.min(slowest, s);
    }
    expect(speed(tPeri)).toBeGreaterThan(fastest * 0.99);
    expect(speed(tAph)).toBeLessThan(slowest * 1.01);
    // Vis-viva: v_peri / v_aph = Q / q.
    expect(speed(tPeri) / speed(tAph)).toBeCloseTo(aphelion(comet) / perihelion(comet), 1);
  });

  it('sweeps equal areas in equal times', () => {
    const area = (t: number, dt: number) => {
      const a = keplerPosition(comet, t, vec());
      const b = keplerPosition(comet, t + dt, vec());
      // Half the cross product's length: the triangle with the focus.
      return (
        Math.hypot(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x) / 2
      );
    };
    const reference = area(0, 0.05);
    for (let t = 0; t < comet.period; t += 61) expect(area(t, 0.05) / reference).toBeCloseTo(1, 2);
  });
});
