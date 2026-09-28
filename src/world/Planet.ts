import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { RAPIER, type Physics } from '../physics/Physics';
import { orbitPosition, type Orbit } from '../gen/orbit';
import { terrainNoise } from '../gen/noise';
import { hashSeed, Rng } from '../gen/rng';
import type { PlanetStyle, PlanetType, RingData } from '../gen/system';
import type { CelestialBody } from './CelestialBody';

/** What the renderer needs; generated PlanetData and MoonData both satisfy it. */
export interface PlanetConfig {
  name: string;
  type: PlanetType;
  radius: number;
  seed: number;
  /** Radians per second around the planet's own axis. */
  spin: number;
  /** Around the star, or around the parent planet for moons. */
  orbit: Orbit;
  style: PlanetStyle;
  bands?: string[] | null;
  atmosphere?: string | null;
  rings?: RingData | null;
  tilt?: number;
}

/** Atmosphere shell radius relative to the planet. */
const ATMOSPHERE_SCALE = 1.2;
const ATMOSPHERE_INTENSITY = 0.9;

/**
 * A low-poly planet or moon on a circular orbit. Its collider is a kinematic
 * body driven along the orbit each fixed step; the mesh is interpolated.
 * Moons orbit their parent, which must run its fixedUpdate first.
 */
export class Planet implements Entity, CelestialBody {
  /** Positioned at the interpolated orbit position. */
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  private readonly surface: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly body: RAPIER.RigidBody;
  private time = 0;
  private readonly prev = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    readonly config: PlanetConfig,
    readonly description: string,
    readonly standoff: number,
    private readonly parent: Planet | null = null,
  ) {
    const { radius, seed, style, bands } = config;
    const gas = bands != null && bands.length > 0;
    this.surface = new THREE.Mesh(
      gas ? createGasGeometry(radius, seed, bands) : createTerrainGeometry(radius, seed, style),
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: !gas, roughness: 0.9 }),
    );

    // The tilted group holds everything aligned with the equator: surface and rings.
    const tilted = new THREE.Group();
    tilted.rotation.z = config.tilt ?? 0;
    tilted.add(this.surface);
    if (config.rings) tilted.add(createRings(config.rings, seed));
    this.object.add(tilted);
    if (config.atmosphere) this.object.add(createAtmosphere(radius, style.relief, config.atmosphere));

    this.object.name = config.name;
    this.computePosition();
    this.prev.copy(this.position);
    this.object.position.copy(this.position);
    scene.add(this.object);

    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.position.x, this.position.y, this.position.z),
    );
    physics.world.createCollider(RAPIER.ColliderDesc.ball(radius), this.body);
  }

  get name(): string {
    return this.config.name;
  }

  get radius(): number {
    return this.config.radius;
  }

  get renderPosition(): THREE.Vector3 {
    return this.object.position;
  }

  fixedUpdate(dt: number): void {
    this.time += dt;
    this.prev.copy(this.position);
    this.computePosition();
    this.velocity.subVectors(this.position, this.prev).divideScalar(dt);
    this.body.setNextKinematicTranslation(this.position);
  }

  update(frameDt: number, alpha: number): void {
    this.object.position.lerpVectors(this.prev, this.position, alpha);
    this.surface.rotation.y += this.config.spin * frameDt;
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.physics.world.removeRigidBody(this.body);
  }

  private computePosition(): void {
    orbitPosition(this.config.orbit, this.time, this.position);
    if (this.parent) this.position.add(this.parent.position);
  }
}

/** Icosphere displaced by noise, with per-vertex colours and a flat sea. */
function createTerrainGeometry(radius: number, seed: number, style: PlanetStyle): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, 5);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const dir = new THREE.Vector3();
  const color = new THREE.Color();
  const sea = style.sea === null ? null : new THREE.Color(style.sea);
  const low = new THREE.Color(style.low);
  const high = new THREE.Color(style.high);
  // Without a sea, terrain spans the full noise range [-1, 1].
  const base = sea === null ? -1 : style.seaLevel;

  for (let i = 0; i < position.count; i++) {
    dir.fromBufferAttribute(position, i).normalize();
    const n = terrainNoise(dir.x, dir.y, dir.z, seed);
    const underwater = sea !== null && n < base;
    // 0 at sea level (or the lowest point), 1 at the highest peaks.
    const height = underwater ? 0 : (n - base) / (1 - base);

    // The geometry is non-indexed, but shared corners have identical positions
    // and therefore identical noise, so the surface stays watertight.
    dir.multiplyScalar(radius * (1 + style.relief * height));
    position.setXYZ(i, dir.x, dir.y, dir.z);

    if (underwater) color.copy(sea);
    else color.lerpColors(low, high, height);
    color.toArray(colors, i * 3);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Smooth sphere striped by latitude, the stripe edges wobbled by noise. */
function createGasGeometry(radius: number, seed: number, bands: readonly string[]): THREE.BufferGeometry {
  // Finer than terrain: stripe edges follow triangle edges, so coarse spheres look jagged.
  const geometry = new THREE.IcosahedronGeometry(radius, 16);
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
    color.toArray(colors, i * 3);
  }

  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Flat, double-sided ring in the equatorial plane with seeded radial gaps and brightness. */
function createRings(rings: RingData, seed: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(rings.inner, rings.outer, 128, 24);
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
    const t = THREE.MathUtils.clamp((r - rings.inner) / (rings.outer - rings.inner), 0, 1);
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

/** A slightly larger back-face shell that glows brightest at the planet's limb. */
function createAtmosphere(radius: number, relief: number, color: string): THREE.Mesh {
  // How far the limb of the planet sits inside the shell, as -dot(normal, view) at the limb.
  const surface = 1 + relief * 0.5;
  const limb = Math.sqrt(1 - (surface / ATMOSPHERE_SCALE) ** 2);
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius * ATMOSPHERE_SCALE, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(color) },
        limb: { value: limb },
        intensity: { value: ATMOSPHERE_INTENSITY },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform float limb;
        uniform float intensity;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          // Back faces: 0 at the shell's silhouette, 'limb' where the planet's edge is.
          float f = clamp(-dot(normalize(vNormal), normalize(vView)) / limb, 0.0, 1.0);
          gl_FragColor = vec4(color * pow(f, 3.0) * intensity, 1.0);
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
