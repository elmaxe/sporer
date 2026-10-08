import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../src/gen/galaxy';
import {
  GRASS_HEIGHT,
  GRASS_R,
  GRASS_RADIUS,
  GRASS_SPACING,
  GRASS_STRIDE,
  GRASS_TALL,
  GRASS_X,
  GRASS_Y,
  GRASS_Z,
  generateGrassCell,
  grassDensity,
  grassGridSize,
  planGrass,
  type GrassGround,
  type GrassInput,
} from '../src/gen/grass';
import { MIN_ELEVATION } from '../src/gen/plants';
import { generateSystem } from '../src/gen/system';
import { grassSetup } from '../src/surface/grassSetup';

const R = 400;
const PEAK = R * 1.08;
const input: GrassInput = { seed: 7, tier: 3, temperature: 288, water: 0.6, radius: R, peak: PEAK, sea: true, lush: [0.05, 0.2, 0.04], dry: [0.4, 0.35, 0.15] };
/** Flat ground a fifth of the way up the relief, green. */
const meadow: GrassGround = (_, rgb) => {
  if (rgb) rgb.splice(0, 3, 0.1, 0.3, 0.08);
  return R + (PEAK - R) * 0.2;
};

describe('grass', () => {
  it('grows only where plants do (a habitable tier), sparser on dry worlds', () => {
    expect(planGrass({ ...input, tier: 0 })).toBeNull();
    const wet = planGrass(input)!;
    const dry = planGrass({ ...input, water: 0 })!;
    const sparse = planGrass({ ...input, tier: 1 })!;
    expect(dry.cover).toBeLessThan(wet.cover);
    expect(sparse.cover).toBeLessThan(wet.cover);
  });

  it('leaves the beach, steep rock, the mountain tops and snow bare', () => {
    const plan = planGrass(input)!;
    const lat = 0.2;
    expect(grassDensity(plan, 0.2, 0, lat, 0.7)).toBeGreaterThan(0.8);
    expect(grassDensity(plan, MIN_ELEVATION, 0, lat, 0.7)).toBe(0);
    expect(grassDensity(plan, 0.2, 0.3, lat, 0.7)).toBe(0);
    expect(grassDensity(plan, 0.8, 0, lat, 0.7)).toBe(0);
    // Near the pole it's below freezing all year.
    expect(grassDensity(plan, 0.2, 0, 1.4, 0.7)).toBe(0);
    // Thinner where the ground is poor, but not bare.
    expect(grassDensity(plan, 0.2, 0, lat, 0)).toBeGreaterThan(0);
    expect(grassDensity(plan, 0.2, 0, lat, 0)).toBeLessThan(grassDensity(plan, 0.2, 0, lat, 0.7));
  });

  it('stands on the ground, as dense as its spacing and cover allow, the same every time', () => {
    const plan = planGrass(input)!;
    const n = grassGridSize(R);
    const cell = generateGrassCell(plan, meadow, 1, Math.floor(n / 2), Math.floor(n / 3));
    expect(cell).toEqual(generateGrassCell(plan, meadow, 1, Math.floor(n / 2), Math.floor(n / 3)));
    const tufts = cell.length / GRASS_STRIDE;
    const candidates = (((R * Math.PI) / 2 / n) / GRASS_SPACING) ** 2;
    expect(tufts).toBeGreaterThan(candidates * 0.3);
    expect(tufts).toBeLessThanOrEqual(candidates * 1.2);
    for (let o = 0; o < cell.length; o += GRASS_STRIDE) {
      expect(Math.hypot(cell[o + GRASS_X]!, cell[o + GRASS_Y]!, cell[o + GRASS_Z]!)).toBeCloseTo(1, 5);
      expect(cell[o + GRASS_RADIUS]).toBeCloseTo(meadow({ x: 1, y: 0, z: 0 }), 4);
      expect(cell[o + GRASS_TALL]).toBeGreaterThan(GRASS_HEIGHT[0] * 0.5);
      expect(cell[o + GRASS_TALL]).toBeLessThanOrEqual(GRASS_HEIGHT[1]);
      // Green, from the ground's colour.
      expect(cell[o + GRASS_R + 1]).toBeGreaterThan(cell[o + GRASS_R]!);
    }
  });

  it('grows on a real green planet, quickly enough to load cells as the camera comes down', () => {
    const planets = generateGalaxy(1337).stars.slice(0, 60).flatMap((s) => generateSystem(s).planets);
    const green = planets.find((p) => (p.type === 'terran' || p.type === 'ocean') && p.climate && p.climate.habitability >= 2)!;
    const setup = grassSetup(green)!;
    expect(setup).not.toBeNull();
    const n = grassGridSize(setup.plan.radius);
    let tufts = 0;
    const start = performance.now();
    let cells = 0;
    for (let face = 0; face < 6; face++) {
      for (let k = 0; k < 8; k++, cells++) tufts += generateGrassCell(setup.plan, setup.ground, face, (k * 7) % n, (k * 13) % n).length / GRASS_STRIDE;
    }
    const perCell = (performance.now() - start) / cells;
    expect(tufts).toBeGreaterThan(0);
    // A few cells per frame inside the view's time budget (surface/GroundGrass.ts grassParams.budget), even in a slow test run.
    expect(perCell).toBeLessThan(6);
    // Gas giants, barren worlds and small bodies have none.
    expect(grassSetup(planets.find((p) => p.type === 'gas')!)).toBeNull();
    expect(grassSetup(planets.find((p) => p.type === 'barren')!)).toBeNull();
  });
});
