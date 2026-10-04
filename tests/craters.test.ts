import { describe, expect, it } from 'vitest';
import {
  EJECTA_REACH,
  SATURATION_SHARE,
  craterField,
  craterHeight,
  craterNoise,
  craterParams,
  craterShape,
  eachCrater,
  fineOctaves,
  profile,
  surfaceNoise,
  type CraterField,
} from '../src/gen/craters';
import { gameRadius, planetStyle, type PlanetStyle } from '../src/gen/planets';
import { detailedTerrain, terrainNoise } from '../src/gen/noise';
import { Rng } from '../src/gen/rng';

const barren: PlanetStyle = { sea: null, seaLevel: -1, low: '#333333', high: '#bbbbbb', relief: 0.055, craters: 1 };

/** Every crater of the field's first `octaves` octaves: centre, radius, freshness and octave. */
function allCraters(field: CraterField, octaves = field.octaves.length): number[][] {
  const out: number[][] = [];
  for (let k = 0; k < octaves; k++) eachCrater(field, k, (x, y, z, r, fresh) => out.push([x, y, z, r, fresh, k]));
  return out;
}

/** The craters' height at a point by summing over all of them: what craterHeight's cell lookup must match. */
function bruteHeight(field: CraterField, craters: number[][], p: [number, number, number], spacing = 0): number {
  let sum = 0;
  for (const [cx, cy, cz, r, fresh, k] of craters) {
    const o = field.octaves[k!]!;
    const weight = spacing > 0 ? Math.min(1, o.radius / spacing - 1) : 1;
    if (weight <= 0) continue;
    const d = Math.hypot(p[0] - cx!, p[1] - cy!, p[2] - cz!);
    if (d < r! * EJECTA_REACH) sum += weight * 2 * r! * fresh! * profile(o, d / r!);
  }
  return sum;
}

/** Unit directions, half of them crowded round the cube's edges and corners, where the faces' grids meet. */
function testPoints(n: number, seed: number): [number, number, number][] {
  const rng = new Rng(seed);
  const out: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    let p: [number, number, number] = [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)];
    if (i % 2) p = p.map((c, j) => (j === 2 ? c : Math.sign(c) * (0.85 + 0.15 * Math.abs(c)))) as [number, number, number];
    const l = Math.hypot(...p);
    out.push(p.map((c) => c / l) as [number, number, number]);
  }
  return out;
}

describe('crater field', () => {
  const radius = gameRadius(0.3);
  const field = craterField(42, barren, radius, 4)!;
  const craters = allCraters(field);

  it('finds exactly the craters a sum over all of them finds, across the faces’ edges and corners', () => {
    let touched = 0;
    for (const p of testPoints(400, 3)) {
      const brute = bruteHeight(field, craters, p);
      if (brute !== 0) touched++;
      expect(craterHeight(field, ...p)).toBeCloseTo(brute, 12);
    }
    // Most points lie in some crater's reach.
    expect(touched).toBeGreaterThan(200);
  });

  it('leaves out the craters too small for the sampling, fading them in', () => {
    const spacing = field.octaves[2]!.radius / 1.5;
    for (const p of testPoints(100, 4)) expect(craterHeight(field, ...p, 4, spacing)).toBeCloseTo(bruteHeight(field, craters, p, spacing), 12);
    // Sampled coarser than the biggest craters: none.
    for (const p of testPoints(20, 5)) expect(craterHeight(field, ...p, 4, 1)).toBe(0);
  });

  it('is the same for the same seed, and another for another seed', () => {
    const again = craterField(42, barren, radius, 4)!;
    const other = craterField(43, barren, radius, 4)!;
    const p = testPoints(50, 6);
    expect(p.map((q) => craterHeight(again, ...q))).toEqual(p.map((q) => craterHeight(field, ...q)));
    expect(p.map((q) => craterHeight(other, ...q))).not.toEqual(p.map((q) => craterHeight(field, ...q)));
  });

  it('holds N(>D) ∝ D^-2 at the chosen share of geometric saturation, spread evenly over the sphere', () => {
    const counts = field.octaves.map((_, k) => craters.filter((c) => c[5] === k).length);
    for (let k = 0; k < counts.length; k++) {
      // Gault's saturation 1.54 D^-2 per unit area, for D in [2r, 4r), over the sphere's 4π.
      const D = 2 * field.octaves[k]!.radius;
      const expected = SATURATION_SHARE * 1.54 * (D ** -2 - (2 * D) ** -2) * 4 * Math.PI;
      expect(counts[k]! / expected).toBeGreaterThan(0.85);
      expect(counts[k]! / expected).toBeLessThan(1.15);
    }
    // Even: each of the 6 cube-face directions' caps holds about a sixth of the smallest octave.
    const small = craters.filter((c) => c[5] === 3);
    const axes: [number, number, number][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.577, 0.577, 0.577], [-0.577, 0.577, -0.577], [0, -0.707, 0.707]];
    for (const a of axes) {
      const inCap = small.filter((c) => c[0]! * a[0] + c[1]! * a[1] + c[2]! * a[2] > Math.cos(0.5)).length;
      // A cap of half a radian holds (1 − cos 0.5) / 2 of the sphere.
      expect(inCap / small.length).toBeCloseTo((1 - Math.cos(0.5)) / 2, 1);
    }
    // Sizes within each octave's [r, 2r), and fresh ones rarer than worn.
    for (const c of craters) {
      const r = field.octaves[c[5]!]!.radius;
      expect(c[3]).toBeGreaterThanOrEqual(r);
      expect(c[3]).toBeLessThan(2 * r);
    }
    const fresh = craters.filter((c) => c[4]! > 0.75).length;
    expect(fresh).toBeLessThan(craters.length / 3);
  });

  it('has none without craters in the style', () => {
    expect(craterField(42, { ...barren, craters: 0 }, radius, 4)).toBeNull();
    expect(craterField(42, { ...barren, craters: undefined }, radius, 4)).toBeNull();
    expect(craterNoise(terrainNoise, { ...barren, craters: 0 }, 42, radius, false)).toBe(terrainNoise);
    const ice = planetStyle(new Rng(1), 'ice');
    expect(surfaceNoise({ seed: 42, style: ice, radius }, true)).toBe(detailedTerrain);
  });

  it('gives barren worlds and moons craters, and no other type', () => {
    for (let i = 0; i < 20; i++) {
      expect(planetStyle(new Rng(i), 'barren').craters).toBe(1);
      for (const type of ['lava', 'desert', 'terran', 'ocean', 'ice'] as const) expect(planetStyle(new Rng(i), type).craters ?? 0).toBe(0);
    }
  });

  it('digs into the terrain within its range, more octaves low down, fewer on smaller worlds', () => {
    const coarse = surfaceNoise({ seed: 42, style: barren, radius }, false);
    const fine = surfaceNoise({ seed: 42, style: barren, radius }, true);
    let differs = 0;
    for (const p of testPoints(300, 7)) {
      const n = fine(...p, 42);
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(1);
      if (Math.abs(coarse(...p, 42) - terrainNoise(...p, 42)) > 0.01) differs++;
    }
    expect(differs).toBeGreaterThan(30);
    expect(fineOctaves(gameRadius(0.06))).toBeLessThan(fineOctaves(gameRadius(1)));
    expect(fineOctaves(gameRadius(0.06))).toBeGreaterThanOrEqual(craterParams.coarseOctaves);
    expect(fineOctaves(gameRadius(1.5))).toBeLessThanOrEqual(craterParams.maxOctaves);
  });
});

describe('crater shapes', () => {
  // Shares of the diameter → km, on the Moon (transition 15 km).
  const moon = (D: number) => {
    const s = craterShape(D, 15);
    return { depth: s.depth * D, rim: s.rim * D, floor: 2 * s.floor * D, peak: s.peak * D };
  };

  it('matches measured lunar craters (docs/research/craters.md)', () => {
    // Moltke, 6.5 km: 1.30 km deep (Pike 1976).
    expect(moon(6.5).depth).toBeCloseTo(1.3, 1);
    // Linné, 2.22 km: 0.54–0.60 km deep, deeper than the mean law (0.44): within its scatter.
    expect(moon(2.22).depth).toBeGreaterThan(0.54 * 0.75);
    // Tycho, 85 km: 4.7 km deep, floor 48 km across, peak 2.4 km (Margot 1999): complex craters scatter ±20% round Pike's fits.
    expect(moon(85).depth / 4.7).toBeGreaterThan(0.8);
    expect(moon(85).floor / 2 / 48).toBeCloseTo(1, 1);
    expect(moon(85).peak / 2.4).toBeGreaterThan(0.65);
    // Copernicus, 93 km: 3.8 km deep (Pike 1976).
    expect(moon(93).depth / 3.8).toBeGreaterThan(0.9);
    expect(moon(93).depth / 3.8).toBeLessThan(1.15);
  });

  it('goes from bowls to shallower craters with floors and peaks, then basins without peaks', () => {
    const small = craterShape(3, 15);
    const mid = craterShape(60, 15);
    const basin = craterShape(400, 15);
    expect(small.floor).toBe(0);
    expect(small.peak).toBe(0);
    expect(small.depth).toBeCloseTo(0.2, 1);
    expect(mid.depth).toBeLessThan(small.depth / 2);
    expect(mid.floor).toBeGreaterThan(0.2);
    expect(mid.peak).toBeGreaterThan(0);
    expect(basin.peak).toBe(0);
    expect(basin.depth).toBeLessThan(mid.depth);
    // Smoothly: no jump in depth through the transition.
    for (let D = 5; D < 40; D += 0.5) expect(craterShape(D + 0.5, 15).depth * (D + 0.5)).toBeGreaterThan(craterShape(D, 15).depth * D);
  });

  it('turns complex at smaller sizes under stronger gravity (transition ∝ 1/g)', () => {
    // Mars and Mercury's transition from the Moon's by 1/g: ~6.6 km. A 10 km crater there is shallower than on the Moon.
    expect(craterShape(10, 6.6).depth).toBeLessThan(craterShape(10, 15).depth);
    expect(craterShape(10, 6.6).floor).toBeGreaterThan(craterShape(10, 15).floor);
  });

  it('has a profile that sinks to the floor inside, crests at the rim and thins out to nothing', () => {
    const o = craterShape(40, 15);
    expect(profile(o, 0.1)).toBeLessThan(0);
    expect(profile(o, 1)).toBeCloseTo(o.rim, 9);
    expect(profile(o, 1.0001)).toBeCloseTo(o.rim, 3);
    expect(profile(o, 1.5)).toBeLessThan(o.rim / 2);
    expect(profile(o, 1.5)).toBeGreaterThan(0);
    expect(profile(o, EJECTA_REACH)).toBe(0);
    expect(profile(o, EJECTA_REACH - 1e-6)).toBeCloseTo(0, 6);
    // The floor is flat out to its edge, then rises.
    expect(profile(o, 0.3)).toBeCloseTo(profile(o, o.floor * 0.99), 9);
    expect(profile(o, (1 + o.floor) / 2)).toBeGreaterThan(profile(o, o.floor));
  });

  it('exaggerates craters as much as the relief, never past a fresh bowl', () => {
    // A Moon-sized, Moon-gravity body with the Moon's real relief (1.147%) is drawn true to scale.
    const moonRadius = gameRadius(1737.15 / 6371);
    const field = craterField(1, { ...barren, relief: 19.92 / 1737.15 }, moonRadius, 4, 1.62 / 9.80665)!;
    for (const o of field.octaves) {
      const D = 2 * o.radius * Math.SQRT2 * 1737.15;
      expect(o.depth).toBeCloseTo(craterShape(D, 15).depth, 6);
    }
    // Ten times the relief: ten times as deep, up to d/D 0.2.
    const steep = craterField(1, { ...barren, relief: (10 * 19.92) / 1737.15 }, moonRadius, 4, 1.62 / 9.80665)!;
    for (let k = 0; k < 4; k++) expect(steep.octaves[k]!.depth).toBeCloseTo(Math.min(0.2, 10 * field.octaves[k]!.depth), 6);
  });
});
