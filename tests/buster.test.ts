import { describe, expect, it } from 'vitest';
import {
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
import { ITEMS, ITEM_TABS, cargoItem, cargoKey, slotKey } from '../src/combat/items';
import {
  DRAPER_POINT,
  ROCK,
  blastHeat,
  blastParams,
  crustTemperature,
  debrisLook,
  debrisLookFor,
  dropletTemperature,
  generateVapour,
  glowBrightness,
  glowColor,
  hotArea,
  vapourState,
  DEBRIS_CHUNKS,
  DEBRIS_REACH,
  DUST_REACH,
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
  it('puts every item in a tab, the buster in Weapons and the beam in the Inventory', () => {
    const tabs = new Set(ITEM_TABS.map((t) => t.id));
    for (const item of ITEMS) expect(tabs.has(item.tab)).toBe(true);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(ITEMS.find((i) => i.id === 'planetBuster')?.tab).toBe('weapons');
    expect(ITEMS.find((i) => i.id === 'abduct')?.tab).toBe('inventory');
  });

  it('keys the slots of the tab on show 1 to 9, and names cargo stacks by key', () => {
    expect(slotKey(0)).toEqual({ code: 'Digit1', label: '1' });
    expect(slotKey(8)?.code).toBe('Digit9');
    expect(slotKey(9)).toBeNull();
    expect(cargoKey(cargoItem('home#2'))).toBe('home#2');
    expect(cargoKey('abduct')).toBeNull();
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

  it('is thrown out fast and brakes', () => {
    expect(debrisThrow(0, 1)).toBe(0);
    expect(debrisThrow(-1, 1)).toBe(0);
    expect(debrisThrow(debrisParams.throwTime, 1)).toBeCloseTo(1 - Math.exp(-1));
    expect(debrisThrow(10, 1)).toBeGreaterThan(0.99);
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

// See docs/research/shattered-planets.md: escape velocities from the NASA fact sheets.
describe('how hot the blast leaves a body', () => {
  it('puts the dispersal energy of the reference bodies where it is', () => {
    // (3/10) v² is the uniform sphere's binding energy per kg: Earth 37.5 MJ/kg (Wikipedia: 37.5 for a uniform Earth).
    expect(blastHeat(11.186) / blastParams.heatShare / 1e6).toBeCloseTo(37.5, 0);
  });

  it('melts and partly vaporises an Earth, half melts Mars, barely warms the Moon, leaves Ceres cold', () => {
    const earth = debrisLook(11.19, false);
    expect(earth.melt).toBe(1);
    expect(earth.vapour).toBeGreaterThan(0.25);
    expect(earth.vapour).toBeLessThan(0.45);
    const mars = debrisLook(5.03, false);
    expect(mars.melt).toBeGreaterThan(0.4);
    expect(mars.melt).toBeLessThan(0.75);
    expect(mars.vapour).toBe(0);
    const moon = debrisLook(2.38, false);
    expect(moon.melt).toBeGreaterThan(0.05);
    expect(moon.melt).toBeLessThan(0.25);
    expect(debrisLook(0.51, false).melt).toBeLessThan(0.02);
    // Bigger is hotter.
    let last = -1;
    for (const v of [0.5, 2, 5, 8, 11, 15, 25]) {
      const l = debrisLook(v, false);
      expect(l.melt + l.vapour).toBeGreaterThanOrEqual(last);
      last = l.melt + l.vapour;
    }
  });

  it('turns giants to gas, and keeps vapour between the triple and critical points', () => {
    const jupiter = debrisLook(59.5, true);
    expect(jupiter.gas).toBe(true);
    expect(jupiter.vapour).toBe(1);
    for (const v of [9, 11, 20, 40]) {
      const T = debrisLook(v, false).vapourTemperature;
      expect(T).toBeGreaterThanOrEqual(ROCK.triplePoint);
      expect(T).toBeLessThanOrEqual(ROCK.criticalPoint);
    }
    // From game bodies: a gas giant (bands, no climate) is gas; an Earth-like climate is what its escape velocity says.
    expect(debrisLookFor({ radius: 30, type: 'gas', size: 'gasGiant', bands: ['#aa8866', '#ccbb99'] }).gas).toBe(true);
    expect(debrisLookFor({ radius: 8, type: 'terran', climate: { escapeVelocity: 11.19 } })).toEqual(debrisLook(11.19, false));
  });

  it('crusts the melt over within seconds to a few per cent of glowing fissures', () => {
    expect(hotArea(0, 1)).toBe(0);
    expect(hotArea(0.01, 1)).toBeGreaterThan(0.99);
    expect(hotArea(blastParams.crustTime * 10, 1)).toBeCloseTo(blastParams.hotArea, 3);
    expect(hotArea(blastParams.crustTime * 10, 0.5)).toBeCloseTo(blastParams.hotArea * 0.5, 3);
  });

  it('cools the crust from the melt to a dull red heat that lasts', () => {
    expect(crustTemperature(0)).toBe(ROCK.triplePoint);
    expect(crustTemperature(blastParams.crustTime)).toBeLessThan(ROCK.triplePoint);
    expect(crustTemperature(1e4)).toBeCloseTo(blastParams.crustFloor);
    expect(blastParams.crustFloor).toBeGreaterThan(DRAPER_POINT);
  });

  it('cools droplets below the glow within seconds', () => {
    expect(dropletTemperature(0)).toBe(ROCK.triplePoint);
    expect(dropletTemperature(blastParams.dropletTime)).toBeCloseTo(ROCK.triplePoint * 2 ** (-1 / 3));
    expect(dropletTemperature(60)).toBeLessThan(DRAPER_POINT);
  });

  it('spreads, cools and condenses the vapour away; a giant\u2019s gas lingers', () => {
    const earth = debrisLook(11.19, false);
    const early = vapourState(0.5, earth);
    const later = vapourState(5, earth);
    expect(later.size).toBeGreaterThan(early.size);
    expect(later.temperature).toBeLessThan(early.temperature);
    expect(later.density).toBeLessThan(early.density);
    expect(vapourState(60, earth).density).toBe(0);
    expect(vapourState(1, debrisLook(5, false)).density).toBe(0);
    expect(vapourState(600, debrisLook(59.5, true)).density).toBeGreaterThan(0);
  });

  it('colours the glow from the blackbody table and brightens it steeply with temperature', () => {
    expect(glowColor(2000)).toEqual([1, 0.2484, 0.0061]);
    const mid = glowColor(2100);
    expect(mid[1]).toBeGreaterThan(0.2484);
    expect(mid[1]).toBeLessThan(0.293);
    expect(glowBrightness(DRAPER_POINT)).toBe(0);
    expect(glowBrightness(ROCK.triplePoint)).toBeCloseTo(1);
    expect(glowBrightness(1200)).toBeLessThan(glowBrightness(1500));
    expect(glowBrightness(4000)).toBeGreaterThan(2);
  });

  it('makes the same vapour from the same seed', () => {
    expect(generateVapour(5, 50)).toEqual(generateVapour(5, 50));
    for (const p of generateVapour(5, 200)) expect(p.distance).toBeLessThanOrEqual(1);
  });
});
