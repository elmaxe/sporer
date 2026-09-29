import { describe, expect, it } from 'vitest';
import { Rng } from '../src/gen/rng';
import {
  maxStormParticles,
  starActivity,
  stormAlive,
  stormEvent,
  stormSlots,
  type StarActivity,
  type StormEvent,
  type StormKind,
} from '../src/gen/starActivity';
import { generateStar, type StarData, type StarKind } from '../src/gen/stars';

const star = (kind: StarKind, seed = 1): StarData => generateStar(new Rng(seed), kind);
const KINDS: StormKind[] = ['prominence', 'flare'];

/** Every event of `kind` that starts in [from, to). */
function eventsBetween(activity: StarActivity, seed: number, kind: StormKind, from: number, to: number): StormEvent[] {
  const [first, last] = stormSlots(activity[kind], from, to);
  const out: StormEvent[] = [];
  for (let i = first; i <= last; i++) {
    const e = stormEvent(activity, seed, kind, i);
    if (e && e.start >= from && e.start < to) out.push(e);
  }
  return out;
}

/** Events per minute of `kind`, over a long stretch. */
function rate(activity: StarActivity, kind: StormKind): number {
  return eventsBetween(activity, 42, kind, 0, 6000).length / 100;
}

describe('starActivity', () => {
  it('lets dwarfs churn faster than giants', () => {
    expect(starActivity(star('redDwarf')).pace).toBeGreaterThan(starActivity(star('mainSequence')).pace * 0.99);
    expect(starActivity(star('whiteDwarf')).pace).toBeGreaterThan(starActivity(star('redGiant')).pace);
    expect(starActivity(star('redGiant')).granulation).toBeLessThan(starActivity(star('redDwarf')).granulation);
  });

  it('has red dwarfs flare often and small, giants rarely and big', () => {
    const dwarf = starActivity(star('redDwarf'));
    const giant = starActivity(star('redGiant'));
    expect(rate(dwarf, 'flare')).toBeGreaterThan(rate(giant, 'flare') * 4);
    expect(dwarf.flare.particles).toBeLessThan(giant.flare.particles);
    expect(dwarf.flare.life[1]).toBeLessThan(giant.flare.life[0]);
    expect(dwarf.prominence.size[1]).toBeLessThan(giant.prominence.size[1]);
  });

  it('gives every kind of star visible activity', () => {
    for (const kind of ['mainSequence', 'redDwarf', 'whiteDwarf', 'redGiant', 'blueGiant'] as const) {
      const a = starActivity(star(kind));
      expect(a.pace).toBeGreaterThan(0);
      // At least one event every minute or so.
      expect(rate(a, 'prominence') + rate(a, 'flare')).toBeGreaterThan(1);
    }
    // White dwarfs are too small and hot for loops, but still flare.
    expect(rate(starActivity(star('whiteDwarf')), 'prominence')).toBe(0);
  });

  it('only spots cool stars', () => {
    expect(starActivity(star('blueGiant')).spots).toBe(0);
    expect(starActivity(star('redDwarf')).spots).toBeGreaterThan(0.5);
  });
});

describe('stormEvent', () => {
  const activity = starActivity(star('mainSequence', 7));

  it('is deterministic per star, kind and slot', () => {
    for (let i = -5; i < 30; i++) {
      for (const kind of KINDS) expect(stormEvent(activity, 99, kind, i)).toEqual(stormEvent(activity, 99, kind, i));
    }
    const a = eventsBetween(activity, 1, 'flare', 0, 500).map((e) => e.start);
    const b = eventsBetween(activity, 2, 'flare', 0, 500).map((e) => e.start);
    expect(a).not.toEqual(b);
  });

  it('starts inside its slot, with unit footpoints on the sphere', () => {
    for (const kind of KINDS) {
      const spec = activity[kind];
      for (let i = 0; i < 200; i++) {
        const e = stormEvent(activity, 5, kind, i);
        if (!e) continue;
        expect(e.start).toBeGreaterThanOrEqual(i * spec.interval);
        expect(e.start).toBeLessThan((i + 1) * spec.interval);
        expect(e.life).toBeGreaterThanOrEqual(spec.life[0]);
        expect(e.life).toBeLessThanOrEqual(spec.life[1]);
        expect(Math.hypot(...e.origin)).toBeCloseTo(1, 9);
        expect(Math.hypot(...e.end)).toBeCloseTo(1, 9);
        if (kind === 'prominence') {
          const cos = e.origin[0] * e.end[0] + e.origin[1] * e.end[1] + e.origin[2] * e.end[2];
          expect(Math.acos(Math.min(1, cos))).toBeGreaterThan(0.14);
          expect(Math.acos(Math.min(1, cos))).toBeLessThan(0.46);
        }
      }
    }
  });

  it('finds every live event from the slot range alone (random access in time)', () => {
    for (const kind of KINDS) {
      // All events, found by brute force over a wide range of slots.
      const all: StormEvent[] = [];
      for (let i = -20; i < 400; i++) {
        const e = stormEvent(activity, 11, kind, i);
        if (e) all.push(e);
      }
      for (let t = 0; t < 600; t += 1.7) {
        const [first, last] = stormSlots(activity[kind], t, t);
        for (const e of all) if (stormAlive(e, t)) expect(e.index >= first && e.index <= last).toBe(true);
      }
    }
  });

  it('never has more live particles than the pool bound', () => {
    for (const kind of ['mainSequence', 'redDwarf', 'whiteDwarf', 'redGiant', 'blueGiant'] as const) {
      const a = starActivity(star(kind));
      const bound = maxStormParticles(a);
      const events = KINDS.flatMap((k) => eventsBetween(a, 3, k, -100, 2000));
      for (let t = 0; t < 1900; t += 0.9) {
        let live = 0;
        for (const e of events) if (stormAlive(e, t)) live += e.particles;
        expect(live).toBeLessThanOrEqual(bound);
      }
    }
  });
});
