import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { GalaxyData, StarRef } from '../gen/galaxy';
import type { NebulaData } from '../gen/nebulas';
import type { GalaxyShip } from './GalaxyShip';
import { pickNebula, pickPoint } from './pickPoint';

/** How close (in CSS pixels) the pointer must be to a star's dot to pick it. */
const PICK_RADIUS_PX = 10;

/**
 * Hover finds the star under the pointer, or else the nebula; a click sets
 * course for the star, or for the star at the nebula's heart.
 */
export class GalaxyPicker implements Entity {
  hovered: StarRef | null = null;
  /** The nebula under the pointer when no star is. */
  hoveredNebula: NebulaData | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly inverse = new THREE.Matrix4();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly canvas: HTMLElement,
    private readonly galaxy: GalaxyData,
    private readonly positions: Float32Array,
    private readonly ship: GalaxyShip,
    /** The galaxy's rotating root, whose local frame `positions` are in. */
    private readonly root: THREE.Object3D,
  ) {}

  update(): void {
    const { pointer } = this.input;
    const hovering = pointer.inside && !this.input.isDragging && !this.input.blocked;
    this.hovered = hovering ? this.pick(pointer.ndcX, pointer.ndcY) : null;
    this.hoveredNebula = hovering && !this.hovered ? this.pickNebula(pointer.ndcX, pointer.ndcY) : null;

    const click = this.input.consumeClick();
    if (!click) return;
    const star = this.pick(click.ndcX, click.ndcY);
    const nebula = star ? null : this.pickNebula(click.ndcX, click.ndcY);
    const destination = star ?? (nebula ? this.galaxy.stars[nebula.star] : null);
    if (destination) this.ship.travelTo(destination);
  }

  dispose(): void {}

  private pickNebula(ndcX: number, ndcY: number): NebulaData | null {
    const { ray } = this.ray(ndcX, ndcY);
    const i = pickNebula(ray.origin, ray.direction, this.galaxy.nebulas);
    return i >= 0 ? this.galaxy.nebulas[i]! : null;
  }

  /** The pointer's ray in galaxy coordinates. */
  private ray(ndcX: number, ndcY: number): THREE.Raycaster {
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), this.camera);
    // A pure rotation, so angles (and the pick radius) are unchanged.
    this.raycaster.ray.applyMatrix4(this.inverse.copy(this.root.matrixWorld).invert());
    return this.raycaster;
  }

  private pick(ndcX: number, ndcY: number): StarRef | null {
    const { ray } = this.ray(ndcX, ndcY);
    // Angle subtended by one CSS pixel at the centre of the view.
    const pixelAngle = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.canvas.clientHeight;
    const i = pickPoint(ray.origin, ray.direction, this.positions, PICK_RADIUS_PX * pixelAngle);
    return i >= 0 ? this.galaxy.stars[i]! : null;
  }
}
