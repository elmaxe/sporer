import * as THREE from 'three';
import { terrainNoise } from '../gen/noise';
import { hashSeed, Rng } from '../gen/rng';
import type { PlanetStyle, RingData } from '../gen/system';

/*
 * Planet mesh builders shared by the system view (small, coarse bodies) and
 * the planet level (one big, fine globe). `detail` is the icosphere
 * subdivision: 20·(detail+1)² triangles.
 */

/** Atmosphere shell radius relative to the planet, in the system view. */
export const ATMOSPHERE_SCALE = 1.2;
const ATMOSPHERE_INTENSITY = 0.9;

export type TerrainNoise = (x: number, y: number, z: number, seed: number) => number;

export interface TerrainOptions {
  /** Icosphere subdivision. */
  detail: number;
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

/** Icosphere displaced by noise, with per-vertex colours and a flat sea. */
export function createTerrainGeometry(
  radius: number,
  seed: number,
  style: PlanetStyle,
  { detail, noise = terrainNoise, reliefScale = 1, seaFloor = false }: TerrainOptions,
): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const dir = new THREE.Vector3();
  const color = new THREE.Color();
  const sea = style.sea === null ? null : new THREE.Color(style.sea);
  const low = new THREE.Color(style.low);
  const high = new THREE.Color(style.high);
  const relief = style.relief * reliefScale;
  // Without a sea, terrain spans the full noise range [-1, 1].
  const base = sea === null ? -1 : style.seaLevel;

  for (let i = 0; i < position.count; i++) {
    dir.fromBufferAttribute(position, i).normalize();
    const n = noise(dir.x, dir.y, dir.z, seed);
    const underwater = sea !== null && n < base;
    // 0 at sea level (or the lowest point), 1 at the highest peaks;
    // on a sea floor, down to -1 at the deepest point.
    const height = !underwater ? (n - base) / (1 - base) : seaFloor ? (n - base) / (base + 1) : 0;

    // The geometry is non-indexed, but shared corners have identical positions
    // and therefore identical noise, so the surface stays watertight.
    dir.multiplyScalar(radius * (1 + relief * (height < 0 ? 0.6 : 1) * height));
    position.setXYZ(i, dir.x, dir.y, dir.z);

    if (underwater) color.copy(sea).multiplyScalar(seaFloor ? 0.75 + 0.25 * height : 1);
    else color.lerpColors(low, high, height);
    color.toArray(colors, i * 3);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Smooth sphere striped by latitude, the stripe edges wobbled by noise.
 * `streaks` adds thin, wavy cloud streaks for close-up views.
 */
export function createGasGeometry(
  radius: number,
  seed: number,
  bands: readonly string[],
  detail: number,
  streaks = false,
): THREE.BufferGeometry {
  // Stripe edges follow triangle edges, so this wants a finer sphere than terrain.
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normals = new Float32Array(position.count * 3);
  const colors = new Float32Array(position.count * 3);
  const palette = bands.map((b) => new THREE.Color(b));

  // Which band colour each stripe uses, seeded so a planet always looks the same.
  const rng = new Rng(hashSeed(seed, 'stripes'));
  const stripes = rng.int(7, 12);
  const order = Array.from({ length: stripes + 1 }, () => palette[rng.int(0, palette.length - 1)]!);

  const dir = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    dir.fromBufferAttribute(position, i).normalize();
    dir.toArray(normals, i * 3);
    const lat = dir.y + 0.05 * terrainNoise(dir.x * 1.2, dir.y * 2, dir.z * 1.2, seed);
    const s = THREE.MathUtils.clamp((lat + 1) / 2, 0, 0.9999) * stripes;
    const k = Math.floor(s);
    color.lerpColors(order[k]!, order[k + 1]!, THREE.MathUtils.smoothstep(s - k, 0.7, 1));
    if (streaks) {
      const wave = terrainNoise(dir.x * 4, dir.y * 6, dir.z * 4, seed + 1);
      const swirl = terrainNoise(dir.x * 12, dir.y * 40, dir.z * 12, seed + 2);
      color.multiplyScalar(1 + 0.08 * Math.sin(lat * 90 + 4 * wave) + 0.06 * swirl);
    }
    color.toArray(colors, i * 3);
  }

  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
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

/**
 * A slightly larger back-face shell that glows brightest at the planet's limb.
 * `scale` is the shell radius relative to the planet, `relief` the terrain's
 * (so the glow peaks where the mountains end). If given, `sun` (a live unit
 * vector in world space, used as the uniform's value) dims the night side.
 */
export function createAtmosphere(
  radius: number,
  relief: number,
  color: string,
  scale = ATMOSPHERE_SCALE,
  segments = 48,
  sun: THREE.Vector3 | null = null,
): THREE.Mesh {
  // How far the limb of the planet sits inside the shell, as -dot(normal, view) at the limb.
  const surface = 1 + relief * 0.5;
  const limb = Math.sqrt(1 - (surface / scale) ** 2);
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius * scale, segments, segments / 2),
    new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(color) },
        limb: { value: limb },
        intensity: { value: ATMOSPHERE_INTENSITY },
        sun: { value: sun ?? new THREE.Vector3() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vWorldNormal;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform float limb;
        uniform float intensity;
        uniform vec3 sun;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vWorldNormal;
        void main() {
          // Back faces: 0 at the shell's silhouette, 'limb' where the planet's edge is.
          float f = clamp(-dot(normalize(vNormal), normalize(vView)) / limb, 0.0, 1.0);
          // With a sun (zero vector = none): full glow by day, a faint rim by night.
          float day = dot(sun, sun) > 0.5 ? mix(0.12, 1.0, smoothstep(-0.35, 0.25, dot(normalize(vWorldNormal), sun))) : 1.0;
          gl_FragColor = vec4(color * pow(f, 3.0) * intensity * day, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
}
