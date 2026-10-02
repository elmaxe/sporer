import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { MarkerRing } from '../player/MarkerRing';
import type { GroundHeight } from './ground';
import type { PlanetShip } from './PlanetShip';

/** Target ring size, in planet-level units. */
const MARKER_SIZE = 3;

/** The target ring floats this far above the ground. */
const MARKER_LIFT = 0.3;

/**
 * Click the globe to fly there: the click ray is tested against the terrain
 * as drawn (`hit`: the ground's radius in each direction, so a click on a
 * hillside flies to that hillside), or the sea's surface over water. The
 * sky isn't clickable. A pulsing ring lies flat on the ground at the
 * destination while the autopilot flies.
 */
export class PlanetPicker implements Entity {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly point = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly ring: MarkerRing;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly input: Input,
    private readonly ship: PlanetShip,
    /** Where a ray meets the ground (see PlanetGlobe.groundHit), written into the second argument. */
    private readonly hit: (ray: THREE.Ray, out: THREE.Vector3) => number | null,
    /** The ground's radius in a unit direction, for the ring. */
    private readonly height: GroundHeight,
    /** Gets the clicked ground point first: true if it used the click (e.g. to fire a weapon), and the ship stays. */
    private readonly intercept: ((point: THREE.Vector3) => boolean) | null = null,
  ) {
    this.ring = new MarkerRing(scene, '#66ffcc');
  }

  update(frameDt: number): void {
    const click = this.input.consumeClick();
    if (click) {
      this.raycaster.setFromCamera(this.ndc.set(click.ndcX, click.ndcY), this.camera);
      if (this.hit(this.raycaster.ray, this.point) !== null && !this.intercept?.(this.point)) this.ship.moveTo(this.point);
    }

    if (!this.ship.enRoute) {
      this.ring.hide();
      return;
    }
    // On the ground at the destination, lying flat on it (the ship's own destination is up at its flying height).
    this.normal.copy(this.ship.destination).normalize();
    this.point.copy(this.normal).multiplyScalar(this.height(this.normal) + MARKER_LIFT);
    this.ring.place(this.point, MARKER_SIZE, 0.9, this.normal, frameDt);
  }

  dispose(): void {
    this.ring.dispose();
  }
}
