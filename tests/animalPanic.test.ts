import { describe, expect, it } from 'vitest';
import { HerdPath, animalGait, generateHerd, herdGridSize, planAnimals, type AnimalPlan, type AnimalPose, type HerdData } from '../src/gen/animals';
import { alarmCalls, gruntAt, herdConversation, talkSlot } from '../src/gen/animalTalk';
import { CALL_KINDS, SCREAM_RASP_MAX, SCREAM_RASP_MIN, TRACT_SOUND_SPEED, animalVoice, callLength, callPitch, callShape, formant, speciesMass, tractLength } from '../src/gen/animalVoice';
import { terrainNoise } from '../src/gen/noise';
import { HerdPanic, fleeSpeed, moveAt, moveDuration, panicParams, type PanicState } from '../src/gen/panic';
import type { GroundRadius } from '../src/gen/plants';

const RADIUS = 400;
const ground: GroundRadius = (d) => {
  const n = terrainNoise(d.x, d.y, d.z, 7);
  return n < -0.05 ? RADIUS * 0.96 : RADIUS * (1 + 0.08 * ((n + 0.05) / 1.05));
};

function plan(seed = 42): AnimalPlan {
  const p = planAnimals({ seed, tier: 3, temperature: 288, gravity: 1, radius: RADIUS, peak: RADIUS * 1.08, sea: true });
  if (!p) throw new Error('no animals');
  return p;
}

function firstHerd(p: AnimalPlan, min = 4): HerdData {
  const n = herdGridSize(p.radius);
  for (let f = 0; f < 6; f++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const h = generateHerd(p, ground, f, i, j);
    if (h && h.count >= min) return h;
  }
  throw new Error('no herd');
}

const pose = (): AnimalPose => ({ x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 1, cycle: 0, stride: 0, trot: 0, graze: 0, idle: 0 });
const state = (): PanicState => ({ ox: 0, oy: 0, vx: 0, vy: 0, cycles: 0, phase: 'none', since: 0 });

describe('moves (accelerate, cruise, stop)', () => {
  it('covers exactly its distance, at no more than its speed, continuously', () => {
    for (const [d, v, a] of [
      [30, 6, 0.5],
      [0.5, 6, 0.5],
      [10, 1, 1],
    ] as const) {
      const T = moveDuration(d, v, a);
      const m = { d: 0, v: 0 };
      let last = 0;
      for (let t = 0; t <= T + 0.5; t += 0.01) {
        moveAt(d, v, a, t, m);
        expect(m.v).toBeLessThanOrEqual(v + 1e-9);
        expect(m.d).toBeGreaterThanOrEqual(last - 1e-9);
        expect(m.d - last).toBeLessThan(v * 0.01 + 1e-6);
        last = m.d;
      }
      expect(moveAt(d, v, a, T, m).d).toBeCloseTo(d, 6);
      expect(m.v).toBeCloseTo(0, 6);
    }
  });
});

describe('panics (issue #156)', () => {
  const p = plan();
  const herd = firstHerd(p);
  const species = p.species[herd.species]!;
  const path = new HerdPath(p, ground, herd, { hipHeight: 0.8 });

  it('gallops at the same Froude number for every size (Alexander: asymmetric gaits at Fr 2–3)', () => {
    for (const h of [0.3, 1, 3]) {
      const g = animalGait({ hipHeight: h }, 1);
      const v = fleeSpeed(g);
      expect(v * v / (g.g * g.hip)).toBeCloseTo(panicParams.fleeFroude, 9);
      expect(v).toBeGreaterThan(g.trotSpeed);
    }
  });

  it('freezes, flees away from the threat, watches, then walks back to exactly where its walk has it', () => {
    const panic = new HerdPanic(herd.seed, herd.count, path.gait);
    expect(panic.over(0)).toBe(true);
    expect(panic.startle(100, 1, 0)).toBe(true);
    const s = state();
    // Startled: frozen in place.
    panic.state(0, 100, s);
    expect(s.phase).toBe('startled');
    expect(Math.hypot(s.ox, s.oy)).toBe(0);
    // Running away: every member moves away (within the scatter), at most at a gallop, and gets about fleeFactor flee radii.
    const run = fleeSpeed(path.gait);
    let ran = 0;
    for (let k = 0; k < herd.count; k++) {
      panic.state(k, 101.5, s);
      expect(s.phase).toBe('fleeing');
      expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(run + 1e-9);
      expect(s.vx / Math.hypot(s.vx, s.vy)).toBeGreaterThan(Math.cos(panicParams.scatter) - 1e-9);
    }
    // While the threat is held near, they keep watching; it never returns.
    for (let t = 101; t < 160; t += 0.5) panic.hold(t);
    for (let k = 0; k < herd.count; k++) {
      panic.state(k, 159, s);
      expect(s.phase).toBe('watching');
      ran = Math.hypot(s.ox, s.oy);
      expect(ran).toBeGreaterThan(panicParams.fleeRadius * panicParams.fleeFactor * 0.8);
      expect(ran).toBeLessThan(panicParams.fleeRadius * panicParams.fleeFactor * 1.2);
    }
    expect(panic.fleeing(159)).toBe(false);
    expect(panic.over(159)).toBe(false);
    // Left alone, they walk back and the panic ends with nothing left of it.
    let t = 160;
    while (!panic.over(t) && t < 400) t += 0.25;
    expect(panic.over(t)).toBe(true);
    for (let k = 0; k < herd.count; k++) {
      panic.state(k, t, s);
      expect(s.phase).toBe('none');
    }
    const a = pose();
    const b = pose();
    path.pose(0, t + 1, a);
    path.pose(0, t + 1, b);
    expect(panic.apply(path, 0, t + 1, b)).toBe('none');
    expect(b).toEqual(a);
  });

  it('moves smoothly while it runs and walks back (no jumps frame to frame)', () => {
    const panic = new HerdPanic(herd.seed, herd.count, path.gait);
    panic.startle(50, 0.6, 0.8);
    const s = state();
    for (let k = 0; k < herd.count; k++) {
      let last: [number, number] | null = null;
      for (let t = 50; t < 50 + 60; t += 1 / 60) {
        panic.state(k, t, s);
        if (last) expect(Math.hypot(s.ox - last[0], s.oy - last[1])).toBeLessThan(fleeSpeed(path.gait) / 60 + 1e-6);
        last = [s.ox, s.oy];
      }
    }
  });

  it("doesn't restart while running, and runs on from where it is when startled again", () => {
    const panic = new HerdPanic(herd.seed, herd.count, path.gait);
    panic.startle(10, 1, 0);
    expect(panic.startle(10.5, -1, 0)).toBe(false);
    const s = state();
    panic.state(0, 30, s);
    const before = { x: s.ox, y: s.oy };
    expect(panic.startle(30, 0, 1)).toBe(true);
    panic.state(0, 30, s);
    expect(s.ox).toBeCloseTo(before.x, 9);
    expect(s.oy).toBeCloseTo(before.y, 9);
    panic.state(0, 35, s);
    expect(s.oy).toBeGreaterThan(before.y);
  });

  it('turns the animals to run, head up, and back round to watch', () => {
    const panic = new HerdPanic(herd.seed, herd.count, path.gait);
    const t0 = herd.slot * 3;
    panic.startle(t0, 1, 0);
    const q = pose();
    path.pose(1, t0 + 1.5, q);
    expect(panic.apply(path, 1, t0 + 1.5, q)).toBe('fleeing');
    expect(q.graze).toBe(0);
    expect(q.trot).toBeGreaterThan(0.9);
    expect(q.stride).toBe(1);
    // Heading along the flight (the walk's own speed is small beside a gallop).
    const away = { x: path.e1.x, y: path.e1.y, z: path.e1.z };
    expect(q.hx * away.x + q.hy * away.y + q.hz * away.z).toBeGreaterThan(0.6);
    expect(Math.hypot(q.x, q.y, q.z)).toBeCloseTo(1, 9);
    expect(Math.abs(q.hx * q.x + q.hy * q.y + q.hz * q.z)).toBeLessThan(1e-9);
    void species;
  });
});

describe('animal voices', () => {
  it('pitch falls as M^−0.4, through the cats, dogs, people and elephants of Fletcher (2004) Fig. 3', () => {
    // [mass kg, dominant frequency range Hz] read off Fletcher's Fig. 3.
    for (const [m, lo, hi] of [
      [4, 500, 1000],
      [20, 200, 600],
      [70, 100, 250],
      [4000, 20, 50],
    ] as const) {
      const f = callPitch(m);
      expect(f).toBeGreaterThan(lo * 0.7);
      expect(f).toBeLessThan(hi * 1.3);
    }
    expect(callPitch(10) / callPitch(1)).toBeCloseTo(10 ** -0.4, 9);
  });

  it('formants come from a tube closed at one end: ΔF = c/2L (Reby: 228.15 Hz for a 76.7 cm red deer tract)', () => {
    const L = 76.7;
    expect(formant(2, L) - formant(1, L)).toBeCloseTo(228.15, 0);
    expect(formant(2, L) - formant(1, L)).toBeCloseTo((TRACT_SOUND_SPEED * 100) / (2 * L), 9);
    expect(formant(1, L, 1)).toBe(0);
    expect(tractLength(100)).toBeGreaterThan(tractLength(1));
  });

  it("gives every species a voice from its body: bigger animals lower, all within a speaker's range", () => {
    const species = Array.from({ length: 30 }, (_, i) => plan(i + 1).species).flat();
    for (const s of species) {
      const v = animalVoice(s);
      expect(v.pitch).toBeGreaterThanOrEqual(70);
      expect(v.pitch).toBeLessThanOrEqual(1600);
      expect(v.formants[0]).toBeLessThan(v.formants[1]);
      expect(v.syllable).toBeGreaterThan(0.05);
      expect(v.syllable).toBeLessThanOrEqual(1.2);
      expect(animalVoice(s)).toBe(v);
      if (s.form.plan === 'hexapod') expect(v.buzz).toBeGreaterThan(0);
    }
    const sorted = [...species].sort((a, b) => speciesMass(a) - speciesMass(b));
    const light = sorted.slice(0, 10).map((s) => animalVoice(s).pitch);
    const heavy = sorted.slice(-10).map((s) => animalVoice(s).pitch);
    expect(Math.max(...heavy)).toBeLessThan(Math.max(...light));
    expect(heavy.reduce((a, b) => a + b) / 10).toBeLessThan(light.reduce((a, b) => a + b) / 10);
  });

  it('calls by what they say (Morton): alarms and distress higher than contact calls, growls lower and harsher', () => {
    const s = plan(3).species[0]!;
    const v = animalVoice(s);
    const peak = (kind: (typeof CALL_KINDS)[number]) => Math.max(...callShape(v, kind, 7).flatMap((x) => x.pitch));
    expect(peak('alarm')).toBeGreaterThan(peak('contact'));
    expect(peak('distress')).toBeGreaterThan(peak('contact'));
    expect(peak('growl')).toBeLessThan(peak('contact'));
    expect(callShape(v, 'growl', 7)[0]!.rough).toBeGreaterThan(callShape(v, 'alarm', 7)[0]!.rough);
    // A scream on the beam: higher than any other call, as harsh as it goes, its rasp at screams' roughness rates (Arnal et al. 2015).
    expect(peak('scream')).toBeGreaterThan(peak('distress'));
    for (let variant = 0; variant < 50; variant++) {
      for (const s of callShape(v, 'scream', variant)) {
        expect(s.rough).toBe(1);
        expect(s.rasp).toBeGreaterThanOrEqual(SCREAM_RASP_MIN);
        expect(s.rasp).toBeLessThanOrEqual(SCREAM_RASP_MAX);
      }
    }
    // Rising as it's carried up.
    expect(Math.max(...callShape(v, 'scream', 3, 1.35).flatMap((x) => x.pitch))).toBeCloseTo(Math.max(...callShape(v, 'scream', 3).flatMap((x) => x.pitch)) * 1.35, 9);
    for (const kind of CALL_KINDS) {
      const shape = callShape(v, kind, 123);
      expect(shape).toEqual(callShape(v, kind, 123));
      expect(callLength(shape)).toBeGreaterThan(0);
      for (const x of shape) for (const f of x.pitch) expect(Number.isFinite(f) && f > 0).toBe(true);
    }
  });
});

describe('herd talk', () => {
  const p = plan();
  const herd = firstHerd(p);
  const voice = animalVoice(p.species[herd.species]!);

  it('has animals call and others answer them in turn, never talking over the last call', () => {
    let conversations = 0;
    for (let slot = 0; slot < 200; slot++) {
      const calls = herdConversation(herd.seed, slot, herd.count, voice);
      expect(calls).toEqual(herdConversation(herd.seed, slot, herd.count, voice));
      if (calls.length === 0) continue;
      conversations++;
      expect(calls[0]!.at).toBeGreaterThanOrEqual(slot * talkSlot(voice));
      for (let i = 1; i < calls.length; i++) {
        expect(calls[i]!.member).not.toBe(calls[i - 1]!.member);
        expect(calls[i]!.at).toBeGreaterThan(calls[i - 1]!.at + callLength(callShape(voice, calls[i - 1]!.kind, calls[i - 1]!.variant)));
        expect(calls[i]!.kind).toBe('answer');
      }
    }
    expect(conversations).toBeGreaterThan(80);
    expect(conversations).toBeLessThan(160);
  });

  it('gives the alarm from the animal nearest the threat first, others taking it up', () => {
    const calls = alarmCalls(herd.seed, 1, 500, herd.count, 2);
    expect(calls[0]!.member).toBe(2);
    expect(calls.every((c) => c.kind === 'alarm' && c.at >= 500 && c.member < herd.count)).toBe(true);
    expect(gruntAt(herd.seed, 0, 3)).toEqual(gruntAt(herd.seed, 0, 3));
  });
});
