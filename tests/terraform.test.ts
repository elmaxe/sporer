import { describe, expect, it } from 'vitest';
import { climateStateOf, evaluateClimate, totalPressure, type ClimateData, type ClimateSetting, type StateSpec } from '../src/gen/climate';
import {
  HEAT_CAPACITY,
  TERRAFORM_TUNING,
  TerraformLogs,
  TerraformTimeline,
  climateAt,
  delivered,
  leakFactor,
  leakTime,
  massOfPressure,
  modeAt,
  pressureOfMass,
  radiusFromSetting,
  responseTime,
  type ModeChange,
  type TerraformAction,
} from '../src/gen/terraform';
import { generateGalaxy } from '../src/gen/galaxy';
import { findHomeSystem, generateSystem } from '../src/gen/system';

// Sources and the reasoning behind each number: docs/research/terraforming.md.

const EARTH: ClimateSetting = { insolation: 1, gravity: 1, escapeVelocity: 11.186, heatFlow: 0.092 };
const MARS: ClimateSetting = { insolation: 586.2 / 1361, gravity: 0.379, escapeVelocity: 5.03, heatFlow: 0.019 };
const MOON: ClimateSetting = { insolation: 1, gravity: 0.165, escapeVelocity: 2.38, heatFlow: 0.016 };

function body(setting: ClimateSetting, spec: StateSpec): ClimateData {
  return evaluateClimate(setting, climateStateOf({ surfaceAlbedo: 0.25, ...spec }, setting.gravity));
}

const heat = (start: number, amount: number, duration = 0): TerraformAction => ({ lever: 'heat', start, duration, amount });
const real: ModeChange[] = [{ time: 0, mode: 'real' }];

describe('an untouched body', () => {
  it('is its generated climate at any time', () => {
    const mars = body(MARS, { pressure: 0.006, composition: 'carbonDioxide' });
    expect(climateAt(mars, [], 1e6).climate).toEqual(mars);
    // Before its first action, too.
    const later = climateAt(mars, [heat(100, 50)], 50);
    expect(later.climate).toEqual(mars);
    expect(later.settlesIn).toBe(0);
  });
});

describe('the temperature over time', () => {
  it('relaxes towards the climate its state settles at, with the response time', () => {
    const mars = body(MARS, { pressure: 0.006, composition: 'carbonDioxide' });
    const actions = [heat(10, 100)];
    const target = evaluateClimate(MARS, { ...climateStateOf(mars), magicHeat: 100 }).temperature;
    const tau = responseTime(mars, MARS.gravity, TERRAFORM_TUNING.real);
    const at = (t: number) => climateAt(mars, actions, t, real);
    const start = mars.temperature;
    // After one response time ~63% of the way, after many it's there.
    expect((at(10 + tau).climate.temperature - start) / (target - start)).toBeCloseTo(1 - Math.exp(-1), 1);
    expect(at(10 + 30 * tau).climate.temperature).toBeCloseTo(target, 3);
    expect(at(10 + 30 * tau).settlesIn).toBe(0);
    // The target is known from the start, with an estimate of how long it takes.
    const first = at(11);
    expect(first.target.temperature).toBeCloseTo(target, 6);
    expect(first.settlesIn).toBeGreaterThan(tau);
    // Water and tier follow the temperature reached, not the target.
    expect(first.climate.temperature).toBeLessThan(first.target.temperature);
  });

  it('is slower with oceans and thick air: ~20 s dry, ~90 s under an ocean (Real), a third of that Relaxed', () => {
    const r = (spec: StateSpec, mode: 'real' | 'relaxed' = 'real', g = 1) =>
      responseTime(climateStateOf(spec), g, TERRAFORM_TUNING[mode]);
    expect(r({})).toBeCloseTo(20, 9);
    expect(r({ pressure: 1, composition: 'oxygenNitrogen', water: 1 })).toBeCloseTo(90, 9);
    expect(r({ pressure: 1, composition: 'oxygenNitrogen', water: 1 }, 'relaxed')).toBeCloseTo(30, 9);
    expect(r({ pressure: 1, composition: 'oxygenNitrogen' })).toBeGreaterThan(r({}));
    expect(r({ pressure: 1, composition: 'oxygenNitrogen', water: 0.5 })).toBeGreaterThan(r({ pressure: 1, composition: 'oxygenNitrogen' }));
    // Venus's 92 bar holds more heat than an ocean's mixed layer.
    expect(r({ pressure: 92, composition: 'carbonDioxide' }, 'real', 0.9)).toBeGreaterThan(90);
    // The capacities themselves (Battisti): the mixed layer ~30× the air, ~100× the land.
    expect(HEAT_CAPACITY.ocean / HEAT_CAPACITY.airPerBar).toBeCloseTo(30, -1);
    expect(HEAT_CAPACITY.ocean / HEAT_CAPACITY.ground).toBeCloseTo(105, -1);
  });
});

describe('actions', () => {
  it('deliver their amount evenly over their duration, gas counting fully after it spreads', () => {
    const a = { start: 10, duration: 20, amount: 4 };
    expect(delivered(a, 10)).toBe(0);
    expect(delivered(a, 20)).toBeCloseTo(2, 12);
    expect(delivered(a, 40)).toBeCloseTo(4, 12);
    // At once, spreading over 10 s.
    const now = { start: 0, duration: 0, amount: 1 };
    expect(delivered(now, 5, 10)).toBeCloseTo(0.5, 12);
    expect(delivered(now, 10, 10)).toBe(1);
    // Held 20 s and spreading 10: all counted 30 s after the start, and smoothly on the way.
    expect(delivered(a, 40, 10)).toBeCloseTo(4, 12);
    let last = 0;
    for (let t = 10; t <= 40; t += 0.5) {
      const d = delivered(a, t, 10);
      expect(d).toBeGreaterThanOrEqual(last - 1e-12);
      expect(d - last).toBeLessThanOrEqual((4 / 20) * 0.5 + 1e-9);
      last = d;
    }
  });

  it('add and take gas, water and greenhouse within their bounds', () => {
    const moon = body(EARTH, {});
    const actions: TerraformAction[] = [
      { lever: 'n2', start: 0, duration: 10, amount: 0.8 },
      { lever: 'o2', start: 0, duration: 0, amount: 0.2 },
      { lever: 'water', start: 0, duration: 5, amount: 2 },
      { lever: 'co2', start: 0, duration: 0, amount: -1 },
      { lever: 'greenhouse', start: 0, duration: 0, amount: 1 },
    ];
    const c = climateAt(moon, actions, 100).climate;
    expect(c.gases.n2).toBeCloseTo(0.8, 9);
    expect(c.gases.o2).toBeCloseTo(0.2, 9);
    expect(c.gases.co2).toBe(0);
    expect(c.water).toBe(1);
    expect(c.composition).toBe('oxygenNitrogen');
    expect(c.greenhouse).toBe(1);
  });

  it('are a pure function of the log and the time, however the timeline is queried', () => {
    const mars = body(MARS, { pressure: 0.006, composition: 'carbonDioxide', water: 0.3 });
    const actions: TerraformAction[] = [
      { lever: 'n2', start: 5, duration: 30, amount: 1 },
      heat(20, 40, 15),
      { lever: 'aerosol', start: 60, duration: 0, amount: 0.1 },
      { lever: 'greenhouse', start: 70, duration: 10, amount: 3 },
    ];
    const timeline = new TerraformTimeline(mars, actions, real);
    // Frame by frame, then jumps back and forth.
    for (let t = 0; t < 200; t += 1 / 60) timeline.at(t);
    for (const t of [150.3, 47.25, 200, 12.5, 199.9]) expect(timeline.at(t)).toEqual(climateAt(mars, actions, t, real));
    // Recording an earlier action drops what came after it.
    const extra: TerraformAction = { lever: 'water', start: 30, duration: 0, amount: 0.2 };
    timeline.record(extra);
    expect(timeline.at(180)).toEqual(climateAt(mars, [...actions, extra], 180, real));
    // So does growing a held ray.
    const held = timeline.log.indexOf(timeline.log.find((a) => a.lever === 'heat')!);
    timeline.update(held, heat(20, 80, 30));
    expect(timeline.at(190)).toEqual(climateAt(mars, [...actions.filter((a) => a.lever !== 'heat'), extra, heat(20, 80, 30)], 190, real));
  });
});

describe('aerosols', () => {
  it('rain out with their half-life: ~2 minutes Real, three times that Relaxed', () => {
    const earth = body(EARTH, { pressure: 1, composition: 'oxygenNitrogen', water: 0.7 });
    const spray = [{ lever: 'aerosol' as const, start: 0, duration: 0, amount: 0.2 }];
    expect(climateAt(earth, spray, 120, real).climate.aerosol).toBeCloseTo(0.1, 6);
    expect(climateAt(earth, spray, 360).climate.aerosol).toBeCloseTo(0.1, 6);
    // And cool the world while they last.
    expect(climateAt(earth, spray, 60, real).target.temperature).toBeLessThan(earth.temperature);
  });
});

describe('leaks', () => {
  it('take minutes on a moon and an hour on Mars, longer the better a body holds its air', () => {
    const r = (s: ClimateSetting) => evaluateClimate(s, climateStateOf({})).retention;
    expect(leakTime(r(MARS), TERRAFORM_TUNING.real)).toBeGreaterThan(3000);
    expect(leakTime(r(MARS), TERRAFORM_TUNING.real)).toBeLessThan(4500);
    expect(leakTime(r(MOON), TERRAFORM_TUNING.real)).toBeGreaterThan(120);
    expect(leakTime(r(MOON), TERRAFORM_TUNING.real)).toBeLessThan(600);
  });

  it('bleed air above what the body holds in Real, never in Relaxed or Sandbox', () => {
    const moon = body(MOON, {});
    const air: TerraformAction[] = [
      { lever: 'n2', start: 0, duration: 0, amount: 0.8 },
      { lever: 'o2', start: 0, duration: 0, amount: 0.2 },
    ];
    const p = (modes = real, t = 600) => climateAt(moon, air, t, modes).climate.pressure;
    expect(p()).toBeLessThan(0.3);
    expect(p(real, 3000)).toBeLessThan(0.001);
    expect(p([{ time: 0, mode: 'relaxed' }])).toBeCloseTo(1, 9);
    expect(p([{ time: 0, mode: 'sandbox' }])).toBeCloseTo(1, 9);
    expect(climateAt(moon, air, 600, real).climate.leaking).toBe(true);
    // Switched to Real at 300 s: it only starts leaking then.
    const switched = [
      { time: 0, mode: 'relaxed' as const },
      { time: 300, mode: 'real' as const },
    ];
    expect(climateAt(moon, air, 300, switched).climate.pressure).toBeCloseTo(1, 9);
    expect(climateAt(moon, air, 600, switched).climate.pressure).toBeLessThan(0.8);
    // A body that holds its air keeps any amount.
    const earth = body(EARTH, { pressure: 1, composition: 'oxygenNitrogen' });
    expect(climateAt(earth, [{ lever: 'n2', start: 0, duration: 0, amount: 5 }], 5000, real).climate.pressure).toBeCloseTo(6, 6);
  });

  it('lose the light gases first (Jeans escape): hydrogen, then nitrogen and oxygen, CO₂ last', () => {
    expect(leakFactor('n2')).toBe(1);
    expect(leakFactor('h2')).toBeGreaterThan(10);
    expect(leakFactor('o2')).toBeLessThan(1);
    expect(leakFactor('co2')).toBeLessThan(leakFactor('o2'));
    const moon = body(MOON, {});
    const mix: TerraformAction[] = (['h2', 'n2', 'co2'] as const).map((lever) => ({ lever, start: 0, duration: 0, amount: 0.3 }));
    const g = climateAt(moon, mix, 200, real).climate.gases;
    expect(g.h2).toBeLessThan(g.n2);
    expect(g.n2).toBeLessThan(g.co2);
  });
});

describe('modes', () => {
  it('are the last change at or before a time, Relaxed by default', () => {
    expect(modeAt([], 5)).toBe('relaxed');
    const modes = [
      { time: 10, mode: 'real' as const },
      { time: 20, mode: 'sandbox' as const },
    ];
    expect(modeAt(modes, 5)).toBe('real');
    expect(modeAt(modes, 15)).toBe('real');
    expect(modeAt(modes, 25)).toBe('sandbox');
  });
});

describe('matter', () => {
  it('turns a mass of gas into pressure by the body’s gravity and size', () => {
    expect(radiusFromSetting(EARTH)).toBeCloseTo(1, 9);
    // Mars: 3389.5 km / 6371 km = 0.532 Earth radii (NASA).
    expect(radiusFromSetting(MARS)).toBeCloseTo(0.532, 2);
    expect(pressureOfMass(1, EARTH)).toBeCloseTo(1, 9);
    // A small world fills up cheaply: the mass of Earth's air makes more than a bar on Mars.
    expect(pressureOfMass(1, MARS)).toBeGreaterThan(1.3);
    expect(massOfPressure(pressureOfMass(0.7, MARS), MARS)).toBeCloseTo(0.7, 12);
  });
});

describe('the logs', () => {
  it('keep each body’s actions in order and the mode changes, through JSON', () => {
    const logs = new TerraformLogs();
    logs.record('Haikrai III:1', heat(20, 5));
    logs.record('Haikrai III:1', heat(10, 5));
    logs.record('Haikrai II:2', { lever: 'n2', start: 5, duration: 2, amount: -0.1, site: [0, 1, 0] });
    logs.setMode(0, 'real');
    logs.setMode(5, 'real');
    logs.setMode(30, 'relaxed');
    expect(logs.actions('Haikrai III:1').map((a) => a.start)).toEqual([10, 20]);
    expect(logs.actions('nowhere')).toEqual([]);
    expect(logs.modes).toEqual([
      { time: 0, mode: 'real' },
      { time: 30, mode: 'relaxed' },
    ]);
    const back = TerraformLogs.fromJSON(JSON.parse(JSON.stringify(logs.toJSON())));
    expect(back.toJSON()).toEqual(logs.toJSON());
  });
});

describe('the home system’s first project (Haikrai III)', () => {
  const galaxy = generateGalaxy(1337);
  const home = generateSystem(findHomeSystem(galaxy));
  const iii = home.planets.find((p) => p.name.endsWith(' III'))!;

  it('is a frozen, near-airless world that magic rays can bring to T3', () => {
    const base = iii.climate!;
    expect(base.habitability).toBe(0);
    expect(base.temperature).toBeLessThan(200);
    // Air first, then water and greenhouse gas (docs/design/terraforming.md, Reaching T3).
    const actions: TerraformAction[] = [
      { lever: 'n2', start: 0, duration: 20, amount: 0.79 },
      { lever: 'o2', start: 0, duration: 20, amount: 0.21 },
      { lever: 'water', start: 30, duration: 10, amount: 0.4 },
      { lever: 'greenhouse', start: 40, duration: 20, amount: 12 },
    ];
    const timeline = new TerraformTimeline(base, actions);
    const at = (t: number) => timeline.at(t).climate;
    // Released over 20 s, the gas has spread round the globe 10 s later.
    expect(totalPressure(at(25).gases)).toBeLessThan(1);
    expect(totalPressure(at(30).gases)).toBeCloseTo(1 + base.pressure, 6);
    expect(at(35).composition).toBe('oxygenNitrogen');
    // Warming takes its time, then settles where the state says.
    expect(at(65).temperature).toBeLessThan(timeline.at(65).target.temperature - 5);
    const settled = at(1000);
    expect(settled.habitability).toBe(3);
    expect(settled.waterState).toBe('liquid');
  });
});
