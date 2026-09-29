import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { RAPIER, type Physics } from '../physics/Physics';
import { orbitPosition, type Orbit } from '../gen/orbit';
import type { PlanetStyle, PlanetType, RingData } from '../gen/system';
import type { Shell } from '../player/zoomCurve';
import type { CelestialBody } from './CelestialBody';
import { createAtmosphere, createGasGeometry, createRings, createTerrainGeometry } from './planetGeometry';

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

/** Icosphere subdivision of the system view's planets (gas giants need more for smooth bands). */
export const TERRAIN_DETAIL = 5;
export const GAS_DETAIL = 16;

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
  /**
   * When set, the surface's spin is this function of the system (render)
   * time instead of turning at the body's own rate, e.g. to follow the planet
   * level's slower spin while both show the same globe.
   */
  spinAt: ((time: number) => number) | null = null;
  /** Its moons' orbits, which the ship never parks in (filled in by StarSystem). */
  readonly keepOut: Shell[] = [];
  private readonly surface: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly body: RAPIER.RigidBody;
  private readonly prev = new THREE.Vector3();
  private readonly parentPosition = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    readonly config: PlanetConfig,
    readonly description: string,
    readonly standoff: number,
    /** The planet a moon orbits; null for planets. */
    readonly parent: Planet | null = null,
  ) {
    const { radius, seed, style } = config;
    const gas = isGas(config);
    this.surface = new THREE.Mesh(
      gas
        ? createGasGeometry(radius, seed, config.bands, GAS_DETAIL)
        : createTerrainGeometry(radius, seed, style, { detail: TERRAIN_DETAIL }),
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
}
