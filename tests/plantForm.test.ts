import { describe, expect, it } from 'vitest';
import { BRANCH_EXPONENT, GOLDEN_ANGLE, SINK, architectureFor, envelopeReach, generateForm, growPlant, type LeafMass, type PlantSkeleton } from '../src/gen/plantForm';
import { planPlants, TREE_CROWN_WIDTH, type PlantSpecies } from '../src/gen/plants';
import { Rng } from '../src/gen/rng';
import { FADE_START, PLANT_LODS, fadeWindow, lodAt } from '../src/surface/plantLook';
import { FAR_VIEW_ELEVATION, PLANT_LOD_COUNT, SHADOW_SHARE, buildPlantMesh, coneShadow, layerCone, mergeLeaves, shadow } from '../src/surface/plantMesh';
import { coverageCount, silhouette } from './silhouette';

/** Every species of tiers 1–3 over `seeds` planets. */
function manySpecies(seeds = 30): PlantSpecies[] {
  const out: PlantSpecies[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    for (const tier of [1, 2, 3] as const) {
      out.push(...planPlants({ seed, tier, temperature: 288, water: 0.7, radius: 400, peak: 420 })!.species);
    }
  }
  return out;
}

const colors = (s: PlantSpecies) => ({ bark: s.trunkColor, leaf: s.leafColor, leaf2: s.form.leafColor2, accent: s.form.accentColor });
const species = manySpecies();
const byArch = (a: string) => species.filter((s) => s.form.architecture === a);

describe('plant forms', () => {
  it('give every kind of plant a form, trees of three architectures and bushes as shrubs', () => {
    const archs = new Set(species.map((s) => `${s.kind}:${s.form.architecture}`));
    for (const a of ['tree:conifer', 'tree:broadleaf', 'tree:palm', 'largeBush:shrub', 'smallBush:shrub']) expect(archs).toContain(a);
    expect([...archs].every((a) => a.startsWith('tree:') !== a.endsWith(':shrub'))).toBe(true);
    // Conifers for pointed crowns, broadleaves and palms for round ones.
    const rng = new Rng(3);
    for (let i = 0; i < 50; i++) {
      expect(architectureFor(true, 'cone', rng)).toBe('conifer');
      expect(['broadleaf', 'palm']).toContain(architectureFor(true, 'ball', rng));
      expect(architectureFor(false, 'ball', rng)).toBe('shrub');
    }
  });

  it('are deterministic, and a species grows the same skeleton every time', () => {
    const a = planPlants({ seed: 9, tier: 3, temperature: 288, water: 0.7, radius: 400, peak: 420 })!;
    const b = planPlants({ seed: 9, tier: 3, temperature: 288, water: 0.7, radius: 400, peak: 420 })!;
    expect(a.species.map((s) => s.form)).toEqual(b.species.map((s) => s.form));
    for (const s of a.species) expect(JSON.stringify(growPlant(s))).toBe(JSON.stringify(growPlant({ ...s })));
  });

  it('size tree crowns by architecture (broadleaf 0.6–1.1 of the height across, as open-grown trees)', () => {
    for (const s of species.filter((x) => x.kind === 'tree')) {
      const [lo, hi] = TREE_CROWN_WIDTH[s.form.architecture as 'conifer' | 'broadleaf' | 'palm'];
      const width = (2 * s.crownRadius) / s.height;
      expect(width).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(width).toBeLessThanOrEqual(hi + 1e-9);
    }
  });
});

describe('growing a plant', () => {
  it('fills its envelope: as tall as the species and its crown as wide', () => {
    for (const s of species) {
      const k = growPlant(s);
      expect(k.top / s.height).toBeCloseTo(1, 2);
      expect(k.crown / s.crownRadius).toBeCloseTo(1, 2);
      expect(k.sink).toBeCloseTo(SINK * s.height, 6);
    }
  });

  it('plants every stem in the ground or on its parent', () => {
    for (const s of species.slice(0, 60)) {
      const k = growPlant(s);
      for (const stem of k.stems) {
        if (stem.parent < 0) {
          expect(stem.points[0]![1]).toBeCloseTo(-SINK * s.height, 6);
          continue;
        }
        // Its base lies on its parent's polyline (within the parent's radius).
        const parent = k.stems[stem.parent]!;
        const p = stem.points[0]!;
        let best = Infinity;
        for (let i = 0; i + 1 < parent.points.length; i++) best = Math.min(best, segmentDistance(p, parent.points[i]!, parent.points[i + 1]!));
        expect(best).toBeLessThan(Math.max(...parent.radii) + 1e-6);
      }
    }
  });

  it("shares a stem's cross-section among its branches (Leonardo's rule)", () => {
    // A thick trunk, so no branch is held at the thinnest radius.
    const s = { ...byArch('broadleaf')[0]!, trunkWidth: 0.08 };
    const k = growPlant(s);
    const trunk = k.stems[0]!;
    const branches = k.stems.filter((x) => x.parent === 0);
    const lost = trunk.radii[0]! ** BRANCH_EXPONENT - trunk.radii[trunk.radii.length - 1]! ** BRANCH_EXPONENT;
    const given = branches.reduce((sum, b) => sum + b.radii[0]! ** BRANCH_EXPONENT, 0);
    expect(given / lost).toBeGreaterThan(0.6);
    expect(given / lost).toBeLessThanOrEqual(1.0001);
  });

  it('turns successive conifer branches by the golden angle', () => {
    const k = growPlant({ ...byArch('conifer')[0]!, form: { ...byArch('conifer')[0]!.form, gnarl: 0, lean: 0 } });
    const azimuths = k.stems.filter((x) => x.order === 1).map((b) => Math.atan2(b.points[1]![2] - b.points[0]![2], b.points[1]![0] - b.points[0]![0]));
    let close = 0;
    for (let i = 1; i < azimuths.length; i++) {
      const turn = (((azimuths[i]! - azimuths[i - 1]!) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      // Either way round (the frame's handedness decides which).
      if (Math.min(Math.abs(turn - GOLDEN_ANGLE), Math.abs(turn - (2 * Math.PI - GOLDEN_ANGLE))) < 0.35) close++;
    }
    expect(close / (azimuths.length - 1)).toBeGreaterThan(0.8);
  });

  it('gives tiered crowns layers, and palms fronds instead of leaf masses', () => {
    const tiered = species.find((s) => s.form.architecture === 'conifer' && s.crown === 'tiers')!;
    const layers = new Set(growPlant(tiered).leaves.map((l) => l.tier));
    expect(layers.size).toBe(Math.round(tiered.form.tiers));
    const palm = growPlant(byArch('palm')[0]!);
    expect(palm.fronds.length).toBe(Math.round(byArch('palm')[0]!.form.branches));
    expect(palm.leaves.length).toBe(0);
    expect(envelopeReach('cone', 0)).toBeGreaterThan(envelopeReach('cone', 0.9));
    expect(envelopeReach('ball', 0.5)).toBeCloseTo(1, 6);
  });

  it('turns a form drawn for another architecture into a working plant', () => {
    for (const arch of ['conifer', 'broadleaf', 'palm', 'shrub'] as const) {
      for (const s of species.slice(0, 12)) {
        const k = growPlant({ ...s, form: generateForm(new Rng(s.form.seed), arch, 120) });
        expect(k.top).toBeCloseTo(s.height, 2);
        for (let lod = 0; lod < PLANT_LOD_COUNT; lod++) expect(buildPlantMesh(k, colors(s), lod).triangles).toBeGreaterThan(0);
      }
    }
  });
});

function segmentDistance(p: number[], a: number[], b: number[]): number {
  const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const ap = [p[0]! - a[0]!, p[1]! - a[1]!, p[2]! - a[2]!];
  const t = Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / (ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2 || 1)));
  return Math.hypot(ap[0]! - ab[0]! * t, ap[1]! - ab[1]! * t, ap[2]! - ab[2]! * t);
}

describe('plant meshes and levels of detail', () => {
  const meshes = new Map<PlantSpecies, ReturnType<typeof buildPlantMesh>[]>();
  const meshesOf = (s: PlantSpecies) => {
    let m = meshes.get(s);
    if (!m) meshes.set(s, (m = Array.from({ length: PLANT_LOD_COUNT }, (_, lod) => buildPlantMesh(growPlant(s), colors(s), lod))));
    return m;
  };

  it('are finite, coloured per vertex in linear RGB, and get cheaper at every level', () => {
    for (const s of species) {
      const m = meshesOf(s);
      for (const mesh of m) {
        expect(mesh.positions.length).toBe(mesh.triangles * 9);
        expect(mesh.colors.length).toBe(mesh.positions.length);
        expect(mesh.positions.every(Number.isFinite)).toBe(true);
        expect(mesh.colors.every((c) => c >= 0 && c <= 1.2)).toBe(true);
      }
      for (let lod = 1; lod < PLANT_LOD_COUNT; lod++) expect(m[lod]!.triangles).toBeLessThanOrEqual(m[lod - 1]!.triangles);
      expect(m[PLANT_LOD_COUNT - 1]!.triangles).toBeLessThan(m[0]!.triangles / 4);
    }
  });

  it('keep to triangle budgets that match how many plants each level draws', () => {
    // Mean triangles per level of detail, by kind: each next level covers several times the ground of the one before.
    const budgets: Record<string, number[]> = { tree: [900, 220, 80, 70], largeBush: [600, 140, 40, 30], smallBush: [320, 110, 40, 30] };
    for (const kind of ['tree', 'largeBush', 'smallBush'] as const) {
      const list = species.filter((s) => s.kind === kind);
      for (let lod = 0; lod < PLANT_LOD_COUNT; lod++) {
        const mean = list.reduce((sum, s) => sum + meshesOf(s)[lod]!.triangles, 0) / list.length;
        expect(mean, `${kind} LOD ${lod}`).toBeLessThan(budgets[kind]![lod]!);
      }
    }
  });

  it("keep the full plant's silhouette at every level, from the angles each is seen at", () => {
    // Median coverage of each level against the full plant, per architecture: from the side for all
    // levels, from above for the leaf-mass levels; far crowns are sized for a low view (FAR_VIEW_ELEVATION).
    const e = FAR_VIEW_ELEVATION;
    const views: Record<string, [number, number, number]> = { side: [0, 0, -1], top: [0, -1, 0], far: [-Math.cos(e) * 0.6, -Math.sin(e), -Math.cos(e) * 0.8] };
    for (const arch of ['conifer', 'broadleaf', 'palm', 'shrub']) {
      const list = byArch(arch).slice(0, 30);
      for (let lod = 1; lod < PLANT_LOD_COUNT; lod++) {
        for (const [name, dir] of Object.entries(views)) {
          if (name === 'top' && arch === 'conifer' && lod >= 2) continue;
          const ratios = list.map((s) => {
            const m = meshesOf(s);
            const size = Math.max(s.height, 2 * s.crownRadius) * 1.4;
            const centre: [number, number, number] = [0, s.height / 2, 0];
            return coverageCount(silhouette(m[lod]!.positions, dir, size, 48, centre)) / coverageCount(silhouette(m[0]!.positions, dir, size, 48, centre));
          });
          ratios.sort((a, b) => a - b);
          const median = ratios[Math.floor(ratios.length / 2)]!;
          expect(median, `${arch} LOD ${lod} ${name}`).toBeGreaterThan(0.75);
          expect(median, `${arch} LOD ${lod} ${name}`).toBeLessThan(1.3);
        }
      }
    }
  });

  it("size an octahedron to cover what an icosahedron does (Cauchy's mean shadow)", () => {
    // Mean projected area of the unit polyhedra over many directions, against SHADOW_SHARE × π.
    const leaf: LeafMass = { kind: 'blob', centre: [0, 0, 0], axes: [[0, 1, 0], [1, 0, 0], [0, 0, -1]], radii: [1, 1, 1], stem: 0, tier: 0, shade: 0 };
    const skeleton: PlantSkeleton = { architecture: 'shrub', stems: [], leaves: [leaf], fronds: [], accents: [], sink: 0, top: 1, crown: 1, reach: 1 };
    const c = { bark: '#000000', leaf: '#00ff00', leaf2: '#00ff00', accent: '#ff0000' };
    const ico = buildPlantMesh(skeleton, c, 2); // one crown: an icosahedron
    const octa = buildPlantMesh(skeleton, c, 3); // far: an octahedron, grown to match
    const rng = new Rng(5);
    let a = 0;
    let b = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const z = rng.range(-1, 1);
      const t = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(1 - z * z);
      const dir: [number, number, number] = [r * Math.cos(t), z, r * Math.sin(t)];
      const cell = (4 / 160) ** 2;
      a += coverageCount(silhouette(ico.positions, dir, 4, 160)) * cell;
      b += coverageCount(silhouette(octa.positions, dir, 4, 160)) * cell;
    }
    // The jitter makes each a little bigger or smaller; the shares hold to a few per cent.
    expect(a / n / Math.PI / SHADOW_SHARE.ico).toBeCloseTo(1, 1);
    expect(b / a).toBeCloseTo(1, 1);
  });

  it('give a cone the shadow its closed form says, and merged leaves the area they covered', () => {
    for (const [r, h, deg] of [[1, 3, 20], [1, 3, 60], [2, 1, 10], [1, 4, 0]] as const) {
      const e = (deg * Math.PI) / 180;
      // A fine cone as triangles, and its shadow seen from elevation e.
      const pos: number[] = [];
      const sides = 256;
      for (let k = 0; k < sides; k++) {
        const t0 = (k / sides) * Math.PI * 2;
        const t1 = ((k + 1) / sides) * Math.PI * 2;
        pos.push(Math.cos(t0) * r, 0, Math.sin(t0) * r, Math.cos(t1) * r, 0, Math.sin(t1) * r, 0, h, 0);
        pos.push(Math.cos(t0) * r, 0, Math.sin(t0) * r, 0, 0, 0, Math.cos(t1) * r, 0, Math.sin(t1) * r);
      }
      const size = 2 * Math.max(r, h) + 1;
      const dir: [number, number, number] = [0, -Math.sin(e), -Math.cos(e)];
      const area = coverageCount(silhouette(new Float32Array(pos), dir, size, 400, [0, h / 2, 0])) * (size / 400) ** 2;
      expect(coneShadow(r, h, e) / area).toBeCloseTo(1, 1);
    }
    // Merging keeps the area seen from above; a layer's cone keeps the area seen from low down.
    const conifer = growPlant(byArch('conifer')[0]!);
    const top = shadow(conifer.leaves, [0, -1, 0]).area;
    const merged = mergeLeaves(conifer.leaves);
    expect(shadow([merged], [0, -1, 0]).area / top).toBeCloseTo(1, 1);
    const cone = layerCone(conifer.leaves, 7);
    expect(cone.hi).toBeGreaterThan(cone.lo);
    expect(cone.radius).toBeGreaterThan(0);
  });
});

describe('choosing a level of detail', () => {
  it('fades each level into the next and the last into nothing, never leaving a gap or drawing two at full', () => {
    for (const ranges of Object.values(PLANT_LODS)) {
      expect(ranges.length).toBe(PLANT_LOD_COUNT);
      for (let i = 1; i < ranges.length; i++) expect(ranges[i]! * FADE_START).toBeGreaterThan(ranges[i - 1]!);
      // The shader's weights: w_k = 1 − smoothstep over level k's far fade. Each level keeps the band [w_(k−1), w_k).
      const w = (lod: number, d: number) => {
        const [a, b] = fadeWindow(ranges, lod);
        const t = Math.min(1, Math.max(0, (d - a) / (b - a)));
        return 1 - t * t * (3 - 2 * t);
      };
      for (let d = 0; d < ranges[ranges.length - 1]! * 1.1; d += 0.25) {
        let covered = 0;
        for (let lod = 0; lod < ranges.length; lod++) {
          const band = w(lod, d) - (lod === 0 ? 0 : w(lod - 1, d));
          expect(band).toBeGreaterThanOrEqual(-1e-9);
          covered += band;
        }
        expect(covered).toBeCloseTo(w(ranges.length - 1, d), 9);
        const at = lodAt(ranges, d, { lod: 0, fade: 0 });
        if (at.lod < ranges.length) expect(d).toBeLessThan(ranges[at.lod]!);
      }
      expect(lodAt(ranges, 0, { lod: 9, fade: 9 })).toEqual({ lod: 0, fade: 0 });
      expect(lodAt(ranges, ranges[ranges.length - 1]! + 1, { lod: 0, fade: 0 }).lod).toBe(ranges.length);
    }
  });
});
