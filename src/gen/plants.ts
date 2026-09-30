import { faceGridPoint, type Vec3Like } from '../world/cubeSphereMath';
import type { Habitability } from './climate';
import { hslToHex } from './color';
import { generateName } from './names';
import { terrainNoise } from './noise';
import { Rng } from './rng';

/*
 * Plants on habitable bodies (roadmap step 25): which species a planet has
 * (from its seed and habitability tier) and where they stand. Pure data, no
 * THREE: the view is in src/surface/. Placeholders for now: a species is a
 * handful of numbers (kind, height, crown, colours) that a later plant
 * designer will edit, not a generated tree.
 *
 * The ground is cut into cells on the cube sphere (the same faces as the
 * planet level's LOD, see world/cubeSphereMath.ts), and a cell's plants depend
 * only on the planet's seed and the cell's own address, so a cell is the same
 * on every visit and independent of its neighbours: the game generates the
 * ones near the camera and drops the rest.
 *
 * Real-world numbers (densities, temperature limits, latitude climate) are in
 * docs/research/plants.md. Sizes and spacing are stylised, in planet-level
 * units (the UFO is ~4 wide, an Earth-sized globe has radius 400).
 */

export type PlantKind = 'tree' | 'largeBush' | 'smallBush';
export type CrownShape = 'cone' | 'ball' | 'tiers';

export interface PlantKindInfo {
  /** Word for the tooltip. */
  readonly label: string;
  /** Height range of a species of this kind, in planet-level units. */
  readonly height: readonly [number, number];
  /** Share of the height that is bare trunk. */
  readonly trunkShare: readonly [number, number];
  /** Crown radius as a fraction of the crown's height. */
  readonly crownRatio: readonly [number, number];
  /** Highest they grow, as a fraction of the terrain's relief above sea level (the tree line: hardy small plants climb higher). */
  readonly maxElevation: number;
  /** Steepest ground they hold on to (rise over run). */
  readonly maxSlope: number;
  /** Annual mean temperature range (K) they survive in, before the per-species shift. */
  readonly temperature: readonly [number, number];
}

export const PLANT_KINDS: Readonly<Record<PlantKind, PlantKindInfo>> = {
  tree: { label: 'Tree', height: [6, 11], trunkShare: [0.3, 0.5], crownRatio: [0.35, 0.6], maxElevation: 0.55, maxSlope: 0.45, temperature: [268, 318] },
  largeBush: { label: 'Large bush', height: [2.2, 3.6], trunkShare: [0, 0.15], crownRatio: [0.45, 0.7], maxElevation: 0.75, maxSlope: 0.7, temperature: [258, 325] },
  smallBush: { label: 'Small bush', height: [0.8, 1.5], trunkShare: [0, 0.05], crownRatio: [0.5, 0.8], maxElevation: 0.92, maxSlope: 0.9, temperature: [248, 330] },
};

/** A species, as the plant designer will edit it. */
export interface PlantSpecies {
  readonly index: number;
  readonly kind: PlantKind;
  readonly name: string;
  /** Planet-level units, before each plant's own scale. */
  readonly height: number;
  /** Bare trunk as a share of the height. */
  readonly trunkShare: number;
  /** Trunk radius as a share of the height. */
  readonly trunkWidth: number;
  /** Crown radius, planet-level units. */
  readonly crownRadius: number;
  readonly crown: CrownShape;
  readonly trunkColor: string;
  readonly leafColor: string;
  /** Annual mean temperature window (K). */
  readonly minTemperature: number;
  readonly maxTemperature: number;
  /** Relative abundance. */
  readonly weight: number;
}

/** How many species each habitability tier has (T0 has no plants): more species the higher the tier. */
export const SPECIES_PER_TIER: readonly number[] = [0, 3, 5, 8];
/** Kinds handed out in this order, so every tier has all three and the higher ones more trees and shrubs. */
const KIND_ORDER: readonly PlantKind[] = ['tree', 'largeBush', 'smallBush', 'tree', 'smallBush', 'largeBush', 'tree', 'smallBush'];
/** Chance a candidate spot holds a plant, at the best fertility: denser cover the higher the tier. */
export const COVER_PER_TIER: readonly number[] = [0, 0.3, 0.55, 0.85];

/** Cells are about this many units across (planet-level). */
export const PLANT_CELL_SIZE = 32;
/** Candidate spots are about this far apart, inside a cell. */
export const PLANT_SPACING = 5;
/** Ground this close to sea level (as a fraction of the relief) is beach: nothing grows. */
export const MIN_ELEVATION = 0.03;
/** Gap, in units, the slope is measured over. */
const SLOPE_STEP = 2;

/**
 * Annual mean temperature swing with latitude, K: the mean at the equator is
 * `mean + 2/3·SWING` and at the poles `mean − 4/3·SWING` (cos 2φ − 1/3 has a
 * zero area-weighted mean). Earth: equator 27 °C and below 0 °C from 60° for a
 * 15 °C (288 K) mean, which 19 K gives (docs/research/plants.md).
 */
export const LATITUDE_SWING = 19;

/** The annual mean temperature (K) at latitude `lat` (radians) on a body whose mean is `mean`. */
export function localTemperature(mean: number, lat: number): number {
  return mean + LATITUDE_SWING * (Math.cos(2 * lat) - 1 / 3);
}

/** Everything a planet's plants come from. */
export interface PlantPlan {
  readonly seed: number;
  readonly tier: Habitability;
  readonly species: readonly PlantSpecies[];
  /** Mean surface temperature, K. */
  readonly temperature: number;
  /** Sea-level radius, and the highest terrain's. */
  readonly radius: number;
  readonly peak: number;
  /** Chance a candidate spot holds a plant at the best fertility (tier and water). */
  readonly cover: number;
}

export interface PlantInput {
  readonly seed: number;
  readonly tier: Habitability;
  /** Mean surface temperature, K. */
  readonly temperature: number;
  /** Surface water inventory, 0 to 1 (see ClimateState). */
  readonly water: number;
  /** Sea-level radius and highest terrain's radius, planet-level units. */
  readonly radius: number;
  readonly peak: number;
}

/** The plants of a body, or null if it has none (tier 0). */
export function planPlants(input: PlantInput): PlantPlan | null {
  const { tier } = input;
  if (tier < 1) return null;
  const rng = new Rng(input.seed).fork('plants');
  // One colour scheme per planet: greens on Earth-likes, stranger hues on the rest.
  const hue = tier === 3 ? rng.range(85, 140) : rng.range(0, 360);
  const species: PlantSpecies[] = [];
  for (let i = 0; i < SPECIES_PER_TIER[tier]!; i++) {
    species.push(makeSpecies(rng.fork('species', i), i, KIND_ORDER[i]!, hue, tier));
  }
  // A dry world has sparser cover (Earth's deserts and tundra hold a fraction of the trees of moist forests).
  const moisture = 0.55 + 0.45 * Math.sqrt(Math.min(1, Math.max(0, input.water)));
  return {
    seed: input.seed,
    tier,
    species,
    temperature: input.temperature,
    radius: input.radius,
    peak: input.peak,
    cover: COVER_PER_TIER[tier]! * moisture,
  };
}

function makeSpecies(rng: Rng, index: number, kind: PlantKind, baseHue: number, tier: Habitability): PlantSpecies {
  const info = PLANT_KINDS[kind];
  const height = rng.range(info.height[0], info.height[1]);
  const trunkShare = rng.range(info.trunkShare[0], info.trunkShare[1]);
  const crownHeight = height * (1 - trunkShare);
  const crown = kind === 'tree' ? rng.pick<CrownShape>(['cone', 'ball', 'tiers']) : kind === 'largeBush' ? rng.pick<CrownShape>(['ball', 'tiers']) : 'ball';
  const hue = baseHue + rng.range(-18, 18);
  const name = generateName(rng);
  const noun = kind === 'tree' ? 'tree' : kind === 'largeBush' ? 'bush' : 'shrub';
  return {
    index,
    kind,
    name: `${name} ${noun}`,
    height,
    trunkShare,
    trunkWidth: kind === 'tree' ? rng.range(0.025, 0.04) : 0.02,
    crownRadius: crownHeight * rng.range(info.crownRatio[0], info.crownRatio[1]),
    crown,
    trunkColor: hslToHex(rng.range(20, 40), rng.range(0.3, 0.45), rng.range(0.2, 0.3)),
    leafColor: hslToHex(hue, rng.range(0.4, 0.65), rng.range(0.26, 0.42) + (tier === 3 ? 0 : 0.04)),
    // A species' limits sit a few degrees either side of its kind's.
    minTemperature: info.temperature[0] + rng.range(-6, 6),
    maxTemperature: info.temperature[1] + rng.range(-6, 6),
    weight: rng.range(0.5, 1.5),
  };
}

/** One plant. Its id is stable: the same cell and index on every visit, so what happens to it can be recorded. */
export interface PlantData {
  readonly id: string;
  /** Index into the plan's species. */
  readonly species: number;
  /** Unit direction from the body's centre (body frame), and the terrain's radius there. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  /** Multiplies the species' size (and heights, crowns). */
  readonly scale: number;
  /** Turn about the up axis, radians. */
  readonly yaw: number;
}

/** The terrain radius in a unit direction (the same the planet level draws). */
export type GroundRadius = (dir: Vec3Like) => number;

/** Cells per cube face edge. */
export function plantGridSize(radius: number): number {
  return Math.max(1, Math.round((radius * Math.PI * 0.5) / PLANT_CELL_SIZE));
}

export function plantId(face: number, i: number, j: number, k: number): string {
  return `${face}:${i}:${j}:${k}`;
}

/** A plant id's cell and index (null if it isn't one). */
export function parsePlantId(id: string): { face: number; i: number; j: number; k: number } | null {
  const parts = id.split(':').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0)) return null;
  const [face, i, j, k] = parts as [number, number, number, number];
  return face < 6 ? { face, i, j, k } : null;
}

/** 0 to 1: how lush the ground is, in patches tens to hundreds of units across (forests and meadows). */
export function fertility(x: number, y: number, z: number, seed: number): number {
  const big = terrainNoise(x * 3.1, y * 3.1, z * 3.1, seed ^ 0x51ed);
  const small = terrainNoise(x * 9.7, y * 9.7, z * 9.7, seed ^ 0x9e37);
  return Math.min(1, Math.max(0, 0.5 + 0.38 * big + 0.17 * small));
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** How well a kind suits ground of this fertility: trees like the lush patches, small bushes take the rest. */
function kindWeight(kind: PlantKind, f: number): number {
  if (kind === 'tree') return 0.04 + smoothstep(0.35, 0.7, f);
  if (kind === 'largeBush') return 0.3 + 0.4 * smoothstep(0.2, 0.6, f);
  return 0.3 + 0.7 * (1 - smoothstep(0.35, 0.8, f));
}

/** How well the temperature suits a species: 1 inside its window, falling to 0 over 6 K outside it. */
function temperatureWeight(s: PlantSpecies, t: number): number {
  const out = Math.max(s.minTemperature - t, t - s.maxTemperature, 0);
  return Math.max(0, 1 - out / 6);
}

/** Area of the cell's ground, square units (two diagonals of the corner quad). */
function cellArea(face: number, i: number, j: number, n: number, radius: number): number {
  const a = faceGridPoint(face, i, j, n, { x: 0, y: 0, z: 0 });
  const b = faceGridPoint(face, i + 1, j, n, { x: 0, y: 0, z: 0 });
  const c = faceGridPoint(face, i + 1, j + 1, n, { x: 0, y: 0, z: 0 });
  const d = faceGridPoint(face, i, j + 1, n, { x: 0, y: 0, z: 0 });
  const ux = c.x - a.x;
  const uy = c.y - a.y;
  const uz = c.z - a.z;
  const vx = d.x - b.x;
  const vy = d.y - b.y;
  const vz = d.z - b.z;
  return 0.5 * radius * radius * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

const scratch = { x: 0, y: 0, z: 0 };

/**
 * The plants of cell (`face`, `i`, `j`) on a grid of `plantGridSize`: a
 * jittered grid of candidate spots, each kept or not by the terrain there
 * (above the beach, not too high or steep for the species), the local
 * temperature (latitude) and the fertility field, and given a species.
 * Deterministic, from the plan's seed and the cell's address alone. Every
 * candidate draws the same random numbers whether or not it is kept, so a spot
 * doesn't change when rules around it do.
 */
export function generateCell(plan: PlantPlan, ground: GroundRadius, face: number, i: number, j: number): PlantData[] {
  const out: PlantData[] = [];
  if (plan.species.length === 0) return out;
  const R = plan.radius;
  const relief = plan.peak - R;
  const n = plantGridSize(R);
  const k = Math.max(1, Math.round(Math.sqrt(cellArea(face, i, j, n, R)) / PLANT_SPACING));
  const rng = new Rng(plan.seed).fork('cell', face, i, j);
  const weights = new Float64Array(plan.species.length);
  for (let a = 0; a < k; a++) {
    for (let b = 0; b < k; b++) {
      const index = a * k + b;
      const u = (a + rng.next()) / k;
      const v = (b + rng.next()) / k;
      const keepRoll = rng.next();
      const speciesRoll = rng.next();
      const scale = rng.range(0.8, 1.25);
      const yaw = rng.range(0, Math.PI * 2);

      const dir = faceGridPoint(face, i + u, j + v, n, scratch);
      const r = ground(dir);
      const elevation = (r - R) / relief;
      if (elevation < MIN_ELEVATION) continue;
      const f = fertility(dir.x, dir.y, dir.z, plan.seed);
      if (keepRoll >= plan.cover * smoothstep(0.2, 0.55, f)) continue;
      const temperature = localTemperature(plan.temperature, Math.asin(Math.max(-1, Math.min(1, dir.y))));
      const steep = slope(ground, dir, r);
      let total = 0;
      for (const s of plan.species) {
        const info = PLANT_KINDS[s.kind];
        const w = elevation > info.maxElevation || steep > info.maxSlope ? 0 : s.weight * kindWeight(s.kind, f) * temperatureWeight(s, temperature);
        weights[s.index] = w;
        total += w;
      }
      if (total <= 0) continue;
      let pick = speciesRoll * total;
      let chosen = plan.species.length - 1;
      for (let s = 0; s < weights.length; s++) {
        pick -= weights[s]!;
        if (pick < 0) {
          chosen = s;
          break;
        }
      }
      out.push({ id: plantId(face, i, j, index), species: chosen, x: dir.x, y: dir.y, z: dir.z, radius: r, scale, yaw });
    }
  }
  return out;
}

const tangentA = { x: 0, y: 0, z: 0 };
const tangentB = { x: 0, y: 0, z: 0 };

/** The ground's steepness at `dir` (radius `r`): the larger rise over run along two directions across it, over SLOPE_STEP units. */
function slope(ground: GroundRadius, dir: Vec3Like, r: number): number {
  // Any two directions across the surface: cross with the axis least aligned with `dir`.
  const ax = Math.abs(dir.x);
  const ay = Math.abs(dir.y);
  const az = Math.abs(dir.z);
  const ref = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
  let tx = dir.y * ref[2]! - dir.z * ref[1]!;
  let ty = dir.z * ref[0]! - dir.x * ref[2]!;
  let tz = dir.x * ref[1]! - dir.y * ref[0]!;
  const tl = Math.hypot(tx, ty, tz);
  tx /= tl;
  ty /= tl;
  tz /= tl;
  tangentA.x = tx;
  tangentA.y = ty;
  tangentA.z = tz;
  tangentB.x = dir.y * tz - dir.z * ty;
  tangentB.y = dir.z * tx - dir.x * tz;
  tangentB.z = dir.x * ty - dir.y * tx;
  const step = SLOPE_STEP / r;
  let rise = 0;
  for (const t of [tangentA, tangentB]) {
    const len = Math.hypot(dir.x + t.x * step, dir.y + t.y * step, dir.z + t.z * step);
    const other = { x: (dir.x + t.x * step) / len, y: (dir.y + t.y * step) / len, z: (dir.z + t.z * step) / len };
    rise = Math.max(rise, Math.abs(ground(other) - r));
  }
  return rise / SLOPE_STEP;
}
