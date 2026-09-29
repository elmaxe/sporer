import * as THREE from 'three';
import type { SoundEffects } from '../audio/sfx';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { StarRef } from '../gen/galaxy';
import { arriveImpulse, type ArriveParams } from '../player/autopilot';
import { buildUfoMesh } from '../player/Ship';

/** Galaxy-scale travel, in galaxy units (neighbouring stars are ~25 apart). */
export const galaxyTravelParams: ArriveParams = {
  maxSpeed: 150,
  accel: 200,
  gain: 8,
  damping: 0,
};

/** The ship hovers this far above the star it's at, so it doesn't sit inside the dot. */
const HOVER = 1.2;
const UFO_SCALE = 0.3;
const ARRIVE_DISTANCE = 0.05;
const ARRIVE_SPEED = 0.5;

/**
 * The player's ship on the galaxy map. Movement is scripted (no physics):
 * `travelTo` flies it from its current star to another with the same arrive
 * steering as the system autopilot, and it docks there on arrival. Setting
 * off whooshes, longer for longer trips.
 */
export class GalaxyShip implements Entity {
  /** Interpolated render transform (in the galaxy root); the galaxy camera orbits this. */
  readonly object = new THREE.Group();
  private readonly ring: THREE.Object3D;
  private _current: StarRef;
  private _destination: StarRef | null = null;

  private readonly prev = new THREE.Vector3();
  private readonly curr = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private readonly impulse = new THREE.Vector3();
  private readonly zero = new THREE.Vector3();

  constructor(
    /** The galaxy's rotating root: the ship moves in galaxy coordinates. */
    private readonly parent: THREE.Object3D,
    start: StarRef,
    debug: Debug,
    private readonly sfx: SoundEffects,
  ) {
    const { group, ring } = buildUfoMesh();
    group.scale.setScalar(UFO_SCALE);
    this.object.add(group);
    this.ring = ring;
    parent.add(this.object);
    this._current = start;
    this.dockAt(start);

    const f = debug.folder('Galaxy travel');
    f?.add(galaxyTravelParams, 'maxSpeed', 10, 1000);
    f?.add(galaxyTravelParams, 'accel', 10, 2000);
    f?.add(galaxyTravelParams, 'gain', 1, 20);
  }

  /** The star the ship is at, or last left while travelling. */
  get current(): StarRef {
    return this._current;
  }

  /** Where the ship is travelling to, or null when docked. */
  get destination(): StarRef | null {
    return this._destination;
  }

  get travelling(): boolean {
    return this._destination !== null;
  }

  get speed(): number {
    return this.vel.length();
  }

  /** Sets course for `ref` (also mid-flight). Asking for the star it's docked at does nothing. */
  travelTo(ref: StarRef): void {
    const dest = !this.travelling && ref === this._current ? null : ref;
    if (dest && dest !== this._destination) {
      const { x, y, z } = dest.position;
      const distance = Math.hypot(x - this.curr.x, y + HOVER - this.curr.y, z - this.curr.z);
      this.sfx.play('travel', { seconds: distance / galaxyTravelParams.maxSpeed });
    }
    this._destination = dest;
  }

  fixedUpdate(dt: number): void {
    this.prev.copy(this.curr);
    const dest = this._destination;
    if (!dest) return;

    this.goal.set(dest.position.x, dest.position.y + HOVER, dest.position.z);
    arriveImpulse(this.curr, this.vel, this.goal, this.zero, galaxyTravelParams, dt, this.impulse);
    this.vel.add(this.impulse);
    this.curr.addScaledVector(this.vel, dt);
    if (this.curr.distanceTo(this.goal) < ARRIVE_DISTANCE && this.vel.length() < ARRIVE_SPEED) {
      this._current = dest;
      this._destination = null;
      this.dockAt(dest);
    }
  }

  update(frameDt: number, alpha: number): void {
    this.object.position.lerpVectors(this.prev, this.curr, alpha);
    if (this.vel.lengthSq() > 1) {
      const want = Math.atan2(-this.vel.x, -this.vel.z);
      const diff = Math.atan2(Math.sin(want - this.object.rotation.y), Math.cos(want - this.object.rotation.y));
      this.object.rotation.y += diff * (1 - Math.exp(-5 * frameDt));
    }
    this.ring.rotation.y += frameDt * 2;
  }

  dispose(): void {
    this.parent.remove(this.object);
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  private dockAt(ref: StarRef): void {
    this.curr.set(ref.position.x, ref.position.y + HOVER, ref.position.z);
    this.prev.copy(this.curr);
    this.vel.set(0, 0, 0);
    this.object.position.copy(this.curr);
  }
}
