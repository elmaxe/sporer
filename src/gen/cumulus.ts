import { Rng, hashSeed } from './rng';
import { GLOBE_SIZE_FACTOR } from './planets';
import { hash01, stormCentre, stormStrength, zonalWind, type StormEvent, type WeatherData } from './weather';

/*
 * Puffy clouds (issue #68): instead of one noise-textured sheet wrapped round
 * the planet, water and methane worlds get separate cumulus clusters, each a
 * pile of round puffs on a flat base, that drift with the zonal winds, grow,
 * and evaporate, with clear sky between them. Thunderstorms are cumulonimbus
 * towers reaching up to the cloud layer's height, where their anvils spread.
 * The view (world/cumulusLook.ts) draws every puff as a lit, camera-facing
 * sprite in one instanced draw: Wang's sprite clouds of Microsoft Flight
 * Simulator 2004 rather than a ray-marched volume, so it costs about as much
 * as a particle system and runs on phones.
 *
 * Pure: a cluster is a function of the body's seed, its channel and the time
 * slot, like the storms (gen/weather.ts), so any moment can be shown without
 * replaying the past. Sizes, heights and lives are stylised; the real ratios
 * behind them and the technique: docs/research/clouds.md.
 */

/** Most puffs drawn on one body (the instanced buffer's size). */
export const MAX_PUFFS = 6000;
/** Puffs in a cumulonimbus tower (a storm channel's cluster). */
export const TOWER_PUFFS = 46;
/** A tower's stem radius and its anvil's, over its height (a stem about as wide as deep; anvils far wider, stylised down). */
export const TOWER_STEM = 0.5;
export const TOWER_ANVIL = 1.6;
/**
 * Puff radius, planet units: big enough that a cumulus is a few UFOs across
 * (stylised; real ones are 1–2 km against a 64 km UFO). Grown on small
 * globes (at least MIN_PUFF_ANGLE of the radius) and wherever the body's cover
 * would need more than MAX_PUFFS.
 */
export const PUFF_UNITS = 2.5 * GLOBE_SIZE_FACTOR;
export const MIN_PUFF_ANGLE = 0.02;
/**
 * A cluster's horizontal radius in puff radii, drawn from Wood & Field's
 * (2011) power law of cloud sizes, n(x) ∝ x^−1.66: many small clouds, a few
 * big ones.
 */
export const CLUSTER_SPAN = [2, 7] as const;
export const CLOUD_SIZE_EXPONENT = 1.66;
/**
 * Height of a cluster's dome over its width: cumulus humilis are wider than
 * tall, mediocris about as tall as wide (aspect ~1, Stull). Stylised clusters
 * are far wider than real clouds next to the UFO, so they keep humilis's
 * flatter shape, and their domes never rise more than CLUSTER_MAX_DEPTH puffs.
 */
export const CLUSTER_ASPECT = 0.35;
export const CLUSTER_MAX_DEPTH = 2;
/** Clusters are stretched along the wind (east–west) by this much. */
export const CLUSTER_STRETCH = 1.35;
/**
 * Share of a cluster's footprint (its span's ellipse) that its puffs' opaque
 * cores cover, measured with `drawnCover` over the default galaxy's water
 * worlds (docs/research/clouds.md): the puffs bunch towards the middle, and
 * clusters are thin while they form and evaporate.
 */
export const CLUSTER_FILL = 0.15;
/**
 * The puffy clouds draw this share of the weather's cover (`WeatherData.coverage`,
 * itself 60% of Earth's MODIS cloud fraction): clear sky between the clouds
 * rather than a blanket (issue #68), about a fifth of a typical Terran world.
 */
export const CUMULUS_SHARE = 0.6;
/**
 * The cloud base above the ground under the cluster, as a share of the globe
 * radius and at least `min` units: the UFO flying lowest is under the clouds,
 * from higher up it looks down on them.
 */
export const CLOUD_BASE = { fraction: 0.018, min: 3 * GLOBE_SIZE_FACTOR };
/** A cluster lives this many times the body's cloud renewal time (`WeatherData.change`). */
export const CLUSTER_LIFE = [1.5, 3] as const;

export interface CumulusPuff {
  /** Offset from the cluster's base centre, planet units: east, north (along the ground), up. */
  east: number;
  north: number;
  up: number;
  /** Radius, planet units. */
  radius: number;
  /** How high in the cluster, 0 at the base to 1 at the top (the view darkens the base). */
  height: number;
  /** Which of the sprite atlas's puff shapes. */
  shape: number;
}

export interface CumulusCluster {
  /** The cluster's identity: channel and slot (a storm's channel is −1, its slot the storm's seed). */
  channel: number;
  slot: number;
  start: number;
  life: number;
  /** Where it was born (latitude, longitude, radians, as gen/weather.ts's storms) and its drift (radians per second). */
  lat: number;
  lon: number;
  drift: number;
  /** Horizontal radius, planet units (the longer, east–west one). */
  span: number;
  /**
   * Radius of the cloud base from the planet's centre, planet units, along
   * its path: BASE_STEPS + 1 values from birth to death, each above the
   * highest ground under the cluster round there (see `clusterBase`).
   */
  bases: number[];
  /** Top of the highest puff above the base, planet units. */
  depth: number;
  /** Sorted by `up`, lowest first. */
  puffs: CumulusPuff[];
  /** A thunderstorm's tower; its strength over time is the storm's. */
  storm: StormEvent | null;
}

/** The ground's radius (planet units) in unit direction (x, y, z): the terrain or the sea's surface over it. */
export type GroundRadius = (x: number, y: number, z: number) => number;

export interface CumulusField {
  seed: number;
  /** Sea-level radius and the cloud layer's (where anvils spread), planet units. */
  radius: number;
  top: number;
  /** Puff radius, planet units. */
  puff: number;
  /** Fair-weather clusters alive at once (the channels), before `weatherParams.coverage`. */
  clusters: number;
  /** Seconds each channel's slot lasts (a cluster lives its whole slot, fading in and out). */
  life: readonly [number, number];
  wind: number;
  superRotation: boolean;
  /** Cloudier along the equator and at ±60° (water worlds' circulation). */
  bands: boolean;
  /** Puffs per fair-weather cluster on average (to keep within MAX_PUFFS). */
  meanPuffs: number;
}

/** Bodies whose clouds are puffy clusters: water and methane weather (acid decks and dust stay sheets). */
export function hasCumulus(w: WeatherData): boolean {
  return (w.kind === 'water' || w.kind === 'methane') && w.coverage > 0;
}

/** Puffs in a fair-weather cluster whose span is `m` puff radii: enough to fill its dome. */
export function puffsFor(m: number): number {
  return Math.max(3, Math.min(64, Math.round(1 + 1.1 * m * m * CLUSTER_STRETCH)));
}

/** A cluster's span in puff radii for a uniform `u` in [0, 1): the inverse of the power law's distribution over CLUSTER_SPAN. */
export function spanOf(u: number): number {
  const k = 1 - CLOUD_SIZE_EXPONENT;
  const [a, b] = CLUSTER_SPAN;
  return (a ** k + u * (b ** k - a ** k)) ** (1 / k);
}

/** Mean of puffsFor and of m² over the spans' distribution. */
function spanMoments(): { puffs: number; m2: number } {
  let puffs = 0;
  let m2 = 0;
  const n = 256;
  for (let i = 0; i < n; i++) {
    const m = spanOf((i + 0.5) / n);
    puffs += puffsFor(m);
    m2 += m * m;
  }
  return { puffs: puffs / n, m2: m2 / n };
}
const MOMENTS = spanMoments();

/**
 * The cumulus of a body with weather, or null if its clouds aren't puffy.
 * The number of clusters makes their footprints cover CUMULUS_SHARE of its
 * `coverage`; puffs grow when that would take more than MAX_PUFFS.
 */
export function cumulusField(w: WeatherData, maxPuffs = MAX_PUFFS): CumulusField | null {
  if (!hasCumulus(w)) return null;
  const R = w.radius;
  const footprint = (p: number) => CLUSTER_FILL * Math.PI * p * p * MOMENTS.m2 * CLUSTER_STRETCH;
  const cover = CUMULUS_SHARE * w.coverage * 4 * Math.PI * R * R;
  // Room for the towers, then the fair-weather clusters' puffs.
  const budget = maxPuffs - TOWER_PUFFS * stormChannels(w);
  let puff = Math.max(PUFF_UNITS, MIN_PUFF_ANGLE * R);
  // Puffs needed ∝ 1/puff²: grow them until the cover fits the budget.
  const needed = (p: number) => (cover / footprint(p)) * MOMENTS.puffs;
  if (needed(puff) > budget) puff *= Math.sqrt(needed(puff) / budget);
  const clusters = Math.max(1, Math.round(cover / footprint(puff)));
  return {
    seed: hashSeed(w.seed, 'cumulus'),
    radius: R,
    top: w.cloudRadius,
    puff,
    clusters,
    life: [CLUSTER_LIFE[0] * w.change, CLUSTER_LIFE[1] * w.change],
    wind: w.wind,
    superRotation: w.superRotation,
    bands: w.kind === 'water',
    meanPuffs: MOMENTS.puffs,
  };
}

/** Storm channels that make towers (thunderstorm cells). */
export function stormChannels(w: WeatherData): number {
  let n = 0;
  for (const s of w.storms) if (s.kind === 'cell') n += s.channels;
  return n;
}

/** How long channel `channel`'s slots last, and how far its grid is shifted (so the clusters don't all renew at once). */
export function channelTiming(field: CumulusField, channel: number): { life: number; phase: number } {
  const [a, b] = field.life;
  return { life: a + (b - a) * hash01(field.seed, channel, 1), phase: hash01(field.seed, channel, 2) };
}

/** The slot of `channel` under way at `time`. */
export function channelSlot(field: CumulusField, channel: number, time: number): number {
  const { life, phase } = channelTiming(field, channel);
  return Math.floor(time / life + phase);
}

/** Zonal drift at latitude `lat`, radians per second (the storms' and the cloud sheet's). */
export function driftAt(field: { wind: number; superRotation: boolean }, lat: number): number {
  return (field.wind * zonalWind(lat, field.superRotation)) / Math.max(0.2, Math.cos(lat));
}

/**
 * Where the clouds gather (0–1) in unit direction (x, y, z) at `time`: broad
 * weather fronts, slowly changing, and on water worlds the circulation's
 * cloudy and clear latitudes. Clusters are born where it's high.
 */
export function cloudiness(field: CumulusField, x: number, y: number, z: number, time: number): number {
  const s = field.seed;
  const t = time * 0.0015;
  const n = 0.65 * valueNoise(x * 1.7 + t, y * 1.7, z * 1.7 - t, s) + 0.35 * valueNoise(x * 3.9, y * 3.9 + t, z * 3.9, s + 1);
  let c = smoothstep(0.32, 0.72, n);
  if (field.bands) {
    const lat = Math.asin(Math.max(-1, Math.min(1, y)));
    // Cloudier along the equator (the ITCZ) and at ±60° (storm tracks), clearer at ±30° (docs/research/weather.md).
    c *= (1 + 0.45 * Math.cos(6 * lat)) / 1.45;
  }
  return c;
}

/**
 * The fair-weather cluster of `channel` in `slot`: born where the fronts
 * gather clouds, its base above the highest ground it drifts over.
 */
export function cumulusCluster(field: CumulusField, channel: number, slot: number, ground: GroundRadius): CumulusCluster {
  const rng = new Rng(hashSeed(field.seed, channel, slot));
  const { life, phase } = channelTiming(field, channel);
  const start = (slot - phase) * life;
  // Rejection sampling against the cloudiness: a handful of tries, keeping the cloudiest.
  let lat = 0;
  let lon = 0;
  let best = -1;
  for (let i = 0; i < 16; i++) {
    const y = rng.range(-1, 1);
    const l = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - y * y);
    const c = cloudiness(field, r * Math.sin(l), y, r * Math.cos(l), start + life / 2);
    if (c > best) {
      best = c;
      lat = Math.asin(y);
      lon = l;
    }
    // Accepting by c² gathers them into fronts, with clear sky between.
    if (rng.next() < c * c) break;
  }
  const m = spanOf(rng.next());
  const span = m * field.puff * CLUSTER_STRETCH;
  const puffs = domePuffs(rng, puffsFor(m), m * field.puff, field.puff);
  const drift = driftAt(field, lat);
  const c: CumulusCluster = { channel, slot, start, life, lat, lon, drift, span, bases: [], depth: 0, puffs, storm: null };
  basesAlong(field, c, ground);
  for (const p of puffs) c.depth = Math.max(c.depth, p.up + p.radius);
  return c;
}

/**
 * A thunderstorm's cumulonimbus: a column of big puffs from the cloud base up
 * to the cloud layer (the tropopause), where they spread into a wide, flat
 * anvil; drifting with the storm.
 */
export function towerCluster(field: CumulusField, storm: StormEvent, ground: GroundRadius): CumulusCluster {
  const rng = new Rng(hashSeed(field.seed, 'tower', storm.seed));
  const R = field.radius;
  const puffs: CumulusPuff[] = [];
  const cluster: CumulusCluster = {
    channel: -1,
    slot: storm.seed,
    start: storm.start,
    life: storm.life,
    lat: storm.lat,
    lon: storm.lon,
    drift: storm.drift,
    span: storm.size * R,
    bases: [],
    depth: 0,
    puffs,
    storm,
  };
  basesAlong(field, cluster, ground);
  // Up to the cloud layer from its highest base, so the anvil never dips into it.
  const height = Math.max(field.puff * 3, field.top - Math.max(...cluster.bases));
  // The stem about as wide as it is deep, the anvil several times wider (Stull: ~10–15 km stems, anvils ~100 km).
  const column = Math.max(field.puff * 1.4, height * TOWER_STEM);
  const anvil = Math.max(storm.size * R, height * TOWER_ANVIL);
  cluster.span = anvil;
  const columnPuffs = Math.round(TOWER_PUFFS * 0.55);
  for (let i = 0; i < columnPuffs; i++) {
    const u = i / (columnPuffs - 1);
    // Billowing out as it climbs, like a cauliflower going up.
    const width = column * (0.7 + 0.3 * u) * Math.sqrt(rng.next());
    const a = rng.range(0, Math.PI * 2);
    const radius = column * rng.range(0.5, 0.75);
    puffs.push({ east: width * Math.cos(a), north: width * Math.sin(a), up: radius * 0.5 + u * (height * 0.8 - radius * 0.5), radius, height: u * 0.85, shape: rng.int(0, 3) });
  }
  for (let i = columnPuffs; i < TOWER_PUFFS; i++) {
    // The anvil: flat, wide, drawn out downwind.
    const d = anvil * Math.sqrt(rng.next());
    const a = rng.range(0, Math.PI * 2);
    const radius = Math.max(field.puff * 0.8, anvil * rng.range(0.2, 0.3));
    puffs.push({
      east: d * Math.cos(a) * 1.25 + anvil * 0.25,
      north: d * Math.sin(a) * 0.8,
      up: height - radius * rng.range(0.3, 0.6),
      radius,
      height: 0.9 + 0.1 * rng.next(),
      shape: rng.int(0, 3),
    });
  }
  puffs.sort((a, b) => a.up - b.up);
  cluster.depth = height;
  return cluster;
}

/** A dome of `count` puffs over a base of radius `span` (east–west stretched), flat underneath. */
function domePuffs(rng: Rng, count: number, span: number, puff: number): CumulusPuff[] {
  const puffs: CumulusPuff[] = [];
  const dome = Math.min(2 * span * CLUSTER_ASPECT, CLUSTER_MAX_DEPTH * puff);
  for (let i = 0; i < count; i++) {
    // The first puff is the core, in the middle; the rest round it, smaller towards the edges.
    const d = i === 0 ? 0 : Math.sqrt(rng.next()) * 0.85;
    const a = rng.range(0, Math.PI * 2);
    const radius = puff * rng.range(0.7, 1.15) * (1 - 0.35 * d);
    const crown = (1 - d * d) * dome * rng.range(0.55, 1);
    puffs.push({
      east: d * span * Math.cos(a) * CLUSTER_STRETCH,
      north: d * span * Math.sin(a),
      // Bottom puffs sit on the base (half a radius up), the higher ones on the dome.
      up: radius * 0.5 + crown,
      radius,
      height: 0,
      shape: rng.int(0, 3),
    });
  }
  puffs.sort((p, q) => p.up - q.up);
  const top = puffs[puffs.length - 1]!.up || 1;
  for (const p of puffs) p.height = p.up / top;
  return puffs;
}

/** Steps along a cluster's path at which its base is worked out. */
export const BASE_STEPS = 8;

const scratchDir: [number, number, number] = [0, 0, 0];

/**
 * Fills the cluster's bases along its path: at each step, CLOUD_BASE above
 * the highest ground (or sea) under its middle and edges, and never lower
 * than the step before or after needs (so it doesn't clip a ridge it is
 * drifting onto between samples).
 */
function basesAlong(field: CumulusField, c: CumulusCluster, ground: GroundRadius): void {
  const R = field.radius;
  const reach = c.span / R;
  const gap = Math.max(CLOUD_BASE.min, CLOUD_BASE.fraction * R);
  const raw: number[] = [];
  for (let k = 0; k <= BASE_STEPS; k++) {
    clusterCentre(c, c.start + (c.life * k) / BASE_STEPS, scratchDir);
    const lat = Math.asin(Math.max(-1, Math.min(1, scratchDir[1])));
    const lon = Math.atan2(scratchDir[0], scratchDir[2]);
    let top = R;
    for (let j = 0; j < 5; j++) {
      // The middle and four points round the edge.
      const a = (j * Math.PI) / 2;
      const la = lat + (j === 0 ? 0 : Math.sin(a) * reach);
      const lo = lon + (j === 0 ? 0 : (Math.cos(a) * reach) / Math.max(0.2, Math.cos(lat)));
      const cl = Math.cos(la);
      top = Math.max(top, ground(cl * Math.sin(lo), Math.sin(la), cl * Math.cos(lo)));
    }
    raw.push(top + gap);
  }
  c.bases = raw.map((b, k) => Math.max(b, raw[k - 1] ?? b, raw[k + 1] ?? b));
}

/** The cluster's base radius at `time` (planet units), between the steps along its path. */
export function clusterBase(c: CumulusCluster, time: number): number {
  const f = Math.min(BASE_STEPS, Math.max(0, ((time - c.start) / c.life) * BASE_STEPS));
  const k = Math.min(BASE_STEPS - 1, Math.floor(f));
  const t = f - k;
  const s = t * t * (3 - 2 * t);
  return c.bases[k]! + (c.bases[k + 1]! - c.bases[k]!) * s;
}

/** Where the cluster's base centre is at `time` (unit direction, body frame), as stormCentre. */
export function clusterCentre(c: CumulusCluster, time: number, out: [number, number, number]): [number, number, number] {
  if (c.storm) return stormCentre(c.storm, time, out);
  const lon = c.lon + c.drift * Math.max(0, time - c.start);
  const cl = Math.cos(c.lat);
  out[0] = cl * Math.sin(lon);
  out[1] = Math.sin(c.lat);
  out[2] = cl * Math.cos(lon);
  return out;
}

/**
 * How much of the cluster is there at `time`, 0–1: it billows up over the
 * first quarter of its life and evaporates over the last third (a tower
 * follows its storm). 0 outside its life.
 */
export function clusterStrength(c: CumulusCluster, time: number): number {
  if (c.storm) return stormStrength(c.storm, time) / Math.max(1e-6, c.storm.strength);
  const a = (time - c.start) / c.life;
  if (a <= 0 || a >= 1) return 0;
  return smoothstep(0, 0.25, a) * (1 - smoothstep(0.67, 1, a));
}

/**
 * Share of the sphere under the opaque cores (3/4 of each puff's radius) of
 * the fair-weather clusters alive at `time`, from `samples` directions spread
 * evenly (a Fibonacci sphere). For tuning and tests; allocates.
 */
export function drawnCover(field: CumulusField, time: number, ground: GroundRadius, samples = 20000): number {
  const R = field.radius;
  const discs: number[] = [];
  const d: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < field.clusters; c++) {
    const cl = cumulusCluster(field, c, channelSlot(field, c, time), ground);
    const s = clusterStrength(cl, time);
    if (s <= 0) continue;
    clusterCentre(cl, time, d);
    const [x, y, z] = d;
    const h = Math.hypot(x, z) || 1e-6;
    const g = 0.6 + 0.4 * s;
    for (const p of cl.puffs) {
      // As the view places them (cumulusLook.ts), projected onto the unit sphere; a thin puff counts in proportion.
      const px = x * R + ((z / h) * p.east + (-y * x) / h * p.north) * g;
      const py = y * R + h * p.north * g;
      const pz = z * R + ((-x / h) * p.east + (-y * z) / h * p.north) * g;
      const l = Math.hypot(px, py, pz);
      discs.push(px / l, py / l, pz / l, Math.cos((p.radius * g * 0.75 * Math.sqrt(s)) / R));
    }
  }
  let hit = 0;
  for (let i = 0; i < samples; i++) {
    const y = 2 * ((i + 0.5) / samples) - 1;
    const a = i * 2.399963229728653;
    const r = Math.sqrt(1 - y * y);
    const x = r * Math.cos(a);
    const z = r * Math.sin(a);
    for (let k = 0; k < discs.length; k += 4) {
      if (discs[k]! * x + discs[k + 1]! * y + discs[k + 2]! * z > discs[k + 3]!) {
        hit++;
        break;
      }
    }
  }
  return hit / samples;
}

// --- The sprite atlas ---

/** Puff shapes in the atlas (2 × 2) and each one's size in texels. */
export const PUFF_SHAPES = 4;
export const PUFF_TEXELS = 64;

/**
 * The puffs' sprite atlas: four round, lumpy puffs, 2 × 2, each PUFF_TEXELS
 * across, one byte of density per texel (0 at every tile's edge, densest in
 * the middle). Pure; the view uploads it once.
 */
export function puffAtlas(seed = 1, texels = PUFF_TEXELS): Uint8Array {
  const size = texels * 2;
  const out = new Uint8Array(size * size);
  for (let s = 0; s < PUFF_SHAPES; s++) {
    const rng = new Rng(hashSeed(seed, 'puff', s));
    // A few overlapping lobes make a cauliflower outline rather than a disc.
    const lobes: [number, number, number][] = [[0, 0, 0.62]];
    const count = 4 + s;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const d = rng.range(0.25, 0.42);
      lobes.push([Math.cos(a) * d, Math.sin(a) * d - 0.05, rng.range(0.3, 0.45)]);
    }
    const ox = (s % 2) * texels;
    const oy = Math.floor(s / 2) * texels;
    for (let j = 0; j < texels; j++) {
      for (let i = 0; i < texels; i++) {
        const x = ((i + 0.5) / texels) * 2 - 1;
        const y = ((j + 0.5) / texels) * 2 - 1;
        let d = 0;
        for (const [lx, ly, lr] of lobes) {
          const q = Math.hypot(x - lx, y - ly) / lr;
          d = Math.max(d, 1 - q * q);
        }
        // Wispy edges: noise eats into the thin parts more than the core.
        const n = valueNoise(x * 4 + s * 7.3, y * 4, s * 1.7, seed) * 0.6 + valueNoise(x * 9, y * 9 + s * 3.1, s, seed + 1) * 0.4;
        let v = Math.max(0, d) - (1 - Math.max(0, d)) * (n - 0.3) * 0.6;
        // Nothing past the tile's inscribed circle, so sprites never show a square edge.
        v *= smoothstep(0.97, 0.85, Math.hypot(x, y));
        v = Math.min(1, Math.max(0, v * 1.25));
        out[(oy + j) * size + ox + i] = Math.round(v * 255);
      }
    }
  }
  return out;
}

// --- Helpers ---

/** Smooth 3D value noise in [0, 1] (trilinear over a hashed lattice with smoothstep weights). */
export function valueNoise(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const tz = fade(z - z0);
  const h = (i: number, j: number, k: number) => hash01(seed + i * 374761393, j * 668265263 + k, k * 2246822519);
  const c00 = lerp(h(x0, y0, z0), h(x0 + 1, y0, z0), tx);
  const c10 = lerp(h(x0, y0 + 1, z0), h(x0 + 1, y0 + 1, z0), tx);
  const c01 = lerp(h(x0, y0, z0 + 1), h(x0 + 1, y0, z0 + 1), tx);
  const c11 = lerp(h(x0, y0 + 1, z0 + 1), h(x0 + 1, y0 + 1, z0 + 1), tx);
  return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
