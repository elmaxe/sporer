import { describe, expect, it } from 'vitest';
import { climateStateOf, evaluateClimate, type ClimateData, type ClimateSetting, type StateSpec } from '../src/gen/climate';
import { TERRAFORM_TUNING, TerraformTimeline, type TerraformAction } from '../src/gen/terraform';
import {
  HAZE_REFLECTANCE_PER_DEPTH,
  LIGHT_LIMITS,
  NO_INSTALLATIONS,
  aerosolBlocked,
  aerosolRate,
  describeInstallations,
  forecastLight,
  hazeDepth,
  heldCost,
  holdAerosol,
  installationsAt,
  lightBrightness,
  lightParams,
  mirrorAction,
  mirrorAzimuth,
  mirrorCost,
  mirrorUnfold,
  sailRadius,
  shadeAction,
  shadeCost,
  starlightOf,
} from '../src/terraform/light';
import { HeldLog } from '../src/terraform/heldLog';
import { Terraforming } from '../src/terraform/Terraforming';
import { ShipEnergy } from '../src/terraform/energy';

const EARTH: ClimateSetting = { insolation: 1, gravity: 1, escapeVelocity: 11.186, heatFlow: 0.092 };
const MARS: ClimateSetting = { insolation: 586.2 / 1361, gravity: 0.379, escapeVelocity: 5.03, heatFlow: 0.019 };
const MOON: ClimateSetting = { insolation: 1, gravity: 0.165, escapeVelocity: 2.38, heatFlow: 0.016 };
const WAYS = { mirror: 'deploy', shade: 'close' } as const;

function body(setting: ClimateSetting, spec: StateSpec): ClimateData {
  return evaluateClimate(setting, climateStateOf({ surfaceAlbedo: 0.25, ...spec }, setting.gravity));
}

/** Records `action` (or fails on a reason) and returns the log. */
function add(log: TerraformAction[], action: TerraformAction | string): TerraformAction[] {
  if (typeof action === 'string') throw new Error(action);
  log.push(action);
  return log;
}

describe('orbital mirrors', () => {
  it('each add a quarter of the starlight, four make ×2, under the shade as it is', () => {
    expect(starlightOf(0, 0)).toBe(1);
    expect(starlightOf(4, 0)).toBe(2);
    expect(starlightOf(2, 0.5)).toBeCloseTo(0.75);
    const first = mirrorAction([], 0, 'real', 'deploy');
    expect(first).toMatchObject({ lever: 'starlight', start: 0, duration: lightParams.deployTime, amount: 0.25, tool: 'mirror', level: 1 });
  });

  it('stop at the mode\'s limit, and only what is up can be recalled', () => {
    for (const mode of ['real', 'relaxed', 'sandbox'] as const) {
      const log: TerraformAction[] = [];
      for (let i = 0; i < LIGHT_LIMITS[mode].mirrors; i++) add(log, mirrorAction(log, i, mode, 'deploy'));
      expect(mirrorAction(log, 100, mode, 'deploy')).toMatch(/No more mirrors/);
    }
    expect(mirrorAction([], 0, 'real', 'recall')).toMatch(/No mirror/);
    expect(LIGHT_LIMITS.real).toEqual({ mirrors: 4, shade: 0.7 });
  });

  it('unfold over their deploy time, and fold away when recalled (the last one up)', () => {
    const log: TerraformAction[] = [];
    add(log, mirrorAction(log, 0, 'real', 'deploy'));
    add(log, mirrorAction(log, 2, 'real', 'deploy'));
    let inst = installationsAt(log, 4);
    expect(inst.mirrors).toBe(2);
    expect(inst.ready).toBe(0);
    expect(mirrorUnfold(inst.slots[0]!, 4)).toBeCloseTo(4 / lightParams.deployTime);
    inst = installationsAt(log, 20);
    expect(inst.ready).toBe(2);
    add(log, mirrorAction(log, 30, 'real', 'recall'));
    inst = installationsAt(log, 31);
    expect(inst.mirrors).toBe(1);
    expect(inst.ready).toBe(1);
    expect(inst.slots).toHaveLength(2);
    expect(inst.slots[1]!.recalled).toBe(30);
    expect(mirrorUnfold(inst.slots[1]!, 31)).toBeCloseTo(1 - 1 / lightParams.recallTime);
    inst = installationsAt(log, 40);
    expect(inst.slots).toHaveLength(1);
    expect(installationsAt(log, -1)).toEqual(NO_INSTALLATIONS);
  });

  it('keep their stations as others come and go, spread round the sun', () => {
    expect(mirrorAzimuth(0)).toBeCloseTo(0.35);
    const angles = [0, 1, 2, 3].map((k) => ((mirrorAzimuth(k) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
    for (let i = 1; i < angles.length; i++) expect(angles[i]! - angles[i - 1]!).toBeGreaterThan(0.6);
  });

  it('are as big as the light they add: a quarter of the body\'s is a sail of half its radius', () => {
    expect(sailRadius(0.25, 1)).toBeCloseTo(0.5);
    expect(sailRadius(0.25, 0.5)).toBeCloseTo(Math.SQRT1_2);
  });

  it('warm Haikrai III\'s kind of world as the design measured: ×2 with greenhouse ×4 is T3', () => {
    // A cold super-Earth far out: what four mirrors do with 1 bar of air and water (docs/design/terraforming.md).
    const cold: ClimateSetting = { insolation: 0.34, gravity: 1.6, escapeVelocity: 16.5, heatFlow: 0.1 };
    const air = { pressure: 1, composition: 'oxygenNitrogen' as const, water: 0.4, greenhouse: 4 };
    const plain = body(cold, air);
    const mirrored = evaluateClimate(cold, { ...climateStateOf(plain), starlight: starlightOf(4, 0) });
    expect(mirrored.temperature - plain.temperature).toBeGreaterThan(30);
    // Mirrors add light, not escape: retention is the star's.
    expect(mirrored.retention).toBe(plain.retention);
  });
});

describe('the sunshade', () => {
  it('closes and opens a step at a time, on the step grid, up to the mode\'s limit', () => {
    const log: TerraformAction[] = [];
    for (let i = 0; i < 7; i++) add(log, shadeAction(log, i * 10, 'real', 'close'));
    expect(installationsAt(log, 100).shade).toBeCloseTo(0.7);
    expect(shadeAction(log, 100, 'real', 'close')).toMatch(/70%/);
    // Relaxed goes further from where Real stopped.
    add(log, shadeAction(log, 100, 'relaxed', 'close'));
    expect(installationsAt(log, 200).shade).toBeCloseTo(0.8);
    add(log, shadeAction(log, 200, 'relaxed', 'open'));
    expect(installationsAt(log, 300).shade).toBeCloseTo(0.7);
    expect(shadeAction([], 0, 'real', 'open')).toMatch(/open/);
    // Set exactly (the lab), within the limit.
    const set = shadeAction([], 0, 'real', { block: 0.95 });
    expect(typeof set !== 'string' && set.level).toBeCloseTo(0.7);
  });

  it('moves over its shade time', () => {
    const log = add([], shadeAction([], 0, 'real', 'close'));
    expect(installationsAt(log, lightParams.shadeTime / 2).shadeShown).toBeCloseTo(lightParams.shadeStep / 2);
    expect(installationsAt(log, lightParams.shadeTime / 2).shade).toBeCloseTo(lightParams.shadeStep);
  });

  it('cools a Venus with its CO₂ replaced by 1 bar of air: half the light blocked takes it down by over 40 K', () => {
    const venus: ClimateSetting = { insolation: 2601.3 / 1361, gravity: 0.904, escapeVelocity: 10.36, heatFlow: 0.07 };
    const c = body(venus, { pressure: 1, composition: 'oxygenNitrogen', water: 0.6 });
    const log: TerraformAction[] = [];
    for (let i = 0; i < 5; i++) add(log, shadeAction(log, i * 10, 'real', 'close'));
    const shaded = new TerraformTimeline(c, log).at(2000);
    expect(shaded.climate.starlight).toBeCloseTo(0.5, 6);
    expect(shaded.climate.temperature).toBeLessThan(c.temperature - 40);
  });
});

describe('mirrors and the shade together', () => {
  it('leave the log summing to exactly (1 + k·mirrors)(1 − shade), whatever the order', () => {
    const c = body(MARS, { pressure: 0.006, composition: 'carbonDioxide' });
    const log: TerraformAction[] = [];
    const steps: [number, 'mirror' | 'shade', string][] = [
      [0, 'mirror', 'deploy'],
      [5, 'shade', 'close'],
      [6, 'mirror', 'deploy'],
      [7, 'shade', 'close'],
      [30, 'mirror', 'deploy'],
      [31, 'mirror', 'recall'],
      [40, 'shade', 'open'],
      [41, 'mirror', 'deploy'],
    ];
    for (const [t, tool, way] of steps)
      add(log, tool === 'mirror' ? mirrorAction(log, t, 'real', way as 'deploy') : shadeAction(log, t, 'real', way as 'close'));
    const inst = installationsAt(log, 500);
    expect(inst.mirrors).toBe(3);
    expect(inst.shade).toBeCloseTo(0.1);
    const s = new TerraformTimeline(c, log).at(500).climate.starlight;
    expect(s).toBeCloseTo(starlightOf(3, 0.1), 9);
  });

  it('forecast where the world settles: a mirror warms it, closing the shade cools it, the lance does nothing global', () => {
    const c = body(MARS, { pressure: 0.5, composition: 'carbonDioxide' });
    const warmer = forecastLight(c, [], 0, 'real', 'mirror', WAYS, 5)!;
    expect(warmer.starlight).toBeCloseTo(1.25);
    expect(warmer.temperature).toBeGreaterThan(c.temperature + 5);
    const cooler = forecastLight(c, [], 0, 'real', 'sunshade', WAYS, 5)!;
    expect(cooler.temperature).toBeLessThan(c.temperature);
    expect(forecastLight(c, [], 0, 'real', 'lance', WAYS, 5)).toBeNull();
    expect(forecastLight(c, [], 0, 'real', 'mirror', { mirror: 'recall', shade: 'close' }, 5)).toBeNull();
  });

  it('cost by the surface area, half given back, free in Sandbox', () => {
    expect(mirrorCost(EARTH, 'real')).toBeCloseTo(lightParams.cost.mirror, 0);
    expect(mirrorCost(MARS, 'real')).toBeLessThan(mirrorCost(EARTH, 'real') / 3);
    expect(shadeCost(EARTH, 'relaxed', 0.1)).toBeCloseTo(lightParams.cost.shade * 0.1, 0);
    expect(heldCost('aerosol', EARTH, 'real')).toBeCloseTo(lightParams.cost.aerosol, 0);
    expect(heldCost('lance', MARS, 'real')).toBe(lightParams.cost.lance);
    expect(mirrorCost(EARTH, 'sandbox')).toBe(0);
    expect(heldCost('lance', EARTH, 'sandbox')).toBe(0);
    const e = new ShipEnergy();
    e.setInfinite(false);
    e.spend(300);
    e.refund(1000);
    expect(e.level).toBe(e.capacity);
    expect(e.refunded).toBe(1000);
  });

  it('draw the light brighter or dimmer, softened', () => {
    expect(lightBrightness(1)).toBe(1);
    expect(lightBrightness(2)).toBeCloseTo(Math.SQRT2);
    expect(lightBrightness(0.3)).toBeGreaterThan(0.5);
    expect(lightBrightness(0)).toBe(0.25);
  });

  it('are listed on the chart', () => {
    const log = add([], mirrorAction([], 0, 'real', 'deploy'));
    add(log, shadeAction(log, 1, 'real', 'close'));
    const line = describeInstallations(installationsAt(log, 2), { starlight: 1.125, aerosol: 0.04 }, 'real');
    expect(line).toBe('Mirrors 1/4 (unfolding) · shade 10% · starlight ×1.13 · haze 4%');
    expect(describeInstallations(NO_INSTALLATIONS, { starlight: 1, aerosol: 0 }, 'real')).toBe('');
  });
});

describe('aerosols', () => {
  it('need air to hold a haze up, and stop thickening at the most', () => {
    expect(aerosolBlocked(body(MOON, {}))).toMatch(/No air/);
    expect(aerosolBlocked(body(EARTH, { pressure: 1, composition: 'oxygenNitrogen' }))).toBeNull();
    expect(aerosolBlocked({ pressure: 1, aerosol: lightParams.maxAerosol })).toMatch(/thick/);
  });

  it('are a Pinatubo a second: the haze of optical depth 0.15', () => {
    expect(hazeDepth(0.021)).toBeCloseTo(0.15, 2);
    expect(aerosolRate()).toBeGreaterThanOrEqual(0.017);
    expect(aerosolRate()).toBeLessThanOrEqual(0.025);
    expect(HAZE_REFLECTANCE_PER_DEPTH).toBeGreaterThanOrEqual(0.11);
    expect(HAZE_REFLECTANCE_PER_DEPTH).toBeLessThanOrEqual(0.17);
  });

  it('cool fast and rain out: ten seconds cool an Earth by several kelvin, which comes back as the haze halves', () => {
    const earth = body(EARTH, { pressure: 1, composition: 'oxygenNitrogen', water: 0.7 });
    const log: TerraformAction[] = [{ lever: 'aerosol', start: 0, duration: 10, amount: aerosolRate() * 10 }];
    const timeline = new TerraformTimeline(earth, log, [{ time: 0, mode: 'real' }]);
    const sprayed = timeline.at(10);
    expect(sprayed.target.temperature).toBeLessThan(earth.temperature - 5);
    const later = timeline.at(10 + 4 * TERRAFORM_TUNING.real.aerosolHalfLife);
    expect(later.climate.aerosol).toBeLessThan(sprayed.climate.aerosol / 10);
    expect(later.target.temperature).toBeGreaterThan(sprayed.target.temperature + 3);
  });

  it('held for a while (the planet lab\'s button) write a second at a time, and nothing where there is no air', () => {
    const earth = body(EARTH, { pressure: 1, composition: 'oxygenNitrogen', water: 0.7 });
    const added = holdAerosol(new TerraformTimeline(earth, []), 5, 3.5);
    expect(added.map((a) => [a.start, a.duration])).toEqual([[5, 1], [6, 1], [7, 1], [8, 0.5]]);
    expect(added.reduce((sum, a) => sum + a.amount, 0)).toBeCloseTo(aerosolRate() * 3.5, 9);
    expect(holdAerosol(new TerraformTimeline(body(MOON, {}), []), 0, 5)).toEqual([]);
  });
});

describe('a held tool\'s log', () => {
  it('is one action a second at the rate of its start, grown while held and closed on letting go', () => {
    const t = new Terraforming('real');
    const held = new HeldLog(t, 'earth');
    const rates: number[] = [];
    const next = (time: number) => {
      rates.push(time);
      return { lever: 'aerosol' as const, rate: 0.02 };
    };
    for (let i = 0; i <= 25; i++) {
      held.write(false, next);
      t.advance(0.1);
    }
    held.write(true, next);
    const log = t.logs.actions('earth');
    expect(log.map((a) => a.start)).toEqual([0, 1, 2]);
    expect(log[0]!.duration).toBeCloseTo(1);
    expect(log[2]!.duration).toBeCloseTo(0.6, 5);
    expect(log.reduce((s, a) => s + a.amount, 0)).toBeCloseTo(0.02 * 2.6, 6);
    // Nothing to do: nothing written.
    const none = new HeldLog(t, 'moon');
    none.write(false, () => null);
    expect(t.logs.touched('moon')).toBe(false);
  });
});
