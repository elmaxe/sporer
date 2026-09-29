import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { CelestialBody, Sight } from '../world/CelestialBody';
import type { Ship } from './Ship';

/**
 * Minimum pick radius as a fraction of the body's distance from the camera
 * (~1.1°), so small moons stay clickable when zoomed out.
 */
const MIN_PICK_ANGLE = 0.02;
/** Clicks on empty space farther than this from the ship are pulled in. */
const MAX_POINT_DISTANCE = 3000;

/**
 * Turns the pointer into targets: hovering finds the body (or sight, e.g. a
 * comet) under the cursor, a click sends the ship to that body, or to the
 * point on the ship's horizontal plane under the cursor when it misses.
 * Clicking a sight does nothing: they can be looked at, not flown to.
 * Everything is tested as spheres, which is cheaper than raycasting meshes.
 */
export class Picker implements Entity {
  /** The body or sight under the pointer, if any. */
  hovered: Sight | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly point = new THREE.Vector3();
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
  ) {}

  update(): void {
    const { pointer } = this.input;
    const hovering = pointer.inside && !this.input.isDragging && !this.input.blocked;
    this.hovered = hovering ? this.pick(pointer.ndcX, pointer.ndcY) : null;

    const click = this.input.consumeClick();
    if (!click) return;
    const hit = this.pick(click.ndcX, click.ndcY);
    if (hit) {
      if (this.isBody(hit)) this.ship.moveTo(hit);
      return;
    }
    const ship = this.ship.object.position;
    this.plane.constant = -ship.y;
    if (!this.raycaster.ray.intersectPlane(this.plane, this.point)) return;
    if (this.point.distanceTo(ship) > MAX_POINT_DISTANCE) {
      this.point.sub(ship).setLength(MAX_POINT_DISTANCE).add(ship);
    }
    this.ship.moveTo(this.point);
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
    const r = Math.max(target.radius, depth * MIN_PICK_ANGLE);
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
