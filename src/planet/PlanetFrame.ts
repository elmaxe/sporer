import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Planet } from '../world/Planet';
import { bodyFrame, localToSystem, planetScale } from './frame';

/** Tunables, exposed in the debug panel. */
export const planetParams = {
  /**
   * The body frame turns at the planet's spin times this. Real spins (up to a
   * turn every ~20 s) would make the sky race past, so days are longer here.
   */
  spinScale: 0.1,
};

/**
 * The planet level's clock and its link to system space. Holds the system
 * time (it keeps running from where the system level left off, with pure
 * orbit maths and no physics) and, at the interpolated render time, where the
 * body is in the system and how its frame is oriented. Must be the level's
 * first entity: everything else reads it.
 */
export class PlanetFrame implements Entity {
  /** Planet-level units per system unit. */
  readonly scale: number;
  /** Body frame → system space rotation, and its inverse. */
  readonly quaternion = new THREE.Quaternion();
  readonly inverse = new THREE.Quaternion();
  /** The body's centre in system space. */
  readonly center = new THREE.Vector3();
  private _time: number;
  private prevTime: number;
  private _renderTime: number;
  private startTime: number;
  private startSpin: number;
  private _spinAngle = 0;

  constructor(
    readonly body: Planet,
    time: number,
    debug: Debug,
  ) {
    this.scale = planetScale(body.radius);
    this._time = this.prevTime = this._renderTime = this.startTime = time;
    this.startSpin = body.spinAngle;
    this.restart(time);
    debug.folder('Planet')?.add(planetParams, 'spinScale', 0, 1);
  }

  /**
   * Starts the clock at system time `time`, carrying on from the system view's
   * spin, so the ground below is what was below there (e.g. when the level was
   * built a moment before it took over).
   */
  restart(time: number): void {
    this._time = this.prevTime = this._renderTime = this.startTime = time;
    this.startSpin = this.body.spinAngle;
    this.pose(time);
  }

  /** System time after the latest fixed step. */
  get time(): number {
    return this._time;
  }

  /** System time of the frame being drawn (interpolated between fixed steps). */
  get renderTime(): number {
    return this._renderTime;
  }

  fixedUpdate(dt: number): void {
    this.prevTime = this._time;
    this._time += dt;
  }

  update(_frameDt: number, alpha: number): void {
    this._renderTime = this.prevTime + (this._time - this.prevTime) * alpha;
    this.pose(this._renderTime);
  }

  /** The body's spin about its axis at the render time (hand it back to the system view on leaving). */
  get spinAngle(): number {
    return this._spinAngle;
  }

  /** The body's spin about its axis at system time `time`. */
  spinAt(time: number): number {
    return this.startSpin + this.body.config.spin * planetParams.spinScale * (time - this.startTime);
  }

  /** A planet-level point in system space. */
  toSystemPoint(local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return localToSystem(local, this.center, this.quaternion, this.scale, out);
  }

  /** A system-space direction in the body frame. */
  toLocalDirection(dir: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(dir).applyQuaternion(this.inverse);
  }

  /** A body-frame direction in system space. */
  toSystemDirection(dir: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(dir).applyQuaternion(this.quaternion);
  }

  dispose(): void {}

  private pose(time: number): void {
    const { config } = this.body;
    this.body.positionAt(time, this.center);
    this._spinAngle = this.spinAt(time);
    bodyFrame(config.tilt ?? 0, this._spinAngle, this.quaternion);
    this.inverse.copy(this.quaternion).invert();
  }
}
