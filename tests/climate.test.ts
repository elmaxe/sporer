import { describe, expect, it } from 'vitest';
import {
  EARTH_HEAT_FLOW,
  IO_HEAT_FLOW,
  MARGINAL_MAX_PRESSURE,
  RETENTION_MARGIN,
  THERMOSTAT,
  atmosphereRetention,
  bodyMass,
  boilingPoint,
  climateSetting,
  climateState,
  describeAtmosphere,
  describeClimate,
  evaluateClimate,
  generateClimate,
  retentionClass,
  terraform,
  tidalHeatFlow,
  type ClimateData,
  type ClimateSetting,
  type ClimateState,
} from '../src/gen/climate';
import { generateGalaxy } from '../src/gen/galaxy';
import { gameRadius } from '../src/gen/planets';
import { Rng } from '../src/gen/rng';
import { generateSystem } from '../src/gen/system';

// Reference values and their sources: docs/research/climate.md.
const EARTH_KM = 6371;
const S = 1361;

function setting(insolation: number, extra: Partial<ClimateSetting> = {}): ClimateSetting {
  return { insolation, gravity: 1, escapeVelocity: 11.186, heatFlow: 0, ...extra };
}

function state(extra: Partial<ClimateState>): ClimateState {
  return { pressure: 0, composition: 'none', greenhouse: 1, water: 0, surfaceAlbedo: 0.3, ...extra };
}

const galaxy = generateGalaxy(1337);
const systems = galaxy.stars.slice(0, 800).map(generateSystem);
const planets = systems.flatMap((s) => s.planets.map((p) => ({ system: s, planet: p })));
const bodies: { type: string; zone: number; climate: ClimateData }[] = planets.flatMap(({ system, planet }) => {
  const zone = planet.orbit.radius / system.habitableRadius;
  return [
    ...(planet.climate ? [{ type: planet.type, zone, climate: planet.climate }] : []),
    ...planet.moons.map((m) => ({ type: `moon-${m.type}`, zone, climate: m.climate })),
  ];
});

describe('surface temperature', () => {
  it('reproduces Earth, Venus, Titan and Mars', () => {
    const earth = evaluateClimate(setting(1), state({ pressure: 1.014, composition: 'oxygenNitrogen', surfaceAlbedo: 0.294 }));
    expect(earth.temperature).toBeCloseTo(288.15, 1);
    // Venus's albedo comes from its cloud deck, whatever the surface.
    const venus = evaluateClimate(setting(2601.3 / S), state({ pressure: 92, composition: 'carbonDioxide', surfaceAlbedo: 0.1 }));
    expect(venus.albedo).toBe(0.77);
    expect(venus.temperature).toBeCloseTo(737.15, 0);
    const titan = evaluateClimate(setting(15.2 / S), state({ pressure: 1.467, composition: 'nitrogen', surfaceAlbedo: 0.6 }));
    expect(titan.albedo).toBe(0.265);
    expect(titan.temperature).toBeCloseTo(93.65, 1);
    // Mars: measured 208 K (fact table) to 214 K (fact sheet); the model has no calibration here.
    const mars = evaluateClimate(setting(586.2 / S), state({ pressure: 0.00636, composition: 'carbonDioxide', surfaceAlbedo: 0.25 }));
    expect(mars.temperature).toBeGreaterThan(208);
    expect(mars.temperature).toBeLessThan(214);
  });

  it('puts an Earth-like world at the habitable radius at 288 K', () => {
    const c = evaluateClimate(setting(1), state({ pressure: 1.014, composition: 'oxygenNitrogen', surfaceAlbedo: 0.294 }));
    expect(c.equilibriumTemperature).toBeCloseTo(255.1, 1);
    expect(c.temperature - c.equilibriumTemperature).toBeCloseTo(33, 0);
  });

  it('is warmer closer in, with more greenhouse and with thicker air, cooler when brighter', () => {
    const base = state({ pressure: 1, composition: 'oxygenNitrogen' });
    const t = (ins: number, s: Partial<ClimateState> = {}) => evaluateClimate(setting(ins), { ...base, ...s }).temperature;
    expect(t(2)).toBeGreaterThan(t(1));
    expect(t(1, { greenhouse: 2 })).toBeGreaterThan(t(1));
    expect(t(1, { pressure: 2 })).toBeGreaterThan(t(1));
    expect(t(1, { surfaceAlbedo: 0.6 })).toBeLessThan(t(1));
    // Airless: exactly the equilibrium temperature.
    const bare = evaluateClimate(setting(1), state({}));
    expect(bare.temperature).toBe(bare.equilibriumTemperature);
  });

  it('adds internal heat to the energy balance (Io-like heating warms a far-out moon)', () => {
    const cold = evaluateClimate(setting(0.01), state({}));
    const heated = evaluateClimate(setting(0.01, { heatFlow: IO_HEAT_FLOW }), state({}));
    expect(heated.temperature).toBeGreaterThan(cold.temperature + 5);
  });

  it('follows the star: planets further out in a system are colder at the same albedo and air', () => {
    for (const { system } of planets.slice(0, 200)) {
      const airless = system.planets.filter((p) => p.climate && p.climate.pressure === 0 && p.climate.heatFlow < 0.2);
      for (let i = 1; i < airless.length; i++) {
        const a = airless[i - 1]!.climate!;
        const b = airless[i]!.climate!;
        // Normalise out the albedo: T_eq ∝ (1 − A)^¼ / √d.
        expect(b.temperature / (1 - b.albedo) ** 0.25).toBeLessThan(a.temperature / (1 - a.albedo) ** 0.25);
      }
    }
  });
});

describe('body properties', () => {
  const km = (r: number) => gameRadius(r / EARTH_KM);

  it('match measured escape velocities (Chen & Kipping for rock, density 1.9 for ice)', () => {
    const cases: [string, number, 'barren' | 'ice', 'small' | 'earth' | 'moon' | 'dwarf', number, number][] = [
      // name, radius km, type, kind, measured km/s, tolerance
      ['Venus', 6051.8, 'barren', 'earth', 10.36, 0.05],
      ['Earth', 6371, 'barren', 'earth', 11.186, 0.05],
      ['Mars', 3389.5, 'barren', 'small', 5.03, 0.05],
      ['Moon', 1737.4, 'barren', 'moon', 2.38, 0.15],
      ['Pluto', 1188.3, 'ice', 'dwarf', 1.21, 0.05],
      ['Ganymede', 2631.2, 'ice', 'moon', 2.741, 0.05],
      ['Callisto', 2410.3, 'ice', 'moon', 2.441, 0.05],
      ['Titan', 2574.76, 'ice', 'moon', 2.641, 0.05],
      ['Triton', 1352.6, 'ice', 'moon', 1.453, 0.05],
    ];
    for (const [name, r, type, kind, v, tol] of cases) {
      const s = climateSetting({ type, kind, radius: km(r), insolation: 1 });
      expect(Math.abs(s.escapeVelocity / v - 1), name).toBeLessThan(tol);
    }
  });

  it('gives Earth one g and Earth mass', () => {
    const s = climateSetting({ type: 'terran', kind: 'earth', radius: 8, insolation: 1 });
    expect(s.gravity).toBeCloseTo(1, 1);
    expect(bodyMass(1, false)).toBeCloseTo(1, 1);
  });

  it('heat flow: the Moon from gravity, Io and Enceladus from tides', () => {
    expect(EARTH_HEAT_FLOW).toBeCloseTo(0.092, 3);
    // The Moon: 16–21 mW/m² measured (Apollo 15 and 17), with its real gravity 0.1654 g.
    const moon = EARTH_HEAT_FLOW * (4902.8 / 398600.4) / (1737.4 / EARTH_KM) ** 2;
    expect(moon).toBeGreaterThan(0.016 * 0.9);
    expect(moon).toBeLessThan(0.021);
    // Io is the calibration.
    expect(tidalHeatFlow(1821.49 / EARTH_KM, 1326, 421800 / 71492)).toBeCloseTo(IO_HEAT_FLOW, 5);
    // Enceladus: 15–40 GW over its surface = 0.019–0.050 W/m².
    const enceladus = tidalHeatFlow(252.1 / EARTH_KM, 687, 238400 / 60268);
    expect(enceladus).toBeGreaterThan(0.019);
    expect(enceladus).toBeLessThan(0.05);
    // The Moon's tides from Earth are negligible.
    expect(tidalHeatFlow(1737.4 / EARTH_KM, 5513, 384400 / 6371)).toBeLessThan(1e-4);
  });
});

describe('the cosmic shoreline', () => {
  // name, escape velocity km/s, insolation (Earth = 1), expected class.
  const cases: [string, number, number, string][] = [
    ['Earth', 11.186, 1, 'holds'],
    ['Venus', 10.36, 2601.3 / S, 'holds'],
    ['Titan', 2.641, 14.82 / S, 'holds'],
    ['Triton', 1.453, 1.508 / S, 'holds'],
    ['Pluto', 1.21, 0.873 / S, 'holds'],
    ['Mars', 5.03, 586.2 / S, 'marginal'],
    ['Ganymede', 2.741, 50.26 / S, 'marginal'],
    ['Io', 2.558, 50.26 / S, 'marginal'],
    ['Mercury', 4.3, 9082.7 / S, 'escapes'],
    ['Moon', 2.38, 1, 'escapes'],
    ['Europa', 2.026, 50.26 / S, 'escapes'],
  ];

  it('separates the Solar System bodies with and without air', () => {
    for (const [name, v, ins, cls] of cases) expect(retentionClass(atmosphereRetention(v, ins)), name).toBe(cls);
  });

  it('keeps small hot bodies airless, and caps marginal ones at a Mars-like film', () => {
    for (const { type, climate } of bodies) {
      if (type === 'terran' || type === 'ocean') continue;
      if (climate.retention < -RETENTION_MARGIN) expect(climate.pressure).toBe(0);
      else if (climate.retention < RETENTION_MARGIN) expect(climate.pressure).toBeLessThanOrEqual(MARGINAL_MAX_PRESSURE);
      expect(climate.leaking).toBe(false);
    }
  });

  it('marks terraformed air on a body that cannot hold it as leaking', () => {
    const moon = evaluateClimate(setting(1, { escapeVelocity: 2.38 }), state({}));
    expect(terraform(moon, { pressure: 1, composition: 'oxygenNitrogen' }).leaking).toBe(true);
  });
});

describe('water', () => {
  it('boils where NIST says', () => {
    expect(boilingPoint(1.01325)).toBeCloseTo(373.2, 1);
    expect(Math.abs(boilingPoint(2.9479) - 406.08)).toBeLessThan(1);
    expect(Math.abs(boilingPoint(19.863) - 485.18)).toBeLessThan(1);
    expect(boilingPoint(1e-5)).toBe(273.16);
  });

  it('is liquid on Earth, ice on a cold world, steam on a hot one and gone below the triple point', () => {
    const w = (ins: number, pressure: number) =>
      evaluateClimate(setting(ins), state({ pressure, composition: 'oxygenNitrogen', water: 0.7, surfaceAlbedo: 0.294 })).waterState;
    expect(w(1, 1)).toBe('liquid');
    expect(w(0.3, 1)).toBe('ice');
    expect(w(3, 1)).toBe('steam');
    expect(w(1.5, 0.001)).toBe('steam');
  });
});

describe('habitability', () => {
  it('rates Earth T3, Mars and Venus T0', () => {
    const earth = evaluateClimate(setting(1), state({ pressure: 1.014, composition: 'oxygenNitrogen', water: 0.7, surfaceAlbedo: 0.294 }));
    expect(earth.habitability).toBe(3);
    const mars = evaluateClimate(setting(0.431), state({ pressure: 0.00636, composition: 'carbonDioxide', surfaceAlbedo: 0.25 }));
    expect(mars.habitability).toBe(0);
    const venus = evaluateClimate(setting(1.911), state({ pressure: 92, composition: 'carbonDioxide' }));
    expect(venus.habitability).toBe(0);
  });

  it('can be raised by terraforming, which changes only the state', () => {
    const mars = evaluateClimate(
      setting(0.431, { escapeVelocity: 5.03, gravity: 0.38 }),
      state({ pressure: 0.00636, composition: 'carbonDioxide', water: 0.1, surfaceAlbedo: 0.25 }),
    );
    const step1 = terraform(mars, { pressure: 1, composition: 'oxygenNitrogen' });
    expect(step1.temperature).toBeGreaterThan(mars.temperature);
    const step2 = terraform(step1, { greenhouse: 5 });
    expect(step2.temperature).toBeGreaterThan(step1.temperature);
    expect(step2.habitability).toBeGreaterThan(mars.habitability);
    for (const k of ['insolation', 'gravity', 'escapeVelocity', 'heatFlow'] as const) expect(step2[k]).toBe(mars[k]);
  });

  it('round-trips: re-evaluating a climate from its own state changes nothing', () => {
    for (const { climate } of bodies.slice(0, 500)) expect(evaluateClimate(climate, climateState(climate))).toEqual(climate);
  });
});

describe('generated climates', () => {
  it('every solid planet and moon has one, gas giants none', () => {
    for (const { planet } of planets) {
      expect(planet.climate === null).toBe(planet.type === 'gas');
      for (const m of planet.moons) expect(m.climate).toBeTruthy();
    }
  });

  it('are deterministic', () => {
    const ref = galaxy.stars[42]!;
    expect(generateSystem(ref)).toEqual(generateSystem(ref));
    const body = { type: 'ice' as const, kind: 'moon' as const, radius: 3, insolation: 0.05 };
    expect(generateClimate(new Rng(7), body)).toEqual(generateClimate(new Rng(7), body));
  });

  it('keep living worlds near the thermostat target, and mostly habitable', () => {
    const living = bodies.filter((b) => b.type === 'terran' || b.type === 'ocean');
    const temps = living.map((b) => b.climate.temperature).sort((a, b) => a - b);
    const median = temps[temps.length >> 1]!;
    expect(median).toBeGreaterThan(THERMOSTAT.target[0]);
    expect(median).toBeLessThan(THERMOSTAT.target[1]);
    expect(living.filter((b) => b.climate.habitability === 3).length / living.length).toBeGreaterThan(0.7);
    expect(living.every((b) => b.climate.composition === 'oxygenNitrogen')).toBe(true);
  });

  it('match their types: frozen ice worlds, molten lava worlds, Venuses and Titans', () => {
    const median = (type: string, f: (c: ClimateData) => number) => {
      const xs = bodies.filter((b) => b.type === type).map((b) => f(b.climate)).sort((a, b) => a - b);
      return xs[xs.length >> 1]!;
    };
    expect(median('ice', (c) => c.temperature)).toBeLessThan(150);
    expect(median('lava', (c) => c.temperature)).toBeGreaterThan(373);
    expect(median('lava', (c) => c.geothermal)).toBeGreaterThan(0.8);
    expect(median('moon-lava', (c) => c.geothermal)).toBeGreaterThan(0.8);
    expect(median('terran', (c) => c.geothermal)).toBeGreaterThan(0.3);
    const venuses = bodies.filter((b) => b.climate.composition === 'carbonDioxide' && b.climate.pressure > 10);
    const titans = bodies.filter((b) => b.climate.composition === 'nitrogen' && b.climate.pressure >= 0.5);
    expect(venuses.length).toBeGreaterThan(5);
    expect(titans.length).toBeGreaterThan(20);
    // Most small moons are airless.
    const moonAir = bodies.filter((b) => b.type.startsWith('moon') && b.climate.pressure > 0).length;
    expect(moonAir / bodies.filter((b) => b.type.startsWith('moon')).length).toBeLessThan(0.1);
  });

  it('heat the inner moons of big planets by tides', () => {
    const gasMoons = planets
      .filter(({ planet }) => planet.size === 'gasGiant')
      .flatMap(({ planet }) => planet.moons.map((m, i) => ({ m, i })))
      .filter(({ m }) => m.type !== 'lava');
    const inner = gasMoons.filter(({ i }) => i === 0).map(({ m }) => m.climate.heatFlow);
    const outer = gasMoons.filter(({ i }) => i >= 2).map(({ m }) => m.climate.heatFlow);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(inner)).toBeGreaterThan(10 * mean(outer));
    expect(Math.max(...inner)).toBeGreaterThan(IO_HEAT_FLOW / 2);
  });

  it('show a glow exactly when there is enough air to see', () => {
    for (const { planet } of planets) {
      if (planet.climate) expect(planet.atmosphere !== null).toBe(planet.climate.pressure >= 0.005);
      for (const m of planet.moons) expect(m.atmosphere !== null).toBe(m.climate.pressure >= 0.005);
    }
  });
});

describe('labels', () => {
  it('read like the roadmap', () => {
    const c = evaluateClimate(setting(0.001), state({ pressure: 0.02, composition: 'nitrogen', surfaceAlbedo: 0.7 }));
    expect(describeClimate(c)).toMatch(/^−\d+ °C · thin N₂ atmosphere$/);
    expect(describeAtmosphere({ pressure: 0, composition: 'none' })).toBe('no atmosphere');
    expect(describeAtmosphere({ pressure: 92, composition: 'carbonDioxide' })).toBe('crushing CO₂ atmosphere');
  });
});
