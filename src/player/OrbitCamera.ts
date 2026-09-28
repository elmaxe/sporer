import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { Debug } from '../core/Debug';

export interface OrbitParams {
  minDistance: number;
  maxDistance: number;
  /** Zoom factor per pixel of wheel movement (exponential). */
  zoomSpeed: number;
  /** Radians per pixel of drag. */
  rotateSpeed: number;
  /** Seconds to close ~63% of the gap to the requested yaw/pitch/distance. 0 = rigid. */
  damping: number;
}

/** System-scale camera (the galaxy level has its own, see GalaxyLevel). */
export const cameraParams: OrbitParams = {
  minDistance: 12,
  maxDistance: 2500,
  zoomSpeed: 0.0025,
  rotateSpeed: 0.005,
  damping: 0.1,
};

export interface OrbitOptions {
  /** Starting distance from the target. */
  distance: number;
  /**
   * Called when the player keeps scrolling after hitting a zoom limit:
   * +1 past maxDistance (zoom out), -1 past minDistance (zoom in).
   */
  onZoomPastLimit?: (direction: 1 | -1) => void;
}

const MIN_PITCH = THREE.MathUtils.degToRad(-80);
const MAX_PITCH = THREE.MathUtils.degToRad(85);
/** Wheel pixels past a limit (about two notches) that count as "keep scrolling". */
const PAST_LIMIT_PX = 180;
/** Seconds for the past-limit tally to fade, so slow, stray scrolling doesn't add up. */
const PAST_LIMIT_DECAY = 0.6;

/**
 * Spore-style orbit camera, always centred on the target. Scroll zooms
 * (exponentially), left- or right-drag orbits. Yaw 0 looks along -Z.
 */
export class OrbitCamera implements Entity {
  private yaw = 0;
  private pitch = THREE.MathUtils.degToRad(22);
  private distance: number;
  private targetYaw = this.yaw;
  private targetPitch = this.pitch;
  private targetDistance: number;
  private pastLimit = 0;
  private readonly offset = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly target: THREE.Object3D,
    private readonly input: Input,
    private readonly params: OrbitParams,
    private readonly options: OrbitOptions,
    debug: Debug,
    debugName: string,
  ) {
    this.distance = this.targetDistance = options.distance;
    const f = debug.folder(debugName);
    f?.add(params, 'minDistance', 0.5, 100);
    f?.add(params, 'maxDistance', 100, 10000);
    f?.add(params, 'zoomSpeed', 0.0002, 0.01);
    f?.add(params, 'rotateSpeed', 0.001, 0.02);
    f?.add(params, 'damping', 0, 0.5);
  }

  /** Current (smoothed) distance from the target. */
  get zoom(): number {
    return this.distance;
  }

  /** Jumps to `distance`, ignoring the zoom limits (for scripted transitions). */
  setDistance(distance: number): void {
    this.distance = this.targetDistance = distance;
    this.pastLimit = 0;
  }

  /** Smoothly zooms to `distance` (clamped to the limits). */
  zoomTo(distance: number): void {
    this.targetDistance = THREE.MathUtils.clamp(distance, this.params.minDistance, this.params.maxDistance);
  }

  update(frameDt: number): void {
    const p = this.params;
    const drag = this.input.consumeDrag();
    this.targetYaw -= drag.x * p.rotateSpeed;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + drag.y * p.rotateSpeed, MIN_PITCH, MAX_PITCH);

    const wheel = this.input.consumeWheel();
    this.trackPastLimit(wheel, frameDt);
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance * Math.exp(wheel * p.zoomSpeed),
      p.minDistance,
      p.maxDistance,
    );

    const k = p.damping > 0 ? 1 - Math.exp(-frameDt / p.damping) : 1;
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

  /** Tallies wheel movement that pushes against a limit already reached, and reports it. */
  private trackPastLimit(wheel: number, frameDt: number): void {
    const { onZoomPastLimit } = this.options;
    if (!onZoomPastLimit) return;
    this.pastLimit *= Math.exp(-frameDt / PAST_LIMIT_DECAY);
    if (wheel === 0) return;

    // Only once the view has (almost) arrived at the limit, so the zoom is seen to finish first.
    const atMax = this.targetDistance >= this.params.maxDistance && this.distance > this.params.maxDistance * 0.8;
    const atMin = this.targetDistance <= this.params.minDistance && this.distance < this.params.minDistance * 1.25;
    if ((wheel > 0 && atMax) || (wheel < 0 && atMin)) {
      this.pastLimit += Math.abs(wheel);
      if (this.pastLimit >= PAST_LIMIT_PX) {
        this.pastLimit = 0;
        onZoomPastLimit(wheel > 0 ? 1 : -1);
      }
    } else {
      this.pastLimit = 0;
    }
  }
}
