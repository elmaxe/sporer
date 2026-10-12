import { describe, expect, it } from 'vitest';
import {
  BUILDING_FOOTPRINT,
  ColonyLedger,
  buildingGrowth,
  colonistCount,
  colonistDesign,
  colonistSpecies,
  colonistsSuited,
  colonyBlock,
  colonyParams,
  colonyRings,
  colonySite,
  parseColonySite,
  planColony,
  ringsComplete,
  standingCount,
  type ColonyGround,
  type ColonyWorld,
} from '../src/gen/colony';
import { buildingDesign } from '../src/gen/colonyBuildings';
import { slopeAt } from '../src/gen/animals';
import { defaultCreature } from '../src/gen/creature';
import { MAX_COMPLEXITY, complexity } from '../src/gen/ship';
import { SurfaceChanges } from '../src/surface/changes';

const R = 400;
type V = { x: number; y: number; z: number };
/** A test world: gentle land, a sea where x > 0.5, a ragged mountain range where z > 0.6. */
const ground = (d: V): number => {
  const l = Math.hypot(d.x, d.y, d.z);
  const x = d.x / l;
  const y = d.y / l;
  const z = d.z / l;
  if (x > 0.5) return R - 6;
  if (z > 0.6) return R + 20 + 18 * Math.sin(y * 260) * Math.sin(x * 240);
  return R + 3 + 1.5 * Math.sin(x * 9) * Math.cos(y * 7);
};
const land: ColonyGround = { ground, radius: R, sea: true };
const earthlike: ColonyWorld = { solid: true, lava: false, climate: { temperature: 288, pressure: 1, composition: 'oxygenNitrogen', habitability: 3 } };
const norm = (v: V): V => {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
/** On dry gentle land, near the sea to the east. */
const shore = norm({ x: 0.42, y: 0.1, z: -0.9 });
const inland = norm({ x: -0.6, y: 0.2, z: -0.77 });

describe('colony growth', () => {
  const site = colonySite(1234, 0, inland, 1_000_000);

  it('is the same plan for the same site, seed and tier', () => {
    expect(planColony(site, 3, land)).toEqual(planColony(site, 3, land));
    expect(planColony(colonySite(1234, 1, inland, 0), 3, land).name).not.toBe(planColony(site, 3, land).name);
  });

  it('grows one ring per tier: T1 one, T2 two, T3 three', () => {
    for (const tier of [1, 2, 3] as const) {
      const layout = planColony(site, tier, land);
      expect(layout.rings).toBe(tier);
      expect(Math.max(...layout.buildings.map((b) => b.ring))).toBe(tier);
      expect(layout.buildings.filter((b) => b.ring === 0)).toHaveLength(1);
      expect(layout.buildings.length).toBeLessThanOrEqual(colonyParams.slotsPerRing.slice(0, tier + 1).reduce((a, b) => a + b, 0));
    }
    expect(colonyRings(0)).toBe(0);
    expect(planColony(site, 3, land).buildings.length).toBeGreaterThan(planColony(site, 1, land).buildings.length);
  });

  it('starts with the hub and goes up ring by ring over a few minutes', () => {
    const layout = planColony(site, 3, land);
    expect(standingCount(layout, 0)).toBe(1);
    expect(layout.buildings[0]!.kind).toBe('hub');
    expect(buildingGrowth(layout.buildings[0]!, 0)).toBe(0);
    expect(buildingGrowth(layout.buildings[0]!, colonyParams.riseTime)).toBe(1);
    for (let i = 1; i < layout.buildings.length; i++) expect(layout.buildings[i]!.appear).toBeGreaterThanOrEqual(layout.buildings[i - 1]!.appear);
    // Never fewer buildings later on.
    let last = 0;
    for (let age = 0; age < layout.complete + 10; age += 5) {
      const n = standingCount(layout, age);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    expect(last).toBe(layout.buildings.length);
    expect(ringsComplete(layout, layout.complete)).toBe(3);
    expect(ringsComplete(layout, 1)).toBe(0);
    expect(layout.complete).toBeGreaterThan(120);
    expect(layout.complete).toBeLessThan(600);
  });

  it('builds nothing in the sea or on steep ground', () => {
    const near = colonySite(99, 0, shore, 0);
    const layout = planColony(near, 3, land);
    const full = colonyParams.slotsPerRing.reduce((a, b) => a + b, 0);
    // The sea to the east takes some of its slots.
    expect(layout.buildings.length).toBeLessThan(full);
    for (const b of layout.buildings) {
      expect(ground(b)).toBeGreaterThanOrEqual(R);
      if (b.ring > 0) expect(slopeAt(ground, b, ground(b))).toBeLessThanOrEqual(colonyParams.maxSlope);
      // Standing on the lowest ground under it.
      expect(b.radius).toBeLessThanOrEqual(ground(b) + 1e-9);
    }
    const hills = colonySite(5, 0, norm({ x: -0.3, y: 0.1, z: 0.6 }), 0);
    for (const b of planColony(hills, 3, land).buildings.filter((q) => q.ring > 0)) {
      expect(slopeAt(ground, b, ground(b))).toBeLessThanOrEqual(colonyParams.maxSlope);
    }
    expect(BUILDING_FOOTPRINT.hub).toBeGreaterThan(BUILDING_FOOTPRINT.house);
  });

  it('has more colonists as it grows, up to a cap', () => {
    expect(colonistCount(0)).toBe(0);
    expect(colonistCount(1)).toBe(2);
    expect(colonistCount(10)).toBeGreaterThan(colonistCount(3));
    expect(colonistCount(1000)).toBe(colonyParams.maxColonists);
  });
});

describe('where a colony can be founded', () => {
  it('is green on dry, gentle, mild ground of a T1–T3 world', () => {
    expect(colonyBlock(earthlike, land, inland)).toBeNull();
    expect(colonyBlock({ ...earthlike, climate: { ...earthlike.climate!, habitability: 1, composition: 'nitrogen' } }, land, inland)).toBeNull();
  });

  it('says why not: sea, steep, hot, cold, no air, lava, no ground, a neighbour', () => {
    expect(colonyBlock(earthlike, land, norm({ x: 0.9, y: 0, z: 0.1 }))).toMatch(/^Sea/);
    expect(colonyBlock(earthlike, land, norm({ x: -0.2, y: 0.05, z: 0.97 }))).toMatch(/steep/);
    expect(colonyBlock({ ...earthlike, climate: { ...earthlike.climate!, temperature: 330 } }, land, norm({ x: -0.6, y: 0, z: -0.8 }))).toMatch(/hot/);
    expect(colonyBlock({ ...earthlike, climate: { ...earthlike.climate!, temperature: 275 } }, land, norm({ x: -0.1, y: 0.99, z: -0.1 }))).toMatch(/cold/);
    expect(colonyBlock({ ...earthlike, climate: { temperature: 200, pressure: 0, composition: 'none', habitability: 0 } }, land, inland)).toBe('No air here');
    expect(colonyBlock({ ...earthlike, climate: { temperature: 700, pressure: 90, composition: 'carbonDioxide', habitability: 0 } }, land, inland)).toBe('Too hot here');
    expect(colonyBlock({ ...earthlike, lava: true }, land, inland)).toMatch(/Lava/);
    expect(colonyBlock({ ...earthlike, solid: false }, null, inland)).toMatch(/No ground/);
    expect(colonyBlock(earthlike, land, inland, [{ ...norm({ x: -0.62, y: 0.21, z: -0.76 }), name: 'Oldtown' }])).toBe('Too close to Oldtown');
    const far = Array.from({ length: colonyParams.maxPerBody }, (_, i) => ({ x: 0, y: i % 2 ? 1 : -1, z: 0, name: `C${i}` }));
    expect(colonyBlock(earthlike, land, inland, far)).toMatch(/No room/);
  });
});

describe('colony buildings and colonists', () => {
  it('builds each kind from ship parts, the same for the same seed, within the editor’s complexity', () => {
    for (const kind of ['hub', 'house', 'tower', 'farm', 'power'] as const) {
      const d = buildingDesign(kind, 42);
      expect(d).toEqual(buildingDesign(kind, 42));
      expect(d.parts.length).toBeGreaterThan(1);
      expect(d.parts[0]!.parent).toBe(-1);
      expect(complexity(d)).toBeLessThanOrEqual(MAX_COMPLEXITY);
    }
    expect(buildingDesign('house', 1).paint).not.toEqual(buildingDesign('house', 2).paint);
  });

  it('are the captain’s species, suited where the air is not breathable', () => {
    const captain = defaultCreature();
    expect(colonistsSuited({ composition: 'oxygenNitrogen' })).toBe(false);
    expect(colonistsSuited({ composition: 'nitrogen' })).toBe(true);
    expect(colonistsSuited(null)).toBe(true);
    const bare = colonistDesign(captain, false);
    const suited = colonistDesign(captain, true);
    expect(bare.paint.base).toBe(captain.paint.base);
    expect(suited.paint.base).not.toBe(captain.paint.base);
    expect(bare.parts.length).toBe(captain.parts.length);
    expect(bare.outfit).toBeUndefined();
    const s = colonistSpecies(captain, true);
    expect(s.design).toEqual(suited);
    expect(s.form.color).toBe(suited.paint.base);
    expect(s.length).toBe(colonyParams.colonistLength);
  });
});

describe('keeping colonies', () => {
  const site = colonySite(7, 2, { x: 0, y: 3, z: 4 }, 1_700_000_000_000);

  it('round-trips through a body’s change list as JSON', () => {
    const changes = new SurfaceChanges();
    expect(changes.nextColony).toBe(0);
    expect(changes.addColony(site)).toBe(true);
    expect(changes.addColony(site)).toBe(false);
    expect(changes.nextColony).toBe(3);
    const back = SurfaceChanges.fromJSON(JSON.parse(JSON.stringify(changes.toJSON())));
    expect(back.colonies).toEqual([site]);
    expect(SurfaceChanges.fromJSON({ removed: [] }).colonies).toEqual([]);
  });

  it('keeps every colony of a galaxy, with its star, through JSON', () => {
    let saved = 0;
    const ledger = new ColonyLedger(() => saved++);
    ledger.add({ body: 'Haikrai I:5', name: 'Newhaven', star: 6, site });
    ledger.add({ body: 'Haikrai I:5', name: 'Newhaven', star: 6, site });
    ledger.add({ body: 'Other:9', name: 'Far', star: 40, site: { ...site, id: 'colony:0' } });
    expect(saved).toBe(2);
    expect([...ledger.stars()].sort((a, b) => a - b)).toEqual([6, 40]);
    const copy = new ColonyLedger();
    copy.load(JSON.parse(JSON.stringify(ledger.toJSON())));
    expect(copy.toJSON()).toEqual(ledger.toJSON());
    expect(copy.on('Other:9')).toHaveLength(1);
    copy.removeBody('Other:9');
    expect([...copy.stars()]).toEqual([6]);
    copy.load({ colonies: [{ body: 'x', name: 'bad', star: 1, site: { id: 'colony:0' } as never }] });
    expect(copy.size).toBe(0);
    expect(parseColonySite({ ...site, x: 0, y: 0, z: 0 })).toBeNull();
    expect(site.y).toBeCloseTo(0.6);
  });
});
