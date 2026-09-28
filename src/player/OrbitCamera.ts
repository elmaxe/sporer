import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { Debug } from '../core/Debug';

export const cameraParams = {
  minDistance: 12,
  maxDistance: 2500,
  /** Zoom factor per pixel of wheel movement (exponential). */
  zoomSpeed: 0.0015,
  /** Radians per pixel of drag. */
  rotateSpeed: 0.005,
  /** Seconds to close ~63% of the gap to the requested yaw/pitch/distance. 0 = rigid. */
  damping: 0.1,
};

const MIN_PITCH = THREE.MathUtils.degToRad(-80);
const MAX_PITCH = THREE.MathUtils.degToRad(85);

/**
 * Spore-style orbit camera, always centred on the ship. Scroll zooms
 * (exponentially), left- or right-drag orbits. Yaw 0 looks along -Z.
 */
export class OrbitCamera implements Entity {
  private yaw = 0;
  private pitch = THREE.MathUtils.degToRad(22);
  private distance = 45;
  private targetYaw = this.yaw;
  private targetPitch = this.pitch;
  private targetDistance = this.distance;
  private readonly offset = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly target: THREE.Object3D,
    private readonly input: Input,
    debug: Debug,
  ) {
    const f = debug.folder('Camera');
    f?.add(cameraParams, 'minDistance', 2, 100);
    f?.add(cameraParams, 'maxDistance', 100, 10000);
    f?.add(cameraParams, 'zoomSpeed', 0.0002, 0.01);
    f?.add(cameraParams, 'rotateSpeed', 0.001, 0.02);
    f?.add(cameraParams, 'damping', 0, 0.5);
  }

  /** Current (smoothed) distance from the ship. */
  get zoom(): number {
    return this.distance;
  }

  update(frameDt: number): void {
    const drag = this.input.consumeDrag();
    this.targetYaw -= drag.x * cameraParams.rotateSpeed;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + drag.y * cameraParams.rotateSpeed, MIN_PITCH, MAX_PITCH);
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance * Math.exp(this.input.consumeWheel() * cameraParams.zoomSpeed),
      cameraParams.minDistance,
      cameraParams.maxDistance,
    );

    const k = cameraParams.damping > 0 ? 1 - Math.exp(-frameDt / cameraParams.damping) : 1;
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    // Smooth the distance in log space so zooming feels even at every scale.
    this.distance *= Math.pow(this.targetDistance / this.distance, k);

    const cosPitch = Math.cos(this.pitch);
    this.offset.set(Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), Math.cos(this.yaw) * cosPitch);
    this.camera.position.copy(this.target.position).addScaledVector(this.offset, this.distance);
    this.camera.lookAt(this.target.position);
  }

  dispose(): void {}
}
