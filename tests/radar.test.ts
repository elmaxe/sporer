import { describe, expect, it } from 'vitest';
import { ITEMS, ItemSwitches, itemDef } from '../src/combat/items';
import { HerdPath, generateHerd, herdGridSize, planAnimals, type AnimalPlan, type AnimalPose } from '../src/gen/animals';
import { terrainNoise } from '../src/gen/noise';
import type { GroundRadius } from '../src/gen/plants';
import { describeAnimal, describePlant, herdCountText } from '../src/planet/SpeciesTab';
import { HerdCensus } from '../src/radar/census';
import { candidateHerds, groundDistance, pingInterval, proximity, radarParams, waveSpread } from '../src/radar/radarRules';

const RADIUS = 400;
const PEAK = RADIUS * 1.08;
/** A synthetic planet: about half land, relief up to 8% of the radius (as in animals.test.ts). */
const ground: GroundRadius = (d) => {
  const n = terrainNoise(d.x, d.y, d.z, 7);
  return n < -0.05 ? RADIUS * 0.96 : RADIUS * (1 + 0.08 * ((n + 0.05) / 1.05));
};

function plan(seed = 42): AnimalPlan {
  const p = planAnimals({ seed, tier: 3, temperature: 288, gravity: 1, radius: RADIUS, peak: PEAK, sea: true });
  if (!p) throw new Error('no animals');
  return p;
}

describe('herd census', () => {
  it('finds every herd of the globe, the same ones the cells give, a few cells at a time', () => {
    const p = plan();
    const census = new HerdCensus(p, ground);
    const n = herdGridSize(RADIUS);
    expect(census.cells).toBe(6 * n * n);
    // A budget of nothing still looks at one cell per step.
    let steps = 0;
    let clock = 0;
    while (!census.done) {
      census.step(0, () => clock++);
      steps++;
    }
    expect(steps).toBe(census.cells);
    expect(census.progress).toBe(1);
    const direct = [];
    for (let f = 0; f < 6; f++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const h = generateHerd(p, ground, f, i, j);
      if (h) direct.push(h.id);
    }
    expect(census.herds.map((h) => h.id)).toEqual(direct);
    expect(census.herds.length).toBeGreaterThan(20);
    // Counts by species add up, and a tier-3 world's grazers are all found somewhere.
    const total = p.species.reduce((sum, _, k) => sum + census.herdCount(k), 0);
    expect(total).toBe(census.herds.length);
    for (const s of p.species) if (s.diet === 'herbivore') expect(census.herdCount(s.index)).toBeGreaterThan(0);
    for (const s of p.species) expect(census.animalCount(s.index)).toBeGreaterThanOrEqual(census.herdCount(s.index) * s.herdMin);
  });

  it('is deterministic', () => {
    const a = new HerdCensus(plan(7), ground).finish();
    const b = new HerdCensus(plan(7), ground).finish();
    expect(a.herds).toEqual(b.herds);
  });
});

describe('radar rules', () => {
  it('pings quicker and fans out wider the closer the animals are', () => {
    const distances = [0, 5, 15, 30, 60, 120, 250, 500, 1000, 3000];
    const intervals = distances.map((d) => pingInterval(d));
    const spreads = distances.map((d) => waveSpread(d));
    for (let i = 1; i < distances.length; i++) {
      expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1]!);
      expect(spreads[i]).toBeLessThanOrEqual(spreads[i - 1]!);
    }
    expect(intervals[0]).toBeCloseTo(radarParams.nearInterval);
    expect(intervals.at(-1)).toBeCloseTo(radarParams.farInterval);
    // Whole rings right above them, narrow arcs far away.
    expect(spreads[0]).toBeCloseTo(Math.PI);
    expect(spreads.at(-1)).toBeCloseTo(radarParams.farSpread);
  });

  it('measures along the ground and words it', () => {
    expect(groundDistance({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, RADIUS)).toBeCloseTo((Math.PI / 2) * RADIUS);
    expect(groundDistance({ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, RADIUS)).toBe(0);
    expect(['right here', 'close', 'near', 'far'].map((_, i) => proximity([10, 100, 400, 2000][i]!))).toEqual(['right here', 'close', 'near', 'far']);
  });

  it("finds the herd with the nearest animal among its candidates, whichever way it roams", () => {
    const p = plan();
    const census = new HerdCensus(p, ground).finish();
    const pose: AnimalPose = { x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 1, cycle: 0, stride: 0, trot: 0, graze: 0, idle: 0 };
    const reach = 36 * 1.8 + 40;
    const species = census.herds[0]!.species;
    const out: typeof census.herds = [];
    const paths = new Map(census.herds.map((h) => [h.id, new HerdPath(p, ground, h, { hipHeight: 1 })]));
    for (const from of [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0.6, y: -0.48, z: 0.64 }]) {
      for (const t of [0, 500, 12345]) {
        // The true nearest animal of the species, every herd posed.
        let truth = Infinity;
        for (const h of census.herds) {
          if (h.species !== species) continue;
          for (let k = 0; k < h.count; k++) truth = Math.min(truth, groundDistance(from, paths.get(h.id)!.pose(k, t, pose), RADIUS));
        }
        candidateHerds(census.herds, species, from, RADIUS, reach, 4, out);
        expect(out.length).toBeGreaterThan(0);
        expect(out.every((h) => h.species === species)).toBe(true);
        let found = Infinity;
        for (const h of out) for (let k = 0; k < h.count; k++) found = Math.min(found, groundDistance(from, paths.get(h.id)!.pose(k, t, pose), RADIUS));
        expect(found).toBeCloseTo(truth, 6);
      }
    }
    expect(candidateHerds(census.herds, 99, { x: 1, y: 0, z: 0 }, RADIUS, reach, 4, out)).toEqual([]);
  });
});

describe('species tab', () => {
  it('words animals, plants and herd counts', () => {
    const p = plan();
    const grazer = p.species.find((s) => s.diet === 'herbivore')!;
    expect(describeAnimal(grazer)).toMatch(/^(Four|Six|Two)-legged grazer · (herds of \d+(–\d+)?|alone) · \d+\.\d m$/);
    expect(herdCountText(grazer, 0)).toBe('None found');
    expect(herdCountText(grazer, 3)).toMatch(/^3 (herds|seen)$/);
    expect(describePlant({ kind: 'largeBush', height: 3.14 } as never)).toBe('Large bush · 3.1 m tall');
  });
});

describe('the radar item', () => {
  it('is a switch in the Inventory, right after the beam, and the other tools are not', () => {
    const inventory = ITEMS.filter((i) => i.tab === 'inventory').map((i) => i.id);
    expect(inventory).toEqual(['abduct', 'radar']);
    expect(itemDef('radar').switch).toBe(true);
    for (const id of ['planetBuster', 'volcanoBomb', 'abduct'] as const) expect(itemDef(id).switch).toBeFalsy();
  });

  it('starts off and flips on and off', () => {
    const switches = new ItemSwitches();
    expect(switches.isOn('radar')).toBe(false);
    expect(switches.flip('radar')).toBe(true);
    expect(switches.isOn('radar')).toBe(true);
    expect(switches.flip('radar')).toBe(false);
    switches.set('radar', true);
    expect(switches.isOn('radar')).toBe(true);
  });
});
