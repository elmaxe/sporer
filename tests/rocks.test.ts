import { describe, expect, it } from 'vitest';
import {
  ROCK_CELL_SIZE,
  ROCK_DENSITY,
  ROCK_EXPONENT,
  ROCK_SHAPES,
  generateRockCell,
  planRocks,
  rockCellArea,
  rockGridSize,
  rockPatch,
  rockSize,
  type RockGround,
} from '../src/gen/rocks';
import { Rng } from '../src/gen/rng';

const R = 400;
const flat: RockGround = (_, rgb) => {
  if (rgb) rgb.splice(0, 3, 0.4, 0.35, 0.3);
  return R + 1;
};

// See docs/research/ground-rocks.md.
describe('ground rocks', () => {
  it('follow the power law N(>D) ∝ D^−b between their smallest and largest', () => {
    const min = 0.1;
    const max = 2.4;
    const rng = new Rng(5);
    const sizes = Array.from({ length: 200000 }, () => rockSize(rng.next(), min, max, ROCK_EXPONENT));
    for (const s of sizes) {
      expect(s).toBeGreaterThanOrEqual(min - 1e-12);
      expect(s).toBeLessThanOrEqual(max + 1e-9);
    }
    // Twice the size, 2^−b as many (well inside the range, where the truncation barely shows).
    const over = (d: number) => sizes.filter((s) => s > d).length;
    expect(over(0.2) / over(0.1)).toBeCloseTo(2 ** -ROCK_EXPONENT, 2);
    expect(rockSize(0, min, max, ROCK_EXPONENT)).toBeCloseTo(min, 12);
    expect(rockSize(1, min, max, ROCK_EXPONENT)).toBeCloseTo(max, 9);
  });

  it('lie only on solid ground, more on bare rock than where plants and sand hide them', () => {
    expect(planRocks({ type: 'gas', seed: 1 }, R, null)).toBeNull();
    const barren = planRocks({ type: 'barren', seed: 1 }, R, null)!;
    const terran = planRocks({ type: 'terran', seed: 1 }, R, R)!;
    const small = planRocks({ type: 'barren', seed: 1, small: true }, R, null)!;
    expect(barren.density).toBeGreaterThan(terran.density);
    expect(small.density).toBeGreaterThan(barren.density);
    expect(ROCK_DENSITY.barren).toBe(1);
  });

  it('are as many in a cell as the mean density says, over many cells', () => {
    const plan = planRocks({ type: 'barren', seed: 3 }, R, null)!;
    const n = rockGridSize(R);
    let rocks = 0;
    let area = 0;
    for (let i = 0; i < n; i += 3) {
      for (let j = 0; j < n; j += 3) {
        rocks += generateRockCell(plan, flat, 2, i, j).length;
        area += rockCellArea(2, i, j, n, R);
      }
    }
    // The patches' mean density (sampled over the same cells) times the plan's.
    let patch = 0;
    let count = 0;
    const rng = new Rng(9);
    for (let k = 0; k < 20000; k++) {
      const v = [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)];
      const l = Math.hypot(v[0]!, v[1]!, v[2]!);
      patch += rockPatch(v[0]! / l, v[1]! / l, v[2]! / l, plan.seed);
      count++;
    }
    const expected = plan.density * area * (patch / count);
    expect(rocks / expected).toBeGreaterThan(0.75);
    expect(rocks / expected).toBeLessThan(1.33);
  });

  it('are the same whatever order the cells are made in, and stay in their cell', () => {
    const plan = planRocks({ type: 'lava', seed: 8 }, R, null)!;
    const a = generateRockCell(plan, flat, 4, 10, 12);
    generateRockCell(plan, flat, 0, 1, 1);
    const b = generateRockCell(plan, flat, 4, 10, 12);
    expect(b).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
    const n = rockGridSize(R);
    for (const r of a) {
      expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(1, 9);
      expect(r.z).toBeGreaterThan(0);
      expect(r.shape).toBeGreaterThanOrEqual(0);
      expect(r.shape).toBeLessThan(ROCK_SHAPES);
      expect(r.radius).toBe(R + 1);
      expect([r.r, r.g, r.b]).toEqual([0.4, 0.35, 0.3]);
    }
    // Cells are about ROCK_CELL_SIZE across.
    const side = Math.sqrt(rockCellArea(4, Math.floor(n / 2), Math.floor(n / 2), n, R));
    expect(side / ROCK_CELL_SIZE).toBeGreaterThan(0.7);
    expect(side / ROCK_CELL_SIZE).toBeLessThan(1.4);
  });

  it('are never made under the sea', () => {
    const plan = planRocks({ type: 'terran', seed: 2 }, R, R)!;
    const wet: RockGround = () => R - 0.5;
    for (let i = 0; i < 10; i++) expect(generateRockCell(plan, wet, 1, i, i)).toEqual([]);
  });
});
