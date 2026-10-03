import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { zoomFraction } from '../player/zoomCurve';

/** Where the grove camera is, to put the next build's camera in the same place (see PlantLabLevel.carry). */
export interface GroveCameraState {
  /** The spot looked at: a turn of the planet from the starting spot (its +Y the spot's up). */
  readonly focus: THREE.Quaternion;
  /** Radians: the heading about the spot's up, and the camera's elevation above its horizon. */
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
}

export interface GroveCameraParams {
  /** The planet: its centre and ground radius (where the plants stand). */
  readonly centre: THREE.Vector3;
  readonly radius: number;
  /** The camera's centre above the ground (about the UFO's height in the game). */
  readonly eye: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  /** Starting distance and elevation (radians). */
  readonly distance: number;
  readonly pitch: number;
}

const ROTATE_SPEED = 0.005;
const ZOOM_SPEED = 0.0025;
/** Seconds to close ~63% of the gap to the requested view. */
const DAMPING = 0.1;
/** Lowest elevation close to the ground (the camera is kept above it anyway). */
const MIN_PITCH = THREE.MathUtils.degToRad(-60);
const MAX_PITCH = Math.PI / 2;
/** Share of the zoom range (log scale) over which dragging turns from orbiting the spot to turning the globe. */
const GLOBE_FROM = 0.55;
const GLOBE_TO = 0.85;
/** Keys move the spot at this many times the camera's distance per second, up to half the radius (Shift: three times as fast). */
const WALK_SPEED = 0.8;
const BOOST = 3;
/** Never closer to the ground than this. */
const CLEARANCE = 1;

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** 0 close to the ground (drag orbits the spot) → 1 zoomed out (drag turns the globe, the camera straight above). */
export function globeWeight(fraction: number): number {
  return THREE.MathUtils.smoothstep(fraction, GLOBE_FROM, GLOBE_TO);
}

/**
 * The plant lab grove's camera over a whole planet. Close up it orbits a spot
 * a UFO's height above the ground, like the game's low orbit (drag turns
 * round it, scroll zooms); zooming out it rises to look straight down, the
 * globe whole in view, and dragging turns the globe under it (grabbing the
 * ground). WASD or the arrow keys walk the spot over the ground at any zoom.
 */
export class GroveCamera implements Entity {
  /** The spot (see GroveCameraState.focus): `target` as asked, `focus` eased towards it. */
  private readonly focus = new THREE.Quaternion();
  private readonly targetFocus = new THREE.Quaternion();
  private yaw = 0;
  private targetYaw = 0;
  private pitch: number;
  private targetPitch: number;
  /** The elevation the player asked for; `targetPitch` is it held above the zoom's lowest. */
  private wantedPitch: number;
  private distance: number;
  private targetDistance: number;
  private readonly heading = new THREE.Quaternion();
  private readonly turn = new THREE.Quaternion();
  private readonly orient = new THREE.Quaternion();
  private readonly up = new THREE.Vector3();
  private readonly pivot = new THREE.Vector3();
  private readonly back = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Pick<Input, 'consumeDrag' | 'consumeWheel' | 'axis' | 'isDown'>,
    readonly params: GroveCameraParams,
  ) {
    this.distance = this.targetDistance = params.distance;
    this.pitch = this.targetPitch = this.wantedPitch = params.pitch;
    this.place();
  }

  /** 0 → 1 from the closest zoom to the farthest (log scale). */
  get zoomFraction(): number {
    return zoomFraction(this.distance, this.params.minDistance, this.params.maxDistance);
  }

  /** Camera from heading `yaw` and elevation `pitch` (radians) round the spot, `distance` away (jumps there). */
  look(yaw: number, pitch: number, distance?: number): void {
    this.yaw = this.targetYaw = yaw;
    if (distance !== undefined) this.distance = this.targetDistance = THREE.MathUtils.clamp(distance, this.params.minDistance, this.params.maxDistance);
    this.pitch = this.targetPitch = this.wantedPitch = THREE.MathUtils.clamp(pitch, this.lowestPitch(), MAX_PITCH);
    this.place();
  }

  state(): GroveCameraState {
    return { focus: this.targetFocus.clone(), yaw: this.targetYaw, pitch: this.wantedPitch, distance: this.targetDistance };
  }

  /** Jumps to a state saved by `state()` (from a build of the same planet). */
  restore(s: GroveCameraState): void {
    this.focus.copy(s.focus);
    this.targetFocus.copy(s.focus);
    this.look(s.yaw, s.pitch, s.distance);
    this.wantedPitch = s.pitch;
  }

  /** The spot's up (unit, world), as of the last update. */
  spotUp(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(Y).applyQuaternion(this.focus);
  }

  update(frameDt: number): void {
    const drag = this.input.consumeDrag();
    const wheel = this.input.consumeWheel();
    const { minDistance, maxDistance, radius } = this.params;
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * Math.exp(wheel * ZOOM_SPEED), minDistance, maxDistance);

    const w = globeWeight(zoomFraction(this.targetDistance, minDistance, maxDistance));
    // Orbiting the spot, less of it as the view rises.
    this.targetYaw -= drag.x * ROTATE_SPEED * (1 - w);
    if (drag.y !== 0) this.wantedPitch = THREE.MathUtils.clamp(this.targetPitch + drag.y * ROTATE_SPEED * (1 - w), MIN_PITCH, MAX_PITCH);
    this.targetPitch = THREE.MathUtils.clamp(this.wantedPitch, this.lowestPitch(w), MAX_PITCH);
    // Turning the globe: the ground under the pointer follows it (its pixels at the camera's height over the ground).
    if (w > 0 && (drag.x !== 0 || drag.y !== 0)) {
      const perPixel = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * (this.targetDistance + this.params.eye)) / Math.max(1, innerHeight);
      const k = (w * perPixel) / radius;
      this.turnSpot(Z, drag.x * k);
      this.turnSpot(X, -drag.y * k);
    }
    // Walking: forward is the heading, along the ground.
    const forward = this.input.axis('KeyS', 'KeyW') || this.input.axis('ArrowDown', 'ArrowUp');
    const right = this.input.axis('KeyA', 'KeyD') || this.input.axis('ArrowLeft', 'ArrowRight');
    if (forward !== 0 || right !== 0) {
      const boost = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight') ? BOOST : 1;
      const step = (WALK_SPEED * boost * THREE.MathUtils.clamp(this.targetDistance, 4, radius / 2) * frameDt) / radius / Math.hypot(forward, right);
      this.turnSpot(X, -forward * step);
      this.turnSpot(Z, -right * step);
    }

    const k = 1 - Math.exp(-frameDt / DAMPING);
    this.focus.slerp(this.targetFocus, k);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    // In log space, so zooming feels even at every scale.
    this.distance *= Math.pow(this.targetDistance / this.distance, k);
    this.place();
  }

  dispose(): void {}

  /** The lowest elevation at globe weight `w`: rising to straight down as the view takes in the globe. */
  private lowestPitch(w = globeWeight(this.zoomFraction)): number {
    return THREE.MathUtils.lerp(MIN_PITCH, MAX_PITCH, w);
  }

  /** Turns the spot by `angle` about the heading frame's `axis` (X: forward/back, Z: sideways). */
  private turnSpot(axis: THREE.Vector3, angle: number): void {
    this.heading.setFromAxisAngle(Y, this.targetYaw);
    this.turn.setFromAxisAngle(axis, angle);
    // focus · heading · turn · heading⁻¹: the turn in the heading's own frame, the heading itself unchanged.
    this.targetFocus.multiply(this.heading).multiply(this.turn).multiply(this.heading.invert()).normalize();
  }

  /** Puts the camera at the current spot, heading, elevation and distance, above the ground. */
  private place(): void {
    const { centre, radius, eye } = this.params;
    this.spotUp(this.up);
    this.pivot.copy(centre).addScaledVector(this.up, radius + eye);
    // focus · heading · tilt: looking along the heading's -Z, tipped down by the elevation.
    this.orient.copy(this.focus).multiply(this.heading.setFromAxisAngle(Y, this.yaw)).multiply(this.turn.setFromAxisAngle(X, -this.pitch));
    const position = this.camera.position.copy(this.pivot).addScaledVector(this.back.copy(Z).applyQuaternion(this.orient), this.distance);
    this.camera.quaternion.copy(this.orient);
    this.camera.up.copy(this.up);
    // Pushed out of the ground (looking up from under the spot), still looking at it.
    const d = position.distanceTo(centre);
    if (d < radius + CLEARANCE) {
      position.sub(centre).multiplyScalar((radius + CLEARANCE) / d).add(centre);
      this.camera.lookAt(this.pivot);
    }
  }
}
