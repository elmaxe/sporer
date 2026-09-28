import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { CelestialBody } from '../world/CelestialBody';
import type { Ship } from './Ship';

/**
 * Minimum pick radius as a fraction of the body's distance from the camera
 * (~1.1°), so small moons stay clickable when zoomed out.
 */
const MIN_PICK_ANGLE = 0.02;
/** Clicks on empty space farther than this from the ship are pulled in. */
const MAX_POINT_DISTANCE = 3000;

/**
 * Turns the pointer into targets: hovering finds the body under the cursor,
 * a click sends the ship to that body, or to the point on the ship's
 * horizontal plane under the cursor when it misses.
 * Bodies are tested as spheres, which is cheaper than raycasting their meshes.
 */
export class Picker implements Entity {
  /** The body under the pointer, if any. */
  hovered: CelestialBody | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly point = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.Camera,
    private readonly input: Input,
    private readonly ship: Ship,
    private readonly bodies: readonly CelestialBody[],
  ) {}

  update(): void {
    const { pointer } = this.input;
    this.hovered = pointer.inside && !this.input.isDragging ? this.pick(pointer.ndcX, pointer.ndcY) : null;

    const click = this.input.consumeClick();
    if (!click) return;
    const body = this.pick(click.ndcX, click.ndcY);
    if (body) {
      this.ship.moveTo(body);
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

  /** The nearest body whose (padded) sphere the ray through `ndc` hits. Leaves the ray set. */
  private pick(ndcX: number, ndcY: number): CelestialBody | null {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), this.camera);
    const { ray } = this.raycaster;
    let best: CelestialBody | null = null;
    let bestDepth = Infinity;
    for (const body of this.bodies) {
      const p = body.renderPosition;
      const depth = ray.direction.dot(this.point.subVectors(p, ray.origin));
      if (depth <= 0 || depth >= bestDepth) continue;
      const r = Math.max(body.radius, depth * MIN_PICK_ANGLE);
      if (ray.distanceSqToPoint(p) <= r * r) {
        best = body;
        bestDepth = depth;
      }
    }
    return best;
  }

  dispose(): void {}
}
