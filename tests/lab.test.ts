import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../src/gen/galaxy';
import { nominalStar } from '../src/gen/stars';
import { generateSystem, type SystemData } from '../src/gen/system';
import { perihelion } from '../src/gen/orbit';
import { cometConfig } from '../src/world/Comet';
import { asteroidConfig } from '../src/world/AsteroidBelt';
import {
  giantKind,
  LAB_TYPES,
  decodeLab,
  DEFAULT_VIEW,
  encodeLab,
  generateLabPlanet,
  kindRadiusRange,
  labClimateData,
  labFromAsteroid,
  labFromComet,
  labFromSystem,
  labLink,
  labSetting,
  toPlanetConfig,
  withKind,
  withMoons,
  withType,
} from '../src/lab/labPlanet';

const galaxy = generateGalaxy(1337);
const systems: SystemData[] = galaxy.stars.slice(0, 60).map(generateSystem);

describe('generateLabPlanet', () => {
  it('is deterministic', () => {
    expect(generateLabPlanet(42)).toEqual(generateLabPlanet(42));
    expect(generateLabPlanet(42, { type: 'ice', kind: 'moon' })).toEqual(generateLabPlanet(42, { type: 'ice', kind: 'moon' }));
  });

  it('gives every type, with a size class that fits it', () => {
    for (const type of LAB_TYPES) {
      for (let seed = 0; seed < 20; seed++) {
        const p = generateLabPlanet(seed, { type });
        expect(p.type).toBe(type);
        expect(giantKind(p.kind)).toBe(type === 'gas');
        const [min, max] = kindRadiusRange(p.kind);
        expect(p.radius).toBeGreaterThanOrEqual(min);
        expect(p.radius).toBeLessThanOrEqual(max);
        expect(p.bands !== null).toBe(type === 'gas');
        expect(p.climate !== null).toBe(type !== 'gas');
      }
    }
  });

  it('makes moons without rings or moons of their own', () => {
    for (let seed = 0; seed < 20; seed++) {
      const m = generateLabPlanet(seed, { kind: 'moon' });
      expect(m.kind).toBe('moon');
      expect(m.rings).toBeNull();
      expect(m.moons).toEqual([]);
      expect(['barren', 'ice', 'lava']).toContain(m.type);
    }
  });

  it('gives the asked number of moons, on orbits clear of the planet and its rings', () => {
    const p = withMoons(generateLabPlanet(7, { type: 'gas' }), 4);
    expect(p.moons).toHaveLength(4);
    const edge = Math.max(p.radius, p.rings?.outer ?? 0);
    for (const m of p.moons) expect(m.orbit.radius - m.radius).toBeGreaterThan(edge);
  });
});

describe('game planets in the lab', () => {
  it('draws exactly what the game draws', () => {
    for (const system of systems) {
      system.planets.forEach((p, i) => {
        const config = toPlanetConfig(labFromSystem(system, i)!);
        expect(config.style).toEqual(p.style);
        expect(config.radius).toBe(p.radius);
        expect(config.seed).toBe(p.seed);
        expect(config.rings).toEqual(p.rings);
        expect(config.bands ?? null).toEqual(p.bands);
        expect(config.atmosphere).toEqual(p.atmosphere);
        // The climate is re-derived from its setting and state: the same values.
        expect(config.climate).toEqual(p.climate);
        p.moons.forEach((m, j) => {
          const moon = toPlanetConfig(labFromSystem(system, i, j)!);
          expect(moon.climate).toEqual(m.climate);
          expect(moon.style).toEqual(m.style);
        });
      });
    }
  });

  it("recomputes the game's setting from size (so editing the radius behaves like the game)", () => {
    let checked = 0;
    for (const system of systems) {
      system.planets.forEach((p, i) => {
        if (!p.climate || p.type === 'lava') return;
        const lab = labFromSystem(system, i)!;
        const setting = labSetting(lab, p.climate.insolation);
        expect(setting.gravity).toBeCloseTo(p.climate.gravity, 10);
        expect(setting.escapeVelocity).toBeCloseTo(p.climate.escapeVelocity, 10);
        expect(setting.heatFlow).toBeCloseTo(p.climate.heatFlow, 10);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('returns null for planets and moons that are not there', () => {
    expect(labFromSystem(systems[0]!, 99)).toBeNull();
    expect(labFromSystem(systems[0]!, 0, 99)).toBeNull();
    expect(labFromComet(systems[0]!, 99)).toBeNull();
  });

  it('draws comets as the game does, as active as at their closest pass', () => {
    let checked = 0;
    for (const system of systems) {
      system.comets.forEach((c, k) => {
        const lab = labFromComet(system, k)!;
        expect(lab.kind).toBe('comet');
        expect(lab.zone).toBeCloseTo(perihelion(c.orbit) / system.habitableRadius, 10);
        const config = toPlanetConfig(lab);
        const game = cometConfig(c);
        expect(config.shape).toEqual(game.shape);
        expect(config.style).toEqual(game.style);
        expect(config.radius).toBe(game.radius);
        expect(config.seed).toBe(game.seed);
        expect(config.small).toBe('comet');
        expect(config.climate).toBeNull();
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe('comets in the lab', () => {
  it('are made like the game makes them: a shaped, airless nucleus with no moons or rings', () => {
    for (let seed = 0; seed < 20; seed++) {
      const p = generateLabPlanet(seed, { kind: 'comet' });
      expect(p).toEqual(generateLabPlanet(seed, { kind: 'comet' }));
      expect(p.kind).toBe('comet');
      expect(p.shape).not.toBeNull();
      expect(p.climate).toBeNull();
      expect(p.atmosphere).toBeNull();
      expect(p.rings).toBeNull();
      expect(p.moons).toEqual([]);
      const [min, max] = kindRadiusRange('comet');
      expect(p.radius).toBeGreaterThanOrEqual(min);
      expect(p.radius).toBeLessThanOrEqual(max);
      expect(toPlanetConfig(p).small).toBe('comet');
    }
  });

  it('become round bodies and back', () => {
    const comet = generateLabPlanet(5, { kind: 'comet' });
    const earth = withKind(comet, 'earth');
    expect(earth.shape).toBeNull();
    expect(earth.climate).not.toBeNull();
    expect(toPlanetConfig(earth).small).toBeNull();
    const back = withKind(earth, 'comet');
    expect(back.kind).toBe('comet');
    expect(back.shape).not.toBeNull();
    expect(back.climate).toBeNull();
    // Another type recolours a comet but keeps it a comet; a gas comet is a gas giant.
    expect(withType(comet, 'ice').shape).toEqual(comet.shape);
    expect(withType(comet, 'gas').kind).toBe('gasGiant');
    expect(withType(comet, 'gas').shape).toBeNull();
  });

  it('round-trip through a link, shape and all', () => {
    const planet = generateLabPlanet(9, { kind: 'comet' });
    const state = decodeLab(encodeLab({ planet, view: DEFAULT_VIEW, source: { seed: '1337', star: 3, planet: 0, comet: 1 } }))!;
    expect(state.planet).toEqual(planet);
    expect(state.source?.comet).toBe(1);
  });
});

describe('asteroids in the lab', () => {
  it('draws named asteroids as the game does', () => {
    let checked = 0;
    for (const system of systems) {
      system.belts.forEach((belt, b) =>
        belt.asteroids.forEach((a, k) => {
          const lab = labFromAsteroid(system, b, k)!;
          expect(lab.kind).toBe('asteroid');
          const config = toPlanetConfig(lab);
          const game = asteroidConfig(a);
          expect(config.shape).toEqual(game.shape);
          expect(config.style).toEqual(game.style);
          expect(config.radius).toBe(game.radius);
          expect(config.seed).toBe(game.seed);
          expect(config.small).toBe('asteroid');
          expect(config.climate).toBeNull();
          checked++;
        }),
      );
    }
    expect(checked).toBeGreaterThan(10);
    expect(labFromAsteroid(systems[0]!, 99, 0)).toBeNull();
  });

  it('are made like the game makes them, and turn into comets, round bodies and back', () => {
    for (let seed = 0; seed < 20; seed++) {
      const p = generateLabPlanet(seed, { kind: 'asteroid' });
      expect(p).toEqual(generateLabPlanet(seed, { kind: 'asteroid' }));
      expect(p.kind).toBe('asteroid');
      expect(p.shape).not.toBeNull();
      expect(p.climate).toBeNull();
      const [min, max] = kindRadiusRange('asteroid');
      expect(p.radius).toBeGreaterThanOrEqual(min - 1e-9);
      expect(p.radius).toBeLessThanOrEqual(max + 1e-9);
      expect(toPlanetConfig(p).small).toBe('asteroid');
    }
    const asteroid = generateLabPlanet(4, { kind: 'asteroid' });
    expect(withKind(asteroid, 'comet').kind).toBe('comet');
    expect(withKind(asteroid, 'moon').shape).toBeNull();
    expect(withKind(withKind(asteroid, 'moon'), 'asteroid').kind).toBe('asteroid');
    expect(withType(asteroid, 'ice').shape).toEqual(asteroid.shape);
  });

  it('round-trip through a link, with where they came from', () => {
    const planet = generateLabPlanet(9, { kind: 'asteroid' });
    const state = decodeLab(encodeLab({ planet, view: DEFAULT_VIEW, source: { seed: '1337', star: 6, planet: 0, belt: 0, asteroid: 2 } }))!;
    expect(state.planet).toEqual(planet);
    expect(state.source?.asteroid).toBe(2);
  });
});

describe('editing', () => {
  it('turns a solid world into a gas giant and back, keeping seed, spin, tilt and starlight', () => {
    const rock = generateLabPlanet(3, { type: 'desert', kind: 'earth' });
    const gas = withType(rock, 'gas');
    expect(gas.kind).toBe('gasGiant');
    expect(gas.climate).toBeNull();
    expect(gas.bands!.length).toBeGreaterThanOrEqual(4);
    expect([gas.seed, gas.spin, gas.tilt]).toEqual([rock.seed, rock.spin, rock.tilt]);
    const back = withType(gas, 'ice');
    expect(back.kind).toBe('superEarth');
    expect(back.climate!.setting.insolation).toBeCloseTo(1 / 2.5 ** 2);
    const [min, max] = kindRadiusRange('superEarth');
    expect(back.radius).toBeGreaterThanOrEqual(min);
    expect(back.radius).toBeLessThanOrEqual(max);
  });

  it('moves the radius into a new size class and recomputes gravity', () => {
    const p = generateLabPlanet(9, { type: 'barren', kind: 'earth' });
    const dwarf = withKind(p, 'dwarf');
    const [min, max] = kindRadiusRange('dwarf');
    expect(dwarf.radius).toBeGreaterThanOrEqual(min);
    expect(dwarf.radius).toBeLessThanOrEqual(max);
    expect(dwarf.climate!.setting.gravity).toBeLessThan(p.climate!.setting.gravity);
    expect(withKind(p, 'moon').rings).toBeNull();
    expect(withKind(p, 'gasGiant').type).toBe('gas');
  });

  it('derives the climate from the edited state', () => {
    const p = generateLabPlanet(5, { type: 'barren', kind: 'earth' });
    const cold = labClimateData(p)!;
    p.climate!.state = { ...p.climate!.state, composition: 'carbonDioxide', pressure: 90 };
    const venus = labClimateData(p)!;
    expect(venus.temperature).toBeGreaterThan(cold.temperature + 100);
    expect(venus.albedo).toBeCloseTo(0.77);
  });
});

describe('lab links', () => {
  it('round-trip a planet, its view and where it came from', () => {
    const planet = withMoons(generateLabPlanet(11, { type: 'terran' }), 2);
    const state = { planet, view: { ...DEFAULT_VIEW, view: 'system' as const, sunAzimuth: -40 }, source: { seed: '1337', star: 5, planet: 1 } };
    const decoded = decodeLab(encodeLab(state));
    expect(decoded).toEqual(state);
    expect(encodeLab(state)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('keep non-ASCII names', () => {
    const planet = { ...generateLabPlanet(1), name: 'Ærø–Ω ☄' };
    expect(decodeLab(encodeLab({ planet, view: DEFAULT_VIEW }))!.planet.name).toBe('Ærø–Ω ☄');
  });

  it('fill in what an old or partial link leaves out, and reject junk', () => {
    const partial = btoa(JSON.stringify({ planet: { seed: 4, type: 'ice', name: 'Old' } })).replace(/=+$/, '');
    const state = decodeLab(partial)!;
    expect(state.planet.name).toBe('Old');
    expect(state.planet.type).toBe('ice');
    expect(state.planet.climate).not.toBeNull();
    expect(state.view).toEqual(DEFAULT_VIEW);
    expect(decodeLab('not a lab link!')).toBeNull();
    expect(decodeLab(btoa('{"view":{}}'))).toBeNull();
  });

  it('point at lab.html next to the game', () => {
    const link = labLink(generateLabPlanet(2), 'https://example.com/sporer/?star=3');
    expect(link.startsWith('https://example.com/sporer/lab.html#')).toBe(true);
    expect(decodeLab(link.split('#')[1]!)!.planet.seed).toBe(2);
  });
});

describe('nominalStar', () => {
  it('gives the class asked for, at its base luminosity', () => {
    expect(nominalStar('mainSequence', 'G')).toMatchObject({ spectralClass: 'G', luminosity: 1, mass: 1 });
    expect(nominalStar('mainSequence', 'K').spectralClass).toBe('K');
    expect(nominalStar('redDwarf').spectralClass).toBe('M');
    expect(nominalStar('blueGiant').luminosity).toBe(20);
  });
});
