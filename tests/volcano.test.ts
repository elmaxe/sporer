import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ITEMS, slotKey } from '../src/combat/items';
import {
  VolcanoShape,
  eruptionStrength,
  lavaFront,
  shellProgress,
  volcanoGrowth,
  volcanoParams,
  type VolcanoSite,
} from '../src/combat/volcano';
import { SurfaceChanges } from '../src/surface/changes';

const R = 400;
const site: VolcanoSite = { x: 0.3, y: 0.8, z: -0.2, seed: 1234 };

describe('the volcano bomb', () => {
  it('is the second weapon, so key 2 selects it', () => {
    const weapons = ITEMS.filter((i) => i.tab === 'weapons');
    const index = weapons.findIndex((i) => i.id === 'volcanoBomb');
    expect(index).toBe(1);
    expect(slotKey(index)?.code).toBe('Digit2');
  });

  it('speeds up from the ship to the ground', () => {
    expect(shellProgress(0)).toBe(0);
    expect(shellProgress(volcanoParams.flightTime)).toBe(1);
    expect(shellProgress(volcanoParams.flightTime * 2)).toBe(1);
    let last = 0;
    let lastStep = 0;
    for (let t = 0.1; t <= volcanoParams.flightTime; t += 0.1) {
      const p = shellProgress(t);
      expect(p).toBeGreaterThan(last);
      // Faster and faster.
      expect(p - last).toBeGreaterThanOrEqual(lastStep - 1e-9);
      lastStep = p - last;
      last = p;
    }
  });
});

describe('a volcano', () => {
  it('rises out of the ground and stops at its full height', () => {
    expect(volcanoGrowth(-1)).toBe(0);
    expect(volcanoGrowth(0)).toBe(0);
    expect(volcanoGrowth(volcanoParams.growTime)).toBe(1);
    expect(volcanoGrowth(1e6)).toBe(1);
    let last = 0;
    for (let t = 0.2; t <= volcanoParams.growTime; t += 0.2) {
      expect(volcanoGrowth(t)).toBeGreaterThan(last);
      last = volcanoGrowth(t);
    }
  });

  it('erupts hardest just after its birth, then settles to its lasting activity', () => {
    expect(eruptionStrength(-1)).toBe(0);
    const peak = Math.max(...Array.from({ length: 40 }, (_, i) => eruptionStrength(i * 0.25)));
    expect(peak).toBeGreaterThan(0.9);
    expect(eruptionStrength(1e6)).toBeCloseTo(volcanoParams.idle, 5);
    expect(eruptionStrength(volcanoParams.birthTime * 3)).toBeLessThan(0.5);
  });

  it('runs lava from the crater down its flanks, never past the foot', () => {
    expect(lavaFront(0)).toBe(0);
    expect(lavaFront(0.5)).toBeGreaterThanOrEqual(volcanoParams.craterShare);
    expect(lavaFront(volcanoParams.birthTime)).toBeGreaterThan(lavaFront(1));
    expect(lavaFront(1e6)).toBeCloseTo(volcanoParams.flowReach, 5);
    expect(volcanoParams.flowReach).toBeLessThan(1);
  });

  it('is a cone with a crater: highest at the rim, dipping inside, nothing past the foot', () => {
    const v = new VolcanoShape(site, R, R, null);
    const c = volcanoParams.craterShare;
    expect(v.profile(c, 0)).toBeCloseTo(1, 5);
    expect(v.profile(0, 0)).toBeCloseTo(1 - volcanoParams.craterDepth, 5);
    expect(v.profile(1, 0)).toBe(0);
    expect(v.profile(1.5, 0)).toBe(0);
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      let last = Infinity;
      for (let s = c; s <= 1; s += 0.05) {
        const h = v.profile(s, a);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(1);
        // Down the flanks all the way (the gullies only score them).
        expect(h).toBeLessThanOrEqual(last + 1e-9);
        last = h;
      }
    }
  });

  it('lifts the ground only over its footprint, by its growth', () => {
    const v = new VolcanoShape(site, R, R, null);
    const rim = v.direction(volcanoParams.craterShare, 1, new THREE.Vector3());
    expect(v.lift(rim)).toBeCloseTo(v.height, 3);
    v.growth = 0.5;
    expect(v.lift(rim)).toBeCloseTo(v.height * 0.5, 3);
    v.growth = 1;
    expect(v.lift(v.direction(1.2, 0.5, new THREE.Vector3()))).toBe(0);
    expect(v.lift(v.centre.clone().negate())).toBe(0);
    // Its direction and locate agree.
    const spot = { s: 0, azimuth: 0 };
    expect(v.locate(v.direction(0.6, 2, new THREE.Vector3()), spot)).toBe(true);
    expect(spot.s).toBeCloseTo(0.6, 5);
    expect(spot.azimuth).toBeCloseTo(2, 5);
  });

  it('is the same from the same seed, and fits on a small moon', () => {
    const a = new VolcanoShape(site, R, R, null);
    const b = new VolcanoShape(site, R, R, null);
    expect(a.height).toBe(b.height);
    expect(a.channels).toEqual(b.channels);
    const small = new VolcanoShape(site, 40, 40, null);
    expect(small.baseRadius).toBeLessThanOrEqual(40 * volcanoParams.maxBaseShare * 1.2 + 1e-9);
  });

  it('rising from the sea floor, breaks the surface with its crater floor above the sea', () => {
    const floor = R - 40;
    const v = new VolcanoShape(site, R, floor, R);
    expect(floor + v.height * (1 - volcanoParams.craterDepth)).toBeGreaterThan(R);
    // On dry land the sea doesn't change it.
    expect(new VolcanoShape(site, R, R + 5, R).height).toBe(new VolcanoShape(site, R, R + 5, null).height);
  });

  it('runs its lava channels from the crater, not past their reach', () => {
    const v = new VolcanoShape(site, R, R, null);
    for (const ch of v.channels) {
      expect(v.channel(0.4 * ch.reach, ch.azimuth + 0.12 * Math.sin(0.4 * ch.reach * 9 + ch.azimuth * 3))).toBeGreaterThan(0.9);
      // Past its reach only the faint edges of the others (round the cone) are left.
      expect(v.channel(ch.reach + 0.001, ch.azimuth)).toBeLessThan(0.05);
    }
  });
});

describe('volcanoes in the surface changes', () => {
  it('are kept in order and round-trip through JSON (older saves have none)', () => {
    const c = new SurfaceChanges();
    c.addVolcano(site);
    c.addVolcano({ ...site, seed: 7 });
    const again = SurfaceChanges.fromJSON(JSON.parse(JSON.stringify(c)));
    expect(again.volcanoes).toEqual([site, { ...site, seed: 7 }]);
    expect(SurfaceChanges.fromJSON({ removed: [] }).volcanoes).toEqual([]);
  });
});
