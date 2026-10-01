import * as THREE from 'three';
import type { SoundEffects } from '../audio/sfx';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { CelestialBody, Sight } from '../world/CelestialBody';
import type { Ship } from './Ship';

/**
 * Minimum pick radius as a fraction of the body's distance from the camera
 * (~1.1°), so small moons stay clickable when zoomed out.
 */
const MIN_PICK_ANGLE = 0.02;

/**
 * Turns the pointer into targets: hovering finds the body (or sight) under the
 * cursor, and a click sends the ship to that body. Clicking empty space or a
 * sight does nothing: the ship only ever goes to bodies, and sights can be
 * looked at, not flown to.
 * Everything is tested as spheres (a comet's as big as its coma, `pickRadius`),
 * which is cheaper than raycasting meshes.
 */
export class Picker implements Entity {
  /** The body or sight under the pointer, if any. */
  hovered: Sight | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly point = new THREE.Vector3();
  /** Nearest hit so far during `pick`. */
  private best: Sight | null = null;
  private bestDepth = Infinity;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly input: Input,
    private readonly ship: Ship,
    private readonly bodies: readonly CelestialBody[],
    private readonly sfx: SoundEffects,
    /** Hoverable only. */
    private readonly sights: readonly Sight[] = [],
  ) {}

  update(): void {
    const { pointer } = this.input;
    const hovering = pointer.inside && !this.input.isDragging && !this.input.blocked;
    this.hovered = hovering ? this.pick(pointer.ndcX, pointer.ndcY) : null;

    const click = this.input.consumeClick();
    if (!click) return;
    const hit = this.pick(click.ndcX, click.ndcY);
    if (hit && this.isBody(hit)) this.select(hit);
  }

  /** The player picked `body` (in the view or on the map): a click sound, and the ship flies there. */
  select(body: CelestialBody): void {
    this.sfx.play('select');
    this.ship.moveTo(body);
  }

  /** The nearest body or sight whose (padded) sphere the ray through `ndc` hits. Leaves the ray set. */
  private pick(ndcX: number, ndcY: number): Sight | null {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), this.camera);
    this.best = null;
    this.bestDepth = Infinity;
    for (const body of this.bodies) this.test(body);
    for (const sight of this.sights) this.test(sight);
    return this.best;
  }

  private test(target: Sight): void {
    const { ray } = this.raycaster;
    const p = target.renderPosition;
    const depth = ray.direction.dot(this.point.subVectors(p, ray.origin));
    if (depth <= 0 || depth >= this.bestDepth) return;
    const r = Math.max(target.pickRadius ?? target.radius, depth * MIN_PICK_ANGLE);
    if (ray.distanceSqToPoint(p) <= r * r) {
      this.best = target;
      this.bestDepth = depth;
    }
  }

  private isBody(target: Sight): target is CelestialBody {
    return (this.bodies as readonly Sight[]).includes(target);
  }

  dispose(): void {}
}
