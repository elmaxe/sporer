import { describe, expect, it } from 'vitest';
import { climateStateOf, evaluateClimate, type ClimateData, type ClimateSetting, type StateSpec } from '../src/gen/climate';
import { generateGalaxy } from '../src/gen/galaxy';
import { findHomeSystem, generateSystem } from '../src/gen/system';
import {
  GREENHOUSE_WORKS,
  TERRAFORM_TUNING,
  TerraformLogs,
  TerraformTimeline,
  runningAt,
  worksRuns,
  type TerraformAction,
  type WorksKind,
} from '../src/gen/terraform';
import {
  NO_WORKS,
  WORKS_LIMITS,
  describeWorks,
  forecastWorks,
  greenhouseParams,
  placeAction,
  removeAction,
  worksAt,
  worksCost,
  worksDescent,
  worksNear,
  worksUpkeep,
} from '../src/terraform/greenhouse';
import { Terraforming } from '../src/terraform/Terraforming';
import { GREENHOUSE_TOOL_ITEMS, ITEMS, isGreenhouseTool } from '../src/combat/items';

const EARTH: ClimateSetting = { insolation: 1, gravity: 1, escapeVelocity: 11.186, heatFlow: 0.092 };
const VENUS: ClimateSetting = { insolation: 2601 / 1361, gravity: 0.904, escapeVelocity: 10.36, heatFlow: 0.03 };

function body(setting: ClimateSetting, spec: StateSpec): ClimateData {
  return evaluateClimate(setting, climateStateOf({ surfaceAlbedo: 0.25, ...spec }, setting.gravity));
}

/** A site round the equator, `i` apart well beyond the spacing. */
function site(i: number): [number, number, number] {
  return [Math.cos(i), 0, Math.sin(i)];
}

/** Places a works (or fails on a reason) and returns the log with it. */
function place(log: TerraformAction[], time: number, kind: WorksKind, at: [number, number, number], mode: 'real' | 'relaxed' | 'sandbox' = 'real'): TerraformAction[] {
  const a = placeAction(log, time, mode, kind, at, EARTH);
  if (typeof a === 'string') throw new Error(a);
  return [...log, a];
}

describe('greenhouse works in the log', () => {
  it('run from landing until they are beamed up', () => {
    let log = place([], 10, 'factory', site(0));
    log = place(log, 20, 'sink', site(1));
    const runs = worksRuns(log);
    expect(runs.map((r) => r.kind)).toEqual(['factory', 'sink']);
    expect(runningAt(runs, 'factory', 10 + greenhouseParams.landTime - 0.01)).toBe(0);
    expect(runningAt(runs, 'factory', 10 + greenhouseParams.landTime)).toBe(1);
    log.push(removeAction(runs[0]!, 100));
    const after = worksRuns(log);
    expect(runningAt(after, 'factory', 99)).toBe(1);
    expect(runningAt(after, 'factory', 100)).toBe(0);
    expect(runningAt(after, 'sink', 100)).toBe(1);
    // Drawn while it's lifted away, then gone.
    expect(worksAt(log, 101).runs).toHaveLength(2);
    expect(worksAt(log, 100 + greenhouseParams.liftTime + 0.01).runs).toHaveLength(1);
    expect(worksAt(log, 101).factories).toBe(0);
    expect(worksAt(log, 5)).toEqual(NO_WORKS);
  });

  it('are lowered, stand, and are lifted away', () => {
    const log = place([], 0, 'factory', site(0));
    const run = worksRuns([...log, removeAction(worksRuns(log)[0]!, 50)])[0]!;
    expect(worksDescent(run, 0)).toBe(0);
    expect(worksDescent(run, greenhouseParams.landTime / 2)).toBeCloseTo(0.5);
    expect(worksDescent(run, 20)).toBe(1);
    expect(worksDescent(run, 50 + greenhouseParams.liftTime / 2)).toBeCloseTo(0.5);
    expect(worksDescent(run, 60)).toBe(0);
  });

  it('keep to the mode’s limits and their spacing', () => {
    for (const mode of ['real', 'relaxed', 'sandbox'] as const) {
      let log: TerraformAction[] = [];
      const limit = WORKS_LIMITS[mode].factory;
      for (let i = 0; i < limit; i++) log = place(log, i, 'factory', site(i * 0.4), mode);
      expect(placeAction(log, 100, mode, 'factory', site(5.2), EARTH)).toMatch(/No more factories/);
      // Sinks count on their own.
      expect(typeof placeAction(log, 100, mode, 'sink', site(5.2), EARTH)).toBe('object');
    }
    expect(WORKS_LIMITS.real.factory).toBe(3);
    expect(WORKS_LIMITS.relaxed.factory).toBe(5);
    const log = place([], 0, 'factory', site(0));
    expect(placeAction(log, 10, 'real', 'sink', site(greenhouseParams.spacing / 2), EARTH)).toMatch(/Too close/);
    expect(typeof placeAction(log, 10, 'real', 'sink', site(greenhouseParams.spacing * 1.5), EARTH)).toBe('object');
  });

  it('are found by a click near them', () => {
    const log = place(place([], 0, 'factory', site(0)), 0, 'sink', site(1));
    const works = worksAt(log, 10);
    expect(worksNear(works, site(0.005), greenhouseParams.pickRadius)?.kind).toBe('factory');
    expect(worksNear(works, site(1.004), greenhouseParams.pickRadius)?.kind).toBe('sink');
    expect(worksNear(works, site(0.5), greenhouseParams.pickRadius)).toBeNull();
    expect(worksNear(works, site(0.005), greenhouseParams.pickRadius, 'sink')).toBeNull();
  });

  it('cost by the surface area, nothing in Sandbox, and record their upkeep', () => {
    const mars = { gravity: 0.379, escapeVelocity: 5.03 };
    expect(worksCost('factory', EARTH, 'real')).toBeCloseTo(greenhouseParams.cost.factory);
    expect(worksCost('factory', mars, 'real')).toBeLessThan(worksCost('factory', EARTH, 'real') / 2);
    expect(worksCost('sink', EARTH, 'sandbox')).toBe(0);
    expect(worksUpkeep('sink', EARTH, 'sandbox')).toBe(0);
    const log = place([], 0, 'factory', site(0));
    expect(log[0]!.upkeep).toBeCloseTo(worksUpkeep('factory', EARTH, 'real'));
    expect(worksAt(log, 10).upkeep).toBeCloseTo(greenhouseParams.upkeep.factory);
    expect(worksAt(log, 1).upkeep).toBe(0);
  });
});

describe('greenhouse factories', () => {
  const earthAir = body(EARTH, { composition: 'oxygenNitrogen', pressure: 1, greenhouse: 1, water: 0.6 });

  it('raise the trace greenhouse gas to their cap at their rate, then hold it there', () => {
    const tuning = TERRAFORM_TUNING.real;
    const log = place([], 0, 'factory', site(0));
    const t = new TerraformTimeline(earthAir, log, [{ time: 0, mode: 'real' }]);
    const land = greenhouseParams.landTime;
    const g0 = earthAir.greenhouse;
    // Rising at about its rate (less what breaks down meanwhile).
    const early = t.at(land + 30).climate.greenhouse - g0;
    expect(early).toBeGreaterThan(0.9 * ((GREENHOUSE_WORKS.factoryCap * 30) / tuning.factoryBuild));
    expect(early).toBeLessThanOrEqual((GREENHOUSE_WORKS.factoryCap * 30) / tuning.factoryBuild + 1e-9);
    // At its cap a little after the build time (it makes up for what breaks down), and held there.
    expect(t.at(land + tuning.factoryBuild * 1.3).climate.greenhouse).toBeCloseTo(g0 + GREENHOUSE_WORKS.factoryCap, 6);
    expect(t.at(3000).climate.greenhouse).toBeCloseTo(g0 + GREENHOUSE_WORKS.factoryCap, 6);
    expect(t.at(3000).climate.temperature).toBeGreaterThan(earthAir.temperature + 10);
  });

  it('stack: n factories hold n shares; relaxed builds three times as fast', () => {
    const log = place(place(place([], 0, 'factory', site(0)), 0, 'factory', site(1)), 0, 'factory', site(2));
    const real = new TerraformTimeline(earthAir, log, [{ time: 0, mode: 'real' }]);
    const relaxed = new TerraformTimeline(earthAir, log, [{ time: 0, mode: 'relaxed' }]);
    expect(real.at(2000).climate.greenhouse).toBeCloseTo(earthAir.greenhouse + 3 * GREENHOUSE_WORKS.factoryCap, 6);
    expect(TERRAFORM_TUNING.relaxed.factoryBuild).toBeCloseTo(TERRAFORM_TUNING.real.factoryBuild / 3);
    expect(relaxed.at(60).climate.greenhouse).toBeGreaterThan(real.at(60).climate.greenhouse * 2);
  });

  it('leave their gas to break down slowly once beamed up', () => {
    const tuning = TERRAFORM_TUNING.real;
    let log = place([], 0, 'factory', site(0));
    log = [...log, removeAction(worksRuns(log)[0]!, 1000)];
    const t = new TerraformTimeline(earthAir, log, [{ time: 0, mode: 'real' }]);
    const g0 = earthAir.greenhouse;
    const excess = (time: number) => t.at(time).climate.greenhouse - g0;
    expect(excess(1000)).toBeCloseTo(GREENHOUSE_WORKS.factoryCap, 6);
    expect(excess(1000 + tuning.greenhouseLifetime)).toBeCloseTo(GREENHOUSE_WORKS.factoryCap / Math.E, 2);
    // Zubrin & McKay: built in 20 years, a 100-year lifetime: the lifetime is five build times.
    expect(tuning.greenhouseLifetime / tuning.factoryBuild).toBeCloseTo(5);
    expect(excess(20000)).toBeLessThan(0.01);
  });

  it('do nothing for a world without air (the trace gas needs air to warm)', () => {
    const moon = body(EARTH, {});
    const t = new TerraformTimeline(moon, place([], 0, 'factory', site(0)), [{ time: 0, mode: 'real' }]);
    const c = t.at(2000).climate;
    expect(c.greenhouse).toBeCloseTo(GREENHOUSE_WORKS.factoryCap, 6);
    expect(c.temperature).toBeCloseTo(moon.temperature, 6);
  });

  it('leave an untouched body’s greenhouse exactly as it was', () => {
    const t = new TerraformTimeline(earthAir, [{ lever: 'n2', start: 0, duration: 0, amount: 0 }]);
    expect(t.at(5000).climate.greenhouse).toBe(earthAir.greenhouse);
  });

  it('bring Haikrai III to T3 with air and water, three of them in Real', () => {
    const home = generateSystem(findHomeSystem(generateGalaxy(1337)));
    const iii = home.planets.find((p) => p.name.endsWith(' III'))!.climate!;
    const air: TerraformAction[] = [
      { lever: 'n2', start: 0, duration: 0, amount: 0.79 },
      { lever: 'o2', start: 0, duration: 0, amount: 0.21 },
      { lever: 'water', start: 0, duration: 0, amount: 0.4 },
    ];
    const with3 = new TerraformTimeline(iii, [...air, ...place(place(place([], 10, 'factory', site(0)), 10, 'factory', site(1)), 10, 'factory', site(2))], [{ time: 0, mode: 'real' }]);
    const settled = with3.at(1200).climate;
    expect(settled.greenhouse).toBeCloseTo(12, 6);
    expect(settled.habitability).toBe(3);
    // Two aren't enough by themselves.
    const with2 = new TerraformTimeline(iii, [...air, ...place(place([], 10, 'factory', site(0)), 10, 'factory', site(1))], [{ time: 0, mode: 'real' }]);
    expect(with2.at(1200).climate.habitability).toBeLessThan(3);
  });
});

describe('carbon sinks', () => {
  const venus = body(VENUS, { composition: 'carbonDioxide', pressure: 92, greenhouse: 1 });

  it('draw CO₂ down exponentially, n sinks n× as fast', () => {
    const tuning = TERRAFORM_TUNING.real;
    const one = new TerraformTimeline(venus, place([], 0, 'sink', site(0)), [{ time: 0, mode: 'real' }]);
    const land = greenhouseParams.landTime;
    expect(one.at(land + tuning.sinkTime).climate.gases.co2 / venus.gases.co2).toBeCloseTo(1 / Math.E, 2);
    const three = new TerraformTimeline(venus, place(place(place([], 0, 'sink', site(0)), 0, 'sink', site(1)), 0, 'sink', site(2)), [{ time: 0, mode: 'real' }]);
    expect(three.at(land + tuning.sinkTime / 3).climate.gases.co2 / venus.gases.co2).toBeCloseTo(1 / Math.E, 2);
  });

  it('thin a Venus to about a bar in half an hour with three in Real, cooling it', () => {
    const log = place(place(place([], 0, 'sink', site(0)), 0, 'sink', site(1)), 0, 'sink', site(2));
    const t = new TerraformTimeline(venus, log, [{ time: 0, mode: 'real' }]);
    const c = t.at(1800).climate;
    expect(c.pressure).toBeGreaterThan(0.5);
    expect(c.pressure).toBeLessThan(2);
    expect(c.temperature).toBeLessThan(venus.temperature - 300);
  });

  it('draw trace gas down too, which comes back once they stop', () => {
    const earthAir = body(EARTH, { composition: 'oxygenNitrogen', pressure: 1, greenhouse: 1, water: 0.6 });
    let log = place([], 0, 'sink', site(0));
    log = [...log, removeAction(worksRuns(log)[0]!, 3000)];
    const t = new TerraformTimeline(earthAir, log, [{ time: 0, mode: 'real' }]);
    const g0 = earthAir.greenhouse;
    const drawn = t.at(3000).climate.greenhouse;
    // Balanced against its own making: g0 · (1/L) / (1/L + 1/S).
    const { greenhouseLifetime: L, sinkTime: S } = TERRAFORM_TUNING.real;
    expect(drawn).toBeCloseTo((g0 * (1 / L)) / (1 / L + 1 / S), 2);
    expect(t.at(20000).climate.greenhouse).toBeCloseTo(g0, 3);
    expect(t.at(20000).climate.temperature).toBeCloseTo(earthAir.temperature, 1);
  });
});

describe('the chart and the game', () => {
  const earthAir = body(EARTH, { composition: 'oxygenNitrogen', pressure: 1, greenhouse: 1, water: 0.6 });

  it('forecasts a factory at its share and a sink’s first two minutes', () => {
    const warmer = forecastWorks(earthAir, earthAir, [], 0, 'real', 'factory')!;
    expect(warmer.greenhouse).toBeCloseTo(earthAir.greenhouse + GREENHOUSE_WORKS.factoryCap);
    expect(warmer.temperature).toBeGreaterThan(earthAir.temperature);
    const venus = body(VENUS, { composition: 'carbonDioxide', pressure: 92, greenhouse: 1 });
    const thinner = forecastWorks(venus, venus, [], 0, 'real', 'sink')!;
    expect(thinner.gases.co2).toBeCloseTo(venus.gases.co2 * Math.exp(-greenhouseParams.sinkForecast / TERRAFORM_TUNING.real.sinkTime));
    let log: TerraformAction[] = [];
    for (let i = 0; i < 3; i++) log = place(log, 0, 'factory', site(i));
    expect(forecastWorks(earthAir, earthAir, log, 10, 'real', 'factory')).toBeNull();
  });

  it('describes the works on the chart', () => {
    let log = place([], 0, 'factory', site(0));
    log = place(log, 0, 'sink', site(1));
    expect(describeWorks(worksAt(log, 10), { greenhouse: 5.25 }, 'real')).toBe('Factories 1/3 · sinks 1/3 · greenhouse ×5.3');
    expect(describeWorks(worksAt(log, 1), { greenhouse: 1 }, 'relaxed')).toMatch(/landing/);
    expect(describeWorks(NO_WORKS, { greenhouse: 1 }, 'real')).toBe('');
  });

  it('pays the works’ upkeep as the game clock runs, on every body', () => {
    const t = new Terraforming('real');
    t.logs.record('A:1', place([], 0, 'factory', site(0))[0]!);
    t.logs.record('B:2', place([], 0, 'sink', site(0))[0]!);
    t.advance(1);
    expect(t.energy.spent).toBe(0);
    t.advance(greenhouseParams.landTime);
    t.advance(10);
    expect(t.upkeep()).toBeCloseTo(2 * greenhouseParams.upkeep.factory);
    expect(t.energy.spent).toBeCloseTo(10 * 2 * greenhouseParams.upkeep.factory, 6);
    expect(t.energy.upkeep).toBeGreaterThan(0);
  });

  it('keeps the works in the log through JSON', () => {
    const logs = new TerraformLogs();
    logs.record('A:1', place([], 0, 'factory', site(0))[0]!);
    const back = TerraformLogs.fromJSON(JSON.parse(JSON.stringify(logs.toJSON())));
    expect(worksAt(back.actions('A:1'), 10).factories).toBe(1);
    expect(back.actions('A:1')[0]!.site).toEqual(site(0));
  });

  it('are two Terraform tools after the light tools', () => {
    const terraform = ITEMS.filter((i) => i.tab === 'terraform').map((i) => i.id);
    expect(terraform.slice(-2)).toEqual([...GREENHOUSE_TOOL_ITEMS]);
    expect(isGreenhouseTool('factory')).toBe(true);
    expect(isGreenhouseTool('mirror')).toBe(false);
  });
});
