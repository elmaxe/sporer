import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { ArriveParams } from '../player/autopilot';
import { buildUfoMesh } from '../player/Ship';
import { sphereStep, surfaceArriveImpulse } from './surfaceMotion';

/** Tunables, exposed in the debug panel. Planet-level units (the globe's radius is 100). */
export const planetShipParams = {
  /** Manual (WASD) velocity change per second. */
  thrust: 60,
  boostMultiplier: 2.5,
  /** Manual top speed ≈ thrust / damping. */
  damping: 1.2,
  /** How quickly the ship turns to face where it's going (1/s). */
  turnRate: 5,
};

export const planetAutopilotParams: ArriveParams = {
  maxSpeed: 60,
  accel: 120,
  gain: 8,
  damping: planetShipParams.damping,
};

/** The autopilot counts as arrived within this arc length and speed. */
const ARRIVE_DISTANCE = 0.5;
const ARRIVE_SPEED = 1;

/**
 * The UFO in low orbit. Scripted, no physics: its state is a unit direction
 * from the planet's centre plus a velocity tangent to the sphere, at a fixed
 * flying radius above the highest terrain. The autopilot (`moveTo`) flies the
 * great circle to a point with the same arrive steering as in the system;
 * WASD pushes it in the tangent plane relative to the camera. It stays level
 * with the ground (up = the radial direction) and turns to face its course.
 */
export class PlanetShip implements Entity {
  /** Interpolated render transform; read this for cameras and UI. */
  readonly object = new THREE.Group();
  /** Interpolated radial direction: the ship's (and the camera's) up. */
  readonly up = new THREE.Vector3();
  /** Where the autopilot is heading, on the flying sphere; only meaningful while `enRoute`. */
  readonly destination = new THREE.Vector3();
  private readonly ring: THREE.Object3D;
  private hasTarget = false;

  // Simulation state: direction from the centre, tangent velocity, facing (tangent).
  private readonly u = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly heading = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly prevRot = new THREE.Quaternion();
  private readonly currRot = new THREE.Quaternion();

  // Scratch objects, reused every step to avoid per-frame allocation.
  private readonly step = new THREE.Quaternion();
  private readonly move = new THREE.Vector3();
  private readonly impulse = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly want = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private readonly arrive: ArriveParams = { ...planetAutopilotParams };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly input: Input,
    /** WASD moves relative to where this camera looks. */
    private readonly camera: THREE.Camera,
    debug: Debug,
    /** Distance from the planet's centre it flies at. */
    readonly radius: number,
    /** Starting direction from the centre. */
    start: THREE.Vector3,
  ) {
    const { group, ring } = buildUfoMesh();
    this.object.add(group);
    this.ring = ring;
    scene.add(this.object);

    this.u.copy(start).normalize();
    // Face any direction along the ground to begin with.
    this.heading.set(0, 1, 0).cross(this.u);
    if (this.heading.lengthSq() < 1e-6) this.heading.set(1, 0, 0);
    this.heading.normalize();
    this.orient(this.currRot);
    this.currPos.copy(this.u).multiplyScalar(radius);
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    this.update(0, 0);

    const f = debug.folder('Planet ship');
    f?.add(planetShipParams, 'thrust', 0, 300);
    f?.add(planetShipParams, 'boostMultiplier', 1, 6);
    f?.add(planetShipParams, 'damping', 0, 5).onChange((v: number) => (planetAutopilotParams.damping = v));
    f?.add(planetShipParams, 'turnRate', 0.5, 20);
    const a = debug.folder('Planet autopilot');
    a?.add(planetAutopilotParams, 'maxSpeed', 10, 300);
    a?.add(planetAutopilotParams, 'accel', 10, 600);
    a?.add(planetAutopilotParams, 'gain', 1, 20);
  }

  /** Current speed in units per second. */
  get speed(): number {
    return this.vel.length();
  }

  /** True while the autopilot is flying somewhere. */
  get enRoute(): boolean {
    return this.hasTarget;
  }

  /** The (simulation) direction from the planet's centre. */
  get direction(): THREE.Vector3 {
    return this.u;
  }

  /** Autopilot to the point of the flying sphere above `point` (any point off the centre). */
  moveTo(point: THREE.Vector3): void {
    this.target.copy(point).normalize();
    this.destination.copy(this.target).multiplyScalar(this.radius);
    this.hasTarget = true;
  }

  stop(): void {
    this.hasTarget = false;
  }

  fixedUpdate(dt: number): void {
    const { input, u, vel } = this;
    const boost = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? planetShipParams.boostMultiplier : 1;

    this.move.set(input.axis('KeyA', 'KeyD'), 0, input.axis('KeyS', 'KeyW'));
    if (this.move.lengthSq() > 0) {
      this.stop();
      // Forward is the camera's view direction flattened onto the ground (or its up, looking straight down).
      this.camera.getWorldDirection(this.forward).addScaledVector(u, -this.forward.dot(u));
      if (this.forward.lengthSq() < 1e-4) this.forward.copy(this.camera.up).addScaledVector(u, -this.camera.up.dot(u));
      this.forward.normalize();
      this.right.crossVectors(this.forward, u);
      this.move.normalize();
      this.impulse
        .copy(this.right)
        .multiplyScalar(this.move.x)
        .addScaledVector(this.forward, this.move.z)
        .multiplyScalar(planetShipParams.thrust * boost * dt);
      vel.add(this.impulse);
    } else if (this.hasTarget) {
      Object.assign(this.arrive, planetAutopilotParams).maxSpeed *= boost;
      const arc = surfaceArriveImpulse(u, vel, this.target, this.radius, this.arrive, dt, this.impulse);
      vel.add(this.impulse);
      if (arc < ARRIVE_DISTANCE && vel.length() < ARRIVE_SPEED) this.stop();
    }
    // Damping like the system ship's Rapier body (the autopilot compensates for it).
    vel.divideScalar(1 + planetShipParams.damping * dt);

    // Slide over the sphere, carrying the velocity and heading along.
    sphereStep(u, vel, this.radius, dt, this.step);
    u.applyQuaternion(this.step).normalize();
    vel.applyQuaternion(this.step).addScaledVector(u, -vel.dot(u));
    this.heading.applyQuaternion(this.step).addScaledVector(u, -this.heading.dot(u)).normalize();

    // Turn to face the direction of travel, about the local up.
    if (vel.lengthSq() > 1) {
      this.want.copy(vel).normalize();
      const angle = Math.atan2(this.right.crossVectors(this.heading, this.want).dot(u), this.heading.dot(this.want));
      this.heading.applyAxisAngle(u, angle * (1 - Math.exp(-planetShipParams.turnRate * dt)));
    }

    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    this.currPos.copy(u).multiplyScalar(this.radius);
    this.orient(this.currRot);
  }

  update(frameDt: number, alpha: number): void {
    this.object.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.object.quaternion.slerpQuaternions(this.prevRot, this.currRot, alpha);
    this.up.copy(this.object.position).normalize();
    this.ring.rotation.y += frameDt * 2;
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  /** Level with the ground (+Y = radial) and facing the heading (the UFO's front is -Z). */
  private orient(out: THREE.Quaternion): void {
    this.right.crossVectors(this.heading, this.u);
    this.forward.copy(this.heading).negate();
    out.setFromRotationMatrix(this.basis.makeBasis(this.right, this.u, this.forward));
  }
}
