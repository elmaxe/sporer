import { describe, expect, it } from 'vitest';
import { climateStateOf, evaluateClimate } from '../src/gen/climate';
import { generateGalaxy, solRef } from '../src/gen/galaxy';
import {
  FLARES,
  RADIATION,
  airColumn,
  areaBetween,
  assessLife,
  beltDose,
  bodyLife,
  bulkOf,
  describeLife,
  flareDose,
  flareFactor,
  formatChance,
  lifetime,
  meltDepth,
  radiationFactor,
  shielding,
  timeFactor,
  waterFraction,
  type LifeEstimate,
} from '../src/gen/life';
import { nominalStar } from '../src/gen/stars';
import { generateSystem, type SystemData } from '../src/gen/system';

// Reference values and their sources: docs/research/life.md.
const galaxy = generateGalaxy(1337);
const sol: SystemData = generateSystem(solRef(galaxy)!);

function life(name: string): LifeEstimate {
  for (const p of sol.planets) {
    if (p.name === name) return bodyLife(sol, p)!;
    const m = p.moons.find((moon) => moon.name === name);
    if (m) return bodyLife(sol, p, m)!;
  }
  throw new Error(`no ${name} in Sol`);
}

describe('chance of life: the Solar System', () => {
  it('Earth has life (its plants)', () => {
    const earth = life('Earth');
    expect(earth.plants).toBe(true);
    expect(earth.chance).toBe(1);
    expect(describeLife(earth)).toBe('life: plants');
  });

  it('dry, airless or molten bodies have none', () => {
    for (const name of ['Mercury', 'Venus', 'Moon', 'Io', 'Phobos', 'Deimos']) expect(life(name).chance, name).toBe(0);
  });

  it('ranks the ocean moons as astrobiology does: Europa, then Enceladus, then Ganymede and Callisto', () => {
    const c = (n: string) => life(n).chance;
    expect(c('Europa')).toBeGreaterThan(c('Enceladus'));
    expect(c('Enceladus')).toBeGreaterThan(c('Ganymede'));
    expect(c('Ganymede')).toBeGreaterThan(c('Callisto'));
    for (const n of ['Europa', 'Enceladus', 'Ganymede', 'Callisto', 'Titan']) {
      expect(life(n).subsurface.kind, n).toBe('ocean');
      expect(life(n).subsurface.liquid, n).toBe(true);
    }
  });

  it("Mars has water in its mid-crust, as InSight found (11.5–20 km), but none on the surface", () => {
    const mars = life('Mars');
    expect(mars.surface.area).toBe(0);
    expect(mars.subsurface.kind).toBe('aquifer');
    expect(mars.subsurface.liquid).toBe(true);
    expect(mars.subsurface.depth).toBeGreaterThan(5);
    expect(mars.subsurface.depth).toBeLessThan(20);
    expect(mars.chance).toBeGreaterThan(0.05);
  });

  it("Europa's ice shell comes out within the published estimates", () => {
    const europa = life('Europa');
    expect(europa.subsurface.depth).toBeGreaterThan(3);
    expect(europa.subsurface.depth).toBeLessThan(40);
  });

  it('every body scores between 0 and 1', () => {
    for (const p of sol.planets) {
      for (const l of [bodyLife(sol, p), ...p.moons.map((m) => bodyLife(sol, p, m))]) {
        if (!l) continue;
        expect(l.chance).toBeGreaterThanOrEqual(0);
        expect(l.chance).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gas giants have no estimate', () => {
    expect(bodyLife(sol, sol.planets.find((p) => p.name === 'Jupiter')!)).toBeNull();
  });
});

describe('chance of life: the parts', () => {
  it("bulkOf gets real moons' densities back from gravity and escape velocity (NASA: Europa 3010, Ganymede 1940, Titan 1880)", () => {
    const density = (n: string) => {
      const m = sol.planets.flatMap((p) => p.moons).find((moon) => moon.name === n)!;
      return bulkOf(m.climate).density;
    };
    expect(density('Europa')).toBeCloseTo(3010, -2);
    expect(density('Ganymede')).toBeCloseTo(1940, -2);
    expect(density('Titan')).toBeCloseTo(1880, -2);
  });

  it('water fraction: 0 for rock, more for lighter bodies', () => {
    expect(waterFraction(5513)).toBe(0);
    expect(waterFraction(3530)).toBe(0);
    expect(waterFraction(1940)).toBeGreaterThan(waterFraction(3010));
    expect(waterFraction(1000)).toBeCloseTo(1, 5);
  });

  it('melt depth: none when already above freezing, deeper with less heat', () => {
    expect(meltDepth(280, 0.05, true)).toBe(0);
    expect(meltDepth(100, 0.01, true)).toBeGreaterThan(meltDepth(100, 0.1, true));
    expect(meltDepth(100, 0, true)).toBe(Infinity);
  });

  it("habitable area: Earth's mean of 288 K leaves liquid water up to ~58° latitude", () => {
    expect(areaBetween(288.15, 273.15, 373)).toBeCloseTo(Math.sin((58.3 * Math.PI) / 180), 2);
    expect(areaBetween(200, 273.15, 373)).toBe(0);
    expect(areaBetween(330, 273.15, 373)).toBe(1);
    expect(areaBetween(330, 273.15, 273)).toBe(0);
  });

  it('air column: Earth ~1033 g/cm², Mars ~16', () => {
    expect(airColumn(1.01325, 1)).toBeCloseTo(1033, -1);
    expect(airColumn(0.0064, 0.379)).toBeCloseTo(17, 0);
  });

  it('shielding passes through Mars (RAD 0.21 of cruise 0.48 mGy/day) and Earth (~0.001 mGy/day at sea level)', () => {
    expect(RADIATION.cosmic * shielding(airColumn(0.0064, 0.379))).toBeCloseTo(0.21, 1);
    const earth = RADIATION.cosmic * shielding(airColumn(1.01325, 1));
    expect(earth).toBeGreaterThan(0.0005);
    expect(earth).toBeLessThan(0.002);
  });

  it('radiation factor: 1 at Earth-like doses, 0 past what D. radiodurans grows under, falling in between', () => {
    expect(radiationFactor(0.001)).toBe(1);
    expect(radiationFactor(RADIATION.sterile * 2)).toBe(0);
    expect(radiationFactor(100)).toBeGreaterThan(radiationFactor(10_000));
  });

  it("Jupiter's belts reproduce the Galilean moons' surface doses within a factor of 2", () => {
    const dose = (distance: number) => beltDose({ size: 'gasGiant', distance });
    for (const [distance, measured] of [
      [9.4, 5400],
      [14.97, 65],
      [26.33, 0.1],
    ] as const) {
      expect(dose(distance) / measured).toBeGreaterThan(0.5);
      expect(dose(distance) / measured).toBeLessThan(2);
    }
    // No more than Europa's inside it (Io's particle energy flux is lower).
    expect(dose(5.9)).toBe(dose(9.4));
    expect(beltDose({ size: 'iceGiant', distance: 10 })).toBeLessThan(dose(10) / 100);
  });

  it("red dwarfs' superflares follow Atri 2017: sterile nowhere, harmless under Earth's air, harsh under a thin one", () => {
    expect(flareDose(1000, 0.65)).toBeLessThan(FLARES.harmful);
    expect(flareFactor(flareDose(1000, 0.65))).toBe(1);
    expect(flareDose(700, 0.65)).toBeCloseTo(7.5, 5);
    expect(flareDose(10, 0.65)).toBeCloseTo(1.46e4, -2);
    expect(flareFactor(flareDose(10, 0.65))).toBeGreaterThan(0);
    expect(flareFactor(flareDose(10, 0.65))).toBeLessThan(0.3);
    expect(flareFactor(FLARES.sterile)).toBe(0);
    // A thin-aired world with liquid water round a red dwarf loses most of its surface chance; round a G star, none.
    const climate = evaluateClimate(
      { insolation: 1.4, gravity: 0.5, escapeVelocity: 7, heatFlow: 0.05 },
      climateStateOf({ pressure: 0.05, composition: 'oxygenNitrogen', greenhouse: 1, water: 0.3, surfaceAlbedo: 0.3 }),
    );
    const thin = { ...climate, habitability: 0 as const };
    const red = assessLife({ type: 'desert', climate: thin, stars: [nominalStar('redDwarf')], host: null });
    const sun = assessLife({ type: 'desert', climate: thin, stars: [nominalStar('mainSequence', 'G')], host: null });
    expect(sun.surface.area).toBeGreaterThan(0);
    expect(red.surface.chance).toBeLessThan(sun.surface.chance * 0.5);
  });

  it("belts fall off with distance and miss solid planets' moons", () => {
    expect(beltDose({ size: 'gasGiant', distance: 6 })).toBeGreaterThan(beltDose({ size: 'gasGiant', distance: 26 }));
    expect(beltDose({ size: 'earth', distance: 60 })).toBe(0);
    expect(beltDose(null)).toBe(0);
  });

  it("time: the Sun's 10 Gyr leaves plenty, massive stars' short lives little", () => {
    expect(lifetime(1)).toBeCloseTo(10, 5);
    const t = (kind: Parameters<typeof nominalStar>[0], cls?: Parameters<typeof nominalStar>[1]) => timeFactor([nominalStar(kind, cls)]);
    expect(t('mainSequence', 'G')).toBeGreaterThan(0.9);
    expect(t('mainSequence', 'G')).toBeGreaterThan(t('mainSequence', 'A'));
    expect(t('mainSequence', 'A')).toBeGreaterThan(t('mainSequence', 'B'));
    expect(t('mainSequence', 'B')).toBeGreaterThan(t('mainSequence', 'O'));
    expect(t('blueGiant')).toBeLessThan(0.1);
    expect(timeFactor([])).toBe(1);
  });

  it('an Earth twin round a short-lived blue giant has a slim chance', () => {
    const climate = evaluateClimate(
      { insolation: 1, gravity: 1, escapeVelocity: 11.186, heatFlow: 0.092 },
      climateStateOf({ pressure: 1, composition: 'oxygenNitrogen', greenhouse: 1, water: 0.7, surfaceAlbedo: 0.3 }),
    );
    // No plants: pretend it's T0 to see the estimate itself.
    const twin = assessLife({ type: 'terran', climate: { ...climate, habitability: 0 }, stars: [nominalStar('mainSequence', 'G')], host: null });
    const blue = assessLife({ type: 'terran', climate: { ...climate, habitability: 0 }, stars: [nominalStar('blueGiant')], host: null });
    expect(twin.chance).toBeGreaterThan(0.8);
    expect(blue.chance).toBeLessThan(0.1);
  });

  it('formats small chances readably', () => {
    expect(formatChance(0)).toBe('0%');
    expect(formatChance(0.0004)).toBe('<0.1%');
    expect(formatChance(0.004)).toBe('0.4%');
    expect(formatChance(0.523)).toBe('52%');
    expect(formatChance(1)).toBe('100%');
  });
});
