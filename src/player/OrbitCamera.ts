import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { Debug } from '../core/Debug';
import { viewFreeze } from '../world/viewFreeze';

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
   * While this returns true (e.g. the autopilot is still flying), zooming works
   * as usual but scrolling past a limit doesn't leave the level: the changes of
   * level wait until the ship is where it's going.
   */
  zoomLimitsHold?: () => boolean;
  /**
   * Moves a camera position out of anything it must not be inside (e.g. a
   * planet the view dips into from below, or a zoom that shrinks faster than
   * the centre moves), in place. Runs on the camera's final position, also
   * while a view override (`setView`) sets it.
   */
  keepOut?: (position: THREE.Vector3) => void;
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
  /**
   * How far the view may tip up (radians, default 0): dragging on past the
   * lowest pitch turns the camera, where it stands, to look up above the
   * target (e.g. at the sky over a planet) instead of lowering it further.
   */
  lookUp?: number;
}

const MIN_PITCH = THREE.MathUtils.degToRad(-80);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3();
/** A camera looks along its local -Z, so +Z points from what it looks at back to it. */
const BACK = new THREE.Vector3(0, 0, 1);
/** A turn about the camera's local +X tips its view up. */
const RIGHT = new THREE.Vector3(1, 0, 0);
const MAX_PITCH = THREE.MathUtils.degToRad(85);
/** Wheel pixels past a limit (about two notches) that count as "keep scrolling". */
const PAST_LIMIT_PX = 180;
/** Seconds for the past-limit tally to fade, so slow, stray scrolling doesn't add up. */
const PAST_LIMIT_DECAY = 0.6;

/**
 * Spore-style orbit camera, always centred on the target. Scroll zooms
 * (exponentially), left- or right-drag orbits. Yaw 0 looks along -Z.
 * A focus override (`setFocus`) can pull the centre over to another point,
 * e.g. to fly at a planet during a level transition, and a view override
 * (`setView`) can turn the camera to any orientation about the centre, e.g.
 * to match another level's camera. An aim (`setAim`) turns the camera, where it
 * is, to look at another point while the centre stays in view.
 */
export class OrbitCamera implements Entity {
  private yaw = 0;
  private pitch: number;
  private distance: number;
  private targetYaw = 0;
  private targetPitch: number;
  /** The pitch the player asked for (by dragging); `targetPitch` is it held above the live minimum. */
  private wantedPitch: number;
  private targetDistance: number;
  private pastLimit = 0;
  private readonly baseMinPitch: number;
  private minPitch: number;
  /** How far the view is tipped up past the target (see `OrbitOptions.lookUp`), as with the pitch. */
  private lookUp = 0;
  private targetLookUp = 0;
  private wantedLookUp = 0;
  private maxLookUp: number;
  private focus: THREE.Vector3 | null = null;
  private focusBlend = 0;
  private view: THREE.Quaternion | null = null;
  private viewBlend = 0;
  private aim: THREE.Vector3 | null = null;
  private aimBlend = 0;
  private aimLimit = 0;
  /** Carries the yaw/pitch frame along with `options.up` (identity for world up). */
  private readonly frame = new THREE.Quaternion();
  private readonly frameUp = new THREE.Vector3(0, 1, 0);
  private readonly turn = new THREE.Quaternion();
  private readonly offset = new THREE.Vector3();
  private readonly center = new THREE.Vector3();
  private readonly back = new THREE.Vector3();
  private readonly look = new THREE.Matrix4();
  private readonly orient = new THREE.Quaternion();
  private readonly toCentre = new THREE.Vector3();
  private readonly toAim = new THREE.Vector3();
  private readonly tip = new THREE.Quaternion();

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
    this.pitch = this.targetPitch = this.wantedPitch = options.pitch ?? THREE.MathUtils.degToRad(22);
    this.minPitch = this.baseMinPitch = options.minPitch ?? MIN_PITCH;
    this.maxLookUp = options.lookUp ?? 0;
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

  /**
   * Centres the view on `point` (a live vector) instead of the target, mixed
   * by `blend` (0 = target, 1 = point). `null` returns to the target.
   */
  setFocus(point: THREE.Vector3 | null, blend = 1): void {
    this.focus = point;
    this.focusBlend = point ? blend : 0;
  }

  /**
   * Turns the camera to orientation `view` (a live quaternion; any roll),
   * still `distance` from the centre and looking at it, mixed with its own
   * orbit by `blend` (0 = own, 1 = `view`). `null` returns to the orbit.
   */
  setView(view: THREE.Quaternion | null, blend = 1): void {
    this.view = view;
    this.viewBlend = view ? blend : 0;
  }

  /**
   * Looks at `point` (a live vector) instead of the centre, where the camera
   * stands, mixed by `blend` (0 = the centre, 1 = `point`), but never turning
   * more than `limit` radians away from the centre, which therefore stays in
   * view. `null` looks at the centre again. Ignored while a view override is
   * in use.
   */
  setAim(point: THREE.Vector3 | null, blend = 1, limit = Math.PI): void {
    this.aim = point;
    this.aimBlend = point ? blend : 0;
    this.aimLimit = limit;
  }

  /** The camera orientation of the orbit's current yaw, pitch and look-up (ignoring any view override). */
  orientation(out: THREE.Quaternion): THREE.Quaternion {
    out.setFromRotationMatrix(this.look.lookAt(this.offset, ORIGIN, this.options.up ?? WORLD_UP));
    return this.lookUp > 0 ? out.multiply(this.tip.setFromAxisAngle(RIGHT, this.lookUp)) : out;
  }

  /**
   * Jumps to the yaw and pitch that put the camera in world direction `dir`
   * from the centre (measured against the live `up` if there is one). With
   * `keepPitch`, only the heading is taken from `dir`.
   */
  lookFrom(dir: THREE.Vector3, keepPitch = false): void {
    const d = this.back.copy(dir).normalize();
    const { up } = this.options;
    if (up) {
      // Into the yaw/pitch frame as the next update will carry it to `up`.
      const frame = this.orient.copy(this.frame).premultiply(this.turn.setFromUnitVectors(this.frameUp, up));
      d.applyQuaternion(frame.invert());
    }
    this.yaw = this.targetYaw = Math.atan2(d.x, d.z);
    if (!keepPitch) {
      this.pitch = this.targetPitch = this.wantedPitch = THREE.MathUtils.clamp(Math.asin(d.y), this.minPitch, MAX_PITCH);
    }
  }

  /**
   * Raises or lowers the lowest pitch (radians, never below the one it was
   * made with): the view tips up smoothly while below it, and back down to
   * the pitch the player chose as it lowers again.
   */
  setMinPitch(pitch: number): void {
    this.minPitch = THREE.MathUtils.clamp(pitch, this.baseMinPitch, MAX_PITCH);
  }

  /**
   * Limits how far the view may tip up (radians, at most the `lookUp` it was
   * made with): it eases down while over it, and back to what the player
   * chose as the limit rises again.
   */
  setMaxLookUp(angle: number): void {
    this.maxLookUp = THREE.MathUtils.clamp(angle, 0, this.options.lookUp ?? 0);
  }

  /** The world direction from the centre to the camera (unit), as of the last update. */
  direction(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.offset);
  }

  /** How far the view is tipped up past the centre, in radians (see `OrbitOptions.lookUp`). */
  get lookUpAngle(): number {
    return this.lookUp;
  }

  /** Jumps the view's tip up past the centre to `angle` radians, within its limit (e.g. restoring a debug dump). */
  setLookUp(angle: number): void {
    this.lookUp = this.targetLookUp = this.wantedLookUp = THREE.MathUtils.clamp(angle, 0, this.maxLookUp);
  }

  /** Smoothly zooms to `distance` (clamped to the limits). */
  zoomTo(distance: number): void {
    this.targetDistance = THREE.MathUtils.clamp(distance, this.params.minDistance, this.params.maxDistance);
  }

  update(frameDt: number): void {
    const p = this.params;
    const drag = this.input.consumeDrag();
    this.targetYaw -= drag.x * p.rotateSpeed;
    if (drag.y !== 0) this.dragPitch(drag.y * p.rotateSpeed);
    this.targetPitch = THREE.MathUtils.clamp(this.wantedPitch, this.minPitch, MAX_PITCH);
    this.targetLookUp = Math.min(this.wantedLookUp, this.maxLookUp);

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
    this.lookUp += (this.targetLookUp - this.lookUp) * k;
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
    // World position: the target may sit in a moving group (the galaxy's rotating root).
    this.target.getWorldPosition(this.center);
    if (this.focus) this.center.lerp(this.focus, this.focusBlend);
    // The camera is shared between levels, so always set its up.
    this.camera.up.copy(up ?? WORLD_UP);
    if (this.view && this.viewBlend > 0) {
      const q = this.orientation(this.orient).slerp(this.view, this.viewBlend);
      this.camera.quaternion.copy(q);
      this.camera.position.copy(this.center).addScaledVector(this.back.copy(BACK).applyQuaternion(q), this.distance);
      this.options.keepOut?.(this.camera.position);
      return;
    }
    this.camera.position.copy(this.center).addScaledVector(this.offset, this.distance);
    this.options.keepOut?.(this.camera.position);
    this.camera.lookAt(this.aimPoint());
    if (this.lookUp > 0) this.camera.rotateX(this.lookUp);
  }

  dispose(): void {}

  /**
   * Turns the pitch by `delta` radians (+ = the camera rises, looking further
   * down). Past the lowest pitch, lowering it tips the view up instead, and
   * raising it first tips the view back down.
   */
  private dragPitch(delta: number): void {
    if (delta > 0 && this.wantedLookUp > 0) {
      const back = Math.min(delta, this.targetLookUp);
      this.wantedLookUp = this.targetLookUp - back;
      delta -= back;
    }
    if (delta < 0 && this.maxLookUp > 0) {
      // The part of the drag that would take the pitch below its floor.
      const past = Math.min(0, delta + Math.max(0, this.targetPitch - this.minPitch));
      this.wantedLookUp = Math.min(this.maxLookUp, this.targetLookUp - past);
      delta -= past;
    }
    if (delta !== 0) this.wantedPitch = THREE.MathUtils.clamp(this.targetPitch + delta, this.baseMinPitch, MAX_PITCH);
  }

  /**
   * What the camera looks at: the centre, or towards the aim point (mixed by
   * its blend) as far as keeps the centre within `aimLimit` of the view's axis.
   * Returns a scratch vector.
   */
  private aimPoint(): THREE.Vector3 {
    const position = this.camera.position;
    if (!this.aim || this.aimBlend <= 0) return this.center;
    const toCentre = this.toCentre.subVectors(this.center, position).normalize();
    const toAim = this.toAim.subVectors(this.aim, position).normalize();
    const angle = toCentre.angleTo(toAim);
    if (angle < 1e-6) return this.center;
    // Turn from the centre towards the aim by the blend, but no more than the limit.
    const turn = Math.min(angle * this.aimBlend, this.aimLimit);
    // Rotate `toCentre` by `turn` about the axis towards `toAim`: sin-weighted mix of the two directions.
    toAim.multiplyScalar(Math.sin(turn) / Math.sin(angle));
    toCentre.multiplyScalar(Math.sin(angle - turn) / Math.sin(angle)).add(toAim);
    return toCentre.add(position);
  }

  /** Tallies wheel movement that pushes against a limit already reached, and reports it. */
  private trackPastLimit(wheel: number, frameDt: number): void {
    this.pastLimit *= Math.exp(-frameDt / PAST_LIMIT_DECAY);
    // The level changes wait until the ship has arrived (the zoom itself works meanwhile).
    // And never while the view is frozen (world/viewFreeze.ts): zooming out to look at it mustn't leave the level.
    if (viewFreeze.enabled || this.options.zoomLimitsHold?.()) this.pastLimit = 0;
    else if (wheel === 0) return;
    else this.tallyPastLimit(wheel);
  }

  private tallyPastLimit(wheel: number): void {
    const { onZoomPastLimit } = this.options;
    if (!onZoomPastLimit) return;

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
