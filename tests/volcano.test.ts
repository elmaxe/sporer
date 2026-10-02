import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/combat/items';
import {
  VolcanoShape,
  eruptionStrength,
  lavaFront,
  shellControl,
  shellPoint,
  shellProgress,
  volcanoGrowth,
  volcanoParams,
  type VolcanoSite,
} from '../src/combat/volcano';
import { SurfaceChanges } from '../src/surface/changes';

const R = 400;
const site: VolcanoSite = { x: 0.3, y: 0.8, z: -0.2, seed: 1234 };

describe('the volcano bomb', () => {
  it('is a weapon on its own key', () => {
    const item = ITEMS.find((i) => i.id === 'volcanoBomb');
    expect(item?.tab).toBe('weapons');
    expect(item?.key).toBe('Digit2');
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

describe("the volcano bomb's path", () => {
  const R0 = 150;
  const sphere = () => R0;
  const point = (u: number, from: THREE.Vector3, c: THREE.Vector3, to: THREE.Vector3) => shellPoint(from, c, to, u, new THREE.Vector3());

  it('starts at the ship and ends on the point', () => {
    const from = new THREE.Vector3(0, 330, 0);
    const to = new THREE.Vector3(R0, 0, 0);
    const c = shellControl(from, to, sphere, new THREE.Vector3());
    expect(point(0, from, c, to).distanceTo(from)).toBeLessThan(1e-9);
    expect(point(1, from, c, to).distanceTo(to)).toBeLessThan(1e-9);
  });

  it('goes the shortest way, straight, when nothing is in the way', () => {
    // High over a small moon, at a point on the near side (the dump of a shell that went round the globe instead).
    const from = new THREE.Vector3(0, 330, 0);
    const to = new THREE.Vector3(0, 1, 0.9).normalize().multiplyScalar(R0);
    const c = shellControl(from, to, sphere, new THREE.Vector3());
    expect(c.distanceTo(new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5))).toBeLessThan(1e-9);
    // Every point lies on the line from the ship to the point.
    const line = new THREE.Line3(from, to);
    for (let u = 0; u <= 1; u += 0.1) expect(line.closestPointToPoint(point(u, from, c, to), true, new THREE.Vector3()).distanceTo(point(u, from, c, to))).toBeLessThan(1e-6);
  });

  it('bows out over the ground in the way, staying above it', () => {
    // Low over the globe, at a point a quarter of the way round: the line would cut through it.
    const from = new THREE.Vector3(0, R0 + 20, 0);
    const to = new THREE.Vector3(R0, 0, 0);
    const c = shellControl(from, to, sphere, new THREE.Vector3());
    for (let u = 0.05; u < 0.8; u += 0.05) expect(point(u, from, c, to).length()).toBeGreaterThan(R0 + volcanoParams.shellClearance - 1e-6);
    // No higher than it needs: well inside twice the ship's height.
    expect(c.length()).toBeLessThan(2 * (R0 + 20));
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

  it('can be drawn exaggerated (the system view), wider and higher in proportion', () => {
    const v = new VolcanoShape(site, R, R, null);
    const big = new VolcanoShape(site, R, R, null, 2.5);
    expect(big.baseRadius).toBeCloseTo(2.5 * v.baseRadius, 9);
    expect(big.height).toBeCloseTo(2.5 * v.height, 9);
    expect(big.angle).toBeCloseTo(2.5 * v.angle, 9);
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
