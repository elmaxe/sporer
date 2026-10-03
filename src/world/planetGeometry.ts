import * as THREE from 'three';
import { terrainNoise } from '../gen/noise';
import { realSurface, surfaceColor } from '../gen/realSurface';
import { gasTone, generateGasLayout } from '../gen/gasGiants';
import { paletteAt } from './gasLook';
import { SHAPE_FLOOR, shapeRadius, type ShapeData } from '../gen/shape';
import type { PlanetStyle, RingData } from '../gen/system';
import { ringAt, ringProfile } from '../gen/rings';
import { createCubeSphere } from './cubeSphere';
import type { Vec3Like } from './cubeSphereMath';

/*
 * Planet mesh builders shared by the system view (small, coarse bodies) and
 * the planet level (one big, fine globe). `segments` is the cube sphere's
 * grid size per cube face (see cubeSphere.ts): 12·segments² triangles, evenly
 * spread, with no poles.
 */


/**
 * Terrain noise (gen/noise.ts): the value in [-1, 1] at direction (x, y, z).
 * `spacing`, where given, is how far apart (radians) the surface is sampled:
 * features too small for it may be left out (gen/craters.ts craterNoise).
 */
export type TerrainNoise = (x: number, y: number, z: number, seed: number, spacing?: number) => number;

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
  /**
   * An irregular small body's shape (gen/shape.ts): the ground is
   * `radius · shapeRadius(dir)` plus the relief, and the noise is read at
   * the surface point, so detail keeps its size over the whole body.
   */
  shape?: ShapeData | null;
}

/** Radius of the highest peak for a terrain planet built with `reliefScale` (a shaped body's longest reach is its radius). */
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
export type TerrainPainter = (n: number, out: THREE.Color, x: number, y: number, z: number) => number;

/**
 * `seed`: a real body's (gen/realSurface.ts) ground takes its colour map's
 * colour at the point's direction (x, y, z) instead of the height ramp.
 */
export function terrainPainter(style: PlanetStyle, seaFloor = false, seed?: number): TerrainPainter {
  const sea = style.sea === null ? null : new THREE.Color(style.sea);
  const low = new THREE.Color(style.low);
  const high = new THREE.Color(style.high);
  // Without a sea, terrain spans the full noise range [-1, 1].
  const base = sea === null ? -1 : style.seaLevel;
  const real = seed === undefined ? undefined : realSurface(seed);
  const rgb: [number, number, number] = [0, 0, 0];
  return (n, out, x, y, z) => {
    const underwater = sea !== null && n < base;
    const height = !underwater ? (n - base) / (1 - base) : seaFloor ? (n - base) / (base + 1) : 0;
    if (underwater) out.copy(sea).multiplyScalar(seaFloor ? 0.75 + 0.25 * height : 1);
    else if (real) out.setRGB(...surfaceColor(real, x, y, z, rgb), THREE.SRGBColorSpace);
    else out.lerpColors(low, high, height);
    return height;
  };
}

/**
 * A planet's surface as a function of direction: for the unit direction
 * `dir`, writes the colour into `color` and returns the radius there. The
 * whole-globe meshes and the planet level's LOD chunks are built from these.
 * `spacing` (radians) is how far apart the caller samples, when it samples
 * a grid: detail too small for it may be left out, so it doesn't alias.
 */
export type SurfaceSampler = (dir: Vec3Like, color: THREE.Color, spacing?: number) => number;

/** Terrain displaced by noise and coloured by height (see TerrainOptions; `segments` is unused). */
export function terrainSampler(
  radius: number,
  seed: number,
  style: PlanetStyle,
  { noise = terrainNoise, reliefScale = 1, seaFloor = false, shape = null }: Omit<TerrainOptions, 'segments'>,
): SurfaceSampler {
  const paint = terrainPainter(style, seaFloor, seed);
  const relief = style.relief * reliefScale;
  if (shape) {
    // No sea on small bodies: the relief is added on top of the shape.
    return (dir, color, spacing) => {
      const s = shapeRadius(shape, dir.x, dir.y, dir.z);
      return radius * (s + relief * paint(noise(dir.x * s, dir.y * s, dir.z * s, seed, spacing), color, dir.x, dir.y, dir.z));
    };
  }
  return (dir, color, spacing) => {
    const height = paint(noise(dir.x, dir.y, dir.z, seed, spacing), color, dir.x, dir.y, dir.z);
    return radius * (1 + relief * (height < 0 ? SEA_FLOOR_DEPTH : 1) * height);
  };
}

/** How deep a `seaFloor` sinks, relative to the relief above sea level. */
const SEA_FLOOR_DEPTH = 0.6;

/**
 * Radius of the lowest point of a terrain planet built with these options
 * (the sea floor's deepest, else sea level; a shaped body's never dips below
 * SHAPE_FLOOR of its radius).
 */
export function floorRadius(radius: number, style: PlanetStyle, reliefScale = 1, seaFloor = false, shaped = false): number {
  if (shaped) return radius * SHAPE_FLOOR;
  return seaFloor ? radius * (1 - style.relief * reliefScale * SEA_FLOOR_DEPTH) : radius;
}

/** Cube sphere displaced by noise, with per-vertex colours and a flat sea. */
export function createTerrainGeometry(
  radius: number,
  seed: number,
  style: PlanetStyle,
  options: TerrainOptions,
): THREE.BufferGeometry {
  return sampledSphere(createCubeSphere(1, options.segments), terrainSampler(radius, seed, style, options), true, Math.PI / 2 / options.segments);
}

/**
 * Moves each vertex of the unit cube sphere `geometry` out to the sampled
 * radius and colours it. Indexed: each point is sampled once and shared by
 * its triangles, so the surface stays watertight. `displaced` recomputes the
 * normals (else they stay pointing straight out: a smooth sphere).
 */
function sampledSphere(geometry: THREE.BufferGeometry, sample: SurfaceSampler, displaced: boolean, spacing?: number): THREE.BufferGeometry {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const dir = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    dir.fromBufferAttribute(position, i);
    dir.multiplyScalar(sample(dir, color, spacing));
    position.setXYZ(i, dir.x, dir.y, dir.z);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (displaced) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Colours a gas giant at unit direction (x, y, z) into `out`: its bands
 * (gen/gasGiants.ts) without the churning clouds and storms the shader adds
 * (world/gasLook.ts). For small pictures, like the system map's discs.
 */
export type GasPainter = (x: number, y: number, z: number, out: THREE.Color) => void;

export function gasPainter(seed: number, bands: readonly string[], ice: boolean): GasPainter {
  const layout = generateGasLayout(seed, ice);
  const palette = bands.map((b) => new THREE.Color(b));
  return (_x, y, _z, out) => {
    paletteAt(palette, gasTone(layout, Math.asin(THREE.MathUtils.clamp(y, -1, 1))), out);
  };
}

/** A gas giant's cloud tops: a sphere of `radius` coloured by `gasPainter` (the shader paints over it). */
export function gasSampler(radius: number, seed: number, bands: readonly string[], ice: boolean): SurfaceSampler {
  const paint = gasPainter(seed, bands, ice);
  return (dir, color) => {
    paint(dir.x, dir.y, dir.z, color);
    return radius;
  };
}

/** A smooth sphere for a gas giant (the cube sphere's normals already point straight out). */
export function createGasGeometry(radius: number, seed: number, bands: readonly string[], segments: number, ice: boolean): THREE.BufferGeometry {
  return sampledSphere(createCubeSphere(1, segments), gasSampler(radius, seed, bands, ice), false);
}

/**
 * Flat, double-sided ring in the equatorial plane with its radial profile
 * (gen/rings.ts: seeded gaps and brightness, or a real ring's). `scale`
 * converts the ring data's system units.
 */
export function createRings(rings: RingData, seed: number, scale = 1): THREE.Mesh {
  const inner = rings.inner * scale;
  const outer = rings.outer * scale;
  const geometry = new THREE.RingGeometry(inner, outer, 128, rings.profile ? Math.max(24, rings.profile.length * 2) : 24);
  geometry.rotateX(-Math.PI / 2);

  const profile = ringProfile(rings, seed);
  const sample = { alpha: 0, light: 1 };

  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 4);
  const base = new THREE.Color(rings.color);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getZ(i));
    ringAt(rings, profile, THREE.MathUtils.clamp((r - inner) / (outer - inner), 0, 1), sample);
    color.copy(base).multiplyScalar(sample.light);
    color.toArray(colors, i * 4);
    colors[i * 4 + 3] = sample.alpha;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

  // Unlit: the star sits in the ring plane, so lighting would leave rings nearly black.
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
}

