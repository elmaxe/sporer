import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../src/gen/galaxy';
import {
  EruptionSchedule,
  MAX_PEAK_FRACTION,
  ballisticPoint,
  eruptionEvent,
  eruptionGlow,
  eruptionSlots,
  flightTime,
  lavaActivity,
  maxEruptionParticles,
  peakHeight,
  type EruptionEvent,
  type EruptionKind,
  type LavaActivity,
} from '../src/gen/lavaActivity';
import { detailedTerrain } from '../src/gen/noise';
import { generateSystem, type MoonData, type PlanetData } from '../src/gen/system';
import { EARTH_GLOBE_RADIUS, globeRadius } from '../src/planet/frame';

const KINDS: EruptionKind[] = ['fountain', 'eruption'];

/** Lava planets and moons of the default galaxy's first systems. */
const bodies: (PlanetData | MoonData)[] = [];
for (const ref of generateGalaxy(1337).stars.slice(0, 80)) {
  const system = generateSystem(ref);
  for (const p of system.planets) {
    if (p.type === 'lava') bodies.push(p);
    for (const m of p.moons) if (m.type === 'lava') bodies.push(m);
  }
}
const activityOf = (b: PlanetData | MoonData): LavaActivity => lavaActivity(b.seed, b.style, b.climate, globeRadius(b.radius));

/** Every event of `kind` that starts in [from, to). */
function eventsBetween(a: LavaActivity, seed: number, kind: EruptionKind, from: number, to: number): EruptionEvent[] {
  const [first, last] = eruptionSlots(a, kind, from, to);
  const out: EruptionEvent[] = [];
  for (let i = first; i <= last; i++) {
    const e = eruptionEvent(a, seed, kind, i);
    if (e && e.start >= from && e.start < to) out.push(e);
  }
  return out;
}

describe('ballistic arcs', () => {
  const origin: [number, number, number] = [0, 1, 0];
  const tangent: [number, number, number] = [1, 0, 0];
  const R = 100;

  it('lands back on the surface after the flight time', () => {
    for (const [up, side, g] of [
      [4, 1, 3],
      [9, 3, 1.5],
      [2, 0, 5],
    ] as const) {
      const T = flightTime(up, g);
      const p = ballisticPoint(origin, tangent, R, up, side, g, T);
      expect(Math.hypot(...p)).toBeCloseTo(R, 9);
      // ...having slid round the sphere by side·T.
      expect(Math.acos(p[1] / R)).toBeCloseTo((side * T) / R, 9);
    }
  });

  it('peaks at v²/2g halfway through', () => {
    const up = 5;
    const g = 3;
    const T = flightTime(up, g);
    expect(peakHeight(up, g)).toBeCloseTo((up * up) / (2 * g), 12);
    const height = (t: number) => Math.hypot(...ballisticPoint(origin, tangent, R, up, 0, g, t)) - R;
    expect(height(T / 2)).toBeCloseTo(peakHeight(up, g), 9);
    for (const f of [0.1, 0.3, 0.45, 0.55, 0.8]) expect(height(T * f)).toBeLessThan(peakHeight(up, g));
  });

  it('throws higher and longer under weaker gravity', () => {
    expect(peakHeight(4, 1)).toBeGreaterThan(peakHeight(4, 3));
    expect(flightTime(4, 1)).toBeGreaterThan(flightTime(4, 3));
  });
});

describe('lavaActivity', () => {
  it('finds lava bodies to test', () => {
    expect(bodies.length).toBeGreaterThan(10);
  });

  it('puts every vent in a lava sea', () => {
    for (const b of bodies) {
      const a = activityOf(b);
      expect(a.vents.length).toBeGreaterThanOrEqual(4);
      for (const [x, y, z] of a.vents) {
        expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
        expect(detailedTerrain(x, y, z, b.seed)).toBeLessThan(b.style.seaLevel);
      }
    }
  });

  it('is deterministic', () => {
    for (const b of bodies.slice(0, 5)) {
      expect(activityOf(b)).toEqual(activityOf(b));
      const a = activityOf(b);
      for (const kind of KINDS) {
        for (let i = 0; i < 20; i++) expect(eruptionEvent(a, b.seed, kind, i)).toEqual(eruptionEvent(activityOf(b), b.seed, kind, i));
      }
    }
  });

  it('throws higher and slower on weaker worlds, never higher than the cap', () => {
    const b = bodies.find((x) => x.climate!.gravity > 0.5)!;
    const strong = activityOf(b);
    const weak = lavaActivity(b.seed, b.style, { ...b.climate!, gravity: b.climate!.gravity / 4 }, globeRadius(b.radius));
    for (const kind of KINDS) {
      const s = strong[kind].speed[1];
      const w = weak[kind].speed[1];
      expect(peakHeight(w, weak.gravity)).toBeGreaterThan(peakHeight(s, strong.gravity));
      expect(flightTime(w, weak.gravity)).toBeGreaterThan(flightTime(s, strong.gravity));
    }
    for (const x of bodies) {
      const a = activityOf(x);
      for (const kind of KINDS) {
        expect(peakHeight(a[kind].speed[1], a.gravity)).toBeLessThanOrEqual(MAX_PEAK_FRACTION[kind] * a.radius + 1e-9);
        // Big eruptions go higher than fountains; flights stay short enough to watch.
        expect(flightTime(a[kind].speed[1], a.gravity)).toBeLessThan(12);
      }
      expect(a.eruption.speed[1]).toBeGreaterThan(a.fountain.speed[1]);
    }
  });

  it('keeps a lava world busy: fountains most of the time, a big eruption every minute or so', () => {
    for (const b of bodies.slice(0, 10)) {
      const a = activityOf(b);
      const perMinute = (kind: EruptionKind) => eventsBetween(a, b.seed, kind, 0, 6000).length / 100;
      expect(perMinute('fountain')).toBeGreaterThan(10);
      expect(perMinute('eruption')).toBeGreaterThan(0.8);
      expect(perMinute('eruption')).toBeLessThan(4);
    }
  });

  it('scales the activity with internal heat', () => {
    const b = bodies[0]!;
    const cool = lavaActivity(b.seed, b.style, { ...b.climate!, geothermal: 0.5 }, EARTH_GLOBE_RADIUS);
    const hot = lavaActivity(b.seed, b.style, { ...b.climate!, geothermal: 1 }, EARTH_GLOBE_RADIUS);
    expect(hot.fountain.chance).toBeGreaterThan(cool.fountain.chance);
    expect(hot.eruption.chance).toBeGreaterThan(cool.eruption.chance);
    expect(hot.fountain.speed[1]).toBeGreaterThan(cool.fountain.speed[1]);
    expect(hot.vents.length).toBeGreaterThan(cool.vents.length);
  });
});

describe('eruption events', () => {
  const b = bodies[0]!;
  const a = activityOf(b);

  it('start in their own slot and end after their blobs land', () => {
    for (const kind of KINDS) {
      for (let i = 0; i < 200; i++) {
        const e = eruptionEvent(a, b.seed, kind, i);
        if (!e) continue;
        expect(e.start).toBeGreaterThanOrEqual(i * a[kind].interval);
        expect(e.start).toBeLessThan((i + 1) * a[kind].interval);
        expect(e.end).toBeGreaterThanOrEqual(e.start + e.life + flightTime(e.speed, a.gravity) - 1e-9);
        expect(a.vents[e.vent]).toEqual(e.origin);
      }
    }
  });

  it('covers every event under way at a time in eruptionSlots', () => {
    for (const kind of KINDS) {
      const all = eventsBetween(a, b.seed, kind, 0, 2000);
      for (let t = 50; t < 1900; t += 7.3) {
        const alive = all.filter((e) => t >= e.start && t < e.end).map((e) => e.index);
        const [first, last] = eruptionSlots(a, kind, t, t);
        for (const i of alive) {
          expect(i).toBeGreaterThanOrEqual(first);
          expect(i).toBeLessThanOrEqual(last);
        }
      }
    }
  });

  it('glows only while under way, big eruptions brightest', () => {
    const f = eventsBetween(a, b.seed, 'fountain', 0, 500)[0]!;
    const e = eventsBetween(a, b.seed, 'eruption', 0, 500)[0]!;
    for (const x of [f, e]) {
      expect(eruptionGlow(x, x.start - 0.01)).toBe(0);
      expect(eruptionGlow(x, x.end)).toBe(0);
      expect(eruptionGlow(x, x.start + 1.5)).toBeGreaterThan(0);
    }
    expect(eruptionGlow(e, e.start + 0.5)).toBeGreaterThan(eruptionGlow(f, f.start + f.life / 2));
  });
});

describe('EruptionSchedule', () => {
  const b = bodies[1]!;
  const a = activityOf(b);
  const ids = (s: EruptionSchedule, t: number) =>
    s.events
      .filter((e) => t >= e.start && t < e.end)
      .map((e) => `${e.kind}${e.index}`)
      .sort();

  it('shows the same events stepping along as jumping straight there', () => {
    const stepped = new EruptionSchedule(a, b.seed);
    for (let t = 0; t <= 300; t += 1 / 30) {
      stepped.advance(t);
      if (Math.abs(t % 37) < 1 / 30) {
        const fresh = new EruptionSchedule(a, b.seed);
        expect(fresh.advance(t)).toBe(true);
        expect(ids(stepped, t)).toEqual(ids(fresh, t));
      }
    }
  });

  it('rebuilds on a jump and reports each event once', () => {
    const s = new EruptionSchedule(a, b.seed);
    const seen = new Set<string>();
    s.advance(100);
    expect(s.jumps(100.5)).toBe(false);
    expect(s.jumps(99)).toBe(true);
    expect(s.jumps(110)).toBe(true);
    for (let t = 100; t < 400; t += 0.05) {
      s.advance(t, (e) => {
        const id = `${e.kind}${e.index}`;
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      });
    }
    expect(seen.size).toBeGreaterThan(50);
  });

  it('never holds more blobs than maxEruptionParticles', () => {
    for (const x of bodies.slice(0, 6)) {
      const act = activityOf(x);
      const bound = maxEruptionParticles(act);
      const s = new EruptionSchedule(act, x.seed);
      for (let t = 0; t < 600; t += 0.1) {
        s.advance(t);
        expect(s.events.reduce((n, e) => n + e.particles, 0)).toBeLessThanOrEqual(bound);
      }
    }
  });
});
