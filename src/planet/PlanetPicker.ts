import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { MarkerRing } from '../player/MarkerRing';
import { PLANET_RADIUS } from './frame';
import type { PlanetShip } from './PlanetShip';

/** Target ring size, in planet-level units. */
const MARKER_SIZE = 3;

/**
 * Click the globe to fly there: the click ray is tested against the sea-level
 * sphere (cheaper than the terrain mesh, and close enough from orbit). The
 * sky isn't clickable. A pulsing ring lies flat above the destination while
 * the autopilot flies.
 */
export class PlanetPicker implements Entity {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly sphere = new THREE.Sphere(new THREE.Vector3(), PLANET_RADIUS);
  private readonly point = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly ring: MarkerRing;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly input: Input,
    private readonly ship: PlanetShip,
  ) {
    this.ring = new MarkerRing(scene, '#66ffcc');
  }

  update(frameDt: number): void {
    const click = this.input.consumeClick();
    if (click) {
      this.raycaster.setFromCamera(this.ndc.set(click.ndcX, click.ndcY), this.camera);
      if (this.raycaster.ray.intersectSphere(this.sphere, this.point)) this.ship.moveTo(this.point);
    }

    if (!this.ship.enRoute) {
      this.ring.hide();
      return;
    }
    const { destination } = this.ship;
    this.ring.place(destination, MARKER_SIZE, 0.9, this.normal.copy(destination).normalize(), frameDt);
  }

  dispose(): void {
    this.ring.dispose();
  }
}
