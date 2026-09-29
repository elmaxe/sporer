import { describe, expect, it } from 'vitest';
import {
  EARTH_GRAVITY,
  atmosphereLook,
  atmosphereParams,
  groundDensity,
  pathOpticalDepth,
  raySegment,
  relativeDensity,
  scaleHeight,
  type AtmosphereLook,
} from '../src/gen/atmosphere';
import type { Composition } from '../src/gen/climate';
import { generateGalaxy } from '../src/gen/galaxy';
import { gameRadius } from '../src/gen/planets';
import { generateSystem } from '../src/gen/system';

// Reference values and their sources: docs/research/atmospheres.md.
type Vec3 = [number, number, number];

/** The optical depth by brute force: many uniform samples along the same segment. */
function bruteForce(look: AtmosphereLook, o: Vec3, d: Vec3, n = 20000): number {
  const seg = raySegment(look, o, d);
  if (!seg) return 0;
  const [t0, t1] = seg;
  const dt = (t1 - t0) / n;
  let tau = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i + 0.5) * dt;
    tau += relativeDensity(look, Math.hypot(o[0] + t * d[0], o[1] + t * d[1], o[2] + t * d[2])) * dt;
  }
  return tau * groundDensity(look);
}

function direction(degreesFromDown: number): Vec3 {
  const a = (degreesFromDown * Math.PI) / 180;
  return [Math.sin(a), 0, -Math.cos(a)];
}

const EARTH_LIKE: AtmosphereLook = { scaleHeight: 0.05, top: 1.3, depth: 0.2 };

describe('scale height', () => {
  const air = (temperature: number, gravity: number, composition: Exclude<Composition, 'none'>) =>
    scaleHeight({ temperature, gravity: gravity / EARTH_GRAVITY, composition });

  it('reproduces the NASA fact sheets within 2%', () => {
    // [T K, g m/s², composition, NASA scale height km]
    const cases: [number, number, Exclude<Composition, 'none'>, number][] = [
      [288, 9.82, 'oxygenNitrogen', 8.5], // Earth
      [737, 8.87, 'carbonDioxide', 15.9], // Venus
      [214, 3.73, 'carbonDioxide', 11.0], // Mars
    ];
    for (const [T, g, comp, measured] of cases) expect(Math.abs(air(T, g, comp) / measured - 1)).toBeLessThan(0.02);
  });

  it('is taller on warm, light bodies', () => {
    expect(air(300, 9.82, 'nitrogen')).toBeGreaterThan(air(200, 9.82, 'nitrogen'));
    expect(air(250, 3, 'nitrogen')).toBeGreaterThan(air(250, 9.82, 'nitrogen'));
    expect(air(250, 9.82, 'nitrogen')).toBeGreaterThan(air(250, 9.82, 'carbonDioxide'));
    expect(scaleHeight({ temperature: 300, gravity: 1, composition: 'none' })).toBe(0);
  });
});

describe('atmosphere look', () => {
  const earth = { temperature: 288, gravity: 1, composition: 'oxygenNitrogen' as const, pressure: 1 };
  const R = gameRadius(1);

  it('makes an Earth analogue the reference look', () => {
    const look = atmosphereLook(earth, R)!;
    expect(look.scaleHeight).toBeCloseTo(atmosphereParams.earthScaleHeight, 3);
    expect(look.depth).toBeCloseTo(atmosphereParams.earthDepth, 3);
    expect(look.top).toBeCloseTo(1 + atmosphereParams.heights * look.scaleHeight, 6);
  });

  it('has none without air', () => {
    expect(atmosphereLook({ ...earth, composition: 'none', pressure: 0 }, R)).toBeNull();
  });

  it('is thicker with more air and hazy under a cloud deck', () => {
    const thin = atmosphereLook({ ...earth, pressure: 0.01 }, R)!;
    const thick = atmosphereLook({ ...earth, pressure: 3 }, R)!;
    expect(thin.depth).toBeLessThan(0.05);
    expect(thick.depth).toBeGreaterThan(atmosphereLook(earth, R)!.depth);
    const venus = atmosphereLook({ temperature: 737, gravity: 0.9, composition: 'carbonDioxide', pressure: 92 }, R)!;
    const titan = atmosphereLook({ temperature: 94, gravity: 0.14, composition: 'nitrogen', pressure: 1.5 }, gameRadius(0.4))!;
    expect(venus.depth).toBe(atmosphereParams.cloudDepth);
    expect(titan.depth).toBe(atmosphereParams.cloudDepth);
  });

  it('is taller on small, light worlds, within the stylised range', () => {
    const small = atmosphereLook({ ...earth, gravity: 0.3 }, gameRadius(0.4))!;
    expect(small.scaleHeight).toBeGreaterThan(atmosphereLook(earth, R)!.scaleHeight);
    for (const look of [small, atmosphereLook(earth, gameRadius(2.5))!]) {
      expect(look.scaleHeight).toBeGreaterThanOrEqual(atmosphereParams.minScaleHeight);
      expect(look.scaleHeight).toBeLessThanOrEqual(atmosphereParams.maxScaleHeight);
    }
  });

  it('gives every generated atmosphere a shell between 1.15 and 1.5 radii', () => {
    const galaxy = generateGalaxy(1337);
    let seen = 0;
    for (const ref of galaxy.stars.slice(0, 80)) {
      for (const p of generateSystem(ref).planets) {
        for (const body of [p, ...p.moons]) {
          if (!body.atmosphere) continue;
          const look = atmosphereLook(body.climate!, body.radius);
          expect(look).not.toBeNull();
          expect(look!.top).toBeGreaterThanOrEqual(1.15);
          expect(look!.top).toBeLessThanOrEqual(1.5);
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
});

describe('optical depth along a ray', () => {
  it('fades to exactly zero at the top, so the shell has no edge', () => {
    expect(relativeDensity(EARTH_LIKE, 1)).toBeCloseTo(1, 9);
    expect(relativeDensity(EARTH_LIKE, EARTH_LIKE.top)).toBeCloseTo(0, 9);
    expect(relativeDensity(EARTH_LIKE, EARTH_LIKE.top + 0.1)).toBe(0);
    expect(relativeDensity(EARTH_LIKE, 1.05)).toBeLessThan(relativeDensity(EARTH_LIKE, 1.02));
  });

  it('comes out at the look’s depth straight down', () => {
    const tau = pathOpticalDepth(EARTH_LIKE, [0, 0, 2], [0, 0, -1]);
    expect(tau).toBeCloseTo(EARTH_LIKE.depth, 2);
  });

  it('is zero for rays that miss the shell or point away from it', () => {
    expect(pathOpticalDepth(EARTH_LIKE, [0, 1.4, 3], [0, 0, -1])).toBe(0);
    expect(pathOpticalDepth(EARTH_LIKE, [0, 0, 3], [0, 0, 1])).toBe(0);
  });

  it('is thicker along the limb than straight down', () => {
    const down = pathOpticalDepth(EARTH_LIKE, [0, 0, 3], [0, 0, -1]);
    const limb = pathOpticalDepth(EARTH_LIKE, [0, 1.005, 3], [0, 0, -1]);
    expect(limb).toBeGreaterThan(5 * down);
  });

  it('grows with the density', () => {
    const o: Vec3 = [0, 1.02, 3];
    const d: Vec3 = [0, 0, -1];
    const thin = pathOpticalDepth({ ...EARTH_LIKE, depth: 0.1 }, o, d);
    const thick = pathOpticalDepth({ ...EARTH_LIKE, depth: 0.4 }, o, d);
    expect(thick).toBeCloseTo(4 * thin, 6);
    expect(thick).toBeGreaterThan(thin);
  });

  it('works from inside the shell: hazier towards the horizon than overhead', () => {
    const o: Vec3 = [0, 0, 1.05];
    const up = pathOpticalDepth(EARTH_LIKE, o, [0, 0, 1]);
    const horizon = pathOpticalDepth(EARTH_LIKE, o, [1, 0, 0]);
    const down = pathOpticalDepth(EARTH_LIKE, o, [0, 0, -1]);
    expect(up).toBeGreaterThan(0);
    expect(horizon).toBeGreaterThan(3 * up);
    expect(down).toBeGreaterThan(up);
  });

  it('matches a brute-force integral within 3% from outside and inside', () => {
    for (const H of [0.03, 0.05, 0.08]) {
      const look: AtmosphereLook = { scaleHeight: H, top: 1 + 6 * H, depth: 0.3 };
      for (const o of [
        [0, 0, 3],
        [0, 0, 1 + H],
        [0, 0, 1 + 3 * H],
      ] as Vec3[]) {
        for (let a = 0; a <= 180; a += 5) {
          const d = direction(a);
          const exact = bruteForce(look, o, d);
          if (exact < 0.005) continue;
          expect(Math.abs(pathOpticalDepth(look, o, d) / exact - 1)).toBeLessThan(0.03);
        }
      }
    }
  });
});
