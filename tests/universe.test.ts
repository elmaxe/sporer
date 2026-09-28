import { describe, expect, it } from 'vitest';
import { GALAXY_RADIUS, generateGalaxy } from '../src/gen/galaxy';
import { findHomeSystem, generateSystem, spawnDistance, type SystemData } from '../src/gen/system';
import type { StarKind } from '../src/gen/stars';

const galaxy = generateGalaxy(1337);
// A few hundred systems is plenty to catch layout bugs while staying fast.
const systems: SystemData[] = galaxy.stars.slice(0, 400).map(generateSystem);

describe('generateGalaxy', () => {
  it('is deterministic', () => {
    expect(generateGalaxy(1337, 200)).toEqual(generateGalaxy(1337, 200));
  });

  it('differs between seeds', () => {
    expect(generateGalaxy(1, 50).stars.map((s) => s.name)).not.toEqual(generateGalaxy(2, 50).stars.map((s) => s.name));
  });

  it('keeps stars roughly inside the galaxy disc', () => {
    for (const s of galaxy.stars) {
      expect(Math.hypot(s.position.x, s.position.z)).toBeLessThan(GALAXY_RADIUS * 1.3);
      expect(Math.abs(s.position.y)).toBeLessThan(GALAXY_RADIUS * 0.2);
    }
  });

  it('has sensible proportions of star kinds and binaries', () => {
    const n = galaxy.stars.length;
    const kinds = new Map<StarKind, number>();
    for (const s of galaxy.stars) kinds.set(s.stars[0]!.kind, (kinds.get(s.stars[0]!.kind) ?? 0) + 1);
    const binaries = galaxy.stars.filter((s) => s.stars.length === 2).length / n;

    expect(kinds.get('mainSequence')! / n).toBeGreaterThan(0.45);
    for (const kind of ['redDwarf', 'whiteDwarf', 'redGiant', 'blueGiant'] as const) {
      expect(kinds.get(kind) ?? 0).toBeGreaterThan(0);
    }
    expect(binaries).toBeGreaterThan(0.1);
    expect(binaries).toBeLessThan(0.2);
  });

  it('orders binary members largest first', () => {
    for (const s of galaxy.stars) {
      if (s.stars.length === 2) expect(s.stars[0]!.radius).toBeGreaterThanOrEqual(s.stars[1]!.radius);
    }
  });
});

describe('generateSystem', () => {
  it('is deterministic', () => {
    const ref = galaxy.stars[17]!;
    expect(generateSystem(ref)).toEqual(generateSystem(ref));
  });

  it('keeps planet neighbourhoods clear of the stars and of each other', () => {
    for (const system of systems) {
      let edge = system.starZone;
      for (const p of system.planets) {
        expect(p.orbit.radius - p.extent).toBeGreaterThan(edge);
        edge = p.orbit.radius + p.extent;
      }
    }
  });

  it('keeps binary stars from overlapping', () => {
    for (const system of systems) {
      if (system.stars.length !== 2) continue;
      const [a, b] = system.stars as [SystemData['stars'][0], SystemData['stars'][0]];
      expect(a.orbit.radius + b.orbit.radius).toBeGreaterThan(a.radius + b.radius);
    }
  });

  it('puts moons outside their planet and rings, inside its extent', () => {
    for (const p of systems.flatMap((s) => s.planets)) {
      let edge = Math.max(p.radius, p.rings?.outer ?? 0);
      for (const m of p.moons) {
        expect(m.orbit.radius - m.radius).toBeGreaterThan(edge);
        expect(m.orbit.radius + m.radius).toBeLessThanOrEqual(p.extent);
        edge = m.orbit.radius + m.radius;
      }
    }
  });

  it('makes outer planets orbit more slowly', () => {
    for (const system of systems) {
      for (let i = 1; i < system.planets.length; i++) {
        expect(system.planets[i]!.orbit.period).toBeGreaterThan(system.planets[i - 1]!.orbit.period);
      }
    }
  });

  it('produces every planet type, with bands only on gas giants', () => {
    const planets = systems.flatMap((s) => s.planets);
    const types = new Set(planets.map((p) => p.type));
    expect([...types].sort()).toEqual(['barren', 'desert', 'gas', 'ice', 'lava', 'ocean', 'terran']);
    for (const p of planets) expect(p.bands !== null).toBe(p.type === 'gas');
  });

  it('spawns the player in empty space', () => {
    for (const system of systems) {
      const d = spawnDistance(system);
      expect(d).toBeGreaterThan(system.starZone);
      for (const p of system.planets) {
        expect(Math.abs(d - p.orbit.radius)).toBeGreaterThan(p.extent);
      }
    }
  });
});

describe('findHomeSystem', () => {
  it('picks a lone sun-like star with a habitable planet', () => {
    const ref = findHomeSystem(galaxy);
    const system = generateSystem(ref);
    expect(ref.stars).toHaveLength(1);
    expect(['G', 'K']).toContain(ref.stars[0]!.spectralClass);
    expect(system.planets.length).toBeGreaterThanOrEqual(4);
    expect(system.planets.some((p) => p.type === 'terran' || p.type === 'ocean')).toBe(true);
  });
});
