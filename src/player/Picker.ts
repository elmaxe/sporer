import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { CelestialBody, Region, Sight } from '../world/CelestialBody';
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
 * which is cheaper than raycasting meshes. Regions (asteroid belts) have
 * their own ray test and only count where no body or sight is under the
 * pointer; clicking one flies to the body it names (its nearest asteroid).
 */
export class Picker implements Entity {
  /** The body or sight under the pointer, if any. */
  hovered: Sight | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly point = new THREE.Vector3();
  /** Where the ray met the region picked last. */
  private readonly regionPoint = new THREE.Vector3();
  /** Nearest hit so far during `pick`. */
  private best: Sight | null = null;
  private bestDepth = Infinity;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly input: Input,
    private readonly ship: Ship,
    private readonly bodies: readonly CelestialBody[],
    /** Hoverable only. */
    private readonly sights: readonly Sight[] = [],
    /** Hovered by their own ray test; a click flies to `bodyNear` where it hit. */
    private readonly regions: readonly Region[] = [],
  ) {}

  update(): void {
    const { pointer } = this.input;
    const hovering = pointer.inside && !this.input.isDragging && !this.input.blocked;
    this.hovered = hovering ? this.pick(pointer.ndcX, pointer.ndcY) : null;

    const click = this.input.consumeClick();
    if (!click) return;
    const hit = this.pick(click.ndcX, click.ndcY);
    if (hit && this.isBody(hit)) this.ship.moveTo(hit);
    else if (hit && this.regions.includes(hit as Region)) {
      const body = (hit as Region).bodyNear(this.regionPoint);
      if (body) this.ship.moveTo(body);
    }
  }

  /** The nearest body or sight whose (padded) sphere the ray through `ndc` hits. Leaves the ray set. */
  private pick(ndcX: number, ndcY: number): Sight | null {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), this.camera);
    this.best = null;
    this.bestDepth = Infinity;
    for (const body of this.bodies) this.test(body);
    for (const sight of this.sights) this.test(sight);
    if (this.best) return this.best;
    let nearest = Infinity;
    for (const region of this.regions) {
      const t = region.hit(this.raycaster.ray, this.point);
      if (t !== null && t < nearest) {
        nearest = t;
        this.best = region;
        this.regionPoint.copy(this.point);
      }
    }
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
