import { describe, expect, it } from 'vitest';
import {
  cellSize,
  iceShare,
  maxReach,
  octaveReach,
  octaveSize,
  orbitRate,
  ringAt,
  ringOutOfReach,
  ringProfile,
  ringRockField,
  ringRockParams,
  ringRockPosition,
  ringRocksNear,
  type RingRock,
  type RingSample,
} from '../src/gen/rings';
import type { RingData } from '../src/gen/system';

/** A generated ring, in planet units (as the planet level has it). */
const RING: RingData = { inner: 1300, outer: 2200, color: '#d9c7a2', opacity: 0.7 };
const SEED = 42;

function collect(field: ReturnType<typeof ringRockField>, eye: { x: number; y: number; z: number }, time = 0, margin = 0): RingRock[] {
  const out: RingRock[] = [];
  ringRocksNear(field, eye, time, (r) => void out.push({ ...r }), margin);
  return out;
}

describe('ring profile', () => {
  it('is the same for the same seed, different for another, and a real profile is kept', () => {
    expect(ringProfile(RING, SEED)).toEqual(ringProfile(RING, SEED));
    expect(ringProfile(RING, SEED)).not.toEqual(ringProfile(RING, SEED + 1));
    const profile = [{ alpha: 1, light: 1 }];
    expect(ringProfile({ ...RING, profile }, SEED)).toBe(profile);
  });

  it('is clear outside the ring and fades at a generated ring’s edges', () => {
    const profile = ringProfile(RING, SEED);
    const s: RingSample = { alpha: 0, light: 0 };
    expect(ringAt(RING, profile, -0.01, s).alpha).toBe(0);
    expect(ringAt(RING, profile, 1.01, s).alpha).toBe(0);
    expect(ringAt(RING, profile, 0, s).alpha).toBe(0);
    expect(ringAt(RING, profile, 1, s).alpha).toBe(0);
    for (let t = 0; t <= 1; t += 0.01) {
      const a = ringAt(RING, profile, t, s).alpha;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(RING.opacity);
    }
  });
});

describe('ring rocks', () => {
  const field = ringRockField(RING, SEED, 1);
  const mid = (RING.inner + RING.outer) / 2;
  const eye = { x: mid, y: 2, z: 0 };

  it('are only near the ring', () => {
    expect(ringOutOfReach(field, { x: 0, y: 3000, z: 0 })).toBe(true);
    expect(ringOutOfReach(field, { x: RING.outer + maxReach() * 3, y: 0, z: 0 })).toBe(true);
    expect(ringOutOfReach(field, eye)).toBe(false);
    expect(collect(field, { x: mid, y: maxReach() * 2, z: 0 })).toHaveLength(0);
  });

  it('are the same every time, and each within its reach of the eye, inside the ring and its layer', () => {
    const rocks = collect(field, eye, 12.5);
    expect(rocks.length).toBeGreaterThan(200);
    expect(collect(field, eye, 12.5)).toEqual(rocks);
    const at = { x: 0, y: 0, z: 0 };
    for (const r of rocks) {
      ringRockPosition(r, 12.5, at);
      expect(Math.hypot(at.x - eye.x, at.y - eye.y, at.z - eye.z)).toBeLessThanOrEqual(r.reach + 1e-6);
      expect(r.radius).toBeGreaterThanOrEqual(RING.inner);
      expect(r.radius).toBeLessThanOrEqual(RING.outer);
      expect(Math.abs(r.height)).toBeLessThanOrEqual(ringRockParams.thickness);
      expect(r.size).toBeGreaterThanOrEqual(octaveSize(r.octave));
      expect(r.size).toBeLessThan(2 * octaveSize(r.octave));
      expect(Math.hypot(r.axisX, r.axisY, r.axisZ)).toBeCloseTo(1, 6);
    }
    expect(new Set(rocks.map((r) => r.id)).size).toBe(rocks.length);
  });

  it('keep their place, size and look whichever way the eye comes at them', () => {
    const a = new Map(collect(field, eye).map((r) => [r.id, r]));
    const moved = collect(field, { x: mid + 20, y: -3, z: 15 });
    let shared = 0;
    for (const r of moved) {
      const same = a.get(r.id);
      if (!same) continue;
      shared++;
      expect(r).toEqual(same);
    }
    expect(shared).toBeGreaterThan(50);
  });

  it('orbit: later on, the same rocks are found where their orbit has taken them', () => {
    const before = new Map(collect(field, eye, 0, 4).map((r) => [r.id, r]));
    const after = collect(field, eye, 2, 0);
    let shared = 0;
    for (const r of after) {
      const same = before.get(r.id);
      if (!same) continue;
      shared++;
      expect(r.angle).toBe(same.angle);
      expect(r.radius).toBe(same.radius);
    }
    expect(shared).toBeGreaterThan(after.length * 0.9);
  });

  it('turn faster further in, the planet’s way', () => {
    expect(orbitRate(RING.inner, RING.inner, 1)).toBeCloseTo(ringRockParams.speed / RING.inner, 12);
    expect(orbitRate(RING.outer, RING.inner, 1)).toBeLessThan(orbitRate(RING.inner, RING.inner, 1));
    expect(orbitRate(RING.outer, RING.inner, -1)).toBe(-orbitRate(RING.outer, RING.inner, 1));
    expect(ringRockField(RING, SEED, -0.3).direction).toBe(-1);
  });

  it('have about as many rocks in view in each octave of size (n(a) ∝ a^-3 shown out to a reach ∝ a)', () => {
    const solid: RingData = { ...RING, profile: [{ alpha: 1, light: 1 }], opacity: 1 };
    const rocks = collect(ringRockField(solid, SEED, 1), eye);
    const counts = Array.from({ length: ringRockParams.octaves }, (_, k) => rocks.filter((r) => r.octave === k).length);
    // Each octave's reach is a fixed number of its cells, with the same rocks tried per cell.
    const expected = Math.PI * ringRockParams.cells ** 2 * ringRockParams.perCell;
    for (let k = 0; k < counts.length; k++) {
      // The biggest octaves' reach is wider than the ring's layer is thick, smaller ones' reach not much more.
      expect(counts[k]!).toBeGreaterThan(expected * 0.5);
      expect(counts[k]!).toBeLessThan(expected * 1.5);
      expect(octaveReach(k) / cellSize(k)).toBeCloseTo(ringRockParams.cells, 9);
    }
  });

  it('follow the profile: none in a gap, many where the ring is dense', () => {
    const half = 32;
    const profile = Array.from({ length: half * 2 }, (_, i) => ({ alpha: i < half ? 0 : 1, light: 1 }));
    const gapped: RingData = { ...RING, opacity: 1, profile };
    const split = RING.inner + (RING.outer - RING.inner) * ((half - 1) / (half * 2 - 1));
    const rocks = collect(ringRockField(gapped, SEED, 1), { x: split, y: 0, z: 0 });
    const inGap = rocks.filter((r) => r.radius < split - 30).length;
    const inRing = rocks.filter((r) => r.radius > split + 30).length;
    expect(inGap).toBe(0);
    expect(inRing).toBeGreaterThan(100);
  });

  it('stop at the limit, biggest first', () => {
    const out: RingRock[] = [];
    const n = ringRocksNear(field, eye, 0, (r) => void out.push({ ...r }), 0, 50);
    expect(n).toBe(50);
    expect(out[0]!.octave).toBe(ringRockParams.octaves - 1);
  });
});

describe('ice share', () => {
  it('is high for bright, icy rings and low for dark, dusty ones', () => {
    expect(iceShare('#eef4ff')).toBeGreaterThan(0.9);
    expect(iceShare('#d9c7a2')).toBeGreaterThan(0.6);
    expect(iceShare('#4a4038')).toBeLessThan(0.2);
    expect(ringRockField({ ...RING, ice: 0.05 }, SEED, 1).ice).toBe(0.05);
  });
});
