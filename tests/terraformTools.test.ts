import { describe, expect, it } from 'vitest';
import { HABITABILITY, climateStateOf, evaluateClimate, type ClimateData, type ClimateSetting, type StateSpec } from '../src/gen/climate';
import { TerraformLogs, TerraformTimeline, climateAt, leakRate, type TerraformAction } from '../src/gen/terraform';
import { DEFAULT_VIEW, decodeLab, encodeLab, generateLabPlanet, parseLabTerraform } from '../src/lab/labPlanet';
import { DEFAULT_RAY_CHOICE, forecastClimate, heatForKelvin, holdRay, nextGas, rayBlocked, rayCost, rayEffect, rayParams } from '../src/terraform/rays';
import { ShipEnergy, formatEnergy } from '../src/terraform/energy';
import { Milestones, milestoneFlags, milestoneTitle } from '../src/terraform/milestones';
import { CHART_CELL, boilingLine, chartPoint, chartX, chartY, describeSettling, freezingX, tierRects } from '../src/terraform/chart';
import { SEA_FREEZING, capLine, fibonacciDirections, freezeLine, liveAtmosphereColor, quantile, seaCoverage, shareBelow } from '../src/terraform/liveLook';
import { localTemperature } from '../src/gen/plants';

const EARTH: ClimateSetting = { insolation: 1, gravity: 1, escapeVelocity: 11.186, heatFlow: 0.092 };
const MARS: ClimateSetting = { insolation: 586.2 / 1361, gravity: 0.379, escapeVelocity: 5.03, heatFlow: 0.019 };
const MOON: ClimateSetting = { insolation: 1, gravity: 0.165, escapeVelocity: 2.38, heatFlow: 0.016 };

function body(setting: ClimateSetting, spec: StateSpec): ClimateData {
  return evaluateClimate(setting, climateStateOf({ surfaceAlbedo: 0.25, ...spec }, setting.gravity));
}

describe('the heat rays', () => {
  it('move the settled temperature by about rayParams.kelvinPerSecond a second, slowly in thick air too', () => {
    for (const c of [
      body(EARTH, { pressure: 1, composition: 'oxygenNitrogen', water: 0.7 }),
      body(MARS, { pressure: 0.006, composition: 'carbonDioxide' }),
      body(MOON, {}),
    ]) {
      const heat = heatForKelvin(c, 10);
      const warmer = evaluateClimate(c, { ...climateStateOf(c), magicHeat: heat });
      expect(warmer.temperature - c.temperature).toBeGreaterThan(8);
      expect(warmer.temperature - c.temperature).toBeLessThan(12);
    }
    const c = body(EARTH, { pressure: 1, composition: 'oxygenNitrogen' });
    expect(rayEffect('heatRay', c, DEFAULT_RAY_CHOICE)).toEqual({ lever: 'heat', rate: heatForKelvin(c, rayParams.kelvinPerSecond) });
    expect(rayEffect('coolRay', c, DEFAULT_RAY_CHOICE).rate).toBeCloseTo(-heatForKelvin(c, rayParams.kelvinPerSecond));
  });

  it('never cool a world below the cosmic background', () => {
    const c = body(MOON, {});
    const cold = evaluateClimate(c, { ...climateStateOf(c), magicHeat: -1e4 });
    expect(cold.temperature).toBeCloseTo(2.725, 3);
    expect(Number.isFinite(cold.temperature)).toBe(true);
  });
});

describe('the gas and water rays', () => {
  it('add a share of the air a second (some from nothing), and take the picked gas', () => {
    const moon = body(MOON, {});
    expect(rayEffect('airRay', moon, { gas: 'o2', water: 'add' })).toEqual({ lever: 'o2', rate: rayParams.minGasPerSecond });
    const earth = body(EARTH, { pressure: 1, composition: 'oxygenNitrogen' });
    expect(rayEffect('airRay', earth, DEFAULT_RAY_CHOICE).rate).toBeCloseTo(rayParams.gasPerSecond * earth.pressure);
    expect(rayEffect('vacuumRay', earth, { gas: 'o2', water: 'add' }).rate).toBeLessThan(0);
    expect(rayBlocked('vacuumRay', earth, { gas: 'h2', water: 'add' })).toMatch(/No H₂/);
    expect(rayBlocked('vacuumRay', earth, { gas: 'n2', water: 'add' })).toBeNull();
    expect(rayEffect('waterRay', earth, { gas: 'n2', water: 'take' })).toEqual({ lever: 'water', rate: -rayParams.waterPerSecond });
    expect(rayBlocked('waterRay', moon, { gas: 'n2', water: 'take' })).toMatch(/No water/);
  });

  it('cycle through the gases', () => {
    expect([nextGas('n2'), nextGas('o2'), nextGas('co2'), nextGas('h2')]).toEqual(['o2', 'co2', 'h2', 'n2']);
  });

  it('cost by the surface area, nothing in Sandbox', () => {
    const earth = body(EARTH, {});
    expect(rayCost('heatRay', earth, 'relaxed')).toBeCloseTo(rayParams.cost.heatRay, 3);
    expect(rayCost('heatRay', body(MOON, {}), 'real')).toBeLessThan(rayParams.cost.heatRay * 0.1);
    expect(rayCost('waterRay', earth, 'sandbox')).toBe(0);
  });

  it('bring an airless moon to an atmosphere in a few seconds of holding, compounding', () => {
    const moon = body(MOON, {});
    const logs = new TerraformLogs();
    let t = 0;
    // One action a second, each at the rate of the air as it will be once what's released has spread.
    for (let s = 0; s < 12; s++) {
      const anchor = logs.at('moon', moon, t + 10).climate;
      const e = rayEffect('airRay', anchor, DEFAULT_RAY_CHOICE);
      logs.record('moon', { lever: e.lever, start: t, duration: 1, amount: e.rate });
      t += 1;
    }
    const p = logs.at('moon', moon, t + 20).climate.pressure;
    expect(p).toBeGreaterThan(0.01);
    expect(p).toBeLessThan(1);
  });
});

describe('the logs’ timelines', () => {
  it('stay in step with the log as actions are recorded and grown', () => {
    const mars = body(MARS, { pressure: 0.006, composition: 'carbonDioxide' });
    const logs = new TerraformLogs();
    logs.timeline('mars', mars).at(50);
    const i = logs.record('mars', { lever: 'heat', start: 10, duration: 1, amount: 5 });
    logs.timeline('mars', mars).at(30);
    logs.update('mars', i, { lever: 'heat', start: 10, duration: 4, amount: 20 });
    const actions: TerraformAction[] = [{ lever: 'heat', start: 10, duration: 4, amount: 20 }];
    expect(logs.at('mars', mars, 100).climate.temperature).toBeCloseTo(climateAt(mars, actions, 100).climate.temperature, 9);
    logs.setMode(60, 'real');
    expect(logs.at('mars', mars, 100).climate.temperature).toBeCloseTo(climateAt(mars, actions, 100, logs.modes).climate.temperature, 9);
    expect(logs.touched('mars')).toBe(true);
    expect(logs.touched('venus')).toBe(false);
    const copy = TerraformLogs.fromJSON(JSON.parse(JSON.stringify(logs.toJSON())));
    expect(copy.at('mars', mars, 100).climate.temperature).toBeCloseTo(logs.at('mars', mars, 100).climate.temperature, 9);
  });

  it('say how fast a world leaks, in Real only', () => {
    const moon = body(MOON, { pressure: 1, composition: 'oxygenNitrogen' });
    expect(leakRate(moon, 'relaxed')).toBe(0);
    const rate = leakRate(moon, 'real');
    // About five minutes for the Moon's air (gen/terraform.ts leakTime): ~1/300 bar a second at 1 bar.
    expect(rate).toBeGreaterThan(1 / 1000);
    expect(rate).toBeLessThan(1 / 100);
    expect(leakRate(body(EARTH, { pressure: 1, composition: 'oxygenNitrogen' }), 'real')).toBe(0);
  });
});

describe('the ship’s energy', () => {
  it('is infinite at first: costs are counted, the bar never drains', () => {
    const e = new ShipEnergy();
    expect(e.spend(400)).toBe(true);
    expect(e.spend(4000)).toBe(true);
    expect(e.fill).toBe(1);
    expect(e.spent).toBe(4400);
    e.setInfinite(false);
    expect(e.spend(600)).toBe(true);
    expect(e.spend(600)).toBe(false);
    expect(e.fill).toBeCloseTo(0.4);
    const copy = new ShipEnergy();
    copy.load(JSON.parse(JSON.stringify(e.toJSON())));
    expect(copy.toJSON()).toEqual(e.toJSON());
    expect([formatEnergy(3.21), formatEnergy(42), formatEnergy(1460), formatEnergy(23000)]).toEqual(['3.2', '42', '1.5k', '23k']);
  });
});

describe('milestones', () => {
  it('announce each first once, unless the world had it to begin with, and every tier change', () => {
    const base = body(MARS, { pressure: 0.006, composition: 'carbonDioxide', water: 0.3 });
    const baseFlags = milestoneFlags('barren', base);
    expect(baseFlags.firstAir).toBe(true);
    const m = new Milestones();
    expect(m.check('mars', baseFlags, baseFlags, 0)).toEqual([]);
    const warm = body({ ...MARS, insolation: 1 }, { pressure: 1, composition: 'oxygenNitrogen', water: 0.3, greenhouse: 1 });
    expect(warm.habitability).toBe(3);
    const events = m.check('mars', baseFlags, milestoneFlags('barren', warm), 10);
    expect(events.map((e) => e.id).sort()).toEqual(['breathable', 'firstRain', 'seasThaw', 'tierUp'].sort());
    expect(milestoneTitle(events.find((e) => e.id === 'tierUp')!)).toBe('T3 reached');
    expect(m.check('mars', baseFlags, milestoneFlags('barren', warm), 20)).toEqual([]);
    const lost = m.check('mars', baseFlags, baseFlags, 30);
    expect(lost).toEqual([{ time: 30, id: 'tierDown', tier: 0 }]);
    // Firsts aren't announced again.
    expect(m.check('mars', baseFlags, milestoneFlags('barren', warm), 40).map((e) => e.id)).toEqual(['tierUp']);
    const copy = new Milestones();
    copy.load(JSON.parse(JSON.stringify(m.toJSON())));
    expect(copy.log('mars')).toEqual(m.log('mars'));
    expect(m.log('mars')).toHaveLength(6);
  });
});

describe('the climate chart', () => {
  it('lays out temperature across and pressure up on a log scale, pinning worlds off it to the edges', () => {
    expect(chartX(273.15 - 60)).toBeCloseTo(0);
    expect(chartX(273.15 + 80)).toBeCloseTo(1);
    expect(chartY(0.001)).toBeCloseTo(0);
    expect(chartY(100)).toBeCloseTo(1);
    expect(chartX(273.15 + CHART_CELL.celsius) - chartX(273.15)).toBeCloseTo(1 / 14);
    expect(chartPoint({ temperature: 737, pressure: 92 })).toEqual({ x: 1, y: chartY(92), offX: 1, offY: 0 });
    expect(chartPoint({ temperature: 100, pressure: 0 })).toMatchObject({ x: 0, y: 0, offX: -1, offY: -1 });
    const { t1, t2 } = tierRects();
    expect(t1.x0).toBeCloseTo(chartX(HABITABILITY.survivable.min));
    expect(t2.y1).toBeCloseTo(chartY(5));
    expect(t2.x0).toBeGreaterThan(t1.x0);
    expect(freezingX()).toBeCloseTo(chartX(273.16));
    // Water boils at 100 °C at 1 bar: off the chart's right edge; lower at lower pressure.
    const line = boilingLine();
    expect(line[0]![0]).toBeLessThan(line[line.length - 1]![0]);
  });

  it('says how long a world takes to settle', () => {
    expect(describeSettling(0)).toBe('settled');
    expect(describeSettling(7.4)).toBe('settles in ~7 s');
    expect(describeSettling(41)).toBe('settles in ~40 s');
    expect(describeSettling(600)).toBe('settles in ~10 min');
  });
});

describe('the live look', () => {
  it('freezes the sea from the poles where the latitude’s mean is below sea water’s freezing point', () => {
    // Earth (15 °C): sea ice from ~62°; a snowball everywhere; a hothouse nowhere.
    const s = freezeLine(288.15, SEA_FREEZING);
    expect(Math.asin(s) * (180 / Math.PI)).toBeGreaterThan(55);
    expect(Math.asin(s) * (180 / Math.PI)).toBeLessThan(70);
    expect(localTemperature(288.15, Math.asin(s))).toBeCloseTo(SEA_FREEZING, 6);
    expect(freezeLine(220, SEA_FREEZING)).toBe(0);
    expect(freezeLine(320, SEA_FREEZING)).toBeGreaterThan(1);
  });

  it('lays ice caps where snow lasts, as far as the water goes', () => {
    expect(capLine({ temperature: 200, water: 0 })).toBeGreaterThan(1);
    expect(capLine({ temperature: 200, water: 0.1 })).toBeCloseTo(0.9);
    expect(capLine({ temperature: 288, water: 1 })).toBeGreaterThan(0.9);
    expect(capLine({ temperature: 330, water: 1 })).toBeGreaterThan(1);
  });

  it('raises and lowers the sea with the water, none once it boils', () => {
    expect(seaCoverage(0.5, 0.6, { water: 0.8, waterState: 'liquid' })).toBeCloseTo(0.7);
    expect(seaCoverage(0, 0.05, { water: 0.3, waterState: 'ice' })).toBeCloseTo(0.25);
    expect(seaCoverage(0.5, 0.6, { water: 0.8, waterState: 'steam' })).toBe(0);
    expect(seaCoverage(0.9, 0.9, { water: 1, waterState: 'liquid' })).toBeLessThan(1);
  });

  it('finds the level of a share of the surface', () => {
    const dirs = fibonacciDirections(2000);
    const ys = Array.from({ length: 2000 }, (_, i) => dirs[i * 3 + 1]!).sort((a, b) => a - b);
    // y is uniform on a sphere: the median is the equator, a quarter lies below −0.5.
    expect(quantile(ys, 0.5)).toBeCloseTo(0, 2);
    expect(quantile(ys, 0.25)).toBeCloseTo(-0.5, 2);
    expect(shareBelow(ys, -0.5)).toBeCloseTo(0.25, 2);
  });

  it('keeps the generated atmosphere’s colour while the composition is the generated one', () => {
    const base = body(EARTH, { pressure: 1, composition: 'oxygenNitrogen' });
    const b = { type: 'terran' as const, seed: 7, style: { sea: '#000', seaLevel: 0, low: '#000', high: '#fff', relief: 0.03 }, atmosphere: '#88aaff', climate: base };
    expect(liveAtmosphereColor(b, body(EARTH, { pressure: 2, composition: 'oxygenNitrogen' }))).toBe('#88aaff');
    const co2 = body(EARTH, { pressure: 2, composition: 'carbonDioxide' });
    expect(liveAtmosphereColor(b, co2)).not.toBe('#88aaff');
    expect(liveAtmosphereColor(b, co2)).toBe(liveAtmosphereColor(b, co2));
    expect(liveAtmosphereColor(b, body(EARTH, {}))).toBeNull();
  });
});

describe('holding a ray, as the lab’s buttons do', () => {
  it('writes one action a second, compounding the gas rays, and the forecast agrees roughly', () => {
    const moon = body(MOON, {});
    const timeline = new TerraformTimeline(moon);
    const actions = holdRay(timeline, 0, 6, 'airRay', DEFAULT_RAY_CHOICE, 'relaxed');
    expect(actions).toHaveLength(6);
    // Each second adds at least as much as the last (a share of the air as it will be, from a floor), growing.
    for (let i = 1; i < actions.length; i++) expect(actions[i]!.amount).toBeGreaterThanOrEqual(actions[i - 1]!.amount);
    expect(actions[5]!.amount).toBeGreaterThan(2 * actions[0]!.amount);
    const heat = holdRay(new TerraformTimeline(moon), 0, 2.5, 'heatRay', DEFAULT_RAY_CHOICE, 'relaxed');
    expect(heat.map((a) => a.duration)).toEqual([1, 1, 0.5]);
    const after = climateAt(moon, heat, 1000).climate.temperature;
    const forecast = forecastClimate(moon, 'heatRay', DEFAULT_RAY_CHOICE, 2.5).temperature;
    expect(after - moon.temperature).toBeGreaterThan(5);
    expect(Math.abs(forecast - after)).toBeLessThan(2);
  });

  it('stops when there is nothing left to take', () => {
    const moon = body(MOON, {});
    expect(holdRay(new TerraformTimeline(moon), 0, 5, 'vacuumRay', DEFAULT_RAY_CHOICE, 'relaxed')).toEqual([]);
  });
});

describe('the lab’s terraforming links', () => {
  it('keep the log, time and mode, and drop what isn’t an action', () => {
    const state = generateLabPlanet(7, { type: 'barren' });
    const terraform = { actions: [{ lever: 'heat' as const, start: 0, duration: 2, amount: 40 }], time: 30, mode: 'real' as const };
    const decoded = decodeLab(encodeLab({ planet: state, view: DEFAULT_VIEW, terraform }));
    expect(decoded?.terraform).toEqual(terraform);
    expect(parseLabTerraform({ actions: [{ lever: 'magic', start: 0, duration: 0, amount: 1 }, { lever: 'n2', start: 1, duration: 0, amount: 1 }], time: -4, mode: 'fast' })).toEqual({
      actions: [{ lever: 'n2', start: 1, duration: 0, amount: 1 }],
      time: 0,
      mode: 'relaxed',
    });
    expect(decodeLab(encodeLab({ planet: state, view: DEFAULT_VIEW }))?.terraform).toBeUndefined();
  });
});
