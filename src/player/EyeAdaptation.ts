import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Sight } from '../world/CelestialBody';
import { adaptExposure, exposureParams, starGlare, targetExposure } from './exposure';

/**
 * Adapts the exposure to how much of the view the star(s) fill (see
 * exposure.ts). Visual only; runs after the camera has moved. The level
 * applies `exposure` to the stars and the renderer.
 */
export class EyeAdaptation implements Entity {
  /** 1 = dark-adapted (stars blaze); lower when a star fills the view. */
  exposure = 1;
  private settling = false;
  private readonly forward = new THREE.Vector3();
  private readonly toStar = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly stars: readonly Sight[],
    debug: Debug,
  ) {
    const f = debug.folder('Eye adaptation');
    f?.add(exposureParams, 'starIntensity', 1, 6);
    f?.add(exposureParams, 'sensitivity', 0, 20);
    f?.add(exposureParams, 'minExposure', 0.1, 1);
    f?.add(exposureParams, 'darkenSeconds', 0.05, 3);
    f?.add(exposureParams, 'brightenSeconds', 0.05, 5);
    f?.add(exposureParams, 'sceneDimming', 0, 1);
  }

  /** The exposure the eye is heading for, from the current view. */
  get target(): number {
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    this.camera.getWorldDirection(this.forward);
    let glare = 0;
    for (const star of this.stars) {
      this.toStar.subVectors(star.renderPosition, this.camera.position);
      const d = this.toStar.length();
      const angularRadius = d <= star.radius ? Math.PI / 2 : Math.asin(star.radius / d);
      glare += starGlare(angularRadius, this.forward.angleTo(this.toStar), halfFov);
    }
    return targetExposure(glare);
  }

  /** Jumps to the adapted exposure on the next update, once the camera is in place. */
  settleNext(): void {
    this.settling = true;
  }

  update(frameDt: number): void {
    this.exposure = this.settling ? this.target : adaptExposure(this.exposure, this.target, frameDt);
    this.settling = false;
  }

  dispose(): void {}
}
