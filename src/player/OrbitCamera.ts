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
  /**
   * While this returns true (e.g. the autopilot is still flying), scrolling in
   * is held back rather than applied, and played out smoothly once it turns
   * false, so zooming in (and descending) happens at the destination.
   */
  holdZoomIn?: () => boolean;
  /**
   * Live "up" direction (e.g. a ship's radial direction over a planet). Yaw and
   * pitch are then measured in the plane perpendicular to it, and that plane
   * is carried along as `up` turns, so the view doesn't spin. Default +Y.
   */
  up?: THREE.Vector3;
  /** Lowest pitch in radians (default -80°). */
  minPitch?: number;
  /** Starting pitch in radians (default 22°). */
  pitch?: number;
}

const MIN_PITCH = THREE.MathUtils.degToRad(-80);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const MAX_PITCH = THREE.MathUtils.degToRad(85);
/** Wheel pixels past a limit (about two notches) that count as "keep scrolling". */
const PAST_LIMIT_PX = 180;
/** Seconds for the past-limit tally to fade, so slow, stray scrolling doesn't add up. */
const PAST_LIMIT_DECAY = 0.6;
/** Most scroll-in (wheel pixels) kept while zooming in is held: min to max zoom and past the limit. */
const MAX_HELD_WHEEL = 2500;
/** How fast held scroll-in is played out once released, in wheel pixels per second. */
const HELD_RELEASE_RATE = 1000;

/**
 * Spore-style orbit camera, always centred on the target. Scroll zooms
 * (exponentially), left- or right-drag orbits. Yaw 0 looks along -Z.
 * A focus override (`setFocus`) can pull the centre over to another point,
 * e.g. to fly at a planet during a level transition.
 */
export class OrbitCamera implements Entity {
  private yaw = 0;
  private pitch: number;
  private distance: number;
  private targetYaw = 0;
  private targetPitch: number;
  private targetDistance: number;
  private pastLimit = 0;
  /** Scroll-in (negative wheel pixels) held back by `holdZoomIn`, still to be played out. */
  private heldWheel = 0;
  private readonly minPitch: number;
  private focus: THREE.Vector3 | null = null;
  private focusBlend = 0;
  /** Carries the yaw/pitch frame along with `options.up` (identity for world up). */
  private readonly frame = new THREE.Quaternion();
  private readonly frameUp = new THREE.Vector3(0, 1, 0);
  private readonly turn = new THREE.Quaternion();
  private readonly offset = new THREE.Vector3();
  private readonly center = new THREE.Vector3();

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
    this.pitch = this.targetPitch = options.pitch ?? THREE.MathUtils.degToRad(22);
    this.minPitch = options.minPitch ?? MIN_PITCH;
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
    this.heldWheel = 0;
  }

  /**
   * Centres the view on `point` (a live vector) instead of the target, mixed
   * by `blend` (0 = target, 1 = point). `null` returns to the target.
   */
  setFocus(point: THREE.Vector3 | null, blend = 1): void {
    this.focus = point;
    this.focusBlend = point ? blend : 0;
  }

  /** Jumps to the yaw and pitch that put the camera in world direction `dir` from the centre. */
  lookFrom(dir: THREE.Vector3): void {
    const d = this.offset.copy(dir).normalize();
    this.yaw = this.targetYaw = Math.atan2(d.x, d.z);
    this.pitch = this.targetPitch = THREE.MathUtils.clamp(Math.asin(d.y), this.minPitch, MAX_PITCH);
  }

  /** Smoothly zooms to `distance` (clamped to the limits). */
  zoomTo(distance: number): void {
    this.targetDistance = THREE.MathUtils.clamp(distance, this.params.minDistance, this.params.maxDistance);
  }

  update(frameDt: number): void {
    const p = this.params;
    const drag = this.input.consumeDrag();
    this.targetYaw -= drag.x * p.rotateSpeed;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + drag.y * p.rotateSpeed, this.minPitch, MAX_PITCH);

    const wheel = this.holdZoomIn(this.input.consumeWheel(), frameDt);
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
    const up = this.options.up;
    if (up) {
      // Parallel transport: turn the frame by the smallest rotation taking the old up to the new one.
      this.frame.premultiply(this.turn.setFromUnitVectors(this.frameUp, up));
      this.frameUp.copy(up);
      this.offset.applyQuaternion(this.frame);
    }
    this.center.copy(this.target.position);
    if (this.focus) this.center.lerp(this.focus, this.focusBlend);
    // The camera is shared between levels, so always set its up.
    this.camera.up.copy(up ?? WORLD_UP);
    this.camera.position.copy(this.center).addScaledVector(this.offset, this.distance);
    this.camera.lookAt(this.center);
  }

  dispose(): void {}

  /**
   * Holds back scroll-in while `options.holdZoomIn` says so, and plays it out
   * after. Returns the wheel movement to apply this frame. Scrolling out
   * applies at once and drops whatever was held.
   */
  private holdZoomIn(wheel: number, frameDt: number): number {
    if (wheel > 0) {
      this.heldWheel = 0;
      return wheel;
    }
    if (this.options.holdZoomIn?.()) {
      this.heldWheel = Math.max(this.heldWheel + wheel, -MAX_HELD_WHEEL);
      return 0;
    }
    const release = Math.max(this.heldWheel, -HELD_RELEASE_RATE * frameDt);
    this.heldWheel -= release;
    return wheel + release;
  }

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
