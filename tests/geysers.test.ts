import { describe, expect, it } from 'vitest';
import { climateStateOf, evaluateClimate, type ClimateData, type ClimateSetting, type StateSpec } from '../src/gen/climate';
import { generateGalaxy } from '../src/gen/galaxy';
import {
  FUMAROLE_FULL_HEAT_FLOW,
  FUMAROLE_MIN_HEAT_FLOW,
  GeyserSchedule,
  fumaroleHeat,
  MAX_PEAK_FRACTION,
  PEAK_1G,
  TIGER_STRIPES,
  dragIntegrals,
  geyserActivity,
  geyserEvent,
  geyserKind,
  geyserParticle,
  groundRadius,
  landingTime,
  launchSpeed,
  maxGeyserParticles,
  onLand,
  plumeHeight,
  plumePeak,
  plumePoint,
  type GeyserActivity,
  type GeyserBody,
  type GeyserEvent,
  type GeyserKind,
} from '../src/gen/geysers';
import { ballisticPoint } from '../src/gen/lavaActivity';
import { Rng } from '../src/gen/rng';
import { generateSystem } from '../src/gen/system';
import { globeRadius } from '../src/planet/frame';

const RELIEF = 1.6;

/** Solid bodies (with their geysers, if any) of the default galaxy's first systems. */
const bodies: { body: GeyserBody; radius: number; activity: GeyserActivity | null }[] = [];
for (const ref of generateGalaxy(1337).stars.slice(0, 200)) {
  for (const p of generateSystem(ref).planets) {
    for (const [b, moon] of [[p, false], ...p.moons.map((m) => [m, true] as const)] as const) {
      if (!b.climate) continue;
      const body: GeyserBody = { ...b, moon };
      const radius = globeRadius(b.radius);
      bodies.push({ body, radius, activity: geyserActivity(body, radius, RELIEF) });
    }
  }
}
const active = bodies.filter((b) => b.activity !== null) as { body: GeyserBody; radius: number; activity: GeyserActivity }[];
const ofKind = (kind: GeyserKind) => active.filter((b) => b.activity.kind === kind);

/** A climate from a setting and state (see gen/climate.ts). */
function climate(setting: ClimateSetting, state: StateSpec): ClimateData {
  return evaluateClimate(setting, climateStateOf({ pressure: 0, composition: 'none', greenhouse: 0, water: 0, surfaceAlbedo: 0.3, ...state }));
}

describe('which bodies have geysers', () => {
  // Reference bodies: insolation relative to Earth's, gravity in g, escape km/s, heat flow W/m² (docs/research/climate.md).
  const enceladus = climate({ insolation: 0.011, gravity: 0.0116, escapeVelocity: 0.239, heatFlow: 0.023 }, { water: 1, surfaceAlbedo: 0.8 });
  const ganymede = climate({ insolation: 0.037, gravity: 0.146, escapeVelocity: 2.74, heatFlow: 0.0135 }, { water: 1, surfaceAlbedo: 0.4 });
  const earth = climate(
    { insolation: 1, gravity: 1, escapeVelocity: 11.19, heatFlow: 0.092 },
    { pressure: 1.014, composition: 'oxygenNitrogen', greenhouse: 1, water: 0.7, surfaceAlbedo: 0.3 },
  );
  const io = climate({ insolation: 0.037, gravity: 0.183, escapeVelocity: 2.56, heatFlow: 2.24 }, { surfaceAlbedo: 0.6 });
  const venus = climate(
    { insolation: 1.91, gravity: 0.9, escapeVelocity: 10.36, heatFlow: 1.2 },
    { pressure: 92, composition: 'carbonDioxide', greenhouse: 1, surfaceAlbedo: 0.2 },
  );
  const moon = climate({ insolation: 1, gravity: 0.165, escapeVelocity: 2.38, heatFlow: 0.015 }, { surfaceAlbedo: 0.12 });

  it('gives the reference bodies the right kind', () => {
    expect(enceladus.waterState).toBe('ice');
    expect(geyserKind('ice', enceladus)).toBe('cryo');
    expect(geyserKind('ice', ganymede)).toBeNull();
    expect(earth.waterState).toBe('liquid');
    expect(geyserKind('terran', earth)).toBe('steam');
    expect(geyserKind('lava', io)).toBe('sulphur');
    // A Venus: hot enough, but its thick air smothers Io-style plumes.
    expect(geyserKind('lava', venus)).toBeNull();
    // Airless rock warm enough inside smokes a little (stylised fumaroles).
    expect(geyserKind('barren', moon)).toBe('fumarole');
    expect(geyserKind('desert', moon)).toBe('fumarole');
    const cold = climate({ insolation: 0.01, gravity: 0.01, escapeVelocity: 0.1, heatFlow: FUMAROLE_MIN_HEAT_FLOW / 2 }, { surfaceAlbedo: 0.1 });
    expect(geyserKind('barren', cold)).toBeNull();
    // Not where there's air, nor on ice (cryo's threshold rules there).
    expect(geyserKind('barren', earth)).toBeNull();
    expect(geyserKind('ice', moon)).toBeNull();
    expect(geyserKind('gas', earth)).toBeNull();
    expect(geyserKind('terran', null)).toBeNull();
  });

  it('shows every kind across the galaxy', () => {
    for (const kind of ['cryo', 'steam', 'sulphur', 'fumarole'] as const) expect(ofKind(kind).length).toBeGreaterThan(5);
    // ...and many solid bodies have none.
    expect(bodies.length - active.length).toBeGreaterThan(active.length * 0.5);
    // Most airless barren bodies vent now.
    const barren = bodies.filter((b) => b.body.type === 'barren' && b.body.climate!.pressure < 0.001);
    expect(barren.filter((b) => b.activity).length).toBeGreaterThan(barren.length * 0.5);
  });

  it('follows the climate', () => {
    for (const { body, activity } of active) {
      const c = body.climate!;
      if (activity.kind === 'steam') expect(c.waterState).toBe('liquid');
      if (activity.kind === 'cryo') expect(c.waterState).toBe('ice');
      if (activity.kind === 'sulphur') expect(c.heatFlow).toBeGreaterThanOrEqual(1);
      if (activity.kind === 'fumarole') {
        expect(c.pressure).toBeLessThan(0.001);
        expect(c.heatFlow).toBeGreaterThanOrEqual(FUMAROLE_MIN_HEAT_FLOW);
      }
    }
  });
});

describe('vents', () => {
  it('puts steam geysers on land', () => {
    for (const { body, activity } of ofKind('steam')) {
      expect(activity.vents.length).toBeGreaterThanOrEqual(1);
      for (const v of activity.vents) expect(onLand(v.dir, body.seed, body.style)).toBe(true);
    }
  });

  it('strings a moon’s cryogeysers along tiger stripes round the south pole', () => {
    const moons = ofKind('cryo').filter((b) => b.body.moon);
    expect(moons.length).toBeGreaterThan(0);
    const reach = Math.hypot(TIGER_STRIPES.length / 2, 1.5 * TIGER_STRIPES.spacing);
    for (const { activity } of moons) {
      expect(activity.vents.length).toBeGreaterThanOrEqual(8);
      for (const v of activity.vents) expect(Math.acos(-v.dir[1])).toBeLessThanOrEqual(reach + 1e-9);
    }
  });

  it('sets vents on the ground as drawn', () => {
    for (const { body, radius, activity } of active) {
      for (const v of activity.vents) {
        expect(Math.hypot(...v.dir)).toBeCloseTo(1, 9);
        expect(v.base).toBeCloseTo(groundRadius(v.dir, body, radius, RELIEF), 9);
        // Never below the sea (or, without one, far below the reference radius).
        expect(v.base).toBeGreaterThanOrEqual(radius * (body.style.sea === null ? 0.97 : 1));
      }
    }
  });

  it('is deterministic', () => {
    for (const { body, radius, activity } of active.slice(0, 20)) expect(geyserActivity(body, radius, RELIEF)).toEqual(activity);
  });
});

describe('plume motion', () => {
  it('is ballistic without drag', () => {
    const origin: [number, number, number] = [0, 1, 0];
    const t: [number, number, number] = [1, 0, 0];
    for (const time of [0.5, 2, 4]) {
      const p = plumePoint(origin, 100, t, 5, 1.5, [0, 0, 0], 0, 3, time);
      const q = ballisticPoint(origin, t, 100, 5, 1.5, 3, time);
      for (let i = 0; i < 3; i++) expect(p[i]).toBeCloseTo(q[i]!, 9);
    }
    expect(plumePeak(6, 0, 3)).toBeCloseTo(6, 12);
    expect(landingTime(6, 0, 3)).toBeCloseTo(4, 12);
  });

  it('matches the drag-free limit continuously', () => {
    const [e0, f0] = dragIntegrals(1e-5, 3);
    const [e1, f1] = dragIntegrals(2e-3, 3);
    expect(e0).toBeCloseTo(3, 4);
    expect(f0).toBeCloseTo(4.5, 3);
    // Just under the series switch, the series agrees with the exact formula.
    const k = 0.99e-3 / 3;
    const [ea, fa] = dragIntegrals(k, 3);
    const exact = (1 - Math.exp(-k * 3)) / k;
    expect(Math.abs(ea - exact)).toBeLessThan(1e-8);
    expect(Math.abs(fa - (3 - exact) / k)).toBeLessThan(1e-4);
    expect(e1).toBeLessThan(3);
    expect(f1).toBeLessThan(4.5);
  });

  it('peaks where the sampled height does, and lands after landingTime', () => {
    for (const [up, k, g] of [
      [5, 0.3, 1.3],
      [9, 0.15, 3],
      [3, 1.2, 5],
    ] as const) {
      let best = 0;
      for (let t = 0; t < 30; t += 0.001) best = Math.max(best, plumeHeight(up, k, g, t));
      expect(plumePeak(up, k, g)).toBeCloseTo(best, 5);
      expect(Math.abs(plumeHeight(up, k, g, landingTime(up, k, g)))).toBeLessThan(1e-6);
      // Drag makes it lower than in vacuum.
      expect(plumePeak(up, k, g)).toBeLessThan(plumePeak(up, 0, g));
      expect(plumePeak(launchSpeed(4, k, g), k, g)).toBeCloseTo(4, 6);
    }
  });

  it('lets a buoyant steam cloud keep rising', () => {
    let last = 0;
    for (let t = 0.5; t < 10; t += 0.5) {
      const h = plumeHeight(3, 1.2, -0.35, t);
      expect(h).toBeGreaterThan(last);
      last = h;
    }
  });

  it('drifts with the wind', () => {
    const p = plumePoint([0, 1, 0], 100, [1, 0, 0], 0, 0, [0, 0, 1], 0, -1, 2);
    expect(p[2]).toBeGreaterThan(1.9);
    expect(Math.hypot(...p)).toBeCloseTo(100 + 2, 9);
  });
});

describe('plume height', () => {
  const cryo = ofKind('cryo').find((b) => !b.body.moon)!;
  const withGravity = (g: number, radius: number) =>
    geyserActivity({ ...cryo.body, climate: { ...cryo.body.climate!, gravity: g } }, radius, RELIEF)!;

  it('scales as g^−½ for cryo and steam plumes', () => {
    const strong = withGravity(1, 1000);
    const weak = withGravity(0.3, 1000);
    for (let i = 0; i < strong.vents.length; i++) {
      expect(weak.vents[i]!.peak / strong.vents[i]!.peak).toBeCloseTo(Math.sqrt(1 / 0.3), 9);
      expect(strong.vents[i]!.peak).toBeLessThanOrEqual(PEAK_1G.cryo);
    }
    // Launched to reach it under the arcs' gravity.
    for (const v of weak.vents) expect(plumePeak(v.speed, weak.drag, weak.gravity)).toBeCloseTo(v.peak, 6);
  });

  it('never towers over the body', () => {
    for (const { radius, activity } of active)
      for (const v of activity.vents) expect(v.peak).toBeLessThanOrEqual(MAX_PEAK_FRACTION[activity.kind] * radius + 1e-9);
    const small = withGravity(0.2, 10);
    for (const v of small.vents) expect(v.peak).toBeLessThanOrEqual(MAX_PEAK_FRACTION.cryo * 10 + 1e-9);
  });

  it('makes a small moon’s cryo plume tall and a steam geyser short', () => {
    const moonPeaks = ofKind('cryo').filter((b) => b.body.moon).flatMap((b) => b.activity.vents.map((v) => v.peak / b.radius));
    const steamPeaks = ofKind('steam').flatMap((b) => b.activity.vents.map((v) => v.peak / b.radius));
    expect(Math.max(...steamPeaks)).toBeLessThan(Math.min(...moonPeaks));
  });
});

describe('eruptions', () => {
  const sample = [...ofKind('cryo').slice(0, 3), ...ofKind('steam').slice(0, 3), ...ofKind('sulphur').slice(0, 3)];

  it('keeps every vent erupting now and then', () => {
    for (const { body, activity } of sample) {
      for (let v = 0; v < activity.vents.length; v++) {
        let n = 0;
        for (let c = 0; c < 20; c++) if (geyserEvent(activity, body.seed, v, c)) n++;
        expect(n).toBeGreaterThan(8);
      }
    }
  });

  it('throws particles that land back on the ground (ballistic ones) or rise (steam)', () => {
    for (const { body, activity } of sample) {
      let event: GeyserEvent | null = null;
      for (let c = 3; !event; c++) event = geyserEvent(activity, body.seed, 0, c);
      const vent = activity.vents[event.vent]!;
      const rng = new Rng(event.seed);
      for (let i = 0; i < event.particles; i++) {
        const p = geyserParticle(rng, activity, event, i);
        expect(p.start).toBeGreaterThanOrEqual(event.start);
        expect(p.start + p.life).toBeLessThanOrEqual(event.end + 1e-9);
        const end = plumePoint(vent.dir, vent.base, p.tangent, p.up, p.side, [0, 0, 0], p.drag, p.gravity, p.life);
        if (p.style === 'puff') expect(Math.hypot(...end)).toBeGreaterThan(vent.base);
        else expect(Math.hypot(...end)).toBeCloseTo(vent.base, 4);
      }
    }
  });

  it('schedules the same events as a fresh schedule, and fits its pool', () => {
    for (const { body, activity } of sample) {
      const schedule = new GeyserSchedule(activity, body.seed);
      const bound = maxGeyserParticles(activity);
      let held = 0;
      const spawned: GeyserEvent[] = [];
      for (let t = 100; t < 400; t += 0.5) {
        schedule.advance(t, (e) => spawned.push(e));
        held = Math.max(
          held,
          schedule.events.reduce((n, e) => n + e.particles, 0),
        );
        if (Math.round(t) % 60 === 0 && t === Math.round(t)) {
          const fresh = new GeyserSchedule(activity, body.seed);
          fresh.advance(t);
          const key = (e: GeyserEvent) => `${e.vent}:${e.cycle}`;
          expect(fresh.events.map(key).sort()).toEqual(schedule.events.map(key).sort());
        }
      }
      expect(spawned.length).toBeGreaterThan(0);
      expect(held).toBeLessThanOrEqual(bound);
    }
  });
});

describe('fumaroles', () => {
  it('get busier with the heat flow, on a log scale', () => {
    expect(fumaroleHeat(FUMAROLE_MIN_HEAT_FLOW)).toBe(0);
    expect(fumaroleHeat(FUMAROLE_FULL_HEAT_FLOW)).toBe(1);
    expect(fumaroleHeat(Math.sqrt(FUMAROLE_MIN_HEAT_FLOW * FUMAROLE_FULL_HEAT_FLOW))).toBeCloseTo(0.5, 6);
    expect(fumaroleHeat(10)).toBe(1);
  });

  it('smoke, flicker with flames and throw embers that fall back', () => {
    const sample = ofKind('fumarole').slice(0, 5);
    expect(sample.length).toBeGreaterThan(0);
    const counts: Record<string, number> = {};
    for (const { body, activity } of sample) {
      for (let v = 0; v < activity.vents.length; v++) {
        const event = geyserEvent(activity, body.seed, v, 3);
        if (!event) continue;
        const rng = new Rng(event.seed);
        for (let i = 0; i < event.particles; i++) {
          const p = geyserParticle(rng, activity, event, i);
          counts[p.style] = (counts[p.style] ?? 0) + 1;
          if (p.style === 'ember') expect(plumeHeight(p.up, p.drag, p.gravity, p.life)).toBeCloseTo(0, 3);
          if (p.style === 'smoke' || p.style === 'flame') expect(p.gravity).toBeLessThan(0);
          expect(p.start + p.life).toBeLessThanOrEqual(event.end + 1e-9);
        }
      }
    }
    const total = (counts.smoke ?? 0) + (counts.ember ?? 0) + (counts.flame ?? 0);
    expect(total).toBeGreaterThan(100);
    expect(counts.smoke! / total).toBeGreaterThan(0.4);
    expect(counts.flame! / total).toBeGreaterThan(0.15);
    expect(counts.ember! / total).toBeGreaterThan(0.15);
  });

  it('stand in rows along fissures, low on the body', () => {
    for (const { radius, activity } of ofKind('fumarole').slice(0, 20)) {
      expect(activity.vents.length).toBeGreaterThanOrEqual(6);
      for (const v of activity.vents) expect(v.peak).toBeLessThanOrEqual(MAX_PEAK_FRACTION.fumarole * radius + 1e-9);
    }
  });
});
