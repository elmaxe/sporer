import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Debug } from '../core/Debug';
import type { Ship } from './Ship';

export const cameraParams = {
  /** Offset from the ship in ship-local space. */
  distance: 14,
  height: 4,
  /** Seconds to close ~63% of the gap to the target position. 0 = rigid. */
  lag: 0.12,
  /** How far ahead of the ship the camera looks. */
  lookAhead: 20,
};

/** Third-person camera that trails the ship with exponential smoothing. */
export class ChaseCamera implements Entity {
  private snapped = false;
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly target: Ship,
    debug: Debug,
  ) {
    const f = debug.folder('Camera');
    f?.add(cameraParams, 'distance', 4, 60);
    f?.add(cameraParams, 'height', 0, 20);
    f?.add(cameraParams, 'lag', 0, 1);
    f?.add(cameraParams, 'lookAhead', 0, 100);
  }

  update(frameDt: number): void {
    const ship = this.target.object;

    this.desired
      .set(0, cameraParams.height, cameraParams.distance)
      .applyQuaternion(ship.quaternion)
      .add(ship.position);

    if (!this.snapped || cameraParams.lag <= 0) {
      this.camera.position.copy(this.desired);
      this.snapped = true;
    } else {
      this.camera.position.lerp(this.desired, 1 - Math.exp(-frameDt / cameraParams.lag));
    }

    this.lookAt.set(0, 0, -cameraParams.lookAhead).applyQuaternion(ship.quaternion).add(ship.position);
    this.camera.lookAt(this.lookAt);
  }

  dispose(): void {}
}
