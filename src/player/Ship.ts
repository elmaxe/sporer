import * as THREE from 'three';
import type { SoundHandle } from '../audio/CuePlayer';
import type { SoundEffects } from '../audio/sfx';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { Debug } from '../core/Debug';
import type { Vec3Like } from '../gen/orbit';
import { RAPIER, type Physics } from '../physics/Physics';
import type { CelestialBody } from '../world/CelestialBody';
import { arriveImpulse, detourWaypoint, hoverPoint, type ArriveParams, type Obstacle } from './autopilot';
import { hoverGap, parkGap, zoomCurveParams } from './zoomCurve';
import { AFTER_ATMOSPHERE_RENDER_ORDER } from '../world/atmosphereShell';

/** Tunables, exposed in the debug panel. */
export const shipParams = {
  /** Shift speeds the autopilot up this much. */
  boostMultiplier: 2.5,
  linearDamping: 1.2,
  /** How quickly the ship turns to face where it's going (1/s). */
  turnRate: 5,
};

/** The hull's idle drift while hovering at a body (visual only: the camera follows the ship, not the drift). */
export const hoverParams = {
  /** Seconds per bob up and down. */
  period: 3.4,
  /** Bob height and sideways drift, units (the ship is 4 wide). */
  bob: 0.35,
  drift: 0.5,
  /** Most the hull rocks, radians. */
  tilt: 0.06,
  /** Seconds to settle into (or out of) the drift on arriving (or setting off). */
  ease: 0.8,
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
 * level and turns to face its velocity. It's always at a body: hovering
 * above it (`hoverPoint`), or on the autopilot to the next one (`moveTo`,
 * which detours around bodies in the way). It moves by impulses, so it still
 * collides and bounces off planets. There's no manual flying. How far above
 * the body it hovers follows the camera's zoom (`viewDistance`, see
 * zoomCurve.ts), and while it hovers the hull drifts gently (`hoverParams`).
 * The travel sound plays from setting off until it arrives.
 */
export class Ship implements Entity {
  /** Interpolated render transform; read this for cameras and UI. */
  readonly object = new THREE.Group();
  /** Where the autopilot is heading (simulation state): the hover point above the target body. */
  readonly destination = new THREE.Vector3();
  /**
   * The camera's distance from the ship, set by the level each frame: the
   * hover height follows it (zoom in to bring the ship down to a body, out to
   * pull it back).
   */
  viewDistance = zoomCurveParams.referenceView;
  private readonly body: RAPIER.RigidBody;
  private readonly hull: THREE.Object3D;
  private readonly ring: THREE.Object3D;

  private _targetBody!: CelestialBody;
  private arrived = true;
  /** The travel loop while the autopilot is flying, else null. */
  private travelSound: SoundHandle | null = null;
  /** Arrive steering for a fly-in (`flyIn`) until it arrives; null for the usual autopilot. */
  private approach: ArriveParams | null = null;
  /** Seconds of hover drift so far, and how much of it shows (0 flying, 1 hovering). */
  private hoverTime = 0;
  private hover = 1;

  private yaw = 0;
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly prevRot = new THREE.Quaternion();
  private readonly currRot = new THREE.Quaternion();

  // Scratch objects, reused every step to avoid per-frame allocation.
  private readonly rot = new THREE.Quaternion();
  private readonly impulse = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly waypoint = new THREE.Vector3();
  private readonly arrive: ArriveParams = { ...autopilotParams };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    /** Shift boosts the autopilot. */
    private readonly input: Input,
    /** Bodies the autopilot steers around. */
    private readonly obstacles: readonly Obstacle[],
    debug: Debug,
    private readonly sfx: SoundEffects,
    /** The body it starts out hovering above, at the reference zoom (see `parkAt` for another height). */
    home: CelestialBody,
  ) {
    const { group, ring } = buildUfoMesh();
    this.object.add(group);
    this.hull = group;
    this.ring = ring;
    scene.add(this.object);

    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .lockRotations()
        .setLinearDamping(shipParams.linearDamping)
        .setCcdEnabled(true),
    );
    physics.world.createCollider(RAPIER.ColliderDesc.ball(2).setMass(1).setRestitution(0.4), this.body);
    this.parkAt(home);

    const f = debug.folder('Ship');
    f?.add(shipParams, 'boostMultiplier', 1, 6);
    f?.add(shipParams, 'linearDamping', 0, 5).onChange((v: number) => {
      this.body.setLinearDamping(v);
      autopilotParams.damping = v;
    });
    f?.add(shipParams, 'turnRate', 0.5, 20);
    const h = debug.folder('Hover');
    h?.add(hoverParams, 'period', 0.5, 10);
    h?.add(hoverParams, 'bob', 0, 2);
    h?.add(hoverParams, 'drift', 0, 2);
    h?.add(hoverParams, 'tilt', 0, 0.3);
    h?.add(hoverParams, 'ease', 0.05, 3);
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

  /** The body the ship is hovering at or flying to. */
  get targetBody(): CelestialBody {
    return this._targetBody;
  }

  /** True while the autopilot is flying to a body (not yet hovering at it). */
  get enRoute(): boolean {
    return !this.arrived;
  }

  /**
   * Autopilot to a body: the ship flies there, round anything in the way, and
   * hovers above it (`hoverGap` at the reference zoom) until it's sent
   * somewhere else. Sending it where it's already going does nothing.
   */
  moveTo(target: CelestialBody): void {
    if (target === this._targetBody) return;
    this._targetBody = target;
    this.arrived = false;
    this.approach = null;
    hoverPoint(target.position, this.parkDistance(target), this.destination);
    // Changing course mid-flight carries on the same sound.
    this.travelSound ??= this.sfx.start('systemTravel');
  }

  /** Fades out the travel sound (arriving, or the level being left mid-flight). */
  silence(): void {
    this.travelSound?.stop();
    this.travelSound = null;
  }

  /** How far above `body`'s centre the ship hovers at the current zoom (see zoomCurve.ts). */
  parkDistance(body: CelestialBody): number {
    return body.radius + parkGap(hoverGap(body.radius), this.viewDistance);
  }

  /**
   * Teleports the ship to hover above `body`, moving with it (starting out,
   * or coming back from the planet level after the system clock jumped). The
   * camera is `view` from the ship, which sets how high it hovers; it
   * follows the zoom from then on.
   */
  parkAt(body: CelestialBody, view = this.viewDistance): void {
    this.viewDistance = view;
    hoverPoint(body.position, this.parkDistance(body), this.pos);
    this.teleport(this.pos, body.velocity);
    this.destination.copy(this.pos);
    this._targetBody = body;
    this.arrived = true;
    this.approach = null;
    this.hover = 1;
    this.silence();
  }

  /**
   * Arriving in the system: the ship appears at `start` flying at `speed`
   * towards `body` and brakes evenly all the way in, to hover above it at
   * camera distance `view` (it follows the zoom from then on).
   */
  flyIn(body: CelestialBody, start: THREE.Vector3, speed: number, view: number): void {
    // Not a trip: the zoom in from the galaxy.
    this.silence();
    this._targetBody = body;
    this.arrived = false;
    this.viewDistance = view;
    hoverPoint(body.position, this.parkDistance(body), this.destination);
    const dist = start.distanceTo(this.destination);
    this.vel.subVectors(this.destination, start).setLength(speed).add(body.velocity);
    this.teleport(start, this.vel);
    this.yaw = Math.atan2(-this.vel.x, -this.vel.z);
    this.body.setRotation(this.rot.setFromAxisAngle(UP, this.yaw), true);
    this.currRot.copy(this.rot);
    this.prevRot.copy(this.rot);
    this.hover = 0;
    // Constant braking from `speed` to rest over `dist`: closing speed √(accel · dist) (see closingSpeed).
    this.approach = { ...autopilotParams, maxSpeed: speed, accel: (speed * speed) / Math.max(dist, 1) };
  }

  /** Draws the UFO at `scale` × its size (visual only; e.g. growing out of the star on arrival). */
  setScale(scale: number): void {
    this.object.scale.setScalar(Math.max(scale, 1e-3));
    this.object.visible = scale > 1e-3;
  }

  fixedUpdate(dt: number): void {
    const t = this.body.translation();
    const v = this.body.linvel();
    this.pos.set(t.x, t.y, t.z);
    this.vel.set(v.x, v.y, v.z);
    const boost = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight') ? shipParams.boostMultiplier : 1;
    this.steer(dt, boost);

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
    this.drift(frameDt);
  }

  dispose(): void {
    this.silence();
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

  /** The hull bobs, drifts and rocks a little about the ship's place while it hovers, easing in and out. */
  private drift(frameDt: number): void {
    const p = hoverParams;
    this.hoverTime += frameDt;
    this.hover += ((this.arrived ? 1 : 0) - this.hover) * (1 - Math.exp(-frameDt / p.ease));
    const w = this.hover;
    const phase = (this.hoverTime / p.period) * Math.PI * 2;
    // Unrelated rates, so the drift doesn't visibly repeat.
    this.hull.position.set(
      w * p.drift * Math.sin(phase * 0.43 + 1.3),
      w * p.bob * Math.sin(phase),
      w * p.drift * Math.sin(phase * 0.31 + 4.1),
    );
    this.hull.rotation.set(w * p.tilt * Math.sin(phase * 0.53 + 0.7), 0, w * p.tilt * Math.sin(phase * 0.61 + 2.2));
  }

  private steer(dt: number, boost: number): void {
    const body = this._targetBody;
    const targetVel = body.velocity;
    hoverPoint(body.position, this.parkDistance(body), this.destination);

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
      // Hovering at the body: keep station there.
      this.arrived = true;
      this.approach = null;
      this.silence();
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
