import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { ArriveParams } from '../player/autopilot';
import { buildUfoMesh } from '../player/Ship';
import { aheadDirection, climbStep, flightRadius, groundAhead, groundParams, type GroundHeight, type Obstacles } from './ground';
import { sphereStep, surfaceArriveImpulse } from './surfaceMotion';

/** Tunables, exposed in the debug panel. Planet-level units (an Earth-sized globe's radius is 100). */
export const planetShipParams = {
  /** Manual (WASD) velocity change per second. */
  thrust: 60,
  boostMultiplier: 2.5,
  /** Manual top speed ≈ thrust / damping. */
  damping: 1.2,
  /** How quickly the ship turns to face where it's going (1/s). */
  turnRate: 5,
};

/** The autopilot over an Earth-sized globe; its speed and acceleration scale with `travelScale`. */
export const planetAutopilotParams: ArriveParams = {
  maxSpeed: 60,
  accel: 120,
  gain: 8,
  damping: planetShipParams.damping,
};

/** What the ship can follow: the ground's radius in any direction, and the highest it gets; and what stands on it, to fly over. */
export interface Terrain {
  readonly height: GroundHeight;
  readonly top: number;
  readonly obstacles?: Obstacles;
}

/** The autopilot counts as arrived within this arc length and speed. */
const ARRIVE_DISTANCE = 0.5;
const ARRIVE_SPEED = 1;

/**
 * The UFO in low orbit. Scripted, no physics: its state is a unit direction
 * from the planet's centre plus a velocity tangent to the sphere, at a flying
 * radius that the zoom sets (`setRadius`; it climbs and sinks smoothly): above
 * the highest terrain zoomed out, and, zoomed in, a fixed clearance over the
 * ground beneath it (`follow`), looking ahead along its velocity so it rises
 * before a slope. The autopilot (`moveTo`) flies the great circle to a
 * point with the same arrive steering as in the system (as fast in angle at
 * every altitude);
 * WASD pushes it in the tangent plane relative to the camera. It stays level
 * with the ground (up = the radial direction) and turns to face its course.
 * Whatever stands on the ground (`Terrain.obstacles`: trees, bushes) it flies
 * over, at any zoom: the hull clears everything under it and along the same
 * stretch ahead, so it rises before a tree and sinks back past it.
 */
export class PlanetShip implements Entity {
  /** Interpolated render transform; read this for cameras and UI. */
  readonly object = new THREE.Group();
  /** Interpolated radial direction: the ship's (and the camera's) up. */
  readonly up = new THREE.Vector3();
  /** Where the autopilot is heading, on the flying sphere; only meaningful while `enRoute`. */
  readonly destination = new THREE.Vector3();
  private readonly hull: THREE.Object3D;
  private readonly ring: THREE.Object3D;
  private hasTarget = false;
  /** While set (e.g. firing a planet buster), WASD and the autopilot do nothing: it holds its place. */
  locked = false;
  /** Distance from the planet's centre it flies at, and the one it's climbing or sinking to. */
  private _radius: number;
  /** What the zoom asks for: the altitude above the highest terrain (it sets the autopilot's pace too). */
  private zoomRadius: number;
  /** How much of the way down to the ground it follows (see ground.ts followWeight). */
  private follow = 0;
  /** The radius it's climbing or sinking to: the zoom's, lowered towards the ground ahead. */
  private _goal: number;

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
  private readonly ahead = new THREE.Vector3();
  private readonly arrive: ArriveParams = { ...planetAutopilotParams };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly input: Input,
    /** WASD moves relative to where this camera looks. */
    private readonly camera: THREE.Camera,
    debug: Debug,
    /** Distance from the planet's centre it flies at, to begin with (the autopilot's speeds are for this one). */
    private readonly baseRadius: number,
    /** Starting direction from the centre. */
    start: THREE.Vector3,
    /** Autopilot speed factor for this globe's size (see planet/frame.ts travelScale). */
    private readonly travelScale = 1,
    /** The ground to stay above, if it should follow it (else it flies at the radius the zoom sets). */
    private readonly terrain: Terrain | null = null,
  ) {
    const { group, ring } = buildUfoMesh();
    this.object.add(group);
    this.hull = group;
    this.ring = ring;
    this._radius = this._goal = this.zoomRadius = baseRadius;
    scene.add(this.object);
    this.placeAt(start);

    const f = debug.folder('Planet ship');
    f?.add(planetShipParams, 'thrust', 0, 300);
    f?.add(planetShipParams, 'boostMultiplier', 1, 6);
    f?.add(planetShipParams, 'damping', 0, 5).onChange((v: number) => (planetAutopilotParams.damping = v));
    f?.add(planetShipParams, 'turnRate', 0.5, 20);
    const a = debug.folder('Planet autopilot');
    a?.add(planetAutopilotParams, 'maxSpeed', 10, 300);
    a?.add(planetAutopilotParams, 'accel', 10, 600);
    a?.add(planetAutopilotParams, 'gain', 1, 20);
    const g = debug.folder('Ground following');
    g?.add(groundParams, 'followFrom', 0, 1);
    g?.add(groundParams, 'followTo', 0, 1);
    g?.add(groundParams, 'lookAhead', 0, 3);
    g?.add(groundParams, 'footprint', 0, 20);
    g?.add(groundParams, 'samples', 0, 12, 1);
    g?.add(groundParams, 'climbTime', 0.05, 2);
    g?.add(groundParams, 'sinkTime', 0.05, 3);
    g?.add(groundParams, 'minClearance', 0, 5);
    g?.add(groundParams, 'collide').name('fly over plants');
    g?.add(groundParams, 'obstacleMargin', 0, 3);
  }

  /** Current speed in units per second. */
  get speed(): number {
    return this.vel.length();
  }

  /** True while the autopilot is flying somewhere. */
  get enRoute(): boolean {
    return this.hasTarget;
  }

  /** Distance from the planet's centre it flies at now (simulation). */
  get radius(): number {
    return this._radius;
  }

  /** The radius it is climbing or sinking to (the zoom's, adjusted for the ground ahead). */
  get goalRadius(): number {
    return this._goal;
  }

  /** Height above the ground right beneath it (the sea's surface over water); null if it has no terrain to follow. */
  get clearance(): number | null {
    return this.terrain ? this._radius - this.terrain.height(this.u) : null;
  }

  /**
   * Asks to fly `radius` from the planet's centre (above the highest terrain, as
   * the zoom sets it), following the ground by `follow` (0 to 1) of the way down,
   * and climbs or sinks there smoothly.
   */
  setRadius(radius: number, follow = 0): void {
    this.zoomRadius = radius;
    this.follow = this.terrain ? follow : 0;
  }

  /** The (simulation) direction from the planet's centre. */
  get direction(): THREE.Vector3 {
    return this.u;
  }

  /** Puts the ship above `start` (a direction from the centre), at rest and with no autopilot target. */
  placeAt(start: THREE.Vector3): void {
    this.u.copy(start).normalize();
    this.vel.set(0, 0, 0);
    this.hasTarget = false;
    // Face any direction along the ground to begin with.
    this.heading.set(0, 1, 0).cross(this.u);
    if (this.heading.lengthSq() < 1e-6) this.heading.set(1, 0, 0);
    this.heading.normalize();
    this.orient(this.currRot);
    this._radius = this._goal = this.goal();
    this.currPos.copy(this.u).multiplyScalar(this._radius);
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    this.update(0, 0);
  }

  /** Draws the UFO at `scale` × its size (visual only; e.g. growing out of nothing on arrival). */
  setScale(scale: number): void {
    this.hull.scale.setScalar(Math.max(scale, 1e-3));
    this.hull.visible = scale > 1e-3;
  }

  /** Autopilot to the point of the flying sphere above `point` (any point off the centre). */
  moveTo(point: THREE.Vector3): void {
    this.target.copy(point).normalize();
    this.destination.copy(this.target).multiplyScalar(this._radius);
    this.hasTarget = true;
  }

  stop(): void {
    this.hasTarget = false;
  }

  fixedUpdate(dt: number): void {
    const { input, u, vel } = this;
    const boost = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? planetShipParams.boostMultiplier : 1;

    this.move.set(input.axis('KeyA', 'KeyD'), 0, input.axis('KeyS', 'KeyW'));
    if (this.locked) {
      this.move.set(0, 0, 0);
      this.hasTarget = false;
    }
    if (this.move.lengthSq() > 0) {
      this.stop();
      // Forward is the camera's view direction flattened onto the ground (or its up, looking straight down).
      this.camera.getWorldDirection(this.forward).addScaledVector(u, -this.forward.dot(u));
      if (this.forward.lengthSq() < 1e-4) this.forward.copy(this.camera.up).addScaledVector(u, -this.camera.up.dot(u));
      this.forward.normalize();
      this.right.crossVectors(this.forward, u);
      // Diagonal keys aren't faster; a half-pushed touch stick is slower.
      if (this.move.lengthSq() > 1) this.move.normalize();
      this.impulse
        .copy(this.right)
        .multiplyScalar(this.move.x)
        .addScaledVector(this.forward, this.move.z)
        .multiplyScalar(planetShipParams.thrust * boost * dt);
      vel.add(this.impulse);
    } else if (this.hasTarget) {
      // Higher up, faster, so it crosses the ground below at the same pace.
      const scale = (this.travelScale * this.zoomRadius) / this.baseRadius;
      Object.assign(this.arrive, planetAutopilotParams).maxSpeed *= boost * scale;
      this.arrive.accel *= scale;
      const arc = surfaceArriveImpulse(u, vel, this.target, this._radius, this.arrive, dt, this.impulse);
      vel.add(this.impulse);
      if (arc < ARRIVE_DISTANCE && vel.length() < ARRIVE_SPEED) this.stop();
    }
    // Damping like the system ship's Rapier body (the autopilot compensates for it).
    vel.divideScalar(1 + planetShipParams.damping * dt);

    const { terrain } = this;
    this._goal = this.goal();
    // Never closer to the ground right beneath it than the hull allows, whatever the smoothing says.
    const floor = terrain ? terrain.height(u) + groundParams.minClearance : 0;
    this._radius = climbStep(this._radius, this._goal, floor, dt);
    this.destination.copy(this.target).multiplyScalar(this._radius);

    // Slide over the sphere, carrying the velocity and heading along.
    sphereStep(u, vel, this._radius, dt, this.step);
    u.applyQuaternion(this.step).normalize();
    vel.applyQuaternion(this.step).addScaledVector(u, -vel.dot(u));
    this.heading.applyQuaternion(this.step).addScaledVector(u, -this.heading.dot(u)).normalize();
    // Nor into what stands where it is now, if the climb ahead of it fell short (it set off too close to see it coming).
    if (terrain?.obstacles && groundParams.collide) this._radius = terrain.obstacles.clearAlong(u, u, this._radius);

    // Turn to face the direction of travel, about the local up.
    if (vel.lengthSq() > 1) {
      this.want.copy(vel).normalize();
      const angle = Math.atan2(this.right.crossVectors(this.heading, this.want).dot(u), this.heading.dot(this.want));
      this.heading.applyAxisAngle(u, angle * (1 - Math.exp(-planetShipParams.turnRate * dt)));
    }

    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    this.currPos.copy(u).multiplyScalar(this._radius);
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

  /**
   * The radius to fly at from here: the zoom's, lowered towards the highest
   * ground beneath and ahead of the ship, and raised over whatever stands on
   * the ground there.
   */
  private goal(): number {
    const { terrain } = this;
    if (!terrain) return this.zoomRadius;
    let goal = this.zoomRadius;
    if (this.follow > 0) {
      const ground = groundAhead(terrain.height, this.u, this.vel, this.heading, this._radius);
      // Not below the ground right under the hull.
      goal = Math.max(flightRadius(this.zoomRadius, terrain.top, ground, this.follow), terrain.height(this.u) + groundParams.minClearance);
    }
    if (!terrain.obstacles || !groundParams.collide) return goal;
    return terrain.obstacles.clearAlong(this.u, aheadDirection(this.u, this.vel, this.heading, this._radius, 1, this.ahead), goal);
  }

  /** Level with the ground (+Y = radial) and facing the heading (the UFO's front is -Z). */
  private orient(out: THREE.Quaternion): void {
    this.right.crossVectors(this.heading, this.u);
    this.forward.copy(this.heading).negate();
    out.setFromRotationMatrix(this.basis.makeBasis(this.right, this.u, this.forward));
  }
}
