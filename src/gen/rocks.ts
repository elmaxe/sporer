import { faceGridPoint, type Vec3Like } from '../world/cubeSphereMath';
import { terrainNoise } from './noise';
import type { MoonType, PlanetType } from './planets';
import { Rng, hashSeed } from './rng';

/*
 * Ground clutter: the loose rocks and boulders lying on a solid body's
 * ground, pure data (the view is surface/GroundRocks.ts, low orbit only, near
 * the ground). Like the plants (gen/plants.ts) they stand on cells of the
 * cube-sphere grid, each cell's rocks from the body's seed and the cell's
 * address alone, so any patch of ground can be made in any order.
 *
 * Sizes follow the power law that boulder counts on the Moon, Mars and the
 * small bodies share, N(>D) ∝ D^−b, and the number per area at the smallest
 * size drawn is a lunar mare's, scaled per kind of world (see
 * docs/research/ground-rocks.md). Lengths in the planet level's units, at
 * the sea waves' stylised scale (world/seaWaves.ts waveParams.metresPerUnit:
 * the UFO as a 40 m saucer), so a boulder looks the size next to the UFO it
 * would next to a ship that big.
 */

/** Metres per planet-level unit for the rocks' sizes (the waves' stylised scale, see world/seaWaves.ts). */
export const ROCK_METRES_PER_UNIT = 10;
/** The smallest rock made and the largest, metres. */
export const ROCK_SIZE_METRES = [1, 24] as const;
/**
 * Cumulative size–frequency exponent b of N(>D) ∝ D^−b for metre-sized
 * boulders: see docs/research/ground-rocks.md.
 */
export const ROCK_EXPONENT = 2.9;
/**
 * Rocks of at least the smallest size per square metre on a bouldery plain
 * at density 1 (see ROCK_DENSITY): see docs/research/ground-rocks.md.
 */
export const ROCKS_PER_M2 = 4e-3;
/** How rocky each kind of world is, relative to a bare airless plain (stylised: plants, soil, sand and ice hide them). */
export const ROCK_DENSITY: Readonly<Record<PlanetType | MoonType | 'small', number>> = {
  barren: 1,
  lava: 0.8,
  small: 1.4,
  desert: 0.45,
  ice: 0.3,
  terran: 0.2,
  ocean: 0.2,
  gas: 0,
};
/** Cells are about this many units across. */
export const ROCK_CELL_SIZE = 12;
/** Boulder fields: rocks gather in patches of this scale (in body radii⁻¹ of the noise) and thin out between them. */
const PATCH_FREQUENCY = 9;
/** Patches range from this share of the mean density to the most (stylised). */
const PATCH_RANGE = [0.15, 2.2] as const;
/** How many kinds of rock shape the view has (each rock picks one). */
export const ROCK_SHAPES = 4;

/** The rocks of a body. */
export interface RockPlan {
  seed: number;
  /** Sea-level radius, planet units. */
  radius: number;
  /** The sea's radius (rocks under it aren't made), or null for none. */
  sea: number | null;
  /** Rocks of at least `minSize` per square unit, on average. */
  density: number;
  /** Smallest and largest rock, units (the longest side). */
  minSize: number;
  maxSize: number;
  exponent: number;
}

/** One rock. */
export interface RockData {
  /** Unit direction from the centre (body frame), and the ground's radius there. */
  x: number;
  y: number;
  z: number;
  radius: number;
  /** Longest side, units. */
  size: number;
  /** Height over the longest side (rocks lie flat), and the middle side's share. */
  flat: number;
  wide: number;
  /** Which shape (0 to ROCK_SHAPES − 1), its turn about the up axis, and a lean (radians) about a random axis. */
  shape: number;
  yaw: number;
  lean: number;
  leanAxis: number;
  /** Colour: the ground's there, darkened or lightened by this factor. */
  shade: number;
  /** The ground's colour where it lies (linear RGB). */
  r: number;
  g: number;
  b: number;
}

/** What a body needs for its rocks. */
export interface RockBody {
  type: PlanetType | MoonType;
  seed: number;
  /** An irregular small body (asteroid or comet nucleus): rubble everywhere. */
  small?: boolean;
}

/**
 * The radius of the ground in unit direction `dir`; its colour (linear RGB)
 * into `rgb` when given.
 */
export type RockGround = (dir: Vec3Like, rgb?: [number, number, number]) => number;

/** A body's rocks, or null for none (gas giants). `radius` is its sea-level radius in planet units, `sea` its sea's, if any. */
export function planRocks(body: RockBody, radius: number, sea: number | null): RockPlan | null {
  const share = body.small ? ROCK_DENSITY.small : ROCK_DENSITY[body.type];
  if (!(share > 0)) return null;
  const minSize = ROCK_SIZE_METRES[0] / ROCK_METRES_PER_UNIT;
  const metresPerUnit2 = ROCK_METRES_PER_UNIT * ROCK_METRES_PER_UNIT;
  return {
    seed: hashSeed(body.seed, 'rocks'),
    radius,
    sea,
    density: ROCKS_PER_M2 * metresPerUnit2 * share,
    minSize,
    maxSize: ROCK_SIZE_METRES[1] / ROCK_METRES_PER_UNIT,
    exponent: ROCK_EXPONENT,
  };
}

/** Cells per cube face edge. */
export function rockGridSize(radius: number): number {
  return Math.max(1, Math.round((radius * Math.PI * 0.5) / ROCK_CELL_SIZE));
}

/**
 * A size from the truncated power law N(>D) ∝ D^−b on [min, max], at
 * cumulative share `u` (0 to 1): the inverse of its distribution.
 */
export function rockSize(u: number, min: number, max: number, b: number): number {
  const tail = Math.pow(min / max, b);
  return min * Math.pow(1 - u * (1 - tail), -1 / b);
}

/** How rocky the ground is at unit direction (x, y, z), relative to the mean: boulder fields and bare stretches. */
export function rockPatch(x: number, y: number, z: number, seed: number): number {
  const f = PATCH_FREQUENCY;
  const n = terrainNoise(x * f, y * f, z * f, seed ^ 0x2c1b);
  const t = Math.min(1, Math.max(0, 0.5 + 0.7 * n));
  return PATCH_RANGE[0] + (PATCH_RANGE[1] - PATCH_RANGE[0]) * t * t;
}

const corner = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
];

/** Area of cell (`face`, `i`, `j`) of an `n` × `n` grid on a sphere of `radius`, square units. */
export function rockCellArea(face: number, i: number, j: number, n: number, radius: number): number {
  const a = faceGridPoint(face, i, j, n, corner[0]!);
  const b = faceGridPoint(face, i + 1, j, n, corner[1]!);
  const c = faceGridPoint(face, i + 1, j + 1, n, corner[2]!);
  const d = faceGridPoint(face, i, j + 1, n, corner[3]!);
  const ux = c.x - a.x;
  const uy = c.y - a.y;
  const uz = c.z - a.z;
  const vx = d.x - b.x;
  const vy = d.y - b.y;
  const vz = d.z - b.z;
  return 0.5 * radius * radius * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

const spot = { x: 0, y: 0, z: 0 };
const rgb: [number, number, number] = [0, 0, 0];

/**
 * The rocks of cell (`face`, `i`, `j`) on a grid of `rockGridSize`: as many
 * candidates as the densest patch would hold, each kept by the patch
 * density where it falls and left out under the sea. Deterministic from the
 * plan's seed and the cell's address; every candidate draws the same random
 * numbers whether or not it's kept, so a rock doesn't move when the rules
 * round it change.
 */
export function generateRockCell(plan: RockPlan, ground: RockGround, face: number, i: number, j: number): RockData[] {
  const out: RockData[] = [];
  const n = rockGridSize(plan.radius);
  const area = rockCellArea(face, i, j, n, plan.radius);
  const rng = new Rng(plan.seed).fork('cell', face, i, j);
  // The densest patch's count, rounded by chance so the mean is right.
  const mean = plan.density * area * PATCH_RANGE[1];
  const count = Math.floor(mean) + (rng.next() < mean - Math.floor(mean) ? 1 : 0);
  for (let k = 0; k < count; k++) {
    const u = rng.next();
    const v = rng.next();
    const keep = rng.next();
    const size = rockSize(rng.next(), plan.minSize, plan.maxSize, plan.exponent);
    const flat = rng.range(0.4, 0.8);
    const wide = rng.range(0.6, 1);
    const shape = rng.int(0, ROCK_SHAPES - 1);
    const yaw = rng.range(0, Math.PI * 2);
    const lean = rng.range(0, 0.35);
    const leanAxis = rng.range(0, Math.PI * 2);
    const shade = rng.range(0.55, 1.05);
    const dir = faceGridPoint(face, i + u, j + v, n, spot);
    if (keep * PATCH_RANGE[1] >= rockPatch(dir.x, dir.y, dir.z, plan.seed)) continue;
    const r = ground(dir, rgb);
    if (plan.sea !== null && r <= plan.sea + 1e-6) continue;
    out.push({ x: dir.x, y: dir.y, z: dir.z, radius: r, size, flat, wide, shape, yaw, lean, leanAxis, shade, r: rgb[0], g: rgb[1], b: rgb[2] });
  }
  return out;
}
