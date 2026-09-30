import * as THREE from 'three';
import { terrainNoise } from '../gen/noise';
import { hashSeed, Rng } from '../gen/rng';
import type { PlanetStyle, RingData } from '../gen/system';
import { createCubeSphere } from './cubeSphere';
import type { Vec3Like } from './cubeSphereMath';

/*
 * Planet mesh builders shared by the system view (small, coarse bodies) and
 * the planet level (one big, fine globe). `segments` is the cube sphere's
 * grid size per cube face (see cubeSphere.ts): 12·segments² triangles, evenly
 * spread, with no poles.
 */


export type TerrainNoise = (x: number, y: number, z: number, seed: number) => number;

export interface TerrainOptions {
  /** Cube sphere segments per cube face edge. */
  segments: number;
  noise?: TerrainNoise;
  /** Multiplies the style's relief (the close-up globe exaggerates it a little). */
  reliefScale?: number;
  /**
   * Sink underwater terrain below sea level into a sea floor (for a separate
   * sea surface) instead of flattening it into a sea-coloured shell.
   */
  seaFloor?: boolean;
}

/** Radius of the highest peak for a terrain planet built with `reliefScale`. */
export function peakRadius(radius: number, style: PlanetStyle, reliefScale = 1): number {
  return radius * (1 + style.relief * reliefScale);
}

/**
 * Colours a terrain planet's surface from its noise value `n` (see
 * `terrainNoise`): writes the colour into `out` and returns the height, 0 at
 * sea level (or the lowest point) to 1 at the highest peaks, and on a
 * `seaFloor` down to -1 at the deepest point (else 0 underwater, sea-coloured).
 * Shared by the globe meshes and the planet level's map, so they match.
 */
export type TerrainPainter = (n: number, out: THREE.Color) => number;

export function terrainPainter(style: PlanetStyle, seaFloor = false): TerrainPainter {
  const sea = style.sea === null ? null : new THREE.Color(style.sea);
  const low = new THREE.Color(style.low);
  const high = new THREE.Color(style.high);
  // Without a sea, terrain spans the full noise range [-1, 1].
  const base = sea === null ? -1 : style.seaLevel;
  return (n, out) => {
    const underwater = sea !== null && n < base;
    const height = !underwater ? (n - base) / (1 - base) : seaFloor ? (n - base) / (base + 1) : 0;
    if (underwater) out.copy(sea).multiplyScalar(seaFloor ? 0.75 + 0.25 * height : 1);
    else out.lerpColors(low, high, height);
    return height;
  };
}

/**
 * A planet's surface as a function of direction: for the unit direction
 * `dir`, writes the colour into `color` and returns the radius there. The
 * whole-globe meshes and the planet level's LOD chunks are built from these.
 */
export type SurfaceSampler = (dir: Vec3Like, color: THREE.Color) => number;

/** Terrain displaced by noise and coloured by height (see TerrainOptions; `segments` is unused). */
export function terrainSampler(
  radius: number,
  seed: number,
  style: PlanetStyle,
  { noise = terrainNoise, reliefScale = 1, seaFloor = false }: Omit<TerrainOptions, 'segments'>,
): SurfaceSampler {
  const paint = terrainPainter(style, seaFloor);
  const relief = style.relief * reliefScale;
  return (dir, color) => {
    const height = paint(noise(dir.x, dir.y, dir.z, seed), color);
    return radius * (1 + relief * (height < 0 ? SEA_FLOOR_DEPTH : 1) * height);
  };
}

/** How deep a `seaFloor` sinks, relative to the relief above sea level. */
const SEA_FLOOR_DEPTH = 0.6;

/** Radius of the lowest point of a terrain planet built with these options (the sea floor's deepest, else sea level). */
export function floorRadius(radius: number, style: PlanetStyle, reliefScale = 1, seaFloor = false): number {
  return seaFloor ? radius * (1 - style.relief * reliefScale * SEA_FLOOR_DEPTH) : radius;
}

/** Cube sphere displaced by noise, with per-vertex colours and a flat sea. */
export function createTerrainGeometry(
  radius: number,
  seed: number,
  style: PlanetStyle,
  options: TerrainOptions,
): THREE.BufferGeometry {
  return sampledSphere(createCubeSphere(1, options.segments), terrainSampler(radius, seed, style, options), true);
}

/**
 * Moves each vertex of the unit cube sphere `geometry` out to the sampled
 * radius and colours it. Indexed: each point is sampled once and shared by
 * its triangles, so the surface stays watertight. `displaced` recomputes the
 * normals (else they stay pointing straight out: a smooth sphere).
 */
function sampledSphere(geometry: THREE.BufferGeometry, sample: SurfaceSampler, displaced: boolean): THREE.BufferGeometry {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const dir = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    dir.fromBufferAttribute(position, i);
    dir.multiplyScalar(sample(dir, color));
    position.setXYZ(i, dir.x, dir.y, dir.z);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (displaced) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Colours a gas giant at unit direction (x, y, z) into `out`: stripes by
 * latitude, their edges wobbled by noise, plus thin wavy cloud streaks with
 * `streaks`. Shared by the globe meshes and the planet level's map.
 */
export type GasPainter = (x: number, y: number, z: number, out: THREE.Color) => void;

/** How much of a stripe's width (from its far edge) blends into the next stripe's colour: crisp edges, softened just enough not to alias. */
export const GAS_EDGE_START = 0.88;

/** The most stripes a gas giant gets, plus one (the colour above the last). */
export const GAS_MAX_STRIPES = 13;

/** A gas giant's stripes, seeded so a planet always looks the same: how many, and the colour of each (one more than that). */
export function gasStripes(seed: number, bands: readonly string[]): { stripes: number; order: THREE.Color[] } {
  const palette = bands.map((b) => new THREE.Color(b));
  const rng = new Rng(hashSeed(seed, 'stripes'));
  const stripes = rng.int(7, 12);
  const order = Array.from({ length: stripes + 1 }, () => palette[rng.int(0, palette.length - 1)]!);
  return { stripes, order };
}

export function gasPainter(seed: number, bands: readonly string[], streaks = false): GasPainter {
  const { stripes, order } = gasStripes(seed, bands);
  return (x, y, z, out) => {
    const lat = y + 0.05 * terrainNoise(x * 1.2, y * 2, z * 1.2, seed);
    const s = THREE.MathUtils.clamp((lat + 1) / 2, 0, 0.9999) * stripes;
    const k = Math.floor(s);
    out.lerpColors(order[k]!, order[k + 1]!, THREE.MathUtils.smoothstep(s - k, GAS_EDGE_START, 1));
    if (streaks) {
      const wave = terrainNoise(x * 4, y * 6, z * 4, seed + 1);
      const swirl = terrainNoise(x * 12, y * 40, z * 12, seed + 2);
      out.multiplyScalar(1 + 0.08 * Math.sin(lat * 90 + 4 * wave) + 0.06 * swirl);
    }
  };
}

/**
 * A gas giant's cloud tops: a smooth sphere of `radius`. The stripes and
 * streaks aren't vertex colours (they would blur across the triangles):
 * `createGasMaterial` paints them per pixel.
 */
export function createGasGeometry(radius: number, segments: number): THREE.BufferGeometry {
  // The cube sphere's normals already point straight out: smooth shading.
  const geometry = createCubeSphere(radius, segments);
  geometry.computeBoundingSphere();
  return geometry;
}

/** The gas surface as a sampler: a sphere of `radius`, colour left to `createGasMaterial`. */
export function gasSampler(radius: number): SurfaceSampler {
  return () => radius;
}

/**
 * Flat, double-sided ring in the equatorial plane with seeded radial gaps and
 * brightness. `scale` converts the ring data's system units.
 */
export function createRings(rings: RingData, seed: number, scale = 1): THREE.Mesh {
  const inner = rings.inner * scale;
  const outer = rings.outer * scale;
  const geometry = new THREE.RingGeometry(inner, outer, 128, 24);
  geometry.rotateX(-Math.PI / 2);

  const rng = new Rng(hashSeed(seed, 'rings'));
  const samples = Array.from({ length: 16 }, () => ({
    alpha: rng.chance(0.15) ? 0.1 : rng.range(0.5, 1),
    light: rng.range(0.75, 1.15),
  }));

  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 4);
  const base = new THREE.Color(rings.color);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getZ(i));
    const t = THREE.MathUtils.clamp((r - inner) / (outer - inner), 0, 1);
    const f = t * (samples.length - 1);
    const a = samples[Math.floor(f)]!;
    const b = samples[Math.min(Math.floor(f) + 1, samples.length - 1)]!;
    const w = f - Math.floor(f);
    // Fade the inner and outer edges.
    const edge = Math.min(1, t * 8, (1 - t) * 8);
    color.copy(base).multiplyScalar(THREE.MathUtils.lerp(a.light, b.light, w));
    color.toArray(colors, i * 4);
    colors[i * 4 + 3] = rings.opacity * THREE.MathUtils.lerp(a.alpha, b.alpha, w) * edge;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

  // Unlit: the star sits in the ring plane, so lighting would leave rings nearly black.
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
}

