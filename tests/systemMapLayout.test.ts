import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../src/gen/galaxy';
import { generateSystem, type SystemData } from '../src/gen/system';
import { distanceToMapX, layoutSystemMap, mapLayoutParams, type SystemMapLayout } from '../src/ui/systemMapLayout';

const systems: SystemData[] = generateGalaxy(1337).stars.slice(0, 300).map(generateSystem);

function layout(system: SystemData, width: number, maxHeight: number): SystemMapLayout {
  return layoutSystemMap(
    system.planets.map((p) => ({
      radius: p.radius,
      ringOuter: p.rings?.outer ?? null,
      moons: p.moons.map((m) => ({ radius: m.radius })),
    })),
    { width, maxHeight, stars: system.stars.map((s) => s.radius) },
  );
}

/** Half a column's width: the planet, its rings or its widest moon. */
function half(p: SystemMapLayout['planets'][number]): number {
  return Math.max(p.r, p.ring, ...p.moons.map((m) => m.r));
}

describe('layoutSystemMap', () => {
  // The desktop panel, a phone's overlay and a wide one.
  for (const [width, maxHeight] of [
    [440, 230],
    [343, 500],
    [640, 300],
  ] as const) {
    it(`fits every system in ${width} × ${maxHeight}, planets in orbit order and nothing overlapping`, () => {
      for (const system of systems) {
        const map = layout(system, width, maxHeight);
        expect(map.planets.length).toBe(system.planets.length);
        expect(map.height).toBeLessThanOrEqual(Math.max(maxHeight, mapLayoutParams.minHeight));
        let right = map.sunEdge;
        map.planets.forEach((p, i) => {
          // Left to right in order of distance, clear of the star and each other, inside the map.
          expect(p.x - half(p)).toBeGreaterThanOrEqual(right - 1e-6);
          right = p.x + half(p);
          expect(right).toBeLessThanOrEqual(width + 1e-6);
          expect(p.y).toBe(map.axisY);
          expect(p.y + p.r).toBeLessThanOrEqual(map.labelY);
          // Moons straight above, nearest first, not touching the planet or each other, inside the top.
          expect(p.moons.length).toBe(system.planets[i]!.moons.length);
          let below = p.y - Math.max(p.r, p.ring * mapLayoutParams.ringTilt);
          for (const m of p.moons) {
            expect(m.x).toBe(p.x);
            expect(m.y + m.r).toBeLessThan(below);
            below = m.y - m.r;
          }
          expect(below).toBeGreaterThanOrEqual(0);
        });
        expect(map.labelY + mapLayoutParams.labelHeight).toBeLessThanOrEqual(map.height);
      }
    });
  }

  it('draws bigger bodies bigger, compressed', () => {
    const map = layoutSystemMap(
      [
        { radius: 2, moons: [] },
        { radius: 8, moons: [] },
        { radius: 32, moons: [] },
      ],
      { width: 440, maxHeight: 230, stars: [30] },
    );
    const [dwarf, earth, giant] = map.planets as [SystemMapLayout['planets'][number], SystemMapLayout['planets'][number], SystemMapLayout['planets'][number]];
    expect(earth.r).toBeGreaterThan(dwarf.r);
    expect(giant.r).toBeGreaterThan(earth.r);
    expect(giant.r / dwarf.r).toBeCloseTo(4, 1);
  });

  it('puts the star off the left edge, and a binary pair one above the other', () => {
    const one = layoutSystemMap([], { width: 440, maxHeight: 230, stars: [30] });
    expect(one.stars).toHaveLength(1);
    expect(one.stars[0]!.x + one.stars[0]!.r).toBeCloseTo(one.sunEdge);
    const two = layoutSystemMap([], { width: 440, maxHeight: 230, stars: [30, 15] });
    expect(two.stars).toHaveLength(2);
    expect(two.stars[0]!.y).toBeLessThan(two.stars[1]!.y);
    expect(two.stars[1]!.r).toBeLessThan(two.stars[0]!.r);
  });
});

describe('distanceToMapX', () => {
  it('passes through each planet at its orbit and never goes back', () => {
    for (const system of systems.slice(0, 50)) {
      const map = layout(system, 440, 230);
      const orbits = system.planets.map((p) => p.orbit.radius);
      orbits.forEach((d, i) => expect(distanceToMapX(map, system.starZone, orbits, d)).toBeCloseTo(map.planets[i]!.x));
      expect(distanceToMapX(map, system.starZone, orbits, 0)).toBe(map.sunEdge);
      let last = -Infinity;
      for (let d = 0; d < 5000; d += 10) {
        const x = distanceToMapX(map, system.starZone, orbits, d);
        expect(x).toBeGreaterThanOrEqual(last);
        expect(x).toBeLessThanOrEqual(map.width);
        last = x;
      }
    }
  });
});
