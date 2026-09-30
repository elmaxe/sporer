import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { Debug } from '../core/Debug';
import type { Vec3Like } from '../gen/orbit';
import { RAPIER, type Physics } from '../physics/Physics';
import type { CelestialBody } from '../world/CelestialBody';
import { arriveImpulse, detourWaypoint, standoffPoint, type ArriveParams, type Obstacle } from './autopilot';
import { parkGap, referenceGap, zoomCurveParams } from './zoomCurve';
import { AFTER_ATMOSPHERE_RENDER_ORDER } from '../world/atmosphereShell';

/** Tunables, exposed in the debug panel. */
export const shipParams = {
  /** Manual (WASD) impulse per second; the ship has mass 1. */
  thrust: 60,
  boostMultiplier: 2.5,
  /** Manual top speed ≈ thrust / linearDamping. */
  linearDamping: 1.2,
  /** How quickly the ship turns to face where it's going (1/s). */
  turnRate: 5,
};

export const autopilotParams: ArriveParams = {
  maxSpeed: 150,
  accel: 250,
  gain: 8,
  damping: shipParams.linearDamping,
};

/** The autopilot counts as arrived within this distance and relative speed. */
const ARRIVE_DISTANCE = 1.5;
const ARRIVE_SPEED = 2;
/** Gap the autopilot keeps from bodies it flies around (the ship's radius is 2). */
const CLEARANCE = 8;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * The player's UFO. A dynamic Rapier body with locked rotations that stays
 * level and turns to face its velocity. It moves by impulses, from the
 * autopilot (`moveTo`, which detours around bodies in the way) or from WASD
 * relative to the camera, so it still collides and bounces off planets.
 * Parked at (or flying to) a body, how far from it the ship parks follows
 * the camera's zoom (`viewDistance`, see zoomCurve.ts).
 */
export class Ship implements Entity {
  /** Interpolated render transform; read this for cameras and UI. */
  readonly object = new THREE.Group();
  /** Where the autopilot is heading (simulation state); only meaningful while `autopilotActive`. */
  readonly destination = new THREE.Vector3();
  /**
   * The camera's distance from the ship, set by the level each frame: the
   * parking gap follows it (zoom in to bring the ship down to a body, out to
   * pull it back).
   */
  viewDistance = zoomCurveParams.referenceView;
  private readonly body: RAPIER.RigidBody;
  private readonly ring: THREE.Object3D;

  private hasTarget = false;
  private _targetBody: CelestialBody | null = null;
  private arrived = false;
  /** The parking's gap from the body's surface at the reference view (see zoomCurve.ts). */
  private gapAtReference = 0;
  /** Arrive steering for a fly-in (`flyIn`) until it parks; null for the usual autopilot. */
  private approach: ArriveParams | null = null;

  private yaw = 0;
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly prevRot = new THREE.Quaternion();
  private readonly currRot = new THREE.Quaternion();

  // Scratch objects, reused every step to avoid per-frame allocation.
  private readonly rot = new THREE.Quaternion();
  private readonly move = new THREE.Vector3();
  private readonly impulse = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly zero = new THREE.Vector3();
  private readonly waypoint = new THREE.Vector3();
  private readonly arrive: ArriveParams = { ...autopilotParams };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    private readonly input: Input,
    /** WASD moves relative to where this camera looks. */
    private readonly camera: THREE.Camera,
    /** Bodies the autopilot steers around. */
    private readonly obstacles: readonly Obstacle[],
    debug: Debug,
    spawn: THREE.Vector3,
  ) {
    const { group, ring } = buildUfoMesh();
    this.object.add(group);
    this.ring = ring;
    this.object.position.copy(spawn);
    scene.add(this.object);

    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .lockRotations()
        .setLinearDamping(shipParams.linearDamping)
        .setCcdEnabled(true),
    );
    physics.world.createCollider(RAPIER.ColliderDesc.ball(2).setMass(1).setRestitution(0.4), this.body);

    this.currPos.copy(spawn);
    this.prevPos.copy(spawn);

    const f = debug.folder('Ship');
    f?.add(shipParams, 'thrust', 0, 300);
    f?.add(shipParams, 'boostMultiplier', 1, 6);
    f?.add(shipParams, 'linearDamping', 0, 5).onChange((v: number) => {
      this.body.setLinearDamping(v);
      autopilotParams.damping = v;
    });
    f?.add(shipParams, 'turnRate', 0.5, 20);
    const a = debug.folder('Autopilot');
    a?.add(autopilotParams, 'maxSpeed', 10, 600);
    a?.add(autopilotParams, 'accel', 10, 1000);
    a?.add(autopilotParams, 'gain', 1, 20);
  }

  /** Current speed in units per second. */
  get speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  /** The body the autopilot is flying to or parked at, if any. */
  get targetBody(): CelestialBody | null {
    return this._targetBody;
  }

  /** True while the autopilot has a target, including while parked at a body. */
  get autopilotActive(): boolean {
    return this.hasTarget;
  }

  /** True while the autopilot is flying somewhere (not idle, not parked). */
  get enRoute(): boolean {
    return this.hasTarget && !this.arrived;
  }

  /**
   * Autopilot to a point, or to a body: the ship parks at the body's standoff
   * distance on the side it approaches from and keeps station there until it
   * gets another order.
   */
  moveTo(target: CelestialBody | Vec3Like): void {
    this.hasTarget = true;
    this.arrived = false;
    this.approach = null;
    if ('standoff' in target) {
      this._targetBody = target;
      this.gapAtReference = target.standoff - target.radius;
      standoffPoint(this.currPos, target.position, this.parkDistance(target), this.destination);
    } else {
      this._targetBody = null;
      this.destination.set(target.x, target.y, target.z);
    }
  }

  /** How far from `body`'s centre the ship parks at the current zoom. */
  parkDistance(body: CelestialBody): number {
    return body.radius + parkGap(this.gapAtReference, this.viewDistance);
  }

  /**
   * Teleports the ship to `body`'s standoff distance (at the current zoom) in
   * direction `side` from it, moving with the body and parked there (e.g.
   * coming back from the planet level, after the system clock jumped).
   */
  parkAt(body: CelestialBody, side: THREE.Vector3): void {
    this.gapAtReference = body.standoff - body.radius;
    this.pos.copy(side).normalize().multiplyScalar(this.parkDistance(body)).add(body.position);
    this.teleport(this.pos, body.velocity);
    this.destination.copy(this.pos);
    this._targetBody = body;
    this.hasTarget = true;
    this.arrived = true;
    this.approach = null;
  }

  /**
   * Arriving in the system: the ship appears at `start` flying at `speed`
   * towards `body` and brakes evenly all the way in, to park `gap` from its
   * surface at camera distance `view` (it follows the zoom from then on).
   */
  flyIn(body: CelestialBody, start: THREE.Vector3, speed: number, gap: number, view: number): void {
    this._targetBody = body;
    this.hasTarget = true;
    this.arrived = false;
    this.gapAtReference = referenceGap(gap, view);
    this.viewDistance = view;
    standoffPoint(start, body.position, this.parkDistance(body), this.destination);
    const dist = start.distanceTo(this.destination);
    this.vel.subVectors(this.destination, start).setLength(speed).add(body.velocity);
    this.teleport(start, this.vel);
    this.yaw = Math.atan2(-this.vel.x, -this.vel.z);
    this.body.setRotation(this.rot.setFromAxisAngle(UP, this.yaw), true);
    this.currRot.copy(this.rot);
    this.prevRot.copy(this.rot);
    // Constant braking from `speed` to rest over `dist`: closing speed √(accel · dist) (see closingSpeed).
    this.approach = { ...autopilotParams, maxSpeed: speed, accel: (speed * speed) / Math.max(dist, 1) };
  }

  /** Draws the UFO at `scale` × its size (visual only; e.g. growing out of the star on arrival). */
  setScale(scale: number): void {
    this.object.scale.setScalar(Math.max(scale, 1e-3));
    this.object.visible = scale > 1e-3;
  }

  stop(): void {
    this.hasTarget = false;
    this._targetBody = null;
    this.arrived = false;
    this.approach = null;
  }

  fixedUpdate(dt: number): void {
    const { input } = this;
    const t = this.body.translation();
    const v = this.body.linvel();
    this.pos.set(t.x, t.y, t.z);
    this.vel.set(v.x, v.y, v.z);
    const boost = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? shipParams.boostMultiplier : 1;

    // WASD: forward is the camera's view direction flattened onto the horizontal plane.
    this.move.set(input.axis('KeyA', 'KeyD'), input.axis('KeyQ', 'KeyE'), input.axis('KeyS', 'KeyW'));
    if (this.move.lengthSq() > 0) {
      this.stop();
      this.camera.getWorldDirection(this.forward).setY(0);
      if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
      this.forward.normalize();
      this.right.crossVectors(this.forward, UP);
      // Diagonal keys aren't faster; a half-pushed touch stick is slower.
      if (this.move.lengthSq() > 1) this.move.normalize();
      this.impulse
        .copy(this.right)
        .multiplyScalar(this.move.x)
        .addScaledVector(this.forward, this.move.z)
        .addScaledVector(UP, this.move.y)
        .multiplyScalar(shipParams.thrust * boost * dt);
      this.body.applyImpulse(this.impulse, true);
    } else if (this.hasTarget) {
      this.steer(dt, boost);
    }

    // Stay level and turn to face the horizontal velocity.
    if (this.vel.x * this.vel.x + this.vel.z * this.vel.z > 1) {
      const want = Math.atan2(-this.vel.x, -this.vel.z);
      const diff = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
      this.yaw += diff * (1 - Math.exp(-shipParams.turnRate * dt));
    }
    this.body.setRotation(this.rot.setFromAxisAngle(UP, this.yaw), true);
  }

  afterPhysics(): void {
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currRot.set(r.x, r.y, r.z, r.w);
  }

  update(frameDt: number, alpha: number): void {
    this.object.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.object.quaternion.slerpQuaternions(this.prevRot, this.currRot, alpha);
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
    this.physics.world.removeRigidBody(this.body);
  }

  private teleport(position: Vec3Like, velocity: Vec3Like): void {
    this.body.setTranslation(position, true);
    this.body.setLinvel(velocity, true);
    this.currPos.set(position.x, position.y, position.z);
    this.prevPos.copy(this.currPos);
    this.object.position.copy(this.currPos);
  }

  private steer(dt: number, boost: number): void {
    const body = this._targetBody;
    const targetVel = body ? body.velocity : this.zero;
    if (body) standoffPoint(this.pos, body.position, this.parkDistance(body), this.destination);

    Object.assign(this.arrive, this.approach ?? autopilotParams).maxSpeed *= this.approach ? 1 : boost;
    if (detourWaypoint(this.pos, this.destination, this.obstacles, CLEARANCE, this.waypoint)) {
      const remaining = this.pos.distanceTo(this.waypoint) + this.waypoint.distanceTo(this.destination);
      arriveImpulse(this.pos, this.vel, this.waypoint, targetVel, this.arrive, dt, this.impulse, remaining);
    } else {
      arriveImpulse(this.pos, this.vel, this.destination, targetVel, this.arrive, dt, this.impulse);
    }
    this.body.applyImpulse(this.impulse, true);

    if (
      !this.arrived &&
      this.pos.distanceTo(this.destination) < ARRIVE_DISTANCE &&
      this.vel.distanceTo(targetVel) < ARRIVE_SPEED
    ) {
      // Parked next to a body: keep station. At a point: done.
      if (body) this.arrived = true;
      else this.stop();
      this.approach = null;
    }
  }
}

/** Classic flying saucer: a hull disc, a glass dome and a spinning light ring. */
export function buildUfoMesh(): { group: THREE.Group; ring: THREE.Group } {
  const group = new THREE.Group();

  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(2, 32, 16),
    // Low metalness: there is no environment map, so metal would render black.
    new THREE.MeshStandardMaterial({ color: '#b9c3cf', emissive: '#1c2533', metalness: 0.35, roughness: 0.45 }),
  );
  hull.scale.set(1, 0.28, 1);
  group.add(hull);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: '#7fd8ff',
      emissive: '#1a6f99',
      transparent: true,
      opacity: 0.85,
      roughness: 0.1,
    }),
  );
  dome.position.y = 0.35;
  group.add(dome);

  const ring = new THREE.Group();
  const lightGeometry = new THREE.SphereGeometry(0.16, 8, 6);
  const lightCount = 10;
  for (let i = 0; i < lightCount; i++) {
    const a = (i / lightCount) * Math.PI * 2;
    // Each light owns its material so dispose() can treat every mesh alike.
    const light = new THREE.Mesh(
      i === 0 ? lightGeometry : lightGeometry.clone(),
      new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffe066' : '#66ffcc' }),
    );
    light.position.set(Math.cos(a) * 1.95, 0, Math.sin(a) * 1.95);
    ring.add(light);
  }
  group.add(ring);
  // A group's renderOrder sorts everything under it (up to a nested group, hence the ring too).
  group.renderOrder = ring.renderOrder = AFTER_ATMOSPHERE_RENDER_ORDER;

  return { group, ring };
}
