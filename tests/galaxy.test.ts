import { describe, expect, it } from 'vitest';
import { galaxyStarSize } from '../src/galaxy/appearance';
import { pickPoint } from '../src/galaxy/pickPoint';
import { generateGalaxy, type StarRef } from '../src/gen/galaxy';
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
