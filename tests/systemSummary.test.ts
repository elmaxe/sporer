import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../src/gen/galaxy';
import { MOON_RADIUS } from '../src/gen/planets';
import { findHomeSystem, generateSystem } from '../src/gen/system';
import { airOf, describeBodyCount, summarizeSystem, warmthOf, WARMTH_SPLIT } from '../src/galaxy/systemSummary';

const galaxy = generateGalaxy(1337);

describe('systemSummary', () => {
  it('colours habitable bodies green and splits the rest into hot and cold', () => {
    expect(warmthOf(1, 400)).toBe('habitable');
    expect(warmthOf(3, 288)).toBe('habitable');
    expect(warmthOf(0, 700)).toBe('hot');
    expect(warmthOf(0, 90)).toBe('cold');
    expect(warmthOf(0, WARMTH_SPLIT + 1)).toBe('hot');
    expect(warmthOf(0, WARMTH_SPLIT - 1)).toBe('cold');
  });

  it('bands the air like describeAtmosphere', () => {
    expect(airOf({ composition: 'none', pressure: 0 })).toBe('none');
    expect(airOf({ composition: 'nitrogen', pressure: 0.0005 })).toBe('none');
    expect(airOf({ composition: 'carbonDioxide', pressure: 0.006 })).toBe('thin');
    expect(airOf({ composition: 'oxygenNitrogen', pressure: 1 })).toBe('normal');
    expect(airOf({ composition: 'carbonDioxide', pressure: 92 })).toBe('thick');
  });

  it('lists every planet and moon in orbit order, with the climate tiers', () => {
    for (const star of galaxy.stars.slice(0, 100)) {
      const system = generateSystem(star);
      const summary = summarizeSystem(system);
      expect(summary.planets.map((p) => p.name)).toEqual(system.planets.map((p) => p.name));
      expect(summary.moonCount).toBe(system.planets.reduce((n, p) => n + p.moons.length, 0));
      summary.planets.forEach((row, i) => {
        const planet = system.planets[i]!;
        expect(row.moons).toHaveLength(planet.moons.length);
        expect(row.tier).toBe(planet.climate?.habitability ?? 0);
        expect(row.size).toBe(planet.size);
        expect(row.rings).toBe(planet.rings !== null);
        row.moons.forEach((m, j) => expect(m.big).toBe(planet.moons[j]!.radius >= MOON_RADIUS.bigMin));
        if (row.tier > 0) expect(row.warmth).toBe('habitable');
      });
    }
  });

  it('shows the home system has a green T3 world', () => {
    const summary = summarizeSystem(generateSystem(findHomeSystem(galaxy)));
    expect(summary.planets.some((p) => p.tier === 3 && p.warmth === 'habitable')).toBe(true);
  });

  it('gives hot gas giants close in and cold ones far out', () => {
    const marks = galaxy.stars.slice(0, 300).flatMap((star) => {
      const system = generateSystem(star);
      const rows = summarizeSystem(system).planets;
      return system.planets.flatMap((p, i) =>
        p.type === 'gas' ? [{ zone: p.orbit.radius / system.habitableRadius, warmth: rows[i]!.warmth }] : [],
      );
    });
    expect(marks.some((m) => m.warmth === 'cold')).toBe(true);
    for (const m of marks) expect(m.warmth).toBe(m.zone > 1 ? 'cold' : m.zone < 0.9 ? 'hot' : m.warmth);
  });

  it('counts bodies in words', () => {
    expect(describeBodyCount({ planets: [], moonCount: 0 })).toBe('No planets');
    const one = { name: 'A I', tier: 0 as const, warmth: 'cold' as const, air: 'none' as const, size: 'small' as const, rings: false, moons: [] };
    expect(describeBodyCount({ planets: [one], moonCount: 0 })).toBe('1 planet');
    expect(describeBodyCount({ planets: [one, one], moonCount: 1 })).toBe('2 planets · 1 moon');
    expect(describeBodyCount({ planets: [one, one], moonCount: 5 })).toBe('2 planets · 5 moons');
    expect(describeBodyCount({ planets: [one, one], moonCount: 5, beltCount: 1 })).toBe('2 planets · 5 moons · 1 belt');
    expect(describeBodyCount({ planets: [one], moonCount: 0, beltCount: 3 })).toBe('1 planet · 3 belts');
  });
});
