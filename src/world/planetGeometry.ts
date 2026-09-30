import * as THREE from 'three';
import { terrainNoise } from '../gen/noise';
import { hashSeed, Rng } from '../gen/rng';
import type { PlanetStyle, RingData } from '../gen/system';
import { createCubeSphere } from './cubeSphere';

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

/** Cube sphere displaced by noise, with per-vertex colours and a flat sea. */
export function createTerrainGeometry(
  radius: number,
  seed: number,
  style: PlanetStyle,
  { segments, noise = terrainNoise, reliefScale = 1, seaFloor = false }: TerrainOptions,
): THREE.BufferGeometry {
  const geometry = createCubeSphere(radius, segments);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const dir = new THREE.Vector3();
  const color = new THREE.Color();
  const paint = terrainPainter(style, seaFloor);
  const relief = style.relief * reliefScale;

  for (let i = 0; i < position.count; i++) {
    dir.fromBufferAttribute(position, i).normalize();
    const height = paint(noise(dir.x, dir.y, dir.z, seed), color);

    // Indexed: each point is displaced once and shared by its triangles, so the surface stays watertight.
    dir.multiplyScalar(radius * (1 + relief * (height < 0 ? 0.6 : 1) * height));
    position.setXYZ(i, dir.x, dir.y, dir.z);
    color.toArray(colors, i * 3);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Colours a gas giant at unit direction (x, y, z) into `out`: stripes by
 * latitude, their edges wobbled by noise, plus thin wavy cloud streaks with
 * `streaks`. Shared by the globe meshes and the planet level's map.
 */
export type GasPainter = (x: number, y: number, z: number, out: THREE.Color) => void;

export function gasPainter(seed: number, bands: readonly string[], streaks = false): GasPainter {
  const palette = bands.map((b) => new THREE.Color(b));
  // Which band colour each stripe uses, seeded so a planet always looks the same.
  const rng = new Rng(hashSeed(seed, 'stripes'));
  const stripes = rng.int(7, 12);
  const order = Array.from({ length: stripes + 1 }, () => palette[rng.int(0, palette.length - 1)]!);
  return (x, y, z, out) => {
    const lat = y + 0.05 * terrainNoise(x * 1.2, y * 2, z * 1.2, seed);
    const s = THREE.MathUtils.clamp((lat + 1) / 2, 0, 0.9999) * stripes;
    const k = Math.floor(s);
    out.lerpColors(order[k]!, order[k + 1]!, THREE.MathUtils.smoothstep(s - k, 0.7, 1));
    if (streaks) {
      const wave = terrainNoise(x * 4, y * 6, z * 4, seed + 1);
      const swirl = terrainNoise(x * 12, y * 40, z * 12, seed + 2);
      out.multiplyScalar(1 + 0.08 * Math.sin(lat * 90 + 4 * wave) + 0.06 * swirl);
    }
  };
}

/**
 * Smooth sphere striped by latitude, the stripe edges wobbled by noise.
 * `streaks` adds thin, wavy cloud streaks for close-up views.
 */
export function createGasGeometry(
  radius: number,
  seed: number,
  bands: readonly string[],
  segments: number,
  streaks = false,
): THREE.BufferGeometry {
  // Stripe edges follow triangle edges, so this wants a finer sphere than terrain.
  // The cube sphere's normals already point straight out: smooth shading.
  const geometry = createCubeSphere(radius, segments);
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const colors = new Float32Array(normal.count * 3);
  const paint = gasPainter(seed, bands, streaks);

  const dir = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < normal.count; i++) {
    dir.fromBufferAttribute(normal, i);
    paint(dir.x, dir.y, dir.z, color);
    color.toArray(colors, i * 3);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
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

