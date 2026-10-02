import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  arcPoint,
  blastAt,
  busterParams,
  busterPhase,
  crackSpread,
  doneAt,
  fireball,
  flashAt,
  projectileProgress,
  shockRing,
} from '../src/combat/buster';
import { BustedBodies, bodyKey } from '../src/combat/busted';
import { ITEMS, ITEM_TABS } from '../src/combat/items';
import {
  DEBRIS_CHUNKS,
  DEBRIS_REACH,
  DUST_REACH,
  debrisHeat,
  debrisPalette,
  debrisParams,
  debrisPosition,
  debrisThrow,
  generateDebris,
} from '../src/gen/debris';

describe('busted bodies', () => {
  it('busts a body once, and remembers when', () => {
    const busted = new BustedBodies();
    const key = bodyKey({ name: 'Haikrai III', seed: 42 });
    expect(busted.isBusted(key)).toBe(false);
    expect(busted.blastTime(key)).toBeNull();
    expect(busted.bust(key, 120)).toBe(true);
    expect(busted.bust(key, 200)).toBe(false);
    expect(busted.blastTime(key)).toBe(120);
    expect(busted.count).toBe(1);
  });

  it('round-trips through JSON', () => {
    const busted = new BustedBodies();
    busted.bust('a:1', 5);
    busted.bust('b:2', 7);
    const back = BustedBodies.fromJSON(JSON.parse(JSON.stringify(busted.toJSON())));
    expect(back.blastTime('a:1')).toBe(5);
    expect(back.blastTime('b:2')).toBe(7);
    expect(back.count).toBe(2);
  });
});

describe('items', () => {
  it('puts every item in a tab, with its own key', () => {
    const tabs = new Set(ITEM_TABS.map((t) => t.id));
    for (const item of ITEMS) expect(tabs.has(item.tab)).toBe(true);
    expect(new Set(ITEMS.map((i) => i.key)).size).toBe(ITEMS.length);
    expect(ITEMS.find((i) => i.id === 'planetBuster')?.tab).toBe('weapons');
  });
});

describe('the buster timeline', () => {
  it('goes flight → fuse → blast → done', () => {
    const p = busterParams;
    expect(busterPhase(0)).toBe('flight');
    expect(busterPhase(p.flightTime - 0.01)).toBe('flight');
    expect(busterPhase(p.flightTime + 0.01)).toBe('fuse');
    expect(busterPhase(blastAt() + 0.01)).toBe('blast');
    expect(busterPhase(doneAt() + 0.01)).toBe('done');
    expect(blastAt()).toBeCloseTo(p.flightTime + p.fuse);
  });

  it('flies the projectile from 0 to 1, always forwards and faster towards the end', () => {
    expect(projectileProgress(0)).toBe(0);
    expect(projectileProgress(busterParams.flightTime)).toBeCloseTo(1);
    expect(projectileProgress(busterParams.flightTime * 2)).toBe(1);
    let last = 0;
    let lastStep = 0;
    for (let i = 1; i <= 20; i++) {
      const u = projectileProgress((busterParams.flightTime * i) / 20);
      expect(u).toBeGreaterThan(last);
      if (i > 1) expect(u - last).toBeGreaterThan(lastStep - 1e-9);
      lastStep = u - last;
      last = u;
    }
  });

  it('flashes at the impact and brighter at the blast, dark in between and long after', () => {
    expect(flashAt(0)).toBe(0);
    expect(flashAt(busterParams.flightTime)).toBeCloseTo(busterParams.impactFlash);
    expect(flashAt(busterParams.flightTime + 1)).toBeLessThan(0.1);
    expect(flashAt(blastAt())).toBe(1);
    expect(flashAt(blastAt() + 6)).toBeLessThan(0.01);
    for (let t = 0; t < doneAt(); t += 0.05) {
      expect(flashAt(t)).toBeGreaterThanOrEqual(0);
      expect(flashAt(t)).toBeLessThanOrEqual(1);
    }
  });

  it('spreads the cracks from the impact round the globe before the blast, and stops them at it', () => {
    expect(crackSpread(busterParams.flightTime - 0.1).glow).toBe(0);
    const early = crackSpread(busterParams.flightTime + 0.2);
    const late = crackSpread(blastAt() - 0.01);
    expect(early.glow).toBeGreaterThan(0);
    expect(late.angle).toBeGreaterThan(early.angle);
    expect(late.angle).toBeLessThanOrEqual(Math.PI);
    expect(crackSpread(blastAt() + 0.1).glow).toBe(0);
  });

  it('swells the fireball and races the ring out after the blast, then lets them go', () => {
    expect(fireball(blastAt() - 0.1).glow).toBe(0);
    expect(fireball(blastAt() + 0.5).size).toBeLessThan(fireball(blastAt() + 2).size);
    expect(fireball(blastAt() + busterParams.fireballTime).glow).toBe(0);
    expect(shockRing(blastAt() + 0.01).radius).toBeCloseTo(1, 0);
    expect(shockRing(blastAt() + 3).radius).toBeGreaterThan(shockRing(blastAt() + 1).radius);
    expect(shockRing(blastAt() + 3).radius).toBeLessThan(busterParams.ringSize);
    expect(shockRing(blastAt() + busterParams.ringTime).glow).toBe(0);
  });
});

describe('arcPoint', () => {
  const out = new THREE.Vector3();

  it('starts at the ship and ends at the target', () => {
    const from = new THREE.Vector3(0, 450, 0);
    const to = new THREE.Vector3(400, 0, 0);
    expect(arcPoint(from, to, 0, 0.35, out).distanceTo(from)).toBeLessThan(1e-6);
    expect(arcPoint(from, to, 1, 0.35, out).distanceTo(to)).toBeLessThan(1e-6);
  });

  it('drops straight down onto the point beneath the ship', () => {
    const from = new THREE.Vector3(0, 450, 0);
    const to = new THREE.Vector3(0, 400, 0);
    for (let u = 0; u <= 1; u += 0.1) {
      arcPoint(from, to, u, 0.35, out);
      expect(Math.abs(out.x) + Math.abs(out.z)).toBeLessThan(1e-6);
      expect(out.y).toBeCloseTo(450 - 50 * u);
    }
  });

  it('stays above the ground on the way to the far side of the globe', () => {
    const R = 400;
    const from = new THREE.Vector3(0, R + 5, 0);
    const to = new THREE.Vector3(Math.sin(2.5), Math.cos(2.5), 0).multiplyScalar(R);
    for (let u = 0.02; u < 1; u += 0.02) expect(arcPoint(from, to, u, 0.35, out).length()).toBeGreaterThan(R);
  });
});

describe('debris', () => {
  const data = generateDebris(1234, 600, 800);

  it('is the same from the same seed, and the biggest chunks are the same however many', () => {
    expect(generateDebris(1234, 600, 800)).toEqual(data);
    const few = generateDebris(1234, 100, 0);
    expect(few.chunks.slice(0, 20)).toEqual(data.chunks.slice(0, 20));
    expect(generateDebris(99, 600, 800)).not.toEqual(data);
  });

  it('sorts the chunks biggest first, many small and a few big', () => {
    const all = generateDebris(1234, DEBRIS_CHUNKS, 0).chunks;
    expect(all.length).toBe(DEBRIS_CHUNKS);
    for (let i = 1; i < all.length; i++) expect(all[i]!.size).toBeLessThanOrEqual(all[i - 1]!.size);
    const big = all.filter((c) => c.size > 0.08).length;
    expect(big).toBeGreaterThan(0);
    expect(big).toBeLessThan(all.length * 0.15);
  });

  it('starts inside the body and never reaches past the field edge', () => {
    const p = { x: 0, y: 0, z: 0 };
    for (const c of data.chunks) {
      expect(c.from + c.size).toBeLessThanOrEqual(0.9 + 1e-9);
      for (const t of [0, 0.5, 2, 10, 1000]) {
        debrisPosition(c, t, p);
        expect(Math.hypot(p.x, p.y, p.z) + c.size).toBeLessThanOrEqual(DEBRIS_REACH + 1e-9);
      }
    }
    for (const m of data.motes) expect(m.to).toBeLessThanOrEqual(DUST_REACH + 1e-9);
  });

  it('is thrown out fast and brakes, and cools', () => {
    expect(debrisThrow(0, 1)).toBe(0);
    expect(debrisThrow(-1, 1)).toBe(0);
    expect(debrisThrow(debrisParams.throwTime, 1)).toBeCloseTo(1 - Math.exp(-1));
    expect(debrisThrow(10, 1)).toBeGreaterThan(0.99);
    expect(debrisHeat(0.01)).toBeGreaterThan(0.99);
    expect(debrisHeat(debrisParams.coolTime * 5)).toBeLessThan(0.01);
  });

  it('flattens towards the old equator', () => {
    const p = { x: 0, y: 0, z: 0 };
    let sideways = 0;
    let up = 0;
    for (const c of data.chunks) {
      debrisPosition(c, 100, p);
      sideways += Math.hypot(p.x, p.z);
      up += Math.abs(p.y);
    }
    // A round cloud would give up / sideways ≈ (1/2) / (π/4) ≈ 0.64.
    expect(up / sideways).toBeLessThan(0.64 * debrisParams.flatten + 0.05);
  });

  it('takes its colours from the body, or a giant’s bands', () => {
    const style = { sea: '#2255aa', seaLevel: 0, low: '#447733', high: '#998866', relief: 0.05 };
    expect(debrisPalette(style, null)).toEqual(['#3b3532', '#447733', '#998866', '#2255aa']);
    expect(debrisPalette({ ...style, sea: null }, null)[3]).toBe('#447733');
    expect(debrisPalette(style, ['#111111', '#222222', '#333333', '#444444'])).toEqual(['#111111', '#222222', '#333333', '#444444']);
  });
});
