import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { orbitPosition } from '../gen/orbit';
import { starActivity, type StarActivity } from '../gen/starActivity';
import { describeStar } from '../gen/stars';
import type { SystemStar } from '../gen/system';
import { RAPIER, type Physics } from '../physics/Physics';
import type { CelestialBody } from './CelestialBody';
import { StarStorms } from './StarStorms';
import {
  animateStarMaterials,
  createCoronaGeometry,
  createCoronaMaterial,
  createStarSurfaceMaterial,
  setStarExposure,
} from './starMaterials';

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
  /** Turns with the star's rotation: the surface and its storms. */
  private readonly spin = new THREE.Group();
  private readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly glow: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
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
    const giant = data.kind === 'redGiant' || data.kind === 'blueGiant';
    this.activity = starActivity(data);

    // Not tone mapped (the shaders skip it): ACES would wash the colour out towards beige.
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(data.radius, 64, 32),
      createStarSurfaceMaterial(data.color, this.activity, seed),
    );
    // Giants get a wider but fainter, softer halo.
    this.glow = new THREE.Mesh(createCoronaGeometry(), createCoronaMaterial(data.color, giant ? 0.6 : 1, seed, glowTexture));
    this.storms = new StarStorms(this.activity, seed, data.radius, data.color);
    // Dim stars get a relatively larger halo so white dwarfs still read as stars.
    this.glow.scale.setScalar(data.radius * (data.radius < 12 ? 9 : giant ? 8 : 6));
    // Face the camera's position (a Sprite faces its view plane, which lets the glow
    // poke out in front of the star when it's off-centre). Runs after the scene's
    // matrix update, so refresh the matrix here.
    this.glow.onBeforeRender = (_renderer, _scene, camera) => {
      this.glow.lookAt(camera.position);
      this.glow.updateMatrixWorld();
    };

    // decay 0 keeps intensity constant with distance, so outer planets stay lit.
    this.light = new THREE.PointLight(data.color, starLightIntensity(data), 0, 0);

    this.object.name = `Star (${data.kind})`;
    this.spin.add(this.mesh, this.storms.points);
    this.object.add(this.spin, this.glow, this.light);
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
    setStarExposure(this.mesh.material, this.glow.material, exposure);
  }

  /** Shows the surface, corona and storms as they are at system time `time`. */
  animate(time: number): void {
    this.spin.rotation.y = ((2 * Math.PI * time) / this.activity.rotationPeriod) % (2 * Math.PI);
    animateStarMaterials(this.mesh.material, this.glow.material, this.activity, time);
    this.storms.update(time);
  }

  update(_frameDt: number, alpha: number): void {
    if (this.orbiting) this.object.position.lerpVectors(this.prev, this.position, alpha);
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.glow.geometry.dispose();
    this.glow.material.dispose(); // the glow texture is shared; its owner disposes it
    this.storms.dispose();
    this.light.dispose();
    this.physics.world.removeRigidBody(this.body);
  }
}
