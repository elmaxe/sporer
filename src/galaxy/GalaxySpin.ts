import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';

export const galaxySpinParams = {
  /** Real minutes per full turn of the galaxy: slow enough to barely notice. */
  minutesPerTurn: 60,
};

/**
 * Turns the galaxy's root group slowly about +Y. Stars, glows, dust and the
 * ship live in the root and keep working in galaxy coordinates; the camera
 * follows the ship's world position but doesn't turn with it, so the galaxy
 * is seen to rotate. The positive angle makes the arms trail (their angle
 * grows outwards; a turn about +Y by φ moves every star's polar angle by −φ).
 * Runs first in the level, so everything after it sees this frame's matrix.
 */
export class GalaxySpin implements Entity {
  constructor(
    readonly root: THREE.Object3D,
    debug: Debug,
  ) {
    debug.folder('Galaxy spin')?.add(galaxySpinParams, 'minutesPerTurn', 0.2, 240);
  }

  /** Current turn angle in radians, [0, 2π). */
  get angle(): number {
    return this.root.rotation.y;
  }

  update(frameDt: number): void {
    const turn = (Math.PI * 2 * frameDt) / (galaxySpinParams.minutesPerTurn * 60);
    this.root.rotation.y = (this.root.rotation.y + turn) % (Math.PI * 2);
    this.root.updateMatrixWorld();
  }

  dispose(): void {}
}
