import { describe, expect, it } from 'vitest';
import { nextTerraformMode, parseGameplaySettings } from '../src/ui/GameplaySettings';
import { Terraforming } from '../src/terraform/Terraforming';
import { climateStateOf, evaluateClimate } from '../src/gen/climate';

describe('the gameplay settings', () => {
  it('default to Relaxed terraforming and survive bad storage', () => {
    expect(parseGameplaySettings(null)).toEqual({ terraform: 'relaxed' });
    expect(parseGameplaySettings('{"terraform":"real"}')).toEqual({ terraform: 'real' });
    expect(parseGameplaySettings('{"terraform":"easy"}')).toEqual({ terraform: 'relaxed' });
    expect(parseGameplaySettings('not json')).toEqual({ terraform: 'relaxed' });
    expect([nextTerraformMode('sandbox'), nextTerraformMode('relaxed'), nextTerraformMode('real')]).toEqual(['relaxed', 'real', 'sandbox']);
  });
});

describe('terraforming for the whole game', () => {
  const MOON = { insolation: 1, gravity: 0.165, escapeVelocity: 2.38, heatFlow: 0.016 };
  const moon = { key: 'Moon:1', name: 'Moon', type: 'barren' as const, climate: evaluateClimate(MOON, climateStateOf({ surfaceAlbedo: 0.12 }, MOON.gravity)) };

  it('runs its clock, plays each body’s log on it and switches modes from now on', () => {
    const t = new Terraforming('real');
    expect(t.snapshot(moon)).toBeNull();
    expect(t.climate(moon)).toBe(moon.climate);
    t.logs.record(moon.key, { lever: 'n2', start: 0, duration: 0, amount: 1 });
    t.advance(30);
    const real = t.snapshot(moon)!.climate.pressure;
    // The Moon leaks in Real.
    expect(real).toBeLessThan(1);
    t.setMode('relaxed');
    t.advance(300);
    expect(t.logs.modes.map((m) => m.mode)).toEqual(['real', 'relaxed']);
    const later = t.snapshot(moon)!.climate.pressure;
    // No more leaking once Relaxed.
    expect(later).toBeCloseTo(t.snapshot(moon, 40)!.climate.pressure, 6);
  });

  it('announces milestones as a world reaches them, and restores from JSON', () => {
    const t = new Terraforming('relaxed');
    const seen: string[] = [];
    t.onMilestone = (b, e) => seen.push(`${b.name}:${e.id}`);
    t.logs.record(moon.key, { lever: 'n2', start: 0, duration: 0, amount: 0.02 });
    t.advance(20);
    t.checkMilestones(moon, t.snapshot(moon)!.climate);
    // 20 mbar of nitrogen on a world at −3 °C: air, and survivable (T1).
    expect(seen).toEqual(['Moon:firstAir', 'Moon:tierUp']);
    const copy = new Terraforming('relaxed');
    copy.load(JSON.parse(JSON.stringify(t.toJSON())));
    expect(copy.time).toBe(20);
    expect(copy.snapshot(moon)!.climate.pressure).toBeCloseTo(t.snapshot(moon)!.climate.pressure, 9);
    expect(copy.milestones.log(moon.key)).toEqual(t.milestones.log(moon.key));
  });
});
