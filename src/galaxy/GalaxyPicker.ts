import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { GalaxyData, StarRef } from '../gen/galaxy';
import type { GalaxyShip } from './GalaxyShip';
import { pickPoint } from './pickPoint';

/** How close (in CSS pixels) the pointer must be to a star's dot to pick it. */
const PICK_RADIUS_PX = 10;

/** Hover finds the star under the pointer; a click sets course for it. */
export class GalaxyPicker implements Entity {
  hovered: StarRef | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly canvas: HTMLElement,
    private readonly galaxy: GalaxyData,
    private readonly positions: Float32Array,
    private readonly ship: GalaxyShip,
  ) {}

  update(): void {
    const { pointer } = this.input;
    const hovering = pointer.inside && !this.input.isDragging && !this.input.blocked;
    this.hovered = hovering ? this.pick(pointer.ndcX, pointer.ndcY) : null;

    const click = this.input.consumeClick();
    if (!click) return;
    const star = this.pick(click.ndcX, click.ndcY);
    if (star) this.ship.travelTo(star);
  }

  dispose(): void {}

  private pick(ndcX: number, ndcY: number): StarRef | null {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), this.camera);
    const { ray } = this.raycaster;
    // Angle subtended by one CSS pixel at the centre of the view.
    const pixelAngle = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.canvas.clientHeight;
    const i = pickPoint(ray.origin, ray.direction, this.positions, PICK_RADIUS_PX * pixelAngle);
    return i >= 0 ? this.galaxy.stars[i]! : null;
  }
}
