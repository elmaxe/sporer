import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { orbitPosition } from '../gen/orbit';
import { starActivity, type StarActivity } from '../gen/starActivity';
import { describeStar } from '../gen/stars';
import type { SystemStar } from '../gen/system';
import { RAPIER, type Physics } from '../physics/Physics';
import type { CelestialBody } from './CelestialBody';
import { StarLook } from './StarLook';
import { StarStorms } from './StarStorms';

/** Light intensity for a star's light, from its luminosity. */
export function starLightIntensity(data: SystemStar): number {
  return THREE.MathUtils.clamp(1.2 + Math.log2(1 + data.luminosity), 1.2, 5);
}

/** Gap between a star's surface and where the autopilot parks. */
const STANDOFF_MARGIN = 25;

/**
 * A star: an animated surface (granulation, spots, limb darkening), a pulsing
 * corona billboard, storms (prominences and flares, see StarStorms), point
 * light and collider. In binaries it orbits the barycentre (kinematic body);
 * otherwise it is fixed. Its look is a pure function of the system clock
 * (`animate`), so the planet level's sky shows it alive too.
 */
export class Star implements Entity, CelestialBody {
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly description: string;
  readonly radius: number;
  readonly standoff: number;
  readonly activity: StarActivity;
  readonly storms: StarStorms;
  /** The surface and corona; the storms turn with its surface. */
  private readonly look: StarLook;
  private readonly light: THREE.PointLight;
  private readonly body: RAPIER.RigidBody;
  private readonly orbiting: boolean;
  private readonly prev = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    readonly name: string,
    readonly data: SystemStar,
    /** Seeds the surface pattern and storm events. */
    readonly seed: number,
    glowTexture: THREE.Texture,
  ) {
    this.orbiting = data.orbit.radius > 0;
    this.description = describeStar(data);
    this.radius = data.radius;
    this.standoff = data.radius + STANDOFF_MARGIN;
    this.activity = starActivity(data);
    this.look = new StarLook(data, this.activity, seed, glowTexture);
    this.storms = new StarStorms(this.activity, seed, data.radius, data.color);

    // decay 0 keeps intensity constant with distance, so outer planets stay lit.
    this.light = new THREE.PointLight(data.color, starLightIntensity(data), 0, 0);

    this.object.name = `Star (${data.kind})`;
    this.look.spin.add(this.storms.points);
    this.object.add(this.look.object, this.light);
    orbitPosition(data.orbit, 0, this.position);
    this.prev.copy(this.position);
    this.object.position.copy(this.position);
    scene.add(this.object);

    const desc = this.orbiting ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed();
    this.body = physics.world.createRigidBody(desc.setTranslation(this.position.x, this.position.y, this.position.z));
    physics.world.createCollider(RAPIER.ColliderDesc.ball(data.radius), this.body);
  }

  /** Where the star is at system time `time` (binaries orbit their barycentre). */
  positionAt(time: number, out: THREE.Vector3): THREE.Vector3 {
    return orbitPosition(this.data.orbit, time, out);
  }

  /** One fixed step: moves to where the orbit is at `time` (the clock after the step). */
  step(time: number, dt: number): void {
    if (!this.orbiting) return;
    this.prev.copy(this.position);
    this.positionAt(time, this.position);
    this.velocity.subVectors(this.position, this.prev).divideScalar(dt);
    this.body.setNextKinematicTranslation(this.position);
  }

  /** Jumps straight to `time` (the clock was changed elsewhere), with no interpolation from before. */
  jumpTo(time: number, dt: number): void {
    if (!this.orbiting) return;
    // Start one step back, so the step gives the right velocity.
    this.positionAt(time - dt, this.position);
    this.step(time, dt);
    this.prev.copy(this.position);
    this.body.setTranslation(this.position, true);
    this.object.position.copy(this.position);
  }

  get renderPosition(): THREE.Vector3 {
    return this.object.position;
  }

  /** Surface brightness multiplier (see setStarExposure): intensity × eye adaptation. */
  setExposure(exposure: number): void {
    this.look.setExposure(exposure);
  }

  /** Shows the surface, corona and storms as they are at system time `time`. */
  animate(time: number): void {
    this.look.animate(time);
    this.storms.update(time);
  }

  update(_frameDt: number, alpha: number): void {
    if (this.orbiting) this.object.position.lerpVectors(this.prev, this.position, alpha);
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.look.dispose(); // the glow texture is shared; its owner disposes it
    this.storms.dispose();
    this.light.dispose();
    this.physics.world.removeRigidBody(this.body);
  }
}
