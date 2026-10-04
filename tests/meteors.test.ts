import { describe, expect, it } from 'vitest';
import { generateGalaxy, solRef } from '../src/gen/galaxy';
import {
  FLASH_PEAK_RATE,
  METEOR_PEAK_RATE,
  METEOR_SLOT,
  SHOWER_MOID,
  activeShower,
  circleDistance,
  collectMeteors,
  meteorPool,
  meteorShowers,
  moid,
  orbitApproaches,
  orbitNormal,
  showerActivity,
  type MeteorShower,
} from '../src/gen/meteors';
import { keplerPosition, orbitPosition, type KeplerOrbit, type Orbit } from '../src/gen/orbit';
import { Rng } from '../src/gen/rng';
import { findHomeSystem, generateSystem } from '../src/gen/system';

const galaxy = generateGalaxy(1337);

function bruteMoid(orbit: Orbit, comet: KeplerOrbit): number {
  // Every pair of points on fine grids round both orbits.
  const a = Array.from({ length: 720 }, (_, i) => orbitPosition({ ...orbit, phase: 0 }, (i / 720) * orbit.period, { x: 0, y: 0, z: 0 }));
  let best = Infinity;
  for (let j = 0; j < 4000; j++) {
    const p = keplerPosition({ ...comet, phase: 0 }, (j / 4000) * comet.period, { x: 0, y: 0, z: 0 });
    for (const q of a) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
  }
  return best;
}

/** Distance from a point to a comet's orbit, by brute force. */
function nearestOnComet(comet: KeplerOrbit, p: { x: number; y: number; z: number }): number {
  let best = Infinity;
  for (let j = 0; j < 20000; j++) {
    const q = keplerPosition({ ...comet, phase: 0 }, (j / 20000) * comet.period, { x: 0, y: 0, z: 0 });
    best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
  }
  return best;
}

describe('orbit geometry', () => {
  it('a circular orbit lies in the plane of its normal', () => {
    const orbit: Orbit = { radius: 120, period: 60, phase: 0.3, inclination: 0.4, node: 1.1 };
    const n = orbitNormal(orbit);
    for (let t = 0; t < 60; t += 7) {
      const p = orbitPosition(orbit, t, { x: 0, y: 0, z: 0 });
      expect(Math.abs(p.x * n[0] + p.y * n[1] + p.z * n[2])).toBeLessThan(1e-9);
      expect(circleDistance(orbit, n, [p.x, p.y, p.z])).toBeLessThan(1e-9);
    }
  });

  it('the MOID of two coplanar circles is the difference of their radii', () => {
    const orbit: Orbit = { radius: 100, period: 50, phase: 0, inclination: 0 };
    const circle: KeplerOrbit = { semiMajor: 130, eccentricity: 0, period: 80, phase: 0, inclination: 0, argPerihelion: 0, node: 0 };
    expect(moid(orbit, circle)).toBeCloseTo(30, 6);
  });

  it('matches a brute-force search over random orbits', () => {
    const rng = new Rng(7);
    for (let k = 0; k < 6; k++) {
      const orbit: Orbit = { radius: rng.range(80, 400), period: 100, phase: 0, inclination: rng.gaussian(0, 0.05) };
      const q = rng.range(60, 200);
      const Q = rng.range(500, 900);
      const comet: KeplerOrbit = {
        semiMajor: (q + Q) / 2,
        eccentricity: (Q - q) / (Q + q),
        period: 500,
        phase: 0,
        inclination: rng.range(0, Math.PI),
        argPerihelion: rng.range(0, 2 * Math.PI),
        node: rng.range(0, 2 * Math.PI),
      };
      expect(moid(orbit, comet)).toBeCloseTo(bruteMoid(orbit, comet), 0);
      expect(moid(orbit, comet)).toBeLessThanOrEqual(bruteMoid(orbit, comet) + 1e-6);
    }
  });

  it('finds both close approaches of a comet crossing near the orbit at both nodes', () => {
    // An orbit through the planet's at both ends of a diameter: a comet tilted about the line of nodes, its nodes at the circle.
    const orbit: Orbit = { radius: 100, period: 50, phase: 0, inclination: 0 };
    const comet: KeplerOrbit = { semiMajor: 100, eccentricity: 0, period: 50, phase: 0, inclination: 0.5, argPerihelion: 0, node: 0 };
    const approaches = orbitApproaches(orbit, comet);
    expect(approaches.length).toBe(2);
    for (const a of approaches) expect(a.distance).toBeLessThan(1e-6);
  });
});

describe('meteor showers', () => {
  const sol = generateSystem(solRef(galaxy)!);
  const earth = sol.planets.find((p) => p.name === 'Earth')!;

  it("gives Earth a shower from Halley's comet at the Orionids' speed", () => {
    const showers = meteorShowers({ orbit: earth.orbit, escapeVelocity: earth.climate!.escapeVelocity, seed: earth.seed }, sol.comets, sol.habitableRadius);
    expect(showers.length).toBeGreaterThan(0);
    // The Orionids and η Aquariids enter at 66 km/s (IMO); Halley is retrograde, so they're among the fastest.
    expect(showers[0]!.speed).toBeGreaterThan(60);
    expect(showers[0]!.speed).toBeLessThan(72);
    expect(showers[0]!.name).toBe("Halley's Comet");
  });

  it('only for crossings closer than the MOID limit, stronger when closer', () => {
    for (const ref of galaxy.stars.slice(0, 40)) {
      const system = generateSystem(ref);
      for (const p of system.planets) {
        for (const s of meteorShowers({ orbit: p.orbit, escapeVelocity: 0, seed: p.seed }, system.comets, system.habitableRadius)) {
          expect(s.moid).toBeLessThan(SHOWER_MOID * system.habitableRadius);
          expect(s.strength).toBeCloseTo(1 - s.moid / (SHOWER_MOID * system.habitableRadius), 9);
          expect(Math.hypot(...s.radiant)).toBeCloseTo(1, 9);
          // With the planet at the shower's angle, it's within the MOID (and a little) of the comet's orbit.
          const t = ((s.angle - p.orbit.phase) / (2 * Math.PI)) * p.orbit.period;
          const at = orbitPosition(p.orbit, t, { x: 0, y: 0, z: 0 });
          expect(nearestOnComet(system.comets[s.comet]!.orbit, at)).toBeLessThan(s.moid * 1.05 + 0.5);
        }
      }
    }
  });

  it('show up in the default galaxy, the home system included', () => {
    const home = generateSystem(findHomeSystem(galaxy));
    const showers = home.planets.flatMap((p) => meteorShowers({ orbit: p.orbit, escapeVelocity: 0, seed: p.seed }, home.comets, home.habitableRadius));
    expect(showers.length).toBeGreaterThan(0);
  });

  it('are none in a starless system or for a still body', () => {
    const rogue = generateSystem(galaxy.rogues[0]!);
    const p = rogue.planets[0]!;
    expect(meteorShowers({ orbit: p.orbit, escapeVelocity: 0, seed: 1 }, sol.comets, 0)).toEqual([]);
  });

  it('peak at the crossing and fall to half a half-width either side', () => {
    const orbit: Orbit = { radius: 100, period: 100, phase: 0, inclination: 0 };
    const shower = { angle: 1, halfWidth: 0.2, strength: 0.8 } as MeteorShower;
    const at = (angle: number) => (angle / (2 * Math.PI)) * orbit.period;
    expect(showerActivity(shower, orbit, at(1))).toBeCloseTo(0.8, 9);
    expect(showerActivity(shower, orbit, at(1.2))).toBeCloseTo(0.4, 9);
    expect(showerActivity(shower, orbit, at(0.8))).toBeCloseTo(0.4, 9);
    expect(showerActivity(shower, orbit, at(1 + Math.PI))).toBeLessThan(1e-6);
    // A year later it's back.
    expect(showerActivity(shower, orbit, at(1) + orbit.period)).toBeCloseTo(0.8, 9);
    expect(activeShower([shower], orbit, at(1 + Math.PI))).toBeNull();
    expect(activeShower([shower], orbit, at(1))?.activity).toBeCloseTo(0.8, 9);
  });
});

describe('meteors', () => {
  const shower = { seed: 99, speed: 40 } as MeteorShower;

  it('are a pure function of the clock', () => {
    const a = meteorPool(64);
    const b = meteorPool(64);
    const n = collectMeteors(shower, 1, 1234.5, false, a);
    expect(collectMeteors(shower, 1, 1234.5, false, b)).toBe(n);
    expect(b.slice(0, n)).toEqual(a.slice(0, n));
    for (const m of a.slice(0, n)) {
      expect(m.start).toBeLessThanOrEqual(1234.5);
      expect(m.start + m.duration).toBeGreaterThan(1234.5);
    }
  });

  it('start at the peak rate, none without activity', () => {
    const pool = meteorPool(64);
    expect(collectMeteors(shower, 0, 50, false, pool)).toBe(0);
    for (const [airless, rate] of [
      [false, METEOR_PEAK_RATE],
      [true, FLASH_PEAK_RATE],
    ] as const) {
      // Count the starts over a long stretch by sampling at every slot's end.
      const seen = new Set<number>();
      for (let t = 0; t < 2000; t += METEOR_SLOT) {
        const n = collectMeteors(shower, 1, t, airless, pool);
        for (const m of pool.slice(0, n)) seen.add(m.id);
      }
      expect(seen.size / 2000).toBeGreaterThan(rate * 0.85);
      expect(seen.size / 2000).toBeLessThan(rate * 1.1);
    }
  });

  it('burn shorter the faster they are, flashes shortest', () => {
    const pool = meteorPool(64);
    const mean = (speed: number, airless: boolean) => {
      const durations: number[] = [];
      for (let t = 0; t < 300; t += 0.5) {
        const n = collectMeteors({ ...shower, speed }, 1, t, airless, pool);
        for (const m of pool.slice(0, n)) durations.push(m.duration);
      }
      return durations.reduce((s, d) => s + d, 0) / durations.length;
    };
    expect(mean(20, false)).toBeGreaterThan(mean(65, false));
    expect(mean(65, false)).toBeGreaterThan(mean(65, true));
  });
});
