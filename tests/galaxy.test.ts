import { describe, expect, it } from 'vitest';
import { galaxyStarSize } from '../src/galaxy/appearance';
import { pickPoint } from '../src/galaxy/pickPoint';
import { generateDust, generateGalaxy, type StarRef } from '../src/gen/galaxy';
import type { StarKind } from '../src/gen/stars';

describe('galaxyStarSize', () => {
  const galaxy = generateGalaxy(1337, 1500);
  const single = (kind: StarKind) => galaxy.stars.filter((s) => s.stars.length === 1 && s.stars[0]!.kind === kind);
  const avg = (refs: StarRef[]) => refs.reduce((t, r) => t + galaxyStarSize(r), 0) / refs.length;

  it('orders giants above main-sequence stars above dwarfs', () => {
    expect(avg(single('redGiant'))).toBeGreaterThan(avg(single('mainSequence')));
    expect(avg(single('mainSequence'))).toBeGreaterThan(avg(single('redDwarf')));
    expect(avg(single('redDwarf'))).toBeGreaterThan(avg(single('whiteDwarf')));
  });

  it('keeps every dot small next to the ~25-unit spacing between stars', () => {
    for (const s of galaxy.stars) {
      expect(galaxyStarSize(s)).toBeGreaterThan(0.5);
      expect(galaxyStarSize(s)).toBeLessThan(4);
    }
  });
});

describe('pickPoint', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const forward = { x: 0, y: 0, z: -1 };
  // A: slightly off-axis near, B: on-axis far, C: behind the origin.
  const points = [1, 0, -10, 0, 0.5, -100, 0, 0, 10];

  it('picks the point closest to the ray in angle, not distance', () => {
    expect(pickPoint(origin, forward, points, 0.2)).toBe(1);
  });

  it('ignores points outside the angle and behind the origin', () => {
    expect(pickPoint(origin, { x: 0, y: 0, z: 1 }, points, 0.2)).toBe(2);
    expect(pickPoint(origin, forward, points.slice(0, 3), 0.05)).toBe(-1);
  });
});

describe('generateDust', () => {
  const galaxy = generateGalaxy(1337, 10);

  it('is deterministic', () => {
    expect(generateDust(galaxy, 50)).toEqual(generateDust(galaxy, 50));
  });

  it('concentrates along the spiral arms', () => {
    // Angular distance from the nearest arm's centreline at the cloud's radius
    // (the inverse of armPosition's layout).
    const offArm = (p: { x: number; z: number }) => {
      const t = (Math.hypot(p.x, p.z) / galaxy.radius - 0.08) / 0.92;
      let best = Infinity;
      for (let arm = 0; arm < galaxy.arms; arm++) {
        const centre = galaxy.armOffset + (arm / galaxy.arms) * Math.PI * 2 + t * galaxy.twist;
        const diff = Math.atan2(Math.sin(Math.atan2(p.z, p.x) - centre), Math.cos(Math.atan2(p.z, p.x) - centre));
        best = Math.min(best, Math.abs(diff));
      }
      return best;
    };
    const dust = generateDust(galaxy, 1000);
    const near = dust.filter((c) => offArm(c.position) < 0.5).length / dust.length;
    // Uniformly scattered clouds would give arms / π ≈ 0.3–0.6; arm dust is ~90%.
    expect(near).toBeGreaterThan(0.8);
    for (const c of dust) expect(Math.abs(c.position.y)).toBeLessThan(galaxy.radius * 0.15);
  });
});
