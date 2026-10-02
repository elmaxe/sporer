import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { RAPIER, type Physics } from '../physics/Physics';
import { keplerPosition, orbitPosition, type KeplerOrbit, type Orbit } from '../gen/orbit';
import type { ShapeData } from '../gen/shape';
import { describeClimate, type ClimateData } from '../gen/climate';
import type { PlanetStyle, PlanetType, RingData } from '../gen/system';
import type { CelestialBody } from './CelestialBody';
import { atmosphereLook } from '../gen/atmosphere';
import { createAtmosphere, type AtmosphereSun } from './atmosphereShell';
import { createLavaLook, type LavaLook } from './lavaMaterial';
import { createGasLook, type GasLook } from './gasLook';
import type { SizeClass } from '../gen/planets';
import { createGasGeometry, createRings, createTerrainGeometry } from './planetGeometry';
import { createWeatherLook, type WeatherLook } from './weatherLook';
import { globeRadius } from '../planet/frame';
import { realSurface } from '../gen/realSurface';

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
  /** Planets' size class (ice giants' clouds differ from gas giants'). */
  size?: SizeClass;
  atmosphere?: string | null;
  rings?: RingData | null;
  tilt?: number;
  /** Solid bodies only (see gen/climate.ts). */
  climate?: ClimateData | null;
  /** Irregular small bodies: the nucleus's shape (gen/shape.ts); `radius` is its longest reach. */
  shape?: ShapeData | null;
  /** A Kepler orbit round the star (comets), followed instead of `orbit`. */
  path?: KeplerOrbit | null;
  /** What kind of small body it is: comets have jets and a coma near the star. */
  small?: SmallBodyKind | null;
}

/** Kinds of irregular small body: comet nuclei (step 25) and named asteroids (step 26). */
export type SmallBodyKind = 'comet' | 'asteroid';

/**
 * Cube sphere segments of the system view's planets (gas giants need more for
 * smooth bands): 768 and 5808 triangles.
 */
export const TERRAIN_SEGMENTS = 8;
export const GAS_SEGMENTS = 22;
/** Bodies with real maps (Earth, the Moon, Mars, Pluto): fine enough for their continents and seas to read (19 200 triangles). */
export const REAL_SEGMENTS = 40;
/** Lava bodies' terrain: finer, since their seas' glow is worked out per vertex (1728 triangles). */
export const LAVA_SEGMENTS = 12;
/** A vent's glow in the system view, radians (wider than up close, so it shows at that size). */
export const COARSE_VENT_RADIUS = 0.15;
/** Cube sphere segments of the system view's cloud layers (4800 triangles; the drift is worked out per vertex). */
export const CLOUD_SEGMENTS = 20;

/** True for gas giants, which are drawn as banded spheres instead of terrain. */
export function isGas(config: PlanetConfig): config is PlanetConfig & { bands: string[] } {
  return config.bands != null && config.bands.length > 0;
}

/**
 * A low-poly planet or moon on a circular orbit. Its collider is a kinematic
 * body driven along the orbit; the mesh is interpolated. Positions are a pure
 * function of the system clock (see StarSystem), and moons orbit their parent.
 */
export class Planet implements Entity, CelestialBody {
  /** Positioned at the interpolated orbit position. */
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  /** The climate line of the tooltip, e.g. "−140 °C · thin N₂ atmosphere". */
  readonly details: string | undefined;
  /** Picked as a sphere this big when it's more than the body (a comet's coma); else its radius. */
  pickRadius: number | undefined = undefined;
  /**
   * When set, the surface's spin is this function of the system (render)
   * time instead of turning at the body's own rate, e.g. to follow the planet
   * level's slower spin while both show the same globe.
   */
  spinAt: ((time: number) => number) | null = null;
  private readonly surface: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** Lava worlds and moons: the animated seas. */
  private readonly lava: LavaLook | null;
  /** Gas and ice giants: the cloud tops. */
  readonly gas: GasLook | null;
  /** Bodies with weather: the clouds, storms and lightning (see gen/weather.ts). */
  readonly weather: WeatherLook | null;
  private readonly body: RAPIER.RigidBody;
  private readonly prev = new THREE.Vector3();
  private readonly parentPosition = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    readonly config: PlanetConfig,
    readonly description: string,
    readonly standoff: number,
    /** Lights the atmosphere (the main star). */
    sun: AtmosphereSun,
    /** The planet a moon orbits; null for planets. */
    readonly parent: Planet | null = null,
  ) {
    const { radius, seed, style } = config;
    this.details = config.climate ? describeClimate(config.climate) : undefined;
    const gas = isGas(config);
    this.lava = gas ? null : createLavaLook(config, COARSE_VENT_RADIUS);
    this.surface = new THREE.Mesh(
      gas
        ? createGasGeometry(radius, seed, config.bands, GAS_SEGMENTS, config.size === 'iceGiant')
        : createTerrainGeometry(radius, seed, style, { segments: realSurface(seed) ? REAL_SEGMENTS : this.lava ? LAVA_SEGMENTS : TERRAIN_SEGMENTS, shape: config.shape }),
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: !gas, roughness: 0.9 }),
    );
    // Lava seas glow on the terrain's own flat sea.
    this.lava?.paintTerrain(this.surface.material, radius);
    this.gas = createGasLook(config);
    this.gas?.apply(this.surface.material);
    // Clouds turn with the ground; the same layer as low orbit's, in planet radii.
    this.weather = gas ? null : createWeatherLook(config, this.lava?.activity ?? null);
    if (this.weather) this.surface.add(this.weather.createCloudLayer(radius / globeRadius(radius), CLOUD_SEGMENTS, sun));

    // The tilted group holds everything aligned with the equator: surface and rings.
    const tilted = new THREE.Group();
    tilted.rotation.z = config.tilt ?? 0;
    tilted.add(this.surface);
    if (config.rings) tilted.add(createRings(config.rings, seed));
    this.object.add(tilted);
    const look = config.atmosphere && config.climate ? atmosphereLook(config.climate, radius) : null;
    if (look) this.object.add(createAtmosphere(radius, config.atmosphere!, look, sun));

    this.object.name = config.name;
    this.positionAt(0, this.position);
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

  /** How far the surface has turned about the (tilted) axis, in radians. */
  get spinAngle(): number {
    return this.surface.rotation.y;
  }

  set spinAngle(angle: number) {
    this.surface.rotation.y = angle % (Math.PI * 2);
  }

  /** Where the body is at system time `time` (around its parent, for moons). */
  positionAt(time: number, out: THREE.Vector3): THREE.Vector3 {
    if (this.config.path) return keplerPosition(this.config.path, time, out);
    orbitPosition(this.config.orbit, time, out);
    if (this.parent) out.add(this.parent.positionAt(time, this.parentPosition));
    return out;
  }

  /** One fixed step: moves to where the orbit is at `time` (the clock after the step). */
  step(time: number, dt: number): void {
    this.prev.copy(this.position);
    this.positionAt(time, this.position);
    this.velocity.subVectors(this.position, this.prev).divideScalar(dt);
    this.body.setNextKinematicTranslation(this.position);
  }

  /** Jumps straight to `time` (the clock was changed elsewhere), with no interpolation from before. */
  jumpTo(time: number, dt: number): void {
    // Start one step back, so the step gives the right velocity.
    this.positionAt(time - dt, this.position);
    this.step(time, dt);
    this.prev.copy(this.position);
    this.body.setTranslation(this.position, true);
    this.object.position.copy(this.position);
    this.object.scale.setScalar(1);
  }

  update(frameDt: number, alpha: number): void {
    this.object.position.lerpVectors(this.prev, this.position, alpha);
    this.surface.rotation.y += this.config.spin * frameDt;
  }

  /** Animated surfaces (lava seas, gas giants' clouds) and weather at system time `time`. */
  animate(time: number): void {
    this.lava?.animate(time);
    this.gas?.animate(time);
    this.weather?.animate(time);
  }

  dispose(): void {
    this.gas?.dispose();
    this.scene.remove(this.object);
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.physics.world.removeRigidBody(this.body);
  }
}
