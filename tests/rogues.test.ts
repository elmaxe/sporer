import { describe, expect, it } from 'vitest';
import { EARTH_HEAT_FLOW, climateStateOf, evaluateClimate } from '../src/gen/climate';
import { generateGalaxy, systemRef } from '../src/gen/galaxy';
import { geyserKind } from '../src/gen/geysers';
import { ROGUE_CLEARANCE, ROGUES_PER_STAR, describeRogue, isRogue } from '../src/gen/rogues';
import { findHomeSystem, generateSystem, type SystemData } from '../src/gen/system';
import { ROGUE_DOT_SIZE, galaxyStarSize } from '../src/galaxy/appearance';
import { summarizeSystem } from '../src/galaxy/systemSummary';
import { layoutSystemMap, mapLayoutParams } from '../src/ui/systemMapLayout';

const SIGMA = 5.670374419e-8;
const galaxies = [1337, 1, 2, 7, 99].map((seed) => generateGalaxy(seed));
const rogues = galaxies.flatMap((g) => g.rogues.map((ref) => ({ ref, system: generateSystem(ref) })));

describe('rogue planets in the galaxy', () => {
  it('are deterministic', () => {
    expect(generateGalaxy(1337).rogues).toEqual(galaxies[0]!.rogues);
  });

  it('are a handful per galaxy, scaled with the star count', () => {
    for (const g of galaxies) expect(g.rogues.length).toBe(Math.round(g.stars.length * ROGUES_PER_STAR));
    expect(galaxies[0]!.rogues.length).toBeGreaterThanOrEqual(5);
    expect(generateGalaxy(3, 200).rogues.length).toBeGreaterThanOrEqual(1);
  });

  it('take ids after the stars, which ?star= finds', () => {
    for (const g of galaxies) {
      g.rogues.forEach((r, i) => {
        expect(r.id).toBe(g.stars.length + i);
        expect(isRogue(r)).toBe(true);
        expect(systemRef(g, r.id)).toBe(r);
      });
      expect(systemRef(g, 5)).toBe(g.stars[5]);
      expect(systemRef(g, g.stars.length + g.rogues.length)).toBeUndefined();
      expect(systemRef(g, -1)).toBeUndefined();
      expect(systemRef(g, NaN)).toBeUndefined();
      expect(g.stars.some(isRogue)).toBe(false);
    }
  });

  it('drift in the disc, clear of every star and each other', () => {
    for (const g of galaxies) {
      const all = [...g.stars, ...g.rogues];
      for (const r of g.rogues) {
        expect(Math.hypot(r.position.x, r.position.z)).toBeLessThan(g.radius * 1.3);
        for (const s of all) {
          if (s === r) continue;
          const d = Math.hypot(s.position.x - r.position.x, s.position.y - r.position.y, s.position.z - r.position.z);
          expect(d).toBeGreaterThanOrEqual(ROGUE_CLEARANCE);
        }
      }
    }
  });

  it('never become the home system', () => {
    for (const g of galaxies) expect(isRogue(findHomeSystem(g))).toBe(false);
  });

  it('get a ring on the map the size of a small star', () => {
    expect(galaxyStarSize(galaxies[0]!.rogues[0]!)).toBe(ROGUE_DOT_SIZE);
  });
});

describe('a rogue planet system', () => {
  it('has no star and one still planet at the centre', () => {
    for (const { ref, system } of rogues) {
      expect(system.stars).toEqual([]);
      expect(system.planets).toHaveLength(1);
      expect(system.comets).toEqual([]);
      expect(system.habitableRadius).toBe(0);
      const p = system.planets[0]!;
      expect(p.name).toBe(ref.name);
      expect(p.orbit.radius).toBe(0);
      expect(system.starZone).toBe(p.radius);
      expect(system.nebula).toBe(ref.nebula);
      expect(generateSystem(ref)).toEqual(system);
    }
  });

  it('is a frozen solid world, never a gas giant or a living one', () => {
    const types = new Set<string>();
    for (const { system } of rogues) {
      const p = system.planets[0]!;
      types.add(p.type);
      expect(['ice', 'barren', 'lava', 'ocean']).toContain(p.type);
      expect(['dwarf', 'small', 'earth', 'superEarth']).toContain(p.size);
      expect(p.bands).toBeNull();
      expect(p.rings).toBeNull();
      expect(p.climate!.insolation).toBe(0);
    }
    // Over 40 rogues, every kind of surface turns up.
    for (const t of ['ice', 'barren', 'lava', 'ocean']) expect(types).toContain(t);
  });

  it('is warmed only from inside', () => {
    for (const { system } of rogues) {
      for (const body of [system.planets[0]!, ...system.planets[0]!.moons]) {
        const c = body.climate!;
        // With no air, the surface radiates exactly its internal heat: T⁴ = F / σ.
        if (c.composition === 'none') expect(c.temperature).toBeCloseTo((c.heatFlow / SIGMA) ** 0.25, 6);
        else expect(c.temperature).toBeGreaterThan((c.heatFlow / SIGMA) ** 0.25);
      }
    }
    // An airless rogue with Earth's heat flow sits at ~36 K.
    expect((EARTH_HEAT_FLOW / SIGMA) ** 0.25).toBeGreaterThan(34);
    expect((EARTH_HEAT_FLOW / SIGMA) ** 0.25).toBeLessThan(37);
  });

  it('keeps only hydrogen as air, on Earth-sized and bigger worlds', () => {
    for (const { system } of rogues) {
      const p = system.planets[0]!;
      const c = p.climate!;
      expect(['none', 'hydrogen']).toContain(c.composition);
      if (c.composition === 'hydrogen') {
        expect(['earth', 'superEarth']).toContain(p.size);
        expect(p.atmosphere).not.toBeNull();
      }
      for (const m of p.moons) {
        expect(m.climate.composition).toBe('none');
        expect(m.atmosphere).toBeNull();
      }
    }
    expect(rogues.some(({ system }) => system.planets[0]!.climate!.composition === 'hydrogen')).toBe(true);
    expect(rogues.some(({ system }) => system.planets[0]!.climate!.composition === 'none')).toBe(true);
  });

  it('is an ocean world only where the sea under the hydrogen is liquid', () => {
    for (const { system } of rogues) {
      const p = system.planets[0]!;
      if (p.type === 'ocean') {
        expect(p.climate!.composition).toBe('hydrogen');
        expect(p.climate!.waterState).toBe('liquid');
      }
      if (p.type === 'ice') expect(p.climate!.waterState).not.toBe('liquid');
    }
  });

  it('has a moon now and then, and some rogues are geologically alive', () => {
    expect(rogues.some(({ system }) => system.planets[0]!.moons.length > 0)).toBe(true);
    expect(rogues.some(({ system }) => system.planets[0]!.moons.length === 0)).toBe(true);
    const active = rogues.filter(({ system }) => {
      const p = system.planets[0]!;
      return geyserKind(p.type, p.climate) !== null || p.type === 'lava';
    });
    expect(active.length).toBeGreaterThan(rogues.length / 4);
  });

  it('is summarised and mapped without a star', () => {
    const system: SystemData = rogues[0]!.system;
    const summary = summarizeSystem(system);
    expect(summary.planets).toHaveLength(1);
    const layout = layoutSystemMap(
      system.planets.map((p) => ({ radius: p.radius, moons: p.moons.map((m) => ({ radius: m.radius })) })),
      { width: 440, maxHeight: 230, stars: [] },
    );
    expect(layout.stars).toEqual([]);
    expect(layout.sunEdge).toBe(mapLayoutParams.padding);
    const disc = layout.planets[0]!;
    expect(disc.x - disc.r).toBeGreaterThan(0);
    expect(disc.x + disc.r).toBeLessThan(440);
  });

  it('is described as a rogue', () => {
    expect(describeRogue('Ice world · Earth-sized')).toBe('Rogue planet · ice world · Earth-sized');
  });
});

describe('the hydrogen greenhouse', () => {
  /** A starless body's surface temperature under `pressure` bar of hydrogen. */
  const surface = (pressure: number, heatFlow: number, gravity = 1) =>
    evaluateClimate(
      { insolation: 0, gravity, escapeVelocity: 11.2, heatFlow },
      climateStateOf({ pressure, composition: 'hydrogen', greenhouse: 1, water: 0.6, surfaceAlbedo: 0.3 }, gravity),
    );

  it('matches the model rogues it was fitted to (Mol Lous et al. 2022, 1 Earth mass at 4.5 Gyr)', () => {
    // docs/research/rogue-planets.md: 133 bar at 0.058 W/m² gives 189 K, 1290 bar at 0.065 W/m² 373 K; the fit is within 15 K.
    expect(Math.abs(surface(133, 0.058).temperature - 189)).toBeLessThan(15);
    expect(Math.abs(surface(1290, 0.065).temperature - 373)).toBeLessThan(15);
  });

  it("keeps a sea liquid under a few hundred bar at Earth's heat flow, more on lighter worlds", () => {
    // From the fit: 288 bar for 273 K and 397 bar for 300 K at 1 g; 193 and 267 bar at 3 g.
    expect(surface(288, 0.092).temperature).toBeCloseTo(273, -1);
    expect(surface(397, 0.092).temperature).toBeCloseTo(300, -1);
    expect(surface(193, 0.276, 3).temperature).toBeCloseTo(273, -1);
    expect(surface(397, 0.092).waterState).toBe('liquid');
    expect(surface(100, 0.092).waterState).toBe('ice');
    // P²/g: the same air is a weaker blanket on a heavier world (at the same heat flow).
    expect(surface(300, 0.1, 3).temperature).toBeLessThan(surface(300, 0.1, 1).temperature);
  });

  it('agrees with Stevenson 1999: ~1000 bar over a 30 K body melts ice', () => {
    const F = 5.670374419e-8 * 30 ** 4;
    expect(surface(100, F).temperature).toBeLessThan(273);
    expect(surface(1000, F).temperature).toBeGreaterThan(273);
  });
});
