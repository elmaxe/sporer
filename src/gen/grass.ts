import { faceGridPoint, type Vec3Like } from '../world/cubeSphereMath';
import type { Habitability } from './climate';
import { MIN_ELEVATION, fertility } from './plants';
import { Rng, hashSeed } from './rng';
import { groundTemperature, snowTemperature } from './terranGround';

/*
 * Grass: tufts of blades on a green world's ground, pure data (the view is
 * surface/GroundGrass.ts, low orbit only, close to the ground). Like the
 * rocks (gen/rocks.ts) they stand on cells of the cube-sphere grid, each
 * cell's tufts from the body's seed and the cell's address alone, so any patch
 * of ground can be made in any order.
 *
 * They grow where the ground look (world/groundLook.ts) paints vegetation:
 * above the beach, thinning out up the mountains, not on rock too steep for
 * plants nor under snow, thickest where the ground is lush (gen/plants.ts
 * fertility). Their colour is the ground's there, turned towards the lush
 * green or the dry grass of its palette, so from a little way off they melt
 * into the ground they stand on.
 *
 * Stylised sizes: a tuft is a few tenths of a unit tall (the UFO is about 4
 * across), big enough to read from the ship's lowest flight, as Spore's
 * planets drew their grass.
 */

/** Cells are about this many units across. */
export const GRASS_CELL_SIZE = 8;
/** Candidate tufts are about this far apart, inside a cell. */
export const GRASS_SPACING = 0.55;
/** A tuft's height range (units), before the ground's lushness. */
export const GRASS_HEIGHT = [0.5, 1.1] as const;
/** How much of the ground grass covers at the best fertility, by habitability tier. */
export const GRASS_COVER_PER_TIER: readonly number[] = [0, 0.45, 0.75, 1];
/** The ground is sampled on a lattice of this many steps across a cell; tufts take theirs from it. */
const LATTICE = 4;
/**
 * Where slopes go from grass to bare rock, as 1 − cos of the slope: the
 * ground look's default rock band (world/groundLook.ts groundParams
 * slopeFrom, slopeTo).
 */
const ROCK_SLOPE = [0.07, 0.2] as const;
/** Vegetation thins out between these shares of the relief, as the ground look's does. */
const VEGETATION_ELEVATION = [0.3, 0.75] as const;
/** Grass starts this far (share of the relief) above the beach's edge, so the sand stays bare. */
const BEACH_MARGIN = 0.012;

/** Floats per tuft in a cell's array. */
export const GRASS_STRIDE = 10;
/**
 * A tuft in a cell's array, at `k * GRASS_STRIDE`: unit direction x, y, z
 * from the centre (body frame), the ground's radius there, height, width,
 * turn about the up axis (radians), colour r, g, b (linear).
 */
export const GRASS_X = 0;
export const GRASS_Y = 1;
export const GRASS_Z = 2;
export const GRASS_RADIUS = 3;
export const GRASS_TALL = 4;
export const GRASS_WIDE = 5;
export const GRASS_YAW = 6;
export const GRASS_R = 7;
export const GRASS_G = 8;
export const GRASS_B = 9;

/** The grass of a body. */
export interface GrassPlan {
  readonly seed: number;
  /** Sea-level radius and the highest terrain's, units. */
  readonly radius: number;
  readonly peak: number;
  /** Whether it has a sea (and so a beach). */
  readonly sea: boolean;
  /** Mean surface temperature, K. */
  readonly temperature: number;
  /** Share of the ground covered at the best fertility (tier and water). */
  readonly cover: number;
  /** The palette's lush vegetation and dry grass (linear RGB) that tufts turn towards. */
  readonly lush: readonly [number, number, number];
  readonly dry: readonly [number, number, number];
}

export interface GrassInput {
  readonly seed: number;
  readonly tier: Habitability;
  readonly temperature: number;
  /** Surface water inventory, 0 to 1 (see ClimateState). */
  readonly water: number;
  readonly radius: number;
  readonly peak: number;
  readonly sea: boolean;
  readonly lush: readonly [number, number, number];
  readonly dry: readonly [number, number, number];
}

/**
 * The radius of the ground in unit direction `dir`; its colour (linear RGB)
 * into `rgb` when given.
 */
export type GrassGround = (dir: Vec3Like, rgb?: [number, number, number]) => number;

/** A body's grass, or null where nothing grows (tier 0). */
export function planGrass(input: GrassInput): GrassPlan | null {
  const cover = GRASS_COVER_PER_TIER[input.tier] ?? 0;
  if (!(cover > 0)) return null;
  // A dry world has sparser grass, as it has sparser plants (gen/plants.ts planPlants).
  const moisture = 0.55 + 0.45 * Math.sqrt(Math.min(1, Math.max(0, input.water)));
  return {
    seed: hashSeed(input.seed, 'grass'),
    radius: input.radius,
    peak: input.peak,
    sea: input.sea,
    temperature: input.temperature,
    cover: cover * moisture,
    lush: input.lush,
    dry: input.dry,
  };
}

/** Cells per cube face edge. */
export function grassGridSize(radius: number): number {
  return Math.max(1, Math.round((radius * Math.PI * 0.5) / GRASS_CELL_SIZE));
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** 0 to 1: how much grass the ground at (elevation, steepness, temperature, latitude, fertility) carries, relative to the plan's cover. */
export function grassDensity(plan: GrassPlan, elevation: number, steepness: number, lat: number, fert: number): number {
  if (plan.sea && elevation < MIN_ELEVATION + BEACH_MARGIN) return 0;
  const veg = 1 - smoothstep(VEGETATION_ELEVATION[0], VEGETATION_ELEVATION[1], elevation);
  if (veg <= 0) return 0;
  const rock = smoothstep(ROCK_SLOPE[0], ROCK_SLOPE[1], steepness);
  const snowT = snowTemperature(lat);
  const snow = smoothstep(snowT + 1.5, snowT - 3, groundTemperature(plan.temperature, lat, elevation));
  return veg * (1 - rock) * (1 - snow) * (0.25 + 0.75 * smoothstep(0.1, 0.55, fert));
}

const corner = { x: 0, y: 0, z: 0 };
const ground = { x: 0, y: 0, z: 0 };
const rgb: [number, number, number] = [0, 0, 0];

/**
 * The tufts of cell (`face`, `i`, `j`) on a grid of `grassGridSize`, packed
 * GRASS_STRIDE floats each: the ground sampled on a small lattice over the
 * cell (radius, colour, fertility), a jittered grid of candidates each kept
 * or not by `grassDensity` there. Deterministic, from the plan's seed and the
 * cell's address alone; every candidate draws the same random numbers
 * whether or not it's kept.
 */
export function generateGrassCell(plan: GrassPlan, sample: GrassGround, face: number, i: number, j: number): Float32Array {
  const R = plan.radius;
  const relief = Math.max(plan.peak - R, 1e-6);
  const n = grassGridSize(R);
  const L = LATTICE;
  const side = L + 1;
  const radii = new Float64Array(side * side);
  const colours = new Float64Array(side * side * 3);
  const fert = new Float64Array(side * side);
  const steep = new Float64Array(side * side);
  for (let b = 0; b <= L; b++) {
    for (let a = 0; a <= L; a++) {
      const k = b * side + a;
      const d = faceGridPoint(face, i + a / L, j + b / L, n, ground);
      radii[k] = sample(d, rgb);
      colours[k * 3] = rgb[0];
      colours[k * 3 + 1] = rgb[1];
      colours[k * 3 + 2] = rgb[2];
      fert[k] = fertility(d.x, d.y, d.z, plan.seed);
    }
  }
  // The cell's sides (units), from its corners.
  const c00 = { ...faceGridPoint(face, i, j, n, corner) };
  const c10 = { ...faceGridPoint(face, i + 1, j, n, corner) };
  const c01 = faceGridPoint(face, i, j + 1, n, corner);
  const angle = (p: Vec3Like, q: Vec3Like) => Math.acos(Math.min(1, p.x * q.x + p.y * q.y + p.z * q.z));
  const sideU = R * angle(c00, c10);
  const sideV = R * angle(c00, c01);
  // Steepness at each lattice point (1 − cos of the slope), from its neighbours' heights.
  const stepU = sideU / L;
  const stepV = sideV / L;
  for (let b = 0; b <= L; b++) {
    for (let a = 0; a <= L; a++) {
      const k = b * side + a;
      const du = (radii[b * side + Math.min(L, a + 1)]! - radii[b * side + Math.max(0, a - 1)]!) / (stepU * (Math.min(L, a + 1) - Math.max(0, a - 1)));
      const dv = (radii[Math.min(L, b + 1) * side + a]! - radii[Math.max(0, b - 1) * side + a]!) / (stepV * (Math.min(L, b + 1) - Math.max(0, b - 1)));
      steep[k] = 1 - 1 / Math.sqrt(1 + du * du + dv * dv);
    }
  }
  const lerp = (field: Float64Array, s: number, t: number, stride = 1, offset = 0) => {
    const x = s * L;
    const y = t * L;
    const a = Math.min(L - 1, Math.floor(x));
    const b = Math.min(L - 1, Math.floor(y));
    const fx = x - a;
    const fy = y - b;
    const v00 = field[(b * side + a) * stride + offset]!;
    const v10 = field[(b * side + a + 1) * stride + offset]!;
    const v01 = field[((b + 1) * side + a) * stride + offset]!;
    const v11 = field[((b + 1) * side + a + 1) * stride + offset]!;
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
  };

  const ku = Math.max(1, Math.round(sideU / GRASS_SPACING));
  const kv = Math.max(1, Math.round(sideV / GRASS_SPACING));
  const out = new Float32Array(ku * kv * GRASS_STRIDE);
  const rng = new Rng(plan.seed).fork('cell', face, i, j);
  let count = 0;
  for (let b = 0; b < kv; b++) {
    for (let a = 0; a < ku; a++) {
      const s = (a + rng.next()) / ku;
      const t = (b + rng.next()) / kv;
      const keepRoll = rng.next();
      const tallRoll = rng.next();
      const wideRoll = rng.next();
      const yaw = rng.range(0, Math.PI * 2);
      const shade = rng.range(0.88, 1.1);

      const r = lerp(radii, s, t);
      const f = lerp(fert, s, t);
      const dir = faceGridPoint(face, i + s, j + t, n, ground);
      const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      const density = grassDensity(plan, (r - R) / relief, lerp(steep, s, t), lat, f);
      if (keepRoll >= plan.cover * density) continue;
      const o = count * GRASS_STRIDE;
      out[o + GRASS_X] = dir.x;
      out[o + GRASS_Y] = dir.y;
      out[o + GRASS_Z] = dir.z;
      out[o + GRASS_RADIUS] = r;
      // Taller where it's lush and where it grows thick.
      const tall = (GRASS_HEIGHT[0] + (GRASS_HEIGHT[1] - GRASS_HEIGHT[0]) * tallRoll) * (0.7 + 0.3 * f) * (0.75 + 0.25 * density);
      out[o + GRASS_TALL] = tall;
      out[o + GRASS_WIDE] = tall * (1.1 + 0.6 * wideRoll);
      out[o + GRASS_YAW] = yaw;
      // The ground's colour, turned towards the lush green where it's fertile and the dry grass where it isn't.
      const lush = 0.45 * smoothstep(0.35, 0.75, f);
      const dry = 0.35 * (1 - smoothstep(0.15, 0.5, f));
      for (let c = 0; c < 3; c++) {
        let v = lerp(colours, s, t, 3, c);
        v += (plan.lush[c]! - v) * lush;
        v += (plan.dry[c]! - v) * dry;
        out[o + GRASS_R + c] = v * shade;
      }
      count++;
    }
  }
  return out.slice(0, count * GRASS_STRIDE);
}
