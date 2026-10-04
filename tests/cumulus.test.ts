import { describe, expect, it } from 'vitest';
import {
  BASE_STEPS,
  CLOUD_BASE,
  CLUSTER_MAX_DEPTH,
  CLUSTER_SPAN,
  CUMULUS_SHARE,
  MAX_PUFFS,
  PUFF_SHAPES,
  PUFF_TEXELS,
  TOWER_PUFFS,
  channelSlot,
  cloudiness,
  clusterBase,
  clusterCentre,
  clusterStrength,
  cumulusCluster,
  cumulusField,
  driftAt,
  drawnCover,
  hasCumulus,
  puffAtlas,
  spanOf,
  stormChannels,
  towerCluster,
  type GroundRadius,
} from '../src/gen/cumulus';
import { generateGalaxy } from '../src/gen/galaxy';
import { generateSystem } from '../src/gen/system';
import { stormEvent, weatherOf, type WeatherData } from '../src/gen/weather';
import { globeRadius } from '../src/planet/frame';

const RELIEF = 1.6;

/** Every body with weather in the default galaxy's first systems. */
const weathers: WeatherData[] = [];
for (const ref of generateGalaxy(1337).stars.slice(0, 150)) {
  for (const p of generateSystem(ref).planets) {
    for (const b of [p, ...p.moons]) {
      if (!b.climate) continue;
      const w = weatherOf(b, globeRadius(b.radius), RELIEF);
      if (w) weathers.push(w);
    }
  }
}
const puffy = weathers.filter(hasCumulus);
const earthLike = puffy.find((w) => w.kind === 'water' && w.storms.some((s) => s.kind === 'cell'))!;
const field = cumulusField(earthLike)!;

/** Bumpy ground: sea level plus hills up to 8% of the radius. */
const R = field.radius;
const ground: GroundRadius = (x, y, z) => R * (1 + 0.04 * (1 + Math.sin(7 * x + 3 * y) * Math.cos(5 * z)));
const gap = Math.max(CLOUD_BASE.min, CLOUD_BASE.fraction * R);

describe('puffy clouds', () => {
  it('belong to water and methane worlds only', () => {
    expect(puffy.length).toBeGreaterThan(10);
    for (const w of weathers) expect(hasCumulus(w)).toBe((w.kind === 'water' || w.kind === 'methane') && w.coverage > 0);
    for (const w of weathers) if (!hasCumulus(w)) expect(cumulusField(w)).toBeNull();
  });

  it('fit their puffs in the buffer and cover what the weather says', () => {
    for (const w of puffy) {
      const f = cumulusField(w)!;
      expect(f.clusters).toBeGreaterThan(0);
      // On average within the buffer, with the towers' room kept.
      expect(f.clusters * f.meanPuffs + TOWER_PUFFS * stormChannels(w)).toBeLessThanOrEqual(MAX_PUFFS * 1.02);
      expect(f.puff).toBeGreaterThan(0);
    }
    // More cover, more clusters (same body).
    const more = cumulusField({ ...earthLike, coverage: earthLike.coverage * 2 })!;
    expect(more.clusters * more.puff ** 2).toBeGreaterThan(1.9 * field.clusters * field.puff ** 2);
  });

  it('draws its share of the weather\'s cover, leaving clear sky', () => {
    for (const w of puffy.filter((w) => w.kind === 'water').slice(0, 5)) {
      const f = cumulusField(w)!;
      const flat: GroundRadius = () => w.radius;
      const cover = (drawnCover(f, 300, flat, 4000) + drawnCover(f, 1700, flat, 4000)) / 2;
      expect(cover).toBeGreaterThan(CUMULUS_SHARE * w.coverage * 0.65);
      expect(cover).toBeLessThan(CUMULUS_SHARE * w.coverage * 1.35);
      // Never a blanket: well under half the globe.
      expect(cover).toBeLessThan(0.35);
    }
  });

  it('draws cluster sizes from a power law: many small, a few big', () => {
    expect(spanOf(0)).toBeCloseTo(CLUSTER_SPAN[0], 6);
    expect(spanOf(1 - 1e-12)).toBeCloseTo(CLUSTER_SPAN[1], 3);
    const mid = (CLUSTER_SPAN[0] + CLUSTER_SPAN[1]) / 2;
    // Most clusters are smaller than the middle of the range.
    expect(spanOf(0.5)).toBeLessThan(mid);
    for (let u = 0; u < 1; u += 0.1) expect(spanOf(u + 0.05)).toBeGreaterThan(spanOf(u));
  });

  it('is deterministic per channel and slot', () => {
    const a = cumulusCluster(field, 3, 17, ground);
    const b = cumulusCluster(field, 3, 17, ground);
    expect(b).toEqual(a);
    expect(cumulusCluster(field, 4, 17, ground)).not.toEqual(a);
  });

  it('lives through its slot, billowing up and fading away', () => {
    for (let c = 0; c < 20; c++) {
      const t = 1234.5 + c * 7;
      const cl = cumulusCluster(field, c, channelSlot(field, c, t), ground);
      expect(cl.start).toBeLessThanOrEqual(t);
      expect(cl.start + cl.life).toBeGreaterThan(t);
      expect(clusterStrength(cl, cl.start)).toBe(0);
      expect(clusterStrength(cl, cl.start + cl.life)).toBe(0);
      expect(clusterStrength(cl, cl.start + cl.life * 0.45)).toBeCloseTo(1, 6);
      // The next slot's cluster starts as this one ends.
      const next = cumulusCluster(field, c, cl.slot + 1, ground);
      expect(next.start).toBeCloseTo(cl.start + cl.life, 6);
    }
  });

  it('keeps its base above the ground it drifts over, and its dome flat', () => {
    for (let c = 0; c < 40; c++) {
      const cl = cumulusCluster(field, c, 5, ground);
      expect(cl.bases.length).toBe(BASE_STEPS + 1);
      expect(cl.puffs.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < cl.puffs.length; i++) expect(cl.puffs[i]!.up).toBeGreaterThanOrEqual(cl.puffs[i - 1]!.up);
      for (const p of cl.puffs) {
        expect(p.up).toBeGreaterThan(0);
        expect(p.height).toBeGreaterThanOrEqual(0);
        expect(p.height).toBeLessThanOrEqual(1);
        expect(p.shape).toBeLessThan(PUFF_SHAPES);
      }
      // A dome no higher than CLUSTER_MAX_DEPTH puffs (plus the top puff's own radius).
      expect(cl.depth).toBeLessThanOrEqual((CLUSTER_MAX_DEPTH + 2) * field.puff);
      const d: [number, number, number] = [0, 0, 0];
      for (let k = 0; k <= 16; k++) {
        const t = cl.start + (cl.life * k) / 16;
        clusterCentre(cl, t, d);
        expect(clusterBase(cl, t)).toBeGreaterThanOrEqual(ground(d[0], d[1], d[2]) + gap - 1e-9);
      }
    }
  });

  it('drifts with the zonal winds: easterly in the tropics', () => {
    const tropics = [0, 0, 0] as [number, number, number];
    expect(driftAt(field, 0)).toBeLessThan(0);
    expect(driftAt(field, (55 * Math.PI) / 180)).toBeGreaterThan(0);
    const cl = cumulusCluster(field, 0, 3, ground);
    clusterCentre(cl, cl.start, tropics);
    const lon0 = Math.atan2(tropics[0], tropics[2]);
    clusterCentre(cl, cl.start + 10, tropics);
    const lon1 = Math.atan2(tropics[0], tropics[2]);
    expect(Math.sign(lon1 - lon0)).toBe(Math.sign(cl.drift));
  });

  it('gathers where the fronts are, clearer at ±30° on water worlds', () => {
    let equator = 0;
    let subtropics = 0;
    for (let i = 0; i < 2000; i++) {
      const lon = (i / 2000) * Math.PI * 2 * 7;
      for (const [lat, add] of [
        [0, (v: number) => (equator += v)],
        [Math.PI / 6, (v: number) => (subtropics += v)],
      ] as const) {
        const v = cloudiness(field, Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon), 0);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        add(v);
      }
    }
    expect(equator).toBeGreaterThan(subtropics);
  });

  it('builds thunderstorms as towers up to the cloud layer, with a wide anvil', () => {
    const spec = earthLike.storms.findIndex((s) => s.kind === 'cell');
    let towers = 0;
    for (let slot = 0; slot < 40 && towers < 5; slot++) {
      const e = stormEvent(earthLike, spec, 0, slot);
      if (!e) continue;
      towers++;
      const t = towerCluster(field, e, ground);
      expect(t.puffs.length).toBe(TOWER_PUFFS);
      expect(Math.max(...t.bases) + t.depth).toBeCloseTo(Math.max(field.top, Math.max(...t.bases) + field.puff * 3), 6);
      // The anvil (the top puffs) spreads wider than the stem (the bottom ones).
      const reach = (ps: typeof t.puffs) => Math.max(...ps.map((p) => Math.hypot(p.east, p.north)));
      expect(reach(t.puffs.slice(-10))).toBeGreaterThan(reach(t.puffs.slice(0, 10)));
      // Its strength follows the storm's, peaking at 1.
      expect(clusterStrength(t, e.start + e.life * 0.4)).toBeCloseTo(1, 6);
      expect(clusterStrength(t, e.end + 1)).toBe(0);
    }
    expect(towers).toBeGreaterThan(0);
  });
});

describe('the puff atlas', () => {
  const atlas = puffAtlas(7);
  const size = PUFF_TEXELS * 2;
  it('is four puffs, empty at their edges and dense in the middle', () => {
    expect(atlas.length).toBe(size * size);
    for (let s = 0; s < PUFF_SHAPES; s++) {
      const ox = (s % 2) * PUFF_TEXELS;
      const oy = Math.floor(s / 2) * PUFF_TEXELS;
      const at = (i: number, j: number) => atlas[(oy + j) * size + ox + i]!;
      for (let k = 0; k < PUFF_TEXELS; k++) {
        expect(at(k, 0)).toBe(0);
        expect(at(0, k)).toBe(0);
        expect(at(k, PUFF_TEXELS - 1)).toBe(0);
        expect(at(PUFF_TEXELS - 1, k)).toBe(0);
      }
      expect(at(PUFF_TEXELS / 2, PUFF_TEXELS / 2)).toBeGreaterThan(200);
    }
  });

  it('is the same for the same seed', () => {
    expect(puffAtlas(7)).toEqual(atlas);
    expect(puffAtlas(8)).not.toEqual(atlas);
  });
});
