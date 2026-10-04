import { EARTH_GAME_RADIUS, EARTH_GLOBE_RADIUS, type PlanetStyle } from './planets';
import { bodyMass, earthRadii, type ClimateData } from './climate';
import { detailedTerrain, terrainDetail, terrainNoise } from './noise';
import { realSurface } from './realSurface';

/*
 * Impact craters on airless worlds (issue #98). Pure maths, unit-tested in
 * tests/craters.test.ts; see docs/research/craters.md for the numbers.
 *
 * A body's craters are a height field added to its terrain value (see
 * `craterNoise`), so everything that reads the ground (the globes, the maps,
 * the ground ray, the plants) sees the same craters. They're never stored:
 * each comes from the address of a cell of a cube-face grid, one grid per
 * octave of size, each octave's craters half the size of the last and its
 * cells half as wide. A point looks only at the few cells near it in each
 * octave, so a sample costs about the same however many craters the body has.
 *
 * Sizes follow the real size–frequency distribution, N(>D) ∝ D^-2, so every
 * octave has the same number of craters per cell. Each crater's shape follows
 * fresh lunar craters' morphometry (Pike 1977): a bowl a fifth as deep as it
 * is wide for small ones, wider and shallower ones with a flat floor and a
 * central peak above the simple-to-complex transition, a raised rim and an
 * ejecta blanket thinning as (r/R)^-3 out to about two crater radii. Older
 * craters are worn shallower.
 */

/** A crater field's parameters (the debug folder `Craters` and the lab's panel edit them). */
export const craterParams = {
  /** Smallest crater radius of the biggest octave, as a share of the body's radius (craters span 1–2× it). */
  largest: 0.09,
  /** Octaves the system view's coarse globes and maps carry (the biggest craters). */
  coarseOctaves: 2,
  /**
   * Low orbit's fine terrain carries octaves down to craters this wide
   * (radius, planet units): about four of its finest LOD cells (0.55–0.78
   * units, docs/research/planet-lod.md), the least that reads as a bowl.
   * Smaller worlds get fewer octaves.
   */
  smallest: 2.5,
  /** At most this many octaves (the cost of a sample grows with them). */
  maxOctaves: 6,
  /** Share of low orbit's fine hills (gen/noise.ts terrainDetail) left on a fully cratered body. */
  hills: 0.35,
};

/** How many octaves low orbit draws on a body of `radius` (system units): down to `craterParams.smallest`, at least the coarse ones. */
export function fineOctaves(radius: number): number {
  const globe = (radius * EARTH_GLOBE_RADIUS) / EARTH_GAME_RADIUS;
  const k = Math.floor(Math.log2((craterParams.largest * globe) / craterParams.smallest)) + 1;
  return Math.max(craterParams.coarseOctaves, Math.min(craterParams.maxOctaves, k));
}

/**
 * Crater density as a share of geometric saturation (craters packed rim to
 * rim) at `cover` 1; see docs/research/craters.md.
 */
export const SATURATION_SHARE = 0.1;

/** Cumulative size–frequency slope b: N(>D) ∝ D^-b. */
export const SFD_SLOPE = 2;

/**
 * Geometric saturation, Gault (1970): N(>D) = 1.54 D^-2 craters per unit area
 * (D in the same unit).
 */
const GEOMETRIC_SATURATION = 1.54;

/** Continuous ejecta reaches this many crater radii from the centre: 0.674 D past the rim (Moore 1974, via Pike 1977). */
export const EJECTA_REACH = 1 + 2 * 0.674;

/** The Moon's simple-to-complex transition diameter, km (Melosh & Ivanov 1999), and its surface gravity, g (NASA: 1.62 m/s²). */
const MOON_TRANSITION_KM = 15;
const MOON_GRAVITY = 1.62 / 9.80665;

/**
 * The Moon's topographic range, km (LOLA). A body's range scales as 1/g
 * (Mercury: 8.7 km predicted, 9.9 km measured), so the game's relief, the
 * same share of the radius on every body, exaggerates a big world's far more.
 */
const MOON_RELIEF_KM = 19.92;

/** A crater is never deeper than this share of its diameter (a fresh simple crater's), however much the relief is exaggerated. */
const MAX_DEPTH_RATIO = 0.2;

/**
 * Shallowest a worn crater gets, as a share of its fresh depth and rim.
 * Freshness is MOST_WORN + (1 − MOST_WORN)·u² (u uniform), 0.5 on average:
 * Mercury's simple craters average 0.52–0.82 of fresh depth (Barnouin 2012).
 */
const MOST_WORN = 0.25;

/** Earth's radius, km, for turning game radii back into real sizes (gen/climate.ts earthRadii). */
const EARTH_KM = 6371;

/** The shape of the craters of one octave, at its middle size (shares of the diameter D, `profile`'s units). */
interface OctaveShape {
  /** Rim crest to floor. */
  depth: number;
  /** Rim crest over the ground around. */
  rim: number;
  /** Flat floor's radius as a share of the crater's (0: a bowl). */
  floor: number;
  /** Central peak's height over the floor (share of D) and its radius as a share of the crater's. */
  peak: number;
  peakWidth: number;
}

interface Octave extends OctaveShape {
  /** Grid cells per cube-face edge. */
  cells: number;
  /** Smallest radius (chord, on the unit sphere). */
  radius: number;
  /** Expected craters per unit area of the sphere. */
  perArea: number;
  /** The widest a crater's ejecta reaches, radians. */
  reach: number;
}

/** A body's craters: everything needed to sample them, worked out once, and the cells' craters as they're first needed. */
export interface CraterField {
  readonly seed: number;
  readonly octaves: readonly Octave[];
  /** Per octave, each visited cell's craters (`CELL_STRIDE` numbers each), by face and cell (`(face · cells + j) · cells + i`). */
  readonly cells: readonly (Float64Array | undefined)[][];
}

/** Numbers per crater in a cell's list: the centre (unit x, y, z), the radius (chord), how fresh (MOST_WORN–1). */
const CELL_STRIDE = 5;
const NO_CRATERS = new Float64Array(0);

/** Pike's (1977) fits for fresh lunar craters, y = b·D^a in km (D the rim-crest diameter); docs/research/craters.md. */
const PIKE = {
  depthSimple: [0.196, 1.01],
  depthComplex: [1.044, 0.301],
  rimSimple: [0.036, 1.014],
  rimComplex: [0.236, 0.399],
  /** Flat floor's diameter, under 20 km (none under ~5 km) and over. */
  floorSmall: [0.031, 1.765],
  floorLarge: [0.187, 1.249],
  /** Central peak's height over the floor, full size over 27 km (lower from where peaks start, the transition). */
  peak: [0.032, 0.9],
} as const;
const pike = ([b, a]: readonly [number, number], D: number): number => b * D ** a;

/** Diameters (lunar km) where floors start, where the floor law changes, where peaks reach full size; floors are at most this share of D. */
const FLOOR_START_KM = 5;
const FLOOR_LAW_KM = 20;
const FULL_PEAK_KM = 27;
const MAX_FLOOR = 0.75;
/** Lunar diameter (km) where central peaks give way to peak rings (Neumann et al. 2015). */
const PEAK_RING_KM = 200;

/** A central peak's base radius as a share of the crater's: stylised, not measured. */
const PEAK_WIDTH = 0.2;

/**
 * A fresh crater `diameterKm` across on a body whose simple-to-complex
 * transition is at `transitionKm`: Pike's lunar fits (1977) at the
 * lunar-equivalent diameter (scaled by the transitions, i.e. by gravity, as
 * 1/g), as shares of its diameter. Where the simple and complex fits for
 * depth (10.6 km) and rim (21.3 km) cross, the lower one is taken, so the
 * shape changes smoothly with size; floors from ~5 km, central peaks growing
 * from the transition to full size at 27 km.
 */
export function craterShape(diameterKm: number, transitionKm: number): OctaveShape {
  const D = diameterKm * (MOON_TRANSITION_KM / transitionKm);
  const depth = Math.min(pike(PIKE.depthSimple, D), pike(PIKE.depthComplex, D));
  const rim = Math.min(pike(PIKE.rimSimple, D), pike(PIKE.rimComplex, D));
  const floor = D < FLOOR_START_KM ? 0 : Math.min(MAX_FLOOR * D, pike(D < FLOOR_LAW_KM ? PIKE.floorSmall : PIKE.floorLarge, D));
  // Basins (over ~200 km) have a ring of peaks instead (not drawn).
  const grow = D >= PEAK_RING_KM ? 0 : Math.min(1, Math.max(0, (D - MOON_TRANSITION_KM) / (FULL_PEAK_KM - MOON_TRANSITION_KM)));
  // A peak never rises past the rim's level.
  const peak = Math.min(depth, grow * pike(PIKE.peak, D));
  return { depth: depth / D, rim: rim / D, floor: floor / D, peak: peak / D, peakWidth: peak > 0 ? PEAK_WIDTH : 0 };
}

/** Surface gravity (g) of a rocky body of game `radius`, for one without a climate (gen/climate.ts's masses). */
function rockGravity(radius: number): number {
  const R = earthRadii(radius);
  return bodyMass(R, false) / (R * R);
}

/**
 * The crater field of a body of `radius` (game units) with `style`, or null
 * when it has none (`style.craters` unset or 0, or a real body: its map has
 * its own). `octaves` of them, biggest first.
 */
export function craterField(seed: number, style: PlanetStyle, radius: number, octaves: number, gravity = rockGravity(radius)): CraterField | null {
  const cover = style.craters ?? 0;
  if (cover <= 0 || octaves <= 0 || realSurface(seed)) return null;
  // The real body's size from the game's √-compressed radius, and the transition diameter scaling as 1/g.
  const radiusKm = EARTH_KM * earthRadii(radius);
  const transitionKm = (MOON_TRANSITION_KM * MOON_GRAVITY) / gravity;
  // The game's relief exaggerates the body's real one (∝ 1/g); craters are exaggerated as much, but never past a fresh bowl's depth.
  const exaggeration = style.relief / ((MOON_RELIEF_KM * MOON_GRAVITY) / gravity / radiusKm);
  const list: Octave[] = [];
  for (let k = 0; k < octaves; k++) {
    const r = craterParams.largest / 2 ** k;
    const mid = r * Math.SQRT2;
    const real = craterShape(2 * mid * radiusKm, transitionKm);
    const depth = Math.min(MAX_DEPTH_RATIO, real.depth * exaggeration);
    const scale = depth / real.depth;
    // The biggest crater's reach (chord 2r·EJECTA_REACH) as an angle; cells about that wide where a face is narrowest (its edges, see `craterHeight`).
    const reach = 2 * Math.asin(r * EJECTA_REACH);
    const cells = Math.max(1, Math.floor((2 * UV_TO_ANGLE * Math.SQRT1_2) / reach));
    // N(>D) per unit area for D from 2r to 4r (unit sphere), as a share of saturation.
    const D = 2 * r;
    const perArea = cover * SATURATION_SHARE * GEOMETRIC_SATURATION * (D ** -SFD_SLOPE - (2 * D) ** -SFD_SLOPE);
    list.push({ ...real, depth, rim: real.rim * scale, peak: real.peak * scale, cells, radius: r, perArea, reach });
  }
  return { seed, octaves: list, cells: list.map((o) => new Array<Float64Array | undefined>(6 * o.cells * o.cells)) };
}

/** 32-bit integer hash (lowbias32). */
function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

const INV_2_32 = 1 / 4294967296;
/** Radians per unit of a cube face's (u, v) in the equal-angle mapping (u = α / (π/4), α the angle off the face's centre). */
const UV_TO_ANGLE = Math.PI / 4;
/**
 * An octave fades in as its smallest craters' radius goes from this many
 * samples to twice that: a bowl a sample or two across is only a pit that
 * flickers between facets.
 */
const FADE_SAMPLES = 1;

/** Safety margin on the windows of cells a point checks (pinned against checking every crater in tests/craters.test.ts). */
const WINDOW_SLACK = 1.1;
/** Past this angle off a face's centre the windows stop widening: no crater on the face reaches further (the biggest reach is under 0.4 rad). */
const MAX_ANGLE = 1.25;

/**
 * The height the craters add at the direction (x, y, z) (any length), as a
 * share of the body's radius; `octaves` limits how many of the field's
 * octaves count (biggest first).
 *
 * Each face's grid is in equal-angle coordinates: a point at angles (α, β)
 * off the face's centre along its two axes. Moving dα there covers
 * dα·cos β on the sphere at the least (and the same with α and β swapped),
 * so a crater within `reach` radians of the point has its centre within
 * reach / cos β of α (cos β at its smallest between the face and the point),
 * which bounds the cells to check. A point checks every face whose
 * hemisphere holds it, so craters reach over the faces' edges.
 */
export function craterHeight(field: CraterField, x: number, y: number, z: number, octaves = field.octaves.length, spacing = 0): number {
  const len = Math.hypot(x, y, z);
  if (len === 0) return 0;
  x /= len;
  y /= len;
  z /= len;
  const n = Math.min(octaves, field.octaves.length);
  if (n === 0) return 0;
  const tanLimit = Math.tan(Math.min(MAX_ANGLE, UV_TO_ANGLE + field.octaves[0]!.reach));
  let sum = 0;
  for (let axis = 0; axis < 3; axis++) {
    const p = axis === 0 ? x : axis === 1 ? y : z;
    if (p === 0) continue;
    const ap = Math.abs(p);
    const ta = (axis === 0 ? y : axis === 1 ? z : x) / ap;
    const tb = (axis === 0 ? z : axis === 1 ? x : y) / ap;
    if (Math.abs(ta) > tanLimit || Math.abs(tb) > tanLimit) continue;
    const alpha = Math.atan(ta);
    const beta = Math.atan(tb);
    const face = axis * 2 + (p > 0 ? 0 : 1);
    const sign = p > 0 ? 1 : -1;
    const u = alpha / UV_TO_ANGLE;
    const v = beta / UV_TO_ANGLE;
    const ab = Math.abs(beta);
    const aa = Math.abs(alpha);
    for (let k = 0; k < n; k++) {
      const o = field.octaves[k]!;
      // Craters too small for the sampling fade out (`spacing` 0: all of them).
      const weight = spacing > 0 ? Math.min(1, o.radius / (spacing * FADE_SAMPLES) - 1) : 1;
      if (weight <= 0) break;
      const G = o.cells;
      const w = 2 / G;
      // (u, v) units per radian on the sphere, at the least between the point and anything within reach of it.
      const ru = (o.reach * WINDOW_SLACK) / (UV_TO_ANGLE * Math.cos(Math.min(MAX_ANGLE, ab + o.reach)));
      const rv = (o.reach * WINDOW_SLACK) / (UV_TO_ANGLE * Math.cos(Math.min(MAX_ANGLE, aa + o.reach)));
      const i0 = Math.max(0, Math.floor((u - ru + 1) / w));
      const i1 = Math.min(G - 1, Math.floor((u + ru + 1) / w));
      const j0 = Math.max(0, Math.floor((v - rv + 1) / w));
      const j1 = Math.min(G - 1, Math.floor((v + rv + 1) / w));
      const cells = field.cells[k]!;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const list = cells[(face * G + j) * G + i] ?? cellCraters(field, k, face, axis, sign, i, j);
          for (let c = 0; c < list.length; c += CELL_STRIDE) {
            const dx = x - list[c]!;
            const dy = y - list[c + 1]!;
            const dz = z - list[c + 2]!;
            const d2 = dx * dx + dy * dy + dz * dz;
            const radius = list[c + 3]!;
            const far = radius * EJECTA_REACH;
            if (d2 >= far * far) continue;
            sum += weight * 2 * radius * list[c + 4]! * profile(o, Math.sqrt(d2) / radius);
          }
        }
      }
    }
  }
  return sum;
}

/**
 * The craters of cell (i, j) of octave `k` on `face` (outward along `axis`,
 * `sign`), from the cell's address alone, worked out on first use and kept.
 * How many: the octave's density times the cell's area on the sphere, so
 * they're spread evenly; where: uniform in the cell's (u, v); how big:
 * N(>r) ∝ r^-b within the octave's [r, 2r); how worn: mostly well worn,
 * fresh ones rare.
 */
function cellCraters(field: CraterField, k: number, face: number, axis: number, sign: number, i: number, j: number): Float64Array {
  const o = field.octaves[k]!;
  const G = o.cells;
  const cells = field.cells[k]!;
  const key = (face * G + j) * G + i;
  let list = cells[key];
  if (list) return list;
  const w = 2 / G;
  const cu = -1 + (i + 0.5) * w;
  const cv = -1 + (j + 0.5) * w;
  let h = mix(mix(mix(field.seed ^ 0x9e3779b9) + k * 0x85ebca6b + face * 0xc2b2ae35) ^ mix(i + j * 0x10000));
  const count = Math.floor(o.perArea * cellArea(cu, cv, w) + h * INV_2_32);
  if (count <= 0) {
    cells[key] = NO_CRATERS;
    return NO_CRATERS;
  }
  list = new Float64Array(count * CELL_STRIDE);
  const next = (): number => (h = mix(h + 0x632be5ab)) * INV_2_32;
  for (let c = 0; c < count; c++) {
    const ta = Math.tan((cu + (next() - 0.5) * w) * UV_TO_ANGLE);
    const tb = Math.tan((cv + (next() - 0.5) * w) * UV_TO_ANGLE);
    const inv = 1 / Math.sqrt(1 + ta * ta + tb * tb);
    const cp = sign * inv;
    const ca = ta * inv;
    const cb = tb * inv;
    const at = c * CELL_STRIDE;
    list[at] = axis === 0 ? cp : axis === 1 ? cb : ca;
    list[at + 1] = axis === 0 ? ca : axis === 1 ? cp : cb;
    list[at + 2] = axis === 0 ? cb : axis === 1 ? ca : cp;
    list[at + 3] = o.radius * (1 - next() * (1 - 2 ** -SFD_SLOPE)) ** (-1 / SFD_SLOPE);
    const wear = next();
    list[at + 4] = MOST_WORN + (1 - MOST_WORN) * wear * wear;
  }
  cells[key] = list;
  return list;
}

/** The area on the unit sphere of the face cell centred at (u, v), `w` wide: the equal-angle mapping's area element. */
function cellArea(u: number, v: number, w: number): number {
  const ta = Math.tan(u * UV_TO_ANGLE);
  const tb = Math.tan(v * UV_TO_ANGLE);
  const n2 = 1 + ta * ta + tb * tb;
  return w * w * UV_TO_ANGLE * UV_TO_ANGLE * ((1 + ta * ta) * (1 + tb * tb)) / (n2 * Math.sqrt(n2));
}

/**
 * A crater's height at `x` crater radii from its centre, as a share of its
 * diameter, over the ground it fell on: the floor `rim − depth` down, flat
 * out to `floor` and rising as a parabola to the rim crest at 1, a central
 * peak in the middle, then the ejecta thinning as x^-3 to nothing at
 * EJECTA_REACH.
 */
export function profile(o: OctaveShape, x: number): number {
  if (x >= EJECTA_REACH) return 0;
  if (x >= 1) {
    const t = (x - 1) / (EJECTA_REACH - 1);
    const taper = 1 - t * t;
    return (o.rim * taper * taper) / (x * x * x);
  }
  const s = x <= o.floor ? 0 : (x - o.floor) / (1 - o.floor);
  let h = o.rim - o.depth + o.depth * s * s;
  if (o.peak > 0 && x < o.peakWidth) {
    const t = 1 - x / o.peakWidth;
    h += o.peak * t * t;
  }
  return h;
}

/** A terrain noise function (gen/noise.ts terrainNoise or detailedTerrain; world/planetGeometry.ts TerrainNoise: `spacing` is how far apart it's sampled). */
export type TerrainNoise = (x: number, y: number, z: number, seed: number, spacing?: number) => number;

/** The last few fields made, so a body's globe, map and ground share one (and its cells' craters). */
const recent = new Map<string, CraterField>();
const RECENT = 8;

/**
 * `noise` with the craters of a body of `radius` (system units) and `style`
 * added, `octaves` of them (`fine`: as many as low orbit's detailed terrain
 * draws, `fineOctaves`; else `craterParams.coarseOctaves`, for the system
 * view's globes and maps). Returns `noise` itself for a body without
 * craters. The craters' heights (shares of the radius) become terrain values
 * through the style's relief, so the exaggeration the views put on the relief
 * (`reliefScale`) deepens them too. Clamped to the terrain's [-1, 1], so the
 * deepest floors in the lowlands come out flat (as lava-flooded ones are).
 */
export function craterNoise(
  noise: TerrainNoise,
  style: PlanetStyle,
  seed: number,
  radius: number,
  fine: boolean,
  gravity = rockGravity(radius),
): TerrainNoise {
  if (!(style.craters! > 0) || style.relief <= 0 || realSurface(seed)) return noise;
  const octaves = fine ? fineOctaves(radius) : craterParams.coarseOctaves;
  const key = [seed, style.craters, style.relief, radius, gravity, octaves, craterParams.largest].join('|');
  let field = recent.get(key);
  if (!field) {
    field = craterField(seed, style, radius, octaves, gravity)!;
    if (recent.size >= RECENT) recent.delete(recent.keys().next().value!);
    recent.set(key, field);
  }
  const f = field;
  // Terrain value per share of the radius: the land spans (1 − sea level) of the value's range over the full relief.
  const span = (style.sea === null ? 2 : 1 - style.seaLevel) / style.relief;
  return (x, y, z, s, spacing = 0) => Math.max(-1, Math.min(1, noise(x, y, z, s) + span * craterHeight(f, x, y, z, f.octaves.length, spacing)));
}

/**
 * A solid body's terrain noise with its craters: `fine` for low orbit's
 * detailed terrain (`detailedTerrain`), else the system view's
 * (`terrainNoise`). What every view of the ground should read. On a
 * cratered body the fine hills are damped (`craterParams.hills` at full
 * cover): up close, an airless world's ground is craters on craters.
 */
export function surfaceNoise(body: CrateredBody, fine: boolean): TerrainNoise {
  const { seed, style, radius } = body;
  const gravity = body.climate?.gravity ?? rockGravity(radius);
  const cover = Math.min(1, Math.max(0, style.craters ?? 0));
  if (!fine) return craterNoise(terrainNoise, style, seed, radius, false, gravity);
  if (cover === 0 || realSurface(seed)) return craterNoise(detailedTerrain, style, seed, radius, true, gravity);
  const hills = 1 - cover * (1 - craterParams.hills);
  const damped: TerrainNoise = (x, y, z, s) => terrainNoise(x, y, z, s) + hills * terrainDetail(x, y, z, s);
  return craterNoise(damped, style, seed, radius, true, gravity);
}

/** What `surfaceNoise` needs of a body (PlanetConfig and the generated data have it): `radius` in system units; the climate's gravity, where it has one. */
export interface CrateredBody {
  seed: number;
  style: PlanetStyle;
  radius: number;
  climate?: Pick<ClimateData, 'gravity'> | null;
}

/** Calls `visit` with every crater of octave `k` (centre, radius as a chord, freshness): all of them, for tests and tools. */
export function eachCrater(field: CraterField, k: number, visit: (x: number, y: number, z: number, radius: number, fresh: number) => void): void {
  const G = field.octaves[k]!.cells;
  for (let face = 0; face < 6; face++) {
    const axis = face >> 1;
    const sign = face & 1 ? -1 : 1;
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        const list = cellCraters(field, k, face, axis, sign, i, j);
        for (let c = 0; c < list.length; c += CELL_STRIDE) visit(list[c]!, list[c + 1]!, list[c + 2]!, list[c + 3]!, list[c + 4]!);
      }
    }
  }
}
